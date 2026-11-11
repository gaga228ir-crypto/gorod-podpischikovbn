#!/usr/bin/env bash
# Установка бота на VPS (Ubuntu/Debian): bash install.sh
set -e
cd "$(dirname "$0")"
DIR="$(pwd)"
sudo apt-get update -y && sudo apt-get install -y python3 python3-venv
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
[ -f .env ] || { cp .env.example .env; echo ">>> Заполни файл $DIR/.env (nano .env) и запусти install.sh ещё раз"; exit 0; }
sudo tee /etc/systemd/system/gorod-bot.service >/dev/null <<UNIT
[Unit]
Description=Gorod podpischikov bot
After=network-online.target
[Service]
WorkingDirectory=$DIR
ExecStart=$DIR/.venv/bin/python bot.py
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now gorod-bot
sleep 3
sudo systemctl --no-pager status gorod-bot | head -n 12
echo ">>> Готово. Логи: journalctl -u gorod-bot -f"
