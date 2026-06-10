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

// Fetch all immunizations
async function getAllImmunizations() {
  const cacheKey = "immunizations:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/Immunization");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch immunizations.");
  }
}

// Fetch immunizations by patient ID
async function getImmunizationsByPatient(patientId) {
  const cacheKey = `immunizations:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Immunization?patient=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch immunizations for patient.");
  }
}

// Fetch immunization by ID
async function getImmunizationById(immunizationId) {
  const cacheKey = `immunization:${immunizationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Immunization/${immunizationId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Immunization not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create immunization with specific ID
async function createImmunizationWithSpecificId(immunizationData) {
  const immunizationId = immunizationData.id;
  if (!immunizationId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirImmunizationResource = {
    resourceType: "Immunization",
    ...immunizationData,
  };

  console.log(
    `Attempting to PUT immunization to /Immunization/${immunizationId}`,
  );

  try {
    const response = await fhirApi.put(
      `/Immunization/${immunizationId}`,
      fhirImmunizationResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateImmunizationCache(immunizationId, immunizationData);

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

// Create immunization (auto-generated ID)
async function createImmunization(immunizationData) {
  const fhirImmunizationResource = {
    resourceType: "Immunization",
    ...immunizationData,
  };

  console.log("Attempting to POST immunization to /Immunization");

  try {
    const response = await fhirApi.post(
      "/Immunization",
      fhirImmunizationResource,
    );

    // Invalidate caches after successful creation
    await invalidateImmunizationCache(response.data.id, immunizationData);

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

// Update immunization
async function updateImmunization(immunizationId, immunizationData) {
  if (!immunizationId) {
    throw new Error("Immunization ID is required");
  }

  // Get existing immunization
  let existingImmunization;
  try {
    existingImmunization = await getImmunizationById(immunizationId);
  } catch (error) {
    throw new Error(`Immunization ${immunizationId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingImmunization,
    ...immunizationData,
    resourceType: "Immunization",
    id: immunizationId,
  };

  try {
    const response = await fhirApi.put(
      `/Immunization/${immunizationId}`,
      updateData,
    );
    const immunization = response.data;

    // Invalidate caches after successful update
    await invalidateImmunizationCache(immunizationId, immunizationData);

    return immunization;
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

// Delete immunization
async function deleteImmunization(immunizationId) {
  if (!immunizationId) {
    throw new Error("Immunization ID is required");
  }

  try {
    await fhirApi.delete(`/Immunization/${immunizationId}`);

    // Invalidate cache
    await deleteFromCache(`immunization:${immunizationId}`);
    await deleteFromCache("immunizations:all");

    return { success: true, message: "Immunization deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Immunization not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete immunization.");
    }
  }
}

// Helper function to invalidate immunization caches
async function invalidateImmunizationCache(immunizationId, immunizationData) {
  // Invalidate specific immunization cache
  await deleteFromCache(`immunization:${immunizationId}`);
  // Invalidate all immunizations cache
  await deleteFromCache("immunizations:all");

  // Invalidate patient immunizations cache if patient reference exists
  if (immunizationData.patient?.reference) {
    const patientRef = immunizationData.patient.reference;
    if (patientRef.startsWith("Patient/")) {
      const patientId = patientRef.split("/")[1];
      await deleteFromCache(`immunizations:patient:${patientId}`);
    }
  }
}

module.exports = {
  getAllImmunizations,
  getImmunizationsByPatient,
  getImmunizationById,
  createImmunizationWithSpecificId,
  createImmunization,
  updateImmunization,
  deleteImmunization,
};
