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
KLAD_LIMIT = int(E("KLAD_LIMIT", "5"))
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
    ("Дом-Бургер", {"shape": "custom", "name": "Дом-Бургер", "lights": "warm", "parts": [{"t": "cyl", "p": [0, 0, 0], "s": [0.86, 0.16, 0.86], "c": "#e0a052", "g": 0.0, "r": 0.0, "w": False}, {"t": "box", "p": [0, 0.02, 0.42], "s": [0.14, 0.14, 0.02], "c": "#6b3a1a", "g": 0.0, "r": 0.0, "w": False}, {"t": "cyl", "p": [0, 0.16, 0], "s": [0.9, 0.04, 0.9], "c": "#5aa832", "g": 0.1, "r": 0.0, "w": False}, {"t": "cyl", "p": [0, 0.2, 0], "s": [0.84, 0.12, 0.84], "c": "#6b3a22", "g": 0.05, "r": 0.0, "w": True}, {"t": "box", "p": [0, 0.32, 0], "s": [0.92, 0.025, 0.92], "c": "#ffd23f", "g": 0.2, "r": 45, "w": False}, {"t": "cyl", "p": [0, 0.345, 0], "s": [0.8, 0.05, 0.8], "c": "#e8343a", "g": 0.1, "r": 0.0, "w": False}, {"t": "dome", "p": [0, 0.395, 0], "s": [0.88, 0.4, 0.88], "c": "#e9a64f", "g": 0.05, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.12, 0.77, 0.0], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.147, 0.741, 0.135], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.024, 0.694, -0.279], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.219, 0.615, 0.286], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.118, 0.77, -0.021], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.169, 0.741, -0.107], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.073, 0.694, 0.27], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.166, 0.615, -0.32], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.113, 0.77, 0.041], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.185, 0.741, 0.076], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.119, 0.694, -0.254], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.108, 0.615, 0.344], "s": [0.04, 0.02, 0.025], "c": "#fff6dc", "g": 0.2, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.2, 0.5, 0.37], "s": [0.1, 0.1, 0.03], "c": "#ffe08a", "g": 0.9, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.2, 0.5, 0.37], "s": [0.1, 0.1, 0.03], "c": "#ffe08a", "g": 0.9, "r": 0.0, "w": False}]}),
    ("Дом-Ёлочная игрушка", {"shape": "custom", "name": "Дом-Ёлочная игрушка", "lights": "warm", "parts": [{"t": "cyl", "p": [0, 0, 0], "s": [0.5, 0.05, 0.5], "c": "#2a2f3a", "g": 0.0, "r": 0.0, "w": False}, {"t": "cone", "p": [-0.38, 0.02, 0.3], "s": [0.2, 0.26, 0.2], "c": "#1f7a4a", "g": 0.1, "r": 0.0, "w": False}, {"t": "cone", "p": [0.38, 0.02, 0.3], "s": [0.2, 0.26, 0.2], "c": "#1f7a4a", "g": 0.1, "r": 0.0, "w": False}, {"t": "cone", "p": [-0.36, 0.02, -0.32], "s": [0.2, 0.26, 0.2], "c": "#1f7a4a", "g": 0.1, "r": 0.0, "w": False}, {"t": "cone", "p": [0.36, 0.02, -0.34], "s": [0.2, 0.26, 0.2], "c": "#1f7a4a", "g": 0.1, "r": 0.0, "w": False}, {"t": "sphere", "p": [0, 0.05, 0], "s": [0.8, 0.8, 0.8], "c": "#d81f2a", "g": 0.25, "r": 0.0, "w": False}, {"t": "torus", "p": [0, 0.3, 0], "s": [0.71, 0.03, 0.71], "c": "#ffd23f", "g": 0.8, "r": 0.0, "w": False}, {"t": "torus", "p": [0, 0.5, 0], "s": [0.77, 0.03, 0.77], "c": "#ffd23f", "g": 0.8, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.18, 0.42, 0.33], "s": [0.11, 0.11, 0.03], "c": "#ffe08a", "g": 0.9, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.18, 0.42, 0.33], "s": [0.11, 0.11, 0.03], "c": "#ffe08a", "g": 0.9, "r": 0.0, "w": False}, {"t": "box", "p": [0, 0.07, 0.38], "s": [0.12, 0.16, 0.03], "c": "#5a1010", "g": 0.0, "r": 0.0, "w": False}, {"t": "cyl", "p": [0, 0.83, 0], "s": [0.16, 0.1, 0.16], "c": "#e0b040", "g": 0.4, "r": 0.0, "w": False}, {"t": "torus", "p": [0, 0.96, 0], "s": [0.1, 0.02, 0.1], "c": "#e0b040", "g": 0.4, "r": 90, "w": False}, {"t": "sphere", "p": [0.4, 0.45, 0.0], "s": [0.04, 0.04, 0.04], "c": "#ffffff", "g": 1, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.2, 0.485, 0.346], "s": [0.04, 0.04, 0.04], "c": "#ffffff", "g": 1, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.2, 0.415, 0.346], "s": [0.04, 0.04, 0.04], "c": "#ffffff", "g": 1, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.4, 0.45, 0.0], "s": [0.04, 0.04, 0.04], "c": "#ffffff", "g": 1, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.2, 0.485, -0.346], "s": [0.04, 0.04, 0.04], "c": "#ffffff", "g": 1, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.2, 0.415, -0.346], "s": [0.04, 0.04, 0.04], "c": "#ffffff", "g": 1, "r": 0.0, "w": False}]}),
    ("Дом-Коробка", {"shape": "custom", "name": "Дом-Коробка", "lights": "warm", "parts": [{"t": "box", "p": [0, 0, 0], "s": [0.74, 0.56, 0.6], "c": "#c8955a", "g": 0.0, "r": 0.0, "w": True}, {"t": "box", "p": [0, 0.275, 0.301], "s": [0.74, 0.05, 0.005], "c": "#b07a40", "g": 0.0, "r": 0.0, "w": False}, {"t": "box", "p": [0, 0, 0.301], "s": [0.1, 0.56, 0.006], "c": "#e8d9b8", "g": 0.1, "r": 0.0, "w": False}, {"t": "box", "p": [0, 0.56, 0], "s": [0.1, 0.006, 0.6], "c": "#e8d9b8", "g": 0.1, "r": 0.0, "w": False}, {"t": "box", "p": [-0.414, 0.56, 0], "s": [0.05, 0.24, 0.58], "c": "#b8854c", "g": 0.0, "r": 0.0, "w": False}, {"t": "box", "p": [0.414, 0.56, 0], "s": [0.05, 0.24, 0.58], "c": "#b8854c", "g": 0.0, "r": 0.0, "w": False}, {"t": "box", "p": [0.2, 0.38, 0.304], "s": [0.2, 0.08, 0.004], "c": "#e8343a", "g": 0.2, "r": 0.0, "w": False}, {"t": "box", "p": [-0.2, 0.12, 0.304], "s": [0.14, 0.14, 0.004], "c": "#1a1a1a", "g": 0.0, "r": 0.0, "w": False}, {"t": "box", "p": [-0.2, 0.02, 0.31], "s": [0.12, 0.2, 0.01], "c": "#6b3a1a", "g": 0.0, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.25, 0.6, 0.1], "s": [0.14, 0.12, 0.14], "c": "#f4f4ff", "g": 0.3, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.1, 0.6, -0.1], "s": [0.12, 0.1, 0.12], "c": "#f4f4ff", "g": 0.3, "r": 0.0, "w": False}]}),
    ("Дом-Мусорка", {"shape": "custom", "name": "Дом-Мусорка", "lights": "cool", "parts": [{"t": "cyl", "p": [0, 0, 0], "s": [0.66, 0.62, 0.66], "c": "#2f8a4a", "g": 0.05, "r": 0.0, "w": True}, {"t": "torus", "p": [0, 0.2, 0], "s": [0.67, 0.02, 0.67], "c": "#226b38", "g": 0.0, "r": 0.0, "w": False}, {"t": "torus", "p": [0, 0.45, 0], "s": [0.67, 0.02, 0.67], "c": "#226b38", "g": 0.0, "r": 0.0, "w": False}, {"t": "cyl", "p": [0.03, 0.62, -0.03], "s": [0.72, 0.06, 0.72], "c": "#1f5c30", "g": 0.0, "r": 8, "w": False}, {"t": "box", "p": [0, 0.69, 0], "s": [0.2, 0.04, 0.05], "c": "#174a26", "g": 0.0, "r": 0.0, "w": False}, {"t": "torus", "p": [0, 0.34, 0.34], "s": [0.16, 0.02, 0.16], "c": "#a6ff8f", "g": 0.9, "r": 0, "w": False}, {"t": "box", "p": [0, 0.02, 0.33], "s": [0.12, 0.16, 0.02], "c": "#123d20", "g": 0.0, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.42, 0.0, 0.3], "s": [0.16, 0.176, 0.16], "c": "#1a1a22", "g": 0.05, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.42, 0.0, 0.32], "s": [0.14, 0.154, 0.14], "c": "#1a1a22", "g": 0.05, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.38, 0.0, -0.36], "s": [0.13, 0.143, 0.13], "c": "#1a1a22", "g": 0.05, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.2, 0.85, 0.3], "s": [0.025, 0.02, 0.025], "c": "#111111", "g": 0.0, "r": 0.0, "w": False}, {"t": "sphere", "p": [0.22, 0.85, 0.1], "s": [0.025, 0.02, 0.025], "c": "#111111", "g": 0.0, "r": 0.0, "w": False}, {"t": "sphere", "p": [-0.12, 0.66, 0.25], "s": [0.12, 0.05, 0.1], "c": "#c8955a", "g": 0.0, "r": 0.0, "w": False}]}),
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

    async def klad_winners(self, day):
        rows = await self.q("GET", f"klad?day=eq.{day}&select=nick&order=id.asc")
        return [r["nick"] for r in rows or []]

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


# ---------- взаимодействие с домом: табличка, подсветка, стуки, украшения за ⭐ ----------
FX_ITEMS = {
    "fireworks": ("🎆 Салют над домом", 15), "snowman": ("⛄ Снеговик во дворе", 10), "xmas": ("🎄 Новогодняя ёлка", 10),
    "ufo": ("🛸 НЛО над домом", 20), "rainbow": ("🌈 Радужная подсветка", 15), "top": ("🔦 Дом дня на 24 часа", 25),
    "estate": ("🏡 Усадьба — участок как 4 дома", 100),
    "balloons": ("🎈 Воздушные шары", 10), "cat": ("🐱 Кот на крыше", 10), "flag": ("🚩 Флаг на крыше", 10),
    "lanterns": ("🏮 Фонарики", 10), "pool": ("🏊 Бассейн во дворе", 15), "crystal": ("💎 Парящий кристалл", 15),
    "rocket": ("🚀 Ракета у дома", 15), "halo": ("✨ Сияющий нимб", 15), "ghost": ("👻 Призрак-сосед", 10), "flowers": ("🌷 Клумба", 10),
    "wish": ("🪙 Монетка в фонтан желаний", 5),
}
PARK_AT = int(E("PARK_AT", "2500"))
SPIN_COLORS = ["#ff3d7f", "#ffd23f", "#5ef2ff", "#a6ff8f", "#c084fc", "#ff7a1a"]


async def park_open():
    return len((await subscribers())["set"]) >= PARK_AT


async def do_spin(m, uid):
    """🎡 Колесо удачи в Неоновом парке: раз в день бесплатно."""
    me = await db.linked(uid)
    if not me:
        await m.answer("Сначала привяжи ник — «🏠 Мой дом» 🎡", reply_markup=main_menu())
        return
    if not await park_open():
        await m.answer(f"🎡 Колесо удачи заработает, когда откроется Неоновый парк — на {PARK_AT} подписчиков! Зови друзей 👥", reply_markup=city_keyboard(me["nick"]))
        return
    day = msk_day()
    if await db.kv_get(f"spin:{day}:{uid}"):
        await m.answer("Ты сегодня уже крутил колесо 🎡 Приходи завтра!", reply_markup=city_keyboard(me["nick"]))
        return
    await db.kv_set(f"spin:{day}:{uid}", 1)
    fx = await fx_get(me["nick"])
    r = random.random()
    deco = [k for k in DECOR_ITEMS if k not in fx.get("d", [])]
    if r < .03:
        await add_ai_gift(uid, me["nick"])
        prize = "🎁 ДЖЕКПОТ! Бесплатный дом по описанию — открой город → «🎨 Мой дом» → «✨ По описанию»"
    elif r < .08 and not fx.get("tt"):
        fx["tt"] = "🍀 Счастливчик"
        prize = "🏅 Редкий титул «🍀 Счастливчик» — над твоим домом!"
    elif r < .22:
        fx["top"] = max(int(fx.get("top", 0)), int(time.time())) + 24 * 3600
        prize = "🔦 «Дом дня» на 24 часа — прожектор и место на доске почёта"
    elif r < .32 or not deco:
        fx["c"] = random.choice(SPIN_COLORS)
        prize = "💡 Новая цветная подсветка дома"
    else:
        item = random.choice(deco)
        fx["d"] = sorted(set(fx.get("d", [])) | {item})
        prize = FX_ITEMS[item][0]
    await fx_set(me["nick"], fx)
    await m.answer(f"🎡 Колесо крутится… и выпадает:\n\n<b>{prize}</b>!\n\nНа сайте через пару минут. Завтра можно крутить снова 🍀", reply_markup=city_keyboard(me["nick"]))


# ======== 🪙 Неонки (городская валюта) ========
COIN_RATE = 5  # 1 ⭐ = 5 неонок по цене украшений
COIN_NO = {"estate", "wish"}  # только за звёзды


def coin_price(item):
    return FX_ITEMS[item][1] * COIN_RATE


r = Router()


async def coins_add(nick, n):
    fx = await fx_get(nick)
    fx["co"] = max(0, int(fx.get("co", 0)) + n)
    await fx_set(nick, fx)
    return fx["co"]


@r.callback_query(F.data == "daily")
async def daily_cb(c: CallbackQuery):
    await c.answer()
    me = await db.linked(c.from_user.id)
    if not me:
        await c.message.answer("Сначала привяжи ник — «🏠 Мой дом» 🪙", reply_markup=main_menu())
        return
    day = msk_day()
    last = await db.kv_get(f"daily:{c.from_user.id}")
    if last == day:
        fx = await fx_get(me["nick"])
        await c.message.answer(f"Сегодня бонус уже забран 😉 У тебя 🪙 {fx.get('co', 0)} неонок. Приходи завтра!", reply_markup=main_menu())
        return
    yest = (dt.datetime.strptime(day, "%Y-%m-%d") - dt.timedelta(days=1)).strftime("%Y-%m-%d")
    streak = int(await db.kv_get(f"dstreak:{c.from_user.id}") or 0) + 1 if last == yest else 1
    await db.kv_set(f"daily:{c.from_user.id}", day)
    await db.kv_set(f"dstreak:{c.from_user.id}", streak)
    gain = 10 + min(streak - 1, 6) * 2
    total = await coins_add(me["nick"], gain)
    await c.message.answer(f"🪙 +{gain} неонок! Серия: {streak} дн. подряд (каждый день подряд — больше).\nНа счету: <b>🪙 {total}</b>\n\nТрать в городе: нажми на свой дом → «⭐ Украсить» → кнопки с 🪙.",
                           reply_markup=city_keyboard(me["nick"]))


# ======== 🏛 Дума: идеи жителей и голосование ========
async def duma_get():
    try:
        return json.loads(await db.kv_get("duma") or "[]")
    except ValueError:
        return []


@r.callback_query(F.data == "duma")
async def duma_cb(c: CallbackQuery):
    await c.answer()
    ideas = sorted(await duma_get(), key=lambda x: x.get("up", 0) - x.get("down", 0), reverse=True)[:8]
    txt = "\n".join(f"{i + 1}. {x['text']} — 👍 {x.get('up', 0)} 👎 {x.get('down', 0)}" for i, x in enumerate(ideas)) or "Пока пусто — предложи первую идею кнопкой «💡 Идея для города»!"
    await c.message.answer(f"🏛 <b>Городская дума</b>\n\nИдеи жителей. Голосуй в городе: кнопка «🏛 ДУМА» сверху. Идеи с лучшим счётом мэрия делает первыми!\n\n{txt}",
                           reply_markup=main_menu())


@r.callback_query(F.data.startswith("dumaok:"))
async def duma_ok(c: CallbackQuery):
    if not is_admin(c.from_user.id):
        return
    await c.answer("Добавлено в думу ✅")
    i = int(c.data.split(":")[1])
    rep_ = json.loads(await db.kv_get("reports") or "[]")
    if not 0 <= i < len(rep_):
        return
    ideas = await duma_get()
    nid = max([x["id"] for x in ideas] + [0]) + 1
    ideas.append({"id": nid, "text": rep_[i]["text"][:200], "nick": rep_[i].get("nick", ""), "up": 0, "down": 0})
    await db.kv_set("duma", json.dumps(ideas, ensure_ascii=False))
    _fx_dirty.set()
    await c.message.edit_reply_markup(reply_markup=None)


@r.message(Command("duma_add", "duma_del"))
async def duma_admin(m: Message):
    """/duma_add текст — добавить идею в думу; /duma_del N — убрать."""
    if not is_admin(m.from_user.id):
        return
    parts = (m.text or "").split(maxsplit=1)
    ideas = await duma_get()
    if parts[0].startswith("/duma_del"):
        n = int(parts[1]) if len(parts) > 1 and parts[1].strip().isdigit() else -1
        ideas = [x for x in ideas if x["id"] != n]
        await m.answer(f"Идея #{n} убрана.")
    else:
        if len(parts) < 2:
            await m.answer("<code>/duma_add текст идеи</code>")
            return
        nid = max([x["id"] for x in ideas] + [0]) + 1
        ideas.append({"id": nid, "text": parts[1][:200], "nick": "мэрия", "up": 0, "down": 0})
        await m.answer(f"🏛 Идея #{nid} в думе.")
    await db.kv_set("duma", json.dumps(ideas, ensure_ascii=False))
    _fx_dirty.set()


# ======== 🏆 Конкурс «Самый красивый дом» ========
@r.message(Command("contest_start", "contest_end"))
async def contest_admin(m: Message, bot: Bot):
    if not is_admin(m.from_user.id):
        return
    if m.text.startswith("/contest_start"):
        arg = (m.text or "").split()[1:]
        days = int(arg[0]) if arg and arg[0].isdigit() else 3
        until = int(time.time()) + days * 86400
        await db.kv_set("contest_until", until)
        for k, v in await db.kv_prefix("cvu:"):
            await db.kv_set(k, None)
        for k, v in await db.kv_prefix("fx:"):
            fx = json.loads(v)
            if fx.pop("cv", None) is not None:
                await db.kv_set(k, json.dumps(fx, ensure_ascii=False))
        _fx_dirty.set()
        await m.answer(f"🏆 Конкурс «Самый красивый дом» запущен на {days} дн. На сайте появилась кнопка «🏆 ГОЛОС» в карточке дома. Итоги: /contest_end")
        return
    rows = []
    for k, v in await db.kv_prefix("fx:"):
        fx = json.loads(v)
        if fx.get("cv"):
            rows.append((fx["cv"], k[3:]))
    rows.sort(reverse=True)
    prizes = [("🏆 Самый красивый дом", 7), ("🥈 Красивый дом", 2), ("🥉 Красивый дом", 1)]
    for (cnt, nick), (title, days) in zip(rows, prizes):
        fx = await fx_get(nick)
        fx["tt"] = title
        fx["top"] = max(int(fx.get("top", 0)), int(time.time())) + days * 86400
        await fx_set(nick, fx)
        owners = await db.by_nick(nick)
        if owners and owners[0].get("tg_id"):
            try:
                await bot.send_message(owners[0]["tg_id"], f"{title}! 🎉 Твой дом победил в конкурсе ({cnt} голосов): титул над домом и «Дом дня» на {days} дн.")
            except Exception:
                pass
    await db.kv_set("contest_until", None)
    _fx_dirty.set()
    await m.answer("🏆 Итоги конкурса:\n" + ("\n".join(f"{i + 1}. @{n} — {c}" for i, (c, n) in enumerate(rows[:10])) or "голосов не было"))


async def social_action(m, bot, me, data):
    t, uid = data.get("t"), m.from_user.id
    kb = city_keyboard(me["nick"])

    async def notify(nick, text):
        ow = await db.by_nick(nick)
        if ow and ow[0].get("tg_id"):
            try:
                await bot.send_message(ow[0]["tg_id"], text, reply_markup=city_keyboard(nick))
            except Exception:
                pass

    if t == "cvote":
        target = norm_nick(str(data.get("n") or ""))
        if int(await db.kv_get("contest_until") or 0) < time.time():
            await m.answer("Конкурс сейчас не идёт 🏆", reply_markup=kb)
            return
        if not target or target == me["nick"] or target not in (await subscribers())["set"]:
            await m.answer("За свой дом голосовать нельзя 🙂", reply_markup=kb)
            return
        if await db.kv_get(f"cvu:{uid}"):
            await m.answer("Ты уже проголосовал в этом конкурсе 🏆", reply_markup=kb)
            return
        await db.kv_set(f"cvu:{uid}", target)
        fx = await fx_get(target)
        fx["cv"] = int(fx.get("cv", 0)) + 1
        await fx_set(target, fx)
        await coins_add(me["nick"], 3)
        await m.answer(f"🏆 Голос за дом @{target} принят! Тебе 🪙 +3.", reply_markup=kb)
    elif t == "ivote":
        iid, v = int(data.get("i", -1)), 1 if int(data.get("v", 1)) > 0 else -1
        ideas = await duma_get()
        idea = next((x for x in ideas if x["id"] == iid), None)
        if not idea:
            return
        if await db.kv_get(f"iv:{iid}:{uid}"):
            await m.answer("Ты уже голосовал за эту идею 🏛", reply_markup=kb)
            return
        await db.kv_set(f"iv:{iid}:{uid}", v)
        idea["up" if v > 0 else "down"] = int(idea.get("up" if v > 0 else "down", 0)) + 1
        await db.kv_set("duma", json.dumps(ideas, ensure_ascii=False))
        _fx_dirty.set()
        await coins_add(me["nick"], 1)
        await m.answer(f"🏛 Голос учтён: «{idea['text'][:60]}» {'👍' if v > 0 else '👎'}. Тебе 🪙 +1.", reply_markup=kb)
    elif t == "friend":
        target = norm_nick(str(data.get("n") or ""))
        if not target or target == me["nick"]:
            return
        mine = await fx_get(me["nick"])
        if target in mine.get("f", []):
            await m.answer(f"Вы с @{target} уже друзья 👫", reply_markup=kb)
            return
        ow = await db.by_nick(target)
        if not ow or not ow[0].get("tg_id"):
            await m.answer(f"@{target} ещё не привязал дом в боте — позови его сюда 🙂", reply_markup=kb)
            return
        await m.answer(f"👫 Запрос дружбы отправлен @{target}!", reply_markup=kb)
        try:
            await bot.send_message(ow[0]["tg_id"], f"👫 @{me['nick']} хочет дружить домами! Между вашими домами загорится неоновая нить, и вы сможете дарить друг другу украшения.",
                                   reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="✅ Дружить", callback_data=f"fr:{me['nick']}"), IB(text="❌ Нет", callback_data="frno")]]))
        except Exception:
            pass
    elif t == "gift":
        target, item = norm_nick(str(data.get("n") or "")), str(data.get("i") or "")
        mine = await fx_get(me["nick"])
        if target not in mine.get("f", []) or item not in FX_ITEMS or item in COIN_NO or item == "top":
            await m.answer("Дарить украшения можно только друзьям 👫", reply_markup=kb)
            return
        price = coin_price(item)
        if int(mine.get("co", 0)) < price:
            await m.answer(f"Не хватает неонок: нужно 🪙 {price}, у тебя {mine.get('co', 0)}.", reply_markup=kb)
            return
        fx = await fx_get(target)
        if item in fx.get("d", []):
            await m.answer(f"У @{target} это украшение уже есть 🙂", reply_markup=kb)
            return
        mine["co"] = int(mine["co"]) - price
        await fx_set(me["nick"], mine)
        fx["d"] = sorted(set(fx.get("d", [])) | {item})
        await fx_set(target, fx)
        await m.answer(f"🎁 Подарил @{target}: {FX_ITEMS[item][0]}! Осталось 🪙 {mine['co']}.", reply_markup=kb)
        await notify(target, f"🎁 Твой друг @{me['nick']} подарил тебе {FX_ITEMS[item][0]}! Уже у твоего дома.")
    elif t == "roof":
        px = re.sub(r"[^0-8]", "", str(data.get("p") or ""))[:64]
        if len(px) != 64:
            return
        fx = await fx_get(me["nick"])
        fx["rf"] = px if px.strip("0") else ""
        await fx_set(me["nick"], fx)
        await m.answer("🎨 Флаг-рисунок над домом готов! На сайте через пару минут.", reply_markup=kb)
        for a in ADMIN_IDS:
            try:
                await bot.send_message(a, f"🎨 @{me['nick']} нарисовал флаг. Если там что-то плохое: /roof_clear {me['nick']}")
            except Exception:
                pass
    elif t == "borrow":
        target = norm_nick(str(data.get("n") or ""))
        now = int(time.time())
        last = int(await db.kv_get(f"borrow:{uid}") or 0)
        if now - last < 6 * 3600:
            await m.answer(f"🦝 Одалживать можно раз в 6 часов — ещё {((6 * 3600 - (now - last)) // 60) + 1} мин.", reply_markup=kb)
            return
        mine, fx = await fx_get(me["nick"]), await fx_get(target)
        if target == me["nick"] or (isinstance(mine.get("bor"), dict) and mine["bor"].get("u", 0) > now):
            await m.answer("У тебя уже есть одолженное украшение — подожди, пока вернётся 🦝", reply_markup=kb)
            return
        lent = fx.get("lent") if isinstance(fx.get("lent"), dict) and fx["lent"].get("u", 0) > now else None
        pool = [x for x in fx.get("d", []) if not lent]
        if not pool:
            await m.answer(f"У @{target} нечего одолжить 🦝", reply_markup=kb)
            return
        item = random.choice(pool)
        fx["lent"] = {"i": item, "to": me["nick"], "u": now + 3600}
        mine["bor"] = {"i": item, "from": target, "u": now + 3600}
        await fx_set(target, fx)
        await fx_set(me["nick"], mine)
        await db.kv_set(f"borrow:{uid}", now)
        await m.answer(f"🦝 Ты одолжил у @{target}: {FX_ITEMS[item][0]} — на 1 час, потом вернётся само!", reply_markup=kb)
        await notify(target, f"🦝 @{me['nick']} одолжил твоё украшение «{FX_ITEMS[item][0]}» на 1 час. Не волнуйся — вернётся само! (Можешь одолжить у него в ответ 😉)")


@r.callback_query(F.data.startswith("fr:"))
async def friend_ok(c: CallbackQuery):
    await c.answer()
    me = await db.linked(c.from_user.id)
    other = c.data[3:]
    if not me:
        return
    for a, b in ((me["nick"], other), (other, me["nick"])):
        fx = await fx_get(a)
        fx["f"] = sorted(set(fx.get("f", [])) | {b})[:20]
        await fx_set(a, fx)
    await c.message.edit_text(f"👫 Теперь вы с @{other} друзья! Между домами горит неоновая нить, и можно дарить друг другу украшения.")
    ow = await db.by_nick(other)
    if ow and ow[0].get("tg_id"):
        try:
            await c.bot.send_message(ow[0]["tg_id"], f"👫 @{me['nick']} принял дружбу! Между вашими домами загорелась неоновая нить.")
        except Exception:
            pass


@r.callback_query(F.data == "frno")
async def friend_no(c: CallbackQuery):
    await c.answer()
    await c.message.edit_text("Ок, без дружбы 🙂")


@r.message(Command("roof_clear"))
async def roof_clear(m: Message):
    if not is_admin(m.from_user.id):
        return
    parts = (m.text or "").split()
    if len(parts) < 2:
        await m.answer("<code>/roof_clear ник</code>")
        return
    nick = norm_nick(parts[1])
    fx = await fx_get(nick)
    fx["rf"] = ""
    await fx_set(nick, fx)
    await m.answer(f"✅ Флаг-рисунок @{nick} снят.")


async def wishes_get():
    try:
        return json.loads(await db.kv_get("wishes") or "[]")
    except ValueError:
        return []
ESTATE_SLOTS = 36
MINI_N = 8
DECOR_ITEMS = ["fireworks", "snowman", "xmas", "ufo", "rainbow", "balloons", "cat", "flag", "lanterns", "pool", "crystal", "rocket", "halo", "ghost", "flowers"]
MINI_POOL = DECOR_ITEMS


def mini_code(day, i):
    return str(1000 + fnv(f"{KLAD_SALT}:mini:{day}:{i}") % 9000)


async def estate_slot_free():
    used = {int(v) for _, v in await db.kv_prefix("estate:")} if hasattr(db, "kv_prefix") else set()
    return next((i for i in range(ESTATE_SLOTS) if i not in used), None)


async def claim_mini(m, uid, i, code):
    day = msk_day()
    if not (0 <= i < MINI_N) or code != mini_code(day, i):
        await m.answer("Этот сундучок уже исчез 🤔 Малые сундуки меняются каждый день в 00:00 МСК.", reply_markup=main_menu())
        return
    me = await db.linked(uid)
    if not me:
        await m.answer("Сначала привяжи ник — «🏠 Мой дом», потом открывай сундук 🎁", reply_markup=main_menu())
        return
    if await db.kv_get(f"mini:{day}:{i}"):
        await m.answer("Этот сундучок уже кто-то открыл 😔 Ищи другой — их по городу несколько!", reply_markup=city_keyboard(me["nick"]))
        return
    if await db.kv_get(f"minu:{day}:{uid}"):
        await m.answer("Ты сегодня уже открыл малый сундук 😉 Завтра будут новые!", reply_markup=city_keyboard(me["nick"]))
        return
    await db.kv_set(f"mini:{day}:{i}", me["nick"])
    await db.kv_set(f"minu:{day}:{uid}", i)
    fx = await fx_get(me["nick"])
    left = [k for k in MINI_POOL if k not in fx.get("d", [])]
    if left:
        item = random.choice(left)
        fx["d"] = sorted(set(fx.get("d", [])) | {item})
    else:
        item = "top"
        fx["top"] = max(int(fx.get("top", 0)), int(time.time())) + 24 * 3600
    fx["co"] = int(fx.get("co", 0)) + 15
    await fx_set(me["nick"], fx)
    asyncio.create_task(klad_publish(day))
    await m.answer(f"🎁 Сундук открыт! Внутри — <b>{FX_ITEMS[item][0]}</b>. Уже у твоего дома (на сайте через пару минут). Разместить его можно в «⭐ Украсить» → «⚙️ Разместить».",
                   reply_markup=city_keyboard(me["nick"]))
FX_COLORS = {"", "#ff3d7f", "#ffd23f", "#5ef2ff", "#a6ff8f", "#c084fc", "#ff7a1a"}
KNOCK_DAY_LIMIT = 15
_fx_dirty = asyncio.Event()


async def fx_get(nick):
    try:
        return json.loads(await db.kv_get("fx:" + nick) or "{}")
    except ValueError:
        return {}


async def fx_set(nick, fx):
    await db.kv_set("fx:" + nick, json.dumps(fx, ensure_ascii=False))
    _fx_dirty.set()


async def fx_publish():
    """fx.json на сайт: таблички, подсветка, стуки ❤, купленные украшения, «дом дня»."""
    if not hasattr(db, "kv_prefix") or not GITHUB_TOKEN:
        return
    now = int(time.time())
    out = {}
    for k, v in await db.kv_prefix("fx:"):
        try:
            fx = json.loads(v)
        except ValueError:
            continue
        if fx.get("top", 0) < now:
            fx.pop("top", None)
        for kk in ("lent", "bor"):
            if isinstance(fx.get(kk), dict) and fx[kk].get("u", 0) < now:
                fx.pop(kk, None)
        fx = {a: b for a, b in fx.items() if b not in ("", [], None, 0)}
        if fx:
            out[k[3:]] = fx
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    old, sha = await gh_get("fx.json")
    if old != body:
        await gh_put("fx.json", body, f"Дома жителей: {len(out)} с табличками/украшениями", sha)
    meta = {"contest": int(await db.kv_get("contest_until") or 0), "deps": json.loads(await db.kv_get("mayor_deps") or "[]")}
    body = json.dumps(meta, ensure_ascii=False)
    old, sha = await gh_get("meta.json")
    if old != body:
        await gh_put("meta.json", body, "Город: конкурс/замы", sha)
    body = json.dumps(await duma_get(), ensure_ascii=False, separators=(",", ":"))
    old, sha = await gh_get("duma.json")
    if old != body:
        await gh_put("duma.json", body, "Дума: идеи", sha)
    wl = await wishes_get()
    body = json.dumps(wl[-30:][::-1], ensure_ascii=False, separators=(",", ":"))
    old, sha = await gh_get("wishes.json")
    if old != body:
        await gh_put("wishes.json", body, f"Фонтан желаний: {len(wl)}", sha)
    est = {k[7:]: int(v) for k, v in await db.kv_prefix("estate:")}
    body = json.dumps(est, ensure_ascii=False, separators=(",", ":"))
    old, sha = await gh_get("estates.json")
    if old != body:
        await gh_put("estates.json", body, f"Усадьбы: {len(est)}", sha)


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
        try:
            await fx_publish()
        except Exception as e:
            log.warning("fx: %s", e)
        try:
            await asyncio.wait_for(_fx_dirty.wait(), timeout=120)
        except asyncio.TimeoutError:
            pass
        _fx_dirty.clear()


SYNC = {"at": None, "msg": "ещё не запускалось" if TIKTOK_SESSIONID else "выключено (нет TIKTOK_SESSIONID)"}


async def sync_subscribers_once():
    owner = TIKTOK_URL.rstrip("/").split("@")[-1]
    fresh_list = await tiktok.followers(owner, TIKTOK_SESSIONID, log)
    text, sha = await gh_get("subscribers.json")
    current = [str(x) for x in json.loads(text or "[]")]
    mf = Path(__file__).parent / "follow_misses.json"
    try:
        misses = json.loads(mf.read_text(encoding="utf-8")) if mf.exists() else {}
    except ValueError:
        misses = {}
    merged, new, gone, back = tiktok.merge(current, fresh_list, tiktok.LAST.get("expected", 0), misses)
    mf.write_text(json.dumps(misses, ensure_ascii=False), encoding="utf-8")
    if merged != current:
        await gh_put("subscribers.json", json.dumps(merged, ensure_ascii=False, separators=(",", ":")),
                     f"Подписчики: +{new}" + (f", отписались {gone}" if gone else "") + (f", вернулись {back}" if back else ""), sha)
    # сразу обновляем список в боте (сайт-зеркало догонит через минуту)
    lst = [norm_nick(x.lstrip("~")) for x in merged]
    g = {norm_nick(x.lstrip("~")) for x in merged if x.startswith("~")}
    _subs.update(t=time.time(), list=lst, set=set(lst) - g, gone=g)
    return len(fresh_list), new, gone, back


async def sync_loop(bot):
    if not ((TIKTOK_SESSIONID or tiktok.has_profile()) and GITHUB_TOKEN):
        return
    await asyncio.sleep(30)
    warned = 0.0
    while True:
        try:
            total, new, gone, back = await sync_subscribers_once()
            SYNC.update(at=time.strftime("%d.%m %H:%M"), msg=f"✅ {total} подписчиков · +{new} новых · {gone} отписались")
        except Exception as e:
            SYNC.update(at=time.strftime("%d.%m %H:%M"), msg=f"❌ {e}")
            log.warning("sync: %s", e)
            if time.time() - warned > 6 * 3600:  # не чаще раза в 6 часов — чтобы ты узнал, что подписчики не обновляются
                warned = time.time()
                for a in ADMIN_IDS:
                    try:
                        await bot.send_message(a, f"⚠️ Подписчики из TikTok не обновляются: {e}\n\nЕсли «вход протух» — запусти на ПК <b>tiktok_login.bat</b> в папке бота и войди QR-кодом.")
                    except Exception:
                        pass
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


async def ensure_menu(bot, uid, nick):
    """Личная кнопка меню «Город» с ником жителя (общая кнопка открывает сайт без ника — студия думает, что дом не привязан)."""
    if not nick:
        return
    key = f"menu:{uid}"
    if await db.kv_get(key) == nick:
        return
    try:
        await bot.set_chat_menu_button(chat_id=uid, menu_button=MenuButtonWebApp(text="Город", web_app=WebAppInfo(url=city_url(nick))))
        await db.kv_set(key, nick)
    except Exception as e:
        log.warning("menu %s: %s", uid, e)


async def menu_backfill(bot):
    """При старте: личные кнопки меню всем привязанным жителям."""
    await asyncio.sleep(20)
    if not hasattr(db, "c"):
        return
    rows = db.c.execute("select tg_id, nick from residents where status='approved' and tg_id is not null").fetchall()
    for uid, nick in rows:
        await ensure_menu(bot, uid, nick)
        await asyncio.sleep(.2)
    log.info("кнопки меню: %s жителей", len(rows))


def main_menu():
    rows = [[IB(text="🏠 Мой дом", callback_data="home")], [IB(text="👥 Пригласить друга · бонус", callback_data="ref")],
            [IB(text="🗳 Выборы мэра", callback_data="elect")], [IB(text="🪙 Бонус дня", callback_data="daily"), IB(text="🏛 Дума", callback_data="duma")],
            [IB(text="🐞 Нашёл баг", callback_data="bug"), IB(text="💡 Идея для города", callback_data="idea")]]
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




# ---------- пользователь ----------
@r.message(CommandStart())
async def start(m: Message, state: FSMContext):
    await state.clear()
    arg = (m.text or "").split(maxsplit=1)[1:] or [""]
    _me = await db.linked(m.from_user.id)
    if _me:
        await ensure_menu(m.bot, m.from_user.id, _me["nick"])
    if arg[0].startswith("klad") and arg[0][4:].isdigit():
        await claim_klad(m, m.from_user.id, arg[0][4:])
        return
    if arg[0].startswith("vote_") and arg[0][5:].isdigit():
        await do_vote(m, m.from_user.id, int(arg[0][5:]), m.bot)
        return
    if arg[0].startswith("mini") and "c" in arg[0][4:]:
        i, _, code = arg[0][4:].partition("c")
        if i.isdigit():
            await claim_mini(m, m.from_user.id, int(i), code)
            return
    if arg[0] == "city":
        if not _me:
            await m.answer("Сначала привяжи ник TikTok — «🏠 Мой дом» 👇", reply_markup=main_menu())
            return
        gift = bool(await db.ai_gift(m.from_user.id))
        await m.answer(f"Вот твой город, @{_me['nick']} 🏙 Открывай кнопкой «🏙 Открыть город» внизу — через неё работают студия, табличка, «постучать» и украшения"
                       + (" (а ещё тебя ждёт 🎁 бесплатный дом по описанию)." if gift else "."), reply_markup=city_keyboard(_me["nick"], gift=gift))
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
class Bug(StatesGroup):
    text = State()


@r.callback_query(F.data == "idea")
async def idea_start(c: CallbackQuery, state: FSMContext):
    await c.answer()
    await state.set_state(Bug.text)
    await state.update_data(kind="idea")
    await c.message.answer("💡 <b>Идея для города</b>\n\nЧто добавить или улучшить? Новые места, ивенты, фишки для домов, игры — пиши одним сообщением, можно с картинкой 🖼\n\nЛучшие идеи сделаем, а автора отметим в посте и дадим титул 🏅\n\nОтмена — /start")


@r.message(Command("idea"))
async def idea_cmd(m: Message, state: FSMContext):
    await state.set_state(Bug.text)
    await state.update_data(kind="idea")
    await m.answer("💡 Напиши свою идею для города одним сообщением — можно с картинкой 🖼\n\nОтмена — /start")


@r.callback_query(F.data == "bug")
async def bug_start(c: CallbackQuery, state: FSMContext):
    await c.answer()
    await state.set_state(Bug.text)
    await c.message.answer("🐞 <b>Нашёл баг?</b>\n\nОпиши одним сообщением, что случилось (что нажимал, что увидел). Можно прикрепить скриншот 📸 — это очень помогает.\n\nОтмена — /start")


@r.message(Command("bug"))
async def bug_cmd(m: Message, state: FSMContext):
    await state.set_state(Bug.text)
    await m.answer("🐞 Опиши баг или идею одним сообщением — можно со скриншотом 📸\n\nОтмена — /start")


@r.message(Bug.text)
async def bug_text(m: Message, state: FSMContext):
    idea = (await state.get_data()).get("kind") == "idea"
    await state.clear()
    me = await db.linked(m.from_user.id)
    who = f"@{me['nick']}" if me else "без привязки"
    tg = f"@{m.from_user.username}" if m.from_user.username else f"id {m.from_user.id}"
    try:  # копия в базу — чтобы читать идеи/баги без Telegram
        rep = json.loads(await db.kv_get("reports") or "[]")
        rep.append({"kind": "idea" if idea else "bug", "tg": tg, "nick": me["nick"] if me else "", "text": (m.text or m.caption or "")[:1000],
                    "photo": bool(m.photo), "ts": time.strftime("%Y-%m-%d %H:%M", time.gmtime(time.time() + 3 * 3600))})
        await db.kv_set("reports", json.dumps(rep[-300:], ensure_ascii=False))
    except Exception as e:
        log.warning("reports: %s", e)
    for a in ADMIN_IDS:
        try:
            await m.bot.send_message(a, ("💡 <b>Идея для города</b>" if idea else "🐞 <b>Баг</b>") + f"\nОт: {tg} · дом {who}")
            await m.bot.copy_message(a, m.chat.id, m.message_id)
            if idea:
                n_rep = len(json.loads(await db.kv_get("reports") or "[]")) - 1
                await m.bot.send_message(a, "Добавить в думу на голосование?", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="🏛 В думу", callback_data=f"dumaok:{n_rep}")]]))
        except Exception as e:
            log.warning("bug fwd: %s", e)
    await m.answer("Спасибо за идею! 💡 Передал в мэрию — лучшие сделаем и отметим автора 🏅" if idea else "Спасибо! 🙏 Передал в мэрию. Самым внимательным — титул 🏅", reply_markup=main_menu())


async def program_notice(bot):
    """Один раз: одобренным кандидатам — что программу теперь можно дополнить (/program)."""
    await asyncio.sleep(30)
    if not hasattr(db, "c") or await db.kv_get("notice_program"):
        return
    await db.kv_set("notice_program", 1)
    rows = db.c.execute("select tg_id, nick from candidates where status='approved'").fetchall()
    for uid, nick in rows:
        try:
            await bot.send_message(uid, "🗳 <b>Программу кандидата теперь можно дополнить!</b>\n\nЛимит вырос с 200 до 800 символов. Отправь сюда <code>/program</code> и дальше всю программу целиком — она заменит старую на сайте.\n\n"
                                   "Например: <code>/program 1. Магазин украшений… 2. Мини-игры… 3. …</code>")
        except Exception as e:
            log.warning("notice %s: %s", nick, e)
        await asyncio.sleep(.3)
    log.info("про /program написал %s кандидатам", len(rows))


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
        deps = json.loads(await db.kv_get("mayor_deps") or "[]")
        return {**base, "stage": 3, "title": f"Мэр города — @{winner}!", "text": "Выборы завершены. Мэр заселился в Ратушу 🏛" + (". Заместители: " + ", ".join("@" + d for d in deps) if deps else ""), "winner": winner, "deputies": deps, "until": ""}
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
    deps = [c["nick"] for c in cands[1:3] if c.get("votes")]
    await db.kv_set("mayor_deps", json.dumps(deps, ensure_ascii=False))
    for nick, title in [(w["nick"], "👑 Мэр города")] + [(d, "🎖 Заместитель мэра") for d in deps]:
        fx = await fx_get(nick)
        fx["tt"] = title
        await fx_set(nick, fx)
    for d in deps:
        ow = await db.by_nick(d)
        if ow and ow[0].get("tg_id"):
            try:
                await bot.send_message(ow[0]["tg_id"], "🎖 <b>Ты — заместитель мэра Города подписчиков!</b> Титул уже над твоим домом.")
            except Exception:
                pass
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
                   "(до 800 символов, без мата и ссылок)\n\nОтмена — /start")


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
    if len(text) > 800 or re.search(r"https?://|t\.me/|@\w{3,}", text):
        await m.answer("Нужно до 800 символов и без ссылок/упоминаний. Попробуй ещё раз 🙂")
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
    if cd.get("tg_id") == uid or norm_nick(cd["nick"]) == me["nick"]:
        await m.answer("За себя голосовать нельзя 🙂 Зови друзей — пусть голосуют за тебя!", reply_markup=main_menu())
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


@r.message(Command("program"))
async def program_cmd(m: Message):
    """/program текст — кандидат обновляет свою программу (до 800 символов)."""
    cd = await db.cand_by_tg(m.from_user.id)
    if not cd or cd["status"] != "approved":
        await m.answer("Обновлять программу могут одобренные кандидаты в мэры 🗳")
        return
    text = re.sub(r"\s+", " ", (m.text or "").split(maxsplit=1)[1] if len((m.text or "").split()) > 1 else "").strip()
    if len(text) < 10:
        await m.answer("Напиши так: <code>/program</code> и дальше свою программу целиком (до 800 символов). Она заменит старую.")
        return
    if len(text) > 800 or BAD.search(text):
        await m.answer("Нужно до 800 символов, без мата, ссылок и упоминаний. Попробуй ещё раз 🙂")
        return
    if hasattr(db, "c"):
        db.c.execute("update candidates set promise=? where id=?", (text, cd["id"]))
        db.c.commit()
    _mayor_dirty.set()
    await m.answer("✅ Программа обновлена — на сайте через пару минут.")
    for a in ADMIN_IDS:
        try:
            await m.bot.send_message(a, f"🗳 @{cd['nick']} обновил программу:\n\n{text}")
        except Exception:
            pass


@r.message(Command("sign_clear", "sign_set"))
async def sign_admin(m: Message):
    """/sign_clear ник [причина] — снять табличку; /sign_set ник текст — заменить табличку."""
    if not is_admin(m.from_user.id):
        return
    parts = (m.text or "").split(maxsplit=2)
    cmd = parts[0].lstrip("/").split("@")[0]
    if len(parts) < 2:
        await m.answer("Как пользоваться:\n<code>/sign_clear ник [причина]</code> — снять табличку\n<code>/sign_set ник новый текст</code> — заменить табличку")
        return
    nick = norm_nick(parts[1].lstrip("@"))
    rest = parts[2].strip() if len(parts) > 2 else ""
    fx = await fx_get(nick)
    old = fx.get("s", "")
    if cmd == "sign_set":
        if not rest:
            await m.answer("Напиши новый текст: <code>/sign_set ник текст</code>")
            return
        fx["s"] = rest[:24]
        note = f"🛠 Мэрия обновила табличку над твоим домом: «{fx['s']}»."
        done = f"✅ Табличка @{nick}: «{old or '—'}» → «{fx['s']}»"
    else:
        fx["s"] = ""
        note = "🛠 Мэрия сняла табличку над твоим домом" + (f": {rest}" if rest else " — она нарушает правила города (без политики, мата и рекламы).") + " Можешь повесить новую в «✏️ Табличка»."
        done = f"✅ Табличка @{nick} снята (была: «{old or '—'}»)"
    await fx_set(nick, fx)
    owners = await db.by_nick(nick)
    if owners and owners[0].get("tg_id"):
        try:
            await m.bot.send_message(owners[0]["tg_id"], note, reply_markup=city_keyboard(nick))
        except Exception:
            pass
    await m.answer(done + "\nНа сайте — через пару минут.")


@r.message(Command("mayor_noself"))
async def mayor_noself(m: Message):
    """Убрать голоса кандидатов за самих себя (после запрета самоголосования)."""
    if not is_admin(m.from_user.id) or not hasattr(db, "c"):
        return
    rows = db.c.execute("select v.tg_id, c.nick from votes v join candidates c on c.id = v.cand_id where c.tg_id = v.tg_id").fetchall()
    for uid, _ in rows:
        db.c.execute("delete from votes where tg_id=?", (uid,))
    db.c.commit()
    _mayor_dirty.set()
    for uid, nick in rows:
        try:
            await m.bot.send_message(uid, "🗳 Голоса за самого себя больше не считаются — твой голос снят. Можешь отдать его другому кандидату в «🗳 Выборы мэра» 🙂")
        except Exception:
            pass
    await m.answer("Сняты голоса за себя: " + (", ".join("@" + n for _, n in rows) or "таких нет") + ". Сайт обновится через пару минут.")


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


@r.message(Command("mayor_list"))
async def mayor_list(m: Message):
    """Заявки в мэры, ждущие проверки, — заново с кнопками (если сообщения потерялись)."""
    if not is_admin(m.from_user.id):
        return
    rows = await db.cands_new()
    if not rows:
        return await m.answer("Новых заявок в мэры нет ✅")
    for cd in rows:
        await m.answer(f"🗳 <b>Заявка в мэры</b> #{cd['id']}\n@{cd['nick']} (tg {cd['tg_id']})\n\n«{html_esc(cd['promise'])}»",
                       reply_markup=InlineKeyboardMarkup(inline_keyboard=[[IB(text="✅ Одобрить", callback_data=f"mc_ok:{cd['id']}"),
                                                                           IB(text="❌ Отклонить", callback_data=f"mc_no:{cd['id']}")]]))


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


# ---------- чат жителей → бегущая строка на стриме (stream_server.py читает chat_feed.json) ----------
BAD = re.compile(r"(х[уy][йияеёю]|п[иі]зд|(?<![а-яё])[её]б[аеиоуы]|(?:за|на|у|вы|въ|отъ|по|долбо)[её]б|бля|сук[аи]|муд[аи]|пид[оа]р|гандон|шлюх|залуп|дроч|https?://|t\.me/|www\.|@\w{4,})", re.I)
_feed: list = []


@r.message(F.chat.type.in_({"group", "supergroup"}) & F.text & ~F.text.startswith("/"))
async def chat_feed(m: Message):
    if not CHAT_ID or str(m.chat.id) != str(CHAT_ID) or not m.from_user or m.from_user.is_bot:
        return
    text = re.sub(r"\s+", " ", m.text).strip()
    if not text or len(text) > 140 or BAD.search(text):
        return
    name = (m.from_user.first_name or "Житель")[:20]
    _feed.append({"id": m.message_id, "ts": time.time(), "name": name, "text": text})
    del _feed[:-30]
    try:
        (Path(__file__).parent / "chat_feed.json").write_text(json.dumps(_feed, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass



# ---------- клад дня ----------
async def klad_publish(day: str):
    """klad.json на сайт: сколько призов разобрали сегодня — сайт прячет сундук, когда лимит исчерпан."""
    if not GITHUB_TOKEN:
        return
    try:
        taken = await db.klad_today(day)
        winners = await db.klad_winners(day)
        mini = sorted(int(k.rsplit(":", 1)[1]) for k, _ in await db.kv_prefix(f"mini:{day}:")) if hasattr(db, "kv_prefix") else []
        body = json.dumps({"day": day, "taken": taken, "limit": KLAD_LIMIT, "winners": winners, "mini": mini}, ensure_ascii=False)
        old, sha = await gh_get("klad.json")
        if old != body:
            await gh_put("klad.json", body, f"Клад {day}: {taken}/{KLAD_LIMIT}", sha)
    except Exception as e:
        log.warning("klad_publish: %s", e)


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
        asyncio.create_task(klad_publish(day))
        return
    try:
        await db.klad_add(uid, me["nick"], day)
    except RuntimeError:
        await m.answer("Ты уже забрал сегодняшний клад 😉 Завтра — новый.")
        return
    asyncio.create_task(klad_publish(day))
    k = await db.klad_gift(uid)
    if k:
        await db.klad_use(k)
    await add_ai_gift(uid, me["nick"])
    await coins_add(me["nick"], 50)
    await m.answer_photo(photo(cards.klad_card(me["nick"])), caption="🪙 +50 неонок! " + (
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
        await ensure_menu(bot, me["tg_id"], nick)
        try:
            await bot.send_message(me["tg_id"], "🙏 <b>Извини за ошибку!</b> Кнопка меню открывала город без твоего ника — поэтому подарок не открывался. Уже починили.\n\n"
                                   "🎁 Твой бесплатный <b>дом по описанию</b> ждёт тебя: нажми «🏙 Открыть город» внизу → «🎨 Мой дом» → «✨ По описанию».",
                                   reply_markup=city_keyboard(nick, gift=True))
            await m.answer(f"У @{nick} подарок уже был — отправил ему извинение и рабочую кнопку 🎁")
        except Exception as e:
            await m.answer(f"Не смог написать ему: {e}")
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
# ---------- API для мини-приложения: действия без закрытия окна (через туннель Cloudflare) ----------
import hmac
import subprocess
from types import SimpleNamespace
from urllib.parse import parse_qsl
from aiohttp import web

API_PORT = int(E("API_PORT", "8787"))
API_STATE = {}  # держим ссылки на задачу и процесс туннеля, чтобы их не собрал сборщик мусора


def check_init_data(init_data: str):
    """Проверка подписи Telegram WebApp initData → id пользователя или None."""
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        h = pairs.pop("hash", "")
        check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(hmac.new(secret, check.encode(), hashlib.sha256).hexdigest(), h):
            return None
        if time.time() - int(pairs.get("auth_date", "0")) > 2 * 86400:
            return None
        return int(json.loads(pairs["user"])["id"])
    except Exception:
        return None


class ApiMsg:
    """Подмена Message: ответы бота собираются и возвращаются в мини-приложение."""
    api = True

    def __init__(self, uid, raw):
        self.from_user = SimpleNamespace(id=uid, username=None)
        self.chat = SimpleNamespace(id=uid)
        self.web_app_data = SimpleNamespace(data=raw)
        self.out, self.invoice = [], None

    async def answer(self, text="", **kw):
        self.out.append(text)

    async def answer_photo(self, photo=None, caption=None, **kw):
        self.out.append(caption or "")


async def api_handler(req):
    cors = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS"}
    if req.method == "OPTIONS":
        return web.Response(headers=cors)
    try:
        body = await req.json()
    except Exception:
        return web.json_response({"ok": False, "err": "bad json"}, headers=cors)
    uid = check_init_data(str(body.get("initData") or ""))
    if not uid:
        return web.json_response({"ok": False, "err": "auth"}, headers=cors)
    m = ApiMsg(uid, json.dumps(body.get("data") or {}, ensure_ascii=False))
    try:
        await web_app(m, req.app["bot"])
    except Exception as e:
        log.warning("api: %s", e)
        return web.json_response({"ok": False, "err": "server"}, headers=cors)
    clean = [re.sub(r"<[^>]+>", "", t) for t in m.out if t]
    return web.json_response({"ok": True, "msgs": clean, "invoice": m.invoice}, headers=cors)


async def api_serve(bot):
    app = web.Application()
    app["bot"] = bot
    app.router.add_route("*", "/api", api_handler)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", API_PORT).start()
    log.info("API мини-приложения: http://127.0.0.1:%s/api", API_PORT)
    exe = next((x for x in [r"C:\Program Files (x86)\cloudflared\cloudflared.exe", r"C:\Program Files\cloudflared\cloudflared.exe"] if os.path.exists(x)), None)
    if not exe or not GITHUB_TOKEN:
        log.info("cloudflared не найден — мини-приложение работает по-старому (sendData)")
        return
    logf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tunnel.log")
    subprocess.run(["taskkill", "/IM", "cloudflared.exe", "/F"], capture_output=True)
    while True:
        # лог туннеля — в файл (не pipe): cloudflared не зависит от того, читаем ли мы его вывод
        try:
            open(logf, "w").close()
        except Exception:
            pass
        proc = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--logfile", logf, "--url", f"http://127.0.0.1:{API_PORT}"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        API_STATE["proc"] = proc
        url = None
        for _ in range(90):
            await asyncio.sleep(1)
            try:
                mt = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", open(logf, encoding="utf-8", errors="ignore").read())
            except Exception:
                mt = None
            if mt:
                url = mt.group(0)
                break
            if proc.poll() is not None:
                break
        if url:
            log.info("туннель: %s", url)
            for _ in range(5):
                try:
                    old, sha = await gh_get("api.json")
                    await gh_put("api.json", json.dumps({"url": url + "/api", "ts": int(time.time())}), "API мини-приложения", sha)
                    break
                except Exception as e:
                    log.warning("api.json: %s", e)
                    await asyncio.sleep(10)
        while proc.poll() is None:
            await asyncio.sleep(5)
        log.warning("туннель упал (код %s) — перезапускаю через 10 с", proc.returncode)
        await asyncio.sleep(10)


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
    await ensure_menu(bot, m.from_user.id, me["nick"])
    if data.get("t") == "me":
        await m.answer(f"Вот твой город, @{me['nick']} 🏙 Открывай кнопкой «🏙 Открыть город» внизу — там твой дом, студия и подарки.",
                       reply_markup=city_keyboard(me["nick"], gift=bool(await db.ai_gift(m.from_user.id))))
        return
    if data.get("t") == "klad":
        await claim_klad(m, m.from_user.id, str(data.get("c", "")))
        return
    if data.get("t") == "fx":
        st = re.sub(r"\s+", " ", str(data.get("s") or "")).strip()[:24]
        col = str(data.get("c") or "")
        if st and BAD.search(st):
            await m.answer("Такую табличку повесить нельзя 🙅 Придумай другую.", reply_markup=city_keyboard(me["nick"]))
            return
        fx = await fx_get(me["nick"])
        fx["s"] = st
        fx["c"] = col if col in FX_COLORS else ""
        await fx_set(me["nick"], fx)
        what = f"Табличка: «{st}»" if st else "Табличку сняли"
        await m.answer(f"Готово! ✨ {what}{' · подсветка включена' if fx['c'] else ''}.\nНа сайте появится через пару минут.",
                       reply_markup=city_keyboard(me["nick"]))
        return
    if data.get("t") == "knock":
        target = norm_nick(str(data.get("n") or "").strip().lstrip("@"))
        subs = await subscribers()
        if not target or target == me["nick"] or target not in subs["set"]:
            await m.answer("Не нашёл такой дом 🤔", reply_markup=city_keyboard(me["nick"]))
            return
        day = msk_day()
        if await db.kv_get(f"kn:{day}:{m.from_user.id}:{target}"):
            await m.answer(f"Ты сегодня уже стучал к @{target} 😉 Завтра можно снова.", reply_markup=city_keyboard(me["nick"]))
            return
        cnt = int(await db.kv_get(f"knd:{day}:{m.from_user.id}") or 0)
        if cnt >= KNOCK_DAY_LIMIT:
            await m.answer(f"На сегодня хватит — максимум {KNOCK_DAY_LIMIT} стуков в день 🚪", reply_markup=city_keyboard(me["nick"]))
            return
        await db.kv_set(f"kn:{day}:{m.from_user.id}:{target}", 1)
        await db.kv_set(f"knd:{day}:{m.from_user.id}", cnt + 1)
        fx = await fx_get(target)
        fx["k"] = int(fx.get("k", 0)) + 1
        await fx_set(target, fx)
        await coins_add(me["nick"], 2)
        await m.answer(f"🚪 Тук-тук! Ты постучал к @{target}. У дома уже ❤ {fx['k']}. Тебе 🪙 +2.", reply_markup=city_keyboard(me["nick"]))
        owners = await db.by_nick(target)
        owner = owners[0] if owners else None
        if owner and owner.get("tg_id"):
            try:
                await bot.send_message(owner["tg_id"], f"🚪 Тук-тук! @{me['nick']} постучал(а) к тебе в дом. Всего стуков: ❤ {fx['k']}",
                                       reply_markup=city_keyboard(target))
            except Exception:
                pass
        return
    if data.get("t") == "buyc":
        item = str(data.get("i") or "")
        if item not in FX_ITEMS or item in COIN_NO:
            return
        fx = await fx_get(me["nick"])
        price = coin_price(item)
        if int(fx.get("co", 0)) < price:
            await m.answer(f"Не хватает неонок: нужно 🪙 {price}, у тебя {fx.get('co', 0)}. Забирай «🪙 Бонус дня» каждый день, ищи клад и сундуки!", reply_markup=main_menu())
            return
        fx["co"] = int(fx["co"]) - price
        if item == "top":
            fx["top"] = max(int(fx.get("top", 0)), int(time.time())) + 24 * 3600
        else:
            fx["d"] = sorted(set(fx.get("d", [])) | {item})
        await fx_set(me["nick"], fx)
        await m.answer(f"🪙 Куплено: {FX_ITEMS[item][0]} за {price} неонок. Осталось 🪙 {fx['co']}.", reply_markup=city_keyboard(me["nick"]))
        return
    if data.get("t") in ("cvote", "ivote", "friend", "gift", "roof", "borrow"):
        await social_action(m, bot, me, data)
        return
    if data.get("t") == "spin":
        await do_spin(m, m.from_user.id)
        return
    if data.get("t") == "wish":
        text = re.sub(r"\s+", " ", str(data.get("s") or "")).strip()[:80]
        if len(text) < 3 or BAD.search(text):
            await m.answer("Напиши желание словами (3–80 символов, без мата и ссылок) ⛲", reply_markup=city_keyboard(me["nick"]))
            return
        if not await park_open():
            await m.answer(f"⛲ Фонтан желаний откроется вместе с Неоновым парком — на {PARK_AT} подписчиков!", reply_markup=city_keyboard(me["nick"]))
            return
        await db.kv_set(f"wishp:{m.from_user.id}", text)
        if getattr(m, "api", False):
            m.invoice = await bot.create_invoice_link(title="Монетка в фонтан желаний", description=f"Желание «{text}» засветится над фонтаном в Неоновом парке.",
                                                      payload="f|wish", currency="XTR", prices=[LabeledPrice(label="Монетка", amount=FX_ITEMS["wish"][1])])
            return
        await bot.send_invoice(m.chat.id, title="Монетка в фонтан желаний", description=f"Желание «{text}» засветится над фонтаном в Неоновом парке — его увидят все жители.",
                               payload="f|wish", currency="XTR", prices=[LabeledPrice(label="Монетка", amount=FX_ITEMS["wish"][1])])
        return
    if data.get("t") == "mini":
        try:
            await claim_mini(m, m.from_user.id, int(data.get("i", -1)), str(data.get("c", "")))
        except (TypeError, ValueError):
            pass
        return
    if data.get("t") == "place":
        item = str(data.get("i") or "")
        fx = await fx_get(me["nick"])
        if not ((item in FX_ITEMS and item != "top" and item in fx.get("d", [])) or (item == "sign" and fx.get("s"))):
            await m.answer("Сначала поставь это украшение у дома 🙂", reply_markup=city_keyboard(me["nick"]))
            return
        try:
            x, y, sc = (float(v) for v in (list(data.get("p") or []) + [0, 0, 1])[:3])
        except (TypeError, ValueError):
            return
        clamp = lambda v, a, b: round(max(a, min(b, v)), 2)
        fx.setdefault("p", {})[item] = [clamp(x, -.7, .7), clamp(y, -1, 2.5), clamp(sc, .4, 2.5)]
        await fx_set(me["nick"], fx)
        await m.answer("Готово! ⚙️ Украшение на новом месте — в городе через пару минут.", reply_markup=city_keyboard(me["nick"]))
        return
    if data.get("t") == "buy":
        item = str(data.get("i") or "")
        if item not in FX_ITEMS:
            return
        name, price = FX_ITEMS[item]
        if getattr(m, "api", False):
            m.invoice = await bot.create_invoice_link(title=name[:32], description=f"{name} для дома @{me['nick']}. Появится в городе через пару минут после оплаты.",
                                                      payload=f"f|{item}", currency="XTR", prices=[LabeledPrice(label=name[:32], amount=price)])
            return
        await bot.send_invoice(m.chat.id, title=name[:32], description=f"{name} для дома @{me['nick']}. Появится в городе через пару минут после оплаты.",
                               payload=f"f|{item}", currency="XTR", prices=[LabeledPrice(label=name[:32], amount=price)])
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
    elif parts[0] == "f":
        me = await db.linked(q.from_user.id)
        ok = len(parts) == 2 and parts[1] in FX_ITEMS and q.total_amount == FX_ITEMS[parts[1]][1] and bool(me)
        if ok and parts[1] == "estate":
            ok = not await db.kv_get("estate:" + me["nick"]) and await estate_slot_free() is not None
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
    if p.invoice_payload.startswith("f|"):
        item = p.invoice_payload.split("|")[1]
        me = await db.linked(m.from_user.id)
        if not me or item not in FX_ITEMS:
            await bot.refund_star_payment(m.from_user.id, p.telegram_payment_charge_id)
            await m.answer("Не получилось — звёзды вернули.")
            return
        if item == "wish":
            text = await db.kv_get(f"wishp:{m.from_user.id}") or "…"
            wl = await wishes_get()
            wl.append({"nick": me["nick"], "text": text, "ts": int(time.time())})
            await db.kv_set("wishes", json.dumps(wl[-100:], ensure_ascii=False))
            _fx_dirty.set()
            try:
                await db.add_payment(m.from_user.id, me["nick"], p.total_amount, p.telegram_payment_charge_id, {"fx": "wish", "text": text})
            except RuntimeError as e:
                log.warning("payment log: %s", e)
            await m.answer(f"🪙 Плюх! Желание «{text}» засветилось над фонтаном ✨ Самые популярные желания мэрия исполняет!", reply_markup=city_keyboard(me["nick"]))
            for a in ADMIN_IDS:
                try:
                    await bot.send_message(a, f"⛲ Желание от @{me['nick']}: {text}")
                except Exception:
                    pass
            return
        if item == "estate":
            slot = await estate_slot_free()
            if slot is None or await db.kv_get("estate:" + me["nick"]):
                await bot.refund_star_payment(m.from_user.id, p.telegram_payment_charge_id)
                await m.answer("Свободных участков нет или усадьба уже есть — звёзды вернули.")
                return
            await db.kv_set("estate:" + me["nick"], slot)
            _fx_dirty.set()
            try:
                await db.add_payment(m.from_user.id, me["nick"], p.total_amount, p.telegram_payment_charge_id, {"fx": item, "slot": slot})
            except RuntimeError as e:
                log.warning("payment log: %s", e)
            await m.answer(f"🏡 Поздравляем! Твой дом переехал в <b>Посёлок Усадеб</b> — участок №{slot + 1}: большой дом, забор и свой сад. На сайте через пару минут.",
                           reply_markup=city_keyboard(me["nick"]))
            for a in ADMIN_IDS:
                try:
                    await bot.send_message(a, f"🏡 @{me['nick']} купил усадьбу (участок №{slot + 1}) — 100 ⭐")
                except Exception:
                    pass
            return
        fx = await fx_get(me["nick"])
        if item == "top":
            fx["top"] = max(int(fx.get("top", 0)), int(time.time())) + 24 * 3600
        else:
            fx["d"] = sorted(set(fx.get("d", [])) | {item})
        await fx_set(me["nick"], fx)
        try:
            await db.add_payment(m.from_user.id, me["nick"], p.total_amount, p.telegram_payment_charge_id, {"fx": item})
        except RuntimeError as e:
            log.warning("payment log: %s", e)
        await m.answer(f"Спасибо! ⭐ {FX_ITEMS[item][0]} — уже у твоего дома (на сайте через пару минут).", reply_markup=city_keyboard(me["nick"]))
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


@r.message(Command("ai_hand"))
async def ai_hand(m: Message, bot: Bot):
    """/ai_hand N — подставить в заказ #N дом, собранный вручную (handmade.json на сайте), и прислать превью с кнопками.
    Работает и для уже поставленных домов: после ✅ дом жителя обновится."""
    if not is_admin(m.from_user.id):
        return
    arg = (m.text or "").split()[1:]
    if not arg or not arg[0].isdigit():
        return await m.answer("Напиши номер заказа: /ai_hand 4")
    oid = int(arg[0])
    o = await db.ai_get(oid)
    if not o:
        return await m.answer(f"Заказа #{oid} нет.")
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            hand = (await c.get(SITE_BASE + "handmade.json", params={"v": int(time.time())})).json()
        rec = hand[str(oid)]
    except Exception:
        return await m.answer(f"Для заказа #{oid} нет ручного дома в handmade.json (или сайт ещё не обновился — подожди минуту).")
    await db.ai_patch(oid, {"status": "review", "recipe": rec})
    png = await ai.preview(rec, SITE_BASE)
    await m.answer_photo(photo(png, "house.png"), reply_markup=ai_kb(oid), caption=(
        f"🛠 <b>Дом #{oid} собран вручную</b> · @{o['nick']}\n«{o['text'][:300]}»\n\n"
        f"<b>{rec['name']}</b> · деталей: {len(rec['parts'])}\nНажми «✅ Поставить в город»."))


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


async def handmade_loop(bot):
    """Дома, собранные вручную (handmade.json на сайте, пометка "publish") — ставим в город сами и пишем жителю.
    Каждый ручной вариант ставится один раз (помним в kv: hand_<номер> = название)."""
    await asyncio.sleep(60)
    while True:
        try:
            async with httpx.AsyncClient(timeout=20) as c:
                hand = (await c.get(SITE_BASE + "handmade.json", params={"v": int(time.time())})).json()
            for k, rec in hand.items():
                if not (k.isdigit() and isinstance(rec, dict) and rec.get("publish")):
                    continue
                rec = {x: v for x, v in rec.items() if x != "publish"}
                mark = f"{rec.get('name')}:{len(rec.get('parts', []))}"
                if await db.kv_get(f"hand_{k}") == mark:
                    continue
                o = await db.ai_get(int(k))
                if not o or o["status"] in ("refunded", "new"):
                    continue
                me = await db.linked(o["tg_id"])
                if not me:
                    continue
                await db.patch(me["id"], {"recipe": rec})
                await db.ai_patch(o["id"], {"status": "done", "recipe": rec})
                await db.kv_set(f"hand_{k}", mark)
                log.info("ручной дом #%s поставлен: @%s", k, me["nick"])
                try:
                    png = await ai.preview(rec, SITE_BASE)
                    await bot.send_photo(o["tg_id"], photo(png, "house.png"), reply_markup=city_keyboard(me["nick"]), caption=(
                        f"✨ Твой дом «{rec.get('name', 'по описанию')}» готов и уже стоит в городе! Открой город и найди @{me['nick']} 🏙"))
                except Exception as e:
                    log.warning("hand send: %s", e)
                for a in ADMIN_IDS:
                    try:
                        await bot.send_message(a, f"🛠 Ручной дом #{k} «{rec.get('name')}» поставлен @{me['nick']} и отправлен жителю ✅")
                    except Exception:
                        pass
        except Exception as e:
            log.warning("handmade: %s", e)
        await asyncio.sleep(300)


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
    await ensure_menu(bot, row["tg_id"], row["nick"])
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
    asyncio.create_task(handmade_loop(bot))
    asyncio.create_task(menu_backfill(bot))
    asyncio.create_task(program_notice(bot))
    API_STATE["task"] = asyncio.create_task(api_serve(bot))
    asyncio.create_task(sync_loop(bot))
    asyncio.create_task(ai_resume(bot))
    asyncio.create_task(restart_later())
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
