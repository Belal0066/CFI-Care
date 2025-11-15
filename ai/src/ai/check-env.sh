#!/bin/bash
# =============================================================================
# Environment Validation Script
# Checks all required dependencies, configs, and API keys before launch
# =============================================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BLUE} Clinical AI System - Environment Validation${NC}"
echo "================================================"
echo ""

# Check function
check() {
    local name=$1
    local command=$2
    local level=${3:-error}  # error or warning
    
    if eval "$command" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name"
        return 0
    else
        if [ "$level" == "error" ]; then
            echo -e "${RED}✗${NC} $name"
            ((ERRORS++))
        else
            echo -e "${YELLOW}${NC} $name"
            ((WARNINGS++))
        fi
        return 1
    fi
}

# =============================================================================
# System Dependencies
# =============================================================================
echo -e "${BLUE}[1] System Dependencies${NC}"

check "Python 3.9+" "python3 --version | grep -E 'Python 3\.(9|1[0-9])'"
check "uv package manager" "which uv"
check "Docker" "docker --version"
check "Docker Compose" "docker compose version"
check "curl" "which curl"
check "lsof" "which lsof"

echo ""

# =============================================================================
# Python Packages
# =============================================================================
echo -e "${BLUE}[2] Python Packages${NC}"

check "FastAPI" "python3 -c 'import fastapi'"
check "Uvicorn" "python3 -c 'import uvicorn'"
check "Pydantic" "python3 -c 'import pydantic'"
check "Qdrant Client" "python3 -c 'import qdrant_client'"
check "FastEmbed" "python3 -c 'import fastembed'"
check "FHIR Resources" "python3 -c 'import fhir.resources'"
check "Redis" "python3 -c 'import redis'"
check "httpx" "python3 -c 'import httpx'"
check "LangGraph" "python3 -c 'import langgraph'" "warning"
check "LangChain" "python3 -c 'import langchain'" "warning"

echo ""

# =============================================================================
# File Structure
# =============================================================================
echo -e "${BLUE}[3] Project Structure${NC}"

check "Source Directory" "[ -d src ]"
check "Ingestion Module" "[ -f src/ingestion/service.py ]"
check "API Backend" "[ -f src/api/FastAPI_Backend.py ]"
check "MCP Server" "[ -f mcps/main.py ]"
check "MCP Router" "[ -f mcps/router.py ]"
check "Shared DB Clients" "[ -f src/shared/db_clients.py ]"

echo ""

# =============================================================================
# Models
# =============================================================================
echo -e "${BLUE}[4] AI Models${NC}"

# Load LLM_BACKEND
if [ -f .env ]; then
    export $(grep -E '^LLM_BACKEND=' .env | xargs 2>/dev/null)
fi
LLM_BACKEND="${LLM_BACKEND:-local}"

if [ "$LLM_BACKEND" = "lightning" ]; then
    # Lightning AI (remote) — check URL is configured
    if [ -f .env ]; then
        export $(grep -E '^LIGHTNING_BASE_URL=' .env | xargs 2>/dev/null)
    fi
    if [ -n "$LIGHTNING_BASE_URL" ]; then
        echo -e "${GREEN}✓${NC} Lightning AI configured: $LIGHTNING_BASE_URL"
    else
        echo -e "${YELLOW}${NC} LIGHTNING_BASE_URL not set (Lightning AI backend won't work)"
        ((WARNINGS++))
    fi
else
    # Local llama.cpp — check binary and model
    LLAMA_BUILD="./llama.cpp/build/bin/llama-server"
    MEDGEMMA_MODEL="models/medgemma-1.5-4b-it-Q6_K/medgemma-1.5-4b-it-Q6_K.gguf"
    MMPROJ="models/medgemma-1.5-4b-it-Q6_K/mmproj-F16.gguf"

    check "llama.cpp Binary" "[ -f $LLAMA_BUILD ]"

    if check "MedGemma Model (4B)" "[ -f $MEDGEMMA_MODEL ]"; then
        SIZE=$(du -h "$MEDGEMMA_MODEL" | cut -f1)
        echo "  └─ Size: $SIZE"
    fi

    if check "Vision Projector (mmproj)" "[ -f $MMPROJ ]" "warning"; then
        SIZE=$(du -h "$MMPROJ" | cut -f1)
        echo "  └─ Size: $SIZE"
    fi
fi

echo ""

# =============================================================================
# Configuration & API Keys
# =============================================================================
echo -e "${BLUE}[5] Configuration${NC}"

# Load .env if exists
if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} .env file found"
    export $(grep -v '^#' .env | xargs 2>/dev/null)
else
    echo -e "${YELLOW}${NC} .env file not found (using system environment)"
fi

# Load MCP .env
if [ -f mcps/.env ]; then
    echo -e "${GREEN}✓${NC} mcps/.env file found"
    export $(grep -v '^#' mcps/.env | xargs 2>/dev/null)
fi

# Redis Connection (Data Source)
if [ -n "$REDIS_HOST" ]; then
    echo -e "${GREEN}✓${NC} REDIS_HOST configured: $REDIS_HOST"
else
    echo -e "${YELLOW}${NC} REDIS_HOST not set (will use default)"
    ((WARNINGS++))
fi

# LLM API Keys (for MCP classification)
if [ -n "$GROQ_API_KEY" ]; then
    echo -e "${GREEN}✓${NC} GROQ_API_KEY configured (for MCP)"
elif [ -n "$LLAMACPP_API_KEY" ]; then
    echo -e "${GREEN}✓${NC} LLAMACPP_API_KEY configured (for MCP)"
else
    echo -e "${YELLOW}${NC} No LLM API key found (MCP classification may fail)"
    ((WARNINGS++))
fi

# Qdrant
QDRANT_HOST=${QDRANT_HOST:-localhost}
QDRANT_PORT=${QDRANT_PORT:-6333}
echo -e "${GREEN}✓${NC} Qdrant target: $QDRANT_HOST:$QDRANT_PORT"

echo ""

# =============================================================================
# Docker Services
# =============================================================================
echo -e "${BLUE}[6] Docker Services${NC}"

if docker ps | grep -q clinical_vector; then
    echo -e "${GREEN}✓${NC} Qdrant container running"
elif docker ps -a | grep -q clinical_vector; then
    echo -e "${YELLOW}${NC} Qdrant container exists but stopped"
    echo "  Run: docker start clinical_vector"
    ((WARNINGS++))
else
    echo -e "${YELLOW}${NC} Qdrant container not found"
    echo "  Run: docker compose up -d qdrant"
    ((WARNINGS++))
fi

echo ""

# =============================================================================
# Port Availability
# =============================================================================
echo -e "${BLUE}[7] Port Availability${NC}"

check_port() {
    local port=$1
    local name=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${YELLOW}${NC} Port $port ($name) - IN USE"
        ((WARNINGS++))
    else
        echo -e "${GREEN}✓${NC} Port $port ($name) - Available"
    fi
}

check_port 6333 "Qdrant"
if [ "$LLM_BACKEND" != "lightning" ]; then
    check_port 8000 "LLM Server (llama.cpp)"
fi
check_port 8001 "Backend"
check_port 8002 "MCP Server"

echo ""

# =============================================================================
# Summary
# =============================================================================
echo "================================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN} Environment is ready!${NC}"
    echo ""
    echo "Run: ./launch.sh"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}️  $WARNINGS warning(s) - System may work with limitations${NC}"
    echo ""
    echo "You can try: ./launch.sh"
    exit 0
else
    echo -e "${RED} $ERRORS critical error(s) found${NC}"
    echo -e "${YELLOW}   $WARNINGS warning(s)${NC}"
    echo ""
    echo "Fix errors before launching the system."
    exit 1
fi
