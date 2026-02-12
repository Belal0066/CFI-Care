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

// Fetch all organizations
async function getAllOrganizations() {
  const cacheKey = "organizations:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/Organization");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch organizations.");
  }
}

// Fetch organization by ID
async function getOrganizationById(organizationId) {
  const cacheKey = `organization:${organizationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Organization/${organizationId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Organization not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create organization with specific ID
async function createOrganizationWithSpecificId(organizationData) {
  const organizationId = organizationData.id;
  if (!organizationId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirOrganizationResource = {
    resourceType: "Organization",
    ...organizationData,
  };

  console.log(
    `Attempting to PUT organization to /Organization/${organizationId}`,
  );

  try {
    const response = await fhirApi.put(
      `/Organization/${organizationId}`,
      fhirOrganizationResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateOrganizationCache(organizationId);

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

// Create organization (auto-generated ID)
async function createOrganization(organizationData) {
  const fhirOrganizationResource = {
    resourceType: "Organization",
    ...organizationData,
  };

  console.log("Attempting to POST organization to /Organization");

  try {
    const response = await fhirApi.post(
      "/Organization",
      fhirOrganizationResource,
    );

    // Invalidate caches after successful creation
    await invalidateOrganizationCache(response.data.id);

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

// Update organization
async function updateOrganization(organizationId, organizationData) {
  if (!organizationId) {
    throw new Error("Organization ID is required");
  }

  // Get existing organization
  let existingOrganization;
  try {
    existingOrganization = await getOrganizationById(organizationId);
  } catch (error) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingOrganization,
    ...organizationData,
    resourceType: "Organization",
    id: organizationId,
  };

  try {
    const response = await fhirApi.put(
      `/Organization/${organizationId}`,
      updateData,
    );
    const organization = response.data;

    // Invalidate caches after successful update
    await invalidateOrganizationCache(organizationId);

    return organization;
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

// Delete organization
async function deleteOrganization(organizationId) {
  if (!organizationId) {
    throw new Error("Organization ID is required");
  }

  try {
    await fhirApi.delete(`/Organization/${organizationId}`);

    // Invalidate cache
    await invalidateOrganizationCache(organizationId);

    return { success: true, message: "Organization deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Organization not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete organization.");
    }
  }
}

// Helper function to invalidate organization caches
async function invalidateOrganizationCache(organizationId) {
  // Invalidate specific organization cache
  await deleteFromCache(`organization:${organizationId}`);
  // Invalidate all organizations cache
  await deleteFromCache("organizations:all");
}

module.exports = {
  getAllOrganizations,
  getOrganizationById,
  createOrganizationWithSpecificId,
  createOrganization,
  updateOrganization,
  deleteOrganization,
};
