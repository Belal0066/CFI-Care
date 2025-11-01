const axios = require("axios");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
});

async function createPatient(patientData) {
  const fhirPatientResource = {
    resourceType: "Patient",
    name: [
      {
        use: "official",
        family: patientData.lastName,
        given: [patientData.firstName],
      },
    ],
    telecom: [
      {
        system: "email",
        value: patientData.email,
        use: "home",
      },
    ],
    birthDate: patientData.birthDate,
  };

  try {
    const response = await fhirApi.post("/Patient", fhirPatientResource);

    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.error(
        "HAPI FHIR Validation Error:",
        JSON.stringify(error.response.data, null, 2)
      );
      throw new Error("FHIR server rejected the patient resource. Check data.");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

async function getPatientById(patientId) {
  try {
    const response = await fhirApi.get(`/Patient/${patientId}`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

async function getPatientAllRelatedData(patientId) {
  try {
    const response = await fhirApi.get(`/Patient/${patientId}/$everything`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

module.exports = {
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
};
