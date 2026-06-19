#!/bin/bash
# Quick launcher for MedGemma RAG API

echo " Starting MedGemma RAG API..."
echo "================================"
echo ""
echo "Prerequisites:"
echo "  ✓ Qdrant running (docker-compose up -d qdrant)"
echo "  ✓ llama-server running on port 8000"
echo ""
echo "Starting API on http://localhost:8001"
echo "Docs available at http://localhost:8001/docs"
echo ""
echo "Press Ctrl+C to stop"
echo "================================"
echo ""

cd "$(dirname "$0")/.."
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
python3 -m src.api.medgemma_rag_api
