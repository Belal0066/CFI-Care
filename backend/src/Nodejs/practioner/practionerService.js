const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch Practitioner by ID
async function getPractitionerById(practitionerId) {
  try {
    const response = await fhirApi.get(`/Practitioner/${practitionerId}`);
    return response.data; // Return raw data without transformation
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Practitioner not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}
module.exports = { getPractitionerById };
