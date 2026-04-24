#!/usr/bin/env bash
# Sovereign AI — Offline Provisioning (Linux / macOS)
# Wraps provision.py with a Python environment check.
set -e
cd "$(dirname "$0")"

# Check Python 3.9+
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 not found. Install Python 3.9 or newer." >&2
  exit 1
fi

PY_VERSION=$(python3 -c "import sys; print(sys.version_info >= (3,9))")
if [ "$PY_VERSION" != "True" ]; then
  echo "Error: Python 3.9+ required." >&2
  exit 1
fi

# Install huggingface_hub if missing (inside the venv/system pip)
python3 -c "import huggingface_hub" 2>/dev/null || \
  python3 -m pip install --quiet huggingface_hub

python3 provision.py "$@"
