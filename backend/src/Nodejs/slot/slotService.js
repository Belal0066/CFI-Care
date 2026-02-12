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

// Fetch slots by schedule
async function getSlotsBySchedule(scheduleId, status) {
  const statusParam = status ? `&status=${status}` : "";
  const cacheKey = `slots:schedule:${scheduleId}:status:${status || "all"}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Slot?schedule=${scheduleId}${statusParam}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.SHORT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch slots.");
  }
}

// Fetch available slots for a practitioner on a specific date
async function getAvailableSlots(practitionerId, date, scheduleId) {
  const dateParam = date ? `&start=${date}` : "";
  const scheduleParam = scheduleId ? `&schedule=${scheduleId}` : "";
  const cacheKey = `slots:practitioner:${practitionerId}:date:${date || "any"}:schedule:${scheduleId || "any"}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    // Search for slots with status=free
    const response = await fhirApi.get(
      `/Slot?status=free${scheduleParam}${dateParam}`,
    );
    const bundle = response.data;

    // Store in cache (shorter expiration for availability)
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.SHORT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch available slots.");
  }
}

// Fetch slot by ID
async function getSlotById(slotId) {
  const cacheKey = `slot:${slotId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Slot/${slotId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.SHORT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Slot not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create slot with specific ID
async function createSlotWithSpecificId(slotData) {
  const slotId = slotData.id;
  if (!slotId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirSlotResource = {
    resourceType: "Slot",
    ...slotData,
  };

  console.log(`Attempting to PUT slot to /Slot/${slotId}`);

  try {
    const response = await fhirApi.put(`/Slot/${slotId}`, fhirSlotResource);

    // Invalidate caches after successful creation/update
    await invalidateSlotCache(slotId, slotData);

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

// Create slot (auto-generated ID)
async function createSlot(slotData) {
  const fhirSlotResource = {
    resourceType: "Slot",
    ...slotData,
  };

  console.log("Attempting to POST slot to /Slot");

  try {
    const response = await fhirApi.post("/Slot", fhirSlotResource);

    // Invalidate caches after successful creation
    await invalidateSlotCache(response.data.id, slotData);

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

// Update slot (typically used to change status, e.g., free -> busy)
async function updateSlot(slotId, slotData) {
  if (!slotId) {
    throw new Error("Slot ID is required");
  }

  // Get existing slot
  let existingSlot;
  try {
    existingSlot = await getSlotById(slotId);
  } catch (error) {
    throw new Error(`Slot ${slotId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingSlot,
    ...slotData,
    resourceType: "Slot",
    id: slotId,
  };

  try {
    const response = await fhirApi.put(`/Slot/${slotId}`, updateData);
    const slot = response.data;

    // Invalidate caches after successful update
    await invalidateSlotCache(slotId, slot);

    return slot;
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

// Delete slot
async function deleteSlot(slotId) {
  if (!slotId) {
    throw new Error("Slot ID is required");
  }

  try {
    await fhirApi.delete(`/Slot/${slotId}`);

    // Invalidate cache
    await deleteFromCache(`slot:${slotId}`);

    return { success: true, message: "Slot deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Slot not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete slot.");
    }
  }
}

// Helper function to invalidate slot caches
async function invalidateSlotCache(slotId, slotData) {
  // Invalidate slot cache
  await deleteFromCache(`slot:${slotId}`);

  // Invalidate schedule slots cache if schedule reference exists
  if (slotData.schedule?.reference) {
    const scheduleId = slotData.schedule.reference.split("/")[1];
    await deleteFromCache(`slots:schedule:${scheduleId}:status:all`);
    await deleteFromCache(
      `slots:schedule:${scheduleId}:status:${slotData.status || "all"}`,
    );
  }
}

module.exports = {
  getSlotsBySchedule,
  getAvailableSlots,
  getSlotById,
  createSlotWithSpecificId,
  createSlot,
  updateSlot,
  deleteSlot,
};
