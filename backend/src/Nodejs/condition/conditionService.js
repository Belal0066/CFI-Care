const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const {
  getFromCache,
  setInCache,
  invalidateConditionCache,
  deleteFromCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch all conditions for a patient
async function getConditionsByPatientId(patientId) {
  const cacheKey = `conditions:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Condition?subject=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.CONDITION);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient conditions.");
  }
}

// Fetch condition by ID
async function getConditionById(conditionId) {
  const cacheKey = `condition:${conditionId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Condition/${conditionId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.CONDITION);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Condition not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create condition with Specific ID
async function createConditionWithSpecificId(conditionData) {
  const conditionId = conditionData.id;
  if (!conditionId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }
  const fhirConditionResource = {
    resourceType: "Condition",
    ...conditionData,
  };
  console.log(`Attempting to PUT condition to /Condition/${conditionId}`);
  try {
    const response = await fhirApi.put(
      `/Condition/${conditionId}`,
      fhirConditionResource,
    );

    // Invalidate caches after successful creation/update
    if (conditionData.subject) {
      const patientId = conditionData.subject.reference?.split("/")[1];
      await invalidateConditionCache(conditionId, patientId);
    } else {
      await invalidateConditionCache(conditionId);
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

// Update condition
async function updateCondition(conditionId, conditionData) {
  if (!conditionId) {
    throw new Error("Condition ID is required");
  }

  // Get existing condition
  let existingCondition;
  try {
    existingCondition = await getConditionById(conditionId);
  } catch (error) {
    throw new Error(`Condition ${conditionId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingCondition,
    ...conditionData,
    resourceType: "Condition",
    id: conditionId,
  };

  try {
    const response = await fhirApi.put(`/Condition/${conditionId}`, updateData);
    const condition = response.data;

    // Invalidate caches after successful update
    const patientId = condition.subject?.reference?.split("/")[1];
    if (patientId) {
      await invalidateConditionCache(conditionId, patientId);
    } else {
      await invalidateConditionCache(conditionId);
    }

    return condition;
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

// Delete condition
async function deleteCondition(conditionId) {
  if (!conditionId) {
    throw new Error("Condition ID is required");
  }

  try {
    // Get condition first to find patient ID for cache invalidation
    let patientId = null;
    try {
      const condition = await getConditionById(conditionId);
      patientId = condition.subject?.reference?.split("/")[1];
    } catch (e) {
      console.log("Could not fetch condition for deletion cache invalidation");
    }

    // Delete from FHIR server
    await fhirApi.delete(`/Condition/${conditionId}`);

    // Invalidate caches after successful deletion
    if (patientId) {
      await invalidateConditionCache(conditionId, patientId);
    } else {
      await invalidateConditionCache(conditionId);
    }

    return { success: true, id: conditionId };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Condition ${conditionId} not found in FHIR`);
      await deleteFromCache(`condition:${conditionId}`);
      return { success: true, id: conditionId, alreadyDeleted: true };
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not delete condition.");
  }
}

module.exports = {
  getConditionById,
  getConditionsByPatientId,
  createConditionWithSpecificId,
  updateCondition,
  deleteCondition,
};
