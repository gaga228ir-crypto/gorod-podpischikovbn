@echo off
chcp 65001 >nul
title Вход бота в TikTok
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if exist ".venv\Scripts\python.exe" (".venv\Scripts\python.exe" tiktok_login.py) else (python tiktok_login.py)
pause
