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

// Fetch all related persons
async function getAllRelatedPersons() {
  const cacheKey = "relatedPersons:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/RelatedPerson");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch related persons.");
  }
}

// Fetch related persons by patient
async function getRelatedPersonsByPatient(patientId) {
  const cacheKey = `relatedPersons:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/RelatedPerson?patient=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch related persons for patient.");
  }
}

// Fetch related person by ID
async function getRelatedPersonById(relatedPersonId) {
  const cacheKey = `relatedPerson:${relatedPersonId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/RelatedPerson/${relatedPersonId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("RelatedPerson not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create related person with specific ID
async function createRelatedPersonWithSpecificId(relatedPersonData) {
  const relatedPersonId = relatedPersonData.id;
  if (!relatedPersonId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirRelatedPersonResource = {
    resourceType: "RelatedPerson",
    ...relatedPersonData,
  };

  console.log(
    `Attempting to PUT related person to /RelatedPerson/${relatedPersonId}`,
  );

  try {
    const response = await fhirApi.put(
      `/RelatedPerson/${relatedPersonId}`,
      fhirRelatedPersonResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateRelatedPersonCache(relatedPersonId, relatedPersonData);

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

// Create related person (auto-generated ID)
async function createRelatedPerson(relatedPersonData) {
  const fhirRelatedPersonResource = {
    resourceType: "RelatedPerson",
    ...relatedPersonData,
  };

  console.log("Attempting to POST related person to /RelatedPerson");

  try {
    const response = await fhirApi.post(
      "/RelatedPerson",
      fhirRelatedPersonResource,
    );

    // Invalidate caches after successful creation
    await invalidateRelatedPersonCache(response.data.id, relatedPersonData);

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

// Update related person
async function updateRelatedPerson(relatedPersonId, relatedPersonData) {
  if (!relatedPersonId) {
    throw new Error("RelatedPerson ID is required");
  }

  // Get existing related person
  let existingRelatedPerson;
  try {
    existingRelatedPerson = await getRelatedPersonById(relatedPersonId);
  } catch (error) {
    throw new Error(`RelatedPerson ${relatedPersonId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingRelatedPerson,
    ...relatedPersonData,
    resourceType: "RelatedPerson",
    id: relatedPersonId,
  };

  try {
    const response = await fhirApi.put(
      `/RelatedPerson/${relatedPersonId}`,
      updateData,
    );
    const relatedPerson = response.data;

    // Invalidate caches after successful update
    await invalidateRelatedPersonCache(relatedPersonId, relatedPersonData);

    return relatedPerson;
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

// Delete related person
async function deleteRelatedPerson(relatedPersonId) {
  if (!relatedPersonId) {
    throw new Error("RelatedPerson ID is required");
  }

  try {
    await fhirApi.delete(`/RelatedPerson/${relatedPersonId}`);

    // Invalidate cache
    await deleteFromCache(`relatedPerson:${relatedPersonId}`);
    await deleteFromCache("relatedPersons:all");

    return { success: true, message: "RelatedPerson deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("RelatedPerson not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete related person.");
    }
  }
}

// Helper function to invalidate related person caches
async function invalidateRelatedPersonCache(
  relatedPersonId,
  relatedPersonData,
) {
  // Invalidate specific related person cache
  await deleteFromCache(`relatedPerson:${relatedPersonId}`);
  // Invalidate all related persons cache
  await deleteFromCache("relatedPersons:all");

  // Invalidate patient related persons cache if patient reference exists
  if (relatedPersonData.patient?.reference) {
    const patientRef = relatedPersonData.patient.reference;
    if (patientRef.startsWith("Patient/")) {
      const patientId = patientRef.split("/")[1];
      await deleteFromCache(`relatedPersons:patient:${patientId}`);
    }
  }
}

module.exports = {
  getAllRelatedPersons,
  getRelatedPersonsByPatient,
  getRelatedPersonById,
  createRelatedPersonWithSpecificId,
  createRelatedPerson,
  updateRelatedPerson,
  deleteRelatedPerson,
};
