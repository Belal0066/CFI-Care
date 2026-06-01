#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MERGED="$ROOT/allure-results/merged"
REPORT="$ROOT/allure-report"

rm -rf "$MERGED"
mkdir -p "$MERGED"

for d in "$ROOT"/allure-results/*/; do
  [ "$(basename "$d")" = "merged" ] && continue
  cp -r "$d"* "$MERGED"/ 2>/dev/null || true
done

rm -rf "$REPORT"
npx allure generate "$MERGED" -o "$REPORT"

echo "Report generated at $REPORT"
