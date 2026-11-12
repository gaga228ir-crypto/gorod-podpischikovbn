"""Конструктор архитектора: нейросеть выбирает ПАРАМЕТРЫ здания, а этот код ровно собирает его из деталей.
Детали — тот же формат, что понимает сайт (city3d.js makeParts): {t, p:[x, низ_y, z], s:[w, h, d], c, g, r, w}.
Ничего не парит и не проваливается: каждая деталь ставится на верх предыдущей."""
import math
import re

TYPES = ["house", "tower", "skyscraper", "castle", "rocket", "shop", "mansion", "temple", "lighthouse", "spaceship", "treehouse", "pagoda"]
ROOFS = ["pyramid", "flat", "dome", "cone", "spire"]
MATERIALS = ["brick", "glass", "ice", "wood", "metal", "neon", "stone", "candy"]
DECOR = ["garland", "tree", "flag", "antenna", "sign", "graffiti", "balcony", "chimney", "owl", "cat", "snow", "crystals", "fence", "car", "stairs", "clouds"]
LIGHTS = ["warm", "cool", "pink", "green"]

MAX_Y = 2.2


def _hex(v, d):
    return v.lower() if isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", v) else d


def _mix(c, k):
    """Светлее (k>0) или темнее (k<0) цвет."""
    r, g, b = (int(c[i:i + 2], 16) for i in (1, 3, 5))
    f = (lambda x: x + (255 - x) * k) if k > 0 else (lambda x: x * (1 + k))
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(f(x)))) for x in (r, g, b))


MAT = {  # стены, крыша, акцент, свечение стен
    "brick": ("#c8644b", "#7a2f2f", "#ffd27a", 0), "glass": ("#6fb7ff", "#2a3f7a", "#5ef2ff", .15),
    "ice": ("#bfe9ff", "#7fd3ff", "#e8fbff", .35), "wood": ("#a8713f", "#5a3a22", "#ffc95e", 0),
    "metal": ("#9aa3b5", "#4a5068", "#ff3d7f", .05), "neon": ("#2a1f55", "#160f33", "#ff3d7f", .1),
    "stone": ("#8d8a99", "#4f4b5e", "#ffd23f", 0), "candy": ("#ffb3d9", "#ff5fa2", "#fff3a0", .1),
}


class B:
    def __init__(self):
        self.parts = []

    def add(self, t, x, y, z, w, h, d, c, g=0.0, r=0.0, win=False):
        if y >= MAX_Y - .01 or h <= 0:
            return y
        h = min(h, 1.6, MAX_Y - y)
        w, d = max(.02, min(1, w)), max(.02, min(1, d))
        x, z = max(-.5, min(.5, x)), max(-.5, min(.5, z))
        self.parts.append({"t": t, "p": [round(x, 3), round(y, 3), round(z, 3)], "s": [round(w, 3), round(h, 3), round(d, 3)],
                           "c": c, "g": round(g, 2), "r": round(r, 1), "w": bool(win)})
        return y + h

    def stack(self, t, x, y, z, w, h, d, c, g=0.0, win=False):
        """Высокий корпус: режем на куски по 1.6, чтобы не упереться в лимит высоты детали."""
        while h > 1e-3 and y < MAX_Y - .01:
            hh = min(h, 1.6)
            y = self.add(t, x, y, z, w, hh, d, c, g, win=win)
            h -= hh
        return y


def _int(v, a, b, d):
    try:
        return max(a, min(b, int(float(v))))
    except (TypeError, ValueError):
        return d


def norm(spec: dict) -> dict:
    s = spec if isinstance(spec, dict) else {}
    pick = lambda k, opts, d: s.get(k) if s.get(k) in opts else d
    mat = pick("material", MATERIALS, "brick")
    mw, mr, ma, _ = MAT[mat]
    floors = _int(s.get("floors"), 1, 9, 2)
    decor = [x for x in (s.get("decor") or []) if x in DECOR][:6] if isinstance(s.get("decor"), list) else []
    return {"name": str(s.get("name") or "Дом по описанию")[:40], "type": pick("type", TYPES, "house"), "floors": floors,
            "material": mat, "roof": pick("roof", ROOFS, "pyramid"), "towers": _int(s.get("towers"), 0, 4, 0),
            "wall": _hex(s.get("wall"), mw), "roofColor": _hex(s.get("roofColor"), mr), "accent": _hex(s.get("accent"), ma),
            "lights": pick("lights", LIGHTS, "warm"), "decor": decor, "floating": bool(s.get("floating"))}


def _roof(b, kind, x, y, z, w, d, c, acc):
    if kind == "flat":
        y = b.add("box", x, y, z, w + .04, .05, d + .04, c)
        return y
    if kind == "dome":
        return b.add("dome", x, y, z, w * .9, min(w, d) * .55, d * .9, c, .15)
    if kind == "cone":
        return b.add("cone", x, y, z, w * 1.05, min(.6, w * 1.1), d * 1.05, c)
    if kind == "spire":
        y = b.add("pyramid", x, y, z, w * 1.02, .2, d * 1.02, c)
        y = b.add("cone", x, y, z, w * .3, .45, d * .3, c)
        return b.add("sphere", x, y - .02, z, .06, .06, .06, acc, 1)
    return b.add("pyramid", x, y, z, w * 1.1, min(.42, w * .6), d * 1.1, c)


def build(spec: dict) -> dict:
    S = norm(spec)
    b, T, F = B(), S["type"], S["floors"]
    wall, roof, acc, mat = S["wall"], S["roofColor"], S["accent"], S["material"]
    wg = MAT[mat][3]
    y0 = 0.0
    if S["floating"]:  # парящий остров: каменные «ступени» сужаются книзу, под ними светящиеся кристаллы
        b.add("cone", 0, 0, 0, .14, .1, .14, acc, .9)
        for i, (rr, hh) in enumerate([(.3, .08), (.5, .08), (.72, .08), (.9, .07)]):
            b.add("cyl", 0, .1 + i * .08, 0, rr, hh, rr, _mix("#5a4f6e", i * .08))
        y0 = .41
        b.add("cyl", 0, y0, 0, .92, .03, .92, "#2f8a5a" if mat not in ("ice", "candy") else _mix(wall, .4))
        y0 += .03
    fh = .2  # высота этажа
    top = y0
    front = .0  # z передней стены корпуса
    W = D = .56
    if T == "castle":
        W = D = .5
        h = min(F, 4) * fh
        top = b.stack("box", 0, y0, 0, W, h, D, wall, wg, True)
        for i in range(5):  # зубцы
            for zz in (-.22, .22):
                b.add("box", -.2 + i * .1, top, zz, .07, .07, .06, wall)
        for xx in (-.2, .2):
            b.add("box", xx, top, 0, .06, .07, .07, wall)
        n = S["towers"] or 4
        spots = [(-.3, -.3), (.3, -.3), (-.3, .3), (.3, .3)][:max(2, n)]
        for xx, zz in spots:
            tt = b.stack("cyl", xx, y0, zz, .2, h + .3, .2, _mix(wall, -.08), wg, True)
            _roof(b, "cone" if S["roof"] in ("pyramid", "cone", "spire") else S["roof"], xx, tt, zz, .24, .24, roof, acc)
        b.add("box", 0, y0, D / 2, .14, .2, .02, "#2a1a10")
        b.add("box", 0, y0 + .2, D / 2, .14, .03, .02, acc, .8)
        top = top + .07
        front = D / 2
    elif T == "rocket":
        h = .9 + min(F, 6) * .08
        b.add("box", 0, y0, 0, .5, .02, .06, acc, .3)
        for r in (0, 90):
            b.add("box", 0, y0, 0, .48, .22, .04, roof, r=r)
        top = b.stack("cyl", 0, y0, 0, .28, h, .28, wall, wg)
        for i in range(3):
            b.add("sphere", 0, y0 + .3 + i * .22, .13, .08, .08, .03, acc, 1)
        top = b.add("cone", 0, top, 0, .28, .4, .28, roof)
        front = .14
    elif T in ("tower", "lighthouse"):
        W = D = .36
        h = max(3, F) * fh
        kind = "cyl" if T == "lighthouse" else "box"
        if T == "lighthouse":
            for i in range(max(3, F)):
                y = y0 + i * fh
                b.add("cyl", 0, y, 0, .36 - i * .015, fh, .36 - i * .015, wall if i % 2 == 0 else acc)
            top = y0 + max(3, F) * fh
            top = b.add("cyl", 0, top, 0, .3, .16, .3, "#fff6c8", 1)
            top = _roof(b, "dome", 0, top, 0, .3, .3, roof, acc)
        else:
            top = b.stack(kind, 0, y0, 0, W, h, D, wall, wg, True)
            top = _roof(b, S["roof"] if S["roof"] != "flat" else "spire", 0, top, 0, W, D, roof, acc)
        front = D / 2
    elif T == "skyscraper":
        tiers = [(.6, .5), (.46, .3), (.32, .2)]
        y = y0
        total = max(4, F) * .17
        for i, (w, part) in enumerate(tiers):
            y = b.stack("box", 0, y, 0, w, total * part, w, wall if i % 2 == 0 else _mix(wall, .12), wg, True)
            if i < 2:
                y = b.add("box", 0, y, 0, w + .03, .03, w + .03, acc, .8)
        top = y
        if S["roof"] in ("spire", "cone"):
            top = _roof(b, "spire", 0, top, 0, .2, .2, roof, acc)
        front = .3
    elif T == "pagoda":
        y = y0
        for i in range(max(2, min(F, 5))):
            w = .52 - i * .08
            y = b.add("box", 0, y, 0, w, .17, w, wall, wg, True)
            y = b.add("pyramid", 0, y, 0, w + .2, .08, w + .2, roof)
        top = b.add("cone", 0, y, 0, .05, .2, .05, acc, .8)
        front = .26
    elif T == "spaceship":
        b.add("cyl", 0, y0, 0, .3, .12, .3, "#4a5068")
        y = b.add("cyl", 0, y0 + .12, 0, .95, .1, .95, wall, wg)
        b.add("torus", 0, y0 + .14, 0, .95, .08, .95, acc, 1)
        top = b.add("dome", 0, y, 0, .5, .3, .5, _mix(acc, .5), .5)
        for i in range(8):
            a = i / 8 * math.tau
            b.add("sphere", math.cos(a) * .42, y0 + .14, math.sin(a) * .42, .05, .05, .05, acc, 1)
        front = .45
    elif T == "treehouse":
        b.add("cyl", 0, y0, 0, .16, .6, .16, "#6b4426")
        b.add("sphere", 0, y0 + .9, 0, .8, .6, .8, "#2fbf71", .1)
        y = b.add("box", 0, y0 + .5, .1, .4, .03, .4, "#8a5a2b")
        y = b.add("box", 0, y, .1, .32, .26, .3, wall, wg, True)
        top = _roof(b, S["roof"], 0, y, .1, .32, .3, roof, acc)
        for i in range(5):
            b.add("box", .22, y0 + i * .1, .32, .1, .02, .04, "#8a5a2b")
        front = .25
    else:
        if T == "shop":
            W, D, F = .7, .5, min(F, 2)
        elif T == "mansion":
            W, D = .48, .48
        elif T == "temple":
            W, D, F = .6, .5, min(F, 2)
        h = F * fh
        top = b.stack("box", 0, y0, 0, W, h, D, wall, wg, True)
        if T == "mansion":
            for xx in (-.37, .37):
                wt = b.add("box", xx, y0, 0, .24, max(fh, h - fh), .4, _mix(wall, -.06), wg, True)
                _roof(b, "pyramid", xx, wt, 0, .24, .4, roof, acc)
        if T == "temple":
            for i in range(5):
                b.add("cyl", -.24 + i * .12, y0, D / 2 + .06, .05, h, .05, _mix(wall, .3))
            b.add("box", 0, y0 + h, .04, W + .04, .04, D + .12, _mix(wall, .2))
            top += .04
            top = _roof(b, "dome", 0, top, 0, W * .8, D * .8, roof, acc)
        else:
            top = _roof(b, S["roof"], 0, top, 0, W, D, roof, acc)
        if T == "shop":
            b.add("box", 0, y0 + .25, D / 2 + .05, W, .03, .12, acc, .5)
            b.add("box", 0, y0 + .3, D / 2 + .01, W * .7, .1, .02, acc, 1)
        front = D / 2
        if S["towers"] and T != "shop":
            for i, xx in enumerate([.34, -.34, .34, -.34][:S["towers"]]):
                zz = -.25 if i >= 2 else .2
                tt = b.stack("cyl", xx, y0, zz, .16, h + .25, .16, _mix(wall, -.1), wg, True)
                _roof(b, "cone", xx, tt, zz, .18, .18, roof, acc)
    # дверь (кроме ракеты и корабля)
    if T not in ("rocket", "spaceship", "castle", "treehouse"):
        b.add("box", 0, y0, front + .005, .12, .18, .02, "#2a1a10")
        b.add("sphere", 0, y0 + .2, front + .02, .04, .04, .04, "#ffc95e", 1)
    # украшения
    dec = set(S["decor"])
    if "chimney" in dec and T in ("house", "mansion", "shop"):
        b.add("box", .16, top - .25, -.1, .07, .3, .07, "#6b5a6e")
    if "antenna" in dec or (T == "skyscraper" and "flag" not in dec):
        y = b.add("cyl", 0, top, 0, .02, .3, .02, "#9aa0c0")
        b.add("sphere", 0, y, 0, .05, .05, .05, "#ff3b3b", 1)
    if "flag" in dec:
        y = b.add("cyl", 0, top, 0, .015, .3, .015, "#d0d0e0")
        b.add("box", .07, y - .1, 0, .13, .08, .01, acc, .6)
    if "owl" in dec or "cat" in dec:  # зверь на крыше: тело, голова, светящиеся глаза, ушки
        big = "owl" in dec
        col = "#8a6a48" if big else "#f2a54a"
        y = b.add("sphere", 0, top - .02, .02, .2 if big else .14, .2 if big else .12, .18 if big else .14, col, .1)
        y = b.add("sphere", 0, y - .04, .02, .17 if big else .12, .15 if big else .11, .15 if big else .12, col, .1)
        for xx in (-.04, .04):
            b.add("sphere", xx, y - .1, .09, .045, .045, .02, "#ffe14d" if big else "#a6ff8f", 1)
            b.add("cone", xx * 1.3, y - .03, .02, .04, .07, .04, col)
    if "garland" in dec:
        for i in range(9):
            b.add("sphere", -W / 2 + i * W / 8, y0 + fh * min(F, 2) - .04, front + .02, .035, .035, .035,
                  ["#ff3d7f", "#ffd23f", "#5ef2ff", "#a6ff8f"][i % 4], 1)
    if "graffiti" in dec:  # граффити: яркие пятна и полосы на передней и боковой стене
        cols = [acc, "#ff3d7f", "#ffd23f", "#5ef2ff", "#a6ff8f", "#c084fc"]
        hh = max(.2, top - y0 - .3)
        for i in range(10):
            yy = y0 + .05 + (i * .37 % 1) * hh
            b.add("box", -W / 2 + .06 + (i * .29 % 1) * (W - .12), yy, front + .006, .06 + (i % 3) * .05, .03 + (i % 2) * .05, .012, cols[i % len(cols)], .9)
            b.add("box", W / 2 + .006, yy, -D / 2 + .06 + (i * .41 % 1) * (D - .12), .012, .04 + (i % 3) * .03, .08, cols[(i + 2) % len(cols)], .9)
    if "sign" in dec and T != "shop":
        b.add("box", 0, y0 + .22, front + .01, .3, .08, .02, acc, 1)
    if "balcony" in dec and T in ("house", "mansion", "tower", "skyscraper"):
        for f in range(1, min(F, 5)):
            b.add("box", .12, y0 + f * fh, front + .04, .16, .02, .08, _mix(wall, -.2))
            b.add("box", .12, y0 + f * fh + .02, front + .075, .16, .05, .01, acc, .5)
    if "stairs" in dec:  # лестница к двери; у парящего дома — парящие ступени-плитки
        n = 6 if y0 else 3
        for k in range(n):
            yy = max(0, y0 - (k + 1) * (y0 / n if y0 else .03))
            b.add("box", 0, yy, min(.48, front + .06 + k * .07), .16, .03, .06, _mix(acc, .5), .8 if mat in ("ice", "neon") or y0 else 0)
    if "tree" in dec:
        b.add("cyl", -.4, y0, .38, .04, .1, .04, "#5a3a22")
        b.add("cone", -.4, y0 + .1, .38, .18, .3, .18, "#1f8a4c")
    if "crystals" in dec or mat == "ice":
        for xx, zz in ((.4, .4), (-.42, -.38), (.42, -.35)):
            b.add("cone", xx, y0, zz, .07, .2, .07, _mix(acc, .3), .8)
    if "snow" in dec:
        b.add("box", 0, top - .02, 0, .3, .02, .3, "#ffffff", .2)
    if "clouds" in dec:
        for xx, yy in ((-.35, top + .05), (.38, top - .2)):
            if yy < MAX_Y - .2:
                b.add("sphere", xx, yy, 0, .22, .1, .14, "#e8ecff", .3)
    if "fence" in dec and not S["floating"]:
        for i in range(9):
            b.add("box", -.44 + i * .11, 0, .46, .02, .1, .02, "#e8e0d0")
    if "car" in dec and not S["floating"]:
        b.add("box", .36, 0, .1, .14, .07, .26, acc)
        b.add("box", .36, .07, .08, .12, .06, .14, "#3b4a7a")
    return {"shape": "custom", "name": S["name"], "lights": S["lights"], "parts": b.parts[:48]}


PROMPT = f"""Ты — архитектор игрушечного неонового 3D-города. Житель описывает дом мечты, ты выбираешь ПАРАМЕТРЫ здания.
Ответь ТОЛЬКО JSON:
{{"name": "короткое название по-русски",
 "type": одно из {TYPES},
 "floors": 1..9,
 "material": одно из {MATERIALS},
 "roof": одно из {ROOFS},
 "towers": 0..4 (боковые башенки),
 "wall": "#цвет стен", "roofColor": "#цвет крыши", "accent": "#цвет неона/украшений",
 "lights": одно из {LIGHTS},
 "floating": true если дом парит в воздухе/на облаке/острове,
 "decor": до 6 из {DECOR}}}
Подсказки: замок → castle + towers; ракета → rocket; кафе/магазин/бизнес → shop + sign; высотка/небоскрёб → skyscraper;
маяк → lighthouse; НЛО/космос → spaceship; японский → pagoda; на дереве → treehouse; дворец/особняк → mansion;
ледяной → material ice; граффити → decor graffiti; сова/кот на крыше → owl/cat; лестница → stairs; гирлянда → garland.
Цвета подбирай под описание, яркие и гармоничные."""
