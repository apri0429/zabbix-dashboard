@echo off
echo Building frontend for production...
cd /d "%~dp0frontend"
call npm run build
echo.
echo Build selesai! File ada di: frontend\dist\
pause
