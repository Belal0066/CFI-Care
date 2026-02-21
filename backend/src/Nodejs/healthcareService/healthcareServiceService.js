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

// Fetch all healthcare services
async function getAllHealthcareServices() {
  const cacheKey = "healthcareServices:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/HealthcareService");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch healthcare services.");
  }
}

// Fetch healthcare services by organization
async function getHealthcareServicesByOrganization(organizationId) {
  const cacheKey = `healthcareServices:organization:${organizationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/HealthcareService?organization=Organization/${organizationId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch healthcare services for organization.");
  }
}

// Fetch healthcare service by ID
async function getHealthcareServiceById(healthcareServiceId) {
  const cacheKey = `healthcareService:${healthcareServiceId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/HealthcareService/${healthcareServiceId}`,
    );
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("HealthcareService not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create healthcare service with specific ID
async function createHealthcareServiceWithSpecificId(healthcareServiceData) {
  const healthcareServiceId = healthcareServiceData.id;
  if (!healthcareServiceId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirHealthcareServiceResource = {
    resourceType: "HealthcareService",
    ...healthcareServiceData,
  };

  console.log(
    `Attempting to PUT healthcare service to /HealthcareService/${healthcareServiceId}`,
  );

  try {
    const response = await fhirApi.put(
      `/HealthcareService/${healthcareServiceId}`,
      fhirHealthcareServiceResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateHealthcareServiceCache(
      healthcareServiceId,
      healthcareServiceData,
    );

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

// Create healthcare service (auto-generated ID)
async function createHealthcareService(healthcareServiceData) {
  const fhirHealthcareServiceResource = {
    resourceType: "HealthcareService",
    ...healthcareServiceData,
  };

  console.log("Attempting to POST healthcare service to /HealthcareService");

  try {
    const response = await fhirApi.post(
      "/HealthcareService",
      fhirHealthcareServiceResource,
    );

    // Invalidate caches after successful creation
    await invalidateHealthcareServiceCache(
      response.data.id,
      healthcareServiceData,
    );

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

// Update healthcare service
async function updateHealthcareService(
  healthcareServiceId,
  healthcareServiceData,
) {
  if (!healthcareServiceId) {
    throw new Error("HealthcareService ID is required");
  }

  // Get existing healthcare service
  let existingHealthcareService;
  try {
    existingHealthcareService =
      await getHealthcareServiceById(healthcareServiceId);
  } catch (error) {
    throw new Error(`HealthcareService ${healthcareServiceId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingHealthcareService,
    ...healthcareServiceData,
    resourceType: "HealthcareService",
    id: healthcareServiceId,
  };

  try {
    const response = await fhirApi.put(
      `/HealthcareService/${healthcareServiceId}`,
      updateData,
    );
    const healthcareService = response.data;

    // Invalidate caches after successful update
    await invalidateHealthcareServiceCache(
      healthcareServiceId,
      healthcareServiceData,
    );

    return healthcareService;
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

// Delete healthcare service
async function deleteHealthcareService(healthcareServiceId) {
  if (!healthcareServiceId) {
    throw new Error("HealthcareService ID is required");
  }

  try {
    await fhirApi.delete(`/HealthcareService/${healthcareServiceId}`);

    // Invalidate cache
    await deleteFromCache(`healthcareService:${healthcareServiceId}`);
    await deleteFromCache("healthcareServices:all");

    return { success: true, message: "HealthcareService deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("HealthcareService not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete healthcare service.");
    }
  }
}

// Helper function to invalidate healthcare service caches
async function invalidateHealthcareServiceCache(
  healthcareServiceId,
  healthcareServiceData,
) {
  // Invalidate specific healthcare service cache
  await deleteFromCache(`healthcareService:${healthcareServiceId}`);
  // Invalidate all healthcare services cache
  await deleteFromCache("healthcareServices:all");

  // Invalidate organization healthcare services cache if organization reference exists
  if (healthcareServiceData.providedBy?.reference) {
    const orgRef = healthcareServiceData.providedBy.reference;
    if (orgRef.startsWith("Organization/")) {
      const organizationId = orgRef.split("/")[1];
      await deleteFromCache(
        `healthcareServices:organization:${organizationId}`,
      );
    }
  }
}

module.exports = {
  getAllHealthcareServices,
  getHealthcareServicesByOrganization,
  getHealthcareServiceById,
  createHealthcareServiceWithSpecificId,
  createHealthcareService,
  updateHealthcareService,
  deleteHealthcareService,
};
