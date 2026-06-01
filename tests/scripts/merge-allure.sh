#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FLAT_DIR="$ROOT_DIR/allure-results"

mkdir -p "$FLAT_DIR"

for suite_dir in "$ROOT_DIR"/allure-results/*/; do
  suite_name="$(basename "$suite_dir")"
  [ "$suite_name" = ".*" ] && continue
  echo "[merge] $suite_name"
  cp -r "$suite_dir"/*.json "$FLAT_DIR"/ 2>/dev/null || true
  cp -r "$suite_dir"/*.properties "$FLAT_DIR"/ 2>/dev/null || true
  cp -r "$suite_dir"/*.txt "$FLAT_DIR"/ 2>/dev/null || true
  cp -r "$suite_dir"/*.xml "$FLAT_DIR"/ 2>/dev/null || true
  cp -r "$suite_dir"/*.attachment "$FLAT_DIR"/ 2>/dev/null || true
done

echo "[merge] done — flattened $(ls -1 "$FLAT_DIR"/*.json 2>/dev/null | wc -l) result files"
