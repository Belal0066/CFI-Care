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

// Fetch all practitioner roles
async function getAllPractitionerRoles() {
  const cacheKey = "practitionerRoles:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/PractitionerRole");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch practitioner roles.");
  }
}

// Fetch practitioner roles by practitioner ID
async function getPractitionerRolesByPractitioner(practitionerId) {
  const cacheKey = `practitionerRoles:practitioner:${practitionerId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/PractitionerRole?practitioner=Practitioner/${practitionerId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch practitioner roles for practitioner.");
  }
}

// Fetch practitioner roles by organization ID
async function getPractitionerRolesByOrganization(organizationId) {
  const cacheKey = `practitionerRoles:organization:${organizationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/PractitionerRole?organization=Organization/${organizationId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch practitioner roles for organization.");
  }
}

// Fetch practitioner role by ID
async function getPractitionerRoleById(practitionerRoleId) {
  const cacheKey = `practitionerRole:${practitionerRoleId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/PractitionerRole/${practitionerRoleId}`,
    );
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("PractitionerRole not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create practitioner role with specific ID
async function createPractitionerRoleWithSpecificId(practitionerRoleData) {
  const practitionerRoleId = practitionerRoleData.id;
  if (!practitionerRoleId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirPractitionerRoleResource = {
    resourceType: "PractitionerRole",
    ...practitionerRoleData,
  };

  console.log(
    `Attempting to PUT practitioner role to /PractitionerRole/${practitionerRoleId}`,
  );

  try {
    const response = await fhirApi.put(
      `/PractitionerRole/${practitionerRoleId}`,
      fhirPractitionerRoleResource,
    );

    // Invalidate caches after successful creation/update
    await invalidatePractitionerRoleCache(
      practitionerRoleId,
      practitionerRoleData,
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

// Create practitioner role (auto-generated ID)
async function createPractitionerRole(practitionerRoleData) {
  const fhirPractitionerRoleResource = {
    resourceType: "PractitionerRole",
    ...practitionerRoleData,
  };

  console.log("Attempting to POST practitioner role to /PractitionerRole");

  try {
    const response = await fhirApi.post(
      "/PractitionerRole",
      fhirPractitionerRoleResource,
    );

    // Invalidate caches after successful creation
    await invalidatePractitionerRoleCache(
      response.data.id,
      practitionerRoleData,
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

// Update practitioner role
async function updatePractitionerRole(
  practitionerRoleId,
  practitionerRoleData,
) {
  if (!practitionerRoleId) {
    throw new Error("PractitionerRole ID is required");
  }

  // Get existing practitioner role
  let existingPractitionerRole;
  try {
    existingPractitionerRole =
      await getPractitionerRoleById(practitionerRoleId);
  } catch (error) {
    throw new Error(`PractitionerRole ${practitionerRoleId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingPractitionerRole,
    ...practitionerRoleData,
    resourceType: "PractitionerRole",
    id: practitionerRoleId,
  };

  try {
    const response = await fhirApi.put(
      `/PractitionerRole/${practitionerRoleId}`,
      updateData,
    );
    const practitionerRole = response.data;

    // Invalidate caches after successful update
    await invalidatePractitionerRoleCache(
      practitionerRoleId,
      practitionerRoleData,
    );

    return practitionerRole;
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

// Delete practitioner role
async function deletePractitionerRole(practitionerRoleId) {
  if (!practitionerRoleId) {
    throw new Error("PractitionerRole ID is required");
  }

  try {
    await fhirApi.delete(`/PractitionerRole/${practitionerRoleId}`);

    // Invalidate cache
    await deleteFromCache(`practitionerRole:${practitionerRoleId}`);
    await deleteFromCache("practitionerRoles:all");

    return { success: true, message: "PractitionerRole deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("PractitionerRole not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete practitioner role.");
    }
  }
}

// Helper function to invalidate practitioner role caches
async function invalidatePractitionerRoleCache(
  practitionerRoleId,
  practitionerRoleData,
) {
  // Invalidate specific practitioner role cache
  await deleteFromCache(`practitionerRole:${practitionerRoleId}`);
  // Invalidate all practitioner roles cache
  await deleteFromCache("practitionerRoles:all");

  // Invalidate practitioner-specific cache if practitioner reference exists
  if (practitionerRoleData.practitioner?.reference) {
    const practRef = practitionerRoleData.practitioner.reference;
    if (practRef.startsWith("Practitioner/")) {
      const practitionerId = practRef.split("/")[1];
      await deleteFromCache(`practitionerRoles:practitioner:${practitionerId}`);
    }
  }

  // Invalidate organization-specific cache if organization reference exists
  if (practitionerRoleData.organization?.reference) {
    const orgRef = practitionerRoleData.organization.reference;
    if (orgRef.startsWith("Organization/")) {
      const organizationId = orgRef.split("/")[1];
      await deleteFromCache(`practitionerRoles:organization:${organizationId}`);
    }
  }
}

module.exports = {
  getAllPractitionerRoles,
  getPractitionerRolesByPractitioner,
  getPractitionerRolesByOrganization,
  getPractitionerRoleById,
  createPractitionerRoleWithSpecificId,
  createPractitionerRole,
  updatePractitionerRole,
  deletePractitionerRole,
};
