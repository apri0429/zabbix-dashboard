@echo off
cd /d "%~dp0backend\app"
python -m uvicorn app:app --host 0.0.0.0 --port 8005 --workers 2
