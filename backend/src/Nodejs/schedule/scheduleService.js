const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const {
  getFromCache,
  setInCache,
  deleteFromCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");
const slotService = require("../slot/slotService");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch schedules by actor (practitioner, location, etc.)
async function getSchedulesByActor(actorReference) {
  const cacheKey = `schedules:actor:${actorReference}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Schedule?actor=${actorReference}`);
    const bundle = response.data;

    // Extract resources from bundle entries
    let schedules = [];
    if (bundle.entry && bundle.entry.length > 0) {
      schedules = bundle.entry.map((entry) => entry.resource);
    }

    // Store in cache
    await setInCache(cacheKey, schedules, CACHE_EXPIRATION.DEFAULT);

    return schedules;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch schedules.");
  }
}

// Fetch schedule by ID
async function getScheduleById(scheduleId) {
  const cacheKey = `schedule:${scheduleId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Schedule/${scheduleId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Schedule not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create schedule with specific ID
async function createScheduleWithSpecificId(scheduleData) {
  const scheduleId = scheduleData.id;
  if (!scheduleId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirScheduleResource = {
    resourceType: "Schedule",
    ...scheduleData,
  };

  console.log(`Attempting to PUT schedule to /Schedule/${scheduleId}`);

  try {
    const response = await fhirApi.put(
      `/Schedule/${scheduleId}`,
      fhirScheduleResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateScheduleCache(scheduleId, scheduleData);

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

// Create schedule (auto-generated ID)
async function createSchedule(scheduleData) {
  const fhirScheduleResource = {
    resourceType: "Schedule",
    ...scheduleData,
  };

  console.log("Attempting to POST schedule to /Schedule");

  try {
    const response = await fhirApi.post("/Schedule", fhirScheduleResource);

    // Invalidate caches after successful creation
    await invalidateScheduleCache(response.data.id, scheduleData);

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

// Update schedule
async function updateSchedule(scheduleId, scheduleData) {
  if (!scheduleId) {
    throw new Error("Schedule ID is required");
  }

  // Get existing schedule
  let existingSchedule;
  try {
    existingSchedule = await getScheduleById(scheduleId);
  } catch (error) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingSchedule,
    ...scheduleData,
    resourceType: "Schedule",
    id: scheduleId,
  };

  try {
    const response = await fhirApi.put(`/Schedule/${scheduleId}`, updateData);
    const schedule = response.data;

    // Invalidate caches after successful update
    await invalidateScheduleCache(scheduleId, schedule);

    return schedule;
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

// Delete schedule
async function deleteSchedule(scheduleId) {
  if (!scheduleId) {
    throw new Error("Schedule ID is required");
  }

  try {
    await fhirApi.delete(`/Schedule/${scheduleId}`);

    // Invalidate cache
    await deleteFromCache(`schedule:${scheduleId}`);

    return { success: true, message: "Schedule deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Schedule not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete schedule.");
    }
  }
}

// Helper function to invalidate schedule caches
async function invalidateScheduleCache(scheduleId, scheduleData) {
  // Invalidate schedule cache
  await deleteFromCache(`schedule:${scheduleId}`);

  // Invalidate actor schedules cache if actor reference exists
  if (scheduleData.actor) {
    for (const actor of scheduleData.actor) {
      if (actor.reference) {
        await deleteFromCache(`schedules:actor:${actor.reference}`);
      }
    }
  }
}

// Get schedules with their associated slots for a practitioner
async function getSchedulesWithSlotsByPractitioner(practitionerId, slotStatus) {
  try {
    // Fetch all schedules for the practitioner
    const actorReference = `Practitioner/${practitionerId}`;
    const schedules = await getSchedulesByActor(actorReference);

    if (!schedules || schedules.length === 0) {
      console.log(`No schedules found for ${actorReference}`);
      return [];
    }

    // For each schedule, fetch its slots
    const schedulesWithSlots = [];
    for (const schedule of schedules) {
      const scheduleId = schedule.id;
      console.log(
        `Fetching slots for Schedule/${scheduleId} with status: ${slotStatus || "all"}`,
      );

      try {
        // Fetch slots for this specific schedule using getSlotsBySchedule
        const slotsBundle = await slotService.getSlotsBySchedule(
          scheduleId,
          slotStatus,
        );

        // Extract slots from bundle
        const slots = [];
        if (slotsBundle.entry && slotsBundle.entry.length > 0) {
          for (const entry of slotsBundle.entry) {
            const slot = entry.resource;
            slots.push({
              id: slot.id,
              scheduleReference:
                slot.schedule?.reference || `Schedule/${scheduleId}`,
              start: slot.start,
              end: slot.end,
              status: slot.status,
            });
          }
        }

        // Add schedule with its slots to result
        schedulesWithSlots.push({
          schedule: {
            id: schedule.id,
            active: schedule.active,
            actor: schedule.actor,
            planningHorizon: schedule.planningHorizon,
            comment: schedule.comment,
          },
          slots: slots,
        });
      } catch (slotError) {
        console.error(
          `Error fetching slots for Schedule/${scheduleId}:`,
          slotError.message,
        );
        // Still add the schedule but with empty slots array
        schedulesWithSlots.push({
          schedule: {
            id: schedule.id,
            active: schedule.active,
            actor: schedule.actor,
            planningHorizon: schedule.planningHorizon,
            comment: schedule.comment,
          },
          slots: [],
        });
      }
    }

    console.log(
      `Found ${schedulesWithSlots.length} schedules with slots for ${actorReference}`,
    );
    return schedulesWithSlots;
  } catch (error) {
    console.error(
      "Error in getSchedulesWithSlotsByPractitioner:",
      error.message,
    );
    throw new Error("Could not fetch schedules with slots for practitioner.");
  }
}

module.exports = {
  getSchedulesByActor,
  getScheduleById,
  getSchedulesWithSlotsByPractitioner,
  createScheduleWithSpecificId,
  createSchedule,
  updateSchedule,
  deleteSchedule,
};
