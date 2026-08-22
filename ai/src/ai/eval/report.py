#!/usr/bin/env python3
"""
Builds the results report from scored run files: every rate with n and a
Wilson 95% interval, E001 per block with an exact McNemar test and a
fixed/broken table, E003 as one combined toggle, repeat-run agreement, the
judge-vs-human check, and per-category accuracy. Writes report.md and
report.json next to the scores.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import RESULTS_DIR, read_jsonl  # noqa: E402
from eval.stats import bootstrap_mean_ci, cohen_kappa, mcnemar_exact, rate, rule_of_three  # noqa: E402


def fmt_rate(r: dict) -> str:
    if not r["n"]:
        return "n/a"
    lo, hi = r["ci95"]
    return f"{r['rate']:.0%} ({r['k']}/{r['n']}, 95% CI {lo:.0%}–{hi:.0%})"


def fmt_mean(vals: list[float]) -> str:
    vals = [v for v in vals if v is not None]
    if not vals:
        return "n/a"
    lo, hi = bootstrap_mean_ci(vals)
    return f"{sum(vals) / len(vals):.2f} (n={len(vals)}, 95% CI {lo:.2f}–{hi:.2f})"


def percentile(vals: list[float], p: float) -> float | None:
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return None
    k = (len(vals) - 1) * p
    f = int(k)
    return vals[f] + (vals[min(f + 1, len(vals) - 1)] - vals[f]) * (k - f)


def summarize(rows: list[dict]) -> dict:
    ok = [r for r in rows if not r.get("error")]
    by_block = defaultdict(list)
    for r in ok:
        by_block[r["block"]].append(r)
    ab = by_block["A"] + by_block["B"]
    out = {"n_rows": len(rows), "n_errors": len(rows) - len(ok)}
    for label, group in (("A", by_block["A"]), ("B", by_block["B"]), ("A+B", ab)):
        for kind in ("bench", "strict"):
            vals = [r.get(f"correct_{kind}") for r in group if r.get(f"correct_{kind}") is not None]
            out[f"accuracy_{kind}_{label}"] = rate(sum(vals), len(vals))
        rec = [r["recall@5"] for r in group if r.get("recall@5") is not None]
        full = [r["full_recall@5"] for r in group if r.get("full_recall@5") is not None]
        out[f"recall@5_{label}"] = fmt_mean(rec)
        out[f"full_recall@5_{label}"] = rate(sum(full), len(full))
    c = by_block["C"]
    out["coverage_C"] = fmt_mean([r.get("coverage") for r in c])
    contradicted = [r for r in c if (r.get("must_have_contradicted") or 0) > 0]
    out["any_contradiction_C"] = rate(len(contradicted), len(c))
    tools = [r["tool_correct"] for r in c if r.get("tool_correct") is not None]
    out["tool_correct_C"] = rate(sum(tools), len(tools))
    d = by_block["D"]
    out["abstain_flag_D"] = rate(sum(bool(r.get("abstain_correct_flag")) for r in d), len(d))
    out["abstain_text_D"] = rate(sum(bool(r.get("abstain_correct_text")) for r in d), len(d))
    answerable = [r for r in ab + c if not (r["block"] == "A" and r.get("category") == "__empty__")]
    out["false_abstention_A-C"] = rate(sum(bool(r.get("abstained_flag")) for r in answerable), len(answerable))
    faith = [r["faithfulness"] for r in ok if r.get("faithfulness") is not None]
    out["faithfulness_mean"] = fmt_mean(faith)
    fully = sum(1 for f in faith if f >= 0.999)
    out["fully_faithful_answers"] = rate(fully, len(faith))
    if faith and fully == len(faith):
        out["fully_faithful_note"] = f"0 of {len(faith)} answers had an unsupported claim; 95% upper bound {rule_of_three(len(faith)):.1%} (rule of three)"
    lat = [r.get("latency_s") for r in ok]
    out["latency_p50_s"] = percentile(lat, 0.5)
    out["latency_p95_s"] = percentile(lat, 0.95)
    out["llm_calls_mean"] = sum(r.get("llm_calls", 0) for r in ok) / len(ok) if ok else None
    cats = defaultdict(list)
    for r in ab:
        if r.get("correct_strict") is not None:
            cats[f"{r['block']}:{r.get('category')}"].append(r["correct_strict"])
    out["accuracy_by_category"] = {k: rate(sum(v), len(v)) for k, v in sorted(cats.items())}
    return out


def paired(a_rows: list[dict], b_rows: list[dict], key: str, blocks: set[str]) -> dict:
    a = {r["id"]: r for r in a_rows if r["block"] in blocks and r.get(key) is not None}
    b = {r["id"]: r for r in b_rows if r["block"] in blocks and r.get(key) is not None}
    ids = sorted(set(a) & set(b))
    res = mcnemar_exact([bool(a[i][key]) for i in ids], [bool(b[i][key]) for i in ids])
    res["n"] = len(ids)
    res["fixed_ids"] = [i for i in ids if not a[i][key] and b[i][key]]
    res["broke_ids"] = [i for i in ids if a[i][key] and not b[i][key]]
    return res


def normalize_answer(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s.]", "", (text or "").lower())).strip()


def agreement(a_rows: list[dict], b_rows: list[dict], runs_dir: Path, a_file: str, b_file: str) -> dict:
    a = {r["id"]: r for r in a_rows if not r.get("error")}
    b = {r["id"]: r for r in b_rows if not r.get("error")}
    ids = sorted(set(a) & set(b))
    exact = sum(normalize_answer(a[i]["answer"]) == normalize_answer(b[i]["answer"]) for i in ids)
    ra = {r["id"]: r for r in read_jsonl(runs_dir / a_file)}
    rb = {r["id"]: r for r in read_jsonl(runs_dir / b_file)}
    jac = []
    for i in ids:
        sa, sb = set(ra[i].get("context_resource_ids") or []), set(rb[i].get("context_resource_ids") or [])
        if sa or sb:
            jac.append(len(sa & sb) / len(sa | sb))
    same_correct = [a[i].get("correct_strict") == b[i].get("correct_strict") for i in ids if a[i].get("correct_strict") is not None]
    return {"n": len(ids), "exact_answer_agreement": rate(exact, len(ids)),
            "context_set_jaccard": fmt_mean(jac), "same_correctness": rate(sum(same_correct), len(same_correct))}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scores-dir", type=Path, default=RESULTS_DIR / "scores")
    ap.add_argument("--runs-dir", type=Path, default=RESULTS_DIR / "runs")
    args = ap.parse_args()

    files = {p.stem: read_jsonl(p) for p in sorted(args.scores_dir.glob("E*__*.jsonl"))}
    files.update({p.stem: read_jsonl(p) for p in sorted(args.scores_dir.glob("repeat__*.jsonl"))})
    report: dict = {"configs": {name: summarize(rows) for name, rows in files.items()}}

    if "E001__full" in files and "E001__naive_rag" in files:
        naive, full = files["E001__naive_rag"], files["E001__full"]
        report["E001"] = {
            "A+B strict accuracy (naive -> full)": paired(naive, full, "correct_strict", {"A", "B"}),
            "A strict accuracy": paired(naive, full, "correct_strict", {"A"}),
            "B strict accuracy": paired(naive, full, "correct_strict", {"B"}),
            "C any must-have covered": paired(
                [dict(r, covered=(r.get("coverage") or 0) > 0) for r in naive],
                [dict(r, covered=(r.get("coverage") or 0) > 0) for r in full], "covered", {"C"}),
            "D declined (text)": paired(naive, full, "abstain_correct_text", {"D"}),
        }
    if "E003__e003_off" in files and "E001__full" in files:
        report["E003 (retry + graded evaluator, combined toggle; off -> on)"] = {
            "A+B strict accuracy": paired(files["E003__e003_off"], files["E001__full"], "correct_strict", {"A", "B"}),
            "D declined (flag)": paired(files["E003__e003_off"], files["E001__full"], "abstain_correct_flag", {"D"}),
        }
    rep = [k for k in files if k.startswith("repeat__full")]
    if rep and "E001__full" in files:
        report["run_to_run"] = agreement(files["E001__full"], files[rep[0]], args.runs_dir,
                                         "E001__full.jsonl", f"{rep[0]}.jsonl")

    hand = [r for r in read_jsonl(args.scores_dir / "hand_check.jsonl") if r.get("human_correct") is not None]
    if hand:
        j = [int(r["judge_correct"] or 0) for r in hand]
        h = [int(r["human_correct"]) for r in hand]
        report["judge_vs_human"] = {"n": len(hand), "agreement": rate(sum(a == b for a, b in zip(j, h)), len(hand)),
                                    "cohen_kappa": cohen_kappa(j, h),
                                    "publish_judge_numbers": cohen_kappa(j, h) >= 0.6}

    json.dump(report, open(args.scores_dir / "report.json", "w"), indent=1, default=str)
    lines = ["# clinical-eval-v1 results", ""]
    for name, s in report["configs"].items():
        lines += [f"## {name}", "", "| Metric | Value |", "|---|---|"]
        for k, v in s.items():
            if k == "accuracy_by_category":
                continue
            lines.append(f"| {k} | {fmt_rate(v) if isinstance(v, dict) and 'rate' in v else v} |")
        lines += ["", "Per-category strict accuracy:", ""]
        lines += [f"- {k}: {fmt_rate(v)}" for k, v in s["accuracy_by_category"].items()]
        lines.append("")
    for section in [k for k in report if k not in ("configs",)]:
        lines += [f"## {section}", "", "```json", json.dumps(report[section], indent=1, default=str), "```", ""]
    (args.scores_dir / "report.md").write_text("\n".join(lines))
    print(f"wrote {args.scores_dir / 'report.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
