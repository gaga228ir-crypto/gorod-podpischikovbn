@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Бот «Город подписчиков»

rem --- ищем настоящий Python (не заглушку из Microsoft Store) ---
set "PY="
for %%P in ("%LOCALAPPDATA%\Programs\Python\Python313\python.exe" "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%LOCALAPPDATA%\Programs\Python\Python311\python.exe") do if not defined PY if exist %%P set "PY=%%~P"
if not defined PY ( py -3 -c "import sys" >nul 2>nul && set "PY=py -3" )
if not defined PY ( python -c "import sys" >nul 2>nul && set "PY=python" )
if not defined PY (
  echo Python не найден — ставлю Python 3.12 через winget, 1-3 минуты...
  winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
  if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
)
if not defined PY (
  echo [!] Не получилось поставить Python. Скачай Python 3.12 с python.org, поставь галочку "Add python.exe to PATH" и запусти этот файл снова.
  pause & exit /b
)

if not exist .venv\Scripts\python.exe (
  echo Первый запуск: ставлю библиотеки, это 1-2 минуты...
  "%PY%" -m venv .venv 2>nul || %PY% -m venv .venv || (pause & exit /b)
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\python -m pip install -q -r requirements.txt || (pause & exit /b)
)

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo [!] Открой файл .env в папке bot, впиши BOT_TOKEN и GITHUB_TOKEN, сохрани и запусти этот файл снова.
  start "" notepad .env
  pause & exit /b
)

echo.
echo Бот запущен. Не закрывай это окно. Остановить — Ctrl+C.
:loop
.venv\Scripts\python bot.py
echo Бот упал или остановлен, перезапуск через 5 секунд... (закрой окно, чтобы выйти)
timeout /t 5 >nul
goto loop
