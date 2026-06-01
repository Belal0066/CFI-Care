import allure


@allure.title("integration smoke test")
@allure.feature("Smoke")
@allure.story("Bootstrap")
def test_integration_bootstraps():
    assert True


@allure.title("integration environment check")
@allure.feature("Smoke")
@allure.story("Environment readiness")
def test_environments():
    assert True
