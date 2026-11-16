"""«Дворец тысячи минаретов» — версия высокой детализации (2000+ деталей) для @errafoster (Anhell), заказ #32.
По двум его картинкам: Каир (ярусные минареты с балкончиками и мукарнами, узорные купола, айван, аркады)
+ Махабат Макбара (винтовые лестницы вокруг минаретов, тёмные купола с золотыми шпилями, беседки-чхатри).
Рецепт с "fine": true — движок разрешает до 3000 деталей и тонкие детали (от 0.004), сливает их по цвету.
python tools/palace_xl.py [out.json] → проверка и JSON рецепта."""
import json, math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from handmade import H

SAND, ST, ST2, ST3, DK, DOOR = "#f5c77e", "#efbd78", "#d49e5c", "#b07a42", "#6b4e33", "#2a1d12"
DOME, DOME2, GOLD, TILE, TILE2, WATER = "#f7cf86", "#5b4636", "#ffcf5a", "#2bb3a3", "#1f6fa8", "#3fb6e8"
LAMP, GREEN, GREEN2, TRUNK, MARBLE = "#ffb347", "#2f9a55", "#3fbf6a", "#8a6a42", "#f3e6cf"


def palace_xl():
    h = H("Дворец тысячи минаретов", "warm")
    P = h.p

    def ring(n, r, cx, cz, a0=0.0, rz=None):
        for k in range(n):
            a = a0 + 2 * math.pi * k / n
            yield k, a, cx + r * math.cos(a), cz + (rz if rz is not None else r) * math.sin(a)

    def finial(x, y, z, s=1.0):  # золотой шпиль: шарики + полумесяц
        P("sphere", x, y, z, .04 * s, .04 * s, .04 * s, GOLD, .6)
        P("cyl", x, y + .035 * s, z, .01 * s, .09 * s, .01 * s, GOLD, .6)
        P("sphere", x, y + .06 * s, z, .025 * s, .025 * s, .025 * s, GOLD, .65)
        P("sphere", x, y + .12 * s, z, .03 * s, .03 * s, .03 * s, GOLD, .7)
        P("cone", x, y + .15 * s, z, .016 * s, .05 * s, .016 * s, GOLD, .8)

    def arch(x, y, z, w, hh, face="z", d=.01, col=DOOR, frame=None, glow=0.0):
        """Арочный проём: прямоугольник + полукруг; frame — рамка-наличник и замковый камень."""
        if face == "z":
            P("box", x, y, z, w, hh, d, col, glow)
            P("sphere", x, y + hh - w * .3, z, w, w * .75, d, col, glow)
            if frame:
                P("box", x - w / 2 - .004, y, z + .002, .006, hh, d, frame)
                P("box", x + w / 2 + .004, y, z + .002, .006, hh, d, frame)
                P("box", x, y + hh + w * .42, z + .002, .012, .014, d + .004, frame)
        else:
            P("box", x, y, z, d, hh, w, col, glow)
            P("sphere", x, y + hh - w * .3, z, d, w * .75, w, col, glow)
            if frame:
                P("box", x + .002, y, z - w / 2 - .004, d, hh, .006, frame)
                P("box", x + .002, y, z + w / 2 + .004, d, hh, .006, frame)
                P("box", x + .002, y + hh + w * .42, z, d + .004, .014, .012, frame)

    def mashrabiya(x, y, z, w, hh, face="z"):
        """Окно с резной решёткой: тёмный проём, тёплый свет за решёткой, 3 вертикали + 4 горизонтали, арка."""
        o = .006
        if face == "z":
            P("box", x, y, z, w, hh, .008, "#ffcf7a", .7)
            for i in (-1, 1):
                P("box", x + i * w / 6, y, z + o, .005, hh, .005, DK)
            for j in range(3):
                P("box", x, y + (j + .5) * hh / 3, z + o, w, .005, .005, DK)
            P("sphere", x, y + hh - w * .3, z, w, w * .75, .008, DOOR)
            P("box", x, y - .008, z + .006, w + .02, .008, .014, ST2)  # подоконник
        else:
            P("box", x, y, z, .008, hh, w, "#ffcf7a", .7)
            for i in (-1, 1):
                P("box", x + o, y, z + i * w / 6, .005, hh, .005, DK)
            for j in range(3):
                P("box", x + o, y + (j + .5) * hh / 3, z, .005, .005, w, DK)
            P("sphere", x, y + hh - w * .3, z, .008, w * .75, w, DOOR)
            P("box", x + .006, y - .008, z, .014, .008, w + .02, ST2)

    def merlons_x(x0, x1, y, z, n, d=.022):  # ступенчатые зубцы вдоль X
        for i in range(n):
            x = x0 + (i + .5) * (x1 - x0) / n
            P("box", x, y, z, .024, .03 if i % 2 else .024, d, ST2)

    def merlons_z(z0, z1, y, x, n, d=.022):
        for i in range(n):
            z = z0 + (i + .5) * (z1 - z0) / n
            P("box", x, y, z, d, .03 if i % 2 else .024, .024, ST2)

    def tile_band_x(x0, x1, y, z, n, hh=.016):  # изразцовый пояс: чередование бирюзы, синего и золота
        for i in range(n):
            x = x0 + (i + .5) * (x1 - x0) / n
            P("box", x, y, z, (x1 - x0) / n * .9, hh, .008, [TILE, TILE2, TILE, GOLD][i % 4], .18 if i % 4 == 3 else .1)

    def tile_band_z(z0, z1, y, x, n, hh=.016):
        for i in range(n):
            z = z0 + (i + .5) * (z1 - z0) / n
            P("box", x, y, z, .008, hh, (z1 - z0) / n * .9, [TILE, TILE2, TILE, GOLD][i % 4], .18 if i % 4 == 3 else .1)

    def dome_pattern(cx, yb, cz, R, H_, rows, n0, col_a, col_b, a0=0.0):
        """Узор на куполе (sphere R×H_, низ на yb): ряды бусин по поверхности эллипсоида + рёбра."""
        cy = yb + H_ / 2
        for row in range(rows):
            t = (row + 1) / (rows + 1)  # от экватора к макушке
            ph = t * math.pi / 2 * .92
            rr, yy = R / 2 * math.cos(ph), cy + H_ / 2 * math.sin(ph)
            n = max(5, int(n0 * math.cos(ph)))
            for k, a, x, z in ring(n, rr * 1.01, cx, cz, a0=a0 + row * .3):
                P("sphere", x, yy - .006, z, .012, .012, .012, col_a if row % 2 else col_b, .35 if row % 2 else 0)

    def palm(x, z, hgt=.34, s=1.0):
        segs = 5
        for k in range(segs):
            P("cyl", x + k * .004, .03 + k * hgt / segs, z, (.026 - k * .003) * s, hgt / segs + .004, (.026 - k * .003) * s, TRUNK if k % 2 else "#7a5c38")
        tx, ty = x + segs * .004, .03 + hgt
        for k, a, lx, lz in ring(8, .05 * s, tx, z):
            P("sphere", lx, ty - .01 - (k % 2) * .012, lz, .1 * s, .022, .036 * s, GREEN if k % 2 else GREEN2, .05, r=-math.degrees(a))
        for k, a, lx, lz in ring(3, .014, tx, z):
            P("sphere", lx, ty - .03, lz, .02, .02, .02, "#6b4a2a")

    def lantern(x, y, z, s=1.0):
        P("cyl", x, y, z, .006, .03 * s, .006, DK)
        P("cone", x, y - .004, z, .03 * s, .012, .03 * s, GOLD, .3)
        P("sphere", x, y - .04 * s, z, .026 * s, .036 * s, .026 * s, LAMP, 1)
        P("cone", x, y - .056 * s, z, .012 * s, .02 * s, .012 * s, GOLD, .3)

    # ================= земля, двор, сад =================
    P("box", 0, 0, 0, .99, .03, .99, "#d8a866")
    P("box", 0, .03, .25, .86, .008, .3, MARBLE)  # мраморный двор
    for i in range(14):  # мозаика двора: шахматка из изразцов
        for j in range(5):
            if (i + j) % 2 == 0:
                P("box", -.39 + i * .06, .038, .13 + j * .06, .05, .003, .05, TILE if (i // 2 + j) % 2 else ST2, .05)
    # каналы чахар-баг к фонтану
    for sx in (-1, 1):
        P("box", sx * .19, .035, .26, .2, .01, .03, ST3)
        P("box", sx * .19, .041, .26, .19, .006, .02, WATER, .3)
        for k in range(4):
            P("cone", sx * (.12 + k * .045), .047, .26, .008, .03, .008, "#bfe8ff", .5)
    # фонтан: восьмигранная чаша, ярусы, струи
    for k, a, x, z in ring(8, .1, 0, .26, a0=math.pi / 8):
        P("box", x, .038, z, .08, .035, .02, ST2, r=-math.degrees(a) + 90)
    P("cyl", 0, .038, .26, .19, .02, .19, ST3)
    P("cyl", 0, .05, .26, .18, .015, .18, WATER, .3)
    P("cyl", 0, .05, .26, .035, .12, .035, ST)
    P("cyl", 0, .1, .26, .1, .012, .1, ST2)
    P("cyl", 0, .108, .26, .085, .008, .085, WATER, .3)
    P("cyl", 0, .11, .26, .02, .07, .02, ST)
    P("sphere", 0, .17, .26, .05, .035, .05, ST2)
    P("cone", 0, .195, .26, .022, .07, .022, "#bfe8ff", .5)
    for k, a, x, z in ring(8, .06, 0, .26):
        P("cone", x, .118, z, .008, .04, .008, "#bfe8ff", .5)
    # живые изгороди и цветы вдоль двора
    for sx in (-1, 1):
        for k in range(7):
            P("box", sx * .4, .03, .12 + k * .043, .03, .03, .04, GREEN, .03)
            P("sphere", sx * .4, .06, .12 + k * .043, .02, .02, .02, ["#ff6b9a", "#ffd23f", "#c084fc", "#ff9f43"][k % 4], .4)

    # ================= передняя аркада =================
    az = .45
    P("box", 0, .03, az, .96, .02, .075, ST2)
    P("box", 0, .05, az - .03, .96, .005, .01, ST3)
    for i in range(9):
        x = -.4 + i * .1
        cx = x - .05
        P("box", cx, .05, az, .028, .012, .065, ST3)  # база колонны
        P("cyl", cx, .062, az, .018, .11, .018, MARBLE)  # ствол
        P("torus", cx, .1, az, .024, .004, .024, GOLD, .3)
        P("box", cx, .172, az, .034, .01, .066, ST2)  # капитель
        P("box", cx, .182, az, .028, .008, .06, ST3)
        arch(x, .05, az + .034, .07, .1, frame=ST3)
        lantern(x, .16, az + .005, .7)  # фонарь под аркой
    P("box", .45, .05, az, .028, .012, .065, ST3)
    P("cyl", .45, .062, az, .018, .11, .018, MARBLE)
    P("box", .45, .172, az, .034, .01, .066, ST2)
    P("box", 0, .19, az, .96, .05, .07, ST)
    for k in range(32):  # мукарны-фриз: два ряда «сот»
        x = -.465 + k * .03
        P("box", x, .195 + (k % 2) * .008, az + .036, .024, .014, .01, ST2 if k % 2 else ST3)
    tile_band_x(-.48, .48, .222, az + .036, 32)
    P("box", 0, .24, az, .96, .012, .075, TILE, .15)
    merlons_x(-.48, .48, .252, az, 16, d=.06)
    for x in (-.45, -.15, .15, .45):  # пинаклы
        P("cyl", x, .29, az, .022, .03, .022, ST2)
        P("cyl", x, .32, az, .016, .02, .016, ST)
        P("cone", x, .34, az, .018, .05, .018, GOLD, .4)
        P("sphere", x, .39, az, .012, .012, .012, GOLD, .6)

    # ================= боковые аркады =================
    for sx in (-1, 1):
        x0 = sx * .455
        P("box", x0, .03, .14, .075, .02, .56, ST2)
        for i in range(6):
            z = .38 - i * .095
            P("box", x0, .05, z + .047, .065, .012, .028, ST3)
            P("cyl", x0, .062, z + .047, .018, .11, .018, MARBLE)
            P("torus", x0, .1, z + .047, .024, .004, .024, GOLD, .3)
            P("box", x0, .172, z + .047, .066, .01, .034, ST2)
            arch(x0 + sx * .034, .05, z, .065, .1, face="x", frame=ST3)
        P("box", x0, .19, .14, .07, .05, .56, ST)
        for k in range(18):
            z = -.13 + k * .03
            P("box", x0 + sx * .036, .195 + (k % 2) * .008, z, .01, .014, .024, ST2 if k % 2 else ST3)
        tile_band_z(-.14, .42, .222, x0 + sx * .036, 18)
        P("box", x0 + sx * .002, .24, .14, .075, .012, .56, TILE, .15)
        merlons_z(-.14, .42, .252, x0, 9, d=.06)

    # ================= главный корпус =================
    bz, bd, bw = -.12, .4, .58
    fz, rz = bz + bd / 2, bz - bd / 2
    P("box", 0, .03, bz, bw + .03, .025, bd + .03, ST3)  # цоколь
    y1 = P("box", 0, .055, bz, bw, .29, bd, SAND)
    P("box", 0, y1, bz, bw + .02, .02, bd + .02, ST2)
    y2 = P("box", 0, y1 + .02, bz, bw - .06, .15, bd - .06, SAND)
    P("box", 0, y2, bz, bw - .04, .025, bd - .04, ST2)
    # пилястры по углам и между окнами
    for x in (-bw / 2, -.185, .185, bw / 2):
        P("box", x, .055, fz + .004, .018, .29, .012, ST2)
        P("box", x, .055, rz - .004, .018, .29, .012, ST2)
    for z in (rz, -.21, -.03, fz):
        for sx in (-1, 1):
            P("box", sx * (bw / 2 + .004), .055, z, .012, .29, .018, ST2)
    # изразцовые пояса по корпусу (нижний и верхний этаж)
    for yy in (.3, y2 - .04):
        wdt = bw if yy < y1 else bw - .06
        dd = bd if yy < y1 else bd - .06
        tile_band_x(-wdt / 2, wdt / 2, yy, bz + dd / 2 + .002, 16)
        tile_band_x(-wdt / 2, wdt / 2, yy, bz - dd / 2 - .002, 12)
        tile_band_z(bz - dd / 2, bz + dd / 2, yy, wdt / 2 + .002, 10)
        tile_band_z(bz - dd / 2, bz + dd / 2, yy, -wdt / 2 - .002, 10)
    merlons_x(-.27, .27, y2 + .025, fz - .02, 18)
    merlons_x(-.27, .27, y2 + .025, rz + .02, 18)
    merlons_z(rz + .03, fz - .03, y2 + .025, .27, 12)
    merlons_z(rz + .03, fz - .03, y2 + .025, -.27, 12)
    # окна с решётками-машрабия
    for x in (-.24, -.13, .13, .24):
        mashrabiya(x, .1, fz + .003, .05, .11)
        mashrabiya(x, y1 + .045, fz - .027, .04, .07)
    for z in (-.27, -.17, -.07, .03):
        for sx in (-1, 1):
            mashrabiya(sx * (bw / 2 + .003), .1, z, .05, .11, face="x")
            mashrabiya(sx * (bw / 2 - .027), y1 + .045, z, .04, .07, face="x")
    for x in (-.22, -.11, 0, .11, .22):
        mashrabiya(x, .1, rz - .003, .05, .12)
    # балкончики на фасаде второго этажа
    for x in (-.24, .24):
        P("box", x, y1 + .02, fz - .005, .07, .008, .04, ST2)
        for k in range(5):
            P("box", x - .03 + k * .015, y1 + .028, fz + .012, .004, .025, .004, GOLD, .3)
        P("box", x, y1 + .053, fz + .012, .07, .005, .006, GOLD, .3)

    # ---------- айван (портал) с мукарнами ----------
    P("box", 0, .03, fz + .02, .26, .46, .045, ST2)
    P("box", 0, .03, fz + .04, .18, .38, .02, ST3)
    for sx in (-1, 1):  # боковые панели с изразцовыми ромбами
        for j in range(8):
            P("box", sx * .108, .07 + j * .045, fz + .044, .022, .022, .006, [TILE, GOLD][j % 2], .15, r=0)
    for k in range(7):  # мукарны: 7 ярусов «сот», к верху уже
        cells = 7 - k
        w = .16 - k * .02
        for c in range(cells):
            x = -w / 2 + (c + .5) * w / cells
            P("box", x, .27 + k * .02, fz + .046 + (c % 2) * .004, w / cells * .85, .018, .016, [ST, ST2, MARBLE][(k + c) % 3])
    P("sphere", 0, .41, fz + .048, .06, .05, .02, ST)
    # каллиграфический пояс над порталом
    P("box", 0, .45, fz + .043, .24, .03, .006, TILE2, .15)
    for k in range(16):
        P("box", -.105 + k * .014, .455 + (k % 3) * .004, fz + .047, .006, .012 + (k % 2) * .006, .004, GOLD, .6)
    P("box", 0, .49, fz + .02, .28, .02, .05, TILE, .2)
    merlons_x(-.14, .14, .51, fz + .02, 7, d=.05)
    # дверь: створки, рамка, золотые гвозди, кольца
    P("box", 0, .04, fz + .05, .1, .21, .01, DOOR)
    P("sphere", 0, .21, fz + .05, .1, .1, .01, DOOR)
    P("box", 0, .04, fz + .056, .004, .23, .004, GOLD, .4)
    for i in range(4):
        for j in range(6):
            P("sphere", -.036 + i * .024, .06 + j * .03, fz + .056, .008, .008, .008, GOLD, .5)
    for sx in (-1, 1):
        P("torus", sx * .012, .13, fz + .058, .016, .004, .016, GOLD, .6)
    for x in (-.125, .125):  # колонны айвана
        P("box", x, .03, fz + .045, .036, .02, .036, ST3)
        P("cyl", x, .05, fz + .045, .024, .42, .024, MARBLE)
        for k in range(4):
            P("torus", x, .12 + k * .1, fz + .045, .03, .004, .03, GOLD, .3)
        P("sphere", x, .47, fz + .045, .036, .036, .036, GOLD, .4)
    for x in (-.065, .065):  # фонари у входа
        lantern(x, .26, fz + .07)

    # ================= главный купол =================
    dz = bz - .01
    yb = y2 + .025
    P("cyl", 0, yb, dz, .4, .03, .4, ST2)
    for k, a, x, z in ring(24, .195, 0, dz):  # кольцо зубцов вокруг барабана
        P("box", x, yb + .03, z, .016, .02, .016, ST2, r=-math.degrees(a))
    y_drum = P("cyl", 0, yb + .03, dz, .33, .14, .33, ST)
    for k, a, x, z in ring(16, .167, 0, dz):  # окна барабана со светом и контрфорсы
        P("box", x, yb + .06, z, .03, .065, .012, "#ffcf7a", .8, r=-math.degrees(a) + 90)
        P("sphere", x, yb + .115, z, .03, .028, .012, DOOR, r=-math.degrees(a) + 90)
        ab = a + math.pi / 16
        P("box", .172 * math.cos(ab), yb + .03, dz + .172 * math.sin(ab), .014, .14, .02, ST2, r=-math.degrees(ab))
    tile_ring = 24
    for k, a, x, z in ring(tile_ring, .167, 0, dz):
        P("box", x, yb + .145, z, .03, .014, .008, [TILE, TILE2, GOLD, TILE2][k % 4], .15, r=-math.degrees(a) + 90)
    P("torus", 0, y_drum, dz, .37, .025, .37, ST2)
    yd = y_drum - .015
    DR, DH = .4, .44
    P("sphere", 0, yd, dz, DR, DH, DR, DOME, .06)
    for frac in (.12, .3, .5, .7):  # пояса купола
        ph = frac * math.pi / 2
        yy = yd + DH / 2 + DH / 2 * math.sin(ph)
        rr = DR / 2 * math.cos(ph)
        P("torus", 0, yy - .005, dz, rr * 2.05, .008, rr * 2.05, ST3)
    for m in range(12):  # рёбра купола: бусины по меридианам
        a = 2 * math.pi * m / 12
        for j in range(5):
            ph = (j + 1) / 6 * math.pi / 2 * .95
            rr, yy = DR / 2 * math.cos(ph) * 1.015, yd + DH / 2 + DH / 2 * math.sin(ph)
            P("sphere", rr * math.cos(a), yy - .005, dz + rr * math.sin(a), .011, .011, .011, "#b08654")
    dome_pattern(0, yd, dz, DR, DH, 6, 22, GOLD, TILE, a0=math.pi / 16)
    P("cyl", 0, yd + DH - .02, dz, .06, .03, .06, ST2)
    P("torus", 0, yd + DH + .005, dz, .07, .01, .07, GOLD, .5)
    finial(0, yd + DH + .01, dz, 1.6)

    # ================= четыре малых купола =================
    for cx, cz in ((-.2, bz + .12), (.2, bz + .12), (-.2, bz - .13), (.2, bz - .13)):
        P("cyl", cx, yb, cz, .15, .015, .15, ST2)
        P("cyl", cx, yb + .015, cz, .13, .06, .13, ST)
        for k, a, x, z in ring(8, .066, cx, cz):
            P("box", x, yb + .025, z, .018, .03, .008, "#ffcf7a", .8, r=-math.degrees(a) + 90)
            P("sphere", x, yb + .05, z, .018, .016, .008, DOOR, r=-math.degrees(a) + 90)
        for k, a, x, z in ring(8, .07, cx, cz):
            P("box", x, yb + .075, z, .012, .01, .012, ST2, r=-math.degrees(a))
        P("torus", cx, yb + .075, cz, .15, .01, .15, ST2)
        ys = yb + .07
        P("sphere", cx, ys, cz, .14, .19, .14, DOME, .06)
        dome_pattern(cx, ys, cz, .14, .19, 3, 10, GOLD, TILE)
        P("torus", cx, ys + .08, cz, .128, .006, .128, ST3)
        finial(cx, ys + .18, cz, .75)

    # ================= чхатри на углах крыши =================
    for cx, cz in ((-.27, fz - .02), (.27, fz - .02), (-.27, rz + .02), (.27, rz + .02)):
        yy = y1 + .02
        P("box", cx, yy, cz, .07, .015, .07, ST2)
        P("box", cx, yy + .015, cz, .06, .006, .06, ST3)
        for k, a, x, z in ring(8, .026, cx, cz, a0=math.pi / 8):
            P("cyl", x, yy + .021, z, .007, .07, .007, MARBLE)
            P("sphere", x, yy + .06, z, .014, .012, .006, DOOR, r=-math.degrees(a) + 90)
        P("box", cx, yy + .091, cz, .075, .01, .075, ST2)
        P("cyl", cx, yy + .101, cz, .05, .012, .05, ST)
        P("sphere", cx, yy + .1, cz, .06, .075, .06, DOME2)
        dome_pattern(cx, yy + .1, cz, .06, .075, 1, 8, GOLD, "#8a6a4a")
        P("cone", cx, yy + .165, cz, .012, .04, .012, GOLD, .6)
        P("sphere", cx, yy + .2, cz, .012, .012, .012, GOLD, .7)

    # ================= два каирских минарета сзади =================
    for cx in (-.37, .37):
        cz = -.4
        yy = .03
        P("box", cx, yy, cz, .14, .02, .14, ST3)
        P("box", cx, yy + .02, cz, .12, .16, .12, ST)
        for f in range(4):  # арочные ниши на квадратном основании
            a = f * math.pi / 2
            fx_, fz_ = math.cos(a), math.sin(a)
            arch(cx + fx_ * .061, yy + .06, cz + fz_ * .061, .04, .07, face="x" if abs(fx_) > .5 else "z", d=.006, frame=ST3)
        tile_band_x(cx - .06, cx + .06, yy + .15, cz + .062, 4)
        tile_band_x(cx - .06, cx + .06, yy + .15, cz - .062, 4)
        tile_band_z(cz - .06, cz + .06, yy + .15, cx + .062, 4)
        tile_band_z(cz - .06, cz + .06, yy + .15, cx - .062, 4)
        P("box", cx, yy + .18, cz, .13, .015, .13, ST2)
        merlons_x(cx - .06, cx + .06, yy + .195, cz + .055, 4, d=.015)
        merlons_x(cx - .06, cx + .06, yy + .195, cz - .055, 4, d=.015)
        yy += .195
        for tier, (w, hh, col) in enumerate(((.1, .3, ST), (.085, .24, SAND), (.07, .19, ST))):
            nside = 8 if tier == 0 else 12  # граненый ствол: призма из плиток
            P("cyl", cx, yy, cz, w, hh, w, col)
            for k, a, x, z in ring(4, w / 2 + .002, cx, cz, a0=.4 + tier * .3):  # окошки
                P("box", x, yy + hh * .4, z, .02, .045, .008, "#ffcf7a", .8, r=-math.degrees(a) + 90)
                P("sphere", x, yy + hh * .4 + .04, z, .02, .018, .008, DOOR, r=-math.degrees(a) + 90)
            P("torus", cx, yy + hh * .25, cz, w * 1.06, .006, w * 1.06, GOLD, .25)
            # мукарны-консоли под балконом: 2 ряда
            for k, a, x, z in ring(10, w * .58, cx, cz):
                P("box", x, yy + hh - .03, z, .018, .016, .018, ST2, r=-math.degrees(a))
            for k, a, x, z in ring(10, w * .68, cx, cz, a0=math.pi / 10):
                P("box", x, yy + hh - .014, z, .018, .014, .018, ST3, r=-math.degrees(a))
            P("cyl", cx, yy + hh, cz, w * 1.6, .012, w * 1.6, ST2)  # пол балкона
            for k, a, x, z in ring(12, w * .78, cx, cz):
                P("box", x, yy + hh + .012, z, .006, .032, .006, ST3)  # балясины
            P("torus", cx, yy + hh + .042, cz, w * 1.6, .006, w * 1.6, GOLD, .3)
            for k, a, x, z in ring(4, w * .78, cx, cz, a0=math.pi / 4):  # фонарики на балконе
                P("sphere", x, yy + hh + .05, z, .016, .02, .016, LAMP, 1)
            yy += hh + .045
        # беседка-навершие (мабхара) и луковица
        for k, a, x, z in ring(8, .026, cx, cz):
            P("cyl", x, yy, z, .007, .07, .007, MARBLE)
        P("cyl", cx, yy + .07, cz, .065, .01, .065, ST2)
        P("sphere", cx, yy + .065, cz, .075, .095, .075, ST2)
        dome_pattern(cx, yy + .065, cz, .075, .095, 2, 9, GOLD, "#b08550")
        finial(cx, yy + .15, cz, .85)

    # ================= два минарета с винтовой лестницей спереди =================
    for cx in (-.405, .405):
        cz = .38
        P("cyl", cx, .03, cz, .11, .02, .11, ST3)
        P("cyl", cx, .05, cz, .1, .04, .1, ST2)
        P("cyl", cx, .09, cz, .085, .74, .085, ST)
        for k in range(10):  # кольцевые изразцовые пояса на стволе
            P("torus", cx, .14 + k * .07, cz, .088, .004, .088, TILE if k % 2 else GOLD, .2)
        steps = 40
        for k in range(steps):  # спираль: 40 ступеней, 2,5 оборота
            a = k * math.pi / 8
            x, z = cx + .064 * math.cos(a), cz + .064 * math.sin(a)
            yk = .1 + k * .017
            P("box", x, yk, z, .048, .008, .026, ST2, r=-math.degrees(a))
            if k % 2 == 0:  # стойки перил с внешней стороны
                P("box", cx + .088 * math.cos(a), yk + .008, cz + .088 * math.sin(a), .004, .03, .004, GOLD, .3)
            if k % 2 == 0:  # поручень — короткие отрезки по касательной
                am = a + math.pi / 16
                P("box", cx + .088 * math.cos(am), yk + .036, cz + .088 * math.sin(am), .004, .004, .034, GOLD, .3, r=-math.degrees(am))
            if k % 6 == 3:  # фонарик на ступенях
                P("sphere", cx + .09 * math.cos(a), yk + .045, cz + .09 * math.sin(a), .012, .014, .012, LAMP, 1)
        top = .1 + steps * .017
        P("torus", cx, .83, cz, .18, .028, .18, ST2)
        P("cyl", cx, .83, cz, .18, .012, .18, ST2)
        for k, a, x, z in ring(14, .085, cx, cz):
            P("box", x, .842, z, .005, .03, .005, GOLD, .3)
        P("torus", cx, .872, cz, .18, .005, .18, GOLD, .3)
        for k, a, x, z in ring(8, .036, cx, cz):
            P("cyl", x, .842, z, .007, .07, .007, MARBLE)
        P("cyl", cx, .912, cz, .1, .012, .1, ST2)
        P("sphere", cx, .91, cz, .088, .11, .088, DOME2)
        dome_pattern(cx, .91, cz, .088, .11, 2, 10, GOLD, "#8a6a4a")
        for k, a, x, z in ring(6, .047, cx, cz):
            P("cone", x, .918, z, .008, .03, .008, GOLD, .5)
        finial(cx, 1.0, cz, .85)
        assert top < .83

    # ================= сад за дворцом, пальмы, фонари =================
    for x, z in ((-.3, .19), (.3, .19), (-.42, -.2), (.42, -.2), (-.2, -.44), (.2, -.44)):
        palm(x, z, .32 if abs(z) < .3 else .28)
    for x in (-.38, -.24, .24, .38):  # фонари на столбах во дворе
        P("cyl", x, .03, .2, .01, .02, .01, ST3)
        P("cyl", x, .05, .2, .006, .1, .006, DK)
        lantern(x, .19, .2, .9)
    for k in range(9):  # клумбы вдоль задней стены
        x = -.32 + k * .08
        P("box", x, .03, -.46, .06, .02, .04, ST3)
        P("sphere", x, .05, -.46, .05, .03, .035, GREEN, .03)
        P("sphere", x, .07, -.46, .015, .015, .015, ["#ff6b9a", "#ffd23f", "#c084fc"][k % 3], .4)
    return h.r


def compact(rec):
    """Убираем поля по умолчанию (g=0, r=0, w=false) — рецепт меньше на треть."""
    out = []
    for q in rec["parts"]:
        d = {"t": q["t"], "p": q["p"], "s": [max(.004, v) for v in q["s"]], "c": q["c"]}
        if q.get("g"):
            d["g"] = round(q["g"], 2)
        if q.get("r"):
            d["r"] = round(q["r"], 1)
        if q.get("w"):
            d["w"] = True
        out.append(d)
    return {**rec, "fine": True, "parts": out}


if __name__ == "__main__":
    rec = compact(palace_xl())
    ps = rec["parts"]
    bad = [q for q in ps if q["p"][1] + q["s"][1] > 2.2 or max(q["s"][0], q["s"][2]) > 1 or q["s"][1] > 1.6 or abs(q["p"][0]) > .5 or abs(q["p"][2]) > .5 or q["p"][1] < 0]
    js = json.dumps(rec, ensure_ascii=False, separators=(",", ":"))
    print(rec["name"], len(ps), "деталей,", len(js) // 1024, "КБ", "ОШИБКИ:" if bad or len(ps) > 3000 else "ок", bad[:3])
    Path(sys.argv[1] if len(sys.argv) > 1 else "palace_xl.json").write_text(js, encoding="utf-8")
