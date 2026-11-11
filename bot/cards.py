"""Картинки-карточки для бота. Рисуются из фонов города + текст, без внешних сервисов."""
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

A = Path(__file__).parent / "assets"
GOLD, PINK, WHITE, INK, MUTED = (255, 210, 63), (255, 61, 127), (255, 255, 255), (26, 18, 56), (205, 198, 245)


def font(name: str, size: int, weight: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(A / f"{name}.ttf"), size)
    axes = f.get_variation_axes()
    f.set_variation_by_axes([weight] if len(axes) == 1 else [min(32, max(14, size)), weight])
    return f


def _bg(name: str, darken: float = 0.55, blur: int = 2) -> Image.Image:
    im = Image.open(A / name).convert("RGB").resize((1280, 720))
    if blur:
        im = im.filter(ImageFilter.GaussianBlur(blur))
    shade = Image.new("RGB", im.size, (8, 5, 30))
    im = Image.blend(im, shade, darken)
    # мягкий градиент снизу, чтобы текст читался
    grad = Image.linear_gradient("L").resize(im.size)
    return Image.composite(shade, im, grad.point(lambda v: int(v * 0.55)))


def _fit(d: ImageDraw.ImageDraw, text: str, name: str, weight: int, max_w: int, start: int, min_size: int = 28):
    s = start
    while s > min_size:
        f = font(name, s, weight)
        if d.textlength(text, font=f) <= max_w:
            return f
        s -= 4
    return font(name, min_size, weight)


def _pill(d, xy, text, f, fill, color):
    x, y = xy
    w = d.textlength(text, font=f)
    h = f.size * 1.6
    d.rounded_rectangle([x, y, x + w + f.size * 1.4, y + h], radius=h / 2, fill=fill)
    d.text((x + f.size * 0.7, y + h / 2), text, font=f, fill=color, anchor="lm")
    return x + w + f.size * 1.4


def _out(im: Image.Image) -> bytes:
    b = BytesIO()
    im.save(b, "JPEG", quality=90)
    return b.getvalue()


def welcome(houses: int) -> bytes:
    im = _bg("bg_night.jpg", 0.35, 0)
    d = ImageDraw.Draw(im)
    _pill(d, (70, 70), "TIKTOK · ГОРОД ПОДПИСЧИКОВ", font("Unbounded", 22, 600), PINK, WHITE)
    d.text((70, 430), "ГОРОД", font=font("Unbounded", 96, 800), fill=WHITE)
    d.text((70, 530), "ПОДПИСЧИКОВ", font=font("Unbounded", 96, 800), fill=GOLD)
    d.text((72, 650), f"{houses} домов · 1 подписка = 1 дом с твоим ником", font=font("Inter", 30, 600), fill=MUTED)
    return _out(im)


def code_card(nick: str, code: str) -> bytes:
    im = _bg("bg_far.jpg", 0.62, 4)
    d = ImageDraw.Draw(im)
    d.text((640, 150), "ТВОЙ КОД", font=font("Unbounded", 40, 600), fill=MUTED, anchor="mm")
    d.rounded_rectangle([250, 210, 1030, 410], radius=40, outline=GOLD, width=6)
    d.text((640, 312), f"ДОМ-{code}", font=font("Unbounded", 110, 800), fill=GOLD, anchor="mm")
    f = _fit(d, "@" + nick, "Unbounded", 800, 1000, 56)
    d.text((640, 500), "@" + nick, font=f, fill=WHITE, anchor="mm")
    d.text((640, 590), "Напиши код в комментариях «Почты города»", font=font("Inter", 34, 600), fill=MUTED, anchor="mm")
    return _out(im)


def built_card(nick: str, number: int, special: bool) -> bytes:
    im = _bg("avatar_raw.png" if False else "bg_day.jpg", 0.4, 0)
    d = ImageDraw.Draw(im)
    _pill(d, (70, 70), "ДОМ ПОСТРОЕН" if not special else "ОСОБЫЙ ДОМ ПОСТРОЕН", font("Unbounded", 26, 800), GOLD, INK)
    f = _fit(d, "@" + nick, "Unbounded", 800, 1140, 92)
    d.text((70, 470), "@" + nick, font=f, fill=WHITE)
    d.text((72, 590), f"Дом №{number} · найди его по ссылке и покажи друзьям", font=font("Inter", 32, 600), fill=MUTED)
    return _out(im)


def election_card(title: str) -> bytes:
    im = _bg("bg_night.jpg", 0.6, 3)
    d = ImageDraw.Draw(im)
    d.text((640, 260), "🗳", font=font("Inter", 20, 400), fill=WHITE)  # эмодзи шрифт не рисует — оставляем пусто
    d.text((640, 300), "ВЫБОРЫ МЭРА", font=font("Unbounded", 100, 800), fill=GOLD, anchor="mm")
    f = _fit(d, title, "Inter", 600, 1100, 44)
    d.text((640, 420), title, font=f, fill=WHITE, anchor="mm")
    return _out(im)


def admin_card(pending: int, approved: int, subs: int) -> bytes:
    im = _bg("bg_far.jpg", 0.7, 6)
    d = ImageDraw.Draw(im)
    d.text((70, 70), "ПАНЕЛЬ МЭРИИ", font=font("Unbounded", 64, 800), fill=WHITE)
    for i, (n, label, col) in enumerate([(pending, "заявок ждут", PINK), (approved, "особых домов", GOLD), (subs, "жителей", WHITE)]):
        x = 70 + i * 400
        d.rounded_rectangle([x, 300, x + 360, 560], radius=36, fill=(22, 15, 61))
        d.text((x + 180, 400), str(n), font=font("Unbounded", 96, 800), fill=col, anchor="mm")
        d.text((x + 180, 500), label, font=font("Inter", 32, 600), fill=MUTED, anchor="mm")
    return _out(im)


def avatar() -> bytes:
    im = Image.open(A / "avatar_raw.png").convert("RGB").resize((640, 640))
    return _out(im)
