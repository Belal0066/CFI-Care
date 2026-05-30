#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"

echo "🚀 Starting Gemma 4 Medical FHIR Streamlit Interface"
echo "📍 Web directory: $WEB_DIR"
echo ""
echo "⚠️  Make sure llama-server is running first:"
echo "   cd $ROOT_DIR && bash scripts/run_llama_server.sh"
echo ""

# Install requirements if needed
if ! python3 -c "import streamlit" 2>/dev/null; then
  echo "📦 Installing Streamlit dependencies..."
  pip install -q -r "$WEB_DIR/requirements.txt"
fi

echo "🌐 Opening Streamlit app at http://localhost:8501"
echo ""
cd "$WEB_DIR"
streamlit run app.py --logger.level=info
