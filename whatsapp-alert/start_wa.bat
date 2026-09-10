user ya@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
if not exist .env copy .env.example .env
echo.
echo === WhatsApp Alert Sender ===
echo Scan QR di bawah pakai WhatsApp -^> Perangkat Tertaut (sekali saja).
echo.
node server.js
pause
