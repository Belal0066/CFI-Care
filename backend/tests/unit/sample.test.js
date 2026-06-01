const allure = require("allure-js-commons");

describe("backend unit tests", () => {
  it("should bootstrap correctly", async () => {
    await allure.epic("Backend");
    await allure.feature("Smoke");
    await allure.story("Environment bootstrap");
    expect(true).toBe(true);
  });

  it("should run multiple tests", async () => {
    await allure.epic("Backend");
    await allure.feature("Smoke");
    await allure.story("Math sanity");
    expect(1 + 1).toBe(2);
  });
});
