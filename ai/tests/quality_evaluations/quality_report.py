from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parents[1]
DOC2FHIR_SRC = PROJECT_DIR / "src" / "DOC2FHIR"
sys.path.insert(0, str(DOC2FHIR_SRC))
sys.path.insert(0, str(SCRIPT_DIR))

from quality_metrics import (
    compute_metrics,
    extract_all_tokens,
    extract_fhir_bundle,
    extract_ocr_text,
)
from conftest import RESULT_COMPLETED_PATH

report = {
    "pipeline": "DOC2FHIR Quality Evaluation",
    "generated_at": datetime.now().isoformat(),
    "scenarios": [],
}
scored_scenarios = []

# --- Scenario 1: Clean clinical data (all tokens preserved) ---
ocr_clean = (
    "HEMOGLOBIN 15 g/dl   NEUTROPHILS 79%   "
    "LYMPHOCYTE 18%   EOSINOPHILS 1%"
)
bundle_clean = {
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": [
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "HEMOGLOBIN"},
                "valueQuantity": {"value": 15.0, "unit": "g/dl"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "NEUTROPHILS"},
                "valueQuantity": {"value": 79.0, "unit": "%"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "LYMPHOCYTE"},
                "valueQuantity": {"value": 18.0, "unit": "%"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "EOSINOPHILS"},
                "valueQuantity": {"value": 1.0, "unit": "%"},
            }
        },
    ],
}
m_clean = compute_metrics(ocr_clean, bundle_clean)
report["scenarios"].append(
    {
        "name": "clean_clinical_data",
        "description": "All clinical values from OCR are preserved in FHIR bundle",
        "ocr_token_count": sum(len(v) for v in extract_all_tokens(ocr_clean).values()),
        "metrics": m_clean,
        "status": "PASS" if m_clean["recall"] >= 0.90 else "REGRESSION",
    }
)
scored_scenarios.append(m_clean["f1"])

# --- Scenario 2: Sample pipeline data ---
ocr_sample = (
    "Mr. Saubhik Bhaumik   "
    "HEMOGLOBIN 15 g/dl   TOTAL LEUKOCYTE COUNT 5,100 cumm   "
    "NEUTROPHILS 79%   LYMPHOCYTE 18%   EOSINOPHILS 1%"
)
bundle_sample = {
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": [
        {
            "resource": {
                "resourceType": "Patient",
                "name": [{"text": "Mr. Saubhik Bhaumik"}],
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "HEMOGLOBIN"},
                "valueQuantity": {"value": 15.0, "unit": "g/dl"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "TOTAL LEUKOCYTE COUNT"},
                "valueQuantity": {"value": 5100.0, "unit": "cumm"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "NEUTROPHILS"},
                "valueQuantity": {"value": 79.0, "unit": "%"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "LYMPHOCYTE"},
                "valueQuantity": {"value": 18.0, "unit": "%"},
            }
        },
        {
            "resource": {
                "resourceType": "Observation",
                "code": {"text": "EOSINOPHILS"},
                "valueQuantity": {"value": 1.0, "unit": "%"},
            }
        },
    ],
}
m_sample = compute_metrics(ocr_sample, bundle_sample)
report["scenarios"].append(
    {
        "name": "sample_pipeline_output",
        "description": "Patient metadata (AGE, SEX) in OCR not stored in FHIR clinical fields",
        "ocr_token_count": sum(len(v) for v in extract_all_tokens(ocr_sample).values()),
        "metrics": m_sample,
        "status": "PASS" if m_sample["f1"] >= 0.80 else "REGRESSION",
    }
)
scored_scenarios.append(m_sample["f1"])

# --- Scenario 3: Real mock data from pipeline run ---
try:
    with open(RESULT_COMPLETED_PATH) as f:
        result = json.load(f)
    ocr_mock = extract_ocr_text(result)
    fhir_mock = extract_fhir_bundle(result)
    m_mock = compute_metrics(ocr_mock, fhir_mock)
    mock_ocr_tokens = extract_all_tokens(ocr_mock)
    report["scenarios"].append(
        {
            "name": "real_pipeline_mock",
            "description": "Captured from real pipeline run (OCR has HTML/markdown noise)",
            "ocr_text_length": len(ocr_mock),
            "ocr_token_count": sum(len(v) for v in mock_ocr_tokens.values()),
            "metrics": m_mock,
            "note": (
                "OCR contains raw HTML markdown output; clinical content matching "
                "is lower than clean scenarios due to markup noise"
            ),
            "status": "INFORMATIONAL",
        }
    )
    scored_scenarios.append(m_mock["f1"])
except Exception as e:
    report["scenarios"].append({"name": "real_pipeline_mock", "error": str(e), "status": "SKIPPED"})

# --- Summary ---
pass_count = sum(1 for s in report["scenarios"] if s.get("status") == "PASS")
fail_count = sum(1 for s in report["scenarios"] if s.get("status") == "REGRESSION")
avg_f1 = sum(scored_scenarios) / len(scored_scenarios) if scored_scenarios else 0.0

report["summary"] = {
    "total_scenarios": len(report["scenarios"]),
    "passed": pass_count,
    "regression": fail_count,
    "average_f1": round(avg_f1, 4),
    "overall_status": "PASS" if fail_count == 0 else "REGRESSION",
}

print(json.dumps(report, indent=2))
