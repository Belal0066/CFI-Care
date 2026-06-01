import allure
import json
import os
import traceback

import pytest
import sys

# Make tests/allure-core available for imports
_core_dir = os.path.join(os.getcwd(), "..", "tests", "allure-core")
if _core_dir not in sys.path:
    sys.path.insert(0, _core_dir)
try:
    from taxonomy import apply_labels, set_history_id, attach_json
except Exception:
    # fallback: functions are best-effort
    apply_labels = None
    set_history_id = None
    attach_json = None


PRECOMPUTED_STABILITY = {}
_precomputed_path = os.path.join(os.getcwd(), "allure-results", "precomputed-stability.json")
if os.path.exists(_precomputed_path):
    with open(_precomputed_path) as f:
        PRECOMPUTED_STABILITY = json.load(f)


@pytest.fixture(autouse=True)
def allure_base_labels():
    # Base taxonomy labels for unit tests in AI
    if apply_labels:
        apply_labels({"layer": "unit", "component": "ai"})
    else:
        allure.dynamic.label("layer", "unit")
        allure.dynamic.label("component", "ai")
    # Attach RunID to each test case for traceability
    _run_id_file = os.path.join(os.getcwd(), "allure-results", "run.properties")
    if os.path.exists(_run_id_file):
        with open(_run_id_file) as f:
            allure.dynamic.label("RunID", f.read().strip())
    yield


@pytest.fixture
def attach_artifact():
    """Helper fixture tests can call to attach JSON/text artifacts to Allure."""
    def _attach(name, data, kind="json"):
        try:
            if kind == "json":
                allure.attach(json.dumps(data, indent=2), name, allure.attachment_type.JSON)
            else:
                allure.attach(str(data), name, allure.attachment_type.TEXT)
        except Exception:
            # Best-effort attach; do not fail tests if attachment fails
            allure.attach(str(data), name, allure.attachment_type.TEXT)

    return _attach


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
            current_status = "passed" if getattr(rep, "passed", False) else "failed"
            if current_status == prev_status:
                stability = "stable"
            elif prev_status == "passed" and current_status != "passed":
                stability = "regressed"
            elif current_status == "passed" and prev_status != "passed":
                stability = "fixed"
            else:
                stability = "flaky"

        # Apply stability and richer metadata labels
        try:
            if apply_labels:
                apply_labels({"stability": stability, "testID": item.nodeid, "historyId": item.nodeid})
            else:
                allure.dynamic.label("stability", stability)
                allure.dynamic.label("testID", item.nodeid)
                allure.dynamic.label("historyId", item.nodeid)
        except Exception:
            pass

        # Attach failure trace when present to help reproduce issues
        try:
            if rep.failed:
                longrepr = getattr(rep, "longrepr", None)
                if longrepr:
                    if attach_json:
                        try:
                            attach_json("failure_trace", str(longrepr))
                        except Exception:
                            allure.attach(str(longrepr), "failure_trace", allure.attachment_type.TEXT)
                    else:
                        allure.attach(str(longrepr), "failure_trace", allure.attachment_type.TEXT)
        except Exception:
            pass
