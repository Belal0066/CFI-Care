#!/usr/bin/env bash
set -euo pipefail

# Simple browser UI for Option 3 parsing.
# Runs FastAPI app at http://127.0.0.1:7862

SERVER_URL="${SERVER_URL:-http://127.0.0.1:8118/v1}"

if ! curl -fsS -m 3 "${SERVER_URL}/models" >/dev/null 2>&1; then
  echo "Backend is not reachable at ${SERVER_URL}"
  echo "Start it with: ./start_vllm_official_8118.sh"
  exit 1
fi

if [[ -f ".venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [[ -f "venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source venv/bin/activate
fi

export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

cd OCRpipelie/app
if command -v uv >/dev/null 2>&1 && [[ -d "../../.venv" ]]; then
  uv run python3 option3_ui.py
else
  python3 option3_ui.py
fi
