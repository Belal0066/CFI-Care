from __future__ import annotations

from typing import Any

import pytest

from quality_metrics import (
    compute_metrics,
    extract_all_tokens,
    extract_fhir_bundle,
    extract_numerics,
    extract_ocr_text,
    extract_text_tokens,
    extract_units,
    flatten_fhir_bundle,
)


class TestTokenExtraction:
    def test_extract_numerics_integers(self):
        tokens = extract_numerics("HEMOGLOBIN 15 g/dl  NEUTROPHILS 79%")
        assert "15" in tokens
        assert "79" in tokens

    def test_extract_numerics_comma_separated(self):
        tokens = extract_numerics("TOTAL LEUKOCYTE COUNT 5,100 cumm")
        assert "5,100" in tokens

    def test_extract_numerics_floats(self):
        tokens = extract_numerics("value 12.5  reference range 4.0 - 10.5")
        assert "12.5" in tokens
        assert "4.0" in tokens
        assert "10.5" in tokens

    def test_extract_numerics_reference_ranges(self):
        tokens = extract_numerics("13 - 17  4,800 - 10,800")
        assert "13" in tokens
        assert "17" in tokens
        assert "4,800" in tokens
        assert "10,800" in tokens

    def test_extract_numerics_empty(self):
        assert extract_numerics("") == set()
        assert extract_numerics("no numbers here") == set()

    def test_extract_units_known(self):
        tokens = extract_units("15 g/dl  5,100 cumm  79%")
        assert "g/dl" in tokens or "g/dL" in tokens
        assert any("cumm" in u.lower() for u in tokens)
        assert "%" in tokens

    def test_extract_units_empty(self):
        assert extract_units("") == set()

    def test_extract_text_tokens(self):
        tokens = extract_text_tokens("HEMOGLOBIN 15 g/dl  TOTAL LEUKOCYTE COUNT")
        assert "HEMOGLOBIN" in tokens
        assert "TOTAL" in tokens
        assert "LEUKOCYTE" in tokens
        assert "COUNT" in tokens

    def test_extract_text_tokens_short_words_excluded(self):
        tokens = extract_text_tokens("a be cat dog")
        assert "CAT" in tokens
        assert "DOG" in tokens
        assert "A" not in tokens
        assert "BE" not in tokens

    def test_extract_text_tokens_empty(self):
        assert extract_text_tokens("") == set()

    def test_extract_all_tokens_structure(self):
        all_tokens = extract_all_tokens("HEMOGLOBIN 15 g/dl")
        assert "numerics" in all_tokens
        assert "units" in all_tokens
        assert "text_tokens" in all_tokens
        assert "15" in all_tokens["numerics"]
        assert "HEMOGLOBIN" in all_tokens["text_tokens"]


class TestFhirFlattening:
    def test_flatten_extracts_strings(self):
        bundle = {"resourceType": "Bundle", "code": {"text": "HEMOGLOBIN"}}
        flat = flatten_fhir_bundle(bundle)
        assert "HEMOGLOBIN" in flat.upper()

    def test_flatten_skips_base64(self):
        bundle = {
            "data": (
                "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL1hPYmplY3QvU3VidHlwZS9JbWFnZS9XaWR0aCAyMjE2"
                "L0hlaWdodCAzMTA5L0JpdHNQZXJDb21wb25lbnQgOC9Db2xvclNwYWNlL0RldmljZVJHQi9MZW5ndGggMTAw"
            ),
            "text": "HEMOGLOBIN",
        }
        flat = flatten_fhir_bundle(bundle)
        assert "HEMOGLOBIN" in flat.upper()
        assert "JVBERi0xLjQ" not in flat

    def test_flatten_skips_uuids(self):
        bundle = {
            "id": "ca6df1ee-ed44-57cc-a84e-69d5d2dd1473",
            "fullUrl": "urn:uuid:e99fbf5f-0019-569a-9ba9-eae6f9ee0761",
            "text": "HEMOGLOBIN",
        }
        flat = flatten_fhir_bundle(bundle)
        assert "HEMOGLOBIN" in flat.upper()
        assert "ca6df1ee-ed44-57cc-a84e-69d5d2dd1473" not in flat

    def test_flatten_nested(self):
        bundle = {
            "entry": [
                {"resource": {"name": [{"text": "Saubhik"}]}},
                {"resource": {"code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15.0, "unit": "g/dl"}}},
            ]
        }
        flat = flatten_fhir_bundle(bundle)
        assert "Saubhik" in flat
        assert "HEMOGLOBIN" in flat.upper()
        assert "15" in flat or "15.0" in flat

    def test_flatten_empty_bundle(self):
        assert flatten_fhir_bundle({}) == ""

    def test_flatten_includes_numerics_as_str(self):
        bundle = {"value": 15.0, "unit": "g/dl"}
        flat = flatten_fhir_bundle(bundle)
        assert "15" in flat or "15.0" in flat


class TestReconciliationMetrics:
    SAMPLE_RECALL_THRESHOLD = 0.70
    SAMPLE_F1_THRESHOLD = 0.80

    def test_reconciliation_with_mock_data_demonstrates_method(self, mock_result):
        ocr_text = extract_ocr_text(mock_result)
        fhir_bundle = extract_fhir_bundle(mock_result)
        metrics = compute_metrics(ocr_text, fhir_bundle)
        assert "precision" in metrics
        assert "recall" in metrics
        assert "f1" in metrics
        assert metrics["true_positives"] >= 15

    def test_reconciliation_with_sample_data(self, sample_ocr_text, sample_fhir_bundle):
        metrics = compute_metrics(sample_ocr_text, sample_fhir_bundle)
        assert metrics["recall"] >= self.SAMPLE_RECALL_THRESHOLD
        assert metrics["f1"] >= self.SAMPLE_F1_THRESHOLD

    def test_reconciliation_all_tokens_preserved(self, sample_ocr_all_tokens_preserved):
        ocr_text, fhir_bundle = sample_ocr_all_tokens_preserved
        metrics = compute_metrics(ocr_text, fhir_bundle)
        assert metrics["recall"] >= 0.90
        assert metrics["precision"] >= 0.90
        assert metrics["f1"] >= 0.90

    def test_metrics_with_empty_ocr(self, sample_fhir_bundle):
        metrics = compute_metrics("", sample_fhir_bundle)
        assert metrics["precision"] == 0.0
        assert metrics["recall"] == 0.0
        assert metrics["f1"] == 0.0

    def test_metrics_with_empty_fhir(self, sample_ocr_text):
        metrics = compute_metrics(sample_ocr_text, {})
        assert metrics["precision"] == 0.0
        assert metrics["recall"] == 0.0
        assert metrics["f1"] == 0.0

    def test_metrics_total_match(self):
        ocr = "HEMOGLOBIN 15 g/dl  NEUTROPHILS 79%"
        bundle = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15, "unit": "g/dl"}}},
                {"resource": {"resourceType": "Observation", "code": {"text": "NEUTROPHILS"}, "valueQuantity": {"value": 79, "unit": "%"}}},
            ]
        }
        metrics = compute_metrics(ocr, bundle)
        assert metrics["recall"] == 1.0
        assert metrics["precision"] == 1.0
        assert metrics["f1"] == 1.0

    def test_metrics_partial_match(self):
        ocr = "HEMOGLOBIN 15 g/dl  NEUTROPHILS 79%  EXTRA_TOKEN"
        bundle = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15, "unit": "g/dl"}}},
            ]
        }
        metrics = compute_metrics(ocr, bundle)
        assert metrics["recall"] < 1.0
        assert metrics["precision"] == 1.0
        assert metrics["f1"] < 1.0

    def test_metrics_hallucination(self):
        ocr = "HEMOGLOBIN 15 g/dl"
        bundle = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15, "unit": "g/dl"}}},
                {"resource": {"resourceType": "Observation", "code": {"text": "HALLUCINATED"}, "valueQuantity": {"value": 999, "unit": "mg"}}},
            ]
        }
        metrics = compute_metrics(ocr, bundle)
        assert metrics["precision"] < 1.0
        assert metrics["recall"] == 1.0

    def test_metrics_reproducible(self, mock_result):
        ocr_text = extract_ocr_text(mock_result)
        fhir_bundle = extract_fhir_bundle(mock_result)
        m1 = compute_metrics(ocr_text, fhir_bundle)
        m2 = compute_metrics(ocr_text, fhir_bundle)
        assert m1 == m2

    def test_true_positive_count(self, sample_ocr_text, sample_fhir_bundle):
        metrics = compute_metrics(sample_ocr_text, sample_fhir_bundle)
        assert metrics["true_positives"] > 0
        assert metrics["false_positives"] >= 0
        assert metrics["false_negatives"] >= 0

    def test_metrics_dict_structure(self, sample_ocr_text, sample_fhir_bundle):
        metrics = compute_metrics(sample_ocr_text, sample_fhir_bundle)
        expected_keys = {"precision", "recall", "f1", "true_positives", "false_positives", "false_negatives"}
        assert expected_keys.issubset(metrics.keys())


class TestEndToEnd:
    def test_full_pipeline_from_mock(self, mock_result):
        ocr_text = extract_ocr_text(mock_result)
        assert len(ocr_text) > 0, "OCR text should not be empty"
        fhir_bundle = extract_fhir_bundle(mock_result)
        assert fhir_bundle.get("resourceType") == "Bundle"
        metrics = compute_metrics(ocr_text, fhir_bundle)
        assert "precision" in metrics
        assert "recall" in metrics
        assert "f1" in metrics
        assert metrics["true_positives"] >= 15

    def test_real_world_tokens_survive(self, mock_result):
        ocr_text = extract_ocr_text(mock_result)
        tokens = extract_all_tokens(ocr_text)
        critical_tokens = {
            "HEMOGLOBIN", "LEUKOCYTE", "NEUTROPHILS",
            "LYMPHOCYTE", "EOSINOPHILS", "BHAUMIK",
        }
        found = critical_tokens & tokens["text_tokens"]
        assert len(found) >= 4, f"Only found {found} of critical tokens"

    def test_clean_pipeline_good_quality(self, sample_ocr_all_tokens_preserved):
        ocr_text, fhir_bundle = sample_ocr_all_tokens_preserved
        metrics = compute_metrics(ocr_text, fhir_bundle)
        assert metrics["recall"] >= 0.90
        assert metrics["precision"] >= 0.90
        assert metrics["f1"] >= 0.90
