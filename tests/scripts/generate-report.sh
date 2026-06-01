#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/allure-report"
SUITE="$1"

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

# Collect only non-empty result directories
RESULTS_DIRS=()
if [ -n "$SUITE" ]; then
  TARGET_DIR="$ROOT/allure-results/$SUITE"
  if [ -d "$TARGET_DIR" ] && [ -n "$(find "$TARGET_DIR" -maxdepth 1 -name '*.json' 2>/dev/null | head -1)" ]; then
    RESULTS_DIRS+=("$TARGET_DIR")
  fi
else
  for dir in "$ROOT/allure-results"/*/; do
    if [ -n "$(find "$dir" -maxdepth 1 -name '*.json' 2>/dev/null | head -1)" ]; then
      RESULTS_DIRS+=("$dir")
    fi
  done
fi

if [ ${#RESULTS_DIRS[@]} -eq 0 ]; then
  echo "ERROR: No result directories with JSON files found"
  exit 1
fi

npx allure generate \
  "${RESULTS_DIRS[@]}" \
  -o "$REPORT" \
  --history-limit 10

echo "Report generated at $REPORT/index.html"
