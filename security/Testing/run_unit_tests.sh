#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# CURR_DIR="$(pwd)"
TEST_ROOT="$SCRIPT_DIR/unit-tests"
NODE_TEST_DIR="$TEST_ROOT/NodeJs"
KEYCLOAK_TEST_DIR="$TEST_ROOT/Keycloak"

NODE_PROJECT_DIR="$REPO_ROOT/backend/src/Nodejs"

LOG_DIR="$SCRIPT_DIR/logs"

mkdir -p "$LOG_DIR"

NODE_LOG="$LOG_DIR/nodejs-unit.log"
KEYCLOAK_LOG="$LOG_DIR/keycloak-unit.log"
NODE_JSON="$LOG_DIR/nodejs-jest.json"
SUMMARY_MD="$LOG_DIR/test-summary.md"
SUMMARY_JSON="$LOG_DIR/test-summary.json"

status=0

PREV_SUMMARY_JSON="$LOG_DIR/test-summary.prev.json"
if [ -f "$SUMMARY_JSON" ]; then
  cp "$SUMMARY_JSON" "$PREV_SUMMARY_JSON"
fi

NODE_COVERAGE_DIR="$LOG_DIR/node-coverage"
NODE_COVERAGE_JSON="$NODE_COVERAGE_DIR/coverage-summary.json"
KEYCLOAK_JACOCO_XML="$KEYCLOAK_TEST_DIR/target/site/jacoco/jacoco.xml"


echo "Running Node.js security unit tests..."
mapfile -d '' -t node_tests < <(find "$NODE_TEST_DIR" -maxdepth 1 -type f -name '*.test.js' -print0 | sort -z)

if [ "${#node_tests[@]}" -eq 0 ]; then
  echo "No Node.js tests found in $NODE_TEST_DIR"
  status=1
else
  (
    cd "$NODE_PROJECT_DIR"
    npx --prefix "$NODE_PROJECT_DIR" jest --runInBand --verbose \
      --config "{\"rootDir\":\"$REPO_ROOT\",\"testEnvironment\":\"node\",\"moduleDirectories\":[\"node_modules\",\"$NODE_PROJECT_DIR/node_modules\"]}" \
      --runTestsByPath "${node_tests[@]}" --json --outputFile "$NODE_JSON" \
      --coverage --coverageReporters=json-summary --coverageDirectory "$NODE_COVERAGE_DIR"
  ) 2>&1 | tee "$NODE_LOG" || status=1
fi

echo "Running Keycloak security unit tests..."
if [ ! -f "$KEYCLOAK_TEST_DIR/pom.xml" ]; then
  echo "Missing Keycloak POM at $KEYCLOAK_TEST_DIR/pom.xml"
  status=1
else
  (
    cd "$KEYCLOAK_TEST_DIR"
    mvn test jacoco:report
  ) 2>&1 | tee "$KEYCLOAK_LOG" || status=1
fi

export REPO_ROOT LOG_DIR NODE_JSON SUMMARY_MD SUMMARY_JSON PREV_SUMMARY_JSON
export KEYCLOAK_TEST_DIR NODE_COVERAGE_JSON KEYCLOAK_JACOCO_XML NODE_LOG KEYCLOAK_LOG


echo "Node log: $NODE_LOG"
echo "Keycloak log: $KEYCLOAK_LOG"

python3 summary-gen.py
echo "Summary: $SUMMARY_MD"

exit "$status"