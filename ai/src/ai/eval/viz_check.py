#!/usr/bin/env python3
"""
VizMCP check: 5 chart requests through the real graph, for visual review.

How VizMCP works (src/agent/graph/nodes.py, generate_visualization): a query
the intent classifier labels "visualization" routes to the `visualize` node,
which reads the patient's Observation and Encounter points from Qdrant and
always renders the same three charts through the MCP tool
render_clinical_viz: Renal Function (creatinine, eGFR), Cardiac Markers
(BNP, LVEF) and a Clinical Timeline (encounters by phase), then captions
them with one LLM call. The question wording selects the route, not the
chart. So the 5 items differ by patient archetype:

  v1  many creatinine results        -> renal chart with a long series
  v2  NTproBNP results               -> cardiac chart
  v3  many encounters                -> timeline chart
  v4  largest record in the cohort   -> the whole record is read, not a page
  v5  no BNP, fewest creatinine      -> empty cardiac chart, very short renal series

Charts are judged visually by a person. The code checks only what it can:
routing reached `visualize`, each chart rendered or was empty as expected,
and the number of points extracted equals the number in the NDJSON.

    python eval/viz_check.py build      # needs the MIMIC NDJSON (CPU, prep)
    python eval/viz_check.py run        # needs the eval stack (GPU session)

`run` writes results/eval-v1/viz/: one PNG per chart, viz_check.jsonl and
index.html (question, expected data, extracted counts, charts, caption).
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import DATA_DIR, FHIR_DIR, RESULTS_DIR, SPLITS_FILE, read_jsonl, write_jsonl  # noqa: E402

VIZ_SET = DATA_DIR / "viz-check-v1.jsonl"
QUESTIONS = {
    "v1": ("Plot the renal function chart for this patient.", "renal_long_series"),
    "v2": ("Show me a chart of the patient's cardiac markers.", "cardiac_bnp"),
    "v3": ("Generate a graph of how the patient's condition progressed over time.", "timeline_encounters"),
    "v4": ("Visualize the patient's creatinine trend.", "largest_record"),
    "v5": ("Create a chart of this patient's lab trends.", "sparse_labs"),
}


# ---------------------------------------------------------------- build

def reference_series(fhir_dir: Path) -> dict[str, dict]:
    """Per patient: the values the charts should show, straight from the NDJSON."""
    from eval.build_questions import display, iter_file, patient_of, when

    ref: dict[str, dict] = defaultdict(lambda: {"creatinine": [], "bnp": [], "encounters": [], "points": 0})
    for res in iter_file(fhir_dir, "MimicObservationLabevents"):
        pid = patient_of(res)
        name = display(res)
        value = (res.get("valueQuantity") or {}).get("value")
        if pid and value is not None and when(res):
            if name == "Creatinine":
                ref[pid]["creatinine"].append([when(res), value])
            elif name == "NTproBNP":
                ref[pid]["bnp"].append([when(res), value])
    for stem in ("MimicEncounter", "MimicEncounterED", "MimicEncounterICU"):
        for res in iter_file(fhir_dir, stem):
            pid = patient_of(res)
            start = (res.get("period") or {}).get("start")
            if pid and start:
                ref[pid]["encounters"].append([start, (res.get("class") or {}).get("code")])
    for path in fhir_dir.glob("*.ndjson*"):
        if "Observation" in path.name or "Encounter" in path.name:
            import gzip
            opener = gzip.open if str(path).endswith(".gz") else open
            with opener(path, "rt") as f:
                for line in f:
                    start = line.find('"Patient/')
                    if start != -1:
                        ref[line[start + 9:start + 45]]["points"] += 1
    for r in ref.values():
        for k in ("creatinine", "bnp", "encounters"):
            r[k].sort()
    return dict(ref)


def build(fhir_dir: Path) -> int:
    ref = reference_series(fhir_dir)
    splits = json.load(open(SPLITS_FILE))
    dev = set(splits["dev"])
    pool = sorted(p for p in ref if p not in dev)
    used: set[str] = set()

    def pick(key, filt=lambda p: True, reverse=True):
        cands = sorted((p for p in pool if p not in used and filt(p)), key=lambda p: (key(p), p), reverse=reverse)
        if not cands:
            raise RuntimeError("no eligible patient")
        used.add(cands[0])
        return cands[0]

    chosen = {
        "v4": pick(lambda p: ref[p]["points"], lambda p: len(ref[p]["creatinine"]) >= 2),
        "v1": pick(lambda p: len(ref[p]["creatinine"])),
        "v2": pick(lambda p: len(ref[p]["bnp"])),
        "v3": pick(lambda p: len(ref[p]["encounters"])),
        # Nearly every patient has creatinine, so "sparse": no BNP, fewest creatinine results.
        "v5": pick(lambda p: -len(ref[p]["creatinine"]),
                   lambda p: not ref[p]["bnp"] and ref[p]["encounters"]),
    }
    items = []
    for vid in sorted(chosen):
        pid = chosen[vid]
        r = ref[pid]
        question, archetype = QUESTIONS[vid]
        items.append({
            "id": vid, "block": "V", "patient_id": pid, "question": question, "archetype": archetype,
            "expected": {
                "renal_points": len(r["creatinine"]),
                "cardiac_points": len(r["bnp"]),
                "encounters": len(r["encounters"]),
                "creatinine": r["creatinine"], "bnp": r["bnp"],
                "encounter_classes": sorted({c for _, c in r["encounters"] if c}),
                "record_points": r["points"],
            },
        })
    write_jsonl(VIZ_SET, items)
    for x in items:
        e = x["expected"]
        print(f"{x['id']} {x['archetype']:22s} renal={e['renal_points']:3d} cardiac={e['cardiac_points']:2d} "
              f"encounters={e['encounters']:2d} record_points={e['record_points']}")
    return 0


# ---------------------------------------------------------------- run

def run(out_dir: Path) -> int:
    from src.shared import egress_guard

    egress_guard.install()
    from eval.run import initial_state
    from src.agent.graph.nodes import _extract_patient_data_for_viz
    from src.agent.graph.workflow import app

    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for item in read_jsonl(VIZ_SET):
        started = time.perf_counter()
        state = initial_state(item, "auto")
        path = []
        for update in app.stream(state, stream_mode="updates"):
            for node, delta in update.items():
                path.append(node)
                if isinstance(delta, dict):
                    state.update(delta)
        viz = state.get("viz_result") or {}
        charts = []
        for n, chart in enumerate(viz.get("charts") or [], 1):
            png = None
            if chart.get("image_base64"):
                png = f"{item['id']}_{n}_{chart.get('title', 'chart').replace(' ', '_').replace('/', '-')}.png"
                (out_dir / png).write_bytes(base64.b64decode(chart["image_base64"]))
            charts.append({"title": chart.get("title"), "chart_type": chart.get("chart_type"),
                           "summary": chart.get("summary"), "png": png})
        # What the node fed the renderer, counted the way the node splits it.
        data = _extract_patient_data_for_viz(item["patient_id"], None, None, item["question"])
        renal = [o for o in data["observations"] if "creatinine" in o["measurements"] or "egfr" in o["measurements"]]
        cardiac = [o for o in data["observations"] if "bnp" in o["measurements"] or "lvef" in o["measurements"]]
        exp = item["expected"]
        extracted = {"renal_points": len(renal), "cardiac_points": len(cardiac), "encounters": len(data["encounters"])}
        by_title = {c["title"]: c for c in charts}

        def rendered(title):
            return bool((by_title.get(title) or {}).get("png"))

        checks = {
            "routed_to_visualize": "visualize" in path,
            "renal_points_match": extracted["renal_points"] == exp["renal_points"],
            "cardiac_points_match": extracted["cardiac_points"] == exp["cardiac_points"],
            "encounters_match": extracted["encounters"] == exp["encounters"],
            "renal_chart_as_expected": rendered("Renal Function") == (exp["renal_points"] > 0),
            "cardiac_chart_as_expected": rendered("Cardiac Markers") == (exp["cardiac_points"] > 0),
            "timeline_rendered": rendered("Clinical Timeline"),
        }
        rows.append({
            "id": item["id"], "patient_id": item["patient_id"], "question": item["question"],
            "archetype": item["archetype"], "path": path, "caption": viz.get("caption"),
            "charts": charts, "expected": {k: v for k, v in exp.items() if k not in ("creatinine", "bnp")},
            "extracted": extracted, "checks": checks, "latency_s": time.perf_counter() - started,
            "error": None if viz else "no viz_result",
        })
        print(f"  {item['id']}: " + " ".join(f"{k}={'ok' if v else 'NO'}" for k, v in checks.items()), flush=True)

    write_jsonl(out_dir / "viz_check.jsonl", rows)
    write_gallery(out_dir, rows, {x["id"]: x for x in read_jsonl(VIZ_SET)})
    print(f"Review {out_dir / 'index.html'}")
    return 0


def write_gallery(out_dir: Path, rows: list[dict], items: dict) -> None:
    parts = ["<!doctype html><meta charset='utf-8'><title>VizMCP check</title>",
             "<style>body{font:14px system-ui;margin:24px;max-width:1200px}img{max-width:100%;border:1px solid #ccc}"
             "table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px;text-align:left}"
             ".no{color:#b00;font-weight:600}.ok{color:#070}</style>",
             "<h1>VizMCP check (clinical-eval-v1)</h1>",
             "<p>Judge each chart by eye: right values, right dates, readable, no misleading scale. "
             "Expected values come from the MIMIC NDJSON.</p>"]
    for r in rows:
        exp = items[r["id"]]["expected"]
        parts.append(f"<h2>{r['id']}: {html.escape(r['question'])}</h2>")
        parts.append(f"<p>Patient <code>{r['patient_id']}</code> ({r['archetype']}); route: {' → '.join(r['path'])}</p>")
        parts.append("<table><tr><th>check</th><th>result</th></tr>" + "".join(
            f"<tr><td>{k}</td><td class='{'ok' if v else 'no'}'>{'ok' if v else 'NO'}</td></tr>"
            for k, v in r["checks"].items()) + "</table>")
        parts.append(f"<p>Extracted {r['extracted']} vs expected "
                     f"renal={exp['renal_points']}, cardiac={exp['cardiac_points']}, encounters={exp['encounters']}</p>")
        if exp["creatinine"]:
            parts.append("<details><summary>Expected creatinine series</summary><pre>"
                         + "\n".join(f"{t}  {v}" for t, v in exp["creatinine"]) + "</pre></details>")
        if exp["bnp"]:
            parts.append("<details><summary>Expected NTproBNP series</summary><pre>"
                         + "\n".join(f"{t}  {v}" for t, v in exp["bnp"]) + "</pre></details>")
        for c in r["charts"]:
            parts.append(f"<h3>{html.escape(str(c['title']))} <small>({c['chart_type']})</small></h3>")
            parts.append(f"<img src='{c['png']}'>" if c["png"] else f"<p><em>{html.escape(str(c['summary']))}</em></p>")
        parts.append(f"<p><strong>Caption:</strong> {html.escape(str(r['caption']))}</p><hr>")
    (out_dir / "index.html").write_text("\n".join(parts))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["build", "run"])
    ap.add_argument("--fhir-dir", type=Path, default=FHIR_DIR)
    ap.add_argument("--out-dir", type=Path, default=RESULTS_DIR / "viz")
    args = ap.parse_args()
    return build(args.fhir_dir) if args.command == "build" else run(args.out_dir)


if __name__ == "__main__":
    sys.exit(main())
