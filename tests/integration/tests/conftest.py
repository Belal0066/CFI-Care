import allure
import json
import os

import pytest


PRECOMPUTED_STABILITY = {}
_precomputed_path = os.path.join(os.getcwd(), "allure-results", "precomputed-stability.json")
if os.path.exists(_precomputed_path):
    with open(_precomputed_path) as f:
        PRECOMPUTED_STABILITY = json.load(f)


@pytest.fixture(autouse=True)
def allure_integration_labels():
    allure.dynamic.label("layer", "integration")
    allure.dynamic.label("component", "integration")
    yield


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    if call.when == "call":
        rep = outcome.get_result()
        test_name = item.name
        prev_status = PRECOMPUTED_STABILITY.get(test_name)
        if prev_status is None:
            stability = "new"
        else:
            current_status = "passed" if rep.passed else "failed"
            if current_status == prev_status:
                stability = "stable"
            elif prev_status == "passed" and current_status != "passed":
                stability = "regressed"
            elif current_status == "passed" and prev_status != "passed":
                stability = "fixed"
            else:
                stability = "flaky"
        allure.dynamic.label("stability", stability)
