#!/usr/bin/env bash
# Integration Test Runner (Performance & Concurrency)
# Runs gateway_integration tests (GPU contention, dead letter, SQLite WAL)
# and saves structured results to a timestamped report.
#
# Usage:
#   ./tests/run_integration.sh              # run fast tests only (skip slow)
#   ./tests/run_integration.sh --slow       # include slow tests (WAL storm)
#   ./tests/run_integration.sh --view       # view latest report
#   ./tests/run_integration.sh --list       # list all reports
#   ./tests/run_integration.sh --help       # this message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="${PROJECT_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/integration_${TIMESTAMP}.json"
JUNIT_XML="${REPORT_DIR}/integration_${TIMESTAMP}_junit.xml"
SUMMARY_FILE="${REPORT_DIR}/integration_${TIMESTAMP}_summary.txt"
PYTHON="${PROJECT_DIR}/.venv/bin/python"
TEST_DIR="${SCRIPT_DIR}/gateway_integration"

mkdir -p "$REPORT_DIR"

# --- Handle flags ---
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    head -22 "$0" | grep "^#" | sed 's/^# //'
    exit 0
fi

if [ "${1:-}" = "--view" ]; then
    LATEST=$(ls -t "$REPORT_DIR"/integration_*.json 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
        echo "No integration reports found in $REPORT_DIR"
        exit 1
    fi
    echo "=== Latest integration report: $LATEST ==="
    cat "$LATEST"
    exit 0
fi

if [ "${1:-}" = "--list" ]; then
    echo "Integration reports in $REPORT_DIR:"
    ls -lh "$REPORT_DIR"/integration_*.json 2>/dev/null || echo "(none)"
    exit 0
fi

INCLUDE_SLOW=false
MARK_EXPR=""
if [ "${1:-}" = "--slow" ]; then
    INCLUDE_SLOW=true
    MARK_EXPR="performance_concurrency"
else
    MARK_EXPR="performance_concurrency and not slow"
fi

echo "========================================"
echo " DOC2FHIR Integration Test Runner"
echo "========================================"
if [ "$INCLUDE_SLOW" = false ]; then
    echo " Mode: fast (skip WAL storm — use --slow to include)"
else
    echo " Mode: full (including slow WAL integrity tests)"
fi
echo ""

# ---- Step 1: Run pytest ----
echo "[1/2] Running pytest integration tests..."

set +e
"$PYTHON" -m pytest "$TEST_DIR" \
    -v \
    --tb=short \
    -m "$MARK_EXPR" \
    --junitxml="$JUNIT_XML" \
    2>&1 | tee "${REPORT_DIR}/integration_${TIMESTAMP}_pytest.log"
PYTEST_EXIT=$?
set -e

PASSED=$(grep -cE "PASSED \[.*%\]" "${REPORT_DIR}/integration_${TIMESTAMP}_pytest.log" 2>/dev/null || true)
FAILED=$(grep -cE "FAILED \[.*%\]" "${REPORT_DIR}/integration_${TIMESTAMP}_pytest.log" 2>/dev/null || true)
SKIPPED=$(grep -cE "SKIPPED \[.*%\]" "${REPORT_DIR}/integration_${TIMESTAMP}_pytest.log" 2>/dev/null || true)

echo ""
echo "pytest: $PASSED passed, $FAILED failed, $SKIPPED skipped (exit=$PYTEST_EXIT)"
echo ""

# ---- Step 2: Generate summary report ----
echo "[2/2] Writing summary report..."

{
    echo "{"
    echo "  \"suite\": \"DOC2FHIR Integration Tests (Performance & Concurrency)\","
    echo "  \"mode\": \"$([ "$INCLUDE_SLOW" = true ] && echo 'full' || echo 'fast')\","
    echo "  \"generated_at\": \"$(date -Iseconds)\","
    echo "  \"pytest\": {"
    echo "    \"passed\": $PASSED,"
    echo "    \"failed\": $FAILED,"
    echo "    \"skipped\": $SKIPPED,"
    echo "    \"exit_code\": $PYTEST_EXIT"
    echo "  },"
    echo "  \"results\": {"
} > "$REPORT_FILE"

# Parse pytest log for individual test results
FIRST=true
while IFS= read -r line; do
    if [[ "$line" =~ \ [[:digit:]]+%\]$ ]]; then
        TEST_NAME=$(echo "$line" | sed 's/ .*//')
        STATUS=$(echo "$line" | grep -oE 'PASSED|FAILED|SKIPPED')
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo "," >> "$REPORT_FILE"
        fi
        echo "    \"$TEST_NAME\": \"$STATUS\"" >> "$REPORT_FILE"
    fi
done < "${REPORT_DIR}/integration_${TIMESTAMP}_pytest.log"

{
    echo "  },"
    echo "  \"summary\": {"
    echo "    \"total\": $((PASSED + FAILED + SKIPPED)),"
    echo "    \"passed\": $PASSED,"
    echo "    \"failed\": $FAILED,"
    echo "    \"skipped\": $SKIPPED,"
    echo "    \"status\": \"$([ $FAILED -eq 0 ] && echo 'PASS' || echo 'FAILURE')\""
    echo "  }"
    echo "}"
} >> "$REPORT_FILE"

# Write human-readable summary
{
    echo "========================================"
    echo " DOC2FHIR Integration Test Report"
    echo " Generated: $(date)"
    echo " Mode: $([ "$INCLUDE_SLOW" = true ] && echo 'full' || echo 'fast')"
    echo "========================================"
    echo ""
    echo "pytest results: $PASSED passed, $FAILED failed, $SKIPPED skipped"
    echo ""
    echo "--- individual results ---"
    while IFS= read -r line; do
        if [[ "$line" =~ ^tests/gateway_integration/.*\ \[.*%\]$ ]]; then
            echo "  $line"
        fi
    done < "${REPORT_DIR}/integration_${TIMESTAMP}_pytest.log"
    echo ""
    echo "--- summary ---"
    echo "  Total : $((PASSED + FAILED + SKIPPED))"
    echo "  Passed: $PASSED"
    echo "  Failed: $FAILED"
    echo "  Status: $([ $FAILED -eq 0 ] && echo 'PASS' || echo 'FAILURE')"
} > "$SUMMARY_FILE"

echo ""
echo "========================================"
echo " Reports saved:"
echo "  JSON summary : $REPORT_FILE"
echo "  JUnit XML    : $JUNIT_XML"
echo "  Summary text : $SUMMARY_FILE"
echo "========================================"
cat "$SUMMARY_FILE"

exit "$PYTEST_EXIT"
