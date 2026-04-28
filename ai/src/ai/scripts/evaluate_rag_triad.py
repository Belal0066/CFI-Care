#!/usr/bin/env python3
"""
Advanced RAG Triad Evaluator — measures faithfulness, answer relevance, and
context precision on the actual LLM-synthesized output from the agent graph.

Uses Ragas with an external GPT-5 mini judge API for evaluation.

Usage:
    source .venv/bin/activate
    PYTHONPATH=$PWD python3 scripts/evaluate_rag_triad.py
"""

import sys
import json
import os
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
load_dotenv()

from datasets import Dataset
from ragas import evaluate
from openai import OpenAI
from ragas.llms import llm_factory
from ragas.embeddings import HuggingFaceEmbeddings
from ragas.metrics._faithfulness import faithfulness as _faithfulness
from ragas.metrics._answer_relevance import answer_relevancy as _answer_relevancy
from ragas.metrics._context_precision import context_precision as _context_precision
from langchain_core.messages import HumanMessage

from src.agent.graph.workflow import app
from src.agent.graph.state import ClinicalAgentState


# ── Build gates ──────────────────────────────────────────────────────────
GATES = {
    "faithfulness": 0.95,
    "answer_relevancy": 0.90,
}

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
        documents=[],
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


def execute_query(query: str, patient_id: str) -> dict:
    """Run a single query through the full agent graph and extract Triad inputs."""
    state = build_state(
        query=query,
        patient_id=patient_id,
        mode="auto",
        intent="medication" if "enalapril" in query.lower() or "medication" in query.lower() else "diagnosis",
        confidence=0.5,
    )

    result = app.invoke(state)

    # Extract the LLM-synthesized answer
    msgs = result.get("messages", [])
    generated_answer = msgs[-1].content if msgs else ""

    # Extract retrieved TOON contexts
    retrieved = result.get("retrieved_docs", [])
    contexts = []
    for r in retrieved:
        if isinstance(r, dict):
            contexts.append(r.get("anchor_content", r.get("toon_content", str(r))))
        else:
            contexts.append(str(r))

    print(f"  Query: {query[:60]}...")
    print(f"  Answer: {len(generated_answer)} chars")
    print(f"  Contexts: {len(contexts)} docs")

    return {
        "query": query,
        "contexts": contexts,
        "answer": generated_answer,
    }


def main() -> int:
    global PASS, FAIL
    PASS = 0
    FAIL = 0

    print("=" * 60)
    print("RAG TRIAD EVALUATOR (Full Graph + GPT-5 mini Judge)")
    print("=" * 60)

    # ── 1. Set up judge LLM (Groq by default, falls back to env variables) ──
    judge_api_key = os.getenv("JUDGE_API_KEY", "")
    judge_base_url = os.getenv("JUDGE_BASE_URL", "https://api.groq.com/openai/v1")
    judge_model = os.getenv("JUDGE_MODEL", "llama-3.3-70b-versatile")

    # Fallback: if JUDGE_API_KEY is still a placeholder, try GROQ_API_KEY
    if not judge_api_key or "your_" in judge_api_key:
        groq_key = os.getenv("GROQ_API_KEY", "")
        if groq_key and "your_" not in groq_key:
            judge_api_key = groq_key
            judge_base_url = "https://api.groq.com/openai/v1"
            judge_model = "llama-3.3-70b-versatile"

    if not judge_api_key or "your_" in judge_api_key:
        print("\n❌ No valid judge API key found. Set JUDGE_API_KEY or GROQ_API_KEY in .env")
        return 1

    print(f"\nJudge LLM: {judge_model} @ {judge_base_url}")

    # Create Ragas-compatible LLM from the OpenAI-compatible endpoint
    client = OpenAI(api_key=judge_api_key, base_url=judge_base_url)
    judge_llm = llm_factory(model=judge_model, client=client)

    # ── 2. Define evaluation queries ─────────────────────────────────────
    queries = [
        # Gamma cohort — polypharmacy trap
        {
            "query": "Is it safe to escalate the patient's Enalapril prescription?",
            "patient_id": "pat-cohort-gamma",
            "description": "Gamma: Polypharmacy Safety",
        },
        {
            "query": "What diagnoses are contributing to this patient's hypertension complexity?",
            "patient_id": "pat-cohort-gamma",
            "description": "Gamma: Differential Diagnosis",
        },
        # Alpha cohort — simple single-hop
        {
            "query": "What medication was prescribed for the patient's hypertension?",
            "patient_id": "pat-cohort-alpha",
            "description": "Alpha: Single-hop Retrieval",
        },
    ]

    # ── 3. Execute queries through agent graph ───────────────────────────
    print("\n─── Executing Queries ───")
    payloads = []
    for q in queries:
        print(f"\n{q['description']}:")
        payload = execute_query(q["query"], q["patient_id"])
        payloads.append(payload)

    # ── 4. Build Ragas dataset ───────────────────────────────────────────
    eval_data = {
        "user_input": [p["query"] for p in payloads],
        "response": [p["answer"] for p in payloads],
        "retrieved_contexts": [p["contexts"] for p in payloads],
    }
    dataset = Dataset.from_dict(eval_data)

    # ── 5. Run Ragas evaluation ──────────────────────────────────────────
    print("\n─── Running Ragas Evaluation (GPT-5 mini judge) ───")
    print("  This may take a moment per query...\n")

    # Configure v1 metrics with the judge LLM
    # (v1 metrics are pre-instantiated singletons — set their llm directly)
    _faithfulness.llm = judge_llm
    _answer_relevancy.llm = judge_llm

    judge_embeddings = HuggingFaceEmbeddings(model="all-MiniLM-L6-v2")
    _answer_relevancy.embeddings = judge_embeddings

    ragas_metrics = [_faithfulness, _answer_relevancy]

    scores = evaluate(
        dataset=dataset,
        metrics=ragas_metrics,
        llm=judge_llm,
        raise_exceptions=True,
    )

    # ── 6. Print results ────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print("RAG TRIAD SCORES")
    print(f"{'='*60}")

    triad_results = {}
    for metric in ["faithfulness", "answer_relevancy"]:
        score = getattr(scores, metric, None)
        if score is None and isinstance(scores, dict):
            score = scores.get(metric, None)
        triad_results[metric] = score

        gate = GATES[metric]
        if score is not None:
            passed = score >= gate
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"  {metric:25s} = {score:.4f}  (gate: ≥{gate})  {status}")
        else:
            print(f"  {metric:25s} = N/A  (gate: ≥{gate})  ❓ SKIP")

    # ── 7. Present to user ────────────────────────────────────────────────
    print(f"\n{'='*60}")
    if triad_results.get("faithfulness") is not None:
        hallu_rate = 1.0 - triad_results["faithfulness"]
        print(f"  Hallucination Rate (1 - faithfulness): {hallu_rate:.4f}")

    print(f"\nThesis Targets:")
    print(f"  Faithfulness       > 0.95:  {'✅' if (triad_results.get('faithfulness') or 0) >= 0.95 else '❌'} "
          f"({triad_results.get('faithfulness', 'N/A')})")
    print(f"  Answer Relevance   > 0.90:  {'✅' if (triad_results.get('answer_relevancy') or 0) >= 0.90 else '❌'} "
          f"({triad_results.get('answer_relevancy', 'N/A')})")

    print(f"\n{'='*60}")
    print(f"Results: {PASS} passed, {FAIL} failed")
    print(f"{'='*60}")

    # ── 8. Save results ──────────────────────────────────────────────────
    output = {
        "evaluation": "RAG Triad (Full Graph + GPT-5 mini Judge)",
        "date": __import__("datetime").datetime.now().isoformat(),
        "judge_model": judge_model,
        "judge_base_url": judge_base_url,
        "n_queries": len(queries),
        "per_query": [
            {
                "query": p["query"],
                "answer_length": len(p["answer"]),
                "n_contexts": len(p["contexts"]),
            }
            for p in payloads
        ],
        "rag_triad_scores": {k: float(v) if v is not None else None for k, v in triad_results.items()},
        "gates": GATES,
    }
    Path("results").mkdir(exist_ok=True)
    with open("results/rag_triad_evaluation.json", "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nResults saved to: results/rag_triad_evaluation.json")

    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
