#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/allure-report"

rm -rf "$REPORT"

npx allure generate \
  "$ROOT/allure-results/backend" \
  "$ROOT/allure-results/ai" \
  "$ROOT/allure-results/integration" \
  -o "$REPORT"

echo "Report generated at $REPORT/index.html"
