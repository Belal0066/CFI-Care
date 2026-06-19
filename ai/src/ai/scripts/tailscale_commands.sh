#!/bin/bash
# Quick reference for Tailscale Funnel commands

echo " Tailscale Funnel Quick Commands"
echo "===================================="
echo ""

echo " Setup (one-time):"
echo "  sudo tailscale set --operator=\$USER"
echo ""

echo " Start funnel:"
echo "  tailscale serve --bg --https=443 --set-path=/chat http://localhost:8511"
echo ""

echo " Check status:"
echo "  tailscale serve status"
echo ""

echo " Stop funnel:"
echo "  tailscale serve --https=443 off"
echo ""

echo " Restart funnel:"
echo "  tailscale serve --https=443 off && \\"
echo "  tailscale serve --bg --https=443 --set-path=/chat http://localhost:8511"
echo ""

echo " Access URL:"
echo "  https://bws.taild935b3.ts.net/chat"
echo ""

echo " Test locally:"
echo "  curl http://localhost:8511/chat"
echo ""
