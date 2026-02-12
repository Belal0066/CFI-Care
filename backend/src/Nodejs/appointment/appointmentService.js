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

// Fetch all appointments for a patient
async function getAppointmentsByPatient(patientId) {
  const cacheKey = `appointments:patient:${patientId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Appointment?patient=Patient/${patientId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient appointments.");
  }
}

// Fetch all appointments for a practitioner
async function getAppointmentsByPractitioner(practitionerId) {
  const cacheKey = `appointments:practitioner:${practitionerId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(
      `/Appointment?actor=Practitioner/${practitionerId}`,
    );
    const bundle = response.data;

    // Store in cache
    await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch practitioner appointments.");
  }
}

// Fetch appointment by ID
async function getAppointmentById(appointmentId) {
  const cacheKey = `appointment:${appointmentId}`;

  try {
    // Check cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    const response = await fhirApi.get(`/Appointment/${appointmentId}`);
    const data = response.data;

    // Store in cache
    await setInCache(cacheKey, data, CACHE_EXPIRATION.DEFAULT);

    return data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Appointment not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

// Create appointment with specific ID
async function createAppointmentWithSpecificId(appointmentData) {
  const appointmentId = appointmentData.id;
  if (!appointmentId) {
    throw new Error(
      "The JSON body is missing the required 'id' field for this operation.",
    );
  }

  const fhirAppointmentResource = {
    resourceType: "Appointment",
    ...appointmentData,
  };

  console.log(`Attempting to PUT appointment to /Appointment/${appointmentId}`);

  try {
    const response = await fhirApi.put(
      `/Appointment/${appointmentId}`,
      fhirAppointmentResource,
    );

    // Invalidate caches after successful creation/update
    await invalidateAppointmentCache(appointmentId, appointmentData);

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

// Create appointment (auto-generated ID)
async function createAppointment(appointmentData) {
  const fhirAppointmentResource = {
    resourceType: "Appointment",
    ...appointmentData,
  };

  console.log("Attempting to POST appointment to /Appointment");

  try {
    const response = await fhirApi.post(
      "/Appointment",
      fhirAppointmentResource,
    );

    // Invalidate caches after successful creation
    await invalidateAppointmentCache(response.data.id, appointmentData);

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

// Update appointment
async function updateAppointment(appointmentId, appointmentData) {
  if (!appointmentId) {
    throw new Error("Appointment ID is required");
  }

  // Get existing appointment
  let existingAppointment;
  try {
    existingAppointment = await getAppointmentById(appointmentId);
  } catch (error) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }

  // Merge with existing data
  const updateData = {
    ...existingAppointment,
    ...appointmentData,
    resourceType: "Appointment",
    id: appointmentId,
  };

  try {
    const response = await fhirApi.put(
      `/Appointment/${appointmentId}`,
      updateData,
    );
    const appointment = response.data;

    // Invalidate caches after successful update
    await invalidateAppointmentCache(appointmentId, appointment);

    return appointment;
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

// Delete appointment
async function deleteAppointment(appointmentId) {
  if (!appointmentId) {
    throw new Error("Appointment ID is required");
  }

  try {
    await fhirApi.delete(`/Appointment/${appointmentId}`);

    // Invalidate cache
    await deleteFromCache(`appointment:${appointmentId}`);

    return { success: true, message: "Appointment deleted successfully" };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Appointment not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not delete appointment.");
    }
  }
}

// Helper function to invalidate appointment caches
async function invalidateAppointmentCache(appointmentId, appointmentData) {
  // Invalidate appointment cache
  await deleteFromCache(`appointment:${appointmentId}`);

  // Invalidate patient appointments cache if patient reference exists
  if (appointmentData.participant) {
    for (const participant of appointmentData.participant) {
      if (participant.actor?.reference?.startsWith("Patient/")) {
        const patientId = participant.actor.reference.split("/")[1];
        await deleteFromCache(`appointments:patient:${patientId}`);
      }
      if (participant.actor?.reference?.startsWith("Practitioner/")) {
        const practitionerId = participant.actor.reference.split("/")[1];
        await deleteFromCache(`appointments:practitioner:${practitionerId}`);
      }
    }
  }
}

module.exports = {
  getAppointmentsByPatient,
  getAppointmentsByPractitioner,
  getAppointmentById,
  createAppointmentWithSpecificId,
  createAppointment,
  updateAppointment,
  deleteAppointment,
};
