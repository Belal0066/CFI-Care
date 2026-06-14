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

// Fetch all medication requests for a patient
async function getMedicationRequestsByPatientId(patientId) {
  const cacheKey = `medicationRequests:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/MedicationRequest?subject=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.MEDICATION_REQUEST);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient medication requests.");
  }
}

// Fetch medication request by ID
async function getMedicationRequestById(medicationRequestId) {
  const cacheKey = `medicationRequest:${medicationRequestId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/MedicationRequest/${medicationRequestId}`,
    );
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.MEDICATION_REQUEST);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("MedicationRequest not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Fetch medication requests by encounter ID
async function getMedicationRequestsByEncounterId(encounterId) {
  const cacheKey = `medicationRequests:encounter:${encounterId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/MedicationRequest?encounter=Encounter/${encounterId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.MEDICATION_REQUEST);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch medication requests for encounter.");
  }
}

// Fetch medication requests by practitioner (prescriber)
async function getMedicationRequestsByPractitionerId(practitionerId) {
  const cacheKey = `medicationRequests:practitioner:${practitionerId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/MedicationRequest?requester=Practitioner/${practitionerId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.MEDICATION_REQUEST);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch medication requests for practitioner.");
  }
}

// Fetch medication requests by status
async function getMedicationRequestsByStatus(patientId, status) {
  const cacheKey = `medicationRequests:patient:${patientId}:status:${status}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/MedicationRequest?subject=Patient/${patientId}&status=${status}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.MEDICATION_REQUEST);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch medication requests by status.");
  }
}

// Create medication request with specific ID
async function createMedicationRequestWithSpecificId(medicationRequestData) {
  const medicationRequestId = medicationRequestData.id;

  if (!medicationRequestId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirMedicationRequestResource = {
    resourceType: "MedicationRequest",
    ...medicationRequestData,
  };

  console.log(
    `Attempting to PUT medication request to /MedicationRequest/${medicationRequestId}`,
  );

  try {
    const response = await fhirApi.put(
      `/MedicationRequest/${medicationRequestId}`,
      fhirMedicationRequestResource,
    );

    // Invalidate related caches after successful creation/update
    const patientId = medicationRequestData.subject?.reference?.split("/")[1];
    if (patientId) {
      await deleteFromCache([
        `medicationRequests:patient:${patientId}`,
        `medicationRequests:patient:${patientId}:status:*`,
      ]);
    }

    const encounterId =
      medicationRequestData.encounter?.reference?.split("/")[1];
    if (encounterId) {
      await deleteFromCache(`medicationRequests:encounter:${encounterId}`);
    }

    const practitionerId =
      medicationRequestData.requester?.reference?.split("/")[1];
    if (practitionerId) {
      await deleteFromCache(
        `medicationRequests:practitioner:${practitionerId}`,
      );
    }

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

// Update medication request
async function updateMedicationRequest(
  medicationRequestId,
  medicationRequestData,
) {
  if (!medicationRequestId) {
    throw new Error("MedicationRequest ID is required");
  }

  // First, get the existing medication request to preserve fields
  let existingMedicationRequest;
  try {
    existingMedicationRequest =
      await getMedicationRequestById(medicationRequestId);
  } catch (error) {
    throw new Error(
      `MedicationRequest ${medicationRequestId} not found in FHIR server`,
    );
  }

  // Merge existing data with updated data
  const fhirMedicationRequestResource = {
    ...existingMedicationRequest,
    ...medicationRequestData,
    resourceType: "MedicationRequest",
    id: medicationRequestId,
  };

  console.log(
    `Attempting to PUT (update) MedicationRequest to /MedicationRequest/${medicationRequestId}`,
  );

  try {
    const response = await fhirApi.put(
      `/MedicationRequest/${medicationRequestId}`,
      fhirMedicationRequestResource,
    );

    // Invalidate cache after successful update
    const patientId =
      fhirMedicationRequestResource.subject?.reference?.split("/")[1];
    if (patientId) {
      await deleteFromCache([
        `medicationRequests:patient:${patientId}`,
        `medicationRequest:${medicationRequestId}`,
      ]);
    }

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

      throw new Error(`FHIR Update Failed: ${issueText}`);
    } else {
      console.error("Network/Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Delete medication request
async function deleteMedicationRequest(medicationRequestId) {
  if (!medicationRequestId) {
    throw new Error("MedicationRequest ID is required");
  }

  console.log(
    `Attempting to DELETE MedicationRequest /MedicationRequest/${medicationRequestId}`,
  );

  try {
    const response = await fhirApi.delete(
      `/MedicationRequest/${medicationRequestId}`,
    );

    // Invalidate cache after successful deletion
    await deleteFromCache(`medicationRequest:${medicationRequestId}`);

    return { success: true, id: medicationRequestId };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(
        `MedicationRequest ${medicationRequestId} not found in FHIR (may already be deleted)`,
      );

      // Still invalidate cache to ensure consistency
      await deleteFromCache(`medicationRequest:${medicationRequestId}`);

      return { success: true, id: medicationRequestId, alreadyDeleted: true };
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
  getMedicationRequestById,
  getMedicationRequestsByPatientId,
  getMedicationRequestsByEncounterId,
  getMedicationRequestsByPractitionerId,
  getMedicationRequestsByStatus,
  createMedicationRequestWithSpecificId,
  updateMedicationRequest,
  deleteMedicationRequest,
};
