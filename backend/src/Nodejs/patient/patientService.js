const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});
// Fetch patient by ID
async function getPatientById(patientId) {
  try {
    const response = await fhirApi.get(`/Patient/${patientId}`);
    return response.data; // Return raw data without transformation
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}
// Create patient with specific ID
async function createPatientWithSpecificId(patientData, patientId) {
  const fhirPatientResource = {
    ...patientData, // Spread the incoming data
    resourceType: "Patient",
    id: patientId,
  };

  try {
    const response = await fhirApi.put(
      `/Patient/${patientId}`,
      fhirPatientResource
    );
    return response.data; // Return raw response (or transform if you want consistency)
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
// Create patient (Server assigns ID)
async function createPatient(patientData) {
  const fhirPatientResource = {
    ...patientData,
    resourceType: "Patient",
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
// Delete patient by ID
async function deletePatientById(patientId) {
  try {
    const response = await fhirApi.delete(`/Patient/${patientId}`);
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
// Read Patient data with specific version
async function getPatientByIdAndVersion(patientId, versionId) {
  try {
    const response = await fhirApi.get(
      `/Patient/${patientId}/_history/${versionId}`
    );
    return response.data; // Return raw data without transformation
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient or version not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}
// Get all related data for a patient
async function getPatientAllRelatedData(patientId) {
  try {
    const response = await fhirApi.get(`/Patient/${patientId}/$everything`);
    const bundle = response.data;
    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient related data.");
  }
}
// Fetch the resource change history for all resources of patient
async function getPatientHistory(patientId) {
  try {
    const response = await fhirApi.get(`/Patient/${patientId}/_history`);
    // History returns a Bundle, so we might want to map entries or return raw
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
// Fetch all observations for a patient
async function getPatientObservations(patientId) {
  try {
    const response = await fhirApi.get(`/Observation?patient=${patientId}`);
    const bundle = response.data;

    // Return raw resources or map them if you have an observation mapper
    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient observations.");
  }
}
// Fetch all encounters for a patient
async function getPatientEncounters(patientId) {
  try {
    const response = await fhirApi.get(`/Encounter?patient=${patientId}`);
    const bundle = response.data;

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient encounters.");
  }
}

module.exports = {
  deletePatientById,
  getPatientByIdAndVersion,
  getPatientHistory,
  createPatientWithSpecificId,
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
};
