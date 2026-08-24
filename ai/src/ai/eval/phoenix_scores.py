#!/usr/bin/env python3
"""
Attaches the scores from eval/score.py to the Phoenix traces they came from,
so failures can be filtered and inspected next to their node-level trace.

Each run row stores the span id of the item's root span (eval/run.py); each
score becomes a Phoenix span annotation on that span:

  correct_bench / correct_strict   LLM judge (FHIR-AgentBench prompt), A and B
  recall@5                         code, A and B
  faithfulness                     LLM judge (Ragas), answered items
  must_have_coverage, contradicted LLM judge (K-QA method), C
  tool_correct                     code, C
  declined                         abstained flag or judge reading of the text

Uses Phoenix's REST API (POST /v1/span_annotations); run after score.py with
Phoenix up (PHOENIX_URL, default http://phoenix:6006).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import RESULTS_DIR, read_jsonl  # noqa: E402


def annotations_for(score: dict, span_id: str) -> list[dict]:
    def ann(name, kind, value, label=None, explanation=None):
        result = {"score": float(value)}
        if label is not None:
            result["label"] = label
        if explanation:
            result["explanation"] = explanation
        return {"span_id": span_id, "name": name, "annotator_kind": kind, "result": result,
                "metadata": {"config": score.get("config"), "experiment": score.get("experiment"),
                             "block": score.get("block"), "question_id": score.get("id")}}

    out = []
    for key in ("correct_bench", "correct_strict"):
        if score.get(key) is not None:
            out.append(ann(key, "LLM", score[key], "correct" if score[key] else "incorrect"))
    if score.get("recall@5") is not None:
        out.append(ann("recall@5", "CODE", score["recall@5"]))
    if score.get("faithfulness") is not None:
        out.append(ann("faithfulness", "LLM", score["faithfulness"]))
    if score.get("coverage") is not None:
        out.append(ann("must_have_coverage", "LLM", score["coverage"],
                       explanation=f"{score.get('must_have_entailed')}/{score.get('must_have_n')} must-have statements entailed"))
        out.append(ann("contradicted", "LLM", score.get("must_have_contradicted") or 0))
    if score.get("tool_correct") is not None:
        out.append(ann("tool_correct", "CODE", int(score["tool_correct"]), "correct" if score["tool_correct"] else "wrong"))
    if score.get("declined") is not None:
        out.append(ann("declined", "LLM" if not score.get("abstained_flag") else "CODE",
                       int(score["declined"]), "declined" if score["declined"] else "answered"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", type=Path, default=RESULTS_DIR / "runs")
    ap.add_argument("--scores-dir", type=Path, default=RESULTS_DIR / "scores")
    ap.add_argument("--phoenix-url", default=os.getenv("PHOENIX_URL", "http://phoenix:6006"))
    ap.add_argument("--batch", type=int, default=200)
    args = ap.parse_args()

    headers = {"Authorization": f"Bearer {os.environ['PHOENIX_API_KEY']}"} if os.getenv("PHOENIX_API_KEY") else {}
    total, missing = 0, 0
    with httpx.Client(base_url=args.phoenix_url.rstrip("/"), headers=headers, timeout=30) as client:
        for score_file in sorted(args.scores_dir.glob("*__*.jsonl")):
            spans = {r["id"]: r.get("span_id") for r in read_jsonl(args.runs_dir / score_file.name)}
            batch: list[dict] = []
            for score in read_jsonl(score_file):
                span_id = spans.get(score["id"])
                if not span_id:
                    missing += 1
                    continue
                batch.extend(annotations_for(score, span_id))
            for i in range(0, len(batch), args.batch):
                resp = client.post("/v1/span_annotations", params={"sync": "true"}, json={"data": batch[i:i + args.batch]})
                if resp.status_code >= 400:
                    print(f"{score_file.name}: Phoenix rejected annotations ({resp.status_code}): {resp.text[:300]}")
                    return 1
            total += len(batch)
            print(f"{score_file.name}: {len(batch)} annotations")
    print(f"Done: {total} annotations; {missing} scored items had no traced span (tracing off for that run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
