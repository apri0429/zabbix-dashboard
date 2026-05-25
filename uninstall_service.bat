@echo off
setlocal

set SERVICE_NAME=ZabbixDashboard

echo ============================================
echo   Uninstall Zabbix Dashboard Service
echo ============================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Harus dijalankan sebagai Administrator!
    pause
    exit /b 1
)

sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Service %SERVICE_NAME% tidak ditemukan.
    pause
    exit /b 0
)

echo [INFO] Menghentikan service...
nssm stop %SERVICE_NAME%
timeout /t 3 >nul

echo [INFO] Menghapus service...
nssm remove %SERVICE_NAME% confirm

echo [OK] Service berhasil dihapus.
echo.
pause
