#!/usr/bin/env python3
"""
Builds the clinical-eval-v1 question set and the patient split.

Blocks (see ai/docs/EVAL.md):
  A  20 questions sampled from FHIR-AgentBench's test split, stratified by the
     gold resource type, including 4 with empty gold (the record holds no
     matching data, so the correct answer is "none"/"no").
  B  10 authored questions whose answers and gold resource ids are computed
     by code over the MIMIC NDJSON (temporal, negation, multi-resource,
     aggregate, paraphrase).
  D   8 questions the structured record cannot answer (no notes, reports,
     social or family history in the demo; or out of scope), each checked
     by code against the patient's resources before inclusion.
  C  written by eval/build_block_c.py (needs openFDA/PubMed lookups and a
     human review pass); this script only reserves the index cases.

Answers never come from an LLM. Deterministic: same inputs and seed give the
same file. Writes eval/data/clinical-eval-v1.jsonl (A, B, D),
eval/data/index_cases.json and eval/data/splits.json.
"""
from __future__ import annotations

import argparse
import ast
import csv
import gzip
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import (  # noqa: E402
    AGENTBENCH_CSV, DATA_DIR, FHIR_DIR, QUESTION_SET, SPLITS_FILE, UNSCOPED_TYPES,
    strip_patient_identifiers, write_jsonl,
)

SEED = 20260930
csv.field_size_limit(10**9)

# Block A allocation over the primary gold resource type (sums to 20).
A_ALLOCATION = {
    "Observation": 6, "MedicationRequest": 4, "Encounter": 3, "Procedure": 1,
    "Condition": 1, "Patient": 1, "__empty__": 4,
}


# ---------------------------------------------------------------- data access

def iter_file(fhir_dir: Path, stem: str):
    path = fhir_dir / f"{stem}.ndjson.gz"
    if not path.exists():
        path = fhir_dir / f"{stem}.ndjson"
    opener = gzip.open if str(path).endswith(".gz") else open
    with opener(path, "rt") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def patient_of(res: dict) -> str | None:
    if res.get("resourceType") == "Patient":
        return res["id"]
    for field in ("subject", "patient"):
        ref = (res.get(field) or {}).get("reference") or ""
        if ref.startswith("Patient/"):
            return ref.split("/", 1)[1]
    return None


def display(res: dict) -> str:
    for key in ("code", "medicationCodeableConcept"):
        for c in (res.get(key) or {}).get("coding") or []:
            if c.get("display"):
                return c["display"]
            # MIMIC puts the drug name in the code of this system, with no display.
            if (c.get("system") or "").endswith("mimic-medication-name") and c.get("code"):
                return c["code"]
    ref = res.get("medicationReference") or {}
    return ref.get("display", "")


def when(res: dict) -> str:
    for key in ("effectiveDateTime", "authoredOn", "issued", "recordedDate"):
        if res.get(key):
            return res[key]
    for key in ("effectivePeriod", "period"):
        if (res.get(key) or {}).get("start"):
            return res[key]["start"]
    return ""


def value(res: dict):
    q = res.get("valueQuantity") or {}
    return q.get("value"), q.get("unit", "")


def medication_names(fhir_dir: Path) -> dict[str, str]:
    """Medication id -> name; mixes are named by their ingredients (same rule as the loader)."""
    names, mixes = {}, []
    for stem in ("MimicMedication", "MimicMedicationMix"):
        for res in iter_file(fhir_dir, stem):
            for ident in res.get("identifier") or []:
                if (ident.get("system") or "").endswith("mimic-medication-name") and ident.get("value"):
                    names[res["id"]] = ident["value"]
            if res["id"] not in names:
                mixes.append(res)
    for res in mixes:
        parts = [names[i] for i in (((ing.get("itemReference") or {}).get("reference") or "").split("/")[-1]
                                    for ing in res.get("ingredient") or []) if i in names]
        if parts:
            names[res["id"]] = " + ".join(parts)
    return names


class PatientIndex:
    """Per-patient resources for the file types the authored blocks use."""

    FILES = [
        "MimicPatient", "MimicCondition", "MimicEncounter", "MimicEncounterICU",
        "MimicObservationLabevents", "MimicMedicationRequest",
        "MimicMedicationAdministrationICU", "MimicObservationVitalSignsED",
    ]

    def __init__(self, fhir_dir: Path):
        self.by_patient: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
        med_names = medication_names(fhir_dir)
        for stem in self.FILES:
            for res in iter_file(fhir_dir, stem):
                pid = patient_of(res)
                if not pid:
                    continue
                ref = res.get("medicationReference")
                if isinstance(ref, dict) and not ref.get("display"):
                    mid = (ref.get("reference") or "").split("/")[-1]
                    if mid in med_names:
                        ref["display"] = med_names[mid]
                self.by_patient[pid][stem].append(res)

    def get(self, pid: str, stem: str) -> list[dict]:
        return self.by_patient.get(pid, {}).get(stem, [])

    def labs(self, pid: str, name: str) -> list[dict]:
        rows = [r for r in self.get(pid, "MimicObservationLabevents")
                if display(r) == name and value(r)[0] is not None and when(r)]
        return sorted(rows, key=when)

    def richness(self, pid: str) -> int:
        return len({display(r) for r in self.get(pid, "MimicCondition")}) + len(
            {display(r) for r in self.get(pid, "MimicMedicationRequest")}
        )


def ref(res: dict) -> str:
    return f"{res['resourceType']}/{res['id']}"


# ---------------------------------------------------------------- block A

def load_agentbench(csv_path: Path) -> list[dict]:
    rows = []
    with open(csv_path) as f:
        for r in csv.DictReader(f):
            gold = ast.literal_eval(r["true_fhir_ids"]) if r["true_fhir_ids"] else {}
            scoped = {t: ids for t, ids in gold.items() if t not in UNSCOPED_TYPES and ids}
            excluded = {t: ids for t, ids in gold.items() if t in UNSCOPED_TYPES and ids}
            rows.append({
                "question_id": r["question_id"],
                "bench_split": r["split"],
                "patient_id": r["patient_fhir_id"],
                "question_raw": r["question"],
                "assumption": r["assumption"],
                "true_answer": r["true_answer"],
                "template": r["template"],
                "gold": scoped,
                "gold_excluded": excluded,
            })
    return rows


def agentbench_question_text(row: dict) -> str:
    q = strip_patient_identifiers(row["question_raw"])
    return f"{row['assumption']} {q}".strip() if row["assumption"] else q


def primary_type(row: dict) -> str:
    if not row["gold"] and not row["gold_excluded"]:
        return "__empty__"
    types = Counter({t: len(ids) for t, ids in {**row["gold_excluded"], **row["gold"]}.items()})
    t = types.most_common(1)[0][0]
    return "MedicationRequest" if t == "Medication" else t


def build_block_a(bench: list[dict], rng: random.Random) -> list[dict]:
    test = [r for r in bench if r["bench_split"] == "test"]
    by_type: dict[str, list[dict]] = defaultdict(list)
    for r in test:
        by_type[primary_type(r)].append(r)
    chosen = []
    for t, n in A_ALLOCATION.items():
        pool = sorted(by_type.get(t, []), key=lambda r: r["question_id"])
        rng.shuffle(pool)
        # Prefer distinct templates so the sample is not n paraphrases of one question.
        picked, templates = [], set()
        for r in pool:
            if r["template"] not in templates:
                picked.append(r)
                templates.add(r["template"])
            if len(picked) == n:
                break
        chosen.extend(picked)
    items = []
    for i, r in enumerate(chosen, 1):
        empty = not r["gold"] and not r["gold_excluded"]
        items.append({
            "id": f"a{i:03d}",
            "block": "A",
            "source": "FHIR-AgentBench",
            "source_question_id": r["question_id"],
            "patient_id": r["patient_id"],
            "question": agentbench_question_text(r),
            "question_original": r["question_raw"],
            "expected_answer": r["true_answer"],
            "answer_kind": "empty" if empty else "value",
            "gold_resource_ids": [f"{t}/{x}" for t, ids in sorted(r["gold"].items()) for x in ids],
            "gold_excluded_ids": [f"{t}/{x}" for t, ids in sorted(r["gold_excluded"].items()) for x in ids],
            "must_have": [],
            "expected_tools": [],
            "answerable": True,
            "category": primary_type(r),
        })
    return items


# ---------------------------------------------------------------- block B

def _item(n: int, pid: str, question: str, answer: str, gold: list[str], category: str) -> dict:
    return {
        "id": f"b{n:03d}", "block": "B", "source": "authored", "patient_id": pid,
        "question": question, "expected_answer": answer, "answer_kind": "value",
        "gold_resource_ids": gold, "gold_excluded_ids": [], "must_have": [],
        "expected_tools": [], "answerable": True, "category": category,
    }


def build_block_b(idx: PatientIndex, patients: list[str], rng: random.Random) -> list[dict]:
    """Ten generators; each takes the first eligible patient in a seeded order."""
    order = sorted(patients)
    rng.shuffle(order)
    used: set[str] = set()
    items: list[dict] = []

    def pick(pred):
        for pid in order:
            if pid not in used and pred(pid):
                used.add(pid)
                return pid
        raise RuntimeError("no eligible patient for a Block B template")

    # 1. Temporal trend: first vs last creatinine.
    pid = pick(lambda p: len(idx.labs(p, "Creatinine")) >= 3)
    labs = idx.labs(pid, "Creatinine")
    first, last = labs[0], labs[-1]
    rose = value(last)[0] > value(first)[0]
    items.append(_item(1, pid,
        "Did the patient's creatinine rise between their first and last recorded values?",
        f"{'Yes' if rose else 'No'}: first {value(first)[0]} {value(first)[1]} ({when(first)}), "
        f"last {value(last)[0]} {value(last)[1]} ({when(last)})",
        [ref(first), ref(last)], "temporal_trend"))

    # 2. Most recent value.
    pid = pick(lambda p: len(idx.labs(p, "Potassium")) >= 2)
    last = idx.labs(pid, "Potassium")[-1]
    items.append(_item(2, pid, "What was the patient's most recent potassium value?",
        f"{value(last)[0]} {value(last)[1]} ({when(last)})", [ref(last)], "latest_value"))

    # 3. Paraphrase of a latest-value question on another lab.
    pid = pick(lambda p: len(idx.labs(p, "Hemoglobin")) >= 2)
    last = idx.labs(pid, "Hemoglobin")[-1]
    items.append(_item(3, pid, "Tell me the last hemoglobin result on file for this patient.",
        f"{value(last)[0]} {value(last)[1]} ({when(last)})", [ref(last)], "paraphrase"))

    # 4. Maximum over a series.
    pid = pick(lambda p: len(idx.labs(p, "Glucose")) >= 3)
    labs = idx.labs(pid, "Glucose")
    top = max(labs, key=lambda r: value(r)[0])
    items.append(_item(4, pid, "What was the highest glucose value recorded for the patient?",
        f"{value(top)[0]} {value(top)[1]} ({when(top)})", [ref(top)], "aggregate_max"))

    # 5. Count (expected weak spot for top-k retrieval).
    pid = pick(lambda p: 3 <= len(idx.labs(p, "Sodium")) <= 12)
    labs = idx.labs(pid, "Sodium")
    items.append(_item(5, pid, "How many sodium measurements does the patient have on record?",
        str(len(labs)), [ref(r) for r in labs], "aggregate_count"))

    # 6. Negation: a drug common in the cohort that this patient never had.
    common_drugs = Counter(display(r) for p in order for r in idx.get(p, "MimicMedicationRequest") if display(r))
    candidates = [d for d, _ in common_drugs.most_common(40) if d]

    def never_had(p):
        mine = {display(r).lower() for r in idx.get(p, "MimicMedicationRequest")}
        return len(mine) >= 5 and any(d.lower() not in mine for d in candidates)

    pid = pick(never_had)
    mine = {display(r).lower() for r in idx.get(pid, "MimicMedicationRequest")}
    drug = next(d for d in candidates if d.lower() not in mine)
    items.append(_item(6, pid, f"Has the patient ever been prescribed {drug}?",
        f"No, there is no {drug} prescription in the record", [], "negation"))

    # 7. Presence of a diagnosis (yes, with the supporting Conditions).
    # Systemic hypertension only: pulmonary, portal, intracranial and ocular
    # hypertension are different conditions.
    def is_systemic_htn(r):
        d = display(r).lower()
        return ("essential hypertension" in d or d.startswith("hypertensi")) and not any(
            x in d for x in ("pulmonary", "portal", "intracranial", "ocular"))

    def has_htn(p):
        return any(is_systemic_htn(r) for r in idx.get(p, "MimicCondition"))

    pid = pick(has_htn)
    conds = [r for r in idx.get(pid, "MimicCondition") if is_systemic_htn(r)]
    items.append(_item(7, pid, "Does the patient have a recorded diagnosis of hypertension?",
        "Yes: " + "; ".join(sorted({display(r) for r in conds})), [ref(r) for r in conds], "diagnosis_presence"))

    # 8. Multi-resource: medications prescribed in the encounter of a diagnosis.
    def enc_of(r):
        return ((r.get("encounter") or {}).get("reference") or "").split("/")[-1]

    def multi_ok(p):
        meds_by_enc = defaultdict(list)
        for m in idx.get(p, "MimicMedicationRequest"):
            meds_by_enc[enc_of(m)].append(m)
        return any(1 <= len({display(m) for m in meds_by_enc.get(enc_of(c), []) if display(m)}) <= 6
                   for c in idx.get(p, "MimicCondition") if enc_of(c))

    pid = pick(multi_ok)
    meds_by_enc = defaultdict(list)
    for m in idx.get(pid, "MimicMedicationRequest"):
        meds_by_enc[enc_of(m)].append(m)
    cond = next(c for c in sorted(idx.get(pid, "MimicCondition"), key=lambda c: c["id"])
                if enc_of(c) and 1 <= len({display(m) for m in meds_by_enc.get(enc_of(c), []) if display(m)}) <= 6)
    meds = meds_by_enc[enc_of(cond)]
    items.append(_item(8, pid,
        f"Which medications were prescribed during the hospital stay in which the patient was diagnosed with {display(cond)}?",
        "; ".join(sorted({display(m) for m in meds if display(m)})), [ref(cond)] + [ref(m) for m in meds], "multi_resource"))

    # 9. ICU medication administration (yes/no with evidence).
    def icu_heparin(p):
        return any("heparin" in display(r).lower() for r in idx.get(p, "MimicMedicationAdministrationICU"))

    pid = pick(icu_heparin)
    admins = [r for r in idx.get(pid, "MimicMedicationAdministrationICU") if "heparin" in display(r).lower()]
    items.append(_item(9, pid, "Was the patient given heparin in the ICU?",
        f"Yes ({len(admins)} administrations recorded)", [ref(r) for r in admins], "administration"))

    # 10. First-vs-first ordering across two labs.
    pid = pick(lambda p: idx.labs(p, "Sodium") and idx.labs(p, "Lactate"))
    na, lac = idx.labs(pid, "Sodium")[0], idx.labs(pid, "Lactate")[0]
    first_name = "sodium" if when(na) <= when(lac) else "lactate"
    items.append(_item(10, pid, "Which was measured first for this patient: sodium or lactate?",
        f"{first_name} (sodium {when(na)}, lactate {when(lac)})", [ref(na), ref(lac)], "temporal_order"))
    return items


# ---------------------------------------------------------------- block D

# Each probe names data the MIMIC demo on FHIR does not contain; the absence
# check greps the patient's own resources for the terms before inclusion.
D_PROBES = [
    ("What follow-up did the discharge summary recommend?", ["discharge summary", "follow-up"], "no_notes"),
    ("What did the radiology report for the patient's chest imaging conclude?", ["radiology report", "impression"], "no_reports"),
    ("What is the patient's smoking history?", ["smok", "tobacco"], "no_social_history"),
    ("Is there a family history of heart disease for this patient?", ["family history"], "no_family_history"),
    ("What did the admitting physician write in the history of present illness?", ["history of present illness"], "no_notes"),
    ("What will the patient's creatinine be next week?", [], "out_of_scope_prediction"),
    ("Which insurance plan covers this patient's medications?", ["insurance", "coverage"], "not_in_record"),
    ("What did the patient say about their pain at home before admission?", ["patient reported", "home"], "no_notes"),
]


def patient_text_contains(fhir_dir: Path, pid: str, terms: list[str]) -> bool:
    if not terms:
        return False
    needle = f"Patient/{pid}"
    for path in sorted(fhir_dir.glob("*.ndjson*")):
        opener = gzip.open if str(path).endswith(".gz") else open
        with opener(path, "rt") as f:
            for line in f:
                if needle in line or f'"id": "{pid}"' in line:
                    low = line.lower()
                    if any(t in low for t in terms):
                        return True
    return False


def build_block_d(fhir_dir: Path, patients: list[str], rng: random.Random) -> list[dict]:
    order = sorted(patients)
    rng.shuffle(order)
    items = []
    for i, (question, terms, category) in enumerate(D_PROBES, 1):
        pid = next(p for p in order[i - 1:] + order[: i - 1] if not patient_text_contains(fhir_dir, p, terms))
        items.append({
            "id": f"d{i:03d}", "block": "D", "source": "authored", "patient_id": pid,
            "question": question, "expected_answer": "ABSTAIN", "answer_kind": "abstain",
            "gold_resource_ids": [], "gold_excluded_ids": [], "must_have": [],
            "expected_tools": [], "answerable": False, "category": category,
            "absence_checked_terms": terms,
        })
    return items


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fhir-dir", type=Path, default=FHIR_DIR)
    ap.add_argument("--agentbench-csv", type=Path, default=AGENTBENCH_CSV)
    ap.add_argument("--dev-fraction", type=float, default=0.2)
    ap.add_argument("--n-index-cases", type=int, default=4)
    args = ap.parse_args()

    rng = random.Random(SEED)
    bench = load_agentbench(args.agentbench_csv)
    idx = PatientIndex(args.fhir_dir)
    all_patients = sorted(r["id"] for r in iter_file(args.fhir_dir, "MimicPatient"))

    block_a = build_block_a(bench, random.Random(SEED + 1))
    a_patients = {x["patient_id"] for x in block_a}

    # Index cases for Block C: richest records not already used by Block A.
    ranked = sorted((p for p in all_patients if p not in a_patients), key=lambda p: (-idx.richness(p), p))
    index_cases = ranked[: args.n_index_cases]

    free = [p for p in all_patients if p not in a_patients and p not in index_cases]
    block_b = build_block_b(idx, free, random.Random(SEED + 2))
    b_patients = {x["patient_id"] for x in block_b}
    block_d = build_block_d(args.fhir_dir, [p for p in free if p not in b_patients], random.Random(SEED + 3))

    eval_patients = a_patients | b_patients | set(index_cases) | {x["patient_id"] for x in block_d}
    others = [p for p in all_patients if p not in eval_patients]
    rng.shuffle(others)
    n_dev = round(len(all_patients) * args.dev_fraction)
    dev = sorted(others[:n_dev])
    test = sorted(set(all_patients) - set(dev))
    assert eval_patients <= set(test), "every eval-set patient must be in the test split"

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    existing_c = []
    if QUESTION_SET.exists():
        existing_c = [json.loads(l) for l in open(QUESTION_SET) if l.strip() and json.loads(l)["block"] == "C"]
    write_jsonl(QUESTION_SET, block_a + block_b + existing_c + block_d)
    json.dump({"seed": SEED, "dev": dev, "test": test, "eval_patients": sorted(eval_patients)},
              open(SPLITS_FILE, "w"), indent=1)
    json.dump({
        "index_cases": [
            {"patient_id": p, "richness": idx.richness(p),
             "conditions": sorted({display(r) for r in idx.get(p, "MimicCondition")})[:40],
             "medications": sorted({display(r) for r in idx.get(p, "MimicMedicationRequest") if display(r)})[:60]}
            for p in index_cases
        ]
    }, open(DATA_DIR / "index_cases.json", "w"), indent=1)

    print(f"A={len(block_a)} B={len(block_b)} C(kept)={len(existing_c)} D={len(block_d)}; "
          f"patients: eval={len(eval_patients)} dev={len(dev)} test={len(test)}")
    print("Block A categories:", Counter(x["category"] for x in block_a))
    return 0


if __name__ == "__main__":
    sys.exit(main())
