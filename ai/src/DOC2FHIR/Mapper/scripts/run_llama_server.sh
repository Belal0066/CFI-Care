#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/config/llama-server.env"
EXAMPLE_ENV="$ROOT_DIR/config/llama-server.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Creating from example."
  cp "$EXAMPLE_ENV" "$ENV_FILE"
  echo "Edit $ENV_FILE and run again."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ ! -x "$LLAMA_SERVER_BIN" ]]; then
  echo "llama-server binary not executable: $LLAMA_SERVER_BIN"
  exit 1
fi

get_model_architecture() {
  local model_path="$1"

  python3 - "$model_path" <<'PY'
import struct
import sys

path = sys.argv[1]

GGUF_TYPE_STRING = 8

with open(path, "rb") as handle:
    if handle.read(4) != b"GGUF":
        raise SystemExit(1)

    version = struct.unpack("<I", handle.read(4))[0]
    if version >= 3:
        handle.read(8)
        handle.read(8)
    else:
        handle.read(4)
        handle.read(4)

    while True:
        key_length = struct.unpack("<Q", handle.read(8))[0]
        key = handle.read(key_length).decode("utf-8", errors="replace")
        value_type = struct.unpack("<I", handle.read(4))[0]

        if value_type == GGUF_TYPE_STRING:
            value_length = struct.unpack("<Q", handle.read(8))[0]
            value = handle.read(value_length).decode("utf-8", errors="replace")
        else:
            raise SystemExit(2)

        if key == "general.architecture":
            print(value)
            raise SystemExit(0)
PY
}

validate_model_support() {
  local model_path="$1"
  local model_architecture

  model_architecture="$(get_model_architecture "$model_path" || true)"
  if [[ -z "$model_architecture" ]]; then
    echo "Unable to read GGUF metadata from: $model_path"
    exit 1
  fi

  if [[ "$model_architecture" == "gemma4" ]]; then
    if ! strings "$LLAMA_SERVER_BIN" | grep -qi 'gemma4'; then
      cat <<EOF
Warning: Gemma 4 symbol scan was inconclusive for this llama-server binary.

Binary: $LLAMA_SERVER_BIN
Model:  $model_path

Continuing startup because binary string scans can produce false negatives.
If startup fails with "unknown model architecture: 'gemma4'", rebuild or update llama.cpp.
EOF
    fi
  fi
}

validate_prompt_file() {
  local prompt_path="$1"

  if [[ -z "$prompt_path" ]]; then
    echo "Warning: SYSTEM_PROMPT_FILE not set. Medical prompting will require client-side prompt injection."
    return 0
  fi

  if [[ ! -f "$prompt_path" ]]; then
    echo "Error: SYSTEM_PROMPT_FILE not found: $prompt_path"
    exit 1
  fi

  if [[ ! -r "$prompt_path" ]]; then
    echo "Error: SYSTEM_PROMPT_FILE not readable: $prompt_path"
    exit 1
  fi

  echo "Using system prompt from: $prompt_path"
}

resolve_model_file() {
  if [[ -n "${MODEL_FILE:-}" && -f "$MODEL_FILE" ]]; then
    echo "$MODEL_FILE"
    return 0
  fi

  if [[ -f "$MODEL_DIR/.selected_model" ]]; then
    local from_selected
    from_selected="$(cat "$MODEL_DIR/.selected_model")"
    if [[ -f "$from_selected" ]]; then
      echo "$from_selected"
      return 0
    fi
  fi

  local found
  found="$(find "$MODEL_DIR" -maxdepth 2 -type f -name '*.gguf' | head -n1 || true)"
  if [[ -n "$found" ]]; then
    echo "$found"
    return 0
  fi

  return 1
}

MODEL_PATH="$(resolve_model_file || true)"
if [[ -z "$MODEL_PATH" ]]; then
  echo "No model file found. Run scripts/download_unsloth_gemma4.sh first."
  exit 1
fi

validate_model_support "$MODEL_PATH"
validate_prompt_file "$SYSTEM_PROMPT_FILE"

echo "Starting llama-server with model: $MODEL_PATH"
exec "$LLAMA_SERVER_BIN" \
  -m "$MODEL_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  --ctx-size "$CTX_SIZE" \
  --n-gpu-layers "$N_GPU_LAYERS" \
  --parallel "$PARALLEL" \
  --threads "$THREADS" \
  --temp "$TEMP" \
  --top-p "$TOP_P" \
  --n-predict "$MAX_TOKENS" \
  --cache-type-k f16 \
  --cache-type-v f16 \
  --metrics

