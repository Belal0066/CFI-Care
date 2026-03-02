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

// Fetch all document references for a patient
async function getDocumentReferencesByPatient(patientId, type, category) {
  const typeParam = type ? `&type=${type}` : "";
  const categoryParam = category ? `&category=${category}` : "";
  const cacheKey = `documentReferences:patient:${patientId}:type:${type || "all"}:category:${category || "all"}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/DocumentReference?patient=Patient/${patientId}${typeParam}${categoryParam}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient document references.");
  }
}

// Fetch document reference by ID
async function getDocumentReferenceById(documentReferenceId) {
  const cacheKey = `documentReference:${documentReferenceId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/DocumentReference/${documentReferenceId}`,
    );
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("DocumentReference not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create document reference with specific ID
async function createDocumentReferenceWithSpecificId(documentReferenceData) {
  const documentReferenceId = documentReferenceData.id;
  if (!documentReferenceId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirDocumentReferenceResource = {
    resourceType: "DocumentReference",
    ...documentReferenceData,
  };

  console.log(
    `Attempting to PUT document reference to /DocumentReference/${documentReferenceId}`,
  );

  try {
    const response = await fhirApi.put(
      `/DocumentReference/${documentReferenceId}`,
      fhirDocumentReferenceResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateDocumentReferenceCache(
      documentReferenceId,
      documentReferenceData,
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

// Create document reference (auto-generated ID)
async function createDocumentReference(documentReferenceData) {
  const fhirDocumentReferenceResource = {
    resourceType: "DocumentReference",
    ...documentReferenceData,
  };

  console.log("Attempting to POST document reference to /DocumentReference");

  try {
    const response = await fhirApi.post(
      "/DocumentReference",
      fhirDocumentReferenceResource,
    );

    // Invalidate caches after successful creation
    await invalidateDocumentReferenceCache(
      response.data.id,
      documentReferenceData,
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

// Update document reference
async function updateDocumentReference(
  documentReferenceId,
  documentReferenceData,
) {
  if (!documentReferenceId) {
    throw new Error("DocumentReference ID is required");
  }

  // Get existing document reference
  let existingDocumentReference;
  try {
    existingDocumentReference =
      await getDocumentReferenceById(documentReferenceId);
  } catch (error) {
    throw new Error(`DocumentReference ${documentReferenceId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingDocumentReference,
    ...documentReferenceData,
    resourceType: "DocumentReference",
    id: documentReferenceId,
  };

  try {
    const response = await fhirApi.put(
      `/DocumentReference/${documentReferenceId}`,
      updateData,
    );
    const documentReference = response.data;

    // Invalidate caches after successful update
    await invalidateDocumentReferenceCache(
      documentReferenceId,
      documentReference,
    );

    return documentReference;
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

// Delete document reference
async function deleteDocumentReference(documentReferenceId) {
  if (!documentReferenceId) {
    throw new Error("DocumentReference ID is required");
  }

  try {
    await fhirApi.delete(`/DocumentReference/${documentReferenceId}`);

    // Invalidate cache
    await deleteFromCache(`documentReference:${documentReferenceId}`);

    return {
      success: true,
      message: "DocumentReference deleted successfully",
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("DocumentReference not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete document reference.");
    }
  }
}

// Helper function to invalidate document reference caches
async function invalidateDocumentReferenceCache(
  documentReferenceId,
  documentReferenceData,
) {
  // Invalidate document reference cache
  await deleteFromCache(`documentReference:${documentReferenceId}`);

  // Invalidate patient document references cache if patient reference exists
  if (documentReferenceData.subject?.reference) {
    const patientId = documentReferenceData.subject.reference.split("/")[1];
    await deleteFromCache(
      `documentReferences:patient:${patientId}:type:all:category:all`,
    );

    // Also invalidate type-specific and category-specific caches
    const types = documentReferenceData.type?.coding || [];
    const categories = documentReferenceData.category || [];

    for (const type of types) {
      await deleteFromCache(
        `documentReferences:patient:${patientId}:type:${type.code}:category:all`,
      );
    }

    for (const category of categories) {
      const categoryCode = category.coding?.[0]?.code || category;
      await deleteFromCache(
        `documentReferences:patient:${patientId}:type:all:category:${categoryCode}`,
      );
    }
  }
}

module.exports = {
  getDocumentReferencesByPatient,
  getDocumentReferenceById,
  createDocumentReferenceWithSpecificId,
  createDocumentReference,
  updateDocumentReference,
  deleteDocumentReference,
};
