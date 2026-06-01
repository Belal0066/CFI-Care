#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/allure-report"

rm -rf "$REPORT"

# Copy any previous test-results as history (if available)
if [ -d "$ROOT/allure-results/history" ] && [ "$(ls -A "$ROOT/allure-results/history" 2>/dev/null)" ]; then
  echo "Including history: $(find "$ROOT/allure-results/history" -name '*.json' | wc -l) entries"
fi

# Copy static config files for Allure to consume
if [ -f "$ROOT/categories.json" ]; then
  cp "$ROOT/categories.json" "$ROOT/allure-results/categories.json"
  echo "Copied categories.json to allure-results/"
fi
if [ -f "$ROOT/known-issues.json" ]; then
  cp "$ROOT/known-issues.json" "$ROOT/allure-results/known-issues.json"
  echo "Copied known-issues.json to allure-results/"
fi

npx allure generate \
  "$ROOT/allure-results/backend" \
  "$ROOT/allure-results/ai" \
  "$ROOT/allure-results/integration" \
  -o "$REPORT" \
  --history-limit 10

echo "Report generated at $REPORT/index.html"
