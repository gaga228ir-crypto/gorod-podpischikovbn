"""Вход бота в TikTok (один раз): открывает Chrome с профилем бота — войди в @eben51041 (QR-код с телефона).
Пароли бот не видит и не хранит: вход живёт в профиле Chrome (папка tt_profile рядом с ботом)."""
import asyncio

import tiktok


async def main():
    ctx, page = await tiktok._profile_open("", headless=False)
    await page.goto("https://www.tiktok.com/login/qrcode?lang=ru-RU", wait_until="domcontentloaded")
    await page.wait_for_timeout(4000)
    for sel in ['button:has-text("Отклонить")', 'button:has-text("Decline")']:  # окно про cookie
        try:
            await page.locator(sel).first.click(timeout=2000)
        except Exception:
            pass
    print("Открылся Chrome. Войди в аккаунт TikTok (лучше QR-кодом с телефона). Жду до 10 минут…")
    qr = tiktok.PROFILE.parent / "tt_qr.png"  # снимок QR-кода — можно переслать на телефон и отсканировать в TikTok
    for i in range(300):
        await asyncio.sleep(2)
        if i % 3 == 0:
            try:
                await page.screenshot(path=str(qr))
            except Exception:
                pass
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
