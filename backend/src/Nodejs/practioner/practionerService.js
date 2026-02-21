const axios = require("axios");
const {
  getFromCache,
  setInCache,
  invalidatePractitionerCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");
const practitionerRoleService = require("../practitionerRole/practitionerRoleService");

const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// // Fetch Practitioner by ID
// async function getPractitionerById(practitionerId) {
//   const cacheKey = `practitioner:${practitionerId}`;

//   try {
//     // Check cache first
//     const cachedData = await getFromCache(cacheKey);
//     if (cachedData) {
//       return cachedData;
//     }

//     const response = await fhirApi.get(`/Practitioner/${practitionerId}`);
//     const data = response.data;

//     // Store in cache
//     await setInCache(cacheKey, data, CACHE_EXPIRATION.PRACTITIONER);

//     return data;
//   } catch (error) {
//     if (error.response && error.response.status === 404) {
//       throw new Error("Practitioner not found");
//     } else {
//       console.error("FHIR Server Error:", error.message);
//       throw new Error("Could not connect to the FHIR server.");
//     }
//   }
// }

// Fetch Practitioner by ID
async function getPractitionerById(practitionerId) {
  const cacheKey = `practitioner:${practitionerId}`;

  try {
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData; // Assuming cache stores the fully mapped Doctor object
    }

    // Fetch Base Practitioner from FHIR
    const response = await fhirApi.get(`/Practitioner/${practitionerId}`);
    const fhirPractitioner = response.data;

    // Fetch related Role and UI Metadata concurrently
    const [roleData, uiData] = await Promise.all([
      getPractitionerRoleData(practitionerId),
      getDoctorUIMetadata(practitionerId),
    ]);

    // Map to Flutter format
    const mappedDoctor = mapFhirPractitionerToDoctor(
      fhirPractitioner,
      roleData,
      uiData,
    );

    // Store in cache
    await setInCache(cacheKey, mappedDoctor, CACHE_EXPIRATION.PRACTITIONER);

    return mappedDoctor;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Practitioner not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create Practitioner With Specific ID
async function createPractitionerWithSpecificId(practitionerData) {
  const practitionerId = practitionerData.id;
  if (!practitionerId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirPractitionerResource = {
    resourceType: "Practitioner",
    ...practitionerData,
  };

  console.log(
    `Attempting to PUT practitioner to /Practitioner/${practitionerId}`,
  );
  try {
    const response = await fhirApi.put(
      `/Practitioner/${practitionerId}`,
      fhirPractitionerResource,
    );

    // Invalidate cache after successful creation/update
    await invalidatePractitionerCache(practitionerId);

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
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Update Practitioner
async function updatePractitioner(practitionerId, practitionerData) {
  if (!practitionerId) {
    throw new Error("Practitioner ID is required");
  }

  // Get existing practitioner
  let existingPractitioner;
  try {
    existingPractitioner = await getPractitionerById(practitionerId);
  } catch (error) {
    throw new Error(`Practitioner ${practitionerId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingPractitioner,
    ...practitionerData,
    resourceType: "Practitioner",
    id: practitionerId,
  };

  try {
    const response = await fhirApi.put(
      `/Practitioner/${practitionerId}`,
      updateData,
    );

    // Invalidate cache after successful update
    await invalidatePractitionerCache(practitionerId);

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

// Delete Practitioner
async function deletePractitioner(practitionerId) {
  if (!practitionerId) {
    throw new Error("Practitioner ID is required");
  }

  try {
    // Delete from FHIR server
    await fhirApi.delete(`/Practitioner/${practitionerId}`);

    // Invalidate cache after successful deletion
    await invalidatePractitionerCache(practitionerId);

    return { success: true, id: practitionerId };
  } catch (error) {
    if (error.response?.status === 404) {
      console.log(`Practitioner ${practitionerId} not found in FHIR`);
      await invalidatePractitionerCache(practitionerId);
      return { success: true, id: practitionerId, alreadyDeleted: true };
    }
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not delete practitioner.");
  }
}

// Maps a FHIR Practitioner + Role + UI Metadata to the Flutter Doctor model.
function mapFhirPractitionerToDoctor(fhirPractitioner, roleData, uiData) {
  // Extract Name
  let doctorName = "Unknown Doctor";
  if (fhirPractitioner.name && fhirPractitioner.name.length > 0) {
    const given = fhirPractitioner.name[0].given
      ? fhirPractitioner.name[0].given.join(" ")
      : "";
    const family = fhirPractitioner.name[0].family
      ? fhirPractitioner.name[0].family
      : "";
    doctorName = `${given} ${family}`.trim();
  }

  // Extract Address
  let doctorAddress = "No Address Provided";
  if (fhirPractitioner.address && fhirPractitioner.address.length > 0) {
    doctorAddress = fhirPractitioner.address[0].text || "Address on file";
  }

  // Extract Image URL
  let photoUrl = "assets/images/default_doctor.png";
  if (
    fhirPractitioner.photo &&
    fhirPractitioner.photo.length > 0 &&
    fhirPractitioner.photo[0].url
  ) {
    photoUrl = fhirPractitioner.photo[0].url;
  }

  return {
    id: fhirPractitioner.id || "",
    name: doctorName,
    imageUrl: photoUrl,
    address: doctorAddress,
    nextAvailable: "10:00 AM",

    // Injected from PractitionerRole Service
    title: roleData.title,
    specialtyDetail: roleData.specialtyDetail,

    // Injected from your local Database (UI Metadata)
    rating: parseFloat(uiData.rating),
    visitorCount: uiData.visitorCount,
    fees: uiData.fees,
    waitingTime: uiData.waitingTime,
    tags: uiData.tags,
    about: uiData.about,
    schedule: uiData.schedule,
    reviews: uiData.reviews,
  };
}

// Fetch All Practitioners
async function getAllPractitioners(specialtyFilter) {
  try {
    const response = await fhirApi.get(`/Practitioner`);
    const fhirBundle = response.data;

    if (!fhirBundle.entry || fhirBundle.entry.length === 0) {
      return [];
    }

    const mappedDoctorsPromises = fhirBundle.entry.map(async (entry) => {
      const p = entry.resource;

      // Fetch related data for each doctor
      const [roleData, uiData] = await Promise.all([
        getPractitionerRoleData(p.id),
        getDoctorUIMetadata(p.id),
      ]);

      return mapFhirPractitionerToDoctor(p, roleData, uiData);
    });

    let mappedDoctors = await Promise.all(mappedDoctorsPromises);

    // Server-side filter by specialtyDetail if provided
    if (specialtyFilter && specialtyFilter.trim() !== "") {
      mappedDoctors = mappedDoctors.filter((doctor) =>
        doctor.specialtyDetail
          .toLowerCase()
          .includes(specialtyFilter.toLowerCase()),
      );
    }

    return mappedDoctors;
  } catch (error) {
    console.error(
      "FHIR Server Error fetching all practitioners:",
      error.message,
    );
    throw new Error("Could not fetch practitioners from the FHIR server.");
  }
}

// Fetch Clinical Data from FHIR (PractitionerRole)
//Uses your existing practitionerRoleService to get specialty and title.
async function getPractitionerRoleData(practitionerId) {
  try {
    // Call the function from your practitionerRoleService.js
    const bundle =
      await practitionerRoleService.getPractitionerRolesByPractitioner(
        practitionerId,
      );

    if (bundle.entry && bundle.entry.length > 0) {
      const role = bundle.entry[0].resource;

      // Extract Specialty
      const specialty =
        role.specialty && role.specialty[0] && role.specialty[0].coding
          ? role.specialty[0].coding[0].display
          : "Dermatology";

      // Extract Title from PractitionerRole if Practitioner lacks it
      const title =
        role.code && role.code[0] && role.code[0].coding
          ? role.code[0].coding[0].display
          : "Dermatology Specialist";

      return { specialtyDetail: specialty, title: title };
    }
  } catch (error) {
    console.error(`Could not fetch role for ${practitionerId}:`, error.message);
  }

  // Fallbacks if the doctor doesn't have a PractitionerRole assigned yet
  return { specialtyDetail: "Dermatology", title: "General Practitioner" };
}

// Fetch UI Metadata from Database (Ratings, Reviews, Fees) ( Ghaleban Ha3mel table fy database aw extension fy FHIR)
// FHIR does not store reviews or 5-star ratings. You must store these in your DB/Redis.
async function getDoctorUIMetadata(practitionerId) {
  // Mocked database response
  return {
    rating: (Math.random() * (5.0 - 4.0) + 4.0).toFixed(1), // Random rating between 4.0 and 5.0
    visitorCount: Math.floor(Math.random() * 500) + 50,
    fees: 150, // Default fee
    waitingTime: 20, // Default waiting time in minutes
    about:
      "A highly dedicated professional focused on delivering patient-centric healthcare.",
    tags: ["Experienced", "Friendly", "Professional"],
    reviews: [],
    schedule: [], // You can populate this from FHIR Schedule/Slot resources later
  };
}

module.exports = {
  getPractitionerById,
  createPractitionerWithSpecificId,
  updatePractitioner,
  deletePractitioner,
  getAllPractitioners,
};
