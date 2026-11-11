# Бот «Город подписчиков»

## Что умеет
- `/start` — меню с картинкой, кнопка «🏙 Открыть город» (мини-приложение).
- «🏠 Мой дом» — привязка ника TikTok: проверка, что ник есть среди подписчиков, выдаёт код `ДОМ-1234` для комментариев «Почты города».
- В мини-приложении «🎨 Мой дом»: 5 вариантов бесплатно или конструктор за звёзды (оплата прямо в Telegram).
- `/admin` — одна панель: заявки (✅/❌), продажи, статистика. Новая заявка сразу приходит админу сообщением.

## Установка на VPS (Ubuntu)
```bash
git clone https://github.com/gaga228ir-crypto/gorod-podpischikovbn
cd gorod-podpischikovbn/bot
bash install.sh          # первый запуск создаст .env
nano .env                # заполни поля (Ctrl+O, Enter, Ctrl+X)
bash install.sh          # второй запуск — ставит и запускает бота
```
Логи: `journalctl -u gorod-bot -f` · перезапуск: `sudo systemctl restart gorod-bot`
Обновить бота: `cd gorod-podpischikovbn && git pull && sudo systemctl restart gorod-bot`

## Перед запуском
1. В Supabase → SQL Editor выполни весь `supabase.sql` (там же таблица оплат).
2. В `.env`: `SUPABASE_SERVICE_KEY` — ключ **service_role** (Project Settings → API). Он секретный: только в `.env`, не на сайт и не в чат.
3. В `index.html` впиши `SUPABASE_URL` и `SUPABASE_ANON_KEY` (ключ **anon**) и `BOT_URL` — тогда сайт покажет особые дома и кнопка «Получить дом» будет вести в бота.
4. В @BotFather: `/setuserpic` → `assets/avatar.jpg`.
