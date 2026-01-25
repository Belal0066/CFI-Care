const axios = require("axios");
const {
  getFromCache,
  setInCache,
  invalidatePractitionerCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch Practitioner by ID
async function getPractitionerById(practitionerId) {
  const cacheKey = `practitioner:${practitionerId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Practitioner/${practitionerId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.PRACTITIONER);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Practitioner not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create Practitioner With Specific ID
async function createPractitionerWithSpecificId(practitionerData) {
  const practitionerId = practitionerData.id;
  if (!practitionerId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirPractitionerResource = {
    resourceType: "Practitioner",
    ...practitionerData,
  };

  console.log(
    `Attempting to PUT practitioner to /Practitioner/${practitionerId}`,
  );
  try {
    const response = await fhirApi.put(
      `/Practitioner/${practitionerId}`,
      fhirPractitionerResource,
    );

    // Invalidate cache after successful creation/update
    await invalidatePractitionerCache(practitionerId);

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
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Update Practitioner
async function updatePractitioner(practitionerId, practitionerData) {
  if (!practitionerId) {
    throw new Error("Practitioner ID is required");
  }

  // Get existing practitioner
  let existingPractitioner;
  try {
    existingPractitioner = await getPractitionerById(practitionerId);
  } catch (error) {
    throw new Error(`Practitioner ${practitionerId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingPractitioner,
    ...practitionerData,
    resourceType: "Practitioner",
    id: practitionerId,
  };

  try {
    const response = await fhirApi.put(
      `/Practitioner/${practitionerId}`,
      updateData,
    );

    // Invalidate cache after successful update
    await invalidatePractitionerCache(practitionerId);

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

// Delete Practitioner
async function deletePractitioner(practitionerId) {
  if (!practitionerId) {
    throw new Error("Practitioner ID is required");
  }

  try {
    // Delete from FHIR server
    await fhirApi.delete(`/Practitioner/${practitionerId}`);

    // Invalidate cache after successful deletion
    await invalidatePractitionerCache(practitionerId);

    return { success: true, id: practitionerId };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Practitioner ${practitionerId} not found in FHIR`);
      await invalidatePractitionerCache(practitionerId);
      return { success: true, id: practitionerId, alreadyDeleted: true };
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not delete practitioner.");
  }
}

module.exports = {
  getPractitionerById,
  createPractitionerWithSpecificId,
  updatePractitioner,
  deletePractitioner,
};
