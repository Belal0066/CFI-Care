"""F9 (VizMCP on standard FHIR), the VizMCP check set, and Phoenix annotations. No models."""
import json

from eval.common import SPLITS_FILE, read_jsonl
from eval.phoenix_scores import annotations_for
from eval.viz_check import VIZ_SET
from src.ingestion.toon import extract_observation_values, toon_encode


def lab(display, value, unit="mg/dL", **extra):
    return {
        "resourceType": "Observation", "id": "o1", "status": "final",
        "code": {"coding": [{"system": "http://mimic.mit.edu/fhir/mimic/CodeSystem/mimic-d-labitems",
                             "code": "50912", "display": display}]},
        "subject": {"reference": "Patient/p1"},
        # The category label comes after the code: the old parser took it as the name.
        "category": [{"coding": [{"code": "laboratory", "display": "Laboratory"}]}],
        "effectiveDateTime": "2180-08-10T12:53:00-04:00",
        "valueQuantity": {"value": value, "unit": unit},
        **extra,
    }


def test_f9_structured_fhir_labs():
    assert extract_observation_values(toon_encode(lab("Creatinine", 1.1))) == {"creatinine": 1.1}
    assert extract_observation_values(toon_encode(lab("NTproBNP", 2560, "pg/mL",
        note=[{"text": "REFERENCE VALUES VARY WITH AGE"}]))) == {"bnp": 2560.0}
    # Exact names only: urine creatinine is not serum creatinine.
    assert extract_observation_values(toon_encode(lab("Creatinine, Urine", 280))) == {}


def test_f9_narrative_observations_still_parse():
    obs = {"resourceType": "Observation", "id": "o2", "valueString": "Creatinine 1.8 mg/dL, eGFR 42 mL/min"}
    assert extract_observation_values(toon_encode(obs)) == {"creatinine": 1.8, "egfr": 42.0}


def test_f9_r4_encounters_parse_with_class_phase():
    from src.agent.graph.nodes import _parse_encounter_for_gantt

    enc = {"resourceType": "Encounter", "id": "e1",
           "type": [{"coding": [{"system": "http://snomed.info/sct", "code": "308335008",
                                 "display": "Patient encounter procedure"}]}],
           "class": {"code": "EMER", "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "display": "emergency"},
           "period": {"end": "2180-05-07T17:15:00-04:00", "start": "2180-05-06T22:23:00-04:00"},
           "status": "finished", "subject": {"reference": "Patient/p1"}}
    out = _parse_encounter_for_gantt(toon_encode(enc))
    assert out["timestamp"] == "2180-05-06T22:23:00-04:00"
    assert out["phase"] == "Emergency" and out["clinical_status"] == "Escalation"
    assert out["event"] == "Emergency encounter: Patient encounter procedure"


def test_viz_set_shape():
    items = read_jsonl(VIZ_SET)
    assert [x["id"] for x in items] == ["v1", "v2", "v3", "v4", "v5"]
    assert not {x["patient_id"] for x in items} & set(json.load(open(SPLITS_FILE))["dev"])
    from src.retrieval.query_understanding import IntentClassifier
    for x in items:
        assert IntentClassifier().classify(x["question"])[0].value == "visualization"
    by_id = {x["id"]: x["expected"] for x in items}
    assert by_id["v2"]["cardiac_points"] > 0 and by_id["v5"]["cardiac_points"] == 0


def test_phoenix_annotations_match_api_schema():
    score = {"id": "a1", "config": "full", "experiment": "E001", "block": "A", "correct_bench": 1,
             "correct_strict": 0, "recall@5": 0.5, "faithfulness": 0.9, "declined": True, "abstained_flag": True}
    anns = annotations_for(score, "abcd1234abcd1234")
    names = {a["name"] for a in anns}
    assert names == {"correct_bench", "correct_strict", "recall@5", "faithfulness", "declined"}
    for a in anns:
        assert {"span_id", "name", "annotator_kind"} <= set(a)          # required by POST /v1/span_annotations
        assert a["annotator_kind"] in {"LLM", "CODE", "HUMAN"}
        assert set(a["result"]) <= {"label", "score", "explanation"}
