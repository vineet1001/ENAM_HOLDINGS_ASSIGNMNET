#!/bin/sh
# Starts the backend inside the container and the website on the host's port.
# If either stops, the container stops too, so the host restarts it.
set -e

cd /app/backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND=$!

# Wait for the backend before taking traffic.
for i in $(seq 1 60); do
  if python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2)" 2>/dev/null; then
    break
  fi
  sleep 1
done

cd /app/frontend
node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-10000}" &
FRONTEND=$!

# Exit as soon as one of the two stops.
while kill -0 "$BACKEND" 2>/dev/null && kill -0 "$FRONTEND" 2>/dev/null; do
  sleep 5
done
exit 1
