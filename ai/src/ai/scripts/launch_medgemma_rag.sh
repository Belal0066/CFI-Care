#!/bin/bash
# [DEPRECATED] Use ./launch.sh --local instead
# This script only supports the local llama.cpp backend.
# For Lightning AI (27B), run: ./launch.sh --lightning

set -e  # Exit on error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Force local backend for this legacy script
export LLM_BACKEND=local

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log files
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"
LLAMA_LOG="$LOG_DIR/llama-server.log"
STREAMLIT_LOG="$LOG_DIR/streamlit.log"

# Configuration
LLAMA_MODEL="models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf"
LLAMA_MMPROJ="models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf"
LLAMA_PORT=8000
STREAMLIT_PORT=8501

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   MedGemma RAG System Launcher${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW} Shutting down services...${NC}"
    
    # Kill llama-server
    if [ ! -z "$LLAMA_PID" ]; then
        echo "  Stopping llama-server (PID: $LLAMA_PID)..."
        kill $LLAMA_PID 2>/dev/null || true
    fi
    
    # Kill streamlit
    if [ ! -z "$STREAMLIT_PID" ]; then
        echo "  Stopping Streamlit (PID: $STREAMLIT_PID)..."
        kill $STREAMLIT_PID 2>/dev/null || true
    fi
    
    echo -e "${GREEN} Cleanup complete${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Step 1: Start Qdrant
echo -e "${BLUE}[1/3]${NC} Starting Qdrant Docker container..."
if docker ps | grep -q clinical_vector; then
    echo -e "${GREEN}   Qdrant already running${NC}"
else
    docker compose up -d qdrant
    echo -e "${GREEN}   Qdrant started${NC}"
    sleep 3  # Wait for Qdrant to initialize
fi

# Verify Qdrant
if curl -s http://localhost:6333/collections >/dev/null 2>&1; then
    echo -e "${GREEN}   Qdrant responding on port 6333${NC}"
else
    echo -e "${RED}   Qdrant not responding${NC}"
    exit 1
fi

echo ""

# Step 2: Start llama-server
echo -e "${BLUE}[2/3]${NC} Starting llama.cpp server (MedGemma 1.5)..."

# Check if already running
if check_port $LLAMA_PORT; then
    echo -e "${YELLOW}  ️  Port $LLAMA_PORT already in use${NC}"
    echo -e "${YELLOW}  Assuming llama-server is already running${NC}"
    LLAMA_PID=""
else
    # Check if model exists
    if [ ! -f "$LLAMA_MODEL" ]; then
        echo -e "${RED}   Model not found: $LLAMA_MODEL${NC}"
        echo -e "${YELLOW}  Please download MedGemma model first${NC}"
        exit 1
    fi
    
    echo "  Model: $LLAMA_MODEL"
    echo "  Port: $LLAMA_PORT"
    echo "  Log: $LLAMA_LOG"
    
    # Start llama-server in background
    ./llama.cpp/build/bin/llama-server \
    -m models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf \
    --mmproj models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf \
    --host 0.0.0.0 \
    --port 8000 \
    --n-gpu-layers -1 \
    --ctx-size 16384 \
    --flash-attn on \
    --cache-type-k q8_0 \
    --cache-type-v q8_0 \
    > "$LLAMA_LOG" 2>&1 &
    
    LLAMA_PID=$!
    echo "  PID: $LLAMA_PID"
    
    # Wait for server to start
    echo -n "  Waiting for server to start"
    for i in {1..30}; do
        if curl -s http://localhost:$LLAMA_PORT/health >/dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}   llama-server ready${NC}"
            break
        fi
        echo -n "."
        sleep 1
    done
    
    if ! curl -s http://localhost:$LLAMA_PORT/health >/dev/null 2>&1; then
        echo ""
        echo -e "${RED}   llama-server failed to start${NC}"
        echo -e "${YELLOW}  Check logs: $LLAMA_LOG${NC}"
        cleanup
        exit 1
    fi
fi

echo ""

# Step 3: Start Streamlit
echo -e "${BLUE}[3/3]${NC} Starting Streamlit UI..."

if check_port $STREAMLIT_PORT; then
    echo -e "${YELLOW}  ️  Port $STREAMLIT_PORT already in use${NC}"
    echo -e "${YELLOW}  Assuming Streamlit is already running${NC}"
    STREAMLIT_PID=""
else
    echo "  Port: $STREAMLIT_PORT"
    echo "  Log: $STREAMLIT_LOG"
    
    # Start Streamlit in background
    export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"
    streamlit run src/ui/streamlit_rag_app.py \
        --server.port $STREAMLIT_PORT \
        --server.address 0.0.0.0 \
        --server.headless true \
        --server.baseUrlPath /chat \
        > "$STREAMLIT_LOG" 2>&1 &
    
    STREAMLIT_PID=$!
    echo "  PID: $STREAMLIT_PID"
    
    # Wait for Streamlit to start
    echo -n "  Waiting for Streamlit"
    for i in {1..20}; do
        if curl -s http://localhost:$STREAMLIT_PORT >/dev/null 2>&1; then
            echo ""
            echo -e "${GREEN}   Streamlit ready${NC}"
            break
        fi
        echo -n "."
        sleep 1
    done
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   All services running!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${BLUE} Service URLs:${NC}"
echo -e "  • Qdrant:         ${GREEN}http://localhost:6333${NC}"
echo -e "  • llama-server:   ${GREEN}http://localhost:$LLAMA_PORT${NC}"
echo -e "  • Streamlit UI:   ${GREEN}http://localhost:$STREAMLIT_PORT${NC}"
echo ""
echo -e "${BLUE} Logs:${NC}"
echo -e "  • llama-server:   $LLAMA_LOG"
echo -e "  • Streamlit:      $STREAMLIT_LOG"
echo ""
echo -e "${YELLOW} Next Steps:${NC}"
echo -e "  1. Open: ${GREEN}http://localhost:$STREAMLIT_PORT${NC}"
echo -e "  2. If no data, run: ${BLUE}python scripts/quick_seed_rag.py${NC}"
echo -e "  3. Test RAG in the web interface"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and monitor processes
while true; do
    # Check if processes are still running
    if [ ! -z "$LLAMA_PID" ] && ! kill -0 $LLAMA_PID 2>/dev/null; then
        echo -e "${RED}️  llama-server crashed! Check logs: $LLAMA_LOG${NC}"
        cleanup
        exit 1
    fi
    
    if [ ! -z "$STREAMLIT_PID" ] && ! kill -0 $STREAMLIT_PID 2>/dev/null; then
        echo -e "${RED}️  Streamlit crashed! Check logs: $STREAMLIT_LOG${NC}"
        cleanup
        exit 1
    fi
    
    sleep 5
done
