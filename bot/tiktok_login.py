"""Вход бота в TikTok (один раз): открывает Chrome с профилем бота — войди в @eben51041 (QR-код с телефона).
Пароли бот не видит и не хранит: вход живёт в профиле Chrome (папка tt_profile рядом с ботом)."""
import asyncio

import tiktok


async def main():
    ctx, page = await tiktok._profile_open("", headless=False)
    await page.goto("https://www.tiktok.com/login/qr?lang=ru-RU", wait_until="domcontentloaded")
    print("Открылся Chrome. Войди в аккаунт TikTok (лучше QR-кодом с телефона). Жду до 10 минут…")
    for _ in range(300):
        await asyncio.sleep(2)
        try:
            who = await tiktok.login_status(page)
        except Exception:
            who = None
        if who:
            (tiktok.PROFILE / ".logged_in").write_text(who, encoding="utf-8")
            print(f"✅ Готово: бот вошёл как @{who}. Окно можно закрыть — дальше бот работает сам (перезапусти бота или /update).")
            await asyncio.sleep(3)
            break
    else:
        print("Не дождался входа — запусти ещё раз.")
    await ctx.close()


asyncio.run(main())
