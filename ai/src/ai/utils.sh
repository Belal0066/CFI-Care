#!/bin/bash
# Quick utility scripts for common operations

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_URL="http://localhost:8001"

# Try to load LLM_BACKEND from .env if not already set
if [ -z "$LLM_BACKEND" ] && [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -E '^LLM_BACKEND=' "$PROJECT_ROOT/.env" | xargs 2>/dev/null)
fi
export LLM_BACKEND="${LLM_BACKEND:-local}"

case "$1" in
    seed)
        echo " Seeding data from Redis into Qdrant..."
        curl -X POST "$BACKEND_URL/ingest"
        echo ""
        ;;
    
    test-rag)
        echo " Testing RAG mode..."
        curl -X POST "$BACKEND_URL/chat" \
            -H "Content-Type: application/json" \
            -d '{"query": "What is diabetes?", "mode": "rag"}'
        echo ""
        ;;
    
    test-mcp)
        echo " Testing MCP mode (internet)..."
        curl -X POST "$BACKEND_URL/chat" \
            -H "Content-Type: application/json" \
            -d '{"query": "aspirin drug interactions", "mode": "mcp"}'
        echo ""
        ;;
    
    status)
        echo " Checking service status..."
        echo ""
        
        echo "Qdrant (6333):"
        curl -s http://localhost:6333/collections | head -c 100
        echo ""
        echo ""
        
        if [ "$LLM_BACKEND" = "lightning" ]; then
            # Load .env to get LIGHTNING_BASE_URL
            if [ -f "$PROJECT_ROOT/.env" ]; then
                export $(grep -E '^LIGHTNING_BASE_URL=' "$PROJECT_ROOT/.env" | xargs 2>/dev/null)
            fi
            HEALTH_URL="${LIGHTNING_BASE_URL%/v1}/health"
            echo "LLM Server (Lightning 27B):"
            curl -s "$HEALTH_URL" || echo "Not reachable"
        else
            echo "LLM Server (llama.cpp 4B on 8000):"
            curl -s http://localhost:8000/health
        fi
        echo ""
        echo ""
        
        echo "Backend (8001):"
        curl -s http://localhost:8001/health
        echo ""
        echo ""
        
        echo "MCP Server (8002):"
        curl -s http://localhost:8002/health || echo "Not responding"
        echo ""
        ;;
    
    logs)
        tail -f logs/*.log
        ;;
    
    stop)
        echo " Stopping all services..."
        pkill -f "llama-server"
        pkill -f "uvicorn"
        docker stop clinical_vector 2>/dev/null
        echo " All services stopped"
        ;;
    
    *)
        echo "Clinical AI System - Utilities"
        echo ""
        echo "Usage: ./utils.sh <command>"
        echo ""
        echo "Commands:"
        echo "  seed        - Ingest data from Redis to Qdrant"
        echo "  test-rag    - Test local RAG mode"
        echo "  test-mcp    - Test internet MCP mode"
        echo "  status      - Check all service health"
        echo "  logs        - Tail all log files"
        echo "  stop        - Stop all services"
        echo ""
        exit 1
        ;;
esac
