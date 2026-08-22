#!/usr/bin/env python3
"""
Retrieval study: no generator, no LLM. Runs the system's own retriever over
every FHIR-AgentBench question with patient-scoped gold resource ids and
scores the ranked resources against that gold.

  R1  dense vs sparse vs hybrid RRF          (intent filter off)
  R2  legacy RRF-threshold gating vs top-k   (fix F1 before/after; the
      generator context each strategy would actually produce)
  R3  intent filter on vs off                (hybrid; decides fix F7)
  R4  k in {5, 10, 20}                       (hybrid)
  Gate calibration: max dense cosine of the top-k for answerable dev
      questions vs dev-only unanswerable probes -> ROC, AUC, threshold.

Metrics (ranx): Recall@k, nDCG@10, MRR@10, plus full-recall@k (every gold id
retrieved) bucketed by gold-set size and resource type. 95% intervals by
bootstrap over questions; paired configs compared with ranx's randomization
test. Reported numbers use the test split; dev is only for the gate.

Needs Qdrant with the indexed MIMIC demo and the embedding models (runs in
the eval runner container on a CPU machine).
"""
from __future__ import annotations

import argparse
import functools
import json
import logging
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.build_questions import agentbench_question_text, load_agentbench  # noqa: E402
from eval.common import AGENTBENCH_CSV, RESULTS_DIR, SPLITS_FILE, append_jsonl, read_jsonl  # noqa: E402
from eval.stats import auc, bootstrap_mean_ci, roc_points  # noqa: E402

logger = logging.getLogger("retrieval_study")

KS = (5, 10, 20)

# Dev-only unanswerable probes. Deliberately different wording from Block D:
# the gate is never tuned on Block D items.
DEV_PROBES = [
    "What did the nursing note from the night shift say about the patient's mood?",
    "Summarize the operative report for the patient's surgery.",
    "What alcohol use did the patient report?",
    "Does anyone in the patient's family have diabetes?",
    "What did the cardiology consult letter recommend?",
    "What were the patient's goals of care from the palliative care discussion?",
    "What is the name of the patient's primary care doctor?",
    "What did the MRI of the brain show?",
]


def gold_raw_ids(item_gold: dict) -> set[str]:
    return {x for ids in item_gold.values() for x in ids}


def install_embedding_cache():
    """Each question is searched under several configs; embed its text once."""
    from src.ingestion.service import IngestionService

    dense =functools.lru_cache(maxsize=None)(IngestionService.get_embedding)
    sparse = functools.lru_cache(maxsize=None)(IngestionService.get_sparse_embedding)
    IngestionService.get_embedding = staticmethod(dense)  # type: ignore[assignment]
    IngestionService.get_sparse_embedding = staticmethod(sparse)  # type: ignore[assignment]


def run_questions(questions: list[dict], out_path: Path, resume: bool) -> list[dict]:
    """One JSONL row per question with every config's ranked resource ids."""
    from src.retrieval.config import retriever_config
    from src.retrieval.query_understanding import IntentClassifier, QueryRewriter
    from src.retrieval.service import HybridRetriever

    done = {r["qid"] for r in read_jsonl(out_path)} if resume else set()
    if not resume and out_path.exists():
        out_path.unlink()
    retriever = HybridRetriever()
    classifier = IntentClassifier()
    kmax = max(KS)
    started = time.time()
    for i, q in enumerate(questions, 1):
        if q["qid"] in done:
            continue
        intent, _conf = classifier.classify(q["text"])
        intent_value = intent.value
        row = {"qid": q["qid"], "patient_id": q["patient_id"], "intent": intent_value, "configs": {}}

        def topk(mode: str, use_filter: bool) -> dict:
            groups = retriever.search_topk_resources(
                patient_id=q["patient_id"], query=q["text"], k=kmax,
                intent=intent_value, use_intent_filter=use_filter, mode=mode,
            )
            return {"ids": [g.encounter_id for g in groups], "cosine": [g.score for g in groups]}

        row["configs"]["dense"] = topk("dense", False)
        row["configs"]["sparse"] = topk("sparse", False)
        row["configs"]["hybrid"] = topk("hybrid", False)
        row["configs"]["hybrid_filter"] = topk("hybrid", True)

        # Legacy gating, as the pre-fix rag_retrieve ran it: per-intent RRF
        # threshold, one retry at half the threshold if avg top-3 < 0.15,
        # and every group above threshold passed to the generator.
        threshold = QueryRewriter.determine_retrieval_threshold(intent)
        groups = retriever.search_by_encounter(q["patient_id"], q["text"], threshold=threshold, intent=intent_value)
        scores = [g.score for g in groups][:3]
        if (sum(scores) / len(scores) if scores else 0.0) < retriever_config.retrieval_gatekeeper_threshold:
            groups = retriever.search_by_encounter(
                q["patient_id"], q["text"],
                threshold=threshold * retriever_config.retrieval_retry_threshold_factor, intent=intent_value,
            )
        row["configs"]["legacy_context"] = {"ids": [g.encounter_id for g in groups], "cosine": []}
        append_jsonl(out_path, row)
        if i % 50 == 0:
            logger.info(f"{i}/{len(questions)} questions ({(time.time() - started) / i:.2f}s each)")
    return read_jsonl(out_path)


def ranx_run(rows: list[dict], config: str, k: int | None = None) -> dict:
    run = {}
    for r in rows:
        ids = r["configs"][config]["ids"][: k or None]
        run[r["qid"]] = {doc: float(len(ids) - rank) for rank, doc in enumerate(ids)} or {"__none__": 0.0}
    return run


def evaluate(rows: list[dict], qrels: dict, gold_meta: dict) -> dict:
    from ranx import Qrels, Run, compare, evaluate as rx_eval

    q = Qrels(qrels)
    metrics = [f"recall@{k}" for k in KS] + ["ndcg@10", "mrr@10"]
    out: dict = {"n_questions": len(rows), "configs": {}}
    runs = {}
    for config in ("dense", "sparse", "hybrid", "hybrid_filter"):
        run = Run(ranx_run(rows, config), name=config)
        runs[config] = run
        per_q = rx_eval(q, run, metrics, return_mean=False, make_comparable=True)
        summary = {}
        for m in metrics:
            vals = list(per_q[m])
            lo, hi = bootstrap_mean_ci(vals)
            summary[m] = {"mean": sum(vals) / len(vals), "ci95": [lo, hi]}
        # Full recall@k: every gold id in the top k.
        for k in KS:
            hits = [set(gold_meta[r["qid"]]["ids"]) <= set(r["configs"][config]["ids"][:k]) for r in rows]
            lo, hi = bootstrap_mean_ci([float(h) for h in hits])
            summary[f"full_recall@{k}"] = {"mean": sum(hits) / len(hits), "ci95": [lo, hi]}
        out["configs"][config] = summary

    # Legacy context vs top-5: recall of the generator's actual context.
    for config, k in (("legacy_context", None), ("hybrid", 5), ("hybrid_filter", 5)):
        recalls, sizes, empty = [], [], 0
        for r in rows:
            ids = r["configs"][config]["ids"][: k or None]
            gold = set(gold_meta[r["qid"]]["ids"])
            recalls.append(len(gold & set(ids)) / len(gold))
            sizes.append(len(ids))
            empty += not ids
        lo, hi = bootstrap_mean_ci(recalls)
        out.setdefault("generator_context", {})[f"{config}{'' if k is None else f'@{k}'}"] = {
            "context_recall": {"mean": sum(recalls) / len(recalls), "ci95": [lo, hi]},
            "mean_context_resources": sum(sizes) / len(sizes),
            "empty_context_rate": empty / len(rows),
        }

    report = compare(q, runs=list(runs.values()), metrics=metrics, stat_test="fisher", max_p=0.05)
    # Superscripts in the table mark significant wins (Fisher randomization, p < 0.05).
    out["paired_tests"] = {"table": report.to_table(), "detail": report.to_dict()}

    # Buckets for the hybrid config: gold-set size and dominant resource type.
    buckets: dict = defaultdict(lambda: {"n": 0, "full_recall@5": 0, "full_recall@20": 0})
    for r in rows:
        meta = gold_meta[r["qid"]]
        size = len(meta["ids"])
        size_bucket = "1" if size == 1 else "2" if size == 2 else "3-5" if size <= 5 else "6-20" if size <= 20 else ">20"
        for key in (f"size:{size_bucket}", f"type:{meta['type']}"):
            b = buckets[key]
            b["n"] += 1
            b["full_recall@5"] += set(meta["ids"]) <= set(r["configs"]["hybrid"]["ids"][:5])
            b["full_recall@20"] += set(meta["ids"]) <= set(r["configs"]["hybrid"]["ids"][:20])
    out["hybrid_buckets"] = {k: {"n": v["n"], "full_recall@5": v["full_recall@5"] / v["n"],
                                 "full_recall@20": v["full_recall@20"] / v["n"]} for k, v in sorted(buckets.items())}
    return out


def calibrate_gate(dev_rows: list[dict], dev_patients: list[str], k: int, out_dir: Path) -> dict:
    from src.retrieval.service import HybridRetriever

    retriever = HybridRetriever()
    pos = [max(r["configs"]["hybrid"]["cosine"][:k] or [0.0]) for r in dev_rows]
    neg = []
    for pid in dev_patients:
        for probe in DEV_PROBES:
            groups = retriever.search_topk_resources(patient_id=pid, query=probe, k=k, use_intent_filter=False)
            neg.append(max((g.score for g in groups), default=0.0))
    points = roc_points(pos, neg)
    best = max(points, key=lambda p: p["youden_j"]) if points else None
    result = {
        "k": k, "n_answerable": len(pos), "n_unanswerable_probes": len(neg),
        "auc": auc(points), "youden_best": best, "roc": points,
        "note": "Dev split only; never tuned on Block D. Cosine under a patient filter detects 'unrelated', not 'answer absent'.",
    }
    json.dump(result, open(out_dir / "gate_calibration.json", "w"), indent=1)
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--agentbench-csv", type=Path, default=AGENTBENCH_CSV)
    ap.add_argument("--out-dir", type=Path, default=RESULTS_DIR / "retrieval_study")
    ap.add_argument("--limit", type=int, default=None, help="Questions per split (smoke tests)")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--gate-k", type=int, default=5)
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for noisy in ("src.retrieval.service", "src.shared.db_clients", "httpx"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    install_embedding_cache()

    splits = json.load(open(SPLITS_FILE))
    split_of = {p: "dev" for p in splits["dev"]} | {p: "test" for p in splits["test"]}
    questions, qrels, gold_meta = {"dev": [], "test": []}, {"dev": {}, "test": {}}, {}
    for row in load_agentbench(args.agentbench_csv):
        ids = gold_raw_ids(row["gold"])
        split = split_of.get(row["patient_id"])
        if not ids or split is None:
            continue
        qid = row["question_id"]
        questions[split].append({"qid": qid, "patient_id": row["patient_id"], "text": agentbench_question_text(row)})
        qrels[split][qid] = {x: 1 for x in ids}
        dominant = max(row["gold"].items(), key=lambda kv: len(kv[1]))[0]
        gold_meta[qid] = {"ids": sorted(ids), "type": dominant}
    for split in questions:
        questions[split].sort(key=lambda q: q["qid"])
        if args.limit:
            questions[split] = questions[split][: args.limit]
            qrels[split] = {q["qid"]: qrels[split][q["qid"]] for q in questions[split]}

    results = {}
    for split in ("dev", "test"):
        rows = run_questions(questions[split], args.out_dir / f"runs_{split}.jsonl", args.resume)
        rows = [r for r in rows if r["qid"] in qrels[split]]
        results[split] = evaluate(rows, qrels[split], gold_meta)
    results["gate"] = calibrate_gate(
        read_jsonl(args.out_dir / "runs_dev.jsonl"), splits["dev"], args.gate_k, args.out_dir
    )
    json.dump(results, open(args.out_dir / "metrics.json", "w"), indent=1, default=str)

    t = results["test"]
    print(f"Test split: {t['n_questions']} questions")
    for config, m in t["configs"].items():
        print(f"  {config:14s} " + "  ".join(f"{name}={v['mean']:.3f}" for name, v in m.items()))
    for config, g in t["generator_context"].items():
        print(f"  context {config:18s} recall={g['context_recall']['mean']:.3f} "
              f"size={g['mean_context_resources']:.1f} empty={g['empty_context_rate']:.2%}")
    gate = results["gate"]
    if gate["youden_best"]:
        print(f"Gate (dev): AUC={gate['auc']:.3f}; Youden threshold={gate['youden_best']['threshold']:.3f} "
              f"(TPR {gate['youden_best']['tpr']:.2f}, FPR {gate['youden_best']['fpr']:.2f})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
