#!/usr/bin/env bash
# Quality Evaluation Runner
# Runs reconciliation loop + LLM reasoning verification tests
# and saves structured results to a timestamped report.
#
# Usage:
#   ./tests/run_quality_eval.sh              # run and save report
#   ./tests/run_quality_eval.sh --view        # view latest report
#   ./tests/run_quality_eval.sh --list        # list all reports
#   ./tests/run_quality_eval.sh --help        # this message

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="${PROJECT_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/quality_eval_${TIMESTAMP}.json"
JUNIT_XML="${REPORT_DIR}/quality_eval_${TIMESTAMP}_junit.xml"
SUMMARY_FILE="${REPORT_DIR}/quality_eval_${TIMESTAMP}_summary.txt"
PYTHON="${PROJECT_DIR}/.venv/bin/python"

mkdir -p "$REPORT_DIR"

# --- Handle flags ---
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    head -20 "$0" | grep "^#" | sed 's/^#//'
    exit 0
fi

if [ "${1:-}" = "--view" ]; then
    LATEST=$(ls -t "$REPORT_DIR"/quality_eval_*.json 2>/dev/null | head -1)
    if [ -z "$LATEST" ]; then
        echo "No reports found in $REPORT_DIR"
        exit 1
    fi
    echo "=== Latest report: $LATEST ==="
    "$PYTHON" -c "import json; print(json.dumps(json.load(open('$LATEST')), indent=2))"
    exit 0
fi

if [ "${1:-}" = "--list" ]; then
    echo "Reports in $REPORT_DIR:"
    ls -lh "$REPORT_DIR"/quality_eval_*.json 2>/dev/null || echo "(none)"
    exit 0
fi

echo "========================================"
echo " DOC2FHIR Quality Evaluation Runner"
echo "========================================"
echo ""

# ---- Step 1: Run pytest ----
echo "[1/3] Running pytest quality_evaluation tests..."

set +e
"$PYTHON" -m pytest "${SCRIPT_DIR}/quality_evaluations/" \
    -v \
    --tb=short \
    --junitxml="$JUNIT_XML" \
    2>&1 | tee "${REPORT_DIR}/quality_eval_${TIMESTAMP}_pytest.log"
PYTEST_EXIT=$?
set -e

PASSED=$(grep -cE "PASSED \[.*%\]" "${REPORT_DIR}/quality_eval_${TIMESTAMP}_pytest.log" 2>/dev/null || true)
FAILED=$(grep -cE "FAILED \[.*%\]" "${REPORT_DIR}/quality_eval_${TIMESTAMP}_pytest.log" 2>/dev/null || true)

echo ""
echo "pytest: $PASSED passed, $FAILED failed (exit=$PYTEST_EXIT)"
echo ""

# ---- Step 2: Compute structured metrics ----
echo "[2/3] Computing structured quality metrics..."

cd "$PROJECT_DIR"
"$PYTHON" "${SCRIPT_DIR}/quality_evaluations/quality_report.py" 2>&1 | tee "$REPORT_FILE"
METRICS_EXIT=$?
echo ""

# ---- Step 3: Generate summary report ----
echo "[3/3] Writing summary report..."

{
    echo "========================================"
    echo " DOC2FHIR Quality Evaluation Report"
    echo " Generated: $(date)"
    echo "========================================"
    echo ""
    echo "pytest results: $PASSED passed, $FAILED failed"
    echo ""
    echo "--- structured metrics ---"
    "$PYTHON" -c "
import json
with open('$REPORT_FILE') as f:
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
print(f\"Overall: {data['summary']['overall_status']}\")
"
} > "$SUMMARY_FILE"

echo ""
echo "========================================"
echo " Reports saved:"
echo "  JSON metrics : $REPORT_FILE"
echo "  JUnit XML    : $JUNIT_XML"
echo "  Summary text : $SUMMARY_FILE"
echo "========================================"
cat "$SUMMARY_FILE"
