from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest


CONFTEST_DIR = Path(__file__).resolve().parent
if str(CONFTEST_DIR) not in sys.path:
    sys.path.insert(0, str(CONFTEST_DIR))


MOCK_DIR = Path(__file__).resolve().parents[1] / "mock" / "responses"
RESULT_COMPLETED_PATH = MOCK_DIR / "result_completed.json"


@pytest.fixture(scope="module")
def mock_result() -> dict[str, Any]:
    with open(RESULT_COMPLETED_PATH) as f:
        return json.load(f)


@pytest.fixture(scope="module")
def ocr_text(mock_result: dict[str, Any]) -> str:
    ocr = mock_result.get("ocr_output", {})
    return ocr.get("extracted_text", "")


@pytest.fixture(scope="module")
def fhir_bundle(mock_result: dict[str, Any]) -> dict[str, Any]:
    return mock_result.get("fhir_bundle", {})


@pytest.fixture
def sample_ocr_text() -> str:
    return (
        "Mr. Saubhik Bhaumik   "
        "HEMOGLOBIN 15 g/dl   TOTAL LEUKOCYTE COUNT 5,100 cumm   "
        "NEUTROPHILS 79%   LYMPHOCYTE 18%   EOSINOPHILS 1%"
    )


@pytest.fixture
def sample_ocr_all_tokens_preserved() -> tuple[str, dict[str, Any]]:
    ocr = (
        "HEMOGLOBIN 15 g/dl   NEUTROPHILS 79%   "
        "LYMPHOCYTE 18%   EOSINOPHILS 1%"
    )
    bundle = {
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
    return ocr, bundle


@pytest.fixture
def sample_fhir_bundle() -> dict[str, Any]:
    return {
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


@pytest.fixture
def mapper_response_with_reasoning() -> dict[str, Any]:
    return {
        "model": "gemma-4-4b",
        "choices": [
            {
                "message": {
                    "content": "",
                    "reasoning_content": (
                        "The document is a lab report for Mr. Saubhik Bhaumik. "
                        "I need to extract the observations: Hemoglobin 15 g/dL, "
                        "Total Leukocyte Count 5,100 /cumm, Neutrophils 79%, "
                        "Lymphocyte 18%, Eosinophils 1%. "
                        "Now I will structure this as a FHIR R5 Bundle."
                    ),
                }
            }
        ],
    }


@pytest.fixture
def mapper_response_without_reasoning() -> dict[str, Any]:
    return {
        "model": "gemma-4-4b",
        "choices": [
            {
                "message": {
                    "content": '{"resourceType": "Bundle", ...}',
                    "reasoning_content": "",
                }
            }
        ],
    }


@pytest.fixture
def mapper_response_empty() -> dict[str, Any]:
    return {
        "model": "gemma-4-4b",
        "choices": [
            {
                "message": {
                    "content": "",
                    "reasoning_content": "",
                }
            }
        ],
    }
