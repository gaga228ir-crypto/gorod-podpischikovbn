"""Дома по пожеланиям из комментариев TikTok (15.11.2026, под роликом «Подписчик заказал — я построил»).
python tools/comment_houses.py → печатает проверку и пишет comment_houses.json (ник → рецепт) в scratchpad/корень по аргументу."""
import json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from handmade import H


def gear_flat(h, cx, y, cz, R, col, teeth=12, g=.25):
    """Горизонтальная шестерня: обод (тор) + зубцы по кругу + ступица."""
    h.p("torus", cx, y, cz, 2 * R, .1, 2 * R, col, g)
    for i in range(teeth):
        a = 2 * math.pi * i / teeth
        h.p("box", cx + math.cos(a) * R * 1.06, y - .012, cz + math.sin(a) * R * 1.06, .07, .05, .05, col, g, r=-math.degrees(a))
    h.p("cyl", cx, y - .01, cz, R * .45, .05, R * .45, col, g)


def gear_wall(h, cx, cy, z, R, col, g=.2):
    """Вертикальная шестерня на фасаде (пиксельная): крест + углы + 8 зубцов + тёмная ступица."""
    d = .025
    h.p("box", cx, cy - R * .62, z, R * 2 * .62, R * 2 * .62, d, col, g)
    h.p("box", cx, cy - R * .85, z, R * 2 * .38, R * 2 * .85, d, col, g)
    h.p("box", cx, cy - R * .38, z, R * 2 * .85, R * 2 * .38, d, col, g)
    t = R * .3
    for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        h.p("box", cx + dx * (R + t * .4), cy + dy * (R + t * .4) - t / 2, z, t, t, d, col, g)
    for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        k = (R + t * .2) * .72
        h.p("box", cx + dx * k, cy + dy * k - t / 2, z, t, t, d, col, g)
    h.p("box", cx, cy - R * .2, z + .006, R * .4, R * .4, d, "#3a2a18")


def steampunk_house():
    """@ceryn: «жёлтый с большими шестернями в стиле стимпанк»."""
    h = H("Паровой особняк", "warm")
    yel, yel2, brass, copper, dark, iron = "#f2c12e", "#e0a91c", "#d6a432", "#c0692e", "#3b2a1a", "#55585e"
    h.p("box", 0, 0, 0, .96, .05, .96, "#6b5236")
    for i in range(3):  # плитка-дорожка
        h.p("box", .1, .05, .44 - i * .09, .14, .006, .06, "#a8906a")
    y = h.p("box", 0, .05, -.03, .68, .64, .56, yel, win=True)
    for yy in (.05, .36, .66):  # медные пояса
        h.p("box", 0, yy, -.03, .7, .03, .58, copper, .1)
    # медные трубы по углам фасада
    for x in (-.345, .345):
        h.p("cyl", x, .05, .255, .05, .78, .05, copper, .1)
        h.p("sphere", x, .82, .255, .07, .07, .07, brass, .3)
    h.p("box", 0, .5, .265, .69, .035, .035, copper, .1)  # горизонтальная труба
    # дверь с латунной рамкой
    h.p("box", .1, .05, .255, .17, .27, .02, brass, .2)
    h.p("box", .1, .06, .262, .13, .24, .02, dark)
    h.p("sphere", .145, .17, .275, .02, .02, .02, brass, .6)
    # большая шестерня на фасаде + маленькая сцепленная
    gear_wall(h, -.14, .26, .262, .14, brass, .25)
    gear_wall(h, -.14 + .22, .44, .262, .075, copper, .2)
    # крыша: плоская, с ограждением
    h.p("box", 0, y, -.03, .72, .04, .6, dark)
    # башня с часами и куполом
    h.p("cyl", .2, y + .04, -.12, .26, .42, .26, yel2, win=True)
    h.p("torus", .2, y + .44, -.12, .3, .05, .3, copper, .15)
    h.p("sphere", .2, y + .42, -.12, .26, .24, .26, brass, .25)
    h.p("cyl", .2, y + .6, -.12, .02, .2, .02, iron)
    h.p("sphere", .2, y + .8, -.12, .05, .05, .05, "#ffcf5a", 1)
    # главная большая шестерня на крыше (горизонтально, на оси) + вторая поменьше выше
    h.p("cyl", -.15, y + .04, .02, .05, .36, .05, iron)
    gear_flat(h, -.15, y + .12, .02, .2, brass, 12, .3)
    gear_flat(h, -.15, y + .3, .02, .11, copper, 8, .25)
    # паровые трубы с дымом
    for x, z, hh in ((-.3, -.24, .5), (-.18, -.26, .38)):
        h.p("cyl", x, y + .04, z, .07, hh, .07, iron)
        h.p("cyl", x, y + .04 + hh, z, .1, .04, .1, copper, .1)
    for i, (dx, s) in enumerate(((0, .1), (.04, .13), (.1, .16))):
        h.p("sphere", -.3 + dx, y + .6 + i * .12, -.24, s, s * .8, s, "#d9d9de")
    # фонарь у входа
    h.p("cyl", .38, .05, .42, .025, .4, .025, iron)
    h.p("sphere", .38, .44, .42, .07, .08, .07, "#ffcf5a", 1)
    # дирижабль-флюгер над домом
    h.p("sphere", .05, y + .95, -.05, .34, .13, .13, "#b8562f", .1)
    h.p("box", .05, y + .89, -.05, .1, .04, .05, dark)
    h.p("cyl", .05, y + .62, -.05, .01, .29, .01, iron)
    return h.r


def medieval_castle():
    """@ri_sirix: «замок из средневековья»."""
    h = H("Средневековый замок", "warm")
    stone, stone2, dark, roof, wood = "#a7a39a", "#8d8981", "#3a3530", "#b23a3a", "#7a5230"
    h.p("box", 0, 0, 0, .98, .04, .98, "#5f8f4a")
    h.p("box", 0, .04, 0, .74, .02, .74, "#9c8f7a")  # двор
    W, T, Hh = .7, .06, .3
    # стены по периметру
    for x, z, w, d in ((0, W / 2, W, T), (0, -W / 2, W, T), (W / 2, 0, T, W), (-W / 2, 0, T, W)):
        if z == W / 2:  # фасад с воротами: две части стены
            h.p("box", -.22, .04, z, .26, Hh, T, stone)
            h.p("box", .22, .04, z, .26, Hh, T, stone)
            h.p("box", 0, .26, z, .18, .08, T, stone)
        else:
            h.p("box", x, .04, z, w, Hh, d, stone)
    # зубцы на стенах
    for i in range(6):
        u = -.27 + i * .108
        for x, z in ((u, W / 2), (u, -W / 2), (W / 2, u), (-W / 2, u)):
            h.p("box", x, .04 + Hh, z, .05, .05, .065, stone2)
    # ворота: решётка + подъёмный мост
    for i in range(4):
        h.p("box", -.06 + i * .04, .04, W / 2 + .01, .012, .22, .012, dark)
    h.p("box", 0, .2, W / 2 + .01, .17, .012, .012, dark)
    h.p("box", 0, .01, W / 2 + .1, .16, .03, .16, wood)
    for x in (-.075, .075):
        h.p("box", x, .04, W / 2 + .04, .01, .2, .01, dark)
    # четыре угловые башни с красными конусами и флажками
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * W / 2, sz * W / 2
            h.p("cyl", x, .04, z, .17, .46, .17, stone, win=True)
            h.p("cyl", x, .5, z, .2, .04, .2, stone2)
            h.p("cone", x, .54, z, .22, .26, .22, roof)
            h.p("cyl", x, .8, z, .01, .12, .01, dark)
            h.p("box", x + .04, .87, z, .07, .045, .008, "#ffd23f", .2)
    # донжон с окнами и пирамидальной крышей
    y = h.p("box", 0, .06, -.1, .32, .62, .28, stone2, win=True)
    for i in range(4):
        h.p("box", -.12 + i * .08, y, .04, .045, .05, .02, stone)
        h.p("box", -.12 + i * .08, y, -.24, .045, .05, .02, stone)
    h.p("pyramid", 0, y, -.1, .34, .32, .3, roof)
    h.p("cyl", 0, y + .32, -.1, .012, .22, .012, dark)
    h.p("box", .07, y + .44, -.1, .13, .08, .01, "#3d5a99", .2)
    h.p("box", .07, y + .47, -.095, .04, .02, .01, "#ffd23f", .5)  # герб на знамени
    # гербы-щиты на донжоне и факелы у ворот
    h.p("box", 0, .36, .045, .08, .1, .01, "#3d5a99", .1)
    h.p("box", 0, .39, .052, .04, .04, .01, "#ffd23f", .4)
    for x in (-.11, .11):
        h.p("cyl", x, .14, W / 2 + .04, .015, .06, .015, wood)
        h.p("sphere", x, .2, W / 2 + .04, .035, .05, .035, "#ff9a2e", 1)
    # колодец и телега во дворе
    h.p("cyl", -.2, .06, .12, .1, .06, .1, stone2)
    h.p("box", .2, .06, .14, .12, .05, .07, wood)
    # деревья за стенами
    for x, z in ((-.44, .44), (.45, -.45), (.45, .44)):
        h.p("cyl", x, .04, z, .03, .1, .03, "#6b4a2a")
        h.p("cone", x, .12, z, .1, .2, .1, "#2f7a3f")
    return h.r


def laser_citadel():
    """М.свин: «замок из чёрного стекла и металла с боевыми лазерными турелями на башнях, способными испарять всё живое»."""
    h = H("Цитадель чёрного стекла", "pink")
    glass, glass2, metal, metal2, red, dark = "#15161c", "#1f2230", "#8a8f99", "#5d626c", "#ff2a2a", "#0b0b0f"
    h.p("box", 0, 0, 0, .98, .04, .98, "#2a2d35")
    h.p("box", 0, .04, 0, .78, .02, .78, metal2)
    # основной корпус + стены
    y = h.p("box", 0, .06, 0, .46, .5, .46, glass, .05, win=True)
    h.p("box", 0, .06, 0, .48, .03, .48, metal)
    h.p("box", 0, y - .03, 0, .48, .03, .48, metal)
    for x, z, w, d in ((0, .34, .5, .04), (0, -.34, .5, .04), (.34, 0, .04, .5), (-.34, 0, .04, .5)):
        h.p("box", x, .06, z, w, .2, d, glass2, .05)
        h.p("box", x, .26, z, w, .02, d, red, 1)  # красная неоновая кромка
    # ворота: красная светящаяся щель
    h.p("box", 0, .06, .235, .1, .22, .01, red, 1)
    h.p("box", 0, .06, .36, .12, .16, .01, dark)
    # центральный шпиль из чёрного стекла с красным ядром
    h.p("box", 0, y, 0, .3, .04, .3, metal)
    h.p("pyramid", 0, y + .04, 0, .26, .7, .26, glass2, .05)
    h.p("sphere", 0, y + .36, 0, .1, .1, .1, red, 1)
    for a in (0, 90, 180, 270):  # металлические рёбра шпиля
        h.p("box", .07 * math.cos(math.radians(a)), y + .04, .07 * math.sin(math.radians(a)), .015, .45, .015, metal, r=a)
    h.p("cyl", 0, y + .74, 0, .01, .25, .01, metal)
    h.p("sphere", 0, y + .99, 0, .04, .04, .04, red, 1)
    # четыре башни с лазерными турелями
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * .34, sz * .34
            ang = math.degrees(math.atan2(sz, sx))
            h.p("cyl", x, .06, z, .18, .78, .18, glass, .05, win=True)
            for yy in (.3, .56):
                h.p("cyl", x, yy, z, .2, .025, .2, metal)
            h.p("cyl", x, .84, z, .22, .05, .22, metal2)
            # турель: поворотная платформа, корпус, двойной ствол наружу, красная линза
            h.p("cyl", x, .89, z, .12, .05, .12, metal)
            h.p("box", x, .94, z, .13, .08, .1, metal2, r=-ang)
            for k in (-1, 1):
                ox, oz = -math.sin(math.radians(ang)) * .025 * k, math.cos(math.radians(ang)) * .025 * k
                h.p("box", x + sx * .08 / 1.41 + ox, .96, z + sz * .08 / 1.41 + oz, .14, .02, .02, metal, r=-ang)
            h.p("sphere", x + sx * .115 + 0, .955, z + sz * .115, .04, .04, .04, red, 1)
    # лазерные лучи между турелями (красная сетка над цитаделью)
    for x, z, w, d in ((0, .34, .62, .008), (0, -.34, .62, .008), (.34, 0, .008, .62), (-.34, 0, .008, .62)):
        h.p("box", x, .965, z, w, .008, d, red, 1)
    # шипы по углам основания
    for x, z in ((-.45, -.45), (.45, -.45), (-.45, .45), (.45, .45)):
        h.p("cone", x, .04, z, .06, .18, .06, metal)
    return h.r


if __name__ == "__main__":
    out = {"ceryn": steampunk_house(), "ri_sirix": medieval_castle(), "m.svin": laser_citadel()}
    for k, v in out.items():
        bad = [q for q in v["parts"] if q["p"][1] + q["s"][1] > 2.2 or max(q["s"][0], q["s"][2]) > 1 or q["s"][1] > 1.6 or abs(q["p"][0]) > .5 or abs(q["p"][2]) > .5]
        print(k, v["name"], len(v["parts"]), "деталей", "ОШИБКИ:" if bad or len(v["parts"]) > 120 else "ок", bad[:2])
    Path(sys.argv[1] if len(sys.argv) > 1 else "comment_houses.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
