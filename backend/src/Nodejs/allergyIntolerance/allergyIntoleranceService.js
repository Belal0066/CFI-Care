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

// Fetch all allergies for a patient
async function getAllergiesByPatient(patientId) {
  const cacheKey = `allergies:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/AllergyIntolerance?patient=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient allergies.");
  }
}

// Fetch allergy by ID
async function getAllergyById(allergyId) {
  const cacheKey = `allergy:${allergyId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/AllergyIntolerance/${allergyId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("AllergyIntolerance not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create allergy with specific ID
async function createAllergyWithSpecificId(allergyData) {
  const allergyId = allergyData.id;
  if (!allergyId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirAllergyResource = {
    resourceType: "AllergyIntolerance",
    ...allergyData,
  };

  console.log(`Attempting to PUT allergy to /AllergyIntolerance/${allergyId}`);

  try {
    const response = await fhirApi.put(
      `/AllergyIntolerance/${allergyId}`,
      fhirAllergyResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateAllergyCache(allergyId, allergyData);

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

// Create allergy (auto-generated ID)
async function createAllergy(allergyData) {
  const fhirAllergyResource = {
    resourceType: "AllergyIntolerance",
    ...allergyData,
  };

  console.log("Attempting to POST allergy to /AllergyIntolerance");

  try {
    const response = await fhirApi.post(
      "/AllergyIntolerance",
      fhirAllergyResource,
    );

    // Invalidate caches after successful creation
    await invalidateAllergyCache(response.data.id, allergyData);

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

// Update allergy
async function updateAllergy(allergyId, allergyData) {
  if (!allergyId) {
    throw new Error("AllergyIntolerance ID is required");
  }

  // Get existing allergy
  let existingAllergy;
  try {
    existingAllergy = await getAllergyById(allergyId);
  } catch (error) {
    throw new Error(`AllergyIntolerance ${allergyId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingAllergy,
    ...allergyData,
    resourceType: "AllergyIntolerance",
    id: allergyId,
  };

  try {
    const response = await fhirApi.put(
      `/AllergyIntolerance/${allergyId}`,
      updateData,
    );
    const allergy = response.data;

    // Invalidate caches after successful update
    await invalidateAllergyCache(allergyId, allergy);

    return allergy;
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

// Delete allergy
async function deleteAllergy(allergyId) {
  if (!allergyId) {
    throw new Error("AllergyIntolerance ID is required");
  }

  try {
    await fhirApi.delete(`/AllergyIntolerance/${allergyId}`);

    // Invalidate cache
    await deleteFromCache(`allergy:${allergyId}`);

    return {
      success: true,
      message: "AllergyIntolerance deleted successfully",
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("AllergyIntolerance not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete allergy.");
    }
  }
}

// Helper function to invalidate allergy caches
async function invalidateAllergyCache(allergyId, allergyData) {
  // Invalidate allergy cache
  await deleteFromCache(`allergy:${allergyId}`);

  // Invalidate patient allergies cache if patient reference exists
  if (allergyData.patient?.reference) {
    const patientId = allergyData.patient.reference.split("/")[1];
    await deleteFromCache(`allergies:patient:${patientId}`);
  }
}

module.exports = {
  getAllergiesByPatient,
  getAllergyById,
  createAllergyWithSpecificId,
  createAllergy,
  updateAllergy,
  deleteAllergy,
};
