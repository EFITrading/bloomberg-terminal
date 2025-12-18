@echo off
title Discord Trading Bot
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "start-discord-bot.ps1"
pause
