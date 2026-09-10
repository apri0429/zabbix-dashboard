@echo off
cd /d "%~dp0backend\app"

echo ============================================
echo   Zabbix Dashboard Backend  -  port 8095
echo ============================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] "python" tidak ada di PATH.
    echo Install Python atau pakai path lengkap, mis:
    echo   C:\Python313\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8095
    echo.
    pause
    exit /b 1
)

python -m uvicorn app:app --host 0.0.0.0 --port 8095

echo.
echo [INFO] Backend berhenti. Lihat pesan error di atas.
pause
