"""
Особые дома по пожеланиям — через локальную модель в Ollama.

Берёт из базы одобренных жителей с пожеланием и без рецепта,
просит модель превратить пожелание в рецепт дома и сохраняет его.

Запуск (нужен только Python 3, без установки пакетов):
    python make_houses.py            # сделать рецепты всем новым
    python make_houses.py --dry      # только показать, ничего не сохранять
    python make_houses.py --redo nick  # переделать дом одного жителя

Перед первым запуском:
    ollama pull gemma3:12b
и впиши настройки ниже (или задай переменные окружения с теми же именами).
"""
import json, os, sys, getpass, urllib.request, urllib.error

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL = os.getenv("MODEL", "gemma3:12b")  # на 8 ГБ видеопамяти 12b быстрая; 27b умнее, но медленнее

SHAPES = ["house", "tower", "castle", "skyscraper", "dome", "clocktower"]
EMBLEMS = ["none", "sun", "moon", "star", "heart", "clock", "crown", "flame", "leaf", "lightning", "diamond", "snake"]
LIGHTS = ["warm", "cool", "pink", "green"]

SCHEMA = {
    "type": "object",
    "properties": {
        "shape": {"type": "string", "enum": SHAPES},
        "floors": {"type": "integer", "minimum": 1, "maximum": 6},
        "wall": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
        "roof": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"},
        "emblem": {"type": "string", "enum": EMBLEMS},
        "lights": {"type": "string", "enum": LIGHTS},
    },
    "required": ["shape", "floors", "wall", "roof", "emblem", "lights"],
}

SYSTEM = """Ты архитектор мультяшного ночного города. По пожеланию жителя выбери дом из ГОТОВЫХ деталей.
Формы (shape): house — домик с треугольной крышей; tower — узкая башня со шпилем; castle — замок с зубцами и башенкой;
skyscraper — небоскрёб с антенной; dome — здание с куполом; clocktower — башня с часами (как Биг-Бен).
floors — этажей 1..6 (выше = больше). wall и roof — цвета в формате #rrggbb, яркие и мультяшные.
emblem — знак на фасаде: none, sun, moon, star, heart, clock, crown, flame, leaf, lightning, diamond, snake.
lights — цвет окон: warm, cool, pink, green.
Если пожелание нельзя сделать буквально, выбери самое близкое по смыслу. Мат и оскорбления игнорируй — сделай обычный дом.
Ответь только JSON."""


def http(method, url, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Ошибка {e.code} от {url.split('?')[0]}: {e.read().decode()[:300]}")


def login():
    email = ADMIN_EMAIL or input("Email админа: ")
    pw = os.getenv("ADMIN_PASSWORD") or getpass.getpass("Пароль админа: ")
    j = http("POST", f"{SUPABASE_URL}/auth/v1/token?grant_type=password", {"email": email, "password": pw}, {"apikey": SUPABASE_ANON_KEY})
    return j["access_token"]


def norm(r):
    hexok = lambda s: isinstance(s, str) and len(s) == 7 and s[0] == "#" and all(c in "0123456789abcdefABCDEF" for c in s[1:])
    return {
        "shape": r.get("shape") if r.get("shape") in SHAPES else "house",
        "floors": max(1, min(6, int(r.get("floors") or 2))),
        "wall": r.get("wall") if hexok(r.get("wall")) else "#f28b82",
        "roof": r.get("roof") if hexok(r.get("roof")) else "#c2414b",
        "emblem": r.get("emblem") if r.get("emblem") in EMBLEMS else "none",
        "lights": r.get("lights") if r.get("lights") in LIGHTS else "warm",
    }


def recipe_for(wish):
    j = http("POST", f"{OLLAMA_URL}/api/chat", {
        "model": MODEL, "stream": False, "format": SCHEMA, "options": {"temperature": 0.4},
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": f"Пожелание жителя: {wish}"}],
    })
    return norm(json.loads(j["message"]["content"]))


def main():
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        sys.exit("Впиши SUPABASE_URL и SUPABASE_ANON_KEY в начале файла.")
    dry = "--dry" in sys.argv
    redo = sys.argv[sys.argv.index("--redo") + 1].lstrip("@").lower() if "--redo" in sys.argv else None
    token = login()
    h = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"}
    q = "status=eq.approved&select=id,nick,wish"
    q += f"&nick=eq.{redo}" if redo else "&recipe=is.null&wish=neq."
    rows = http("GET", f"{SUPABASE_URL}/rest/v1/residents?{q}&order=approved_at.asc", headers=h) or []
    print(f"Домов к постройке: {len(rows)}  (модель {MODEL})")
    for i, r in enumerate(rows, 1):
        rec = recipe_for(r["wish"])
        print(f"[{i}/{len(rows)}] @{r['nick']}: «{r['wish']}» → {rec['shape']}, {rec['floors']} эт., {rec['emblem']}")
        if not dry:
            http("PATCH", f"{SUPABASE_URL}/rest/v1/residents?id=eq.{r['id']}", {"recipe": rec}, {**h, "Prefer": "return=minimal"})
    print("Готово. Обнови сайт — дома уже там." if not dry else "Пробный прогон, ничего не сохранено.")


if __name__ == "__main__":
    main()
