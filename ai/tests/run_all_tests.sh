#!/usr/bin/env bash
# Master Test Runner — all DOC2FHIR test suites
# Runs quality evaluation, integration (fast), and gateway acceptance tests,
# then saves combined results to a timestamped report.
#
# Usage:
#   ./tests/run_all_tests.sh                        # run all fast tests
#   ./tests/run_all_tests.sh --slow                 # include slow integration tests
#   ./tests/run_all_tests.sh --view                 # view latest report
#   ./tests/run_all_tests.sh --list                 # list all reports
#   ./tests/run_all_tests.sh --help                 # this message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="${PROJECT_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/all_tests_${TIMESTAMP}.json"
JUNIT_XML="${REPORT_DIR}/all_tests_${TIMESTAMP}_junit.xml"
SUMMARY_FILE="${REPORT_DIR}/all_tests_${TIMESTAMP}_summary.txt"
PYTHON="${PROJECT_DIR}/.venv/bin/python"

mkdir -p "$REPORT_DIR"

# --- Handle flags ---
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    head -14 "$0" | grep "^#" | sed 's/^# //'
    exit 0
fi

if [ "${1:-}" = "--view" ]; then
    LATEST=$(ls -t "$REPORT_DIR"/all_tests_*.json 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
        echo "No all-tests reports found in $REPORT_DIR"
        exit 1
    fi
    echo "=== Latest report: $LATEST ==="
    cat "$LATEST"
    exit 0
fi

if [ "${1:-}" = "--list" ]; then
    echo "All-tests reports in $REPORT_DIR:"
    ls -lh "$REPORT_DIR"/all_tests_*.json 2>/dev/null || echo "(none)"
    exit 0
fi

SLOW_FLAG=""
MARK_EXPR="not slow"
if [ "${1:-}" = "--slow" ]; then
    SLOW_FLAG="--slow"
    MARK_EXPR=""
fi

echo "========================================"
echo " DOC2FHIR Master Test Runner"
echo "========================================"
echo " Suites: quality_evaluations + gateway_integration + gateway_acceptance"
echo " Slow:   $([ -n "$SLOW_FLAG" ] && echo 'included' || echo 'excluded (use --slow)')"
echo ""

# ---- Step 1: Run all pytest suites ----
echo "[1/2] Running all tests..."

MARK_ARGS=()
if [ -n "$MARK_EXPR" ]; then
    MARK_ARGS=(-m "$MARK_EXPR")
fi

set +e
"$PYTHON" -m pytest \
    "${SCRIPT_DIR}/quality_evaluations/" \
    "${SCRIPT_DIR}/gateway_integration/" \
    "${SCRIPT_DIR}/gateway_acceptance/" \
    -v \
    --tb=short \
    "${MARK_ARGS[@]}" \
    --junitxml="$JUNIT_XML" \
    2>&1 | tee "${REPORT_DIR}/all_tests_${TIMESTAMP}_pytest.log"
PYTEST_EXIT=$?
set -e

PASSED=$(grep -cE "PASSED \[.*%\]" "${REPORT_DIR}/all_tests_${TIMESTAMP}_pytest.log" 2>/dev/null || true)
FAILED=$(grep -cE "FAILED \[.*%\]" "${REPORT_DIR}/all_tests_${TIMESTAMP}_pytest.log" 2>/dev/null || true)
SKIPPED=$(grep -cE "SKIPPED \[.*%\]" "${REPORT_DIR}/all_tests_${TIMESTAMP}_pytest.log" 2>/dev/null || true)

echo ""
echo "pytest: $PASSED passed, $FAILED failed, $SKIPPED skipped (exit=$PYTEST_EXIT)"
echo ""

# ---- Step 2: Compute quality metrics ----
echo "[2/2] Computing quality evaluation metrics..."

QUALITY_REPORT="${REPORT_DIR}/all_tests_${TIMESTAMP}_quality.json"
cd "$PROJECT_DIR"
"$PYTHON" "${SCRIPT_DIR}/quality_evaluations/quality_report.py" 2>&1 | tee "$QUALITY_REPORT" || true

# ---- Build combined JSON report ----
{
    echo "{"
    echo "  \"suite\": \"DOC2FHIR Master Test Suite\","
    echo "  \"generated_at\": \"$(date -Iseconds)\","
    echo "  \"slow_included\": $([ -n "$SLOW_FLAG" ] && echo 'true' || echo 'false'),"
    echo "  \"pytest\": {"
    echo "    \"passed\": $PASSED,"
    echo "    \"failed\": $FAILED,"
    echo "    \"skipped\": $SKIPPED,"
    echo "    \"exit_code\": $PYTEST_EXIT"
    echo "  },"
    echo "  \"results\": {"
} > "$REPORT_FILE"

set +e
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
done < "${REPORT_DIR}/all_tests_${TIMESTAMP}_pytest.log"
set -e

# Incorporate quality metrics if available
QUALITY_METRICS=""
if [ -f "$QUALITY_REPORT" ]; then
    QUALITY_METRICS=$(tr -d '\n' < "$QUALITY_REPORT" 2>/dev/null || echo "")
fi

{
    echo "  },"
    if [ -n "$QUALITY_METRICS" ]; then
        echo "  \"quality_evaluation\": $QUALITY_METRICS,"
    fi
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
    echo " DOC2FHIR Master Test Report"
    echo " Generated: $(date)"
    echo "========================================"
    echo ""
    echo "Suites: quality_evaluations + gateway_integration + gateway_acceptance"
    echo ""
    echo "pytest results: $PASSED passed, $FAILED failed, $SKIPPED skipped"
    echo ""
    echo "--- quality evaluation ---"
    if [ -f "$QUALITY_REPORT" ]; then
        "$PYTHON" -c "
import json
with open('$QUALITY_REPORT') as f:
    data = json.load(f)
for s in data['scenarios']:
    m = s.get('metrics', {})
    if m:
        print(f\"[{s['status']}] {s['name']}\")
        print(f\"  Precision: {m['precision']:.2%}   Recall: {m['recall']:.2%}   F1: {m['f1']:.2%}\")
        print(f\"  TP={m['true_positives']}  FP={m['false_positives']}  FN={m['false_negatives']}\")
    else:
        print(f\"[{s['status']}] {s['name']} -- {s.get('error', 'no metrics')}\")
    print()
print(f\"Summary: {data['summary']['passed']}/{data['summary']['total_scenarios']} scenarios passed, avg F1={data['summary']['average_f1']:.2%}\")
" 2>/dev/null || echo "(quality report unavailable)"
    else
        echo "(quality report unavailable)"
    fi
    echo ""
    echo "--- integration results ---"
    while IFS= read -r line; do
        if [[ "$line" =~ ^tests/gateway_integration/.*(PASSED|FAILED|SKIPPED) ]]; then
            echo "  $line"
        fi
    done < "${REPORT_DIR}/all_tests_${TIMESTAMP}_pytest.log" 2>/dev/null || true
    echo ""
    echo "--- overall ---"
    echo "  Total : $((PASSED + FAILED + SKIPPED))"
    echo "  Passed: $PASSED"
    echo "  Failed: $FAILED"
    echo "  Status: $([ $FAILED -eq 0 ] && echo 'PASS' || echo 'FAILURE')"
} > "$SUMMARY_FILE"

echo ""
echo "========================================"
echo " Reports saved:"
echo "  JSON summary  : $REPORT_FILE"
echo "  JUnit XML     : $JUNIT_XML"
echo "  Quality JSON  : $QUALITY_REPORT"
echo "  Summary text  : $SUMMARY_FILE"
echo "========================================"
cat "$SUMMARY_FILE"

exit "$PYTEST_EXIT"
