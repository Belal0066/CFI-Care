#!/bin/bash
# Setup Tailscale Funnel for Streamlit MedGemma RAG
# Exposes the Streamlit UI at: https://bws.taild935b3.ts.net/chat

set -e

TAILSCALE_HOSTNAME="bws.taild935b3.ts.net"
BASE_PATH="/chat"
LOCAL_PORT=8511

echo " Configuring Tailscale Funnel for Streamlit"
echo "=============================================="
echo ""
echo "Target URL: https://${TAILSCALE_HOSTNAME}${BASE_PATH}"
echo "Local port: ${LOCAL_PORT}"
echo ""

# Check if Tailscale is installed and running
if ! command -v tailscale &> /dev/null; then
    echo " Tailscale is not installed"
    echo "Install: https://tailscale.com/download"
    exit 1
fi

if ! tailscale status &> /dev/null; then
    echo " Tailscale is not running"
    echo "Start: sudo tailscale up"
    exit 1
fi

echo " Tailscale is running"
echo ""

# Check if Streamlit is running
if ! curl -s http://localhost:${LOCAL_PORT} > /dev/null 2>&1; then
    echo "️  Streamlit is not running on port ${LOCAL_PORT}"
    echo "Start it with: ./scripts/launch_medgemma_rag.sh"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo " Setting up Tailscale Funnel..."
echo ""

# Check if we need sudo
if ! tailscale serve status &> /dev/null; then
    echo "️  Tailscale serve requires elevated permissions"
    echo ""
    echo "Option 1: Set yourself as operator (recommended, one-time):"
    echo "  sudo tailscale set --operator=$USER"
    echo ""
    echo "Option 2: Run this command with sudo:"
    echo "  sudo ./scripts/setup_tailscale_funnel.sh"
    echo ""
    echo "Attempting setup (you may need to enter password)..."
    echo ""
fi

# Create the serve config
echo "Creating Tailscale serve configuration..."
sudo tailscale serve --bg --https=443 --set-path=${BASE_PATH} http://localhost:${LOCAL_PORT}

echo ""
echo " Tailscale Funnel configured!"
echo ""
echo "================================================"
echo " Your Streamlit app is now available at:"
echo ""
echo "   https://${TAILSCALE_HOSTNAME}${BASE_PATH}"
echo ""
echo "================================================"
echo ""
echo " Notes:"
echo "  • Make sure Streamlit is running (port ${LOCAL_PORT})"
echo "  • Funnel runs in background"
echo "  • Access from anywhere on the internet"
echo ""
echo " Check status:"
echo "  tailscale serve status"
echo ""
echo " To stop funnel:"
echo "  tailscale serve --https=443 off"
echo ""
echo " Security:"
echo "  • Funnel uses HTTPS automatically"
echo "  • Consider adding authentication in Streamlit"
echo "  • Monitor access in Tailscale admin console"
echo ""
