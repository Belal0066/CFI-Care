#!/bin/bash
# Launch the MedGemma Dashboard

# Ensure we are in the project root
cd "$(dirname "$0")"

# LLM Backend: read from flags, then .env, then default to local
LLM_BACKEND=""

for arg in "$@"; do
    case "$arg" in
        --local)     LLM_BACKEND="local" ;;
        --lightning) LLM_BACKEND="lightning" ;;
    esac
done

# If not set by flag, try reading from .env
if [ -z "$LLM_BACKEND" ] && [ -f ".env" ]; then
    LLM_BACKEND=$(grep -E '^LLM_BACKEND=' .env | tail -1 | cut -d= -f2-)
fi

# Final fallback
LLM_BACKEND="${LLM_BACKEND:-local}"
export LLM_BACKEND

echo " Starting MedGemma Dashboard..."
echo " App running at: http://localhost:8511"
echo " LLM Backend: ${LLM_BACKEND}"

if ! command -v streamlit &> /dev/null; then
    echo " Streamlit is not in PATH. Trying venv..."
    if [ -f ".venv/bin/streamlit" ]; then
        STREAMLIT_BIN=".venv/bin/streamlit"
    else
        echo " Streamlit is not installed. Installing..."
        pip install streamlit pandas requests
        STREAMLIT_BIN="streamlit"
    fi
else
    STREAMLIT_BIN="streamlit"
fi

$STREAMLIT_BIN run src/ui/dashboard.py --server.port 8511
