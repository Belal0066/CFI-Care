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

// Fetch all imaging studies for a patient
async function getImagingStudiesByPatient(patientId, modality) {
  const modalityParam = modality ? `&modality=${modality}` : "";
  const cacheKey = `imagingStudies:patient:${patientId}:modality:${modality || "all"}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/ImagingStudy?patient=Patient/${patientId}${modalityParam}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient imaging studies.");
  }
}

// Fetch imaging study by ID
async function getImagingStudyById(imagingStudyId) {
  const cacheKey = `imagingStudy:${imagingStudyId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/ImagingStudy/${imagingStudyId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("ImagingStudy not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create imaging study with specific ID
async function createImagingStudyWithSpecificId(imagingStudyData) {
  const imagingStudyId = imagingStudyData.id;
  if (!imagingStudyId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirImagingStudyResource = {
    resourceType: "ImagingStudy",
    ...imagingStudyData,
  };

  console.log(
    `Attempting to PUT imaging study to /ImagingStudy/${imagingStudyId}`,
  );

  try {
    const response = await fhirApi.put(
      `/ImagingStudy/${imagingStudyId}`,
      fhirImagingStudyResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateImagingStudyCache(imagingStudyId, imagingStudyData);

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

// Create imaging study (auto-generated ID)
async function createImagingStudy(imagingStudyData) {
  const fhirImagingStudyResource = {
    resourceType: "ImagingStudy",
    ...imagingStudyData,
  };

  console.log("Attempting to POST imaging study to /ImagingStudy");

  try {
    const response = await fhirApi.post(
      "/ImagingStudy",
      fhirImagingStudyResource,
    );

    // Invalidate caches after successful creation
    await invalidateImagingStudyCache(response.data.id, imagingStudyData);

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

// Update imaging study
async function updateImagingStudy(imagingStudyId, imagingStudyData) {
  if (!imagingStudyId) {
    throw new Error("ImagingStudy ID is required");
  }

  // Get existing imaging study
  let existingImagingStudy;
  try {
    existingImagingStudy = await getImagingStudyById(imagingStudyId);
  } catch (error) {
    throw new Error(`ImagingStudy ${imagingStudyId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingImagingStudy,
    ...imagingStudyData,
    resourceType: "ImagingStudy",
    id: imagingStudyId,
  };

  try {
    const response = await fhirApi.put(
      `/ImagingStudy/${imagingStudyId}`,
      updateData,
    );
    const imagingStudy = response.data;

    // Invalidate caches after successful update
    await invalidateImagingStudyCache(imagingStudyId, imagingStudy);

    return imagingStudy;
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

// Delete imaging study
async function deleteImagingStudy(imagingStudyId) {
  if (!imagingStudyId) {
    throw new Error("ImagingStudy ID is required");
  }

  try {
    await fhirApi.delete(`/ImagingStudy/${imagingStudyId}`);

    // Invalidate cache
    await deleteFromCache(`imagingStudy:${imagingStudyId}`);

    return { success: true, message: "ImagingStudy deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("ImagingStudy not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete imaging study.");
    }
  }
}

// Helper function to invalidate imaging study caches
async function invalidateImagingStudyCache(imagingStudyId, imagingStudyData) {
  // Invalidate imaging study cache
  await deleteFromCache(`imagingStudy:${imagingStudyId}`);

  // Invalidate patient imaging studies cache if patient reference exists
  if (imagingStudyData.subject?.reference) {
    const patientId = imagingStudyData.subject.reference.split("/")[1];
    await deleteFromCache(`imagingStudies:patient:${patientId}:modality:all`);

    // Also invalidate modality-specific cache if modality exists
    if (imagingStudyData.modality) {
      const modalities = Array.isArray(imagingStudyData.modality)
        ? imagingStudyData.modality
        : [imagingStudyData.modality];
      for (const mod of modalities) {
        const modalityCode = mod.coding?.[0]?.code || mod.code;
        await deleteFromCache(
          `imagingStudies:patient:${patientId}:modality:${modalityCode}`,
        );
      }
    }
  }
}

module.exports = {
  getImagingStudiesByPatient,
  getImagingStudyById,
  createImagingStudyWithSpecificId,
  createImagingStudy,
  updateImagingStudy,
  deleteImagingStudy,
};
