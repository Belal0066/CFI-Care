#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/allure-report"

rm -rf "$REPORT"

# Copy any previous test-results as history (if available)
if [ -d "$ROOT/allure-results/history" ] && [ "$(ls -A "$ROOT/allure-results/history" 2>/dev/null)" ]; then
  echo "Including history: $(find "$ROOT/allure-results/history" -name '*.json' | wc -l) entries"
fi

npx allure generate \
  "$ROOT/allure-results/backend" \
  "$ROOT/allure-results/ai" \
  "$ROOT/allure-results/integration" \
  -o "$REPORT" \
  --history-limit 10

echo "Report generated at $REPORT/index.html"
