"""
Example: passing test.

Demonstrates:
  - A test that passes cleanly
  - allure.step for step-by-step breakdown
  - taxonomy.attach_json for structured evidence
  - taxonomy.apply_labels for consistent Allure labels

FIXME: Replace with real AI logic.
"""
import allure
from taxonomy import apply_labels, attach_json

EXAMPLE_INPUT = {"text": "Patient reports chest pain"}
EXAMPLE_OUTPUT = {"risk": "moderate", "actions": ["monitor", "ecg"]}


@allure.feature("Risk Assessment")
@allure.story("Chest Pain Triage")
def test_pass_example():
    apply_labels({"layer": "unit", "component": "ai"})

    with allure.step("Parse triage input"):
        attach_json("input", EXAMPLE_INPUT)

    with allure.step("Run risk assessment"):
        result = EXAMPLE_OUTPUT

    with allure.step("Verify risk output"):
        attach_json("output", result)
        assert result["risk"] in ("low", "moderate", "high")
