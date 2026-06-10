const axios = require("axios");
const {
  getFromCache,
  setInCache,
  invalidatePatientCache,
  deleteFromCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// Fetch patient by ID with Caching and Authorization
async function getPatientById(patientId, accessToken) {
  const cacheKey = `patient:${patientId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const config = {};
    if (accessToken) {
      config.headers = {
        Authorization: `Bearer ${accessToken}`,
      };
    }

    const response = await fhirApi.get(`/Patient/${patientId}`, config);
    const data = response.data;

    await setInCache(cacheKey, data, CACHE_EXPIRATION.PATIENT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Normalize any common date format to YYYY-MM-DD (required by FHIR).
function normalizeFhirDate(str) {
  if (!str || typeof str !== 'string') return str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dm = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  // YYYY/MM/DD or YYYY.MM.DD
  const yd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (yd) return `${yd[1]}-${yd[2].padStart(2, '0')}-${yd[3].padStart(2, '0')}`;
  return str;
}

// Create patient with Specific ID
async function createPatientWithSpecificId(patientData) {
  const patientId = patientData.id;

  if (!patientId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }
  const fhirPatientResource = {
    resourceType: "Patient",
    ...patientData,
  };

  // Normalize birthDate to YYYY-MM-DD
  if (fhirPatientResource.birthDate) {
    fhirPatientResource.birthDate = normalizeFhirDate(fhirPatientResource.birthDate);
  }

  // Inject minimal narrative (dom-6 best-practice; required in strict validation mode)
  if (!fhirPatientResource.text) {
    const namePart = (fhirPatientResource.name || [])[0];
    const displayName = namePart
      ? `${(namePart.given || []).join(' ')} ${namePart.family || ''}`.trim()
      : 'Patient';
    fhirPatientResource.text = {
      status: 'generated',
      div: `<div xmlns="http://www.w3.org/1999/xhtml">${displayName}</div>`,
    };
  }

  console.log(`Attempting to PUT patient to /Patient/${patientId}`);

  try {
    const response = await fhirApi.put(
      `/Patient/${patientId}`,
      fhirPatientResource,
    );

    // Invalidate patient caches after successful creation/update
    await invalidatePatientCache(patientId);

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

// Create patient (Server assigns ID)
async function createPatient(patientData) {
  const fhirPatientResource = {
    resourceType: "Patient",
    name: [
      {
        use: "official",
        family: patientData.lastName,
        given: [patientData.firstName],
      },
    ],
    telecom: [
      {
        system: "email",
        value: patientData.email,
        use: "home",
      },
    ],
    birthDate: patientData.birthDate,
  };

  try {
    const response = await fhirApi.post("/Patient", fhirPatientResource);

    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.error(
        "HAPI FHIR Validation Error:",
        JSON.stringify(error.response.data, null, 2),
      );
      throw new Error("FHIR server rejected the patient resource. Check data.");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Delete patient by ID
async function deletePatientById(patientId) {
  try {
    const response = await fhirApi.delete(`/Patient/${patientId}`);

    // Invalidate patient caches after successful deletion
    await invalidatePatientCache(patientId);

    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Read Patient data with specific version
async function getPatientByIdAndVersion(patientId, versionId) {
  const cacheKey = `patient:${patientId}:version:${versionId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Patient/${patientId}/_history/${versionId}`,
    );
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.PATIENT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient or version not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Get all related data for a patient
// async function getPatientAllRelatedData(patientId) {
//   const cacheKey = `patient:${patientId}:everything`;

//   try {
//     // Check cache first
//     const cachedData = await getFromCache(cacheKey);
//     if (cachedData) {
//       return cachedData;
//     }

//     const response = await fhirApi.get(`/Patient/${patientId}/$everything`);
//     const bundle = response.data;

//     // Store in cache
//     await setInCache(cacheKey, bundle, CACHE_EXPIRATION.PATIENT);

//     return bundle;
//   } catch (error) {
//     console.error("FHIR Server Error:", error.message);
//     throw new Error("Could not fetch patient related data.");
//   }
// }

// Get all related data for a patient
async function getPatientAllRelatedData(patientId) {
  const cacheKey = `patient:${patientId}:everything`;

  try {
    // 1. Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      console.log("Serving $everything from cache");
      return cachedData;
    }

    // 2. Initial Request (Fetch 100 items per page to reduce round-trips)
    console.log("Fetching fresh data from FHIR server...");
    let response = await fhirApi.get(
      `/Patient/${patientId}/$everything?_count=100`,
    );
    let bundle = response.data;

    // 3. Pagination Loop: Fetch all subsequent pages
    // Check if a 'next' link exists in the bundle
    let nextLink = bundle.link?.find((l) => l.relation === "next")?.url;

    while (nextLink) {
      console.log("Fetching next page of history...");

      // We use axios directly or fhirApi to fetch the absolute URL found in 'nextLink'
      // fhirApi is safer if you have auth headers configured in it
      const nextResponse = await fhirApi.get(nextLink);
      const nextBundle = nextResponse.data;

      // Append the new entries to our main bundle
      if (nextBundle.entry && nextBundle.entry.length > 0) {
        bundle.entry = bundle.entry
          ? bundle.entry.concat(nextBundle.entry)
          : nextBundle.entry;
      }

      // Look for the next 'next' link
      nextLink = nextBundle.link?.find((l) => l.relation === "next")?.url;
    }

    // 4. Store the COMPLETE bundle in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.PATIENT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient related data.");
  }
}

// Fetch the resource change history for all resources of patient
async function getPatientHistory(patientId) {
  const cacheKey = `patient:${patientId}:history`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Patient/${patientId}/_history`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.PATIENT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Patient not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Fetch all observations for a patient
async function getPatientObservations(patientId) {
  const cacheKey = `patient:${patientId}:observations`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Observation?patient=${patientId}`);
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.SEARCH);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient observations.");
  }
}

// Fetch all encounters for a patient
async function getPatientEncounters(patientId) {
  const cacheKey = `encounters:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Encounter?patient=${patientId}`);
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.ENCOUNTER);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient encounters.");
  }
}

// Fetch all patients
// If practitionerId is provided, filter by generalPractitioner
async function getAllPatients(practitionerId = null) {
  const cacheKey = practitionerId
    ? `patients:practitioner:${practitionerId}`
    : "patients:all";

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    let url = "/Patient?_count=100&_sort=-_lastUpdated";

    // If a practitioner ID is provided, filter patients by their general practitioner
    if (practitionerId) {
      url = `/Patient?general-practitioner=Practitioner/${practitionerId}&_count=100&_sort=-_lastUpdated`;
    }

    const response = await fhirApi.get(url);
    const bundle = response.data;

    // Transform FHIR Bundle to PatientSummaryDTO format for frontend
    if (!bundle.entry || bundle.entry.length === 0) {
      const result = [];
      await setInCache(cacheKey, result, CACHE_EXPIRATION.SEARCH);
      return result;
    }

    const result = bundle.entry.map((entry) => {
      const patient = entry.resource;
      const name = patient.name?.[0];
      const fullName = name
        ? `${name.given?.join(" ") || ""} ${name.family || ""}`.trim()
        : "Unknown";

      // Calculate age from birthDate
      let age = null;
      if (patient.birthDate) {
        const birthDate = new Date(patient.birthDate);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birthDate.getDate())
        ) {
          age--;
        }
      }

      return {
        id: patient.id,
        name: fullName,
        age: age,
        lastUpdated: patient.meta?.lastUpdated || new Date().toISOString(),
      };
    });

    // Store in cache
    await setInCache(cacheKey, result, CACHE_EXPIRATION.SEARCH);

    return result;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch all patients.");
  }
}

// Sync patient to FHIR - create patient with specific ID if not exists
async function syncPatientToFHIR(patientData) {
  const {
    id: patientId,
    firstName,
    lastName,
    email,
    phone,
    gender,
    dob,
  } = patientData;

  if (!patientId) {
    throw new Error("Patient ID is required");
  }

  // Build FHIR Patient resource using provided data or defaults
  const fhirPatient = {
    resourceType: "Patient",
    id: patientId,
    name: [
      {
        use: "official",
        family: lastName || "Unknown",
        given: [firstName || "User"],
      },
    ],
    telecom: [],
    gender: gender || "unknown",
  };

  // Add email if provided
  if (email) {
    fhirPatient.telecom.push({
      system: "email",
      value: email,
      use: "home",
    });
  }

  // Add phone if provided
  if (phone && phone.trim()) {
    fhirPatient.telecom.push({
      system: "phone",
      value: phone,
      use: "mobile",
    });
  }

  // Add birthDate if provided
  if (dob && dob.trim()) {
    fhirPatient.birthDate = dob;
  }

  // Add narrative for FHIR compliance
  fhirPatient.text = {
    status: "generated",
    div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Patient: ${firstName || "User"} ${lastName || "Unknown"}</p><p>Email: ${email || "N/A"}</p></div>`,
  };

  console.log(`Syncing patient to FHIR: /Patient/${patientId}`);

  try {
    const response = await fhirApi.put(`/Patient/${patientId}`, fhirPatient);
    console.log(`Patient ${patientId} synced to FHIR successfully.`);

    // Invalidate cache
    await invalidatePatientCache(patientId);

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

      throw new Error(`Failed to sync patient to FHIR: ${issueText}`);
    } else {
      console.error("Network/Server Error:", error.message);
      throw new Error("Could not connect to FHIR server: " + error.message);
    }
  }
}

module.exports = {
  deletePatientById,
  getPatientByIdAndVersion,
  getPatientHistory,
  createPatientWithSpecificId,
  createPatient,
  getPatientById,
  getPatientAllRelatedData,
  getPatientObservations,
  getPatientEncounters,
  getAllPatients,
  syncPatientToFHIR,
};
