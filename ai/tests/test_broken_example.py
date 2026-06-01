"""
Example: broken test.

Demonstrates:
  - A test that raises an unhandled exception
  - Shown as "broken" in Allure (distinct from "failed")
  - The exception traceback is captured in the report
  - Useful for simulating infrastructure or dependency errors

FIXME: This test intentionally raises — replace with real error handling.
"""
import allure
from taxonomy import apply_labels


@allure.feature("Model Inference")
@allure.story("Model Loading")
def test_broken_example():
    apply_labels({"layer": "unit", "component": "ai", "dependency": "openai"})

    with allure.step("Load model weights"):
        raise RuntimeError("Model weights not found at /models/v3/weights.h5")
