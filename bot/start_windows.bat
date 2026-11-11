@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Бот «Город подписчиков»

where python >nul 2>nul || (
  echo [!] Python не найден. Установи Python 3.12 с python.org и поставь галочку "Add python.exe to PATH".
  pause & exit /b
)

if not exist .venv (
  echo Первый запуск: ставлю библиотеки, это 1-2 минуты...
  python -m venv .venv || (pause & exit /b)
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\python -m pip install -q -r requirements.txt || (pause & exit /b)
)

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo [!] Открываю файл .env — впиши BOT_TOKEN и SUPABASE_SERVICE_KEY, сохрани (Ctrl+S) и закрой блокнот.
  notepad .env
)

echo.
echo Бот запущен. Не закрывай это окно. Остановить — Ctrl+C.
:loop
.venv\Scripts\python bot.py
echo Бот упал или остановлен, перезапуск через 5 секунд... (закрой окно, чтобы выйти)
timeout /t 5 >nul
goto loop
