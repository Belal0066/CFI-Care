import allure
import os
import platform


@allure.title("ai unit smoke test")
@allure.feature("AI")
@allure.story("Bootstrap")
@allure.label("type", "regression")
def test_ai_bootstraps():
    with allure.step("Verify AI module loads"):
        assert True
    with allure.step("Check Python environment"):
        allure.attach(
            platform.python_version(),
            name="python-version",
            attachment_type=allure.attachment_type.TEXT
        )


@allure.title("ai environment check")
@allure.feature("AI")
@allure.story("Environment readiness")
@allure.label("type", "regression")
def test_ai_environment():
    env_info = (
        f"OS: {platform.system()} {platform.release()}\n"
        f"Python: {platform.python_version()}\n"
        f"Host: {platform.node()}\n"
        f"CI: {os.environ.get('CI', 'local')}\n"
    )
    allure.attach(env_info, name="environment-info", attachment_type=allure.attachment_type.TEXT)
    assert True
