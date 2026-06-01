const fs = require("fs");
const path = require("path");
const allure = require("allure-js-commons");
const { Label, Layer, Component, Stability } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

const precomputedPath = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "tests",
  "allure-results",
  "precomputed-stability.json"
);

const precomputedStability = (() => {
  try {
    return JSON.parse(fs.readFileSync(precomputedPath, "utf-8"));
  } catch (e) {
    return {};
  }
})();

beforeEach(async () => {
  const testName = expect.getState().currentTestName || "unknown";
  taxonomy.applyLabels(allure, {
    [Label.LAYER]: Layer.UNIT,
    [Label.COMPONENT]: Component.BACKEND,
    testID: testName,
    historyId: testName,
    RunID: taxonomy.getRunId()
  });

  if (precomputedStability[testName] === undefined) {
    taxonomy.applyLabels(allure, { [Label.STABILITY]: Stability.NEW });
  } else {
    taxonomy.applyLabels(allure, { [Label.STABILITY]: precomputedStability[testName] });
  }
});
