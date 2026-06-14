const axios = require("axios");
const {
  getFromCache,
  setInCache,
  invalidateEOCCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Get Encounters related to an EpisodeOfCare
async function getEncountersByEpisodeOfCareId(eocId) {
  const cacheKey = `encounters:eoc:${eocId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Encounter`, {
      params: {
        "episode-of-care": eocId,
      },
    });
    const data = response.data.entry
      ? response.data.entry.map((e) => e.resource)
      : [];

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.EOC);

    return data;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }
}

// Fetch EpisodeOfCare by ID
async function getEpisodeOfCareById(eocId) {
  const cacheKey = `eoc:${eocId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/EpisodeOfCare/${eocId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.EOC);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("EpisodeOfCare not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create EpisodeOfCare with Specific ID
async function createEpisodeOfCareWithSpecificId(eocData) {
  if (!eocData) {
    throw new Error(
      "createEpisodeOfCareWithSpecificId Error: 'eocData' argument is missing or undefined.",
    );
  }

  const eocId = eocData.id;

  if (!eocId) {
    throw new Error("EpisodeOfCare ID is required inside the data object");
  }

  // We initialize with only the strictly required/guaranteed fields
  const fhirEOCResource = {
    resourceType: "EpisodeOfCare",
    id: eocId,
    status: eocData.status || "active",
    patient: eocData.patient, // Required reference
  };

  // Only add optional fields if they exist and are valid (not empty/null)
  if (eocData.type && Array.isArray(eocData.type) && eocData.type.length > 0) {
    fhirEOCResource.type = eocData.type;
  }

  if (
    eocData.diagnosis &&
    Array.isArray(eocData.diagnosis) &&
    eocData.diagnosis.length > 0
  ) {
    fhirEOCResource.diagnosis = eocData.diagnosis;
  }

  if (eocData.period && Object.keys(eocData.period).length > 0) {
    fhirEOCResource.period = eocData.period;
  }

  if (eocData.careManager && Object.keys(eocData.careManager).length > 0) {
    fhirEOCResource.careManager = eocData.careManager;
  }

  console.log(`Attempting to PUT EpisodeOfCare to /EpisodeOfCare/${eocId}`);

  try {
    const response = await fhirApi.put(
      `/EpisodeOfCare/${eocId}`,
      fhirEOCResource,
    );

    // Invalidate cache after successful creation/update
    const patientId = eocData.patient?.reference?.split("/")[1];
    await invalidateEOCCache(eocId, patientId);

    return { data: response.data, eocVersion: response.headers.etag };
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

// Update EpisodeOfCare
async function updateEpisodeOfCare(eocId, eocData) {
  if (!eocId) {
    throw new Error("EpisodeOfCare ID is required");
  }

  // Get existing EpisodeOfCare
  let existingEOC;
  try {
    existingEOC = await getEpisodeOfCareById(eocId);
  } catch (error) {
    throw new Error(`EpisodeOfCare ${eocId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingEOC,
    ...eocData,
    resourceType: "EpisodeOfCare",
    id: eocId,
  };

  try {
    const response = await fhirApi.put(`/EpisodeOfCare/${eocId}`, updateData);

    // Invalidate caches after successful update
    const patientId = updateData.patient?.reference?.split("/")[1];
    if (patientId) {
      await invalidateEOCCache(eocId, patientId);
    } else {
      await invalidateEOCCache(eocId);
    }

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

// Delete EpisodeOfCare
async function deleteEpisodeOfCare(eocId) {
  if (!eocId) {
    throw new Error("EpisodeOfCare ID is required");
  }

  try {
    // Get EOC first to find patient ID for cache invalidation
    let patientId = null;
    try {
      const eoc = await getEpisodeOfCareById(eocId);
      patientId = eoc.patient?.reference?.split("/")[1];
    } catch (e) {
      console.log("Could not fetch EOC for deletion cache invalidation");
    }

    // Delete from FHIR server
    await fhirApi.delete(`/EpisodeOfCare/${eocId}`);

    // Invalidate caches after successful deletion
    if (patientId) {
      await invalidateEOCCache(eocId, patientId);
    } else {
      await invalidateEOCCache(eocId);
    }

    return { success: true, id: eocId };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`EpisodeOfCare ${eocId} not found in FHIR`);
      await invalidateEOCCache(eocId);
      return { success: true, id: eocId, alreadyDeleted: true };
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not delete EpisodeOfCare.");
  }
}

// Get all EpisodeOfCare resources for a patient
async function getEpisodeOfCareByPatient(patientId) {
  const cacheKey = `eoc:patient:${patientId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/EpisodeOfCare", {
      params: { patient: `Patient/${patientId}` },
    });
    const data = response.data.entry
      ? response.data.entry.map((e) => e.resource)
      : [];

    await setInCache(cacheKey, data, CACHE_EXPIRATION.EOC);
    return data;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }
}

module.exports = {
  getEpisodeOfCareById,
  getEpisodeOfCareByPatient,
  createEpisodeOfCareWithSpecificId,
  getEncountersByEpisodeOfCareId,
  updateEpisodeOfCare,
  deleteEpisodeOfCare,
};
