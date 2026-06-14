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

// Fetch all appointments for a patient
async function getAppointmentsByPatient(patientId) {
  const cacheKey = `appointments:patient:${patientId}`;
  const dirtyKey = `${cacheKey}:dirty`;

  try {
    const isDirty = await getFromCache(dirtyKey);
    if (!isDirty) {
      const cachedData = await getFromCache(cacheKey);
      if (cachedData) return cachedData;
    }

    const response = await fhirApi.get(
      `/Appointment?patient=Patient/${patientId}`,
    );
    const bundle = response.data;

    if (!isDirty) {
      await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);
    }

    return bundle;
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not fetch patient appointments.");
  }
}

// Fetch all appointments for a practitioner, enriched with patient display names
async function getAppointmentsByPractitioner(practitionerId) {
  const cacheKey = `appointments:practitioner:${practitionerId}`;
  const dirtyKey = `${cacheKey}:dirty`;

  try {
    const isDirty = await getFromCache(dirtyKey);
    if (!isDirty) {
      const cachedData = await getFromCache(cacheKey);
      if (cachedData) return cachedData;
    }

    const response = await fhirApi.get(
      `/Appointment?actor=Practitioner/${practitionerId}`,
    );
    const bundle = response.data;

    // Enrich each appointment entry with the patient's display name so the
    // frontend doesn't need a separate (consent-gated) patient API call.
    if (Array.isArray(bundle.entry) && bundle.entry.length > 0) {
      const patientIds = new Set();
      for (const entry of bundle.entry) {
        const appt = entry.resource || {};
        for (const p of appt.participant || []) {
          const ref = p.actor?.reference || "";
          if (ref.startsWith("Patient/")) {
            patientIds.add(ref.split("/")[1]);
          }
        }
      }

      const nameMap = {};
      await Promise.all(
        [...patientIds].map(async (pid) => {
          try {
            const patientRes = await fhirApi.get(`/Patient/${pid}`);
            const patient = patientRes.data;
            const nameObj = patient?.name?.[0];
            const given = (nameObj?.given || []).join(" ");
            const family = nameObj?.family || "";
            nameMap[pid] = `${given} ${family}`.trim() || pid;
          } catch {
            nameMap[pid] = pid;
          }
        }),
      );

      bundle.entry = bundle.entry.map((entry) => {
        const appt = entry.resource || {};
        const patientParticipant = (appt.participant || []).find((p) =>
          (p.actor?.reference || "").startsWith("Patient/"),
        );
        if (patientParticipant) {
          const pid = patientParticipant.actor.reference.split("/")[1];
          if (nameMap[pid]) {
            entry = { ...entry, resource: { ...appt, _patientName: nameMap[pid] } };
          }
        }
        return entry;
      });
    }

    if (!isDirty) {
      await setInCache(cacheKey, bundle, CACHE_EXPIRATION.DEFAULT);
    }

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

// Helper: Transform simplified booking data to FHIR Appointment resource
function transformBookingDataToFHIR(bookingData) {
  const {
    patientId,
    practitionerId,
    slotId,
    start,
    end,
    appointmentType = "general",
    comment,
    symptomsText,
    documentReferenceIds,
  } = bookingData;

  // Validate required fields
  if (!patientId || !practitionerId || !start || !end) {
    throw new Error(
      "Missing required fields: patientId, practitionerId, start, end",
    );
  }

  // Build the FHIR Appointment resource
  const fhirAppointment = {
    resourceType: "Appointment",
    status: "booked", // Required: must be one of: proposed, pending, booked, arrived, fulfilled, cancelled, noshow, entered-in-error, checked-in, waitlist
    appointmentType: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v2-0276",
          code: "ROUTINE",
          display: "Routine",
        },
      ],
      text: appointmentType,
    },
    start: start, // ISO 8601 format required
    end: end,
    participant: [
      {
        actor: {
          reference: `Patient/${patientId}`,
        },
        required: false,
        status: "accepted",
      },
      {
        actor: {
          reference: `Practitioner/${practitionerId}`,
        },
        required: true,
        status: "accepted",
      },
    ],
    text: {
      status: "generated",
      div: `<div xmlns="http://www.w3.org/1999/xhtml"><p>Appointment between Patient/${patientId} and Practitioner/${practitionerId}</p></div>`,
    },
  };

  // Add slot reference if provided
  if (slotId) {
    fhirAppointment.slot = [
      {
        reference: `Slot/${slotId}`,
      },
    ];
  }

  const noteParts = [];
  if (comment && String(comment).trim().length > 0) {
    noteParts.push(`Patient note: ${String(comment).trim()}`);
  }
  if (symptomsText && String(symptomsText).trim().length > 0) {
    noteParts.push(`Symptoms: ${String(symptomsText).trim()}`);
  }
  if (noteParts.length > 0) {
    fhirAppointment.description = noteParts.join("\n");
  }

  if (Array.isArray(documentReferenceIds) && documentReferenceIds.length > 0) {
    fhirAppointment.supportingInformation = documentReferenceIds
      .filter((id) => id && String(id).trim().length > 0)
      .map((id) => ({ reference: `DocumentReference/${String(id).trim()}` }));
  }

  return fhirAppointment;
}

function normalizeAppointmentUpdatePayload(
  existingAppointment,
  appointmentData,
) {
  const normalized = { ...appointmentData };

  const comment =
    appointmentData.comment && String(appointmentData.comment).trim().length > 0
      ? String(appointmentData.comment).trim()
      : null;

  const symptomsText =
    appointmentData.symptomsText &&
    String(appointmentData.symptomsText).trim().length > 0
      ? String(appointmentData.symptomsText).trim()
      : null;

  let symptomsFromReasonCode = null;
  if (
    Array.isArray(appointmentData.reasonCode) &&
    appointmentData.reasonCode.length > 0
  ) {
    const firstReason = appointmentData.reasonCode[0];
    if (firstReason && typeof firstReason === "object" && firstReason.text) {
      symptomsFromReasonCode = String(firstReason.text).trim();
    }
  }

  const noteParts = [];
  if (comment) {
    noteParts.push(`Patient note: ${comment}`);
  }
  if (symptomsText) {
    noteParts.push(`Symptoms: ${symptomsText}`);
  } else if (symptomsFromReasonCode) {
    noteParts.push(`Symptoms: ${symptomsFromReasonCode}`);
  }

  if (noteParts.length > 0) {
    normalized.description = noteParts.join("\n");
  }

  if (
    Array.isArray(appointmentData.documentReferenceIds) &&
    appointmentData.documentReferenceIds.length > 0
  ) {
    normalized.supportingInformation = appointmentData.documentReferenceIds
      .filter((id) => id && String(id).trim().length > 0)
      .map((id) => ({ reference: `DocumentReference/${String(id).trim()}` }));
  }

  if (
    !normalized.supportingInformation &&
    Array.isArray(appointmentData.supportingInformation)
  ) {
    normalized.supportingInformation = appointmentData.supportingInformation;
  }

  delete normalized.comment;
  delete normalized.symptomsText;
  delete normalized.documentReferenceIds;
  delete normalized.reasonCode;
  delete normalized.patientId;

  return {
    ...existingAppointment,
    ...normalized,
    resourceType: "Appointment",
    id: existingAppointment.id,
  };
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
  // Check if this is a simplified booking format or already a FHIR resource
  const isFHIRFormat =
    appointmentData.resourceType === "Appointment" &&
    appointmentData.participant &&
    appointmentData.status;

  const fhirAppointmentResource = isFHIRFormat
    ? appointmentData
    : transformBookingDataToFHIR(appointmentData);

  console.log("Attempting to POST appointment to /Appointment");
  console.log(
    "FHIR Resource:",
    JSON.stringify(fhirAppointmentResource, null, 2),
  );

  try {
    const response = await fhirApi.post(
      "/Appointment",
      fhirAppointmentResource,
    );

    const appointmentId = response.data.id;
    console.log(`Appointment created successfully with ID: ${appointmentId}`);

    const slotIdToUpdate =
      appointmentData.slotId ||
      fhirAppointmentResource.slot?.[0]?.reference?.split("/")[1];

    if (slotIdToUpdate) {
      try {
        console.log(
          `Attempting to update Slot ${slotIdToUpdate} to busy status`,
        );

        await slotService.updateSlot(slotIdToUpdate, { status: "busy" });
        console.log(`Slot ${slotIdToUpdate} updated to busy status`);
      } catch (slotError) {
        console.error(
          "Warning: Could not update slot status",
          slotError.message,
        );
      }
    }

    // Invalidate caches after successful creation
    await invalidateAppointmentCache(appointmentId, fhirAppointmentResource);

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
  const updateData = normalizeAppointmentUpdatePayload(
    existingAppointment,
    appointmentData,
  );

  const previousStatus = (existingAppointment.status || "").toLowerCase();
  const nextStatus = (updateData.status || "").toLowerCase();

  try {
    const response = await fhirApi.put(
      `/Appointment/${appointmentId}`,
      updateData,
    );
    const appointment = response.data;

    if (
      nextStatus === "cancelled" &&
      previousStatus !== "cancelled" &&
      existingAppointment.slot?.length
    ) {
      const slotReference = existingAppointment.slot[0]?.reference || "";
      const slotId = slotReference.split("/")[1];

      if (slotId) {
        try {
          await slotService.updateSlot(slotId, { status: "free" });
          console.log(
            `Slot ${slotId} updated to free status after appointment cancellation`,
          );
        } catch (slotError) {
          console.error(
            `Warning: Could not update Slot ${slotId} to free after cancellation`,
            slotError.message,
          );
        }
      }
    }

    // Invalidate caches after successful update
    await invalidateAppointmentCache(appointmentId, updateData);

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

  // Invalidate patient/practitioner appointment list caches from either FHIR participant
  // or simplified payload fields.
  const patientIds = new Set();
  const practitionerIds = new Set();

  if (Array.isArray(appointmentData?.participant)) {
    for (const participant of appointmentData.participant) {
      const ref = participant?.actor?.reference || "";
      if (ref.startsWith("Patient/")) {
        patientIds.add(ref.split("/")[1]);
      }
      if (ref.startsWith("Practitioner/")) {
        practitionerIds.add(ref.split("/")[1]);
      }
    }
  }

  if (appointmentData?.patientId) {
    patientIds.add(String(appointmentData.patientId));
  }
  if (appointmentData?.practitionerId) {
    practitionerIds.add(String(appointmentData.practitionerId));
  }

  for (const patientId of patientIds) {
    if (patientId) {
      await deleteFromCache(`appointments:patient:${patientId}`);
      await setInCache(`appointments:patient:${patientId}:dirty`, 1, 15);
    }
  }

  for (const practitionerId of practitionerIds) {
    if (practitionerId) {
      await deleteFromCache(`appointments:practitioner:${practitionerId}`);
      await setInCache(`appointments:practitioner:${practitionerId}:dirty`, 1, 15);
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
  transformBookingDataToFHIR,
};
