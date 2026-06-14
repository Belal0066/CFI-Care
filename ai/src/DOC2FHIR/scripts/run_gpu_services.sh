#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.service_state"
PID_DIR="$STATE_DIR/pids"
LOG_DIR="$STATE_DIR/logs"

OCR_SCRIPT="$ROOT_DIR/OCR/OCRpipelie/scripts/start_vllm_official_8118.sh"
OCR_API_SCRIPT="$ROOT_DIR/OCR/OCRpipelie/run_option3_ui.sh"
MAPPER_SCRIPT="$ROOT_DIR/Mapper/scripts/run_llama_server.sh"

OCR_PID_FILE="$PID_DIR/ocr_vllm.pid"
OCR_API_PID_FILE="$PID_DIR/ocr_api.pid"
MAPPER_PID_FILE="$PID_DIR/mapper_llama.pid"
OCR_LOG_FILE="$LOG_DIR/ocr_vllm.log"
OCR_API_LOG_FILE="$LOG_DIR/ocr_api.log"
MAPPER_LOG_FILE="$LOG_DIR/mapper_llama.log"

OCR_HEALTH_URL="${OCR_HEALTH_URL:-http://127.0.0.1:8118/v1/models}"
OCR_API_HEALTH_URL="${OCR_API_HEALTH_URL:-http://127.0.0.1:7862/status}"
MAPPER_HEALTH_URL="${MAPPER_HEALTH_URL:-http://127.0.0.1:8080/v1/models}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-45}"

mkdir -p "$PID_DIR" "$LOG_DIR"

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|status|restart|logs>

Commands:
  start    Start OCR backend, OCR API wrapper, and Mapper in background.
  stop     Stop both services started by this script.
  status   Show process and health status for all services.
  restart  Stop then start both services.
  logs     Tail both service logs.

State directory:
  $STATE_DIR
EOF
}

is_running_pid() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

pid_from_file() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  cat "$file"
}

wait_for_http() {
  local url="$1"
  local timeout="$2"
  local elapsed=0

  while (( elapsed < timeout )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

start_one() {
  local name="$1"
  local cmd="$2"
  local pid_file="$3"
  local log_file="$4"

  local existing_pid
  existing_pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && is_running_pid "$existing_pid"; then
    echo "$name already running (pid=$existing_pid)"
    return 0
  fi

  rm -f "$pid_file"

  echo "Starting $name ..."
  nohup bash -lc "$cmd" >"$log_file" 2>&1 &
  local new_pid=$!
  echo "$new_pid" >"$pid_file"
  echo "$name started (pid=$new_pid, log=$log_file)"
}

stop_one() {
  local name="$1"
  local pid_file="$2"

  local pid
  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    echo "$name not running (no pid file)"
    return 0
  fi

  if ! is_running_pid "$pid"; then
    echo "$name not running (stale pid=$pid)"
    rm -f "$pid_file"
    return 0
  fi

  echo "Stopping $name (pid=$pid) ..."
  kill "$pid" 2>/dev/null || true

  local waited=0
  while is_running_pid "$pid" && (( waited < 15 )); do
    sleep 1
    waited=$((waited + 1))
  done

  if is_running_pid "$pid"; then
    echo "$name did not exit gracefully; sending SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  echo "$name stopped"
}

print_status_one() {
  local name="$1"
  local pid_file="$2"
  local health_url="$3"

  local pid
  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && is_running_pid "$pid"; then
    if curl -fsS "$health_url" >/dev/null 2>&1; then
      echo "$name: RUNNING (pid=$pid, health=OK)"
    else
      echo "$name: RUNNING (pid=$pid, health=NOT_READY)"
    fi
  else
    echo "$name: STOPPED"
  fi
}

start_all() {
  if [[ ! -x "$OCR_SCRIPT" ]]; then
    echo "Missing or non-executable OCR script: $OCR_SCRIPT" >&2
    exit 1
  fi
  if [[ ! -x "$OCR_API_SCRIPT" ]]; then
    echo "Missing or non-executable OCR API script: $OCR_API_SCRIPT" >&2
    exit 1
  fi
  if [[ ! -x "$MAPPER_SCRIPT" ]]; then
    echo "Missing or non-executable Mapper script: $MAPPER_SCRIPT" >&2
    exit 1
  fi

  start_one "OCR vLLM backend" "$OCR_SCRIPT" "$OCR_PID_FILE" "$OCR_LOG_FILE"
  start_one "OCR API wrapper" "$OCR_API_SCRIPT" "$OCR_API_PID_FILE" "$OCR_API_LOG_FILE"
  start_one "Mapper llama-server" "$MAPPER_SCRIPT" "$MAPPER_PID_FILE" "$MAPPER_LOG_FILE"

  echo "Waiting for OCR backend health: $OCR_HEALTH_URL"
  if wait_for_http "$OCR_HEALTH_URL" "$HEALTH_TIMEOUT_SEC"; then
    echo "OCR backend health OK"
  else
    echo "OCR backend health check timed out after ${HEALTH_TIMEOUT_SEC}s"
  fi

  echo "Waiting for OCR API health: $OCR_API_HEALTH_URL"
  if wait_for_http "$OCR_API_HEALTH_URL" "$HEALTH_TIMEOUT_SEC"; then
    echo "OCR API health OK"
  else
    echo "OCR API health check timed out after ${HEALTH_TIMEOUT_SEC}s"
  fi

  echo "Waiting for Mapper health: $MAPPER_HEALTH_URL"
  if wait_for_http "$MAPPER_HEALTH_URL" "$HEALTH_TIMEOUT_SEC"; then
    echo "Mapper health OK"
  else
    echo "Mapper health check timed out after ${HEALTH_TIMEOUT_SEC}s"
  fi

  echo "Done. Use '$0 status' to verify state."
}

stop_all() {
  stop_one "OCR API wrapper" "$OCR_API_PID_FILE"
  stop_one "Mapper llama-server" "$MAPPER_PID_FILE"
  stop_one "OCR vLLM backend" "$OCR_PID_FILE"
}

logs_all() {
  echo "Tailing logs (Ctrl+C to exit)"
  touch "$OCR_LOG_FILE" "$OCR_API_LOG_FILE" "$MAPPER_LOG_FILE"
  tail -n 80 -f "$OCR_LOG_FILE" "$OCR_API_LOG_FILE" "$MAPPER_LOG_FILE"
}

cmd="${1:-}"
case "$cmd" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  status)
    print_status_one "OCR vLLM backend" "$OCR_PID_FILE" "$OCR_HEALTH_URL"
    print_status_one "OCR API wrapper" "$OCR_API_PID_FILE" "$OCR_API_HEALTH_URL"
    print_status_one "Mapper llama-server" "$MAPPER_PID_FILE" "$MAPPER_HEALTH_URL"
    ;;
  restart)
    stop_all
    start_all
    ;;
  logs)
    logs_all
    ;;
  *)
    usage
    exit 1
    ;;
esac
