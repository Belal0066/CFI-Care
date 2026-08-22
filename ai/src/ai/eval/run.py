#!/usr/bin/env python3
"""
Runs one configuration over the clinical-eval-v1 questions and writes one
JSONL row per question (resumable: finished ids are skipped on restart).

    python -m eval.run --config eval/configs/full.yaml --experiment E001
    python -m eval.run --config eval/configs/naive_rag.yaml --experiment E001
    python -m eval.run --config eval/configs/full.yaml --experiment repeat --tag r2

A config's `env` block is applied before any system module is imported
(RetrieverConfig and InfraConfig read the environment at import), so
configs change flags, never code.

Integrity checks, any of which stops the run:
  * the egress guard (EVAL_MODE=1) logged a request to a non-allowlisted host;
  * an LLM response reported a model other than the served one;
  * a question is still a Block C draft (unless --allow-draft, for dry runs);
  * LangSmith tracing is on without EVAL_DATASET_LICENSE=open.
"""
from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import (  # noqa: E402
    QUESTION_SET, RESULTS_DIR, append_jsonl, read_jsonl, resource_ids_from_groups, strip_confidence_block,
)

_local = threading.local()
_abort = threading.Event()
_abort_reason: list[str] = []


def _truthy(v: str | None) -> bool:
    return (v or "").strip().lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------- LLM accounting

def install_llm_accounting(served_model: str) -> None:
    """
    Wraps openai's chat.completions.create to record, per question, every
    LLM call's model, token usage and latency, and to stop the run if a
    response names a different model than the one being served.
    """
    from openai.resources.chat.completions import Completions

    original = Completions.create

    def create(self, *args, **kwargs):
        started = time.perf_counter()
        calls = getattr(_local, "calls", None)
        try:
            response = original(self, *args, **kwargs)
        except Exception as e:
            if calls is not None:
                calls.append({"model_requested": kwargs.get("model"), "error": f"{type(e).__name__}: {e}",
                              "latency_s": time.perf_counter() - started})
            raise
        usage = getattr(response, "usage", None)
        returned = getattr(response, "model", None)
        if calls is not None:
            calls.append({
                "model_requested": kwargs.get("model"),
                "model_returned": returned,
                "prompt_tokens": getattr(usage, "prompt_tokens", None),
                "completion_tokens": getattr(usage, "completion_tokens", None),
                "latency_s": time.perf_counter() - started,
            })
        if served_model and returned and returned != served_model:
            _abort_reason.append(f"LLM response came from model {returned!r}, expected {served_model!r}")
            _abort.set()
        return response

    Completions.create = create


# ---------------------------------------------------------------- tracing

def init_tracing(project: str):
    tracer = None
    if os.getenv("PHOENIX_COLLECTOR_ENDPOINT"):
        from openinference.instrumentation.langchain import LangChainInstrumentor
        from openinference.instrumentation.openai import OpenAIInstrumentor
        from opentelemetry import trace
        from phoenix.otel import register

        provider = register(project_name=project, set_global_tracer_provider=True, batch=True)
        LangChainInstrumentor().instrument(tracer_provider=provider)
        OpenAIInstrumentor().instrument(tracer_provider=provider)
        tracer = trace.get_tracer("clinical-eval")
    return tracer


# ---------------------------------------------------------------- pipelines

def initial_state(item: dict, mode: str) -> dict:
    from langchain_core.messages import HumanMessage
    from src.retrieval.config import retriever_config

    return {
        "messages": [HumanMessage(content=item["question"])],
        "query": item["question"],
        "retrieval_query": None,
        "retrieval_top_k": None,
        "retrieval_use_intent_filter": True,
        "patient_id": item["patient_id"],
        "patient_state": {},
        "documents": [],
        "intent": "",
        "intent_confidence": 0.0,
        "rewritten_query": None,
        "encounter_groups": [],
        "internet_evidence": [],
        "retrieval_confidence": 0.0,
        "retrieval_avg_top3": 0.0,
        "has_insufficient_data": False,
        "retrieval_iterations": 0,
        "retrieval_grade": None,
        "general_knowledge_fallback": False,
        "abstain_reason": None,
        "retrieval_threshold": retriever_config.retrieval_gatekeeper_threshold,
        "clinical_response": None,
        "audit_passed": False,
        "audit_failures": [],
        "audit_retry_count": 0,
        "abstained": False,
        "claim_verifications": [],
        "generation_confidence": 0.0,
        "validation_confidence": 0.0,
        "overall_confidence": 0.0,
        "needs_drug_check": False,
        "mode": mode,
        "needs_guidelines": False,
        "is_mcp_query": False,
        "viz_result": None,
        "mcp_react_steps": [],
    }


def run_graph(item: dict, mode: str) -> dict:
    from src.agent.graph.workflow import app

    state = initial_state(item, mode)
    path, node_latency = [], []
    last = time.perf_counter()
    for update in app.stream(state, stream_mode="updates"):
        now = time.perf_counter()
        for node, delta in update.items():
            path.append(node)
            node_latency.append({"node": node, "s": now - last})
            if isinstance(delta, dict):
                state.update(delta)
        last = now
    answer = ""
    for msg in reversed(state.get("messages") or []):
        if getattr(msg, "type", "") == "ai":
            answer = msg.content
            break
    evidence = state.get("internet_evidence") or []
    sources = sorted({d.get("source", "") for e in evidence if isinstance(e, dict)
                      for d in (e.get("raw_data") or []) if isinstance(d, dict)} - {""})
    return {
        "answer_raw": answer,
        "answer": strip_confidence_block(answer),
        "abstained": bool(state.get("abstained")),
        "abstain_reason": state.get("abstain_reason"),
        "context_resource_ids": resource_ids_from_groups(state.get("encounter_groups")),
        "context_texts": [c.anchor_content for eg in state.get("encounter_groups") or [] for c in eg.chunks],
        "evidence_sources": sources,
        "evidence_items": [
            {"source": d.get("source"), "pmid": d.get("pmid"), "content": (d.get("content") or "")[:4000]}
            for e in evidence if isinstance(e, dict) for d in (e.get("raw_data") or []) if isinstance(d, dict)
        ],
        "mcp_called": "mcp_search" in path,
        "path": path,
        "node_latency": node_latency,
        "intent": state.get("intent"),
        "retrieval_confidence": state.get("retrieval_confidence"),
        "retrieval_grade": state.get("retrieval_grade"),
        "audit_passed": state.get("audit_passed"),
        "audit_retry_count": state.get("audit_retry_count"),
        "overall_confidence": state.get("overall_confidence"),
    }


def run_pipeline(pipeline: str, item: dict, mode: str) -> dict:
    if pipeline == "graph":
        return run_graph(item, mode)
    if pipeline == "naive_rag":
        from eval.naive_rag import answer
        return answer(item)
    raise ValueError(f"unknown pipeline {pipeline!r}")


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--experiment", required=True, help="E001, E002, E003, repeat, dryrun, ...")
    ap.add_argument("--questions", type=Path, default=QUESTION_SET)
    ap.add_argument("--blocks", default="A,B,C,D")
    ap.add_argument("--ids", default=None, help="Comma-separated question ids (smoke tests)")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--concurrency", type=int, default=int(os.getenv("EVAL_CONCURRENCY", "4")))
    ap.add_argument("--tag", default="", help="Suffix for repeat runs of the same config")
    ap.add_argument("--out-dir", type=Path, default=RESULTS_DIR / "runs")
    ap.add_argument("--allow-draft", action="store_true")
    args = ap.parse_args()

    cfg = yaml.safe_load(open(args.config))
    for key, value in (cfg.get("env") or {}).items():
        os.environ[str(key)] = str(value)

    if _truthy(os.getenv("LANGSMITH_TRACING")) and os.getenv("EVAL_DATASET_LICENSE") != "open":
        print("Refusing to start: LangSmith is SaaS; enable it only for open data (EVAL_DATASET_LICENSE=open).")
        return 2
    if not _truthy(os.getenv("EVAL_MODE")):
        print("WARNING: EVAL_MODE is not set; the egress guard is off. Use only for local debugging.")

    from src.shared import egress_guard
    egress_guard.install()
    served_model = os.getenv("LLAMACPP_MODEL", "")
    install_llm_accounting(served_model)

    items = read_jsonl(args.questions)
    blocks = {b.strip().upper() for b in args.blocks.split(",")}
    items = [x for x in items if x["block"] in blocks]
    if args.ids:
        wanted = {i.strip() for i in args.ids.split(",")}
        items = [x for x in items if x["id"] in wanted]
    if args.limit:
        items = items[: args.limit]
    drafts = [x["id"] for x in items if x.get("status") == "draft"]
    if drafts and not args.allow_draft:
        print(f"Refusing to run draft Block C items {drafts}; review them or pass --allow-draft for dry runs.")
        return 2

    name = cfg["name"] + (f"__{args.tag}" if args.tag else "")
    out_path = args.out_dir / f"{args.experiment}__{name}.jsonl"
    done = {r["id"] for r in read_jsonl(out_path) if not r.get("error")}
    todo = [x for x in items if x["id"] not in done]
    egress_log = os.getenv("EVAL_EGRESS_LOG")
    tracer = init_tracing(f"{args.experiment}-{name}")
    print(f"{name}: {len(todo)} to run ({len(done)} already done) -> {out_path}")

    def work(item: dict) -> dict:
        _local.calls = []
        started = time.perf_counter()
        row = {"id": item["id"], "block": item["block"], "config": cfg["name"], "tag": args.tag,
               "experiment": args.experiment}
        trace_id = span_id = None
        try:
            if tracer is not None:
                with tracer.start_as_current_span(f"{item['id']}") as span:
                    span.set_attribute("eval.question_id", item["id"])
                    span.set_attribute("eval.config", cfg["name"])
                    result = run_pipeline(cfg["pipeline"], item, cfg.get("mode", "auto"))
                    ctx = span.get_span_context()
                    trace_id = format(ctx.trace_id, "032x")
                    span_id = format(ctx.span_id, "016x")
            else:
                result = run_pipeline(cfg["pipeline"], item, cfg.get("mode", "auto"))
            row.update(result)
        except Exception as e:
            row["error"] = f"{type(e).__name__}: {e}"
            row["traceback"] = traceback.format_exc(limit=5)
        row["latency_s"] = time.perf_counter() - started
        row["llm_calls"] = list(_local.calls)
        row["trace_id"] = trace_id
        row["span_id"] = span_id  # root span of this item; eval/phoenix_scores.py annotates it
        return row

    failures = 0
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futures = {pool.submit(work, it): it for it in todo}
        for fut in as_completed(futures):
            row = fut.result()
            append_jsonl(out_path, row)
            failures += bool(row.get("error"))
            status = "ERROR " + row["error"][:120] if row.get("error") else f"{row['latency_s']:.1f}s"
            print(f"  {row['id']}: {status}", flush=True)
            if egress_log and os.path.exists(egress_log) and os.path.getsize(egress_log) > 0:
                _abort_reason.append(f"egress guard blocked a request; see {egress_log}")
                _abort.set()
            if _abort.is_set():
                for f in futures:
                    f.cancel()
                break

    if _abort.is_set():
        print("RUN INVALID: " + "; ".join(dict.fromkeys(_abort_reason)))
        return 3
    print(f"Done: {len(todo)} items, {failures} errors")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
