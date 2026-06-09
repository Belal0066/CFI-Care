const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const {
  getFromCache,
  setInCache,
  deleteFromCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch all observations for a patient
async function getObservationsByPatient(patientId) {
  const cacheKey = `observations:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Observation?patient=${patientId}`);
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient observations.");
  }
}

// Fetch observations by category (vital-signs, laboratory, etc.)
async function getObservationsByCategory(patientId, category) {
  const cacheKey = `observations:patient:${patientId}:category:${category}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Observation?patient=${patientId}&category=${category}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch observations by category.");
  }
}

// Fetch observation by ID
async function getObservationById(observationId) {
  const cacheKey = `observation:${observationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Observation/${observationId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Observation not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create observation with specific ID
async function createObservationWithSpecificId(observationData) {
  const observationId = observationData.id;
  if (!observationId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirObservationResource = {
    resourceType: "Observation",
    ...observationData,
  };

  console.log(`Attempting to PUT observation to /Observation/${observationId}`);

  try {
    const response = await fhirApi.put(
      `/Observation/${observationId}`,
      fhirObservationResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateObservationCache(observationId, observationData);

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2),
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

// Create observation (auto-generated ID)
async function createObservation(observationData) {
  const fhirObservationResource = {
    resourceType: "Observation",
    ...observationData,
  };

  console.log("Attempting to POST observation to /Observation");

  try {
    const response = await fhirApi.post(
      "/Observation",
      fhirObservationResource,
    );

    // Invalidate caches after successful creation
    await invalidateObservationCache(response.data.id, observationData);

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2),
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

// Update observation
async function updateObservation(observationId, observationData) {
  if (!observationId) {
    throw new Error("Observation ID is required");
  }

  // Get existing observation
  let existingObservation;
  try {
    existingObservation = await getObservationById(observationId);
  } catch (error) {
    throw new Error(`Observation ${observationId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingObservation,
    ...observationData,
    resourceType: "Observation",
    id: observationId,
  };

  try {
    const response = await fhirApi.put(
      `/Observation/${observationId}`,
      updateData,
    );
    const observation = response.data;

    // Invalidate caches after successful update
    await invalidateObservationCache(observationId, observation);

    return observation;
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2),
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

// Delete observation
async function deleteObservation(observationId) {
  if (!observationId) {
    throw new Error("Observation ID is required");
  }

  try {
    await fhirApi.delete(`/Observation/${observationId}`);

    // Invalidate cache
    await deleteFromCache(`observation:${observationId}`);

    return { success: true, message: "Observation deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Observation not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete observation.");
    }
  }
}

// Fetch observations that belong to a specific DiagnosticReport.
// Resolves the DR's result[] references and batch-fetches via ?_id=id1,id2,...
async function getObservationsByDiagnosticReport(diagnosticReportId) {
  const cacheKey = `observations:dr:${diagnosticReportId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) return cachedData;

    // Step 1: fetch the DiagnosticReport to read its result[] references
    const drResponse = await fhirApi.get(`/DiagnosticReport/${diagnosticReportId}`);
    const dr = drResponse.data;
    const resultRefs = dr.result ?? [];

    if (resultRefs.length === 0) return [];

    // Step 2: extract Observation IDs from result[] refs
    // ref.reference may be "Observation/{id}" or "Observation/{id}/_history/1"
    const ids = resultRefs
      .map((r) => (r.reference ?? "").split("/")[1])
      .filter(Boolean);

    if (ids.length === 0) return [];

    // Step 3: batch-fetch all observations in one HAPI FHIR call
    const obsResponse = await fhirApi.get(`/Observation?_id=${ids.join(",")}`);
    const observations = (obsResponse.data.entry ?? [])
      .map((e) => e.resource)
      .filter(Boolean);

    await setInCache(cacheKey, observations, CACHE_EXPIRATION.DEFAULT);
    return observations;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch observations for diagnostic report.");
  }
}

// Helper function to invalidate observation caches
async function invalidateObservationCache(observationId, observationData) {
  // Invalidate observation cache
  await deleteFromCache(`observation:${observationId}`);

  // Invalidate patient observations cache if patient reference exists
  if (observationData.subject?.reference) {
    const patientId = observationData.subject.reference.split("/")[1];
    await deleteFromCache(`observations:patient:${patientId}`);

    // Also invalidate category-specific cache if category exists
    if (observationData.category) {
      const categories = Array.isArray(observationData.category)
        ? observationData.category
        : [observationData.category];
      for (const cat of categories) {
        const categoryCode = cat.coding?.[0]?.code || cat;
        await deleteFromCache(
          `observations:patient:${patientId}:category:${categoryCode}`,
        );
      }
    }
  }
}

module.exports = {
  getObservationsByPatient,
  getObservationsByCategory,
  getObservationsByDiagnosticReport,
  getObservationById,
  createObservationWithSpecificId,
  createObservation,
  updateObservation,
  deleteObservation,
};
