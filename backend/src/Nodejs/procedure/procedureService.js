const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const {
  getFromCache,
  setInCache,
  deleteFromCache,
  deleteByPattern,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch all procedures for a patient
async function getProceduresByPatientId(patientId) {
  const cacheKey = `procedures:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Procedure?subject=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.PROCEDURE);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient procedures.");
  }
}

// Fetch procedure by ID
async function getProcedureById(procedureId) {
  const cacheKey = `procedure:${procedureId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Procedure/${procedureId}`);
    const procedure = response.data;

    // Store in cache
    await setInCache(cacheKey, procedure, CACHE_EXPIRATION.PROCEDURE);

    return procedure;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch procedure.");
  }
}

// Create a new procedure
async function createProcedure(procedureData) {
  try {
    const response = await fhirApi.post("/Procedure", procedureData);
    const procedure = response.data;

    // Invalidate patient procedures cache if subject is specified
    if (procedureData.subject?.reference) {
      const patientId = procedureData.subject.reference.split("/")[1];
      await deleteFromCache(`procedures:patient:${patientId}`);
      // Also invalidate patient's everything cache
      await deleteFromCache(`patient:${patientId}:everything`);
    }

    // Cache the new procedure
    if (procedure.id) {
      await setInCache(
        `procedure:${procedure.id}`,
        procedure,
        CACHE_EXPIRATION.PROCEDURE,
      );
    }

    return procedure;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not create procedure.");
  }
}

// Update procedure
async function updateProcedure(procedureId, procedureData) {
  if (!procedureId) {
    throw new Error("Procedure ID is required");
  }

  // Merge with existing data
  let existingProcedure;
  try {
    existingProcedure = await getProcedureById(procedureId);
  } catch (error) {
    throw new Error(`Procedure ${procedureId} not found`);
  }

  const updateData = {
    ...existingProcedure,
    ...procedureData,
    resourceType: "Procedure",
    id: procedureId,
  };

  try {
    const response = await fhirApi.put(`/Procedure/${procedureId}`, updateData);
    const procedure = response.data;

    // Invalidate caches after successful update
    if (procedure.subject?.reference) {
      const patientId = procedure.subject.reference.split("/")[1];
      await deleteFromCache(`procedures:patient:${patientId}`);
      await deleteFromCache(`patient:${patientId}:everything`);
    }
    await deleteFromCache(`procedure:${procedureId}`);

    return procedure;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not update procedure.");
  }
}

// Delete procedure
async function deleteProcedure(procedureId) {
  if (!procedureId) {
    throw new Error("Procedure ID is required");
  }

  try {
    // Get the procedure to find patient ID for cache invalidation
    let patientId = null;
    try {
      const procedure = await getProcedureById(procedureId);
      patientId = procedure.subject?.reference?.split("/")[1];
    } catch (e) {
      console.log("Could not fetch procedure for deletion cache invalidation");
    }

    // Delete from FHIR server
    await fhirApi.delete(`/Procedure/${procedureId}`);

    // Invalidate caches after successful deletion
    if (patientId) {
      await deleteFromCache(`procedures:patient:${patientId}`);
      await deleteFromCache(`patient:${patientId}:everything`);
    }
    await deleteFromCache(`procedure:${procedureId}`);

    return { success: true, id: procedureId };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Procedure ${procedureId} not found in FHIR`);
      await deleteFromCache(`procedure:${procedureId}`);
      return { success: true, id: procedureId, alreadyDeleted: true };
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not delete procedure.");
  }
}

module.exports = {
  getProceduresByPatientId,
  getProcedureById,
  createProcedure,
  updateProcedure,
  deleteProcedure,
};
