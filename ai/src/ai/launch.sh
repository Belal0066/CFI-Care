#!/bin/bash
# =============================================================================
# Master Orchestrator: Clinical AI System
# =============================================================================
# Services:
#   1. Qdrant (Vector DB)
#   2. MedGemma LLM (llama.cpp server)
#   3. FastAPI Backend (Port 8001) - Handles RAG + MCP routing
#   4. MCP Server (Port 8002) - Internet retrieval (PubMed/OpenFDA)
# =============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

QDRANT_PORT=6333
LLAMA_PORT=8000
BACKEND_PORT=8001
MCP_PORT=8002

# LLM Backend: default to "local", override with --lightning
LLM_BACKEND="local"

# Process IDs
LLAMA_PID=""
BACKEND_PID=""
MCP_PID=""

# Parse arguments
for arg in "$@"; do
    case "$arg" in
        --local)
            LLM_BACKEND="local"
            ;;
        --lightning)
            LLM_BACKEND="lightning"
            ;;
        *)
            echo -e "${YELLOW}Unknown argument: $arg${NC}"
            echo -e "Usage: $0 [--local | --lightning]"
            exit 1
            ;;
    esac
done

# Export LLM_BACKEND so the .env and config can pick it up
export LLM_BACKEND

echo -e "${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Clinical AI System - Master Launcher      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN} LLM Backend:${NC} $([ "$LLM_BACKEND" = "lightning" ] && echo "Lightning AI (MedGemma 27B)" || echo "Local (llama.cpp MedGemma 4B)")"
echo ""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW} Shutting down all services...${NC}"
    
    [ -n "$MCP_PID" ] && kill $MCP_PID 2>/dev/null && echo "  ✓ MCP Server stopped"
    [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null && echo "  ✓ Backend stopped"
    [ -n "$LLAMA_PID" ] && kill $LLAMA_PID 2>/dev/null && echo "  ✓ LLM Server stopped"
    
    echo -e "${GREEN} Cleanup complete${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Port check helper
check_port() {
    lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1
}

# Health check with timeout
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=${3:-30}
    
    echo -n "   Waiting for $name"
    for i in $(seq 1 $max_attempts); do
        if curl -s "$url" >/dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}   $name ready${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo ""
    echo -e "${RED}   $name failed to start${NC}"
    return 1
}

# =============================================================================
# [1/4] Qdrant (Docker)
# =============================================================================
echo -e "${BLUE}[1/4] Qdrant Vector Database${NC}"

if docker ps | grep -q clinical_vector; then
    echo -e "${GREEN}   Already running${NC}"
elif docker ps -a | grep -q clinical_vector; then
    echo "   Starting existing container..."
    docker start clinical_vector
else
    echo "   Launching new container..."
    docker compose up -d qdrant
fi

wait_for_service "http://localhost:$QDRANT_PORT/collections" "Qdrant" 15 || exit 1
echo ""

# =============================================================================
# [2/4] MedGemma LLM Server
# =============================================================================
echo -e "${BLUE}[2/4] MedGemma LLM Server${NC}"

if [ "$LLM_BACKEND" = "lightning" ]; then
    # -------------------------------------------------------------------------
    # Lightning AI (Remote 27B) — skip local launch, verify connectivity
    # -------------------------------------------------------------------------
    echo "   Backend: Lightning AI (MedGemma 27B)"
    
    # Load only LIGHTNING_* vars from .env (don't source the whole file — it would overwrite LLM_BACKEND)
    if [ -f "$PROJECT_ROOT/.env" ]; then
        LIGHTNING_BASE_URL=$(grep -E '^LIGHTNING_BASE_URL=' "$PROJECT_ROOT/.env" | tail -1 | cut -d= -f2-)
        LIGHTNING_ACCESS_TOKEN=$(grep -E '^LIGHTNING_ACCESS_TOKEN=' "$PROJECT_ROOT/.env" | tail -1 | cut -d= -f2-)
        LIGHTNING_MODEL_NAME=$(grep -E '^LIGHTNING_MODEL_NAME=' "$PROJECT_ROOT/.env" | tail -1 | cut -d= -f2-)
        export LIGHTNING_BASE_URL LIGHTNING_ACCESS_TOKEN LIGHTNING_MODEL_NAME
    fi
    
    if [ -z "$LIGHTNING_BASE_URL" ]; then
        echo -e "${RED}   LIGHTNING_BASE_URL not set in .env${NC}"
        echo -e "${YELLOW}  Set it to your Lightning AI instance URL (e.g., https://<id>-8000.<region>.studios.lightning.ai/v1)${NC}"
        cleanup
        exit 1
    fi
    
    # Verify connectivity to Lightning AI
    HEALTH_URL="${LIGHTNING_BASE_URL%/v1}/health"
    echo "   Checking connectivity: $HEALTH_URL"
    
    wait_for_service "$HEALTH_URL" "Lightning AI (27B)" 10 || {
        echo -e "${YELLOW}   Warning: Lightning AI not reachable yet — will retry at runtime${NC}"
        echo -e "${YELLOW}   Ensure your Lightning AI Studio is running at: ${LIGHTNING_BASE_URL%/v1}${NC}"
    }
else
    # -------------------------------------------------------------------------
    # Local llama.cpp (MedGemma 4B)
    # -------------------------------------------------------------------------
    if check_port $LLAMA_PORT; then
        echo -e "${YELLOW}  ️  Port $LLAMA_PORT already in use (assuming running)${NC}"
    else
        LLAMA_MODEL="models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf"
        
        if [ ! -f "$LLAMA_MODEL" ]; then
            echo -e "${RED}   Model not found: $LLAMA_MODEL${NC}"
            echo -e "${YELLOW}  Run: huggingface-cli download google/medgemma-1.5-4b-it-GGUF --local-dir models/${NC}"
            cleanup
            exit 1
        fi
        
        echo "   Model: medgemma-1.5-4b-it-Q6_K"
        echo "   Port: $LLAMA_PORT"
        
        ./llama.cpp/build/bin/llama-server \
            -m "$LLAMA_MODEL" \
            --mmproj models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf \
            --host 0.0.0.0 \
            --port $LLAMA_PORT \
            -ngl -1 \
            --ctx-size 16384 \
            --flash-attn on \
            > "$LOG_DIR/llama-server.log" 2>&1 &
        
        LLAMA_PID=$!
        echo "   PID: $LLAMA_PID"
        
        wait_for_service "http://localhost:$LLAMA_PORT/health" "LLM Server" 45 || {
            echo -e "${YELLOW}   Check logs: $LOG_DIR/llama-server.log${NC}"
            cleanup
            exit 1
        }
    fi
fi
echo ""

# =============================================================================
# [3/4] FastAPI Backend (RAG Hub)
# =============================================================================
echo -e "${BLUE}[3/4] FastAPI Backend (RAG Hub)${NC}"

if check_port $BACKEND_PORT; then
    echo -e "${YELLOW}  ️  Port $BACKEND_PORT already in use${NC}"
    BACKEND_PID=""
else
    echo "   Port: $BACKEND_PORT"
    export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"
    
    uv run uvicorn src.api.FastAPI_Backend:app \
        --host 0.0.0.0 \
        --port $BACKEND_PORT \
        --log-level info \
        > "$LOG_DIR/backend.log" 2>&1 &
    
    BACKEND_PID=$!
    echo "   PID: $BACKEND_PID"
    
    wait_for_service "http://localhost:$BACKEND_PORT/health" "Backend" 60 || {
        echo -e "${YELLOW}   Check logs: $LOG_DIR/backend.log${NC}"
        cleanup
        exit 1
    }
fi
echo ""

# =============================================================================
# [4/4] MCP Server (Internet Engine)
# =============================================================================
echo -e "${BLUE}[4/4] MCP Server (Internet Retrieval)${NC}"

if check_port $MCP_PORT; then
    echo -e "${YELLOW}  ️  Port $MCP_PORT already in use${NC}"
    MCP_PID=""
else
    echo "   Port: $MCP_PORT"
    echo "   Adapters: PubMed, OpenFDA, NIH"
    
    # Load MCP environment variables
    if [ -f mcps/.env ]; then
        echo "   Loading mcps/.env"
        export $(grep -v '^#' mcps/.env | xargs 2>/dev/null)
    fi
    
    # Check for required API keys
    if [ -z "$GROQ_API_KEY" ] && [ -z "$LLAMACPP_API_KEY" ]; then
        echo -e "${YELLOW}  ️  Warning: No LLM API key found (GROQ_API_KEY or LLAMACPP_API_KEY)${NC}"
        echo -e "${YELLOW}  MCP will start but classification may fail${NC}"
    else
        echo -e "${GREEN}  ✓${NC} GROQ_API_KEY loaded"
    fi
    
    cd mcps
    uv run uvicorn main:app \
        --host 0.0.0.0 \
        --port $MCP_PORT \
        --log-level info \
        > "$LOG_DIR/mcp-server.log" 2>&1 &
    
    MCP_PID=$!
    echo "   PID: $MCP_PID"
    cd "$PROJECT_ROOT"
    
    wait_for_service "http://localhost:$MCP_PORT/health" "MCP Server" 20 || {
        echo -e "${YELLOW}  Note: MCP health check failed but continuing...${NC}"
        echo -e "${YELLOW}   Check logs: $LOG_DIR/mcp-server.log${NC}"
    }
fi
echo ""

# =============================================================================
# Auto-ingest data from Redis to Qdrant
# =============================================================================
echo -e "${BLUE}  Ingesting data from Redis...${NC}"
curl -s -X POST "http://localhost:$BACKEND_PORT/ingest" -o /dev/null -w "  → %{http_code} (%{size_download} bytes)\n" || echo -e "${YELLOW}  ⚠ Ingestion skipped (Redis not reachable?)${NC}"
echo ""

# =============================================================================
# System Ready
# =============================================================================
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   All Systems Operational                    ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN} Service Endpoints:${NC}"
echo -e "  ${GREEN}Qdrant:${NC}        http://localhost:$QDRANT_PORT"
if [ "$LLM_BACKEND" = "lightning" ]; then
    echo -e "  ${GREEN}LLM (27B):${NC}      ${LIGHTNING_BASE_URL%/v1} (Lightning AI)"
else
    echo -e "  ${GREEN}LLM (4B):${NC}       http://localhost:$LLAMA_PORT (llama.cpp)"
fi
echo -e "  ${GREEN}Backend (RAG):${NC} http://localhost:$BACKEND_PORT"
echo -e "  ${GREEN}MCP (Internet):${NC} http://localhost:$MCP_PORT"
echo ""

echo -e "${CYAN} API Documentation:${NC}"
echo -e "  ${BLUE}Backend Docs:${NC}  http://localhost:$BACKEND_PORT/docs"
echo ""

echo -e "${CYAN} Quick Commands:${NC}"
echo -e "  ${YELLOW}# Launch Streamlit Dashboard:${NC}"
echo -e "  ./launch_dashboard.sh"
echo ""
echo -e "  ${YELLOW}# Seed data from Redis (auto on launch):${NC}"
echo -e "  curl -X POST http://localhost:$BACKEND_PORT/ingest"
echo ""
echo -e "  ${YELLOW}# Test RAG mode:${NC}"
echo -e "  curl -X POST http://localhost:$BACKEND_PORT/chat \\"
echo -e "    -H 'Content-Type: application/json' \\"
echo -e "    -d '{\"query\": \"diabetes treatment\", \"mode\": \"rag\"}'"
echo ""
echo -e "  ${YELLOW}# Test MCP mode:${NC}"
echo -e "  curl -X POST http://localhost:$BACKEND_PORT/chat \\"
echo -e "    -H 'Content-Type: application/json' \\"
echo -e "    -d '{\"query\": \"aspirin interactions\", \"mode\": \"mcp\"}'"
echo ""

echo -e "${CYAN} Logs:${NC}"
if [ "$LLM_BACKEND" != "lightning" ]; then
    echo -e "  tail -f $LOG_DIR/llama-server.log"
fi
echo -e "  tail -f $LOG_DIR/backend.log"
echo -e "  tail -f $LOG_DIR/mcp-server.log"
echo ""

echo -e "${YELLOW}️  Press Ctrl+C to shutdown all services${NC}"
echo ""

# Monitor loop
while true; do
    if [ "$LLM_BACKEND" != "lightning" ] && [ -n "$LLAMA_PID" ] && ! kill -0 $LLAMA_PID 2>/dev/null; then
        echo -e "${RED} LLM Server (llama.cpp) crashed!${NC}"
        cleanup
        exit 1
    fi
    
    if [ -n "$BACKEND_PID" ] && ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED} Backend crashed!${NC}"
        cleanup
        exit 1
    fi
    
    if [ -n "$MCP_PID" ] && ! kill -0 $MCP_PID 2>/dev/null; then
        echo -e "${RED} MCP Server crashed!${NC}"
        cleanup
        exit 1
    fi
    
    sleep 5
done
