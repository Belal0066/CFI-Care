/**
 * Example unit test for backend validation logic.
 *
 * Demonstrates:
 *   - taxonomy.applyLabels — consistent Allure labels
 *   - taxonomy.attachRequestResponse — request/response evidence
 *   - allure.epic / allure.feature / allure.story — behavior grouping
 *   - Jest assertions
 *
 * FIXME: Replace EXAMPLE_PAYLOAD with real validation logic.
 */
const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

const EXAMPLE_PAYLOAD = { resourceType: "Patient", name: "John Doe", birthDate: "1990-01-01" };

describe("validation example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, { [Label.LAYER]: Layer.UNIT, [Label.COMPONENT]: Component.BACKEND });
  });

  it("should validate a FHIR Patient resource", async () => {
    await allure.epic("Backend");
    await allure.feature("FHIR Validation");
    await allure.story("Patient Resource");

    taxonomy.attachRequestResponse(allure, { body: EXAMPLE_PAYLOAD }, {});

    expect(EXAMPLE_PAYLOAD.resourceType).toBe("Patient");
    expect(EXAMPLE_PAYLOAD.name).toBeTruthy();
  });
});
