const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

describe("broken example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, { [Label.LAYER]: Layer.UNIT, [Label.COMPONENT]: Component.BACKEND });
  });

  it("should query FHIR server for Patient data", async () => {
    await allure.epic("Backend");
    await allure.feature("FHIR Client");
    await allure.story("Patient Query");

    taxonomy.attachJson(allure, "query", { resourceType: "Patient", id: "123" });

    throw new Error("FHIR server unavailable: connection refused at https://fhir.example.com/Patient/123");
  });
});
