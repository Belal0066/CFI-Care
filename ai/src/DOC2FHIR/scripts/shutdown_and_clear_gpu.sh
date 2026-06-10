#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_GPU_SCRIPT="$ROOT_DIR/scripts/run_gpu_services.sh"

OCR_PORT="${OCR_PORT:-8118}"
MAPPER_PORT="${MAPPER_PORT:-8080}"

print_banner() {
  echo "== $1 =="
}

stop_managed_services() {
  if [[ -x "$RUN_GPU_SCRIPT" ]]; then
    print_banner "Stopping managed GPU services"
    "$RUN_GPU_SCRIPT" stop || true
  else
    echo "run_gpu_services.sh not found or not executable."
  fi
}

kill_port_processes() {
  local port="$1"
  local label="$2"

  local pids
  pids="$(ss -lptn "( sport = :$port )" 2>/dev/null | awk -F'pid=' 'NR>1 {split($2,a,","); print a[1]}' | sort -u || true)"

  if [[ -z "$pids" ]]; then
    echo "$label: no listener on port $port"
    return 0
  fi

  echo "$label: killing listeners on port $port -> $pids"
  for pid in $pids; do
    kill -TERM "$pid" 2>/dev/null || true
  done
}

stop_related_containers() {
  print_banner "Stopping related docker containers"

  if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found, skipping container cleanup"
    return 0
  fi

  local ids
  ids="$(docker ps -q --filter "ancestor=ccr-2vdh3abv-pub.cnc.bj.baidubce.com/paddlepaddle/paddleocr-genai-vllm-server:latest-nvidia-gpu" || true)"
  if [[ -n "$ids" ]]; then
    echo "Stopping OCR image containers: $ids"
    docker stop $ids >/dev/null 2>&1 || true
  else
    echo "No matching OCR containers running"
  fi
}

kill_named_processes() {
  print_banner "Killing known GPU service processes"

  pkill -f "llama-server" 2>/dev/null || true
  pkill -f "paddleocr genai_server" 2>/dev/null || true
  pkill -f "vllm" 2>/dev/null || true
}

kill_gpu_compute_pids() {
  print_banner "Clearing remaining GPU compute processes"

  if ! command -v nvidia-smi >/dev/null 2>&1; then
    echo "nvidia-smi not found, skipping GPU PID cleanup"
    return 0
  fi

  local pids
  pids="$(nvidia-smi --query-compute-apps=pid --format=csv,noheader,nounits 2>/dev/null | tr -d ' ' | sed '/^$/d' | sort -u || true)"

  if [[ -z "$pids" ]]; then
    echo "No GPU compute processes found"
    return 0
  fi

  echo "GPU compute pids: $pids"

  for pid in $pids; do
    if [[ "$pid" == "$$" || "$pid" == "$PPID" || "$pid" == "1" ]]; then
      continue
    fi
    kill -TERM "$pid" 2>/dev/null || true
  done

  sleep 2

  local remaining
  remaining="$(nvidia-smi --query-compute-apps=pid --format=csv,noheader,nounits 2>/dev/null | tr -d ' ' | sed '/^$/d' | sort -u || true)"
  if [[ -n "$remaining" ]]; then
    echo "Force killing remaining GPU pids: $remaining"
    for pid in $remaining; do
      if [[ "$pid" == "$$" || "$pid" == "$PPID" || "$pid" == "1" ]]; then
        continue
      fi
      kill -KILL "$pid" 2>/dev/null || true
    done
  fi
}

report_gpu_state() {
  print_banner "GPU state after cleanup"

  if command -v nvidia-smi >/dev/null 2>&1; then
    nvidia-smi || true
  else
    echo "nvidia-smi not available"
  fi
}

main() {
  stop_managed_services

  # Kill by ports as an extra safety net.
  kill_port_processes "$OCR_PORT" "OCR"
  kill_port_processes "$MAPPER_PORT" "Mapper"

  stop_related_containers
  kill_named_processes
  kill_gpu_compute_pids
  report_gpu_state

  print_banner "Done"
  echo "GPU services stopped and GPU compute processes cleared."
}

main "$@"
