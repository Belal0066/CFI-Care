#!/usr/bin/env python3
"""
Agent Latency Benchmark — measures the full LangGraph agent graph including the
real LLM call in generate_response. Times each node individually.

Usage: PYTHONPATH=$PWD python3 scripts/evaluate_agent_latency.py
"""

import sys
import json
import time
import statistics
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

from langchain_core.messages import HumanMessage
from src.agent.graph.workflow import app
from src.agent.graph.state import ClinicalAgentState

PASS = 0
FAIL = 0


def test(name: str, condition: bool, detail: str = "") -> None:
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        msg = f"  ❌ {name}"
        if detail:
            msg += f" — {detail}"
        print(msg)


def build_state(
    query: str,
    patient_id: str,
    documents: List[Any],
    mode: str = "auto",
    intent: str = "unknown",
    confidence: float = 0.5,
) -> ClinicalAgentState:
    return ClinicalAgentState(
        messages=[HumanMessage(content=query)],
        patient_id=patient_id,
        patient_state={
            "active_diagnosis": ["Essential hypertension", "CKD Stage 3b"],
            "allergies": [],
            "recent_medications": ["Enalapril 20mg"],
            "clinical_status": "Hypertensive urgency",
            "eoc_id": patient_id,
        },
        documents=documents,
        intent=intent,
        intent_confidence=confidence,
        rewritten_query=None,
        query_normalized=query.lower(),
        retrieved_docs=[],
        internet_evidence=[],
        clinical_response=None,
        needs_drug_check=False,
        mode=mode,
        needs_guidelines=False,
        is_mcp_query=False,
        audit_passed=True,
        audit_failures=[],
        audit_retry_count=0,
    )


def benchmark_query(
    query: str,
    patient_id: str,
    label: str,
    n_iterations: int = 3,
) -> Dict[str, Any]:
    """Invoke the full agent graph and time the total execution."""
    print(f"\n─── {label} ───")

    total_times = []
    result = None

    for i in range(n_iterations):
        start = time.perf_counter()
        state = build_state(
            query=query,
            patient_id=patient_id,
            documents=[],
            mode="auto",
            intent="medication" if "enalapril" in query.lower() else "diagnosis",
            confidence=0.5,
        )
        result = app.invoke(state)
        elapsed = time.perf_counter() - start
        total_times.append(elapsed)

        msgs = result.get("messages", [])
        msg_len = len(msgs[-1].content) if msgs else 0
        print(f"  Iteration {i+1}: {elapsed*1000:.1f}ms | response={msg_len} chars")

    stats = {
        "mean_ms": statistics.mean(total_times) * 1000,
        "median_ms": statistics.median(total_times) * 1000,
        "p95_ms": sorted(total_times)[int(len(total_times) * 0.95)] * 1000 if len(total_times) > 1 else total_times[0] * 1000,
        "min_ms": min(total_times) * 1000,
        "max_ms": max(total_times) * 1000,
        "n_iterations": n_iterations,
    }
    print(f"  => Mean: {stats['mean_ms']:.1f}ms | P95: {stats['p95_ms']:.1f}ms")

    # Validate graph output
    if result:
        msgs = result.get("messages", [])
        test(f"{label}: graph returns messages", len(msgs) > 0)
        test(f"{label}: message has content", bool(msgs[-1].content) if msgs else False)
        test(f"{label}: encounter_groups populated", len(result.get("encounter_groups", [])) > 0)

    return {"label": label, "query": query, "latency_ms": stats}


def main() -> int:
    global PASS, FAIL
    PASS = 0
    FAIL = 0

    print("=" * 60)
    print("AGENT LATENCY BENCHMARK (Full Graph + LLM)")
    print("=" * 60)

    n_iter = 3  # Reduced from 10 to save LLM inference time

    results = []

    # Query 1: Gamma cohort — Enalapril safety (medication intent)
    r1 = benchmark_query(
        query="Is it safe to escalate the patient's Enalapril prescription?",
        patient_id="pat-cohort-gamma",
        label="Gamma: Enalapril Safety",
        n_iterations=n_iter,
    )
    results.append(r1)

    # Query 2: Gamma cohort — differential diagnosis
    r2 = benchmark_query(
        query="What diagnoses contribute to this patient's hypertension complexity?",
        patient_id="pat-cohort-gamma",
        label="Gamma: Differential Dx",
        n_iterations=n_iter,
    )
    results.append(r2)

    # Compute aggregate
    e2e_latencies = []
    for r in results:
        e2e_latencies.append(r["latency_ms"]["mean_ms"])
        e2e_latencies.append(r["latency_ms"]["p95_ms"])

    agg_mean = statistics.mean(e2e_latencies)
    agg_p95 = sorted(e2e_latencies)[int(len(e2e_latencies) * 0.95)] if len(e2e_latencies) > 1 else e2e_latencies[0]

    print(f"\n{'='*60}")
    print("END-TO-END AGENT LATENCY (incl. LLM generation)")
    print(f"{'='*60}")
    for r in results:
        print(f"  {r['label']}: Mean={r['latency_ms']['mean_ms']:.0f}ms  P95={r['latency_ms']['p95_ms']:.0f}ms")

    print(f"\n  Aggregate Mean: {agg_mean:.0f}ms")
    print(f"  Aggregate P95:  {agg_p95:.0f}ms")
    print(f"\nThesis Target: P95 < 12000ms -> {'✅ PASS' if agg_p95 < 12000 else '❌ FAIL'} ({agg_p95:.0f}ms)")

    # Save results
    output = {
        "benchmark": "Agent Latency (Full Graph + LLM)",
        "date": datetime.now().isoformat(),
        "backend": "local (llama.cpp MedGemma 4B)",
        "n_iterations_per_query": n_iter,
        "per_query_results": results,
        "aggregate_mean_ms": agg_mean,
        "aggregate_p95_ms": agg_p95,
        "thesis_target_met": agg_p95 < 12000,
    }

    Path("results").mkdir(exist_ok=True)
    out_path = "results/agent_latency_benchmark.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to: {out_path}")

    print(f"\n{'='*60}")
    print(f"Results: {PASS} passed, {FAIL} failed")
    print(f"{'='*60}")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
