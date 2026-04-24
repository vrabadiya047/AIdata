#!/bin/bash
cd "$(dirname "$0")"
docker compose up --build -d
echo "Sovereign AI started. API: http://localhost:8000"
