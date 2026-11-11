"""
Бот «Город подписчиков».
  Пользователь: привязать ник TikTok (код в «Почте города») → выбрать дом в мини-приложении:
                5 вариантов бесплатно или конструктор за звёзды.
  Админ (/admin): одна панель — заявки, продажи, статистика.
Настройки — в файле .env (см. .env.example).
"""
import asyncio, datetime as dt, json, logging, os, random, re, time
from pathlib import Path

import httpx
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (BufferedInputFile, CallbackQuery, InlineKeyboardButton as IB, InlineKeyboardMarkup,
                           InputMediaPhoto, KeyboardButton, LabeledPrice, MenuButtonWebApp, Message,
                           PreCheckoutQuery, ReplyKeyboardMarkup, WebAppInfo, BotCommand)

import cards

# ---------- настройки ----------
def load_env(path: Path):
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env(Path(__file__).parent / ".env")
E = os.environ.get
BOT_TOKEN = E("BOT_TOKEN", "")
ADMIN_IDS = {int(x) for x in re.findall(r"\d+", E("ADMIN_IDS", ""))}
SB_URL = E("SUPABASE_URL", "").rstrip("/")
SB_KEY = E("SUPABASE_SERVICE_KEY", "")
SITE_URL = E("SITE_URL", "").rstrip("/") + "/"
SUBS_URL = E("SUBS_URL", "") or SITE_URL + "subscribers.json"
ELECTION_URL = E("ELECTION_URL", "") or SITE_URL + "election.json"
POCHTA_URL = E("POCHTA_URL", "")
CHANNEL_URL = E("CHANNEL_URL", "")
TIKTOK_URL = E("TIKTOK_URL", "https://www.tiktok.com/@eben51041")
PRICE = int(E("CUSTOM_PRICE", "10"))
KLAD_SALT = E("KLAD_SALT", "gorod-klad-v1")
KLAD_LIMIT = int(E("KLAD_LIMIT", "20"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("gorod")

# ---------- дома: те же наборы, что на сайте (houses.js / index.html) ----------
SHAPES = ["house", "tower", "castle", "skyscraper", "dome", "clocktower"]
EMBLEMS = ["none", "sun", "moon", "star", "heart", "clock", "crown", "flame", "leaf", "lightning", "diamond", "snake"]
LIGHTS = ["warm", "cool", "pink", "green"]
WALL_C = ["#ffcf4a", "#f28b82", "#a7d36f", "#7cc8ff", "#c9a0e8", "#f7a8d0", "#86d4c8", "#9aa3b5"]
ROOF_C = ["#d1404f", "#3d5a99", "#6b3fa0", "#2f7a6b", "#b8562f", "#374070"]
PRESETS = [
    ("Уютный домик", {"shape": "house", "floors": 2, "wall": "#ffcf4a", "roof": "#d1404f", "emblem": "none", "lights": "warm"}),
    ("Морской", {"shape": "house", "floors": 1, "wall": "#7cc8ff", "roof": "#374070", "emblem": "star", "lights": "cool"}),
    ("Башенка", {"shape": "tower", "floors": 3, "wall": "#86d4c8", "roof": "#2f7a6b", "emblem": "leaf", "lights": "green"}),
    ("Купол", {"shape": "dome", "floors": 2, "wall": "#f7a8d0", "roof": "#6b3fa0", "emblem": "heart", "lights": "pink"}),
    ("Высотка", {"shape": "skyscraper", "floors": 3, "wall": "#c9a0e8", "roof": "#3d5a99", "emblem": "none", "lights": "cool"}),
]
NICK_RE = re.compile(r"^[a-z0-9_.]{2,24}$")


def norm_nick(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"^https?://(www\.)?tiktok\.com/", "", s)
    return s.lstrip("@").split("?")[0].strip("/")


def encode_recipe(r: dict) -> str | None:
    """Рецепт из конструктора → короткая строка индексов (влезает в payload счёта)."""
    try:
        return ",".join(str(x) for x in (SHAPES.index(r["shape"]), int(r["floors"]), WALL_C.index(r["wall"]),
                                         ROOF_C.index(r["roof"]), EMBLEMS.index(r["emblem"]), LIGHTS.index(r["lights"])))
    except (KeyError, ValueError, TypeError):
        return None


def decode_recipe(code: str) -> dict | None:
    try:
        s, f, w, r, e, l = (int(x) for x in code.split(","))
        if not 1 <= f <= 6:
            return None
        return {"shape": SHAPES[s], "floors": f, "wall": WALL_C[w], "roof": ROOF_C[r], "emblem": EMBLEMS[e], "lights": LIGHTS[l]}
    except (ValueError, IndexError):
        return None


# ---------- клад дня (та же формула, что на сайте) ----------
def fnv(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def msk_day() -> str:
    return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=3)).strftime("%Y-%m-%d")


def klad_code(day: str) -> str:
    return str(1000 + fnv(f"{KLAD_SALT}:code:{day}") % 9000)


KLAD_RE = re.compile(r"(?i)^\s*(?:клад|klad)[\s\-]*(\d{4})\s*$")


# ---------- данные ----------
class DB:
    def __init__(self):
        self.h = {"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}", "Content-Type": "application/json"}
        self.c = httpx.AsyncClient(timeout=20)

    async def q(self, method, path, body=None, prefer=None):
        h = dict(self.h)
        if prefer:
            h["Prefer"] = prefer
        r = await self.c.request(method, f"{SB_URL}/rest/v1/{path}", headers=h, json=body)
        if r.status_code >= 400:
            raise RuntimeError(r.text)
        return r.json() if r.text else None

    async def linked(self, tg_id):
        rows = await self.q("GET", f"residents?tg_id=eq.{tg_id}&status=eq.approved&select=*&limit=1")
        return rows[0] if rows else None

    async def by_nick(self, nick):
        return await self.q("GET", f"residents?nick=eq.{nick}&status=eq.approved&select=*&limit=1")

    async def create_pending(self, nick, tg_id):
        code = f"{random.randint(1000, 9999)}"
        rows = await self.q("POST", "residents", {"nick": nick, "code": code, "tg_id": tg_id, "wish": ""}, "return=representation")
        return rows[0]

    async def get(self, rid):
        rows = await self.q("GET", f"residents?id=eq.{rid}&select=*")
        return rows[0] if rows else None

    async def patch(self, rid, body):
        await self.q("PATCH", f"residents?id=eq.{rid}", body, "return=minimal")

    async def pending(self):
        return await self.q("GET", "residents?status=eq.pending&claimed=eq.true&select=*&order=created_at.asc&limit=50")

    async def count(self, path):
        h = dict(self.h, Prefer="count=exact")
        r = await self.c.head(f"{SB_URL}/rest/v1/{path}", headers=h)
        m = re.search(r"/(\d+)", r.headers.get("content-range", ""))
        return int(m.group(1)) if m else 0

    async def stars_total(self):
        rows = await self.q("GET", "payments?select=stars")
        return sum(r["stars"] for r in rows or []), len(rows or [])

    async def klad_today(self, day):
        return await self.count(f"klad?day=eq.{day}")

    async def klad_add(self, tg_id, nick, day):
        await self.q("POST", "klad", {"tg_id": tg_id, "nick": nick, "day": day}, "return=minimal")

    async def klad_gift(self, tg_id):
        rows = await self.q("GET", f"klad?tg_id=eq.{tg_id}&used=eq.false&select=id&order=id.asc&limit=1")
        return rows[0]["id"] if rows else None

    async def klad_use(self, kid):
        await self.q("PATCH", f"klad?id=eq.{kid}", {"used": True}, "return=minimal")

    async def add_payment(self, tg_id, nick, stars, charge_id, recipe):
        await self.q("POST", "payments", {"tg_id": tg_id, "nick": nick, "stars": stars, "charge_id": charge_id, "recipe": recipe}, "return=minimal")


db = DB()
_subs = {"t": 0, "list": [], "set": set()}


async def subscribers():
    if time.time() - _subs["t"] > 600:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                lst = [norm_nick(x) for x in (await c.get(SUBS_URL, params={"v": int(time.time())})).json()]
            _subs.update(t=time.time(), list=lst, set=set(lst))
        except Exception as e:  # сеть упала — работаем со старым списком
            log.warning("subscribers: %s", e)
    return _subs


async def house_no(nick):
    s = await subscribers()
    return s["list"].index(nick) + 1 if nick in s["set"] else 0


async def election():
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            return (await c.get(ELECTION_URL, params={"v": int(time.time())})).json()
    except Exception:
        return None


# ---------- клавиатуры ----------
def city_url(nick="", gift=False):
    q = [f"me={nick}"] if nick else []
    if gift:
        q.append("gift=1")
    q.append(f"v={int(time.time()) // 3600}")
    return SITE_URL + "?" + "&".join(q)


def city_keyboard(nick="", gift=False):
    return ReplyKeyboardMarkup(resize_keyboard=True, keyboard=[[KeyboardButton(text="🏙 Открыть город", web_app=WebAppInfo(url=city_url(nick, gift)))]])


def main_menu():
    rows = [[IB(text="🏠 Мой дом", callback_data="home")], [IB(text="🗳 Выборы мэра", callback_data="elect")]]
    links = []
    if CHANNEL_URL:
        links.append(IB(text="📢 Канал", url=CHANNEL_URL))
    links.append(IB(text="🎵 TikTok", url=TIKTOK_URL))
    rows.append(links)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def photo(data: bytes, name="card.jpg"):
    return BufferedInputFile(data, name)


class Link(StatesGroup):
    nick = State()


r = Router()


# ---------- пользователь ----------
@r.message(CommandStart())
async def start(m: Message, state: FSMContext):
    await state.clear()
    arg = (m.text or "").split(maxsplit=1)[1:] or [""]
    if arg[0].startswith("klad") and arg[0][4:].isdigit():
        await claim_klad(m, m.from_user.id, arg[0][4:])
        return
    s = await subscribers()
    me = await db.linked(m.from_user.id)
    await m.answer_photo(photo(cards.welcome(len(s["list"]))), reply_markup=main_menu(), caption=(
        "<b>Добро пожаловать в Город подписчиков!</b> 🏙\n\n"
        "Каждый подписчик TikTok получает дом со своим ником.\n"
        f"🏠 <b>Мой дом</b> — привяжи ник и выбери, каким будет дом: 5 вариантов бесплатно или конструктор за {PRICE} ⭐\n"
        "🗳 <b>Выборы мэра</b> — кто станет главным в городе"))
    await m.answer("Город всегда под рукой — кнопка внизу 👇", reply_markup=city_keyboard(me["nick"] if me else ""))


@r.message(Command("home"))
async def home_cmd(m: Message, state: FSMContext):
    await show_home(m, m.from_user.id, state)


@r.callback_query(F.data == "home")
async def home_cb(c: CallbackQuery, state: FSMContext):
    await c.answer()
    await show_home(c.message, c.from_user.id, state)


async def show_home(m: Message, uid: int, state: FSMContext):
    me = await db.linked(uid)
    if me:
        n = await house_no(me["nick"])
        await m.answer_photo(photo(cards.built_card(me["nick"], n, bool(me.get("recipe")))), caption=(
            f"Твой дом: <b>@{me['nick']}</b>{f' · №{n}' if n else ''}\n\n"
            "Чтобы изменить дом, открой город кнопкой <b>«🏙 Открыть город»</b> внизу и нажми <b>«🎨 Мой дом»</b>."),
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🔗 Ссылка на мой дом", url=SITE_URL + "#" + me["nick"])]]))
        await m.answer("👇", reply_markup=city_keyboard(me["nick"]))
        return
    await state.set_state(Link.nick)
    await m.answer("Напиши свой ник в TikTok — например <code>@kotik_99</code>.\n\nДом можно получить, только если ты подписан на " + TIKTOK_URL.split("/")[-1])


@r.message(Link.nick)
async def got_nick(m: Message, state: FSMContext):
    nick = norm_nick(m.text or "")
    if not NICK_RE.match(nick):
        await m.answer("Ник TikTok — это латиница, цифры, «_» и точка. Попробуй ещё раз:")
        return
    s = await subscribers()
    if nick not in s["set"]:
        await state.clear()
        await m.answer(f"Не нашёл <b>@{nick}</b> среди жителей 🤔\n\nПодпишись на TikTok — новые жители заселяются каждый день около 17:00 МСК. Потом нажми «🏠 Мой дом» снова.",
                       reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)], [IB(text="🏠 Мой дом", callback_data="home")]]))
        return
    owner = await db.by_nick(nick)
    if owner:
        await state.clear()
        await m.answer("Этот ник уже привязан к другому Telegram. Если это ошибка — напиши в канал города.")
        return
    try:
        row = await db.create_pending(nick, m.from_user.id)
    except RuntimeError as e:
        await state.clear()
        await m.answer("На этот ник уже есть заявки — дождись проверки 🙏" if "too_many_pending" in str(e) else "Не получилось, попробуй позже.")
        return
    await state.clear()
    kb = [[IB(text="✅ Я написал код", callback_data=f"claim:{row['id']}")]]
    if POCHTA_URL:
        kb.insert(0, [IB(text="📮 Открыть «Почту города»", url=POCHTA_URL)])
    await m.answer_photo(photo(cards.code_card(nick, row["code"])), reply_markup=InlineKeyboardMarkup(inline_keyboard=kb), caption=(
        f"Последний шаг: со своего аккаунта <b>@{nick}</b> напиши в комментариях «Почты города»:\n\n<code>ДОМ-{row['code']}</code>\n\n"
        "Так мы поймём, что ник твой, и никто не сможет менять твой дом. Потом нажми «✅ Я написал код»."))


@r.callback_query(F.data.startswith("claim:"))
async def claim(c: CallbackQuery, bot: Bot):
    row = await db.get(int(c.data.split(":")[1]))
    if not row or row["tg_id"] != c.from_user.id or row["status"] != "pending":
        await c.answer("Заявка не найдена", show_alert=True)
        return
    if row["claimed"]:
        await c.answer("Уже отправлено, ждём проверку 🙏", show_alert=True)
        return
    await db.patch(row["id"], {"claimed": True})
    await c.answer()
    await c.message.answer("Принято! Проверим код и пришлём уведомление, как только дом будет твоим 🏠")
    for a in ADMIN_IDS:
        try:
            await bot.send_message(a, application_text(row), reply_markup=application_kb(row, standalone=True), disable_web_page_preview=True)
        except Exception as e:
            log.warning("notify admin: %s", e)


@r.callback_query(F.data == "elect")
async def elect(c: CallbackQuery):
    await c.answer()
    e = await election()
    if not e or not e.get("stage"):
        await c.message.answer("Выборы мэра скоро начнутся — следи за TikTok и каналом 🗳")
        return
    cands = "\n".join(f"<b>{i + 1}. @{norm_nick(x['nick'])}</b> — {x.get('promise', '')}" for i, x in enumerate(e.get("candidates") or []))
    text = f"<b>{e.get('title', 'Выборы мэра')}</b>\n\n{e.get('text', '')}" + (f"\n\n{cands}" if cands else "") + (f"\n\n⏳ До: {e['until']}" if e.get("until") else "")
    kb = [[IB(text=e.get("button", "Участвовать"), url=e["link"])]] if e.get("link") else []
    await c.message.answer_photo(photo(cards.election_card(e.get("title", "Город выбирает мэра"))), caption=text[:1000],
                                 reply_markup=InlineKeyboardMarkup(inline_keyboard=kb) if kb else None)


# ---------- клад дня ----------
async def claim_klad(m: Message, uid: int, code: str):
    day = msk_day()
    if code != klad_code(day):
        await m.answer("Этот код не подходит 🤔 Клад меняется каждый день в 00:00 МСК — ищи сегодняшний сундук в городе.", reply_markup=main_menu())
        return
    me = await db.linked(uid)
    if not me:
        await m.answer(f"Код верный! 💎 Но сначала привяжи свой ник — «🏠 Мой дом». Потом снова отправь <code>КЛАД-{code}</code> (сегодня до 23:59 МСК).", reply_markup=main_menu())
        return
    if await db.klad_gift(uid):
        await m.answer("У тебя уже есть неиспользованный приз 💎 Открой город → «🎨 Мой дом» → «Конструктор» — там бесплатно.", reply_markup=city_keyboard(me["nick"], gift=True))
        return
    if await db.klad_today(day) >= KLAD_LIMIT:
        await m.answer("Сегодня все призы уже разобрали 😔 Завтра будет новый клад — приходи пораньше!")
        return
    try:
        await db.klad_add(uid, me["nick"], day)
    except RuntimeError:
        await m.answer("Ты уже забрал сегодняшний клад 😉 Завтра — новый.")
        return
    await m.answer_photo(photo(cards.klad_card(me["nick"])), caption=(
        "<b>Клад твой!</b> 💎\n\nПриз — <b>особый дом из конструктора бесплатно</b>.\n"
        "Нажми <b>«🏙 Открыть город»</b> внизу → <b>«🎨 Мой дом»</b> → собери дом и нажми «Забрать бесплатно»."),
        reply_markup=city_keyboard(me["nick"], gift=True))


@r.message(F.text.regexp(KLAD_RE))
async def klad_text(m: Message):
    await claim_klad(m, m.from_user.id, KLAD_RE.match(m.text).group(1))


# ---------- мини-приложение: выбор дома ----------
@r.message(F.web_app_data)
async def web_app(m: Message, bot: Bot):
    me = await db.linked(m.from_user.id)
    if not me:
        await m.answer("Сначала привяжи ник: «🏠 Мой дом».", reply_markup=main_menu())
        return
    try:
        data = json.loads(m.web_app_data.data)
    except ValueError:
        return
    if data.get("t") == "klad":
        await claim_klad(m, m.from_user.id, str(data.get("c", "")))
        return
    if data.get("t") == "preset":
        i = int(data.get("i", -1))
        if not 0 <= i < len(PRESETS):
            return
        name, rec = PRESETS[i]
        await db.patch(me["id"], {"recipe": rec})
        await m.answer_photo(photo(cards.built_card(me["nick"], await house_no(me["nick"]), True)),
                             caption=f"Готово! Твой дом теперь «{name}» 🏠\nОн уже в городе — открой и посмотри.", reply_markup=city_keyboard(me["nick"]))
    elif data.get("t") == "custom":
        code = encode_recipe(data.get("r") or {})
        if not code:
            await m.answer("Что-то не так с конструктором, попробуй ещё раз.")
            return
        gift = await db.klad_gift(m.from_user.id)
        if gift:  # приз за клад — без оплаты
            await db.patch(me["id"], {"recipe": decode_recipe(code)})
            await db.klad_use(gift)
            await m.answer_photo(photo(cards.built_card(me["nick"], await house_no(me["nick"]), True)),
                                 caption="Готово! 💎 Особый дом за клад уже стоит в городе.", reply_markup=city_keyboard(me["nick"]))
            return
        await bot.send_invoice(m.chat.id, title="Особый дом", description=f"Твой дом @{me['nick']} в городе станет таким, как ты собрал в конструкторе.",
                               payload=f"c|{me['id']}|{code}", currency="XTR", prices=[LabeledPrice(label="Особый дом", amount=PRICE)])


@r.pre_checkout_query()
async def pre_checkout(q: PreCheckoutQuery):
    parts = q.invoice_payload.split("|")
    ok = len(parts) == 3 and parts[0] == "c" and decode_recipe(parts[2]) is not None and q.total_amount == PRICE
    await q.answer(ok=ok, error_message=None if ok else "Счёт устарел, собери дом заново.")


@r.message(F.successful_payment)
async def paid(m: Message, bot: Bot):
    p = m.successful_payment
    _, rid, code = p.invoice_payload.split("|")
    rec = decode_recipe(code)
    row = await db.get(int(rid))
    if not row or row["tg_id"] != m.from_user.id or not rec:
        await bot.refund_star_payment(m.from_user.id, p.telegram_payment_charge_id)
        await m.answer("Не получилось применить дом — звёзды вернули.")
        return
    await db.patch(row["id"], {"recipe": rec})
    try:
        await db.add_payment(m.from_user.id, row["nick"], p.total_amount, p.telegram_payment_charge_id, rec)
    except RuntimeError as e:
        log.warning("payment log: %s", e)
    await m.answer_photo(photo(cards.built_card(row["nick"], await house_no(row["nick"]), True)),
                         caption="Спасибо! ⭐ Твой особый дом уже стоит в городе.", reply_markup=city_keyboard(row["nick"]))


# ---------- админ: одна панель ----------
def is_admin(uid):
    return uid in ADMIN_IDS


def application_text(row):
    return (f"📥 <b>Заявка</b>\n\nНик: <b>@{row['nick']}</b>\nКод: <code>ДОМ-{row['code']}</code>\n"
            f"Telegram id: <code>{row['tg_id']}</code>\n\n"
            f"Проверь, что <a href='https://www.tiktok.com/@{row['nick']}'>@{row['nick']}</a> написал этот код в комментах «Почты города».")


def application_kb(row, standalone=False):
    kb = [[IB(text="✅ Одобрить", callback_data=f"ap:{row['id']}:{int(standalone)}"), IB(text="❌ Отклонить", callback_data=f"rj:{row['id']}:{int(standalone)}")]]
    if POCHTA_URL:
        kb.append([IB(text="📮 Почта города", url=POCHTA_URL)])
    if not standalone:
        kb.append([IB(text="⏭ Следующая", callback_data="adm:apps"), IB(text="« Панель", callback_data="adm:home")])
    return InlineKeyboardMarkup(inline_keyboard=kb)


async def panel_media():
    pend = await db.count("residents?status=eq.pending&claimed=eq.true")
    special = await db.count("residents?status=eq.approved&recipe=not.is.null")
    s = await subscribers()
    stars, sales = await db.stars_total()
    cap = (f"🏛 <b>Панель мэрии</b>\n\nЗаявок ждут: <b>{pend}</b>\nПривязано / особых домов: <b>{special}</b>\n"
           f"Жителей в городе: <b>{len(s['list'])}</b>\nПродаж: <b>{sales}</b> · заработано <b>{stars} ⭐</b>")
    kb = InlineKeyboardMarkup(inline_keyboard=[[IB(text=f"📥 Заявки ({pend})", callback_data="adm:apps")],
                                               [IB(text="🔄 Обновить", callback_data="adm:home")]])
    return cards.admin_card(pend, special, len(s["list"])), cap, kb


@r.message(Command("admin"))
async def admin(m: Message):
    if not is_admin(m.from_user.id):
        return
    img, cap, kb = await panel_media()
    await m.answer_photo(photo(img), caption=cap, reply_markup=kb)


@r.callback_query(F.data.startswith("adm:"))
async def admin_nav(c: CallbackQuery):
    if not is_admin(c.from_user.id):
        await c.answer()
        return
    await c.answer()
    if c.data == "adm:home":
        img, cap, kb = await panel_media()
        await c.message.edit_media(InputMediaPhoto(media=photo(img), caption=cap), reply_markup=kb)
    elif c.data == "adm:apps":
        rows = await db.pending()
        if not rows:
            img, cap, kb = await panel_media()
            await c.message.edit_media(InputMediaPhoto(media=photo(img), caption=cap + "\n\n✅ Новых заявок нет"), reply_markup=kb)
            return
        row = rows[0]
        await c.message.edit_media(InputMediaPhoto(media=photo(cards.code_card(row["nick"], row["code"])), caption=application_text(row)),
                                   reply_markup=application_kb(row))


@r.callback_query(F.data.startswith("ap:") | F.data.startswith("rj:"))
async def decide(c: CallbackQuery, bot: Bot):
    if not is_admin(c.from_user.id):
        await c.answer()
        return
    act, rid, standalone = c.data.split(":")
    row = await db.get(int(rid))
    if not row or row["status"] != "pending":
        await c.answer("Уже обработана", show_alert=True)
    elif act == "ap":
        try:
            await db.patch(row["id"], {"status": "approved", "approved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        except RuntimeError:
            await c.answer("У этого ника уже есть владелец", show_alert=True)
            return
        await c.answer("Одобрено")
        try:
            await bot.send_photo(row["tg_id"], photo(cards.built_card(row["nick"], await house_no(row["nick"]), False)), caption=(
                f"Готово! Ник <b>@{row['nick']}</b> подтверждён 🎉\n\nТеперь открой город кнопкой «🏙 Открыть город» → «🎨 Мой дом» и выбери, каким будет твой дом."),
                reply_markup=city_keyboard(row["nick"]))
        except Exception as e:
            log.warning("notify user: %s", e)
    else:
        await db.patch(row["id"], {"status": "rejected"})
        await c.answer("Отклонено")
        try:
            await bot.send_message(row["tg_id"], f"Не нашли код ДОМ-{row['code']} в комментариях 😕 Нажми «🏠 Мой дом» и попробуй ещё раз.")
        except Exception:
            pass
    if standalone == "1":
        await c.message.edit_reply_markup(reply_markup=None)
        await c.message.edit_text(c.message.html_text + ("\n\n✅ Одобрено" if act == "ap" else "\n\n❌ Отклонено"))
    else:
        c.data = "adm:apps"
        await admin_nav(c)


async def main():
    missing = [k for k, v in {"BOT_TOKEN": BOT_TOKEN, "SUPABASE_URL": SB_URL, "SUPABASE_SERVICE_KEY": SB_KEY, "SITE_URL": SITE_URL.strip("/"), "ADMIN_IDS": ADMIN_IDS}.items() if not v]
    if missing:
        raise SystemExit("Заполни в .env: " + ", ".join(missing))
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
    dp = Dispatcher()
    dp.include_router(r)
    await bot.set_my_commands([BotCommand(command="start", description="Главное меню"), BotCommand(command="home", description="Мой дом")])
    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Город", web_app=WebAppInfo(url=SITE_URL)))
    log.info("Бот запущен")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
