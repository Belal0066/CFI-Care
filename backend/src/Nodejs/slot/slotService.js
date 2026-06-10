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

async function fetchAllBundleEntries(initialPath) {
  const entries = [];
  let nextPath = initialPath;
  let pageGuard = 0;

  while (nextPath && pageGuard < 50) {
    pageGuard += 1;
    const response = await fhirApi.get(nextPath);
    const bundle = response.data || {};

    if (Array.isArray(bundle.entry)) {
      entries.push(...bundle.entry);
    }

    const nextLink = (bundle.link || []).find(
      (link) => link.relation === "next",
    );
    nextPath = nextLink?.url || null;
  }

  return entries;
}

// Fetch slots by schedule
async function getSlotsBySchedule(scheduleId, status) {
  const statusParam = status ? `&status=${status}` : "";
  const cacheKey = `slots:schedule:${scheduleId}:status:${status || "all"}`;
  const dirtyKey = `${cacheKey}:dirty`;

  try {
    // Skip cache during the dirty window after a write to prevent stale re-caching
    const isDirty = await getFromCache(dirtyKey);
    if (!isDirty) {
      const cachedData = await getFromCache(cacheKey);
      if (cachedData) return cachedData;
    }

    const response = await fhirApi.get(
      `/Slot?schedule=${scheduleId}${statusParam}`,
    );
    const bundle = response.data;

    if (!isDirty) {
      await setInCache(cacheKey, bundle, CACHE_EXPIRATION.SHORT);
    }

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

// Fetch slots for a specific practitioner 
// Optional status filter 
async function getSlotsByPractitioner(practitionerId, status) {
  try {
    // Always fetch fresh data - no caching for slot availability
    // This ensures users always see the most up-to-date slot availability

    // Get all schedules for this practitioner
    console.log(`Fetching schedules for Practitioner/${practitionerId}`);
    const schedulesResponse = await fhirApi.get(
      `/Schedule?actor=Practitioner/${practitionerId}`,
    );
    const schedulesBundle = schedulesResponse.data;

    if (!schedulesBundle.entry || schedulesBundle.entry.length === 0) {
      console.log(`No schedules found for Practitioner/${practitionerId}`);
      return [];
    }

    // Fetch slots for all schedules in parallel
    const statusQuery = status ? `&status=${status}` : "";
    const slotArrays = await Promise.all(
      schedulesBundle.entry.map(async (scheduleEntry) => {
        const scheduleId = scheduleEntry.resource.id;
        try {
          const slotEntries = await fetchAllBundleEntries(
            `/Slot?schedule=Schedule/${scheduleId}${statusQuery}`,
          );
          return slotEntries
            .map((entry) => entry.resource)
            .filter((slot) => !!slot)
            .map((slot) => ({
              resourceType: "Slot",
              id: slot.id,
              schedule: slot.schedule,
              start: slot.start,
              end: slot.end,
              status: slot.status,
            }));
        } catch (slotError) {
          console.error(
            `Error fetching slots for Schedule/${scheduleId}:`,
            slotError.message,
          );
          return [];
        }
      }),
    );

    const allSlots = slotArrays.flat();
    console.log(
      `Found ${allSlots.length} ${status || "all"} slots for Practitioner/${practitionerId}`,
    );

    return allSlots;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch slots for practitioner.");
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

    // Use response.data so schedule references match exactly what FHIR stored
    await invalidateSlotCache(slotId, response.data);

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

    // Use response.data so schedule references match exactly what FHIR stored
    await invalidateSlotCache(response.data.id, response.data);

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
  await deleteFromCache(`slot:${slotId}`);

  if (slotData.schedule?.reference) {
    const scheduleId = slotData.schedule.reference.split("/")[1];
    const allKey = `slots:schedule:${scheduleId}:status:all`;
    const statusKey = `slots:schedule:${scheduleId}:status:${slotData.status || "all"}`;
    await deleteFromCache(allKey);
    await deleteFromCache(statusKey);
    // Set dirty flags for 15s to prevent stale re-caching during FHIR indexing window
    await setInCache(`${allKey}:dirty`, 1, 15);
    if (statusKey !== allKey) {
      await setInCache(`${statusKey}:dirty`, 1, 15);
    }
  }
}

module.exports = {
  getSlotsBySchedule,
  getAvailableSlots,
  getSlotsByPractitioner,
  getSlotById,
  createSlotWithSpecificId,
  createSlot,
  updateSlot,
  deleteSlot,
};
