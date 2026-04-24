@echo off
:: Sovereign AI — Offline Provisioning (Windows)
:: Wraps provision.py with a Python environment check.
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
    echo Error: python not found. Install Python 3.9+ and add it to PATH.
    exit /b 1
)

python -c "import huggingface_hub" >nul 2>&1
if errorlevel 1 (
    echo Installing huggingface_hub...
    python -m pip install --quiet huggingface_hub
)

python provision.py %*
