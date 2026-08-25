"""Loader (F6), question set, statistics and scoring helpers. No models."""
import json
from collections import Counter

import pytest

from eval import stats
from eval.common import QUESTION_SET, SPLITS_FILE, read_jsonl, strip_confidence_block, strip_patient_identifiers
from eval.score import parse_label, recall, tool_match


# ---------------------------------------------------------------- F6 loader

OBS = {
    "resourceType": "Observation", "id": "0b1c2d3e-0000-5000-8000-000000000001",
    "subject": {"reference": "Patient/pat-1"}, "status": "final",
    "code": {"coding": [{"display": "Creatinine"}]},
    "effectiveDateTime": "2161-04-12T07:45:00-04:00", "issued": "2161-04-12T09:00:00-04:00",
    "valueQuantity": {"value": 1.1, "unit": "mg/dL"},
}


def test_prepare_fhir_resource_dates_patient_and_raw():
    from src.ingestion.service import IngestionService

    points = IngestionService.prepare_fhir_resource(OBS, store_raw=False)
    assert len(points) == 1
    p = points[0]["payload"]
    assert p["patient_id"] == "pat-1" and p["parent_node_id"] == OBS["id"]
    assert p["date_issued"] == "2161-04-12T07:45:00-04:00"  # effectiveDateTime before issued
    assert p["date_unix"] != 0
    assert "fhir_raw" not in p
    assert "Creatinine" in points[0]["text"]
    assert "fhir_raw" in IngestionService.prepare_fhir_resource(OBS)[0]["payload"]


@pytest.mark.parametrize("res,expected", [
    ({"resourceType": "MedicationRequest", "authoredOn": "2180-08-06T08:06:12-04:00"}, "2180-08-06T08:06:12-04:00"),
    ({"resourceType": "MedicationDispense", "whenHandedOver": "2180-01-01"}, "2180-01-01"),
    ({"resourceType": "Encounter", "period": {"start": "2180-05-06T22:23:00-04:00"}}, "2180-05-06T22:23:00-04:00"),
    ({"resourceType": "Condition"}, ""),
])
def test_fhir_date_fields(res, expected):
    from src.ingestion.service import _fhir_date

    assert _fhir_date(res) == expected


def test_loader_resolves_medication_names(tmp_path):
    import gzip
    from scripts.ingest_fhir_ndjson import build_medication_names, resolve_references

    meds = [
        {"resourceType": "Medication", "id": "m1", "identifier": [
            {"system": "http://mimic.mit.edu/fhir/mimic/CodeSystem/mimic-medication-name", "value": "Heparin"}]},
        {"resourceType": "Medication", "id": "m2", "identifier": [
            {"system": "http://mimic.mit.edu/fhir/mimic/CodeSystem/mimic-medication-name", "value": "Saline"}]},
        {"resourceType": "Medication", "id": "mix", "ingredient": [
            {"itemReference": {"reference": "Medication/m1"}}, {"itemReference": {"reference": "Medication/m2"}}]},
    ]
    path = tmp_path / "MimicMedication.ndjson.gz"
    with gzip.open(path, "wt") as f:
        for m in meds:
            f.write(json.dumps(m) + "\n")
    names = build_medication_names([str(path)])
    assert names == {"m1": "Heparin", "m2": "Saline", "mix": "Heparin + Saline"}
    req = {"resourceType": "MedicationRequest", "medicationReference": {"reference": "Medication/mix"}}
    assert resolve_references(req, names)["medicationReference"]["display"] == "Heparin + Saline"


# ---------------------------------------------------------------- question set

def test_question_set_shape_and_split():
    items = read_jsonl(QUESTION_SET)
    assert Counter(x["block"] for x in items) == {"A": 20, "B": 10, "C": 12, "D": 8}
    assert len({x["id"] for x in items}) == 50
    splits = json.load(open(SPLITS_FILE))
    assert not set(splits["dev"]) & set(splits["test"])
    # Every patient an eval question touches is in the test split, never dev.
    assert {x["patient_id"] for x in items} <= set(splits["test"])
    assert not {x["patient_id"] for x in items} & set(splits["dev"])
    for x in items:
        assert "patient 1" not in x["question"].lower()  # MIMIC subject ids stripped
        if x["block"] == "D":
            assert x["answerable"] is False
        if x["block"] == "C":
            assert x["must_have"] and all(m["source"] for m in x["must_have"])


def test_strip_patient_identifiers():
    assert strip_patient_identifiers("What is patient 10005909's sex?") == "What is the patient's sex?"
    assert strip_patient_identifiers("Has patient 10023239 had any medication?") == "Has the patient had any medication?"


def test_strip_confidence_block():
    raw = "The answer.\n\n---\n*Confidence Assessment:*\n- **Overall: 0.80 (High)**"
    assert strip_confidence_block(raw) == "The answer."


# ---------------------------------------------------------------- stats

def test_wilson_known_values():
    lo, hi = stats.wilson(0, 10)
    assert lo == 0.0 and hi == pytest.approx(0.2775, abs=1e-3)
    lo, hi = stats.wilson(40, 50)
    assert lo == pytest.approx(0.6696, abs=1e-3) and hi == pytest.approx(0.8876, abs=1e-3)


def test_mcnemar_exact():
    a = [True] * 30 + [False] * 10 + [True] * 2 + [False] * 8
    b = [True] * 30 + [True] * 10 + [False] * 2 + [False] * 8
    res = stats.mcnemar_exact(a, b)
    assert (res["fixed"], res["broke"]) == (10, 2)
    assert res["p_value"] == pytest.approx(0.03857, abs=1e-4)


def test_kappa_and_rule_of_three_and_auc():
    assert stats.cohen_kappa([1, 1, 0, 0], [1, 1, 0, 0]) == 1.0
    assert stats.rule_of_three(600) == pytest.approx(0.005)
    pts = stats.roc_points([0.9, 0.8, 0.7], [0.1, 0.2])
    assert stats.auc(pts) == pytest.approx(1.0)
    assert max(pts, key=lambda p: p["youden_j"])["threshold"] == 0.7


def test_paired_bootstrap_detects_consistent_gain():
    res = stats.paired_bootstrap_diff([0.0] * 20, [1.0] * 15 + [0.0] * 5)
    assert res["mean_diff"] == pytest.approx(0.75) and res["p_value"] < 0.01


# ---------------------------------------------------------------- scoring helpers

@pytest.mark.parametrize("reply,valid,expected", [
    ("1", {"0", "1"}, "1"),
    ("Reasoning...\n0", {"0", "1"}, "0"),
    ("no answer", {"no answer", "question answered"}, "no answer"),
    ("Return: question answered", {"no answer", "question answered"}, "question answered"),
    ("ENTAILED.", {"ENTAILED", "CONTRADICTED", "NEITHER"}, "ENTAILED"),
    ("0 or 1", {"0", "1"}, ""),
])
def test_parse_label(reply, valid, expected):
    assert parse_label(reply, valid) == expected


def test_recall_and_tools():
    assert recall(["Observation/a", "Observation/b"], ["a", "x", "y"]) == (0.5, False)
    assert recall([], ["a"]) == (None, None)
    assert tool_match(["OpenFDA"], ["OpenFDA", "PubMed"]) is True
    assert tool_match(["PubMed"], ["NIH/MedlinePlus"]) is False


# ---------------------------------------------------------------- retrieval study scoring

def test_retrieval_study_scoring_on_synthetic_runs():
    from eval.retrieval_study import evaluate

    rows, qrels, meta = [], {}, {}
    for i in range(12):
        q, gold = f"q{i}", [f"g{i}a", f"g{i}b"]
        qrels[q], meta[q] = {g: 1 for g in gold}, {"ids": gold, "type": "Observation"}
        filler = [f"x{j}" for j in range(20)]
        rows.append({"qid": q, "configs": {
            "dense": {"ids": ([gold[0]] if i % 2 == 0 else []) + filler[:19], "cosine": []},
            "sparse": {"ids": filler, "cosine": []},
            "hybrid": {"ids": (gold if i < 9 else []) + filler[:18], "cosine": []},
            "hybrid_filter": {"ids": [gold[0]] + filler[:19], "cosine": []},
            "legacy_context": {"ids": [], "cosine": []},
        }})
    out = evaluate(rows, qrels, meta)
    assert out["configs"]["hybrid"]["recall@5"]["mean"] == pytest.approx(0.75)
    assert out["configs"]["hybrid"]["full_recall@5"]["mean"] == pytest.approx(0.75)
    assert out["configs"]["dense"]["recall@5"]["mean"] == pytest.approx(0.25)
    assert out["configs"]["hybrid_filter"]["full_recall@5"]["mean"] == 0.0
    assert out["generator_context"]["legacy_context"]["empty_context_rate"] == 1.0
    assert "hybrid" in out["paired_tests"]["table"]
    json.dumps(out)  # serialisable for metrics.json


# ---------------------------------------------------------------- scoring + report (fake judge)

class FakeJudge:
    def correct(self, question, gold, answer):
        return int(str(gold).strip("[]'") in answer)

    def null_norm(self, question, answer):
        return "no answer" if "not" in answer.lower() else "question answered"

    def must_have(self, statement, answer):
        return "ENTAILED" if statement.split()[0].lower() in answer.lower() else "NEITHER"


def test_score_and_report_pipeline(tmp_path, monkeypatch):
    import sys
    from eval import report, score
    from eval.common import write_jsonl

    items = {
        "a1": {"id": "a1", "block": "A", "question": "q", "expected_answer": "[['F']]", "category": "Patient",
               "gold_resource_ids": ["Patient/p"]},
        "a2": {"id": "a2", "block": "A", "question": "q", "expected_answer": "[]", "category": "__empty__",
               "gold_resource_ids": []},
        "c1": {"id": "c1", "block": "C", "question": "q", "expected_tools": ["OpenFDA"], "category": "openfda:x",
               "must_have": [{"statement": "Nephrotoxicity may occur", "source": {"x": 1}},
                             {"statement": "Dose adjust", "source": {"x": 1}}]},
        "d1": {"id": "d1", "block": "D", "question": "q", "category": "no_notes"},
    }

    def run_rows(config, abstain_d):
        return [
            {"id": "a1", "block": "A", "config": config, "experiment": "E001", "answer": "Sex is F",
             "context_resource_ids": ["p"], "abstained": False, "llm_calls": [{"prompt_tokens": 5}], "latency_s": 1.0},
            {"id": "a2", "block": "A", "config": config, "experiment": "E001", "answer": "The record does not show any",
             "context_resource_ids": [], "abstained": False, "llm_calls": [], "latency_s": 1.0},
            {"id": "c1", "block": "C", "config": config, "experiment": "E001",
             "answer": "Nephrotoxicity is a warning", "evidence_sources": ["OpenFDA"], "abstained": False,
             "llm_calls": [], "latency_s": 2.0},
            {"id": "d1", "block": "D", "config": config, "experiment": "E001",
             "answer": "I do not have enough evidence" if abstain_d else "It was fine",
             "abstained": abstain_d, "llm_calls": [], "latency_s": 1.0},
        ]

    scores = tmp_path / "scores"
    for config, abstain in (("full", True), ("naive_rag", False)):
        rows = [score.score_row(FakeJudge(), r, items[r["id"]]) for r in run_rows(config, abstain)]
        write_jsonl(scores / f"E001__{config}.jsonl", rows)
    full = {r["id"]: r for r in (json.loads(l) for l in (scores / "E001__full.jsonl").read_text().splitlines())}
    assert full["a1"]["correct_strict"] == 1 and full["a1"]["recall@5"] == 1.0
    assert full["a2"]["correct_bench"] == 1          # declined on empty gold: correct under bench rules
    assert full["c1"]["coverage"] == 0.5 and full["c1"]["tool_correct"] is True
    assert full["d1"]["abstain_correct_flag"] is True

    monkeypatch.setattr(sys, "argv", ["report", "--scores-dir", str(scores), "--runs-dir", str(tmp_path / "runs")])
    assert report.main() == 0
    rep = json.loads((scores / "report.json").read_text())
    assert rep["E001"]["D declined (text)"]["fixed"] == 1
    assert "| accuracy_strict_A |" in (scores / "report.md").read_text()
