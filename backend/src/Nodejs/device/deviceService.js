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

// Fetch all devices
async function getAllDevices() {
  const cacheKey = "devices:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get("/Device");
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch devices.");
  }
}

// Fetch devices by organization
async function getDevicesByOrganization(organizationId) {
  const cacheKey = `devices:organization:${organizationId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Device?owner=Organization/${organizationId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch devices for organization.");
  }
}

// Fetch device by ID
async function getDeviceById(deviceId) {
  const cacheKey = `device:${deviceId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Device/${deviceId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Device not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create device with specific ID
async function createDeviceWithSpecificId(deviceData) {
  const deviceId = deviceData.id;
  if (!deviceId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirDeviceResource = {
    resourceType: "Device",
    ...deviceData,
  };

  console.log(`Attempting to PUT device to /Device/${deviceId}`);

  try {
    const response = await fhirApi.put(
      `/Device/${deviceId}`,
      fhirDeviceResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateDeviceCache(deviceId, deviceData);

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

// Create device (auto-generated ID)
async function createDevice(deviceData) {
  const fhirDeviceResource = {
    resourceType: "Device",
    ...deviceData,
  };

  console.log("Attempting to POST device to /Device");

  try {
    const response = await fhirApi.post("/Device", fhirDeviceResource);

    // Invalidate caches after successful creation
    await invalidateDeviceCache(response.data.id, deviceData);

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

// Update device
async function updateDevice(deviceId, deviceData) {
  if (!deviceId) {
    throw new Error("Device ID is required");
  }

  // Get existing device
  let existingDevice;
  try {
    existingDevice = await getDeviceById(deviceId);
  } catch (error) {
    throw new Error(`Device ${deviceId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingDevice,
    ...deviceData,
    resourceType: "Device",
    id: deviceId,
  };

  try {
    const response = await fhirApi.put(`/Device/${deviceId}`, updateData);
    const device = response.data;

    // Invalidate caches after successful update
    await invalidateDeviceCache(deviceId, deviceData);

    return device;
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

// Delete device
async function deleteDevice(deviceId) {
  if (!deviceId) {
    throw new Error("Device ID is required");
  }

  try {
    await fhirApi.delete(`/Device/${deviceId}`);

    // Invalidate cache
    await deleteFromCache(`device:${deviceId}`);
    await deleteFromCache("devices:all");

    return { success: true, message: "Device deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Device not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete device.");
    }
  }
}

// Helper function to invalidate device caches
async function invalidateDeviceCache(deviceId, deviceData) {
  // Invalidate specific device cache
  await deleteFromCache(`device:${deviceId}`);
  // Invalidate all devices cache
  await deleteFromCache("devices:all");

  // Invalidate organization devices cache if organization reference exists
  if (deviceData.owner?.reference) {
    const orgRef = deviceData.owner.reference;
    if (orgRef.startsWith("Organization/")) {
      const organizationId = orgRef.split("/")[1];
      await deleteFromCache(`devices:organization:${organizationId}`);
    }
  }
}

module.exports = {
  getAllDevices,
  getDevicesByOrganization,
  getDeviceById,
  createDeviceWithSpecificId,
  createDevice,
  updateDevice,
  deleteDevice,
};
