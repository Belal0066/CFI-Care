const axios = require("axios");
const fhirpath = require("fhirpath");

const {
  transformPatient,
  transformObservation,
  transformEncounter,
} = require("../mappers/fhirMappers");

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
    const bundle = response.data;

    if (!bundle || bundle.resourceType !== "Bundle" || !bundle.entry) {
      return {};
    }

    let patientInfo = {};
    let simpleObservations = [];
    let simpleEncounters = [];

    for (const entry of bundle.entry) {
      const resource = entry.resource;

      switch (resource.resourceType) {
        case "Patient":
          patientInfo = transformPatient(resource);
          break;
        case "Observation":
          simpleObservations.push(transformObservation(resource));
          break;
        case "Encounter":
          simpleEncounters.push(transformEncounter(resource));
          break;
        default:
          break;
      }
    }

    return {
      patient: patientInfo,
      observations: simpleObservations,
      encounters: simpleEncounters,
    };
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient related data.");
  }
}

async function getPatientObservations(patientId) {
  try {
    const response = await fhirApi.get(`/Observation?patient=${patientId}`);
    const bundle = response.data;

    if (!bundle || bundle.resourceType !== "Bundle" || !bundle.entry) {
      return [];
    }

    const simpleObservations = bundle.entry.map((entry) =>
      transformObservation(entry.resource)
    );

    return simpleObservations;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient observations.");
  }
}

async function getPatientEncounters(patientId) {
  try {
    const response = await fhirApi.get(`/Encounter?patient=${patientId}`);
    const bundle = response.data;

    if (!bundle || bundle.resourceType !== "Bundle" || !bundle.entry) {
      return [];
    }

    const simpleEncounters = bundle.entry.map((entry) =>
      transformEncounter(entry.resource)
    );

    return simpleEncounters;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient encounters.");
  }
}

module.exports = {
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
};
