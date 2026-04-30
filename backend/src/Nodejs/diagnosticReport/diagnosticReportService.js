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

// Fetch all diagnostic reports for a patient
async function getDiagnosticReportsByPatient(patientId, category) {
  const categoryParam = category ? `&category=${category}` : "";
  const cacheKey = `diagnosticReports:patient:${patientId}:category:${category || "all"}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/DiagnosticReport?patient=Patient/${patientId}${categoryParam}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient diagnostic reports.");
  }
}

// Fetch diagnostic report by ID
async function getDiagnosticReportById(diagnosticReportId) {
  const cacheKey = `diagnosticReport:${diagnosticReportId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/DiagnosticReport/${diagnosticReportId}`,
    );
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("DiagnosticReport not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create diagnostic report with specific ID
async function createDiagnosticReportWithSpecificId(diagnosticReportData) {
  const diagnosticReportId = diagnosticReportData.id;
  if (!diagnosticReportId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirDiagnosticReportResource = {
    resourceType: "DiagnosticReport",
    ...diagnosticReportData,
  };

  console.log(
    `Attempting to PUT diagnostic report to /DiagnosticReport/${diagnosticReportId}`,
  );

  try {
    const response = await fhirApi.put(
      `/DiagnosticReport/${diagnosticReportId}`,
      fhirDiagnosticReportResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateDiagnosticReportCache(
      diagnosticReportId,
      diagnosticReportData,
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

// Create diagnostic report (auto-generated ID)
async function createDiagnosticReport(diagnosticReportData) {
  const fhirDiagnosticReportResource = {
    resourceType: "DiagnosticReport",
    ...diagnosticReportData,
  };

  console.log("Attempting to POST diagnostic report to /DiagnosticReport");

  try {
    const response = await fhirApi.post(
      "/DiagnosticReport",
      fhirDiagnosticReportResource,
    );

    // Invalidate caches after successful creation
    await invalidateDiagnosticReportCache(
      response.data.id,
      diagnosticReportData,
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

// Update diagnostic report
async function updateDiagnosticReport(
  diagnosticReportId,
  diagnosticReportData,
) {
  if (!diagnosticReportId) {
    throw new Error("DiagnosticReport ID is required");
  }

  // Get existing diagnostic report
  let existingDiagnosticReport;
  try {
    existingDiagnosticReport =
      await getDiagnosticReportById(diagnosticReportId);
  } catch (error) {
    throw new Error(`DiagnosticReport ${diagnosticReportId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingDiagnosticReport,
    ...diagnosticReportData,
    resourceType: "DiagnosticReport",
    id: diagnosticReportId,
  };

  try {
    const response = await fhirApi.put(
      `/DiagnosticReport/${diagnosticReportId}`,
      updateData,
    );
    const diagnosticReport = response.data;

    // Invalidate caches after successful update
    await invalidateDiagnosticReportCache(diagnosticReportId, diagnosticReport);

    return diagnosticReport;
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

// Delete diagnostic report
async function deleteDiagnosticReport(diagnosticReportId) {
  if (!diagnosticReportId) {
    throw new Error("DiagnosticReport ID is required");
  }

  try {
    await fhirApi.delete(`/DiagnosticReport/${diagnosticReportId}`);

    // Invalidate cache
    await deleteFromCache(`diagnosticReport:${diagnosticReportId}`);

    return {
      success: true,
      message: "DiagnosticReport deleted successfully",
    };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("DiagnosticReport not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete diagnostic report.");
    }
  }
}

// Helper function to invalidate diagnostic report caches
async function invalidateDiagnosticReportCache(
  diagnosticReportId,
  diagnosticReportData,
) {
  // Invalidate diagnostic report cache
  await deleteFromCache(`diagnosticReport:${diagnosticReportId}`);

  // Invalidate patient diagnostic reports cache if patient reference exists
  if (diagnosticReportData.subject?.reference) {
    const patientId = diagnosticReportData.subject.reference.split("/")[1];
    await deleteFromCache(
      `diagnosticReports:patient:${patientId}:category:all`,
    );

    // Also invalidate category-specific cache if category exists
    if (diagnosticReportData.category) {
      const categories = Array.isArray(diagnosticReportData.category)
        ? diagnosticReportData.category
        : [diagnosticReportData.category];
      for (const cat of categories) {
        const categoryCode = cat.coding?.[0]?.code || cat;
        await deleteFromCache(
          `diagnosticReports:patient:${patientId}:category:${categoryCode}`,
        );
      }
    }
  }
}

module.exports = {
  getDiagnosticReportsByPatient,
  getDiagnosticReportById,
  createDiagnosticReportWithSpecificId,
  createDiagnosticReport,
  updateDiagnosticReport,
  deleteDiagnosticReport,
};
