from __future__ import annotations

from typing import Any

import pytest

from quality_metrics import (
    check_reasoning_content,
    compute_metrics,
    extract_fhir_bundle,
    extract_ocr_text,
)


class TestReasoningContent:
    def test_reasoning_content_populated(self, mapper_response_with_reasoning):
        msg = mapper_response_with_reasoning["choices"][0]["message"]
        reasoning = msg.get("reasoning_content", "")
        raw_response = msg.get("content", "") if msg.get("content", "").strip() else reasoning
        result = check_reasoning_content(raw_response)
        assert result["has_reasoning_content"] is True
        assert result["reasoning_length"] > 0

    def test_reasoning_content_fallback_when_content_empty(self, mapper_response_with_reasoning):
        msg = mapper_response_with_reasoning["choices"][0]["message"]
        raw_content = msg.get("content", "")
        reasoning_content = msg.get("reasoning_content", "")
        raw_response = raw_content if raw_content.strip() else reasoning_content
        assert raw_content.strip() == ""
        assert reasoning_content.strip() != ""
        assert raw_response == reasoning_content

    def test_reasoning_content_not_needed_when_content_present(self, mapper_response_without_reasoning):
        msg = mapper_response_without_reasoning["choices"][0]["message"]
        raw_content = msg.get("content", "")
        reasoning_content = msg.get("reasoning_content", "")
        raw_response = raw_content if raw_content.strip() else reasoning_content
        assert raw_content.strip() != ""
        assert reasoning_content.strip() == ""
        assert raw_response == raw_content

    def test_reasoning_content_empty_response(self, mapper_response_empty):
        msg = mapper_response_empty["choices"][0]["message"]
        raw_content = msg.get("content", "")
        reasoning_content = msg.get("reasoning_content", "")
        raw_response = raw_content if raw_content.strip() else reasoning_content
        result = check_reasoning_content(raw_response)
        assert result["has_reasoning_content"] is False
        assert result["reasoning_length"] == 0

    def test_reasoning_content_contains_clinical_reasoning(self, mapper_response_with_reasoning):
        msg = mapper_response_with_reasoning["choices"][0]["message"]
        reasoning = msg.get("reasoning_content", "")
        clinical_terms = ["HEMOGLOBIN", "FHIR", "BUNDLE"]
        lower = reasoning.upper()
        assert any(term in lower for term in clinical_terms)


class TestPrecisionRecallF1:
    def test_precision_recall_f1_with_mock_data(self, mock_result):
        ocr_text = extract_ocr_text(mock_result)
        fhir_bundle = extract_fhir_bundle(mock_result)
        metrics = compute_metrics(ocr_text, fhir_bundle)
        assert metrics["precision"] >= 0.80
        assert metrics["recall"] >= 0.0
        assert metrics["f1"] >= 0.0
        assert metrics["true_positives"] >= 15
        assert isinstance(metrics["precision"], float)
        assert isinstance(metrics["recall"], float)
        assert isinstance(metrics["f1"], float)

    def test_precision_high_with_good_match(self, sample_ocr_all_tokens_preserved):
        ocr_text, fhir_bundle = sample_ocr_all_tokens_preserved
        metrics = compute_metrics(ocr_text, fhir_bundle)
        assert metrics["precision"] >= 0.90

    def test_recall_drops_with_missing_data(self, sample_ocr_text):
        partial_bundle = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15, "unit": "g/dl"}}},
            ]
        }
        metrics = compute_metrics(sample_ocr_text, partial_bundle)
        assert metrics["recall"] < 1.0
        assert metrics["true_positives"] > 0
        assert metrics["false_negatives"] > 0

    def test_precision_drops_with_hallucinated_data(self, sample_ocr_text):
        bundle_with_hallucination = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15, "unit": "g/dl"}}},
                {"resource": {"resourceType": "Observation", "code": {"text": "HALLUCINATED"}, "valueQuantity": {"value": 999, "unit": "none"}}},
            ]
        }
        metrics = compute_metrics(sample_ocr_text, bundle_with_hallucination)
        assert metrics["precision"] < 1.0
        assert metrics["false_positives"] > 0

    def test_f1_penalizes_both_errors(self):
        ocr = "HEMOGLOBIN 15 g/dl  NEUTROPHILS 79%  LYMPHOCYTE 18%"
        bundle = {
            "resourceType": "Bundle",
            "entry": [
                {"resource": {"resourceType": "Observation", "code": {"text": "HEMOGLOBIN"}, "valueQuantity": {"value": 15, "unit": "g/dl"}}},
                {"resource": {"resourceType": "Observation", "code": {"text": "HALLUCINATED"}, "valueQuantity": {"value": 999, "unit": "mg"}}},
            ]
        }
        metrics = compute_metrics(ocr, bundle)
        assert metrics["f1"] < 1.0
        assert metrics["f1"] > 0.0

    def test_metrics_are_floats(self, sample_ocr_text, sample_fhir_bundle):
        metrics = compute_metrics(sample_ocr_text, sample_fhir_bundle)
        assert isinstance(metrics["precision"], float)
        assert isinstance(metrics["recall"], float)
        assert isinstance(metrics["f1"], float)

    def test_metrics_bounded_01(self, sample_ocr_text, sample_fhir_bundle):
        metrics = compute_metrics(sample_ocr_text, sample_fhir_bundle)
        for key in ("precision", "recall", "f1"):
            assert 0.0 <= metrics[key] <= 1.0, f"{key}={metrics[key]} out of [0,1]"


class TestCombinedQuality:
    def test_quality_evaluation_both_stages(self, sample_ocr_all_tokens_preserved, mapper_response_with_reasoning):
        ocr_text, fhir_bundle = sample_ocr_all_tokens_preserved
        reconciliation_metrics = compute_metrics(ocr_text, fhir_bundle)
        msg = mapper_response_with_reasoning["choices"][0]["message"]
        reasoning_content = msg.get("reasoning_content", "")
        assert reconciliation_metrics["recall"] >= 0.90
        assert reconciliation_metrics["f1"] >= 0.90
        assert len(reasoning_content.strip()) > 0

    def test_quality_report_format(self, sample_ocr_all_tokens_preserved, mapper_response_with_reasoning):
        ocr_text, fhir_bundle = sample_ocr_all_tokens_preserved
        metrics = compute_metrics(ocr_text, fhir_bundle)
        msg = mapper_response_with_reasoning["choices"][0]["message"]
        reasoning = msg.get("reasoning_content", "")
        report = {
            "reconciliation": metrics,
            "reasoning": {
                "populated": bool(reasoning.strip()),
                "length": len(reasoning.strip()),
            },
        }
        assert "reconciliation" in report
        assert "reasoning" in report
        assert report["reasoning"]["populated"] is True
        assert report["reconciliation"]["f1"] >= 0.90
