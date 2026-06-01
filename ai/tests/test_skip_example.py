"""
Example: skipped test.

Demonstrates:
  - A test skipped via @pytest.mark.skip
  - Skipped tests appear in Allure with a distinct status
  - Useful for documenting known gaps or disabled scenarios

FIXME: Remove skip marker once the feature is implemented.
"""
import allure
import pytest
from taxonomy import apply_labels


@pytest.mark.skip(reason="NLP service not deployed yet — enable when endpoint is available")
@allure.feature("Natural Language Processing")
@allure.story("Sentiment Analysis")
def test_skip_example():
    apply_labels({"layer": "unit", "component": "ai", "dependency": "openai"})

    with allure.step("Send text for sentiment analysis"):
        pass

    with allure.step("Validate sentiment score range"):
        pass
