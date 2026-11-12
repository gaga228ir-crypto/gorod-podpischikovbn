"""
Бот «Город подписчиков».
  Пользователь: привязать ник TikTok (код в «Почте города») → выбрать дом в мини-приложении:
                5 вариантов бесплатно или конструктор за звёзды.
  Админ (/admin): одна панель — заявки, продажи, статистика.
Настройки — в файле .env (см. .env.example).
"""
import asyncio, base64, datetime as dt, hashlib, json, logging, os, random, re, time
from pathlib import Path

import httpx
from urllib.parse import quote
from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import (BufferedInputFile, CallbackQuery, InlineKeyboardButton as IB, InlineKeyboardMarkup,
                           InputMediaPhoto, KeyboardButton, LabeledPrice, MenuButtonWebApp, Message,
                           PreCheckoutQuery, ReplyKeyboardMarkup, WebAppInfo, BotCommand)

import cards
import tiktok
import ai
from localdb import LocalDB

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
_site = E("SITE_URL", "").strip()
if _site.endswith(".html"):
    _site = _site.rsplit("/", 1)[0]
SITE_BASE = _site.rstrip("/") + "/"
# SourceCraft отдаёт 404 на адрес «папка/», поэтому город всегда открываем как …/index.html
SITE_URL = SITE_BASE + "index.html"
SUBS_URL = E("SUBS_URL", "") or SITE_BASE + "subscribers.json"
ELECTION_URL = E("ELECTION_URL", "") or SITE_BASE + "election.json"
POCHTA_URL = E("POCHTA_URL", "")
CHANNEL_URL = E("CHANNEL_URL", "")
CHAT_URL = E("CHAT_URL", "https://t.me/+URDD6hcKo4ZlOTMy")
REF_GOAL = int(E("REF_GOAL", "3"))           # столько приглашённых = бесплатный дом по описанию
TIKTOK_URL = E("TIKTOK_URL", "https://www.tiktok.com/@eben51041")
PRICE = int(E("CUSTOM_PRICE", "0"))          # конструктор: 0 = бесплатно
AI_PRICE = int(E("AI_PRICE", "15"))           # дом по описанию (нейросеть)
OLLAMA_URL = E("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = E("OLLAMA_MODEL", "qwen2.5:7b")
CHAT_ID = E("CHAT_ID", "")                    # id чата жителей (-100…) — бот должен быть в чате; узнать: /chatid в чате
CHANNEL_ID = E("CHANNEL_ID", "")              # @username канала — бот должен быть в нём админом
KLAD_SALT = E("KLAD_SALT", "gorod-klad-v1")
KLAD_LIMIT = int(E("KLAD_LIMIT", "20"))
GITHUB_TOKEN = E("GITHUB_TOKEN", "")
TIKTOK_SESSIONID = E("TIKTOK_SESSIONID", "")
SUBS_EVERY_MIN = int(E("SUBS_EVERY_MIN", "120"))
RESTART_HOURS = float(E("RESTART_HOURS", "12"))
GITHUB_REPO = E("GITHUB_REPO", "gaga228ir-crypto/gorod-podpischikovbn")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("gorod")

# ---------- дома: те же наборы, что на сайте (houses.js / index.html) ----------
SHAPES = ["house", "tower", "castle", "skyscraper", "dome", "clocktower"]
EMBLEMS = ["none", "sun", "moon", "star", "heart", "clock", "crown", "flame", "leaf", "lightning", "diamond", "snake"]
LIGHTS = ["warm", "cool", "pink", "green"]
DECOR = ["garland", "tree", "car", "pet"]
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


def _near(c, pal):
    """Ближайший цвет палитры (у особых домов бывают свои цвета)."""
    if c in pal:
        return c
    try:
        rgb = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    except (TypeError, ValueError):
        return pal[0]
    return min(pal, key=lambda p: sum((int(p[i:i + 2], 16) - v) ** 2 for i, v in zip((1, 3, 5), rgb)))


def encode_recipe(r: dict) -> str | None:
    """Рецепт из конструктора → короткая строка индексов (влезает в payload счёта)."""
    try:
        r = dict(r, wall=_near(r.get("wall"), WALL_C), roof=_near(r.get("roof"), ROOF_C))
        dec = sum(1 << DECOR.index(d) for d in set(r.get("decor") or []) if d in DECOR)
        return ",".join(str(x) for x in (SHAPES.index(r["shape"]), int(r["floors"]), WALL_C.index(r["wall"]),
                                         ROOF_C.index(r["roof"]), EMBLEMS.index(r["emblem"]), LIGHTS.index(r["lights"]), dec))
    except (KeyError, ValueError, TypeError):
        return None


def decode_recipe(code: str) -> dict | None:
    try:
        v = [int(x) for x in code.split(",")]
        s, f, w, r, e, l = v[:6]
        dec = v[6] if len(v) > 6 else 0
        if not 1 <= f <= 6:
            return None
        rec = {"shape": SHAPES[s], "floors": f, "wall": WALL_C[w], "roof": ROOF_C[r], "emblem": EMBLEMS[e], "lights": LIGHTS[l]}
        if dec:
            rec["decor"] = [d for i, d in enumerate(DECOR) if dec >> i & 1]
        return rec
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
        self.h = {"apikey": SB_KEY, "Content-Type": "application/json"}
        if not SB_KEY.startswith("sb_"):  # старые JWT-ключи — ещё и в Authorization
            self.h["Authorization"] = f"Bearer {SB_KEY}"
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

    async def ai_create(self, tg_id, nick, text):
        rows = await self.q("POST", "ai_orders", {"tg_id": tg_id, "nick": nick, "text": text}, "return=representation")
        return rows[0]["id"]

    async def ai_get(self, oid):
        rows = await self.q("GET", f"ai_orders?id=eq.{oid}&select=*")
        return rows[0] if rows else None

    async def ai_patch(self, oid, body):
        await self.q("PATCH", f"ai_orders?id=eq.{oid}", body, "return=minimal")

    async def ai_list(self, status):
        return await self.q("GET", f"ai_orders?status=eq.{status}&select=*&order=id.asc") or []

    async def payments_recent(self):
        return await self.q("GET", "payments?select=nick,stars&order=id.desc&limit=5") or []

    async def ref_set(self, tg_id, ref_by):
        if tg_id == ref_by or await self.q("GET", f"refs?tg_id=eq.{tg_id}&select=tg_id"):
            return
        await self.q("POST", "refs", {"tg_id": tg_id, "ref_by": ref_by}, "return=minimal")

    async def ref_reward(self, tg_id):
        rows = await self.q("GET", f"refs?tg_id=eq.{tg_id}&rewarded=eq.false&select=ref_by")
        if not rows:
            return None
        await self.q("PATCH", f"refs?tg_id=eq.{tg_id}", {"rewarded": True}, "return=minimal")
        return rows[0]["ref_by"]

    async def ref_count(self, uid):
        n = await self.count(f"refs?ref_by=eq.{uid}&rewarded=eq.true")
        return n + (1 if await self.q("GET", f"refs?tg_id=eq.{uid}&rewarded=eq.true&select=tg_id") else 0)

    async def ref_top(self, k=10):
        rows = await self.q("GET", "refs?rewarded=eq.true&select=ref_by") or []
        cnt = {}
        for r_ in rows:
            cnt[r_["ref_by"]] = cnt.get(r_["ref_by"], 0) + 1
        return sorted(cnt.items(), key=lambda x: -x[1])[:k]

    async def ai_gift(self, tg_id):
        rows = await self.q("GET", f"ai_orders?tg_id=eq.{tg_id}&status=eq.gift&select=*&limit=1")
        return rows[0] if rows else None

    async def special(self):
        return await self.q("GET", "residents?status=eq.approved&recipe=not.is.null&select=nick,recipe&order=nick.asc") or []

    async def add_payment(self, tg_id, nick, stars, charge_id, recipe):
        await self.q("POST", "payments", {"tg_id": tg_id, "nick": nick, "stars": stars, "charge_id": charge_id, "recipe": recipe}, "return=minimal")


# База: Supabase, если он указан в .env, иначе локальный файл gorod.db (работает без VPN)
db = DB() if SB_URL and SB_KEY else LocalDB(Path(__file__).parent / "gorod.db")


# ---------- файлы на GitHub (сайт берёт их оттуда, открывается без VPN) ----------
GH_H = lambda: {"Authorization": f"Bearer {GITHUB_TOKEN}", "Accept": "application/vnd.github+json"}


async def gh_get(path):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}", headers=GH_H(), params={"ref": "main"})
    if r.status_code != 200:
        return None, None
    j = r.json()
    return base64.b64decode(j["content"]).decode(), j["sha"]


async def gh_put(path, text, message, sha=None):
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.put(f"https://api.github.com/repos/{GITHUB_REPO}/contents/{path}", headers=GH_H(), json={
            "message": message, "branch": "main", "content": base64.b64encode(text.encode()).decode(), **({"sha": sha} if sha else {})})
    r.raise_for_status()


async def export_loop():
    """Особые дома → recipes.json."""
    if not GITHUB_TOKEN:
        log.info("GITHUB_TOKEN не задан — особые дома на сайт не выгружаются")
        return
    last = None
    while True:
        try:
            rows = await db.special()
            body = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
            digest = hashlib.sha1(body.encode()).hexdigest()
            if digest != last:
                old, sha = await gh_get("recipes.json")
                if old != body:
                    await gh_put("recipes.json", body, f"Особые дома: {len(rows)}", sha)
                    log.info("recipes.json обновлён: %s домов", len(rows))
                last = digest
        except Exception as e:
            log.warning("export: %s", e)
        await asyncio.sleep(120)


SYNC = {"at": None, "msg": "ещё не запускалось" if TIKTOK_SESSIONID else "выключено (нет TIKTOK_SESSIONID)"}


async def sync_subscribers_once():
    owner = TIKTOK_URL.rstrip("/").split("@")[-1]
    fresh_list = await tiktok.followers(owner, TIKTOK_SESSIONID, log)
    text, sha = await gh_get("subscribers.json")
    current = [str(x) for x in json.loads(text or "[]")]
    merged, new, gone, back = tiktok.merge(current, fresh_list)
    if merged != current:
        await gh_put("subscribers.json", json.dumps(merged, ensure_ascii=False, separators=(",", ":")),
                     f"Подписчики: +{new}" + (f", отписались {gone}" if gone else "") + (f", вернулись {back}" if back else ""), sha)
    # сразу обновляем список в боте (сайт-зеркало догонит через минуту)
    lst = [norm_nick(x.lstrip("~")) for x in merged]
    g = {norm_nick(x.lstrip("~")) for x in merged if x.startswith("~")}
    _subs.update(t=time.time(), list=lst, set=set(lst) - g, gone=g)
    return len(fresh_list), new, gone, back


async def sync_loop(bot):
    if not (TIKTOK_SESSIONID and GITHUB_TOKEN):
        return
    await asyncio.sleep(30)
    while True:
        try:
            total, new, gone, back = await sync_subscribers_once()
            SYNC.update(at=time.strftime("%d.%m %H:%M"), msg=f"✅ {total} подписчиков · +{new} новых · {gone} отписались")
        except Exception as e:
            SYNC.update(at=time.strftime("%d.%m %H:%M"), msg=f"❌ {e}")
            log.warning("sync: %s", e)
        await asyncio.sleep(SUBS_EVERY_MIN * 60)


_subs = {"t": 0, "list": [], "set": set(), "gone": set()}


async def subscribers():
    if time.time() - _subs["t"] > 600:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                raw = [str(x) for x in (await c.get(SUBS_URL, params={"v": int(time.time())})).json()]
            # «~ник» — отписался: номер дома сохраняется, но дом заброшен и ник не считается жителем
            lst = [norm_nick(x.lstrip("~")) for x in raw]
            gone = {norm_nick(x.lstrip("~")) for x in raw if x.startswith("~")}
            _subs.update(t=time.time(), list=lst, set=set(lst) - gone, gone=gone)
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
    rows = [[IB(text="🏠 Мой дом", callback_data="home")], [IB(text="👥 Пригласить друга · бонус", callback_data="ref")],
            [IB(text="🗳 Выборы мэра", callback_data="elect")]]
    if CHAT_URL:
        rows.append([IB(text="💬 Чат жителей", url=CHAT_URL)])
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
    if arg[0].startswith("vote_") and arg[0][5:].isdigit():
        await do_vote(m, m.from_user.id, int(arg[0][5:]), m.bot)
        return
    if arg[0] == "cand":
        await apply_start(m, m.from_user.id, state, m.bot)
        return
    if arg[0] == "mayor":
        await show_election(m)
        return
    if arg[0].startswith("ref") and arg[0][3:].isdigit():
        await db.ref_set(m.from_user.id, int(arg[0][3:]))
    s = await subscribers()
    me = await db.linked(m.from_user.id)
    await m.answer_photo(photo(cards.welcome(len(s["list"]))), reply_markup=main_menu(), caption=(
        "<b>Добро пожаловать в Город подписчиков!</b> 🏙\n\n"
        "Каждый подписчик TikTok получает дом со своим ником.\n"
        "🏠 <b>Мой дом</b> — привяжи ник и выбери, каким будет дом: готовые варианты и конструктор бесплатно, ✨ дом по описанию — нейросеть построит любую идею\n"
        f"👥 <b>Пригласи друзей</b> — за {REF_GOAL} друзей дом по описанию в подарок\n"
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
    if nick in s["gone"]:
        await state.clear()
        await m.answer(f"<b>@{nick}</b> отписался от TikTok — его дом сейчас заброшен 🏚\n\nПодпишись снова, и в течение 2 часов свет в доме вернётся. Потом нажми «🏠 Мой дом».",
                       reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)], [IB(text="🏠 Мой дом", callback_data="home")]]))
        return
    if nick not in s["set"]:
        await state.clear()
        await m.answer(f"Не нашёл <b>@{nick}</b> среди жителей 🤔\n\nПодпишись на TikTok — новые жители заселяются каждые 2 часа. Потом нажми «🏠 Мой дом» снова.",
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
    await m.answer_photo(photo(cards.code_card(nick, row["code"])), reply_markup=code_kb(row), caption=code_text(nick, row["code"]))


def code_kb(row):
    kb = [[IB(text="✅ Проверить код", callback_data=f"check:{row['id']}")],
          [IB(text="🎵 Открыть мой TikTok", url=f"https://www.tiktok.com/@{row['nick']}")],
          [IB(text="🙋 Не получается — проверьте вручную", callback_data=f"claim:{row['id']}")]]
    return InlineKeyboardMarkup(inline_keyboard=kb)


def code_text(nick, code):
    return (f"Последний шаг — докажи, что <b>@{nick}</b> твой:\n\n"
            f"1. В TikTok: Профиль → <b>Изменить профиль</b> → <b>О себе</b>\n"
            f"2. Добавь туда код <code>ДОМ-{code}</code> и сохрани\n"
            f"3. Нажми <b>«✅ Проверить код»</b> — бот проверит сам за пару секунд\n\n"
            "После проверки код из описания можно удалить.")


@r.callback_query(F.data.startswith("check:"))
async def check_code(c: CallbackQuery, bot: Bot):
    row = await db.get(int(c.data.split(":")[1]))
    if not row or row["tg_id"] != c.from_user.id or row["status"] != "pending":
        await c.answer("Заявка не найдена или уже обработана", show_alert=True)
        return
    await c.answer("Проверяю…")
    try:
        p = await tiktok.profile(row["nick"])
    except Exception as e:
        log.warning("profile %s: %s", row["nick"], e)
        p = None
    if p is None:
        await c.message.answer("Не получилось открыть твой профиль TikTok 😕 Попробуй через минуту или нажми «🙋 Не получается — проверьте вручную».")
        return
    if not tiktok.bio_has_code(p["signature"], row["code"]):
        await c.message.answer(f"В описании профиля нет кода <code>ДОМ-{row['code']}</code> 🤔\nПроверь, что сохранил, и подожди 1–2 минуты — TikTok обновляет не сразу. Потом нажми «✅ Проверить код» ещё раз.")
        return
    s = await subscribers()
    if row["nick"] not in s["set"]:
        await c.message.answer(f"Код нашёл ✅, но <b>@{row['nick']}</b> пока не среди подписчиков 🤔 Подпишись — после ближайшего обновления города нажми «✅ Проверить код» снова.",
                               reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)]]))
        return
    if await approve_row(bot, row):
        for a in ADMIN_IDS:
            try:
                await bot.send_message(a, f"🤖 Автопроверка: <b>@{row['nick']}</b> подтвердил ник кодом в профиле — дом выдан.")
            except Exception:
                pass


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


# ---------- выборы мэра ----------
# Кандидат: привязанный ник (свой дом) + подписка на канал + участник чата жителей → программа → проверка админом → сайт.
# Голос: привязанный ник + подписка на канал; 1 человек = 1 голос. Неделя (MAYOR_DAYS), потом итог — мэр в Ратуше.
class Mayor(StatesGroup):
    promise = State()


MAYOR_DAYS = int(E("MAYOR_DAYS", "7"))
_bot_username = ""
_mayor_dirty = asyncio.Event()


def bot_link(arg=""):
    return f"https://t.me/{_bot_username}" + (f"?start={arg}" if arg else "")


async def in_chat(bot, uid) -> bool:
    if not CHAT_ID:
        return True
    try:
        mem = await bot.get_chat_member(CHAT_ID, uid)
        return mem.status in ("member", "administrator", "creator", "restricted")
    except Exception as e:  # бота нет в чате или неверный CHAT_ID — не мешаем людям
        log.warning("чат: %s", e)
        return True


async def mayor_until():
    v = await db.kv_get("mayor_until")
    return dt.datetime.fromisoformat(v) if v else None


def msk(d: dt.datetime) -> str:
    return (d + dt.timedelta(hours=3)).strftime("%d.%m %H:%M") + " МСК"


async def mayor_json():
    until, winner = await mayor_until(), await db.kv_get("mayor_winner")
    cands = await db.cands()
    base = {"chip": "🗳 ВЫБОРЫ МЭРА", "title": "Город выбирает мэра!", "link": bot_link("mayor"), "button": "ГОЛОСОВАТЬ В БОТЕ",
            "apply": bot_link("cand"), "candidates": [{"id": c["id"], "nick": c["nick"], "promise": c["promise"], "votes": c["votes"],
                                                        "vote": bot_link(f"vote_{c['id']}")} for c in cands]}
    if winner:
        return {**base, "stage": 3, "title": f"Мэр города — @{winner}!", "text": "Выборы завершены. Мэр заселился в Ратушу 🏛", "winner": winner, "until": ""}
    if until:
        return {**base, "stage": 2, "until": msk(until),
                "text": "Хочешь стать мэром? Подай заявку в боте: нужен свой дом, подписка на ТГ-канал и чат жителей. "
                        "Голосовать могут жители с домом, подписанные на канал. 1 житель = 1 голос."}
    return None


async def mayor_publish():
    """election.json на сайт (через GitHub). Пока выборы не запущены — файл не трогаем."""
    j = await mayor_json()
    if not j or not GITHUB_TOKEN:
        return
    body = json.dumps(j, ensure_ascii=False, indent=1)
    old, sha = await gh_get("election.json")
    if old != body:
        await gh_put("election.json", body, f"Выборы мэра: {len(j['candidates'])} кандидатов, голосов {sum(c['votes'] for c in j['candidates'])}", sha)


async def mayor_loop(bot):
    """Раз в 5 минут (или сразу после важного события) — выгрузка на сайт и проверка конца выборов."""
    while True:
        try:
            await asyncio.wait_for(_mayor_dirty.wait(), timeout=300)
        except asyncio.TimeoutError:
            pass
        _mayor_dirty.clear()
        try:
            until = await mayor_until()
            if until and not await db.kv_get("mayor_winner") and dt.datetime.utcnow() >= until:
                await mayor_finish(bot)
            await mayor_publish()
        except Exception as e:
            log.warning("выборы: %s", e)
        await asyncio.sleep(20)  # не чаще раза в 20 с — бережём GitHub


async def mayor_finish(bot):
    cands = await db.cands()
    if not cands:
        await db.kv_set("mayor_until", None)
        for a in ADMIN_IDS:
            await bot.send_message(a, "🗳 Выборы закончились, но одобренных кандидатов не было. Запусти заново: /mayor_start")
        return
    w = cands[0]
    await db.kv_set("mayor_winner", w["nick"])
    try:
        await bot.send_message(w["tg_id"], f"👑 <b>Ты — мэр Города подписчиков!</b>\n\nЗа тебя проголосовали {w['votes']} жителей. Твой ник теперь на Ратуше 🏛")
    except Exception:
        pass
    for a in ADMIN_IDS:
        await bot.send_message(a, "🗳 <b>Итоги выборов</b>\n\n" + "\n".join(f"{i + 1}. @{c['nick']} — {c['votes']}" for i, c in enumerate(cands[:10])))


def elect_kb(cands, can_apply=True):
    rows = [[IB(text=f"🗳 @{c['nick']} · {c['votes']}", callback_data=f"vote:{c['id']}")] for c in cands[:10]]
    if can_apply:
        rows.append([IB(text="🙋 Стать кандидатом", callback_data="cand")])
    rows.append([IB(text="🏙 Кандидаты на сайте", url=SITE_URL)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def show_election(m: Message):
    until, winner = await mayor_until(), await db.kv_get("mayor_winner")
    if winner:
        await m.answer(f"👑 Мэр города — <b>@{winner}</b>. Следующие выборы объявим в TikTok и канале.", reply_markup=main_menu())
        return
    if not until:
        await m.answer("🗳 Выборы мэра скоро начнутся — следи за TikTok и каналом!", reply_markup=main_menu())
        return
    cands = await db.cands()
    lst = "\n".join(f"<b>{i + 1}. @{c['nick']}</b> — {c['promise']} · <b>{c['votes']}</b> 🗳" for i, c in enumerate(cands)) or "Кандидатов пока нет — стань первым!"
    await m.answer_photo(photo(cards.election_card("Город выбирает мэра")), caption=(
        f"<b>🗳 Выборы мэра</b> · до {msk(until)}\n\n{lst}\n\n"
        "Голосуют жители с домом, подписанные на ТГ-канал. 1 житель = 1 голос.")[:1000], reply_markup=elect_kb(cands))


@r.callback_query(F.data == "elect")
async def elect(c: CallbackQuery):
    await c.answer()
    await show_election(c.message)


def join_kb(need_chat, need_channel, retry):
    rows = []
    if need_channel and CHANNEL_URL:
        rows.append([IB(text="📢 Подписаться на канал", url=CHANNEL_URL)])
    if need_chat and CHAT_URL:
        rows.append([IB(text="💬 Вступить в чат жителей", url=CHAT_URL)])
    rows.append([IB(text="✅ Я вступил — проверить", callback_data=retry)])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def resident_ok(m: Message, uid: int):
    me = await db.linked(uid)
    if not me:
        await m.answer("Сначала получи свой дом: «🏠 Мой дом» → привяжи ник TikTok.", reply_markup=main_menu())
        return None
    if me["nick"] in (await subscribers())["gone"]:
        await m.answer("Твой дом пустует — ты отписался от TikTok 🏚 Подпишись снова и возвращайся.",
                       reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)]]))
        return None
    return me


async def apply_start(m: Message, uid: int, state: FSMContext, bot):
    until = await mayor_until()
    if not until or await db.kv_get("mayor_winner"):
        await m.answer("Сейчас заявки не принимаются — выборы ещё не начались или уже прошли.", reply_markup=main_menu())
        return
    me = await resident_ok(m, uid)
    if not me:
        return
    old = await db.cand_by_tg(uid)
    if old and old["status"] in ("new", "approved"):
        await m.answer("Твоя заявка уже " + ("на проверке ⏳" if old["status"] == "new" else "одобрена — ты в списке кандидатов ✅"))
        return
    ch, ct = await in_channel(bot, uid, strict=True), await in_chat(bot, uid)
    if not (ch and ct):
        await m.answer("Чтобы стать кандидатом, нужно быть с городом везде 👇\n" + ("" if ch else "• подписаться на ТГ-канал\n") + ("" if ct else "• вступить в чат жителей\n"),
                       reply_markup=join_kb(not ct, not ch, "cand"))
        return
    await state.set_state(Mayor.promise)
    await m.answer(f"🙋 <b>Заявка в мэры от @{me['nick']}</b>\n\nНапиши одним сообщением свою программу: что ты сделаешь, если станешь мэром? "
                   "(до 200 символов, без мата и ссылок)\n\nОтмена — /start")


@r.callback_query(F.data == "cand")
async def cand_cb(c: CallbackQuery, state: FSMContext):
    await c.answer()
    await apply_start(c.message, c.from_user.id, state, c.bot)


@r.message(Mayor.promise)
async def cand_promise(m: Message, state: FSMContext):
    text = re.sub(r"\s+", " ", (m.text or "")).strip()
    if not text or text.startswith("/"):
        await state.clear()
        return
    if len(text) > 200 or re.search(r"https?://|t\.me/|@\w{3,}", text):
        await m.answer("Нужно до 200 символов и без ссылок/упоминаний. Попробуй ещё раз 🙂")
        return
    me = await db.linked(m.from_user.id)
    if not me:
        await state.clear()
        return
    cid = await db.cand_add(m.from_user.id, me["nick"], text)
    await state.clear()
    await m.answer("📨 Заявка отправлена! Мэрия проверит её, и ты появишься в списке кандидатов на сайте и в боте.", reply_markup=main_menu())
    for a in ADMIN_IDS:
        try:
            await m.bot.send_message(a, f"🗳 <b>Заявка в мэры</b> #{cid}\n@{me['nick']} (tg {m.from_user.id})\n\n«{html_esc(text)}»",
                                     reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="✅ Одобрить", callback_data=f"mc_ok:{cid}"),
                                                                                         IB(text="❌ Отклонить", callback_data=f"mc_no:{cid}")]]))
        except Exception as e:
            log.warning("notify admin: %s", e)


def html_esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


@r.callback_query(F.data.startswith("mc_ok:") | F.data.startswith("mc_no:"))
async def cand_moderate(c: CallbackQuery):
    if not is_admin(c.from_user.id):
        return await c.answer()
    ok, cid = c.data.startswith("mc_ok"), int(c.data.split(":")[1])
    cd = await db.cand_get(cid)
    if not cd:
        return await c.answer("Заявка не найдена", show_alert=True)
    await db.cand_set(cid, "approved" if ok else "rejected")
    await c.answer("Одобрено ✅" if ok else "Отклонено")
    await c.message.edit_reply_markup(reply_markup=None)
    await c.message.answer(("✅ Одобрено" if ok else "❌ Отклонено") + f": @{cd['nick']}")
    try:
        await c.bot.send_message(cd["tg_id"], "✅ <b>Ты кандидат в мэры!</b> Твоя программа уже на сайте. Зови друзей голосовать: " + bot_link(f"vote_{cid}")
                                 if ok else "❌ Заявка в мэры не прошла проверку. Можно подать новую — «🗳 Выборы мэра» → «Стать кандидатом».")
    except Exception:
        pass
    _mayor_dirty.set()


async def do_vote(m: Message, uid: int, cid: int, bot, retry_cb=None):
    until = await mayor_until()
    if not until or await db.kv_get("mayor_winner"):
        await m.answer("Голосование сейчас закрыто.", reply_markup=main_menu())
        return
    cd = await db.cand_get(cid)
    if not cd or cd["status"] != "approved":
        await m.answer("Такого кандидата нет 🤔")
        return
    me = await resident_ok(m, uid)
    if not me:
        return
    prev = await db.vote_get(uid)
    if prev:
        p = await db.cand_get(prev)
        await m.answer(f"Ты уже проголосовал за @{p['nick'] if p else '?'} 🗳 Один житель — один голос.")
        return
    if not await in_channel(bot, uid, strict=True):
        await m.answer("Голосовать могут подписчики нашего ТГ-канала 📢 Подпишись и нажми «проверить».", reply_markup=join_kb(False, True, retry_cb or f"vote:{cid}"))
        return
    await db.vote_add(uid, cid)
    await m.answer(f"✅ Твой голос за <b>@{cd['nick']}</b> принят! Результаты — на сайте и в «🗳 Выборы мэра».", reply_markup=main_menu())
    _mayor_dirty.set()


@r.callback_query(F.data.startswith("vote:"))
async def vote_cb(c: CallbackQuery):
    await c.answer()
    await do_vote(c.message, c.from_user.id, int(c.data.split(":")[1]), c.bot)


@r.message(Command("mayor_start"))
async def mayor_start(m: Message):
    if not is_admin(m.from_user.id):
        return
    arg = (m.text or "").split()[1:]
    days = int(arg[0]) if arg and arg[0].isdigit() else MAYOR_DAYS
    await db.mayor_reset()
    await db.kv_set("mayor_winner", None)
    await db.kv_set("mayor_until", (dt.datetime.utcnow() + dt.timedelta(days=days)).replace(microsecond=0).isoformat())
    _mayor_dirty.set()
    await m.answer(f"🗳 Выборы запущены на {days} дн. (до {msk(await mayor_until())}). Заявки — «🗳 Выборы мэра» → «Стать кандидатом».\n"
                   f"Ссылка для роликов/канала: {bot_link('cand')}\nПродлить: /mayor_extend 2 · завершить сейчас: /mayor_end")


@r.message(Command("mayor_extend"))
async def mayor_extend(m: Message):
    if not is_admin(m.from_user.id):
        return
    u = await mayor_until()
    if not u:
        return await m.answer("Выборы не идут. Запуск: /mayor_start")
    arg = (m.text or "").split()[1:]
    u += dt.timedelta(days=int(arg[0]) if arg and arg[0].isdigit() else 1)
    await db.kv_set("mayor_until", u.isoformat())
    _mayor_dirty.set()
    await m.answer(f"Продлено до {msk(u)}")


@r.message(Command("mayor_end"))
async def mayor_end(m: Message):
    if not is_admin(m.from_user.id):
        return
    if not await mayor_until():
        return await m.answer("Выборы не идут.")
    await mayor_finish(m.bot)
    _mayor_dirty.set()
    await m.answer("Готово — итоги отправлены, сайт обновится через минуту.")


@r.message(Command("chatid"))
async def chat_id_cmd(m: Message):
    """В чате жителей: узнать его CHAT_ID для .env (только админ)."""
    if is_admin(m.from_user.id):
        await m.answer(f"CHAT_ID этого чата: <code>{m.chat.id}</code>")



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
    if me["nick"] in (await subscribers())["gone"]:
        await m.answer("Код верный, но ты отписался от TikTok 🏚 Подпишись снова — и клад будет твоим (код действует до конца дня).",
                       reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)]]))
        return
    if await db.ai_gift(uid):
        await m.answer("У тебя уже есть неиспользованный приз 💎 Открой город → «🎨 Мой дом» → «✨ По описанию» — там бесплатно.", reply_markup=city_keyboard(me["nick"], gift=True))
        return
    if await db.klad_today(day) >= KLAD_LIMIT:
        await m.answer("Сегодня все призы уже разобрали 😔 Завтра будет новый клад — приходи пораньше!")
        return
    try:
        await db.klad_add(uid, me["nick"], day)
    except RuntimeError:
        await m.answer("Ты уже забрал сегодняшний клад 😉 Завтра — новый.")
        return
    k = await db.klad_gift(uid)
    if k:
        await db.klad_use(k)
    await add_ai_gift(uid, me["nick"])
    await m.answer_photo(photo(cards.klad_card(me["nick"])), caption=(
        "<b>Клад твой!</b> 💎\n\nПриз — <b>дом по описанию бесплатно</b>: опиши любую идею, и нейросеть построит её в 3D ✨\n"
        "Нажми <b>«🏙 Открыть город»</b> внизу → <b>«🎨 Мой дом»</b> → <b>«✨ По описанию»</b>."),
        reply_markup=city_keyboard(me["nick"], gift=True))


async def add_ai_gift(uid, nick):
    oid = await db.ai_create(uid, nick, "")
    await db.ai_patch(oid, {"status": "gift"})
    return oid


@r.message(Command("giftai"))
async def giftai_cmd(m: Message, bot: Bot):
    """/giftai ник — подарить бесплатный дом по описанию."""
    if not is_admin(m.from_user.id):
        return
    nick = norm_nick((m.text or "").split(maxsplit=1)[1] if len((m.text or "").split()) > 1 else "")
    rows = await db.by_nick(nick) if nick else []
    if not rows:
        last = await db.payments_recent()
        buyers = "\n".join(f"• @{p['nick']} — {p['stars']} ⭐" for p in last) or "пока никого"
        await m.answer("Напиши так: <code>/giftai ник</code> (ник должен быть подтверждён в боте).\n\nПоследние покупки:\n" + buyers)
        return
    me = rows[0]
    if await db.ai_gift(me["tg_id"]):
        await m.answer(f"У @{nick} уже есть неиспользованный подарок.")
        return
    await add_ai_gift(me["tg_id"], nick)
    await m.answer(f"🎁 @{nick} получил бесплатный дом по описанию.")
    try:
        await bot.send_message(me["tg_id"], "🎁 <b>Подарок от мэрии!</b>\nТебе — бесплатный <b>дом по описанию</b>: опиши любую идею, и нейросеть построит её в 3D ✨\n\n"
                               "Открой город кнопкой «🏙 Открыть город» → «🎨 Мой дом» → «✨ По описанию».", reply_markup=city_keyboard(nick, gift=True))
    except Exception as e:
        await m.answer(f"Не смог написать ему: {e}")


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
    if me["nick"] in (await subscribers())["gone"]:
        await m.answer("Ты отписался от TikTok — дом заброшен 🏚 Подпишись снова, и после обновления города сможешь его менять.",
                       reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)]]))
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
        rec = decode_recipe(code)
        note = ""
        if rec.get("decor") and not await in_channel(bot, m.from_user.id):
            rec.pop("decor")
            code = encode_recipe(rec)
            note = "\n\n🎁 Декор (гирлянда, ёлка, машина, питомец) — бонус для подписчиков канала. Подпишись и сохрани дом ещё раз — декор появится."
        if PRICE == 0:
            await db.patch(me["id"], {"recipe": rec})
            kb = [[IB(text="📢 Канал города", url=CHANNEL_URL)]] if note and CHANNEL_URL else None
            await m.answer_photo(photo(cards.built_card(me["nick"], await house_no(me["nick"]), True)),
                                 caption="Готово! 🏠 Твой дом уже в городе — обнови страницу, чтобы увидеть." + note,
                                 reply_markup=InlineKeyboardMarkup(inline_keyboard=kb) if kb else city_keyboard(me["nick"]))
            return
        await bot.send_invoice(m.chat.id, title="Особый дом", description=f"Твой дом @{me['nick']} в городе станет таким, как ты собрал в конструкторе.",
                               payload=f"c|{me['id']}|{code}", currency="XTR", prices=[LabeledPrice(label="Особый дом", amount=PRICE)])
    elif data.get("t") == "ai":
        text = re.sub(r"\s+", " ", str(data.get("d") or "")).strip()[:300]
        if len(text) < 5:
            await m.answer("Опиши дом подробнее — хотя бы пару слов 🙂")
            return
        g = await db.ai_gift(m.from_user.id)
        if g:
            await db.ai_patch(g["id"], {"text": text, "status": "paid"})
            await m.answer("🎁 Подарок активирован! Нейросеть уже строит твой дом ✨ Это займёт несколько минут, потом его посмотрит мэрия — и пришлю результат сюда.")
            asyncio.create_task(build_ai(bot, g["id"]))
            return
        oid = await db.ai_create(m.from_user.id, me["nick"], text)
        await bot.send_invoice(m.chat.id, title="Дом по описанию ✨", description=f"Нейросеть построит дом @{me['nick']} по твоему описанию: «{text[:120]}». Перед тем как поставить, его проверит мэрия.",
                               payload=f"a|{oid}", currency="XTR", prices=[LabeledPrice(label="Дом по описанию", amount=AI_PRICE)])


async def in_channel(bot, uid, strict=False) -> bool:
    if not CHANNEL_ID:
        return True
    try:
        mem = await bot.get_chat_member(CHANNEL_ID, uid)
        return mem.status in ("member", "administrator", "creator", "restricted")
    except Exception as e:  # бот не админ в канале или неверный CHANNEL_ID — не мешаем людям
        log.warning("канал: %s", e)
        return not strict


@r.pre_checkout_query()
async def pre_checkout(q: PreCheckoutQuery):
    parts = q.invoice_payload.split("|")
    if parts[0] == "a":
        o = await db.ai_get(int(parts[1])) if len(parts) == 2 and parts[1].isdigit() else None
        ok = bool(o) and o["status"] == "new" and q.total_amount == AI_PRICE
    else:
        ok = len(parts) == 3 and parts[0] == "c" and decode_recipe(parts[2]) is not None and q.total_amount == PRICE
    await q.answer(ok=ok, error_message=None if ok else "Счёт устарел, оформи заново.")


@r.message(F.successful_payment)
async def paid(m: Message, bot: Bot):
    p = m.successful_payment
    if p.invoice_payload.startswith("a|"):
        oid = int(p.invoice_payload.split("|")[1])
        await db.ai_patch(oid, {"status": "paid", "charge_id": p.telegram_payment_charge_id})
        o = await db.ai_get(oid)
        try:
            await db.add_payment(m.from_user.id, o["nick"], p.total_amount, p.telegram_payment_charge_id, {"ai": o["text"]})
        except RuntimeError as e:
            log.warning("payment log: %s", e)
        await m.answer("Спасибо! ⭐ Нейросеть уже строит твой дом ✨\nЭто займёт несколько минут, потом его посмотрит мэрия — и пришлю результат сюда.")
        asyncio.create_task(build_ai(bot, oid))
        return
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


# ---------- дом по описанию: нейросеть на ПК → превью → мэрия одобряет ----------
_ai_lock = asyncio.Lock()


def ai_kb(oid):
    return InlineKeyboardMarkup(inline_keyboard=[[IB(text="✅ Поставить в город", callback_data=f"ai_ok:{oid}")],
                                                 [IB(text="🔄 Другой вариант", callback_data=f"ai_re:{oid}"), IB(text="❌ Вернуть звёзды", callback_data=f"ai_no:{oid}")]])


async def build_ai(bot, oid):
    async with _ai_lock:  # нейросеть одна — по очереди
        o = await db.ai_get(oid)
        if not o or o["status"] not in ("paid", "review"):
            return
        log.info("ИИ: собираю дом #%s (@%s) моделью %s…", oid, o["nick"], OLLAMA_MODEL)
        pm, last_edit, t0 = {}, [0.0], time.time()
        for a in ADMIN_IDS:
            try:
                pm[a] = await bot.send_message(a, f"⏳ Дом #{oid} (@{o['nick']}): начинаю сборку…")
            except Exception:
                pass

        async def prog(stage):
            if time.time() - last_edit[0] < 3:
                return
            last_edit[0] = time.time()
            for a, msg in pm.items():
                try:
                    await msg.edit_text(f"⏳ Дом #{oid} (@{o['nick']}): {stage} · {int(time.time() - t0)} с")
                except Exception:
                    pass

        try:
            rec = await ai.generate(o["text"], OLLAMA_URL, OLLAMA_MODEL, progress=prog)
            log.info("ИИ: дом #%s собран, деталей: %s — рисую превью", oid, len(rec["parts"]))
            last_edit[0] = 0
            await prog(f"собран ({len(rec['parts'])} деталей), рисую превью…")
            png = await ai.preview(rec, SITE_BASE)
        except Exception as e:
            log.warning("ai %s: %s", oid, e)
            for msg in pm.values():
                try:
                    await msg.delete()
                except Exception:
                    pass
            for a in ADMIN_IDS:
                try:
                    await bot.send_message(a, f"⚠️ Дом по описанию #{oid} (@{o['nick']}) не собрался: {e}\nОписание: «{o['text']}»",
                                           reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🔄 Попробовать снова", callback_data=f"ai_re:{oid}"),
                                                                                               IB(text="❌ Вернуть звёзды", callback_data=f"ai_no:{oid}")]]))
                except Exception:
                    pass
            return
        await db.ai_patch(oid, {"status": "review", "recipe": rec})
        for msg in pm.values():
            try:
                await msg.delete()
            except Exception:
                pass
        for a in ADMIN_IDS:
            try:
                await bot.send_photo(a, photo(png, "house.png"), reply_markup=ai_kb(oid), caption=(
                    f"✨ <b>Дом по описанию #{oid}</b> · @{o['nick']}\n«{o['text']}»\n\nНейросеть: <b>{rec['name']}</b> · деталей: {len(rec['parts'])}"))
            except Exception as e:
                log.warning("ai notify: %s", e)


@r.message(Command("ai"))
async def ai_cmd(m: Message, bot: Bot):
    """/ai — показать заказы «дом по описанию» с кнопками (если кнопки потерялись)."""
    if not is_admin(m.from_user.id):
        return
    rows = [o for st in ("paid", "review") for o in await db.ai_list(st)]
    if not rows:
        await m.answer("Активных заказов «дом по описанию» нет.")
        return
    for o in rows:
        await m.answer(f"✨ <b>Заказ #{o['id']}</b> · @{o['nick']} · {o['status']}\n«{o['text'][:200]}»",
                       reply_markup=ai_kb(o["id"]))


@r.callback_query(F.data.startswith("ai_"))
async def ai_decide(c: CallbackQuery, bot: Bot):
    if not is_admin(c.from_user.id):
        await c.answer()
        return
    act, oid = c.data.split(":")
    o = await db.ai_get(int(oid))
    if not o or o["status"] in ("done", "refunded"):
        await c.answer("Уже обработан", show_alert=True)
        return
    note = lambda t: c.message.edit_caption(caption=(c.message.caption or "") + "\n\n" + t) if c.message.photo else c.message.edit_text((c.message.text or "") + "\n\n" + t)
    if act == "ai_re":
        await c.answer("Собираю новый вариант…")
        await db.ai_patch(o["id"], {"status": "paid"})
        await note("🔄 Пересобираю…")
        asyncio.create_task(build_ai(bot, o["id"]))
    elif act == "ai_no" and not o.get("charge_id"):  # был подарок — возвращаем подарок
        await db.ai_patch(o["id"], {"status": "gift"})
        await c.answer("Подарок возвращён")
        await note("❌ Не подошло — подарок вернули, можно описать заново")
        try:
            await bot.send_message(o["tg_id"], "Этот вариант не получился 😕 Подарок остаётся у тебя — опиши дом иначе: «🎨 Мой дом» → «✨ По описанию».")
        except Exception:
            pass
        return
    elif act == "ai_no":
        try:
            await bot.refund_star_payment(o["tg_id"], o["charge_id"])
        except Exception as e:
            await c.answer(f"Не вернулись: {e}", show_alert=True)
            return
        await db.ai_patch(o["id"], {"status": "refunded"})
        await c.answer("Звёзды вернули")
        await note("❌ Звёзды возвращены")
        try:
            await bot.send_message(o["tg_id"], "Не получилось построить дом по твоему описанию 😕 Звёзды вернули. Попробуй описать иначе!")
        except Exception:
            pass
    elif act == "ai_ok" and o.get("recipe"):
        me = await db.linked(o["tg_id"])
        if not me:
            await c.answer("Ник больше не привязан", show_alert=True)
            return
        await db.patch(me["id"], {"recipe": o["recipe"]})
        await db.ai_patch(o["id"], {"status": "done"})
        await c.answer("Поставлен!")
        await note("✅ Стоит в городе")
        try:
            png = await ai.preview(o["recipe"], SITE_BASE)
            await bot.send_photo(o["tg_id"], photo(png, "house.png"), reply_markup=city_keyboard(me["nick"]), caption=(
                f"✨ Твой дом «{o['recipe'].get('name', 'по описанию')}» готов и уже стоит в городе! Открой город и найди @{me['nick']} 🏙"))
        except Exception as e:
            log.warning("ai send: %s", e)


async def ai_resume(bot):
    """При старте: сразу загрузить модель и достроить оплаченные дома."""
    await asyncio.sleep(5)
    await ai.warmup(OLLAMA_URL, OLLAMA_MODEL, log)
    for o in await db.ai_list("paid"):
        asyncio.create_task(build_ai(bot, o["id"]))


# ---------- админ: одна панель ----------
def is_admin(uid):
    return uid in ADMIN_IDS


def application_text(row):
    return (f"📥 <b>Заявка (ручная проверка)</b>\n\nНик: <b>@{row['nick']}</b>\nКод: <code>ДОМ-{row['code']}</code>\n"
            f"Telegram id: <code>{row['tg_id']}</code>\n\n"
            f"Проверь, что у <a href='https://www.tiktok.com/@{row['nick']}'>@{row['nick']}</a> этот код в описании профиля или в комментариях «Почты города».")


def application_kb(row, standalone=False):
    kb = [[IB(text="✅ Одобрить", callback_data=f"ap:{row['id']}:{int(standalone)}")],
          [IB(text="❌ Не подписан", callback_data=f"rjsub:{row['id']}:{int(standalone)}"), IB(text="❌ Нет кода", callback_data=f"rjcode:{row['id']}:{int(standalone)}")],
          [IB(text="🎵 Профиль TikTok", url=f"https://www.tiktok.com/@{row['nick']}")]]
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
           f"Жителей в городе: <b>{len(s['set'])}</b> · отписались: <b>{len(s['gone'])}</b>\nПродаж: <b>{sales}</b> · заработано <b>{stars} ⭐</b>\n\n"
           f"🔄 Подписчики из TikTok: {SYNC['msg']}" + (f" ({SYNC['at']})" if SYNC['at'] else ""))
    rows = [[IB(text=f"📥 Заявки ({pend})", callback_data="adm:apps")]]
    if TIKTOK_SESSIONID and GITHUB_TOKEN:
        rows.append([IB(text="👥 Обновить подписчиков сейчас", callback_data="adm:sync")])
    rows.append([IB(text="🔄 Обновить панель", callback_data="adm:home")])
    kb = InlineKeyboardMarkup(inline_keyboard=rows)
    return cards.admin_card(pend, special, len(s["set"])), cap, kb


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
    elif c.data == "adm:sync":
        await c.message.edit_caption(caption="👥 Собираю подписчиков из TikTok… это 1–3 минуты")
        try:
            total, new, gone, back = await sync_subscribers_once()
            SYNC.update(at=time.strftime("%d.%m %H:%M"), msg=f"✅ {total} подписчиков · +{new} новых · {gone} отписались")
        except Exception as e:
            SYNC.update(at=time.strftime("%d.%m %H:%M"), msg=f"❌ {e}")
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


# ---------- рефералы ----------
async def ref_text(uid):
    me = await bot_username()
    n = await db.ref_count(uid)
    left = REF_GOAL - n % REF_GOAL
    link = f"https://t.me/{me}?start=ref{uid}"
    return link, n, (f"👥 <b>Пригласи друзей в город</b>\n\n"
                     f"Твоя ссылка:\n<code>{link}</code>\n\n"
                     f"Друг считается, когда <b>подпишется на TikTok и получит дом</b> через бота.\n"
                     f"🎁 За каждых <b>{REF_GOAL}</b> друзей — <b>дом по описанию бесплатно</b> (нейросеть построит любую идею).\n"
                     f"🎁 Другу — тоже бонус: <b>+1 к его счёту</b>, ему останется пригласить на одного меньше.\n\n"
                     f"Приглашено: <b>{n}</b> · до подарка: <b>{left}</b>")


_me = {}
_bot = None


async def bot_username():
    if "u" not in _me:
        _me["u"] = (await _bot.get_me()).username
    return _me["u"]


@r.callback_query(F.data == "ref")
async def ref_cb(c: CallbackQuery):
    await c.answer()
    link, n, text = await ref_text(c.from_user.id)
    share = "https://t.me/share/url?url=" + quote(link) + "&text=" + quote("🏙 Залетай в Город подписчиков — у каждого свой дом с ником в 3D-городе!")
    await c.message.answer(text, reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="📤 Отправить друзьям", url=share)]]))


async def ref_reward(bot, invitee_id):
    """Друг получил дом: +1 пригласившему (и стартовый +1 самому другу). Каждые REF_GOAL — подарок."""
    by = await db.ref_reward(invitee_id)
    if not by:
        return
    for uid, who in ((by, "пригласившему"), (invitee_id, "другу")):
        n = await db.ref_count(uid)
        me = await db.linked(uid)
        try:
            if n and n % REF_GOAL == 0 and me:
                await add_ai_gift(uid, me["nick"])
                await bot.send_message(uid, f"🎉 У тебя уже {n} приглашённых! Держи подарок: <b>дом по описанию бесплатно</b> ✨\nОткрой город → «🎨 Мой дом» → «✨ По описанию».",
                                       reply_markup=city_keyboard(me["nick"], gift=True))
            elif uid == by:
                await bot.send_message(uid, f"👥 Твой друг заселился в город! Приглашено: <b>{n}</b>, до подарка: <b>{REF_GOAL - n % REF_GOAL}</b>.")
        except Exception:
            pass


async def approve_row(bot, row) -> bool:
    try:
        await db.patch(row["id"], {"status": "approved", "approved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    except RuntimeError:
        return False
    try:
        await ref_reward(bot, row["tg_id"])
    except Exception as e:
        log.warning("ref: %s", e)
    try:
        await bot.send_photo(row["tg_id"], photo(cards.built_card(row["nick"], await house_no(row["nick"]), False)), caption=(
            f"Готово! Ник <b>@{row['nick']}</b> подтверждён 🎉\n\nТеперь открой город кнопкой «🏙 Открыть город» → «🎨 Мой дом» и выбери, каким будет твой дом. Код из описания профиля можно удалить."),
            reply_markup=city_keyboard(row["nick"]))
    except Exception as e:
        log.warning("notify user: %s", e)
    return True


@r.callback_query(F.data.startswith("ap:") | F.data.startswith("rj"))
async def decide(c: CallbackQuery, bot: Bot):
    if not is_admin(c.from_user.id):
        await c.answer()
        return
    act, rid, standalone = c.data.split(":")
    row = await db.get(int(rid))
    if not row or row["status"] != "pending":
        await c.answer("Уже обработана", show_alert=True)
    elif act == "ap":
        if not await approve_row(bot, row):
            await c.answer("У этого ника уже есть владелец", show_alert=True)
            return
        await c.answer("Одобрено")
    else:
        await db.patch(row["id"], {"status": "rejected"})
        await c.answer("Отклонено")
        reason = act[2:] if len(act) > 2 else "code"
        text = (f"Заявка на <b>@{row['nick']}</b> отклонена: ты не подписан на TikTok 😕\nПодпишись — через 2 часа нажми «🏠 Мой дом» снова."
                if reason == "sub" else
                f"Заявка на <b>@{row['nick']}</b> отклонена: не нашли код ДОМ-{row['code']} 😕 Нажми «🏠 Мой дом» и попробуй ещё раз.")
        try:
            await bot.send_message(row["tg_id"], text, reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🎵 Подписаться", url=TIKTOK_URL)], [IB(text="🏠 Мой дом", callback_data="home")]]))
        except Exception:
            pass
    if standalone == "1":
        await c.message.edit_reply_markup(reply_markup=None)
        act = "ap" if act == "ap" else "rj"
        await c.message.edit_text(c.message.html_text + ("\n\n✅ Одобрено" if act == "ap" else "\n\n❌ Отклонено"))
    else:
        c.data = "adm:apps"
        await admin_nav(c)


@r.message(Command("update"))
async def update_cmd(m: Message):
    if not is_admin(m.from_user.id):
        return
    await m.answer("♻️ Перезапускаюсь и скачиваю свежую версию бота… вернусь через 1–2 минуты.")
    await asyncio.sleep(1)
    os._exit(0)


async def restart_later():
    """Раз в RESTART_HOURS бот выходит — start_windows.bat скачивает обновление и запускает снова."""
    if RESTART_HOURS > 0:
        await asyncio.sleep(RESTART_HOURS * 3600)
        log.info("плановый перезапуск для обновления")
        os._exit(0)


async def main():
    missing = [k for k, v in {"BOT_TOKEN": BOT_TOKEN, "SITE_URL": SITE_URL.strip("/"), "ADMIN_IDS": ADMIN_IDS}.items() if not v]
    if missing:
        raise SystemExit("Заполни в .env: " + ", ".join(missing))
    global _bot
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
    _bot = bot
    dp = Dispatcher()
    dp.include_router(r)

    @dp.errors()
    async def quiet_errors(event):  # старые нажатия кнопок, пока бот был выключен, и «сообщение не изменилось» — не ошибки
        if "query is too old" in str(event.exception) or "message is not modified" in str(event.exception):
            return True
        log.error("ошибка: %s", event.exception)
        return True
    await bot.set_my_commands([BotCommand(command="start", description="Главное меню"), BotCommand(command="home", description="Мой дом")])
    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Город", web_app=WebAppInfo(url=SITE_URL)))
    log.info("Бот запущен · база: %s", "Supabase" if isinstance(db, DB) else "локальный файл gorod.db")
    global _bot_username
    _bot_username = (await bot.get_me()).username
    asyncio.create_task(export_loop())
    asyncio.create_task(mayor_loop(bot))
    asyncio.create_task(sync_loop(bot))
    asyncio.create_task(ai_resume(bot))
    asyncio.create_task(restart_later())
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
