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

// Fetch all locations
async function getAllLocations() {
  const cacheKey = "locations:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/Location");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch locations.");
  }
}

// Fetch locations by organization
async function getLocationsByOrganization(organizationId) {
  const cacheKey = `locations:organization:${organizationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Location?organization=Organization/${organizationId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch locations for organization.");
  }
}

// Fetch location by ID
async function getLocationById(locationId) {
  const cacheKey = `location:${locationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Location/${locationId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Location not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create location with specific ID
async function createLocationWithSpecificId(locationData) {
  const locationId = locationData.id;
  if (!locationId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirLocationResource = {
    resourceType: "Location",
    ...locationData,
  };

  console.log(`Attempting to PUT location to /Location/${locationId}`);

  try {
    const response = await fhirApi.put(
      `/Location/${locationId}`,
      fhirLocationResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateLocationCache(locationId, locationData);

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

// Create location (auto-generated ID)
async function createLocation(locationData) {
  const fhirLocationResource = {
    resourceType: "Location",
    ...locationData,
  };

  console.log("Attempting to POST location to /Location");

  try {
    const response = await fhirApi.post("/Location", fhirLocationResource);

    // Invalidate caches after successful creation
    await invalidateLocationCache(response.data.id, locationData);

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

// Update location
async function updateLocation(locationId, locationData) {
  if (!locationId) {
    throw new Error("Location ID is required");
  }

  // Get existing location
  let existingLocation;
  try {
    existingLocation = await getLocationById(locationId);
  } catch (error) {
    throw new Error(`Location ${locationId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingLocation,
    ...locationData,
    resourceType: "Location",
    id: locationId,
  };

  try {
    const response = await fhirApi.put(`/Location/${locationId}`, updateData);
    const location = response.data;

    // Invalidate caches after successful update
    await invalidateLocationCache(locationId, locationData);

    return location;
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

// Delete location
async function deleteLocation(locationId) {
  if (!locationId) {
    throw new Error("Location ID is required");
  }

  try {
    await fhirApi.delete(`/Location/${locationId}`);

    // Invalidate cache
    await deleteFromCache(`location:${locationId}`);
    await deleteFromCache("locations:all");

    return { success: true, message: "Location deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Location not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete location.");
    }
  }
}

// Helper function to invalidate location caches
async function invalidateLocationCache(locationId, locationData) {
  // Invalidate specific location cache
  await deleteFromCache(`location:${locationId}`);
  // Invalidate all locations cache
  await deleteFromCache("locations:all");

  // Invalidate organization locations cache if organization reference exists
  if (locationData.managingOrganization?.reference) {
    const orgRef = locationData.managingOrganization.reference;
    if (orgRef.startsWith("Organization/")) {
      const organizationId = orgRef.split("/")[1];
      await deleteFromCache(`locations:organization:${organizationId}`);
    }
  }
}

module.exports = {
  getAllLocations,
  getLocationsByOrganization,
  getLocationById,
  createLocationWithSpecificId,
  createLocation,
  updateLocation,
  deleteLocation,
};
