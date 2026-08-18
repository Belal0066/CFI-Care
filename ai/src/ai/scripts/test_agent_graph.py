#!/usr/bin/env python3
"""
Priority 1: LangGraph Agent Graph Test Suite.
Validates all 6 graph paths, routing rules, audit self-correction loop.

Six graph paths tested:
  1. Chat mode   ──► generate
  2. Local RAG   ──► rag_retrieve → reason → generate → audit_claims → END
  3. MCP mode    ──► mcp_search → generate → audit_claims → END
  4. Auto + low conf  ──► rag_retrieve
  5. Auto + MCP flag  ──► mcp_search
  6. Auto + no docs   ──► mcp_search
"""

import sys
import json
import logging
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).parent.parent))

from langchain_core.messages import HumanMessage, AIMessage

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

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


def build_state(**overrides: Any) -> Dict[str, Any]:
    """Minimal ClinicalAgentState with defaults."""
    state = {
        "messages": [HumanMessage(content="test query")],
        "patient_id": "eoc-test",
        "patient_state": {"active_diagnosis": ["Test"]},
        "documents": [],
        "intent": "unknown",
        "intent_confidence": 0.0,
        "rewritten_query": None,
        "retrieved_docs": [],
        "internet_evidence": [],
        "clinical_response": None,
        "audit_passed": True,
        "audit_failures": [],
        "audit_retry_count": 0,
        "needs_drug_check": False,
        "mode": "auto",
        "needs_guidelines": False,
        "is_mcp_query": False,
    }
    state.update(overrides)
    return state


# ─── Routing Tests (no graph invocation) ───────────────────────────────

def test_routing() -> None:
    print("\n─── Routing Tests ───")
    from src.agent.graph.workflow import route_intent

    t = lambda s, e: test(
        f"route_intent({s.get('mode','auto')}, intent={s.get('intent','?')})",
        route_intent(s) == e,
        f"expected {e}, got {route_intent(s)}",
    )

    t(build_state(mode="chat"), "generate")
    t(build_state(mode="local"), "rag_retrieve")
    t(build_state(mode="mcp"), "mcp_search")

    # Low confidence → rag_retrieve (patient data available)
    t(build_state(intent_confidence=0.05, documents=[{"node_id": "d"}]), "rag_retrieve")

    # MCP flag → mcp_search
    t(build_state(is_mcp_query=True), "mcp_search")

    # No documents and no patient_id → mcp_search (no source for Qdrant-first retrieval)
    t(build_state(documents=[], patient_id=None), "mcp_search")

    # RAG intents with documents → rag_retrieve
    for intent in [
        "summary", "diagnosis", "differential", "medication",
        "change_tracking", "trend_analysis", "timeline", "outcome",
        "rationale", "allergy",
    ]:
        t(build_state(intent=intent, documents=[{"node_id": "d"}]), "rag_retrieve")

    # Unknown intent + high confidence (>0.70 routing_fallback_threshold) + no patient_id → mcp_search (intent not in RAG set)
    t(build_state(intent="unknown", intent_confidence=0.75, documents=[{"node_id": "d"}], patient_id=None), "mcp_search")
    # Unknown intent + low confidence (<0.70) + patient data → rag_retrieve (Layer 1 fallback to broad retrieval)
    t(build_state(intent="unknown", intent_confidence=0.50, documents=[{"node_id": "d"}], patient_id="pat-1"), "rag_retrieve")


# ─── Audit Node Tests ─────────────────────────────────────────────────

def test_audit_node() -> None:
    print("\n─── Audit Node Tests ───")
    from src.agent.graph.nodes import audit_claims, inject_audit_feedback

    # Pass: all cited IDs exist
    r = audit_claims(build_state(
        clinical_response={"claims": [{"source_node_ids": ["d1", "d2"]}]},
        retrieved_docs=[{"node_id": "d1"}, {"node_id": "d2"}],
    ))
    test("audit passes for valid citations", r["audit_passed"] is True)
    test("no failures when valid", len(r["audit_failures"]) == 0)

    # Fail: hallucinated ID
    r = audit_claims(build_state(
        clinical_response={"claims": [{"source_node_ids": ["d999"]}]},
        retrieved_docs=[{"node_id": "d1"}],
    ))
    test("audit fails for hallucinated ID", r["audit_passed"] is False)
    test("one failure reported", len(r["audit_failures"]) == 1)
    test("failure cites correct ID", r["audit_failures"][0]["cited_id"] == "d999")

    # Empty clinical_response = skip
    r = audit_claims(build_state(clinical_response=None))
    test("audit skips when no clinical_response", r["audit_passed"] is True)

    # Empty retrieved_docs = skip
    r = audit_claims(build_state(
        clinical_response={"claims": [{"source_node_ids": ["d1"]}]},
        retrieved_docs=[],
    ))
    test("audit skips when no retrieved_docs", r["audit_passed"] is True)

    # Inject audit feedback text
    fb = inject_audit_feedback({"audit_failures": [{"message": "bad citation"}]})
    test("feedback contains correction header", "CORRECTION REQUIRED" in fb)
    test("feedback contains error detail", "bad citation" in fb)


# ─── Route-After-Audit Tests ──────────────────────────────────────────

def test_route_after_audit() -> None:
    print("\n─── Route-After-Audit Tests ───")
    from src.agent.graph.workflow import route_after_audit

    test("passed audit → compute_confidence",
         route_after_audit({"audit_passed": True}) == "compute_confidence")
    test("fail, retry 0 → retry_generate",
         route_after_audit({"audit_passed": False, "audit_retry_count": 0}) == "retry_generate")
    test("fail, retry 1 → retry_generate",
         route_after_audit({"audit_passed": False, "audit_retry_count": 1}) == "retry_generate")
    test("fail, retry 2 → compute_confidence",
         route_after_audit({"audit_passed": False, "audit_retry_count": 2}) == "compute_confidence")


# ─── Graph Invocation Tests (compile + invoke) ─────────────────────────

def test_graph_invoke() -> None:
    print("\n─── Graph Invocation Tests ───")
    from src.agent.graph.workflow import app

    # Test A: Mode = "chat" — simplest path, no retrieval needed
    state = build_state(mode="chat")
    result = app.invoke(state)
    msgs = result.get("messages", [])
    test("chat mode: graph returns messages", len(msgs) > 0)
    test("chat mode: message has content", bool(msgs[-1].content))
    test("chat mode: audit_passed defaults to True", result.get("audit_passed", True) is True)
    test("chat mode: audit_retry_count preserved",
         result.get("audit_retry_count", 0) >= 0)

    # Test B: Mode = "auto" + real documents + diagnostic intent → RAG path
    from src.retrieval.indexing import ClinicalDocument

    docs = [
        ClinicalDocument(
            doc_id="d1", node_id="d1", eoc_id="eoc-test",
            content="Diagnosis: Pneumonia", content_primary="Pneumonia",
            content_details="", date_issued="2026-01-01", date_unix=1767312000,
            category="Consultation", event_tag="Diagnosis",
            is_diagnosis=True, normality="Normal", priority="High",
        ),
        ClinicalDocument(
            doc_id="d2", node_id="d2", eoc_id="eoc-test",
            content="Medication: Azithromycin", content_primary="Azithromycin",
            content_details="", date_issued="2026-01-02", date_unix=1767398400,
            category="Prescription", event_tag="Medication",
            is_diagnosis=False, is_medication=True, normality="Normal", priority="High",
        ),
    ]

    state = build_state(
        mode="auto",
        intent="diagnosis",
        documents=docs,
        patient_state={
            "active_diagnosis": ["Pneumonia"],
            "allergies": [],
            "recent_medications": [],
            "clinical_status": "Improved",
            "eoc_id": "eoc-test",
        },
        messages=[HumanMessage(content="What diagnoses were considered?")],
    )
    result = app.invoke(state)
    msgs = result.get("messages", [])
    test("RAG path: graph returns messages", len(msgs) > 0)
    test("RAG path: message has content", bool(msgs[-1].content))
    test("RAG path: encounter_groups populated", len(result.get("encounter_groups", [])) > 0)
    test("RAG path: clinical_response generated",
         result.get("clinical_response") is not None)


# ─── Main Runner ──────────────────────────────────────────────────────

def main() -> int:
    global PASS, FAIL
    PASS = 0
    FAIL = 0

    print("=" * 60)
    print("TEST SUITE: LangGraph Agent Graph")
    print("=" * 60)

    test_routing()
    test_audit_node()
    test_route_after_audit()
    test_graph_invoke()

    print(f"\n{'=' * 60}")
    print(f"Results: {PASS} passed, {FAIL} failed")
    print(f"{'=' * 60}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
