#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UI_DIR="$ROOT_DIR/gateway/ui"

echo "🚀 Starting DOC2FHIR Full Pipeline Streamlit UI"

# Check if streamlit is installed in the gateway/mapper venv, but simple system level will do.
if ! python3 -c "import streamlit" 2>/dev/null; then
  echo "📦 Installing Streamlit..."
  pip install -q streamlit requests pandas
fi

echo "🌐 Opening Streamlit app..."
echo ""
cd "$UI_DIR"
streamlit run app.py --server.port=8502 --logger.level=info