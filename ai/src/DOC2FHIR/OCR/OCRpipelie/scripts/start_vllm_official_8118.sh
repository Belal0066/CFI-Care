#!/usr/bin/env bash
set -euo pipefail

IMAGE="ccr-2vdh3abv-pub.cnc.bj.baidubce.com/paddlepaddle/paddleocr-genai-vllm-server:latest-nvidia-gpu"
PORT="${PORT:-8118}"
MODEL_NAME="${MODEL_NAME:-PaddleOCR-VL-1.5-0.9B}"
CFG_PATH="${CFG_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../configs/vllm_backend_low_vram.yaml}"
HOST_PADDLEX_CACHE="${HOME}/.paddlex"
HOST_VLLM_CACHE="${HOME}/.cache/vllm"

mkdir -p "$HOST_PADDLEX_CACHE" "$HOST_VLLM_CACHE"

if [[ ! -f "$CFG_PATH" ]]; then
  echo "Missing backend config: $CFG_PATH" >&2
  exit 1
fi

export PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
# Use conservative allocator settings for better stability on 8GB cards (3la 2adna)
export PYTORCH_CUDA_ALLOC_CONF="${PYTORCH_CUDA_ALLOC_CONF:-max_split_size_mb:64,garbage_collection_threshold:0.8}"

echo "Starting official vLLM backend"
echo "Image: $IMAGE"
echo "Model: $MODEL_NAME"
echo "Port: $PORT"
echo "Backend config: $CFG_PATH"
echo "PYTORCH_CUDA_ALLOC_CONF: $PYTORCH_CUDA_ALLOC_CONF"

docker_args=(
  --rm --gpus all --network host
  -e PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True
  -e PYTORCH_CUDA_ALLOC_CONF="$PYTORCH_CUDA_ALLOC_CONF"
  -e HF_HOME=/tmp/huggingface
  -e HUGGINGFACE_HUB_CACHE=/tmp/huggingface/hub
  -e TRANSFORMERS_CACHE=/tmp/huggingface/transformers
  -v "$CFG_PATH":/workspace/backend_config.yaml:ro
  -v "$HOST_PADDLEX_CACHE":/home/paddleocr/.paddlex
  -v "$HOST_VLLM_CACHE":/home/paddleocr/.cache/vllm
)

docker run "${docker_args[@]}" \
  "$IMAGE" \
  paddleocr genai_server \
  --model_name "$MODEL_NAME" \
  --host 0.0.0.0 \
  --port "$PORT" \
  --backend vllm \
  --backend_config /workspace/backend_config.yaml
