"""
Example: failing test.

Demonstrates:
  - A test that fails with an assertion error
  - Allure captures the failure trace automatically
  - The failure shows expected vs actual in the report
  - Useful for verifying that failure evidence is visible in Allure

FIXME: This assertion intentionally fails — replace with real logic.
"""
import allure
from taxonomy import apply_labels

EXAMPLE_PREDICTION = {"label": "benign", "confidence": 0.45}


@allure.feature("Image Classification")
@allure.story("Confidence Threshold")
def test_fail_example():
    apply_labels({"layer": "unit", "component": "ai"})

    with allure.step("Load classification result"):
        allure.attach(str(EXAMPLE_PREDICTION), "prediction", allure.attachment_type.TEXT)

    with allure.step("Assert confidence meets minimum threshold"):
        threshold = 0.8
        assert EXAMPLE_PREDICTION["confidence"] >= threshold, (
            f"Confidence {EXAMPLE_PREDICTION['confidence']} below threshold {threshold}"
        )
