"""Дом по описанию: локальная нейросеть (Ollama) собирает 3D-дом из деталей, Chrome рисует превью."""
import json, re

import httpx

import tiktok  # общий невидимый Chrome

PART_T = ["box", "cyl", "cone", "sphere", "dome", "pyramid", "torus"]

SYSTEM = """Ты — архитектор игрушечного 3D-города. По описанию жителя собери ДОМ из простых деталей.
Ответь ТОЛЬКО JSON: {"name": "короткое название по-русски", "lights": "warm|cool|pink|green", "parts": [ ... ]}

Деталь: {"t": тип, "p": [x, y, z], "s": [ширина, высота, глубина], "c": "#цвет", "g": свечение 0..1, "r": поворот в градусах, "w": окна true/false}
Типы: box (коробка), cyl (цилиндр), cone (конус), sphere (шар), dome (купол-полусфера), pyramid (4-скатная крыша), torus (бублик, лежит плашмя).
Координаты: участок от -0.5 до 0.5 по x и z, y — высота НИЗА детали (земля = 0), максимум 2.2. Размеры 0.02..1 (высота до 1.6).
p — центр детали по x/z и её НИЗ по y. Детали ставь друг на друга: низ верхней = низ нижней + её высота.
Правила:
- Это должен быть ДОМ, в котором живут: основной корпус с "w": true (окна), дверь спереди (тонкий тёмный box у z≈0.4), крыша.
- 6–25 деталей. Яркие, но гармоничные цвета. Светящиеся детали ("g") — для фонарей, неона, иллюминаторов.
- Передай идею узнаваемо формой и цветом (ракета — цилиндр+конус+стабилизаторы; пончик — torus с глазурью; кот — уши-конусы на крыше).
- Никаких надписей, людей и логотипов брендов."""

EXAMPLE_USER = "уютный домик с трубой и садом"
EXAMPLE = {"name": "Уютный домик", "lights": "warm", "parts": [
    {"t": "box", "p": [0, 0, 0], "s": [0.7, 0.6, 0.6], "c": "#f2c48d", "w": True},
    {"t": "pyramid", "p": [0, 0.6, 0], "s": [0.78, 0.35, 0.68], "c": "#c2414b"},
    {"t": "box", "p": [0, 0, 0.31], "s": [0.16, 0.28, 0.02], "c": "#5a3a22"},
    {"t": "box", "p": [0.2, 0.75, -0.1], "s": [0.08, 0.3, 0.08], "c": "#7a5a5a"},
    {"t": "sphere", "p": [-0.38, 0, 0.38], "s": [0.18, 0.18, 0.18], "c": "#2fbf71"},
    {"t": "sphere", "p": [0.38, 0.3, 0.38], "s": [0.06, 0.06, 0.06], "c": "#ffd27a", "g": 1}]}


def _num(v, a, b, d):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return d
    return max(a, min(b, v))


def clean(parts):
    out = []
    for q in (parts or [])[:48]:
        if not isinstance(q, dict) or q.get("t") not in PART_T:
            continue
        p, s = q.get("p") or [0, 0, 0], q.get("s") or [0.3, 0.3, 0.3]
        p = (list(p) + [0, 0, 0])[:3]
        s = (list(s) + [0.3, 0.3, 0.3])[:3]
        c = q.get("c") if isinstance(q.get("c"), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", q.get("c") or "") else "#cccccc"
        out.append({"t": q["t"], "p": [_num(p[0], -.5, .5, 0), _num(p[1], 0, 2.2, 0), _num(p[2], -.5, .5, 0)],
                    "s": [_num(s[0], .02, 1, .3), _num(s[1], .02, 1.6, .3), _num(s[2], .02, 1, .3)],
                    "c": c, "g": _num(q.get("g", 0), 0, 1, 0), "r": _num(q.get("r", 0), -360, 360, 0), "w": bool(q.get("w"))})
    return out


async def generate(text: str, url: str, model: str) -> dict:
    """→ рецепт {'shape':'custom','name','lights','parts'}; RuntimeError, если Ollama недоступна или ответ плохой."""
    msgs = [{"role": "system", "content": SYSTEM},
            {"role": "user", "content": EXAMPLE_USER}, {"role": "assistant", "content": json.dumps(EXAMPLE, ensure_ascii=False)},
            {"role": "user", "content": text}]
    last = "пустой ответ"
    async with httpx.AsyncClient(timeout=600) as c:
        for _ in range(3):
            try:
                r = await c.post(url.rstrip("/") + "/api/chat", json={"model": model, "messages": msgs, "format": "json", "stream": False,
                                                                      "options": {"temperature": 0.8, "num_ctx": 4096}})
            except httpx.HTTPError as e:
                raise RuntimeError(f"Ollama не отвечает ({e.__class__.__name__}) — запущена ли она?")
            if r.status_code == 404:
                raise RuntimeError(f"в Ollama нет модели {model} — она скачивается при запуске бота")
            try:
                j = json.loads(r.json()["message"]["content"])
                parts = clean(j.get("parts"))
            except (ValueError, KeyError, TypeError) as e:
                last = f"неверный JSON ({e})"
                continue
            if len(parts) >= 3:
                lights = j.get("lights") if j.get("lights") in ("warm", "cool", "pink", "green") else "warm"
                return {"shape": "custom", "name": str(j.get("name") or "Дом по описанию")[:40], "lights": lights, "parts": parts}
            last = "слишком мало деталей"
    raise RuntimeError("нейросеть не собрала дом: " + last)


async def preview(recipe: dict, site_base: str) -> bytes:
    """PNG-превью дома через невидимый Chrome и preview.html с сайта."""
    ctx = await tiktok._context()
    try:
        page = await ctx.new_page()
        await page.set_viewport_size({"width": 640, "height": 640})
        await page.goto(site_base + "preview.html", wait_until="load", timeout=60000)
        await page.wait_for_function("window.done === true", timeout=60000)
        await page.evaluate("r => window.render(r)", recipe)
        await page.wait_for_timeout(400)
        return await page.locator("#c").screenshot(type="png")
    finally:
        await ctx.close()
