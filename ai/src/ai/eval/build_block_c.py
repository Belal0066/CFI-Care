#!/usr/bin/env python3
"""
Drafts Block C: case questions on the index patients that need external
evidence (openFDA drug labels or PubMed), K-QA style.

For each index case it pairs a drug the patient was prescribed with a
clinical concept in the patient's recorded conditions, then pulls the
must-have statements VERBATIM from a named source:
  * openFDA: sentences from the label's boxed warning / contraindications /
    warnings / drug-interaction sections that mention the concept;
  * PubMed: sentences from the top review abstract for "<drug> AND <concept>".
Each statement is stored with its source id, so it restates the source and
never makes a clinical judgement of its own.

Output items carry "status": "draft". A person must read every must-have
statement, delete irrelevant ones, and set status to "reviewed" before the
set is tagged eval-v1 (eval/run.py refuses draft items unless --allow-draft).

Needs network access to api.fda.gov and eutils.ncbi.nlm.nih.gov (public
data, no model). Optional keys: OPENFDA_API_KEY, NCBI_API_KEY.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval.common import DATA_DIR, QUESTION_SET, read_jsonl, write_jsonl  # noqa: E402

# Concept -> terms that identify it in a condition display / label sentence.
CONCEPTS = {
    "kidney disease": (["kidney", "renal", "nephro"], ["renal", "kidney", "creatinine clearance"]),
    "liver disease": (["liver", "hepatic", "cirrhosis", "hepatitis"], ["hepatic", "liver"]),
    "heart failure": (["heart failure", "cardiomyopathy"], ["heart failure"]),
    "diabetes": (["diabetes", "diabetic"], ["diabetes", "hyperglycemia", "hypoglycemia"]),
    "hypotension": (["hypotension"], ["hypotension"]),
    "bleeding": (["hemorrhage", "bleeding", "anemia"], ["bleeding", "hemorrhage"]),
    "arrhythmia": (["atrial fibrillation", "arrhythmia", "tachycardia"], ["arrhythmia", "qt prolongation", "atrial fibrillation"]),
    "hyperkalemia": (["hyperkalemia", "hyperpotassemia"], ["hyperkalemia", "potassium"]),
    "respiratory depression": (["respiratory failure", "copd", "obstructive"], ["respiratory depression"]),
    "seizures": (["seizure", "epilep"], ["seizure"]),
}
LABEL_SECTIONS = ["boxed_warning", "contraindications", "warnings_and_cautions", "warnings", "drug_interactions"]
N_OPENFDA_PER_CASE = 2
N_PUBMED_PER_CASE = 1  # 4 cases x 3 = 12 items
MAX_MUST_HAVE = 5


def mentions(text: str, terms: list[str]) -> bool:
    """Word-boundary match at the start of each term ("renal" must not match "adrenal")."""
    low = text.lower()
    return any(re.search(rf"\b{re.escape(t)}", low) for t in terms)


def sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", text)
    return [p.strip() for p in parts if 40 <= len(p.strip()) <= 400]


def generic(drug: str) -> str:
    name = re.split(r"[(\d+]", drug)[0].strip()
    name = re.sub(r"\b(sodium|hcl|hydrochloride|sulfate|er|sr|xl|iv|po)\b", "", name, flags=re.I)
    return re.sub(r"\s{2,}", " ", name).strip(" -/") or drug


def patient_concepts(conditions: list[str]) -> list[str]:
    low = " | ".join(conditions).lower()
    return [c for c, (cond_terms, _) in CONCEPTS.items() if mentions(low, cond_terms)]


def openfda_label(client: httpx.Client, drug: str) -> dict | None:
    params = {"search": f'openfda.generic_name:"{drug}"', "limit": 1}
    if os.getenv("OPENFDA_API_KEY"):
        params["api_key"] = os.getenv("OPENFDA_API_KEY")
    r = client.get("https://api.fda.gov/drug/label.json", params=params)
    if r.status_code != 200:
        return None
    results = r.json().get("results") or []
    return results[0] if results else None


def label_statements(label: dict, concept: str) -> list[dict]:
    terms = CONCEPTS[concept][1]
    out = []
    for section in LABEL_SECTIONS:
        for block in label.get(section) or []:
            for s in sentences(block):
                if mentions(s, terms):
                    out.append({"statement": s, "source": {
                        "type": "openFDA drug label", "set_id": label.get("set_id"),
                        "label_id": label.get("id"), "section": section}})
    return out[:MAX_MUST_HAVE]


def pubmed_statements(client: httpx.Client, drug: str, concept: str) -> tuple[list[dict], str | None]:
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    key = {"api_key": os.getenv("NCBI_API_KEY")} if os.getenv("NCBI_API_KEY") else {}
    term = f'{drug}[Title/Abstract] AND "{concept}"[Title/Abstract] AND Review[pt]'
    r = client.get(f"{base}/esearch.fcgi", params={"db": "pubmed", "term": term, "retmode": "json",
                                                    "retmax": 1, "sort": "relevance", **key})
    ids = r.json().get("esearchresult", {}).get("idlist", [])
    if not ids:
        return [], None
    time.sleep(0.4)
    x = client.get(f"{base}/efetch.fcgi", params={"db": "pubmed", "id": ids[0], "retmode": "xml", **key})
    root = ET.fromstring(x.content)
    abstract = " ".join("".join(el.itertext()) for el in root.iter("AbstractText"))
    terms = CONCEPTS[concept][1] + [concept]
    # Both the drug and the concept must appear, so the statement is about this pairing.
    stmts = [{"statement": s, "source": {"type": "PubMed abstract", "pmid": ids[0]}}
             for s in sentences(abstract)
             if drug.lower() in s.lower() and mentions(s, terms)]
    return stmts[:MAX_MUST_HAVE], ids[0]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--index-cases", type=Path, default=DATA_DIR / "index_cases.json")
    args = ap.parse_args()

    cases = json.load(open(args.index_cases))["index_cases"]
    items: list[dict] = []
    used_drugs: set[str] = set()

    def add(pid, drug, concept, stmts, tool):
        items.append({
            "id": f"c{len(items) + 1:03d}", "block": "C", "source": "authored", "status": "draft",
            "patient_id": pid,
            "question": (
                f"This patient is on {drug}. Given their recorded conditions, "
                f"what does the FDA drug label say they should watch out for?"
                if tool == "OpenFDA" else
                f"What does the published literature say about using {drug} "
                f"in a patient like this one with {concept}?"
            ),
            "expected_answer": None, "answer_kind": "long_form",
            "gold_resource_ids": [], "gold_excluded_ids": [],
            "must_have": stmts, "expected_tools": [tool],
            "answerable": True, "category": f"{tool.lower()}:{concept}",
        })

    with httpx.Client(timeout=20.0, follow_redirects=True) as client:
        for case in cases:
            pid = case["patient_id"]
            concepts = patient_concepts(case["conditions"])
            drugs = []
            for d in case["medications"]:
                g = generic(d)
                if g and g.lower() not in {x.lower() for x in drugs} and g.lower() not in used_drugs:
                    drugs.append(g)
            # Score every (drug, concept) pair by how much the label says about it.
            scored = []
            for drug in drugs:
                label = openfda_label(client, drug)
                time.sleep(0.3)
                if not label:
                    continue
                for concept in concepts:
                    stmts = label_statements(label, concept)
                    if len(stmts) >= 2:
                        scored.append((len(stmts), drug, concept, stmts))
            scored.sort(key=lambda x: (-x[0], x[1], x[2]))
            fda = []
            for _, drug, concept, stmts in scored:
                if len(fda) >= N_OPENFDA_PER_CASE:
                    break
                if drug.lower() in used_drugs:
                    continue
                used_drugs.add(drug.lower())
                fda.append(drug)
                add(pid, drug, concept, stmts, "OpenFDA")
            pm = 0
            for _, drug, concept, _ in scored:
                if pm >= N_PUBMED_PER_CASE:
                    break
                if drug.lower() in used_drugs and drug not in fda:
                    continue
                stmts, _pmid = pubmed_statements(client, drug, concept)
                time.sleep(0.4)
                if len(stmts) >= 2:
                    used_drugs.add(drug.lower())
                    add(pid, drug, concept, stmts, "PubMed")
                    pm += 1
            # No usable abstract for this case: keep 3 items per case with another label question.
            for _, drug, concept, stmts in scored:
                if pm + len(fda) >= N_OPENFDA_PER_CASE + N_PUBMED_PER_CASE:
                    break
                if drug.lower() in used_drugs:
                    continue
                used_drugs.add(drug.lower())
                fda.append(drug)
                add(pid, drug, concept, stmts, "OpenFDA")

    others = [x for x in read_jsonl(QUESTION_SET) if x["block"] != "C"]
    order = {"A": 0, "B": 1, "C": 2, "D": 3}
    write_jsonl(QUESTION_SET, sorted(others + items, key=lambda x: (order[x["block"]], x["id"])))
    print(f"Wrote {len(items)} draft Block C items to {QUESTION_SET}; review every must_have before tagging.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
