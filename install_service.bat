@echo off
setlocal

set SERVICE_NAME=ZabbixDashboard
set DISPLAY_NAME=Zabbix Dashboard API
set DESCRIPTION=Zabbix Dashboard Backend API - Auto Report & Mikrotik Monitor
set APP_DIR=C:\Users\IT\Documents\zabbix-dashboard\backend\app
set UVICORN=C:\Users\IT\AppData\Local\Programs\Python\Python314\Scripts\uvicorn.exe
set UVICORN_ARGS=app:app --host 0.0.0.0 --port 8095

echo ============================================
echo   Install Zabbix Dashboard sebagai Service
echo ============================================
echo.

:: Cek apakah dijalankan sebagai Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Script ini harus dijalankan sebagai Administrator!
    echo Klik kanan pada file ini, lalu pilih "Run as administrator"
    pause
    exit /b 1
)

:: Cek NSSM
where nssm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] NSSM tidak ditemukan!
    echo.
    echo Silakan download NSSM terlebih dahulu:
    echo   1. Buka browser, download dari: https://nssm.cc/download
    echo   2. Extract, copy nssm.exe ke C:\Windows\System32\
    echo   3. Jalankan script ini lagi
    echo.
    pause
    exit /b 1
)

:: Cek apakah uvicorn ada
if not exist "%UVICORN%" (
    echo [ERROR] uvicorn tidak ditemukan di: %UVICORN%
    pause
    exit /b 1
)

:: Cek apakah service sudah ada
sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Service %SERVICE_NAME% sudah ada. Menghapus service lama...
    nssm stop %SERVICE_NAME% >nul 2>&1
    nssm remove %SERVICE_NAME% confirm >nul 2>&1
    timeout /t 2 >nul
)

echo [INFO] Menginstall service...
nssm install %SERVICE_NAME% "%UVICORN%"
nssm set %SERVICE_NAME% AppParameters %UVICORN_ARGS%
nssm set %SERVICE_NAME% AppDirectory "%APP_DIR%"
nssm set %SERVICE_NAME% DisplayName "%DISPLAY_NAME%"
nssm set %SERVICE_NAME% Description "%DESCRIPTION%"
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% AppStdout "C:\Zabbix\logs\service_stdout.log"
nssm set %SERVICE_NAME% AppStderr "C:\Zabbix\logs\service_stderr.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateBytes 5242880

:: Buat folder log
if not exist "C:\Zabbix\logs" mkdir "C:\Zabbix\logs"

echo [INFO] Memulai service...
nssm start %SERVICE_NAME%

timeout /t 3 >nul

:: Cek status
sc query %SERVICE_NAME% | find "RUNNING" >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo [OK] Service berhasil diinstall dan berjalan!
    echo      Nama  : %SERVICE_NAME%
    echo      Port  : 8095
    echo      Log   : C:\Zabbix\logs\
    echo.
    echo Untuk manage service: buka Services.msc atau pakai perintah:
    echo   nssm start %SERVICE_NAME%
    echo   nssm stop %SERVICE_NAME%
    echo   nssm restart %SERVICE_NAME%
) else (
    echo.
    echo [WARN] Service terinstall tapi mungkin belum running.
    echo Cek di Services.msc atau lihat log di C:\Zabbix\logs\
)

echo.
pause
