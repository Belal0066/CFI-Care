const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const { attachJson } = require("../../../tests/allure-core/attachments");
const fs = require("fs");
const path = require("path");

const precomputedStability = (() => {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, "../../../tests/allure-results/precomputed-stability.json"),
        "utf-8"
      )
    );
  } catch {
    return {};
  }
})();

describe("backend unit tests", () => {
  beforeEach(async () => {
    await allure.label(Label.LAYER, Layer.UNIT);
    await allure.label(Label.COMPONENT, Component.BACKEND);
  });

  afterEach(async () => {
    const testName = expect.getState().currentTestName;
    if (precomputedStability[testName] === undefined) {
      await allure.label(Label.STABILITY, "new");
    }
  });

  it("should bootstrap correctly", async () => {
    await allure.epic("Backend");
    await allure.feature("Smoke");
    await allure.story("Environment bootstrap");
    attachJson(allure, "test-metadata", {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      timestamp: new Date().toISOString()
    });
    expect(true).toBe(true);
  });

  it("should run multiple tests", async () => {
    await allure.epic("Backend");
    await allure.feature("Smoke");
    await allure.story("Math sanity");
    attachJson(allure, "test-metadata", {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      timestamp: new Date().toISOString()
    });
    expect(1 + 1).toBe(2);
  });
});
