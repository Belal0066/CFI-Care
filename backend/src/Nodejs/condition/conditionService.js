const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch all conditions for a patient
async function getConditionsByPatientId(patientId) {
  try {
    const response = await fhirApi.get(
      `/Condition?subject=Patient/${patientId}`
    );
    const bundle = response.data;
    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient conditions.");
  }
}

// Fetch condition by ID
async function getConditionById(conditionId) {
  try {
    const response = await fhirApi.get(`/Condition/${conditionId}`);
    return response.data; // Return raw data without transformation
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Condition not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}
// Create condition with Specific ID
async function createConditionWithSpecificId(conditionData) {
  const conditionId = conditionData.id;
  if (!conditionId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation."
    );
  }
  const fhirConditionResource = {
    resourceType: "Condition",
    ...conditionData,
  };
  console.log(`Attempting to PUT condition to /Condition/${conditionId}`);
  try {
    const response = await fhirApi.put(
      `/Condition/${conditionId}`,
      fhirConditionResource
    );
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2)
      );
      const issueText = error.response.data.issue
        ? error.response.data.issue
            .map((i) => `${i.diagnostics || i.code}`)
            .join(", ")
        : error.response.statusText;
      throw new Error(`FHIR Validation Failed: ${issueText}`);
    } else {
      console.error("Network/Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}
module.exports = {
  getConditionById,
  getConditionsByPatientId,
  createConditionWithSpecificId,
};
