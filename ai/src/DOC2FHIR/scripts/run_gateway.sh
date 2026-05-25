#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/gateway/.env"
EXAMPLE_ENV="$ROOT_DIR/gateway/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Creating from example."
  cp "$EXAMPLE_ENV" "$ENV_FILE"
  echo "Edit $ENV_FILE and run again."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

mkdir -p "${DOC2FHIR_GATEWAY_RUNTIME_DIR:-$ROOT_DIR/.gateway_runtime}/uploads"

cd "$ROOT_DIR"

if [[ -n "${DOC2FHIR_GATEWAY_PYTHON:-}" && -x "${DOC2FHIR_GATEWAY_PYTHON}" ]]; then
  PYTHON_BIN="$DOC2FHIR_GATEWAY_PYTHON"
elif [[ -x "$ROOT_DIR/OCR/OCRpipelie/venv/bin/python" ]]; then
  PYTHON_BIN="$ROOT_DIR/OCR/OCRpipelie/venv/bin/python"
elif [[ -x "$ROOT_DIR/Mapper/mapper/bin/python" ]]; then
  PYTHON_BIN="$ROOT_DIR/Mapper/mapper/bin/python"
else
  PYTHON_BIN="python3"
fi

UVICORN_ARGS=(
  -m uvicorn gateway.main:app
  --host "${DOC2FHIR_GATEWAY_HOST:-0.0.0.0}"
  --port "${DOC2FHIR_GATEWAY_PORT:-8001}"
)

if [[ "${DOC2FHIR_GATEWAY_RELOAD:-false}" == "true" ]]; then
  UVICORN_ARGS+=(
    --reload
    --reload-exclude "${DOC2FHIR_GATEWAY_RUNTIME_DIR:-$ROOT_DIR/.gateway_runtime}/*"
    --reload-exclude "$ROOT_DIR/.service_state/*"
  )
fi

exec "$PYTHON_BIN" "${UVICORN_ARGS[@]}"