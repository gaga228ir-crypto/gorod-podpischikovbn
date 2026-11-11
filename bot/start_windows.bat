@echo off
chcp 65001 >nul
rem Работаем из копии во временной папке: так обновление может спокойно заменить этот файл.
if /i not "%~1"=="--run" (
  copy /y "%~f0" "%TEMP%\gorod_bot_run.bat" >nul
  call "%TEMP%\gorod_bot_run.bat" --run "%~dp0"
  exit /b
)
set "BOT=%~2"
cd /d "%BOT%"
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

if not exist .env (
  copy .env.example .env >nul
  echo.
  echo [!] Открой файл .env в папке bot, впиши BOT_TOKEN и GITHUB_TOKEN, сохрани и запусти этот файл снова.
  start "" notepad .env
  pause & exit /b
)

rem --- автозапуск вместе с Windows ---
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\gorod_bot.bat"
> "%STARTUP%" echo @start "Gorod bot" /min "%BOT%start_windows.bat"
echo Автозапуск с Windows: включён (файл gorod_bot.bat в Автозагрузке).

:loop
echo.
echo Проверяю обновления бота на GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $z = Join-Path $env:TEMP 'gorod.zip'; Invoke-WebRequest -UseBasicParsing 'https://github.com/gaga228ir-crypto/gorod-podpischikovbn/archive/refs/heads/main.zip' -OutFile $z; $d = Join-Path $env:TEMP 'gorod_upd'; if (Test-Path $d) { Remove-Item $d -Recurse -Force }; Expand-Archive $z $d -Force; Copy-Item (Join-Path $d 'gorod-podpischikovbn-main\bot\*') -Destination '%BOT%' -Recurse -Force; Write-Host 'Bot updated from GitHub.' } catch { Write-Host 'Update skipped, starting current version.' }"

if not exist .venv\Scripts\python.exe (
  echo Первый запуск: ставлю библиотеки, это 1-2 минуты...
  "%PY%" -m venv .venv 2>nul || %PY% -m venv .venv || (pause & exit /b)
  .venv\Scripts\python -m pip install -q --upgrade pip
)
.venv\Scripts\python -m pip install -q -r requirements.txt
if not exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" if not exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" .venv\Scripts\python -m playwright install chromium

echo.
echo Бот запущен. Не закрывай это окно (его можно свернуть). Остановить — закрой окно.
.venv\Scripts\python bot.py
echo Бот перезапускается через 5 секунд (обновление или сбой)...
timeout /t 5 >nul
goto loop
