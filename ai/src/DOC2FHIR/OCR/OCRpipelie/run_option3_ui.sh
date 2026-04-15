#!/usr/bin/env bash
set -euo pipefail

# Simple browser UI for Option 3 parsing.
# Runs FastAPI app at http://127.0.0.1:7862

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_BIN="$ROOT_DIR/venv/bin/python3"

SERVER_URL="${SERVER_URL:-http://127.0.0.1:8118/v1}"

if ! curl -fsS -m 3 "${SERVER_URL}/models" >/dev/null 2>&1; then
  echo "Backend is not reachable at ${SERVER_URL}"
  echo "Start it with: ./start_vllm_official_8118.sh"
  exit 1
fi

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Missing Python interpreter: $PYTHON_BIN"
  exit 1
fi

export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

cd "$ROOT_DIR/app"
exec "$PYTHON_BIN" option3_ui.py
