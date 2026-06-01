const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

describe("skip example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, { [Label.LAYER]: Layer.UNIT, [Label.COMPONENT]: Component.BACKEND });
  });

  test.skip("should validate FHIR AllergyIntolerance resource", async () => {
    await allure.epic("Backend");
    await allure.feature("FHIR Validation");
    await allure.story("AllergyIntolerance Resource");

    taxonomy.attachRequestResponse(allure, {
      body: { resourceType: "AllergyIntolerance", patient: { reference: "Patient/123" }, code: { text: "Peanut" } }
    }, {});

    expect(true).toBe(true);
  });
});
