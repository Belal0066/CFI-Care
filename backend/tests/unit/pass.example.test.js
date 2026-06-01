const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

const EXAMPLE_PAYLOAD = { resourceType: "Patient", name: "John Doe", active: true };

describe("pass example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, { [Label.LAYER]: Layer.UNIT, [Label.COMPONENT]: Component.BACKEND });
  });

  it("should validate a Patient resource successfully", async () => {
    await allure.epic("Backend");
    await allure.feature("FHIR Validation");
    await allure.story("Patient Resource");

    taxonomy.attachRequestResponse(allure, { body: EXAMPLE_PAYLOAD }, {});

    expect(EXAMPLE_PAYLOAD.resourceType).toBe("Patient");
    expect(EXAMPLE_PAYLOAD.name).toBeTruthy();
    expect(EXAMPLE_PAYLOAD.active).toBe(true);
  });
});
