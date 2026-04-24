@echo off
cd /d "%~dp0"
docker compose up --build -d
echo Sovereign AI started. API: http://localhost:8000
