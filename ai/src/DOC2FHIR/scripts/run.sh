#!/usr/bin/env bash
###############################################################################
# DOC2FHIR Unified Runner
#
# Usage:
#   ./run.sh <command> [options]
#
# Commands:
#   ocr       Start OCR service (vLLM Docker + API wrapper on :7862)
#   mapper    Start Mapper service (llama.cpp + Gemma-4 on :8080)
#   gateway   Start Gateway API (FastAPI on :8001)
#   ui        Start Pipeline UI (Streamlit on :8502)
#   mapper-ui Start Mapper testing UI (Streamlit on :8501)
#   all       Start full pipeline: OCR + Mapper + Gateway (+ optional UI)
#   stop      Stop all managed services
#   restart   Restart all managed services
#   status    Show status of all services
#   logs      Tail all service logs
#   health    Run health checks against all services
#   smoke     Run gateway smoke test
#   test      Run acceptance tests
#   gpu-clear Force-stop everything and clear GPU memory
#   help      Show this help
#
# Options (for 'all' and individual services):
#   --with-ui       Also start the pipeline Streamlit UI
#   --with-mapper-ui Also start the Mapper Streamlit UI
#   --foreground    Run in foreground (blocks, Ctrl+C stops all)
#   --no-color      Disable colored output
#   --log-dir DIR   Override log directory (default: .service_state/logs)
#   --tail N        Show last N log lines on startup (default: 0)
###############################################################################
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.service_state"
PID_DIR="$STATE_DIR/pids"
LOG_DIR="$STATE_DIR/logs"
SCRIPTS_DIR="$ROOT_DIR/scripts"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

# Default options
WITH_UI=false
WITH_MAPPER_UI=false
FOREGROUND=false
NO_COLOR=false
TAIL_LINES=0
CUSTOM_LOG_DIR=""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Health check URLs
OCR_BACKEND_URL="${OCR_HEALTH_URL:-http://127.0.0.1:8118/v1/models}"
OCR_API_URL="${OCR_API_HEALTH_URL:-http://127.0.0.1:7862/status}"
MAPPER_URL="${MAPPER_HEALTH_URL:-http://127.0.0.1:8070/v1/models}"
GATEWAY_URL="http://127.0.0.1:8001/v1/health"
UI_URL="http://127.0.0.1:8502"
MAPPER_UI_URL="http://127.0.0.1:8501"
HEALTH_TIMEOUT=45

# PID files
OCR_VLLM_PID="$PID_DIR/ocr_vllm.pid"
OCR_API_PID="$PID_DIR/ocr_api.pid"
MAPPER_PID="$PID_DIR/mapper_llama.pid"
GATEWAY_PID="$PID_DIR/gateway.pid"
UI_PID="$PID_DIR/gateway_ui.pid"
MAPPER_UI_PID="$PID_DIR/mapper_ui.pid"

# Log files
OCR_VLLM_LOG=""
OCR_API_LOG=""
MAPPER_LOG=""
GATEWAY_LOG=""
UI_LOG=""
MAPPER_UI_LOG=""

# Track started services for foreground cleanup
STARTED_PIDS=()

###############################################################################
# Logging helpers
###############################################################################
log() {
  local level="$1"; shift
  local msg="$*"
  local ts
  ts="$(date '+%H:%M:%S')"

  if [[ "$NO_COLOR" == true ]]; then
    echo "[$ts] [$level] $msg"
  else
    case "$level" in
      INFO)  echo -e "[$ts] ${GREEN}[INFO]${NC} $msg" ;;
      WARN)  echo -e "[$ts] ${YELLOW}[WARN]${NC} $msg" ;;
      ERROR) echo -e "[$ts] ${RED}[ERROR]${NC} $msg" ;;
      OK)    echo -e "[$ts] ${GREEN}[  OK ]${NC} $msg" ;;
      FAIL)  echo -e "[$ts] ${RED}[FAIL]${NC} $msg" ;;
      STEP)  echo -e "[$ts] ${BLUE}[STEP]${NC} $msg" ;;
      DONE)  echo -e "[$ts] ${MAGENTA}[DONE]${NC} $msg" ;;
      *)     echo "[$ts] [$level] $msg" ;;
    esac
  fi
}

log_to_file() {
  local log_file="$1"; shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$log_file"
}

banner() {
  echo ""
  if [[ "$NO_COLOR" == true ]]; then
    echo "=== $* ==="
  else
    echo -e "${BOLD}${CYAN}=== $* ===${NC}"
  fi
  echo ""
}

###############################################################################
# Parse arguments
###############################################################################
parse_args() {
  ARGS=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --with-ui)       WITH_UI=true; shift ;;
      --with-mapper-ui) WITH_MAPPER_UI=true; shift ;;
      --foreground)    FOREGROUND=true; shift ;;
      --no-color)      NO_COLOR=true; shift ;;
      --tail)          TAIL_LINES="$2"; shift 2 ;;
      --log-dir)       CUSTOM_LOG_DIR="$2"; shift 2 ;;
      -*)              log ERROR "Unknown option: $1"; exit 1 ;;
      *)               ARGS+=("$1"); shift ;;
    esac
  done

  if [[ -n "$CUSTOM_LOG_DIR" ]]; then
    LOG_DIR="$CUSTOM_LOG_DIR"
  fi

  OCR_VLLM_LOG="$LOG_DIR/ocr_vllm.log"
  OCR_API_LOG="$LOG_DIR/ocr_api.log"
  MAPPER_LOG="$LOG_DIR/mapper_llama.log"
  GATEWAY_LOG="$LOG_DIR/gateway.log"
  UI_LOG="$LOG_DIR/gateway_ui.log"
  MAPPER_UI_LOG="$LOG_DIR/mapper_ui.log"
}

###############################################################################
# Utility functions
###############################################################################
mkdir -p "$PID_DIR" "$LOG_DIR"

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
  local timeout="${2:-$HEALTH_TIMEOUT}"
  local label="${3:-service}"
  local elapsed=0

  log STEP "Waiting for $label: $url (timeout: ${timeout}s)"
  while (( elapsed < timeout )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log OK "$label is ready (${elapsed}s)"
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  log FAIL "$label health check timed out after ${timeout}s"
  return 1
}

kill_port_listener() {
  local port="$1"
  local label="$2"

  # Check for Docker containers first
  if command -v docker >/dev/null 2>&1; then
    local containers
    containers="$(docker ps --format '{{.ID}} {{.Ports}}' 2>/dev/null | grep ":${port}->" | awk '{print $1}' || true)"
    if [[ -n "$containers" ]]; then
      log WARN "$label: Docker container(s) using port $port: $containers"
      for cid in $containers; do
        log STEP "Stopping Docker container $cid ..."
        docker stop "$cid" >/dev/null 2>&1 || true
        log OK "Container $cid stopped"
      done
      sleep 2
    fi
  fi

  # Kill native processes
  local pids
  pids="$(ss -lptn "( sport = :$port )" 2>/dev/null | awk -F'pid=' 'NR>1 {split($2,a,","); print a[1]}' | sort -u || true)"

  if [[ -z "$pids" ]]; then
    return 0
  fi

  log WARN "$label: port $port already in use (pids: $pids), killing ..."
  for pid in $pids; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  local waited=0
  while (( waited < 5 )); do
    local still
    still="$(ss -lptn "( sport = :$port )" 2>/dev/null | awk -F'pid=' 'NR>1 {split($2,a,","); print a[1]}' | sort -u || true)"
    if [[ -z "$still" ]]; then
      log OK "$label: port $port freed"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  log WARN "$label: port $port still busy, sending SIGKILL ..."
  for pid in $pids; do
    kill -9 "$pid" 2>/dev/null || true
  done
  sleep 1
}

ensure_streamlit() {
  if python3 -c "import streamlit" 2>/dev/null; then
    return 0
  fi

  log STEP "Installing streamlit ..."
  pip install --break-system-packages -q streamlit requests pandas 2>&1 | tail -3
  if ! python3 -c "import streamlit" 2>/dev/null; then
    log FAIL "streamlit installation failed"
    return 1
  fi
  log OK "streamlit installed"
}

start_background() {
  local name="$1"
  local cmd="$2"
  local pid_file="$3"
  local log_file="$4"

  local existing_pid
  existing_pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && is_running_pid "$existing_pid"; then
    log WARN "$name already running (pid=$existing_pid)"
    return 0
  fi

  rm -f "$pid_file"

  log STEP "Starting $name ..."
  nohup bash -lc "$cmd" > "$log_file" 2>&1 &
  local new_pid=$!
  echo "$new_pid" > "$pid_file"
  STARTED_PIDS+=("$new_pid")
  log OK "$name started (pid=$new_pid, log=$log_file)"

  if [[ "$TAIL_LINES" -gt 0 ]]; then
    echo "--- Last $TAIL_LINES lines of $log_file ---"
    tail -n "$TAIL_LINES" "$log_file" 2>/dev/null || true
    echo "---"
  fi
}

stop_service() {
  local name="$1"
  local pid_file="$2"

  local pid
  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    log INFO "$name not running (no pid file)"
    return 0
  fi

  if ! is_running_pid "$pid"; then
    log INFO "$name not running (stale pid=$pid)"
    rm -f "$pid_file"
    return 0
  fi

  log STEP "Stopping $name (pid=$pid) ..."
  kill "$pid" 2>/dev/null || true

  local waited=0
  while is_running_pid "$pid" && (( waited < 15 )); do
    sleep 1
    waited=$((waited + 1))
  done

  if is_running_pid "$pid"; then
    log WARN "$name did not exit gracefully; sending SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
  log OK "$name stopped"
}

print_status() {
  local name="$1"
  local pid_file="$2"
  local health_url="$3"

  local pid
  pid="$(pid_from_file "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && is_running_pid "$pid"; then
    if curl -fsS "$health_url" >/dev/null 2>&1; then
      log OK "$name: RUNNING (pid=$pid, health=OK)"
    else
      log WARN "$name: RUNNING (pid=$pid, health=NOT_READY)"
    fi
  else
    log INFO "$name: STOPPED"
  fi
}

###############################################################################
# Service starters
###############################################################################
start_ocr() {
  banner "OCR Service"

  local ocr_backend="$ROOT_DIR/OCR/OCRpipelie/scripts/start_vllm_official_8118.sh"
  local ocr_api="$ROOT_DIR/OCR/OCRpipelie/run_option3_ui.sh"

  if [[ ! -x "$ocr_backend" ]]; then
    log FAIL "OCR backend script not found: $ocr_backend"
    return 1
  fi
  if [[ ! -x "$ocr_api" ]]; then
    log FAIL "OCR API script not found: $ocr_api"
    return 1
  fi

  kill_port_listener 7862 "OCR API"

  # Start vLLM Docker backend
  start_background "OCR vLLM backend" "$ocr_backend" "$OCR_VLLM_PID" "$OCR_VLLM_LOG"

  # Wait for backend
  if ! wait_for_http "$OCR_BACKEND_URL" "$HEALTH_TIMEOUT" "OCR backend"; then
    log WARN "OCR backend may still be starting. Check logs: $OCR_VLLM_LOG"
  fi

  # Start OCR API wrapper
  start_background "OCR API wrapper" "$ocr_api" "$OCR_API_PID" "$OCR_API_LOG"

  # Wait for API
  if ! wait_for_http "$OCR_API_URL" "$HEALTH_TIMEOUT" "OCR API"; then
    log FAIL "OCR API failed to start. Check logs: $OCR_API_LOG"
    return 1
  fi

  log DONE "OCR service is ready on port 7862"
}

start_mapper() {
  banner "Mapper Service"

  local mapper_script="$ROOT_DIR/Mapper/scripts/run_llama_server.sh"

  if [[ ! -x "$mapper_script" ]]; then
    log FAIL "Mapper script not found: $mapper_script"
    return 1
  fi

  kill_port_listener 8070 "Mapper"

  start_background "Mapper llama-server" "$mapper_script" "$MAPPER_PID" "$MAPPER_LOG"

  if ! wait_for_http "$MAPPER_URL" "$HEALTH_TIMEOUT" "Mapper"; then
    log FAIL "Mapper failed to start. Check logs: $MAPPER_LOG"
    return 1
  fi

  log DONE "Mapper service is ready on port 8070"
}

start_gateway() {
  banner "Gateway Service"

  local gateway_script="$SCRIPTS_DIR/run_gateway.sh"

  if [[ ! -x "$gateway_script" ]]; then
    log FAIL "Gateway script not found: $gateway_script"
    return 1
  fi

  # Load gateway .env for port info
  local env_file="$ROOT_DIR/gateway/.env"
  local gw_port=8001
  if [[ -f "$env_file" ]]; then
    gw_port="$(grep 'DOC2FHIR_GATEWAY_PORT' "$env_file" | cut -d= -f2 | tr -d '"' || echo 8001)"
  fi

  kill_port_listener "$gw_port" "Gateway"

  start_background "Gateway FastAPI" "$gateway_script" "$GATEWAY_PID" "$GATEWAY_LOG"

  if ! wait_for_http "http://127.0.0.1:${gw_port}/v1/health" "$HEALTH_TIMEOUT" "Gateway"; then
    log FAIL "Gateway failed to start. Check logs: $GATEWAY_LOG"
    return 1
  fi

  log DONE "Gateway is ready on port $gw_port"
  log INFO "API docs: http://127.0.0.1:${gw_port}/docs"
}

start_ui() {
  banner "Pipeline UI"

  ensure_streamlit || return 1

  kill_port_listener 8502 "Pipeline UI"

  local ui_dir="$ROOT_DIR/gateway/ui"
  log STEP "Starting Pipeline UI on port 8502 ..."
  setsid bash -c "cd '$ui_dir' && exec streamlit run app.py --server.port=8502 --server.address=0.0.0.0 --server.headless=true --logger.level=info" > "$UI_LOG" 2>&1 &
  sleep 1
  local ui_pid
  ui_pid="$(pgrep -f "streamlit run app.py.*8502" | head -1)"
  if [[ -n "$ui_pid" ]]; then
    echo "$ui_pid" > "$UI_PID"
    STARTED_PIDS+=("$ui_pid")
    log OK "Pipeline UI started (pid=$ui_pid, log=$UI_LOG)"
  else
    log FAIL "Pipeline UI failed to start. Check logs: $UI_LOG"
    return 1
  fi
  sleep 3

  if curl -fsS "http://127.0.0.1:8502/" >/dev/null 2>&1; then
    log DONE "Pipeline UI is ready on http://0.0.0.0:8502"
  else
    log WARN "Pipeline UI did not respond yet. Check logs: $UI_LOG"
  fi
}

start_mapper_ui() {
  banner "Mapper Testing UI"

  ensure_streamlit || return 1

  kill_port_listener 8501 "Mapper UI"

  local web_dir="$ROOT_DIR/Mapper/web"
  log STEP "Starting Mapper UI on port 8501 ..."
  setsid bash -c "cd '$web_dir' && exec streamlit run app.py --server.port=8501 --server.address=0.0.0.0 --server.headless=true --logger.level=info" > "$MAPPER_UI_LOG" 2>&1 &
  sleep 1
  local mapper_ui_pid
  mapper_ui_pid="$(pgrep -f "streamlit run app.py.*8501" | head -1)"
  if [[ -n "$mapper_ui_pid" ]]; then
    echo "$mapper_ui_pid" > "$MAPPER_UI_PID"
    STARTED_PIDS+=("$mapper_ui_pid")
    log OK "Mapper UI started (pid=$mapper_ui_pid, log=$MAPPER_UI_LOG)"
  else
    log FAIL "Mapper UI failed to start. Check logs: $MAPPER_UI_LOG"
    return 1
  fi
  sleep 3

  if curl -fsS "http://127.0.0.1:8501/" >/dev/null 2>&1; then
    log DONE "Mapper UI is ready on http://0.0.0.0:8501"
  else
    log WARN "Mapper UI did not respond yet. Check logs: $MAPPER_UI_LOG"
  fi
}

###############################################################################
# Commands
###############################################################################
cmd_stop() {
  banner "Stopping All Services"

  stop_service "Pipeline UI" "$UI_PID"
  stop_service "Mapper UI" "$MAPPER_UI_PID"
  stop_service "Gateway" "$GATEWAY_PID"
  stop_service "OCR API wrapper" "$OCR_API_PID"
  stop_service "Mapper llama-server" "$MAPPER_PID"
  stop_service "OCR vLLM backend" "$OCR_VLLM_PID"

  log DONE "All services stopped"
}

cmd_status() {
  banner "Service Status"

  print_status "OCR vLLM backend"  "$OCR_VLLM_PID"  "$OCR_BACKEND_URL"
  print_status "OCR API wrapper"   "$OCR_API_PID"   "$OCR_API_URL"
  print_status "Mapper llama-server" "$MAPPER_PID"   "$MAPPER_URL"
  print_status "Gateway FastAPI"    "$GATEWAY_PID"   "$GATEWAY_URL"
  print_status "Pipeline UI"        "$UI_PID"        "$UI_URL"
  print_status "Mapper UI"          "$MAPPER_UI_PID" "$MAPPER_UI_URL"

  echo ""
  log INFO "Log directory: $LOG_DIR"
  echo ""

  # Show log file sizes
  for log_file in "$LOG_DIR"/*.log; do
    if [[ -f "$log_file" ]]; then
      local size
      size="$(wc -c < "$log_file" 2>/dev/null || echo 0)"
      local lines
      lines="$(wc -l < "$log_file" 2>/dev/null || echo 0)"
      echo "  $(basename "$log_file"): ${lines} lines, ${size} bytes"
    fi
  done
}

cmd_logs() {
  local service="${1:-all}"

  case "$service" in
    ocr)
      log INFO "Tailing OCR logs (Ctrl+C to exit)"
      touch "$OCR_VLLM_LOG" "$OCR_API_LOG"
      tail -n 80 -f "$OCR_VLLM_LOG" "$OCR_API_LOG"
      ;;
    mapper)
      log INFO "Tailing Mapper logs (Ctrl+C to exit)"
      touch "$MAPPER_LOG"
      tail -n 80 -f "$MAPPER_LOG"
      ;;
    gateway)
      log INFO "Tailing Gateway logs (Ctrl+C to exit)"
      touch "$GATEWAY_LOG"
      tail -n 80 -f "$GATEWAY_LOG"
      ;;
    ui)
      log INFO "Tailing UI logs (Ctrl+C to exit)"
      touch "$UI_LOG"
      tail -n 80 -f "$UI_LOG"
      ;;
    all|*)
      log INFO "Tailing all logs (Ctrl+C to exit)"
      touch "$OCR_VLLM_LOG" "$OCR_API_LOG" "$MAPPER_LOG" "$GATEWAY_LOG" "$UI_LOG" "$MAPPER_UI_LOG"
      tail -n 80 -f "$OCR_VLLM_LOG" "$OCR_API_LOG" "$MAPPER_LOG" "$GATEWAY_LOG" "$UI_LOG" "$MAPPER_UI_LOG"
      ;;
  esac
}

cmd_health() {
  banner "Health Checks"

  local failures=0

  echo ""
  log STEP "Checking OCR backend ($OCR_BACKEND_URL)..."
  if curl -fsS "$OCR_BACKEND_URL" >/dev/null 2>&1; then
    log OK "OCR backend: OK"
  else
    log FAIL "OCR backend: UNREACHABLE"
    failures=$((failures + 1))
  fi

  log STEP "Checking OCR API ($OCR_API_URL)..."
  if curl -fsS "$OCR_API_URL" >/dev/null 2>&1; then
    log OK "OCR API: OK"
  else
    log FAIL "OCR API: UNREACHABLE"
    failures=$((failures + 1))
  fi

  log STEP "Checking Mapper ($MAPPER_URL)..."
  if curl -fsS "$MAPPER_URL" >/dev/null 2>&1; then
    log OK "Mapper: OK"
  else
    log FAIL "Mapper: UNREACHABLE"
    failures=$((failures + 1))
  fi

  log STEP "Checking Gateway ($GATEWAY_URL)..."
  local gw_response
  gw_response="$(curl -fsS "$GATEWAY_URL" 2>/dev/null || echo "")"
  if [[ -n "$gw_response" ]]; then
    log OK "Gateway: OK"
    # Parse health response
    if echo "$gw_response" | python3 -c "
import sys, json
data = json.load(sys.stdin)
status = data.get('status', 'unknown')
deps = data.get('dependencies', {})
print(f'  Status: {status}')
for dep, state in deps.items():
    ok = state.get('ok', 'N/A') if isinstance(state, dict) else 'N/A'
    marker = 'OK' if ok else 'FAIL'
    print(f'  {dep}: {marker}')
" 2>/dev/null; then
      :
    else
      echo "  Raw response: $gw_response"
    fi
  else
    log FAIL "Gateway: UNREACHABLE"
    failures=$((failures + 1))
  fi

  log STEP "Checking Pipeline UI ($UI_URL)..."
  if curl -fsS "$UI_URL" >/dev/null 2>&1; then
    log OK "Pipeline UI: OK"
  else
    log INFO "Pipeline UI: NOT RUNNING"
  fi

  log STEP "Checking Mapper UI ($MAPPER_UI_URL)..."
  if curl -fsS "$MAPPER_UI_URL" >/dev/null 2>&1; then
    log OK "Mapper UI: OK"
  else
    log INFO "Mapper UI: NOT RUNNING"
  fi

  echo ""
  if [[ $failures -eq 0 ]]; then
    log DONE "All critical services healthy"
  else
    log FAIL "$failures service(s) unreachable"
  fi

  return $failures
}

cmd_smoke() {
  banner "Gateway Smoke Test"

  local smoke_script="$SCRIPTS_DIR/smoke_gateway.sh"
  if [[ -x "$smoke_script" ]]; then
    "$smoke_script"
  else
    log FAIL "Smoke test script not found: $smoke_script"
    return 1
  fi
}

cmd_test() {
  banner "Running Acceptance Tests"

  cd "$ROOT_DIR"

  # Find Python interpreter
  local python_bin="python3"
  if [[ -x "$ROOT_DIR/OCR/OCRpipelie/venv/bin/python3" ]]; then
    python_bin="$ROOT_DIR/OCR/OCRpipelie/venv/bin/python3"
  elif [[ -x "$ROOT_DIR/Mapper/mapper/bin/python3" ]]; then
    python_bin="$ROOT_DIR/Mapper/mapper/bin/python3"
  fi

  export PYTHONPATH="$ROOT_DIR:${PYTHONPATH:-}"

  log STEP "Running gateway acceptance tests..."
  "$python_bin" -m pytest tests/gateway_acceptance -v --tb=short 2>&1 | tee "$LOG_DIR/tests.log"
  local exit_code=${PIPESTATUS[0]}

  echo ""
  if [[ $exit_code -eq 0 ]]; then
    log DONE "All tests passed"
  else
    log FAIL "Tests failed (exit code: $exit_code). See $LOG_DIR/tests.log"
  fi

  return $exit_code
}

cmd_gpu_clear() {
  banner "GPU Clear"

  local clear_script="$SCRIPTS_DIR/shutdown_and_clear_gpu.sh"
  if [[ -x "$clear_script" ]]; then
    "$clear_script"
  else
    log FAIL "GPU clear script not found: $clear_script"
    return 1
  fi
}

cmd_all() {
  banner "Starting Full DOC2FHIR Pipeline"

  log INFO "Timestamp: $TIMESTAMP"
  log INFO "Root: $ROOT_DIR"
  log INFO "Logs: $LOG_DIR"
  echo ""

  local failures=0

  # Step 1: OCR
  start_ocr || failures=$((failures + 1))

  # Step 2: Mapper
  start_mapper || failures=$((failures + 1))

  # Step 3: Gateway
  start_gateway || failures=$((failures + 1))

  # Optional: UI
  if [[ "$WITH_UI" == true ]]; then
    start_ui || failures=$((failures + 1))
  fi

  # Optional: Mapper UI
  if [[ "$WITH_MAPPER_UI" == true ]]; then
    start_mapper_ui || failures=$((failures + 1))
  fi

  echo ""
  if [[ $failures -eq 0 ]]; then
    log DONE "Full pipeline started successfully"
    echo ""
    log INFO "Service URLs:"
    log INFO "  OCR API:       http://127.0.0.1:7862"
    log INFO "  Mapper:        http://127.0.0.1:8070"
    log INFO "  Gateway API:   http://127.0.0.1:8001"
    log INFO "  Gateway Docs:  http://127.0.0.1:8001/docs"
    [[ "$WITH_UI" == true ]] && log INFO "  Pipeline UI:   http://127.0.0.1:8502"
    [[ "$WITH_MAPPER_UI" == true ]] && log INFO "  Mapper UI:     http://127.0.0.1:8501"
    echo ""
    log INFO "Commands:"
    log INFO "  ./run.sh status   - Check service status"
    log INFO "  ./run.sh health   - Run health checks"
    log INFO "  ./run.sh logs     - Tail all logs"
    log INFO "  ./run.sh stop     - Stop all services"
  else
    log FAIL "$failures service(s) failed to start"
    log INFO "Check logs in $LOG_DIR for details"
    log INFO "Run './run.sh status' for current state"
    return 1
  fi

  # Foreground mode: block and handle Ctrl+C
  if [[ "$FOREGROUND" == true ]]; then
    echo ""
    log INFO "Running in foreground. Press Ctrl+C to stop all services."
    echo ""

    cleanup() {
      echo ""
      log STEP "Received interrupt signal. Stopping all services..."
      cmd_stop
      exit 0
    }
    trap cleanup SIGINT SIGTERM

    # Wait indefinitely
    while true; do
      sleep 60
    done
  fi
}

cmd_restart() {
  banner "Restarting All Services"
  cmd_stop
  sleep 2
  cmd_all
}

cmd_help() {
  cat <<EOF
DOC2FHIR Unified Runner

Usage: ./run.sh <command> [options]

Commands:
  ocr             Start OCR service (vLLM Docker + API wrapper)
  mapper          Start Mapper service (llama.cpp + Gemma-4)
  gateway         Start Gateway API (FastAPI)
  ui              Start Pipeline UI (Streamlit)
  mapper-ui       Start Mapper testing UI (Streamlit)
  all             Start full pipeline: OCR + Mapper + Gateway
  stop            Stop all managed services
  restart         Stop then start all services
  status          Show status of all services
  logs [service]  Tail logs (all|ocr|mapper|gateway|ui)
  health          Run health checks against all services
  smoke           Run gateway smoke test
  test            Run acceptance tests
  gpu-clear       Force-stop everything and clear GPU memory
  help            Show this help

Options:
  --with-ui         Also start the pipeline Streamlit UI (for 'all')
  --with-mapper-ui  Also start the Mapper Streamlit UI (for 'all')
  --foreground      Run in foreground, Ctrl+C stops all (for 'all')
  --no-color        Disable colored output
  --log-dir DIR     Override log directory
  --tail N          Show last N log lines on startup

Examples:
  ./run.sh all --with-ui --foreground     # Start everything, block terminal
  ./run.sh ocr                             # Start only OCR
  ./run.sh status                          # Check what's running
  ./run.sh health                          # Verify all services respond
  ./run.sh logs gateway                    # Watch gateway logs only
  ./run.sh test                            # Run acceptance tests
  ./run.sh stop                            # Shut everything down
  ./run.sh gpu-clear                       # Nuclear option: kill everything on GPU
EOF
}

###############################################################################
# Main
###############################################################################
parse_args "$@"

COMMAND="${ARGS[0]:-help}"

case "$COMMAND" in
  ocr)
    start_ocr
    ;;
  mapper)
    start_mapper
    ;;
  gateway)
    start_gateway
    ;;
  ui)
    start_ui
    ;;
  mapper-ui)
    start_mapper_ui
    ;;
  all)
    cmd_all
    ;;
  stop)
    cmd_stop
    ;;
  restart)
    cmd_restart
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs "${ARGS[1]:-all}"
    ;;
  health)
    cmd_health
    ;;
  smoke)
    cmd_smoke
    ;;
  test)
    cmd_test
    ;;
  gpu-clear)
    cmd_gpu_clear
    ;;
  help|--help|-h)
    cmd_help
    ;;
  *)
    log ERROR "Unknown command: $COMMAND"
    echo ""
    cmd_help
    exit 1
    ;;
esac
