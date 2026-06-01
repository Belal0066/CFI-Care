/**
 * Example unit test for backend data transformation.
 *
 * Demonstrates:
 *   - Async test support
 *   - taxonomy.attachJson for structured I/O evidence
 *   - Custom labels beyond the basics
 *   - Multiple assertions per test
 *
 * FIXME: Replace EXAMPLE_INPUT with real transformation logic.
 */
const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

const EXAMPLE_INPUT = { firstName: "Jane", lastName: "Doe" };
const EXAMPLE_OUTPUT = { fullName: "Jane Doe" };

describe("transformation example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, { [Label.LAYER]: Layer.UNIT, [Label.COMPONENT]: Component.BACKEND });
  });

  it("should merge first and last name", async () => {
    await allure.epic("Backend");
    await allure.feature("Data Transformation");
    await allure.story("Name Merging");

    taxonomy.attachJson(allure, "input", EXAMPLE_INPUT);

    const result = EXAMPLE_OUTPUT;

    taxonomy.attachJson(allure, "output", result);
    expect(result.fullName).toBe("Jane Doe");
  });
});
