#!/bin/bash

# MedMCP Unified Launch Script

echo " Starting MedMCP Unified Stack..."

# Set path to venv
# Use relative path from the script execution, assuming running from mcps/ or root
if [ -d "medmcp" ]; then
    VENV_PATH="./medmcp/bin"
elif [ -d "mcps/medmcp" ]; then
    VENV_PATH="./mcps/medmcp/bin"
else
    # Fallback to absolute path in current workspace
    VENV_PATH="/home/belal/AI_System/mcps/medmcp/bin"
fi

# Kill anything on port 8002
echo " Cleaning up port 8002..."
fuser -k 8002/tcp 2>/dev/null
sleep 1
if [ -f .env ]; then
    echo " Loading environment variables from .env"
    export $(grep -v '^#' .env | xargs)
else
    echo "️ Warning: .env file not found. Ensure GROQ_API_KEY is set in your shell."
fi

# Function to clean up background processes on exit
cleanup() {
    echo " Shutting down MedMCP..."
    kill $BACKEND_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# 1. Start FastAPI Backend in background
echo " Starting Backend (FastAPI/MCP) on port 8002..."
$VENV_PATH/python3 -m uvicorn main:app --host 0.0.0.0 --port 8002 &
BACKEND_PID=$!

# Wait for backend to be ready
echo " Waiting for backend to initialize..."
sleep 3

# 2. Start Streamlit Frontend in foreground
echo " Starting Frontend (Streamlit) on port 8501..."
$VENV_PATH/python3 -m streamlit run app.py --server.port 8501 --server.address 0.0.0.0
