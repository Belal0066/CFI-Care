const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const {
  getFromCache,
  setInCache,
  invalidateEncounterCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Get Encounter by ID
async function getEncounterById(encounterId) {
  const cacheKey = `encounter:${encounterId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Encounter/${encounterId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.ENCOUNTER);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Encounter not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Get Everything related to an Encounter
async function getEncounterEverything(encounterId) {
  const cacheKey = `encounter:${encounterId}:everything`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Encounter/${encounterId}/$everything`);
    const data = response.data.entry
      ? response.data.entry.map((e) => e.resource)
      : [];

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.ENCOUNTER);

    return data;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }
}

// Create Patient with Specific ID
async function createEncounterWithSpecificId(encounterData) {
  const encounterId = encounterData.id;
  if (!encounterId) {
    throw new Error("Encounter ID is required");
  }
  const fhirEncounterResource = {
    resourceType: "Encounter",
    ...encounterData,
  };
  console.log(`Attempting to PUT Encounter to /Encounter/${encounterId}`);
  try {
    // FHIR Server PUT Request
    const response = await fhirApi.put(
      `/Encounter/${encounterId}`,
      fhirEncounterResource,
    );

    // Invalidate cache after successful creation
    const patientId = encounterData.subject?.reference?.split("/")[1];
    await invalidateEncounterCache(encounterId, patientId);

    return { data: response.data, id: response.data.id };
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

// Create Encounter with Specific ID for EpisodeOfCare
async function createEncounterWithSpecificIdForEOC(
  patientId,
  encounterData,
  episodeOfCareId,
) {
  const encounterId = encounterData.id;
  if (!encounterId) {
    throw new Error("Encounter ID is required");
  }

  const fhirEncounterResource = {
    resourceType: "Encounter",
    id: encounterId,
    status: encounterData.status || "finished",

    text: encounterData.text || {
      status: "generated",
      div: `<div xmlns="http://www.w3.org/1999/xhtml">Encounter for Patient ${patientId}</div>`,
    },

    class: encounterData.class || [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: "AMB",
            display: "ambulatory",
          },
        ],
      },
    ],

    type: encounterData.type || [],
    serviceType: encounterData.serviceType || [],
    priority: encounterData.priority || undefined,
    reason: encounterData.reason || [],

    episodeOfCare: [
      {
        reference: `EpisodeOfCare/${episodeOfCareId}`,
      },
    ],
    subject: {
      reference: `Patient/${patientId}`,
    },

    actualPeriod: encounterData.actualPeriod || undefined,
  };

  console.log(`Attempting to PUT Encounter to /Encounter/${encounterId}`);

  try {
    // Create in FHIR Only (Database insertion handled by historyGraphService)
    const response = await createEncounterWithSpecificId(fhirEncounterResource);

    return { data: response.data, id: response.data.id };
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

// Update an existing Encounter in FHIR
async function updateEncounter(encounterId, encounterData) {
  if (!encounterId) {
    throw new Error("Encounter ID is required");
  }

  // First, get the existing encounter to preserve fields we don't want to change
  let existingEncounter;
  try {
    existingEncounter = await getEncounterById(encounterId);
  } catch (error) {
    throw new Error(`Encounter ${encounterId} not found in FHIR server`);
  }

  // Merge existing data with updated data
  const fhirEncounterResource = {
    ...existingEncounter,
    ...encounterData,
    resourceType: "Encounter",
    id: encounterId,
  };

  console.log(
    `Attempting to PUT (update) Encounter to /Encounter/${encounterId}`,
  );

  try {
    const response = await fhirApi.put(
      `/Encounter/${encounterId}`,
      fhirEncounterResource,
    );

    // Invalidate cache after successful update
    const patientId = fhirEncounterResource.subject?.reference?.split("/")[1];
    await invalidateEncounterCache(encounterId, patientId);

    return { data: response.data, id: response.data.id };
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
      throw new Error(`FHIR Update Failed: ${issueText}`);
    } else {
      console.error("Network/Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Delete an Encounter from FHIR
async function deleteEncounter(encounterId) {
  if (!encounterId) {
    throw new Error("Encounter ID is required");
  }

  console.log(`Attempting to DELETE Encounter /Encounter/${encounterId}`);

  try {
    const response = await fhirApi.delete(`/Encounter/${encounterId}`);

    // Invalidate cache after successful deletion
    await invalidateEncounterCache(encounterId);

    return { success: true, id: encounterId };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      // Already deleted or doesn't exist - treat as success
      console.log(
        `Encounter ${encounterId} not found in FHIR (may already be deleted)`,
      );

      // Still invalidate cache to ensure consistency
      await invalidateEncounterCache(encounterId);

      return { success: true, id: encounterId, alreadyDeleted: true };
    } else if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Deletion Details:",
        JSON.stringify(error.response.data, null, 2),
      );
      const issueText = error.response.data.issue
        ? error.response.data.issue
            .map((i) => `${i.diagnostics || i.code}`)
            .join(", ")
        : error.response.statusText;
      throw new Error(`FHIR Deletion Failed: ${issueText}`);
    } else {
      console.error("Network/Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

module.exports = {
  getEncounterById,
  getEncounterEverything,
  createEncounterWithSpecificId,
  createEncounterWithSpecificIdForEOC,
  updateEncounter,
  deleteEncounter,
};
