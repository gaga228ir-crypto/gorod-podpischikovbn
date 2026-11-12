"""TikTok без браузера: профиль (описание «О себе») и список подписчиков.
Профиль открыт всем; для списка подписчиков нужен cookie sessionid владельца аккаунта (TIKTOK_SESSIONID в .env)."""
import asyncio, json, random, re

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
H = {"User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8", "Referer": "https://www.tiktok.com/"}


def _universal(html: str):
    m = re.search(r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


async def _profile_http(nick):
    async with httpx.AsyncClient(timeout=20, headers=H, follow_redirects=True) as c:
        r = await c.get(f"https://www.tiktok.com/@{nick}", params={"lang": "ru-RU"})
    return _user(_universal(r.text))


def _user(d):
    try:
        ui = d["__DEFAULT_SCOPE__"]["webapp.user-detail"]["userInfo"]
        u = ui["user"]
        return {"uniqueId": u.get("uniqueId", ""), "signature": u.get("signature", ""), "secUid": u.get("secUid", ""),
                "followers": int((ui.get("stats") or ui.get("statsV2") or {}).get("followerCount") or 0)}
    except (TypeError, KeyError):
        return None


# ---------- невидимый Chrome: TikTok пускает «как обычный браузер» ----------
_pw = _browser = None
_lock = asyncio.Lock()


async def _context(sessionid=None):
    global _pw, _browser
    async with _lock:
        if _browser is None or not _browser.is_connected():
            from playwright.async_api import async_playwright
            _pw = _pw or await async_playwright().start()
            args = ["--disable-blink-features=AutomationControlled", "--mute-audio"]
            try:
                _browser = await _pw.chromium.launch(channel="chrome", headless=True, args=args)  # установленный Google Chrome
            except Exception:
                _browser = await _pw.chromium.launch(headless=True, args=args)
    ctx = await _browser.new_context(user_agent=UA, locale="ru-RU", viewport={"width": 1280, "height": 900})
    if sessionid:
        await ctx.add_cookies([{"name": n, "value": sessionid, "domain": ".tiktok.com", "path": "/", "secure": True, "httpOnly": True}
                               for n in ("sessionid", "sessionid_ss")])
    return ctx


# ---------- вход владельца: свой профиль Chrome (вошёл один раз по QR — бот работает от этого входа) ----------
from pathlib import Path
PROFILE = Path(__file__).parent / "tt_profile"
_plock = asyncio.Lock()


def has_profile() -> bool:
    return (PROFILE / ".logged_in").exists()


async def _profile_open(nick, headless=True):
    """Отдельный Chrome с профилем бота (там ты залогинен). Профиль может открыть только один Chrome сразу."""
    global _pw
    from playwright.async_api import async_playwright
    _pw = _pw or await async_playwright().start()
    ctx = await _pw.chromium.launch_persistent_context(str(PROFILE), channel="chrome", headless=headless, user_agent=UA, locale="ru-RU",
                                                       viewport={"width": 1280, "height": 900}, args=["--disable-blink-features=AutomationControlled", "--mute-audio"])
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    if nick:
        await page.goto(f"https://www.tiktok.com/@{nick}?lang=ru-RU", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3500)
    return ctx, page


LOGIN_JS = "async () => { try { const r = await fetch('/passport/web/account/info/?aid=1459', {credentials:'include'}); const j = await r.json(); return j && j.data && j.data.username ? j.data.username : null; } catch (e) { return null; } }"


async def login_status(page):
    """Ник, под которым залогинен браузер, или None (вход протух)."""
    return await page.evaluate(LOGIN_JS)


async def _open(nick, sessionid=None):
    ctx = await _context(sessionid)
    page = await ctx.new_page()
    await page.goto(f"https://www.tiktok.com/@{nick}?lang=ru-RU", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(3500)
    return ctx, page


async def profile(nick: str, cookies: dict | None = None) -> dict | None:
    """{'uniqueId','signature','secUid'} или None, если профиль не открылся."""
    try:
        p = await _profile_http(nick)
        if p:
            return p
    except Exception:
        pass
    ctx = None
    try:
        ctx, page = await _open(nick)
        raw = await page.evaluate("() => { const e = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'); return e ? e.textContent : null }")
        p = _user(json.loads(raw)) if raw else None
        if p and not p["signature"]:  # на всякий случай — текст «О себе» со страницы
            bio = await page.evaluate("() => { const e = document.querySelector('[data-e2e=\"user-bio\"]'); return e ? e.innerText : '' }")
            p["signature"] = bio or ""
        return p
    finally:
        if ctx:
            await ctx.close()


FOLLOWERS_JS = """async (secUid) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [], seen = new Set(); let cursor = 0;
  for (let p = 0; p < 400; p++) {
    let j; try { j = await (await fetch(`/api/user/list/?aid=1988&app_name=tiktok_web&device_platform=web_pc&count=30&maxCursor=0&minCursor=${cursor}&scene=67&secUid=${encodeURIComponent(secUid)}`, { credentials: 'include' })).json(); }
    catch (e) { return { err: 'сеть/не JSON на странице ' + p, list: out }; }
    if (j.statusCode !== 0) return { err: 'TikTok: ' + (j.status_msg || j.statusCode), list: out };
    for (const it of (j.userList || [])) { const n = ((it.user && it.user.uniqueId) || '').toLowerCase(); if (n && !seen.has(n)) { seen.add(n); out.push(n); } }
    if (!j.hasMore || !j.minCursor || j.minCursor === cursor || !(j.userList || []).length) break;
    cursor = j.minCursor; await sleep(1100 + Math.random() * 800);
  }
  return { err: null, list: out };
}"""


CODE_RE = r"(?:ДОМ|DOM|дом|dom|Дом|Dom)\s*[-–—#:]?\s*{code}(?!\d)"


def bio_has_code(signature: str, code: str) -> bool:
    return bool(re.search(CODE_RE.format(code=re.escape(code)), signature or ""))


LAST = {"expected": 0}  # сколько подписчиков показывает профиль — чтобы понять, целиком ли TikTok отдал список


async def followers(owner: str, sessionid: str, log=None) -> list[str]:
    """Все подписчики owner, новые первыми — через невидимый Chrome с твоим sessionid."""
    ctx = None
    try:
        if has_profile():
            await _plock.acquire()
            try:
                ctx, page = await _profile_open(owner)
            except Exception:
                _plock.release()
                raise
        else:
            ctx, page = await _open(owner, sessionid)
        if not await login_status(page):
            raise RuntimeError("TikTok: вход протух — запусти tiktok_login.bat в папке бота и войди в аккаунт заново")
        raw = await page.evaluate("() => { const e = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__'); return e ? e.textContent : null }")
        u = _user(json.loads(raw)) if raw else None
        if not u or not u["secUid"]:
            raise RuntimeError("не открылся профиль TikTok в Chrome")
        LAST["expected"] = u.get("followers", 0)
        res = await page.evaluate(FOLLOWERS_JS, u["secUid"])
    finally:
        if ctx:
            await ctx.close()
        if _plock.locked():
            _plock.release()
    if res.get("err") and len(res.get("list") or []) < 30:
        raise RuntimeError(res["err"] + " — проверь, что sessionid свежий и это аккаунт-владелец")
    if log:
        log.info("tiktok followers: %s из %s%s", len(res["list"]), LAST["expected"] or "?", f" (оборвалось: {res['err']})" if res.get("err") else "")
    return res["list"]


def merge(current: list[str], newest_first: list[str], expected: int = 0, misses: dict | None = None) -> tuple[list[str], int, int, int]:
    """Как update.html: порядок домов не меняется; отписавшиеся → «~ник»; новые — в конец.
    TikTok часто отдаёт список не целиком, поэтому «отписался» ставим, только если
    1) список полный (не меньше числа подписчиков в профиле минус 1%) и 2) человека нет ДВА обновления подряд.
    misses — счётчик пропусков по никам (сохраняется между запусками). → (новый список, новых, отписались, вернулись)"""
    nk = lambda e: e.lstrip("~").lower()
    misses = {} if misses is None else misses
    inc = set(newest_first)
    active = sum(1 for e in current if not e.startswith("~"))
    full = len(newest_first) >= (expected * .99 - 2 if expected else active * .99)
    gone = back = 0
    kept = []
    for e in current:
        n, was = nk(e), e.startswith("~")
        if n in inc:
            misses.pop(n, None)
            back += was
            kept.append(n)
        elif full and not was:
            misses[n] = misses.get(n, 0) + 1
            if misses[n] >= 2:
                gone += 1
                kept.append("~" + n)
            else:
                kept.append(e)
        else:
            kept.append(e)
    have = {nk(e) for e in current}
    fresh = [n for n in reversed(newest_first) if n not in have]
    return kept + fresh, len(fresh), gone, back
