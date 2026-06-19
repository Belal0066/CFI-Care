#!/usr/bin/env bash
set -o pipefail
set +o posix

PROJECT_ROOT="/home/belal/AI_System"
RESULTS_DIR="$PROJECT_ROOT/results"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
RESULTS_FILE="$RESULTS_DIR/test_results_lightning_27B_$(date +%F).md"
LOG_DIR="$RESULTS_DIR/logs_$TIMESTAMP"
PYTHON="/home/belal/AI_System/.venv/bin/python3"
SUMMARY_FILE="$LOG_DIR/summary.txt"

mkdir -p "$LOG_DIR"
cd "$PROJECT_ROOT" || exit 1

# Write results header
cat > "$RESULTS_FILE" << 'HEADER'
# Clinical AI System — Test Results: MedGemma 27B (Lightning AI)

HEADER
echo "| Test | Status | Duration | Details" >> "$RESULTS_FILE"
echo "|------|--------|----------|--------" >> "$RESULTS_FILE"

run_test() {
    local test_script="$1"
    local test_name="$2"
    local log_file="$LOG_DIR/$(basename "$test_script" .py).log"
    
    printf "  %-50s" "[ RUN ] $test_name"
    
    local start_time=$(date +%s)
    
    PYTHONPATH="$PROJECT_ROOT" \
    timeout 300 "$PYTHON" "$test_script" > "$log_file" 2>&1
    local exit_code=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Determine status from exit code AND content
    local status="FAIL"
    if [ $exit_code -eq 0 ]; then
        status="PASS"
    elif [ $exit_code -eq 124 ]; then
        status="TIMEOUT"
    fi
    
    # Also check log content for explicit failure indicators
    if [ "$status" = "PASS" ]; then
        if grep -qi "Traceback\|FAILED\|FAILURE\|ERROR" "$log_file" 2>/dev/null; then
            # Check if these are just in error handlers or are real failures
            local fail_lines=$(grep -c "FAILED\|FAILURE\|^ERROR" "$log_file" 2>/dev/null)
            local trace_lines=$(grep -c "Traceback" "$log_file" 2>/dev/null)
            if [ "$fail_lines" -gt 0 ] || [ "$trace_lines" -gt 0 ]; then
                status="PARTIAL"
            fi
        fi
    fi
    
    # Get summary from last line or first error
    local detail=""
    if [ "$status" = "PASS" ]; then
        detail=$(tail -1 "$log_file" 2>/dev/null | tr -d '\n\r' | cut -c1-80)
    elif [ "$status" = "FAIL" ]; then
        detail=$(head -1 "$log_file" 2>/dev/null | tr -d '\n\r' | cut -c1-80)
        # Try to get the actual error
        local err_line=$(grep -m1 "Error:\|ModuleNotFoundError\|ImportError" "$log_file" 2>/dev/null)
        [ -n "$err_line" ] && detail="$err_line"
    fi
    
    printf "\r  [ %s ] %-45s (%ds) %s\n" "$status" "$test_name" "$duration" ""
    echo "| $test_name | $status | ${duration}s | ${detail:--} " >> "$RESULTS_FILE"
    
    # Return for summary
    echo "$test_name:$status:$exit_code:${duration}"
}

echo ""
echo "============================================"
echo "  GROUP A: Infrastructure"
echo "============================================"

run_test "scripts/verify_infra.py" "verify_infra"
run_test "scripts/check_medgemma_setup.py" "check_medgemma_setup"

echo ""
echo "============================================"
echo "  GROUP B: Data & Ingestion"
echo "============================================"

run_test "scripts/test_data_json_parsing.py" "test_data_json_parsing"
run_test "scripts/test_preprocessor.py" "test_preprocessor"
run_test "scripts/test_toon.py" "test_toon"
run_test "scripts/test_ingestion.py" "test_ingestion"

echo ""
echo "============================================"
echo "  GROUP C: Retrieval"
echo "============================================"

run_test "scripts/test_retrieval.py" "test_retrieval"

echo ""
echo "============================================"
echo "  GROUP D: Deterministic Pipeline"
echo "============================================"

run_test "scripts/validate_system.py" "validate_system"
run_test "scripts/test_integration_tickets_4_7.py" "integration_tickets_4_7"

echo ""
echo "============================================"
echo "  GROUP E: LLM-Dependent RAG"
echo "============================================"

run_test "scripts/test_medgemma_rag.py" "test_medgemma_rag"
run_test "scripts/test_integration_tickets_8_10.py" "integration_tickets_8_10"
run_test "scripts/test_ui_pipeline.py" "test_ui_pipeline"

echo ""
echo "============================================"
echo "  GROUP F: MCP Tests"
echo "============================================"

run_test "test_mcp_flow.py" "test_mcp_flow"
run_test "test_mcp_simple.py" "test_mcp_simple"
run_test "test_full_guideline_flow.py" "test_full_guideline_flow"
run_test "test_guideline_extraction.py" "test_guideline_extraction"

echo ""
echo "============================================"
echo "  GROUP G: Benchmarks"
echo "============================================"

run_test "scripts/evaluate_latency.py" "evaluate_latency"
run_test "scripts/evaluate_retrieval_recall.py" "evaluate_retrieval_recall"
run_test "scripts/evaluate_faithfulness.py" "evaluate_faithfulness"

echo ""
echo "============================================"
echo "  GROUP H: Supplementary"
echo "============================================"

run_test "scripts/test_ddx.py" "test_ddx"
run_test "scripts/test_vision.py" "test_vision"

echo ""
echo "============================================"
echo "  COMPILING RESULTS"
echo "============================================"

# Parse results from the markdown table
TOTAL=0
PASSED=0
FAILED=0
TIMEOUTS=0
PARTIAL=0
TOTAL_DUR=0

while IFS='|' read -r _ name status duration detail _; do
    name=$(echo "$name" | xargs)
    status=$(echo "$status" | xargs)
    duration=$(echo "$duration" | tr -d 's' | xargs)
    [ -z "$name" ] && continue
    [ "$name" = "Test" ] && continue
    TOTAL=$((TOTAL + 1))
    case "$status" in
        PASS) PASSED=$((PASSED + 1)) ;;
        FAIL) FAILED=$((FAILED + 1)) ;;
        TIMEOUT) TIMEOUTS=$((TIMEOUTS + 1)) ;;
        PARTIAL) PARTIAL=$((PARTIAL + 1)) ;;
    esac
    TOTAL_DUR=$((TOTAL_DUR + duration))
done < <(tail -n +4 "$RESULTS_FILE" | grep -v "^$" | grep -v "^---" | grep "|")

# Append summary to results file
cat >> "$RESULTS_FILE" << SUMMARY

---
## Summary

| Metric | Value |
|--------|-------|
| **Date** | $(date) |
| **Model** | google/medgemma-27b-it |
| **Backend** | Lightning AI (public port, no token) |
| **Endpoint** | https://8000-01ktvamffjtq277sra9kyqvsjg.cloudspaces.litng.ai |
| **Python** | $($PYTHON --version 2>&1) |
| **Host** | $(uname -a) |
| **CPU** | $(nproc) cores |
| **RAM** | $(free -h | awk '/^Mem:/{print $2}') |
| **Total Tests** | $TOTAL |
| **Passed** | $PASSED |
| **Failed** | $FAILED |
| **Partial** | $PARTIAL |
| **Timed Out** | $TIMEOUTS |
| **Total Duration** | ${TOTAL_DUR}s |

## Per-Group Results

### A: Infrastructure
- verify_infra: $(tail -5 "$LOG_DIR/verify_infra.log" 2>/dev/null | tr -d '\n')
- check_medgemma_setup: $(tail -5 "$LOG_DIR/check_medgemma_setup.log" 2>/dev/null | tr -d '\n')

### B: Data & Ingestion
$(for f in test_data_json_parsing test_preprocessor test_toon test_ingestion; do
    echo "- $f: $(tail -1 "$LOG_DIR/$f.log" 2>/dev/null | tr -d '\n')"
done)

### C: Retrieval
- test_retrieval: $(tail -5 "$LOG_DIR/test_retrieval.log" 2>/dev/null | tr -d '\n')

### D: Deterministic Pipeline
- validate_system: $(tail -5 "$LOG_DIR/validate_system.log" 2>/dev/null | tr -d '\n')
- integration_tickets_4_7: $(tail -5 "$LOG_DIR/integration_tickets_4_7.log" 2>/dev/null | tr -d '\n')

### E: LLM-Dependent RAG
$(for f in test_medgemma_rag integration_tickets_8_10 test_ui_pipeline; do
    echo "- $f: $(tail -5 "$LOG_DIR/$f.log" 2>/dev/null | tr -d '\n')"
done)

### F: MCP Tests
$(for f in test_mcp_flow test_mcp_simple test_full_guideline_flow test_guideline_extraction; do
    echo "- $f: $(tail -5 "$LOG_DIR/$f.log" 2>/dev/null | tr -d '\n')"
done)

### G: Benchmarks
$(for f in evaluate_latency evaluate_retrieval_recall evaluate_faithfulness; do
    echo "- $f: $(tail -5 "$LOG_DIR/$f.log" 2>/dev/null | tr -d '\n')"
done)

### H: Supplementary
$(for f in test_ddx test_vision; do
    echo "- $f: $(tail -5 "$LOG_DIR/$f.log" 2>/dev/null | tr -d '\n')"
done)

## Failed Tests Details

SUMMARY

# Append failure details
for log in "$LOG_DIR"/*.log; do
    name=$(basename "$log" .log)
    # Check if this test failed
    if grep -q "| $name | FAIL\|| $name | TIMEOUT\|| $name | PARTIAL" "$RESULTS_FILE" 2>/dev/null; then
        echo "### $name" >> "$RESULTS_FILE"
        echo '```' >> "$RESULTS_FILE"
        head -40 "$log" >> "$RESULTS_FILE"
        echo "..." >> "$RESULTS_FILE"
        echo '```' >> "$RESULTS_FILE"
        echo "" >> "$RESULTS_FILE"
    fi
done

# Copy benchmark output if generated
for f in latency_benchmark.json faithfulness_evaluation.json retrieval_recall_evaluation.json; do
    if [ -f "$PROJECT_ROOT/$f" ]; then
        cp "$PROJECT_ROOT/$f" "$RESULTS_DIR/${f%.json}_$TIMESTAMP.json" 2>/dev/null
        echo "  Saved: $f"
    fi
done

echo ""
echo "============================================"
echo "  DONE — Results: $RESULTS_FILE"
echo "============================================"
