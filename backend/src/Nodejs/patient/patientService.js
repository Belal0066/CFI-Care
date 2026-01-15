const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});
// Fetch patient by ID
async function getPatientById(patientId, accessToken) {
  try {
    const config = {};
    if (accessToken) {
      config.headers = {
        Authorization: `Bearer ${accessToken}`,
      };
    }
    const response = await fhirApi.get(`/Patient/${patientId}`, config);
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
// Create patient with Specific ID
async function createPatientWithSpecificId(patientData) {
  const patientId = patientData.id;

  if (!patientId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation."
    );
  }
  const fhirPatientResource = {
    resourceType: "Patient",
    ...patientData,
  };

  console.log(`Attempting to PUT patient to /Patient/${patientId}`);

  try {
    const response = await fhirApi.put(
      `/Patient/${patientId}`,
      fhirPatientResource
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

// Create patient (Server assigns ID)
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

// Fetch all patients
// If practitionerId is provided, filter by generalPractitioner
async function getAllPatients(practitionerId = null) {
  try {
    let url = "/Patient?_count=100&_sort=-_lastUpdated";

    // If a practitioner ID is provided, filter patients by their general practitioner
    if (practitionerId) {
      url = `/Patient?general-practitioner=Practitioner/${practitionerId}&_count=100&_sort=-_lastUpdated`;
    }

    const response = await fhirApi.get(url);
    const bundle = response.data;

    // Transform FHIR Bundle to PatientSummaryDTO format for frontend
    if (!bundle.entry || bundle.entry.length === 0) {
      return [];
    }

    return bundle.entry.map((entry) => {
      const patient = entry.resource;
      const name = patient.name?.[0];
      const fullName = name
        ? `${name.given?.join(" ") || ""} ${name.family || ""}`.trim()
        : "Unknown";

      // Calculate age from birthDate
      let age = null;
      if (patient.birthDate) {
        const birthDate = new Date(patient.birthDate);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDate.getDate())
        ) {
          age--;
        }
      }

      return {
        id: patient.id,
        name: fullName,
        age: age,
        lastUpdated: patient.meta?.lastUpdated || new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patients list.");
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
  getAllPatients,
};
