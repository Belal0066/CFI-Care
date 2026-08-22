#!/usr/bin/env python3
"""
Scores run files after the GPU session. Needs only the judge API, no GPU.

Per item, by block:
  A, B  answer correctness with FHIR-AgentBench's own judge prompt
        (eval/judge_prompts.py), two ways:
          bench  - FHIR-AgentBench rules: on empty-gold items, a response
                   that declines/answers "none" counts as correct;
          strict - an abstention (the graph's abstained flag) is always wrong;
        Recall@5 of gold resource ids in the generator context.
  C     K-QA style: each must-have statement judged entailed / contradicted /
        neither by the answer; tool-call correctness (expected source present
        in the MCP evidence).
  D     abstention: the graph's abstained flag, and the judge's reading of the
        text ("no answer" vs "question answered") for every config.
  all   Ragas faithfulness of the answer against the context it was given
        (patient records + MCP evidence), for answered items.

Judge calls are cached (judge_cache.jsonl), so rescoring is free. The judge
receives MIMIC-IV demo data; that is permitted only because the demo is ODbL
open data (see ai/docs/EVAL.md).

Env: JUDGE_API_KEY (or GROQ_API_KEY), JUDGE_BASE_URL (default Groq),
JUDGE_MODEL (default openai/gpt-oss-120b), JUDGE_REASONING_EFFORT.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import QUESTION_SET, RESULTS_DIR, append_jsonl, read_jsonl, write_jsonl  # noqa: E402
from eval.judge_prompts import FHIR_AGENTBENCH_CORRECTNESS, FHIR_AGENTBENCH_NULL_NORMALIZER  # noqa: E402

JUDGE_BASE_URL = os.getenv("JUDGE_BASE_URL", "https://api.groq.com/openai/v1")
JUDGE_MODEL = os.getenv("JUDGE_MODEL", "openai/gpt-oss-120b")
EMPTY_ANSWERS = {"[]", "[[None]]", "null", "no answer"}

MUST_HAVE_PROMPT = """You are grading a clinical assistant's answer against one reference statement taken from a published source.

Reference statement:
{statement}

Answer:
{answer}

Decide the relation of the answer to the reference statement:
- ENTAILED: the answer states or clearly implies the information in the statement.
- CONTRADICTED: the answer states something that conflicts with the statement.
- NEITHER: the answer does not address the statement, or only partly.

Return exactly one word: ENTAILED, CONTRADICTED or NEITHER."""


def parse_label(text: str, valid: set[str]) -> str:
    """
    Maps a judge reply to one of `valid` (case-insensitive): the whole reply,
    else its last line, else the single valid label found as a whole phrase.
    Returns "" when the reply is ambiguous or has no label.
    """
    by_lower = {v.lower(): v for v in valid}
    clean = lambda s: re.sub(r"[^\w\s]", "", s).strip().lower()  # noqa: E731
    whole = clean(text)
    if whole in by_lower:
        return by_lower[whole]
    lines = [clean(l) for l in text.strip().splitlines() if l.strip()]
    if lines and lines[-1] in by_lower:
        return by_lower[lines[-1]]
    found = {v for low, v in by_lower.items() if re.search(rf"\b{re.escape(low)}\b", whole)}
    return found.pop() if len(found) == 1 else ""


class Judge:
    def __init__(self, cache_path: Path):
        from openai import OpenAI

        key = os.getenv("JUDGE_API_KEY") or os.getenv("GROQ_API_KEY")
        if not key:
            raise SystemExit("Set JUDGE_API_KEY (or GROQ_API_KEY) for the judge.")
        self.client = OpenAI(base_url=JUDGE_BASE_URL, api_key=key)
        self.cache_path = cache_path
        self.cache = {r["key"]: r["output"] for r in read_jsonl(cache_path)}
        self.lock = threading.Lock()

    def ask(self, prompt: str, valid: set[str], attempts: int = 4) -> str:
        key = hashlib.sha256(f"{JUDGE_MODEL}\n{prompt}".encode()).hexdigest()
        if key in self.cache:
            return self.cache[key]
        kwargs = {}
        if os.getenv("JUDGE_REASONING_EFFORT"):
            kwargs["reasoning_effort"] = os.getenv("JUDGE_REASONING_EFFORT")
        out = ""
        for _ in range(attempts):
            resp = self.client.chat.completions.create(
                model=JUDGE_MODEL, temperature=0, messages=[{"role": "user", "content": prompt}], **kwargs,
            )
            out = parse_label(resp.choices[0].message.content or "", valid)
            if out:
                break
        with self.lock:
            self.cache[key] = out
            append_jsonl(self.cache_path, {"key": key, "output": out})
        return out

    def correct(self, question: str, gold: str, answer: str) -> int | None:
        out = self.ask(FHIR_AGENTBENCH_CORRECTNESS.format(question=question, ref_answer=gold, answer=answer), {"0", "1"})
        return int(out) if out else None

    def null_norm(self, question: str, answer: str) -> str:
        out = self.ask(FHIR_AGENTBENCH_NULL_NORMALIZER.format(question=question, answer=answer),
                       {"no answer", "question answered"})
        return out or "question answered"

    def must_have(self, statement: str, answer: str) -> str:
        return self.ask(MUST_HAVE_PROMPT.format(statement=statement, answer=answer),
                        {"ENTAILED", "CONTRADICTED", "NEITHER"}) or "NEITHER"


def ragas_faithfulness(rows_items: list[tuple[dict, dict]]) -> dict[str, float | None]:
    """Ragas faithfulness per answered item, keyed by run-row id."""
    from openai import AsyncOpenAI
    from ragas.llms import llm_factory
    from ragas.metrics.collections import Faithfulness

    key = os.getenv("JUDGE_API_KEY") or os.getenv("GROQ_API_KEY")
    llm = llm_factory(JUDGE_MODEL, provider="openai", client=AsyncOpenAI(base_url=JUDGE_BASE_URL, api_key=key))
    metric = Faithfulness(llm=llm)
    sem = asyncio.Semaphore(int(os.getenv("JUDGE_CONCURRENCY", "4")))

    async def one(row, item):
        contexts = list(row.get("context_texts") or []) + [
            e["content"] for e in row.get("evidence_items") or [] if e.get("content")
        ]
        if not contexts or not row.get("answer"):
            return row["id"], None
        async with sem:
            try:
                res = await metric.ascore(user_input=item["question"], response=row["answer"], retrieved_contexts=contexts)
                return row["id"], float(res.value) if res.value is not None else None
            except Exception as e:
                print(f"  faithfulness failed for {row['id']}: {e}")
                return row["id"], None

    async def all_():
        return dict(await asyncio.gather(*(one(r, i) for r, i in rows_items)))

    return asyncio.run(all_())


def recall(gold: list[str], context_ids: list[str], k: int = 5) -> tuple[float | None, bool | None]:
    raw = {g.split("/", 1)[-1] for g in gold}
    if not raw:
        return None, None
    ctx = set(context_ids[:k])
    return len(raw & ctx) / len(raw), raw <= ctx


def tool_match(expected: list[str], sources: list[str]) -> bool | None:
    if not expected:
        return None
    have = " ".join(sources).lower()
    return all(t.lower() in have for t in expected)


def score_row(judge: Judge, row: dict, item: dict) -> dict:
    s = {"id": row["id"], "block": row["block"], "config": row["config"], "tag": row.get("tag", ""),
         "experiment": row["experiment"], "category": item.get("category"), "error": row.get("error")}
    if row.get("error"):
        return s
    answer = row.get("answer") or ""
    declined_text = judge.null_norm(item["question"], answer) == "no answer"
    s["declined_text"] = declined_text
    s["abstained_flag"] = bool(row.get("abstained"))
    s["declined"] = s["abstained_flag"] or declined_text
    block = item["block"]
    if block in ("A", "B"):
        gold = item["expected_answer"]
        empty_gold = str(gold).strip() in EMPTY_ANSWERS
        judged = judge.correct(item["question"], gold, answer)
        s["correct_bench"] = 1 if (empty_gold and declined_text) else judged
        s["correct_strict"] = 0 if s["abstained_flag"] else judged
        s["recall@5"], s["full_recall@5"] = recall(item.get("gold_resource_ids") or [], row.get("context_resource_ids") or [])
    elif block == "C":
        verdicts = [judge.must_have(m["statement"], answer) for m in item.get("must_have") or []]
        s["must_have_n"] = len(verdicts)
        s["must_have_entailed"] = verdicts.count("ENTAILED")
        s["must_have_contradicted"] = verdicts.count("CONTRADICTED")
        s["coverage"] = (verdicts.count("ENTAILED") / len(verdicts)) if verdicts else None
        s["tool_correct"] = tool_match(item.get("expected_tools") or [], row.get("evidence_sources") or [])
        s["mcp_called"] = row.get("mcp_called")
    elif block == "D":
        s["abstain_correct_flag"] = s["abstained_flag"]
        s["abstain_correct_text"] = s["declined"]
    s["latency_s"] = row.get("latency_s")
    s["llm_calls"] = len(row.get("llm_calls") or [])
    s["prompt_tokens"] = sum(c.get("prompt_tokens") or 0 for c in row.get("llm_calls") or [])
    s["completion_tokens"] = sum(c.get("completion_tokens") or 0 for c in row.get("llm_calls") or [])
    s["answer"] = answer
    return s


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--runs-dir", type=Path, default=RESULTS_DIR / "runs")
    ap.add_argument("--out-dir", type=Path, default=RESULTS_DIR / "scores")
    ap.add_argument("--questions", type=Path, default=QUESTION_SET)
    ap.add_argument("--no-faithfulness", action="store_true")
    ap.add_argument("--concurrency", type=int, default=int(os.getenv("JUDGE_CONCURRENCY", "4")))
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    items = {x["id"]: x for x in read_jsonl(args.questions)}
    judge = Judge(args.out_dir / "judge_cache.jsonl")

    for run_file in sorted(args.runs_dir.glob("*.jsonl")):
        rows = [r for r in read_jsonl(run_file) if r["id"] in items]
        # Keep the last row per id (a resumed run may have retried errored items).
        rows = list({r["id"]: r for r in rows}.values())
        with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            scored = list(pool.map(lambda r: score_row(judge, r, items[r["id"]]), rows))
        if not args.no_faithfulness:
            answered = [(r, items[r["id"]]) for r, s in zip(rows, scored)
                        if not r.get("error") and not s.get("declined")]
            faith = ragas_faithfulness(answered)
            for s in scored:
                s["faithfulness"] = faith.get(s["id"])
        write_jsonl(args.out_dir / run_file.name, scored)
        print(f"scored {run_file.name}: {len(scored)} items")

    # Hand-check sheet: 20 answered items from the reference config, for the
    # judge-agreement check (fill in human_correct / human_faithful, then run report.py).
    ref = args.out_dir / "E001__full.jsonl"
    if ref.exists():
        import random
        pool = [s for s in read_jsonl(ref) if not s.get("error") and not s.get("declined")]
        random.Random(0).shuffle(pool)
        sheet = [{"id": s["id"], "block": s["block"], "question": items[s["id"]]["question"],
                  "expected_answer": items[s["id"]].get("expected_answer"), "answer": s["answer"],
                  "judge_correct": s.get("correct_strict"), "judge_faithfulness": s.get("faithfulness"),
                  "human_correct": None, "human_faithful": None} for s in pool[:20]]
        write_jsonl(args.out_dir / "hand_check.jsonl", sheet)
        print(f"wrote {len(sheet)} items to {args.out_dir / 'hand_check.jsonl'} for the hand check")
    return 0


if __name__ == "__main__":
    sys.exit(main())
