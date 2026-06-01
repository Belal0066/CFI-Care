const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../../tests/allure-core/labels");
const taxonomy = require("../../../tests/allure-core/taxonomy");

const EXAMPLE_RESPONSE = { statusCode: 500, body: { error: "Internal Server Error" } };

describe("fail example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, { [Label.LAYER]: Layer.UNIT, [Label.COMPONENT]: Component.BACKEND });
  });

  it("should return 200 OK for a valid request", async () => {
    await allure.epic("Backend");
    await allure.feature("API Response Codes");
    await allure.story("Success Path");

    taxonomy.attachJson(allure, "response", EXAMPLE_RESPONSE);

    expect(EXAMPLE_RESPONSE.statusCode).toBe(200);
  });
});
