"""TikTok без браузера: профиль (описание «О себе») и список подписчиков.
Профиль открыт всем; для списка подписчиков нужен cookie sessionid владельца аккаунта (TIKTOK_SESSIONID в .env)."""
import asyncio, json, random, re

import httpx

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
H = {"User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8", "Referer": "https://www.tiktok.com/"}


def _universal(html: str):
    m = re.search(r'<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html, re.S)
    return json.loads(m.group(1)) if m else None


async def profile(nick: str, cookies: dict | None = None) -> dict | None:
    """{'uniqueId','signature','secUid'} или None, если профиль не открылся."""
    async with httpx.AsyncClient(timeout=20, headers=H, cookies=cookies or {}, follow_redirects=True) as c:
        r = await c.get(f"https://www.tiktok.com/@{nick}", params={"lang": "ru-RU"})
    d = _universal(r.text)
    try:
        ud = d["__DEFAULT_SCOPE__"]["webapp.user-detail"]
        u = ud["userInfo"]["user"]
        return {"uniqueId": u.get("uniqueId", ""), "signature": u.get("signature", ""), "secUid": u.get("secUid", "")}
    except (TypeError, KeyError):
        return None


CODE_RE = r"(?:ДОМ|DOM|дом|dom|Дом|Dom)\s*[-–—#:]?\s*{code}(?!\d)"


def bio_has_code(signature: str, code: str) -> bool:
    return bool(re.search(CODE_RE.format(code=re.escape(code)), signature or ""))


async def followers(owner: str, sessionid: str, log=None) -> list[str]:
    """Все подписчики owner, новые первыми. Бросает RuntimeError, если TikTok не отдал список."""
    cookies = {"sessionid": sessionid, "sessionid_ss": sessionid}
    p = await profile(owner, cookies)
    if not p or not p["secUid"]:
        raise RuntimeError("не открылся профиль TikTok")
    out, seen, cursor = [], set(), 0
    async with httpx.AsyncClient(timeout=25, headers=H, cookies=cookies) as c:
        for page in range(400):
            r = await c.get("https://www.tiktok.com/api/user/list/", params={
                "aid": "1988", "app_name": "tiktok_web", "device_platform": "web_pc", "count": "30",
                "maxCursor": "0", "minCursor": str(cursor), "scene": "67", "secUid": p["secUid"]})
            try:
                j = r.json()
            except ValueError:
                raise RuntimeError(f"TikTok ответил не JSON (HTTP {r.status_code}) — возможно, нужен свежий sessionid")
            if j.get("statusCode") != 0:
                raise RuntimeError(f"TikTok: {j.get('status_msg') or j.get('statusCode')}")
            for it in j.get("userList") or []:
                n = ((it.get("user") or {}).get("uniqueId") or "").lower()
                if n and n not in seen:
                    seen.add(n); out.append(n)
            if not j.get("hasMore") or not j.get("minCursor") or j.get("minCursor") == cursor or not j.get("userList"):
                break
            cursor = j["minCursor"]
            await asyncio.sleep(1.2 + random.random())
    if log:
        log.info("tiktok followers: %s", len(out))
    return out


def merge(current: list[str], newest_first: list[str]) -> tuple[list[str], int, int, int]:
    """Как update.html: порядок домов не меняется; отписавшиеся → «~ник»; новые — в конец.
    Возвращает (новый список, новых, отписались, вернулись)."""
    nk = lambda e: e.lstrip("~").lower()
    inc = set(newest_first)
    active = sum(1 for e in current if not e.startswith("~"))
    full = len(newest_first) >= active * 0.8
    gone = back = 0
    kept = []
    for e in current:
        n, was = nk(e), e.startswith("~")
        if n in inc:
            back += was
            kept.append(n)
        elif full:
            gone += not was
            kept.append("~" + n)
        else:
            kept.append(e)
    have = {nk(e) for e in current}
    fresh = [n for n in reversed(newest_first) if n not in have]
    return kept + fresh, len(fresh), gone, back
