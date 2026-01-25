const path = require("path");
const axios = require("axios");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Require Services
const eocService = require("../episodeOfCare/eocService");
const encounterService = require("../encounter/encounterService");
const {
  getFromCache,
  setInCache,
  invalidatePatientCache,
  CACHE_EXPIRATION,
} = require("../middleware/cacheHelper");
const {
  getToonNode,
  setToonNode,
  getToonNodes,
  setToonNodes,
  getToonNodeMetadata,
  setToonNodeMetadata,
  invalidateToonCacheForPatient,
  invalidateToonCacheForNode,
  TOON_CACHE_EXPIRATION,
} = require("../middleware/toonNodesCacheHelper");

// DB Setup
const { Client } = require("pg");
const { randomUUID } = require("crypto");

// FHIR client (generic) for non-Encounter resources
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: { "Content-Type": "application/fhir+json" },
});

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function connectToDb() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database (HistoryGraph Service)");
  } catch (err) {
    if (err.code !== "err_client_already_connected") {
      console.error("Error connecting to PostgreSQL:", err);
    }
  }
}

connectToDb();

async function ensureDbConnection() {
  try {
    await client.query("SELECT 1");
  } catch (err) {
    console.log("Re-connecting to DB...");
    await client.connect();
  }
}

// Try to reuse an existing EpisodeOfCare for this patient so all nodes share one EOC
async function getExistingEocForPatient(patientId) {
  await ensureDbConnection();
  const res = await client.query(
    "SELECT encounter_fhir_id FROM encounter_nodes WHERE patient_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE) AND category IN ('Consultation','FollowUp') ORDER BY created_at DESC LIMIT 5",
    [patientId],
  );

  for (const row of res.rows) {
    try {
      const enc = await encounterService.getEncounterById(
        row.encounter_fhir_id,
      );
      const ref = enc?.episodeOfCare?.[0]?.reference;
      if (ref) return ref.replace("EpisodeOfCare/", "");
    } catch (err) {
      console.log(
        "Could not fetch encounter for existing EOC check:",
        err.message,
      );
    }
  }
  return null;
}

// ==========================================
// VALIDATION & ERROR HANDLING
// ==========================================

const ALLOWED_CATEGORIES = new Set([
  "Consultation",
  "Lab",
  "Imaging",
  "Prescription",
  "AISuggestion",
  "FollowUp",
  "Allergy",
  "Historical",
]);

const ALLOWED_PRIORITIES = new Set(["Low", "Medium", "High"]);
const ALLOWED_NORMALITIES = new Set([
  "Pending",
  "Normal",
  "Abnormal",
  "Unknown",
]);

function validateNodeData(nodeData) {
  const errors = {};
  if (!nodeData.category || !ALLOWED_CATEGORIES.has(nodeData.category)) {
    errors.category = `Invalid category. Allowed: ${Array.from(ALLOWED_CATEGORIES).join(", ")}`;
  }
  if (nodeData.priority && !ALLOWED_PRIORITIES.has(nodeData.priority)) {
    errors.priority = `Invalid priority. Allowed: ${Array.from(ALLOWED_PRIORITIES).join(", ")}`;
  }
  if (nodeData.normality && !ALLOWED_NORMALITIES.has(nodeData.normality)) {
    errors.normality = `Invalid normality. Allowed: ${Array.from(ALLOWED_NORMALITIES).join(", ")}`;
  }
  if (!nodeData.text_1 && !nodeData.title) {
    errors.title = "Either text_1 or title is required";
  }
  if (Object.keys(errors).length > 0) {
    throw { statusCode: 400, errors };
  }
}

function buildErrorResponse(errors, statusCode = 400) {
  return { statusCode, errors, message: "Validation failed" };
}

// ==========================================
// FHIR R5 MAPPING HELPERS
// ==========================================

const CATEGORY_RESOURCE_TYPE = {
  Consultation: "Encounter",
  Lab: "Observation",
  Imaging: "ImagingStudy",
  Prescription: "MedicationRequest",
  AISuggestion: "Observation",
  FollowUp: "Appointment",
  Allergy: "AllergyIntolerance",
  Historical: "Encounter", // treated as contextual encounter entry
};

const CATEGORY_TYPE_CODING = {
  Consultation: { code: "11429006", display: "Consultation" },
  Lab: { code: "108252007", display: "Laboratory findings" },
  Imaging: { code: "363679005", display: "Imaging" },
  Prescription: { code: "16076005", display: "Prescription of medication" },
  AISuggestion: {
    code: "702927004",
    display: "Computer aided medical decision support",
  },
  FollowUp: { code: "390906007", display: "Follow-up encounter" },
  Allergy: { code: "416098002", display: "Allergy screening" },
  Historical: { code: "11429006", display: "Consultation" },
};

const CATEGORY_SERVICE_TYPE = {
  Consultation: {
    system: "http://snomed.info/sct",
    code: "394802001",
    display: "General medicine",
  },
  Lab: {
    system: "http://snomed.info/sct",
    code: "408467006",
    display: "Laboratory service",
  },
  Imaging: {
    system: "http://snomed.info/sct",
    code: "394914008",
    display: "Radiology service",
  },
  Prescription: {
    system: "http://snomed.info/sct",
    code: "310060005",
    display: "Pharmacy service",
  },
  AISuggestion: {
    system: "http://snomed.info/sct",
    code: "408466002",
    display: "Clinical decision support",
  },
  FollowUp: {
    system: "http://snomed.info/sct",
    code: "408443003",
    display: "Follow-up service",
  },
  Allergy: {
    system: "http://snomed.info/sct",
    code: "408478003",
    display: "Allergy service",
  },
  Historical: {
    system: "http://snomed.info/sct",
    code: "394802001",
    display: "General medicine",
  },
};

const RELATIONSHIP_TYPES = new Set([
  "association",
  "documents",
  "derives_from",
  "follows",
  "references",
  "contains",
  "causes",
]);

function normalizeRelationshipType(value) {
  if (!value) return "association";
  if (!RELATIONSHIP_TYPES.has(value)) {
    throw new Error(
      `Invalid relationshipType '${value}'. Allowed values: ${Array.from(RELATIONSHIP_TYPES).join(", ")}`,
    );
  }
  return value;
}

let edgeSoftDeleteSupported;
let edgeRelationshipTypeSupported;

async function checkEdgeSoftDeleteSupport() {
  if (edgeSoftDeleteSupported !== undefined) return edgeSoftDeleteSupported;
  await ensureDbConnection();
  const res = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'node_relations' AND column_name = 'is_deleted' LIMIT 1",
  );
  edgeSoftDeleteSupported = res.rowCount > 0;
  if (!edgeSoftDeleteSupported) {
    console.warn("node_relations lacks is_deleted; edge soft deletes disabled");
  }
  return edgeSoftDeleteSupported;
}

async function checkEdgeRelationshipTypeSupport() {
  if (edgeRelationshipTypeSupported !== undefined)
    return edgeRelationshipTypeSupported;
  await ensureDbConnection();
  const res = await client.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = 'node_relations' AND column_name = 'relationship_type' LIMIT 1",
  );
  edgeRelationshipTypeSupported = res.rowCount > 0;
  if (!edgeRelationshipTypeSupported) {
    console.warn(
      "node_relations lacks relationship_type; edge metadata disabled",
    );
  }
  return edgeRelationshipTypeSupported;
}

async function insertEdge(relationId, sourceId, targetId, relationshipType) {
  const hasSoftDelete = await checkEdgeSoftDeleteSupport();
  const hasRelType = await checkEdgeRelationshipTypeSupport();

  const columns = ["relation_id", "source_node_id", "target_node_id"];
  const values = [relationId, sourceId, targetId];

  if (hasRelType) {
    columns.push("relationship_type");
    values.push(relationshipType);
  }
  if (hasSoftDelete) {
    columns.push("is_deleted", "deleted_at");
    values.push(false, null);
  }

  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
  const sql = `INSERT INTO node_relations (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT (relation_id) DO NOTHING`;
  await client.query(sql, values);
}

function normalizeDate(dateValue) {
  if (!dateValue) return new Date().toISOString();
  if (dateValue instanceof Date) return dateValue.toISOString();
  if (typeof dateValue === "string" && dateValue.includes("T")) {
    return new Date(dateValue).toISOString();
  }
  return new Date(dateValue).toISOString();
}

// Safely format a value to YYYY-MM-DD without timezone drift
function formatDateOnly(value) {
  if (!value) return new Date().toISOString().split("T")[0];
  if (typeof value === "string") {
    return value.includes("T") ? value.split("T")[0] : value;
  }

  // For Date objects (or values coercible to Date) preserve the local calendar day
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return new Date().toISOString().split("T")[0];
  }

  const y = asDate.getFullYear();
  const m = asDate.getMonth();
  const d = asDate.getDate();
  return new Date(Date.UTC(y, m, d)).toISOString().split("T")[0];
}

function mapNormalityToStatus(normality) {
  switch (normality) {
    case "Pending":
      return "in-progress";
    case "Normal":
    case "Abnormal":
      return "completed";
    default:
      return "in-progress";
  }
}

function mapNormalityToObservationStatus(normality) {
  switch (normality) {
    case "Pending":
      return "preliminary";
    case "Normal":
    case "Abnormal":
      return "final";
    default:
      return "unknown";
  }
}

function mapNormalityToInterpretation(normality) {
  switch (normality) {
    case "Normal":
      return { code: "N", display: "Normal" };
    case "Abnormal":
      return { code: "A", display: "Abnormal" };
    default:
      return null;
  }
}

function mapPriorityToActPriority(priority) {
  const priorityMap = {
    Low: { code: "R", display: "Routine" },
    Medium: { code: "UR", display: "Urgent" },
    High: { code: "EM", display: "Emergency" },
  };
  return priorityMap[priority] || priorityMap.Low;
}

function mapPriorityToEncounterClass(priority) {
  if (priority === "High") {
    return { code: "EMER", display: "emergency" };
  }
  if (priority === "Medium") {
    return { code: "IMP", display: "inpatient encounter" };
  }
  return { code: "AMB", display: "ambulatory" };
}

// Escape text for inclusion inside XHTML narrative divs
function escapeForXhtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function upsertFHIRResource(resource) {
  if (!resource?.resourceType || !resource?.id) {
    throw new Error("FHIR resource must include resourceType and id");
  }

  try {
    const response = await fhirApi.put(
      `/${resource.resourceType}/${resource.id}`,
      resource,
    );
    return response.data;
  } catch (error) {
    const detail =
      error.response?.data?.issue
        ?.map((i) => i.diagnostics || i.code)
        .join(", ") || error.message;
    console.error(
      `Failed to upsert ${resource.resourceType}/${resource.id}: ${detail}`,
    );
    throw new Error(
      `FHIR upsert failed for ${resource.resourceType}/${resource.id}`,
    );
  }
}

async function deleteFHIRResource(resourceType, id) {
  if (!resourceType || !id) return;
  try {
    await fhirApi.delete(`/${resourceType}/${id}`);
  } catch (error) {
    if (error.response?.status === 404) {
      return; // Already gone
    }
    console.error(`Failed to delete ${resourceType}/${id}:`, error.message);
  }
}

function mapNodeToFHIRResources(node, patientId, eocId, isDiagnosis = false) {
  const category = node.category || "Consultation";
  const priority = node.priority || "Low";
  const normality = node.normality || "Pending";
  const eventDate = normalizeDate(
    node.dateIssued || node.event_date || new Date(),
  );
  const title = (node.title || node.text_1 || "Untitled").trim();
  const details = node.details || "";
  const safeTitle = escapeForXhtml(title);
  const safeDetails = escapeForXhtml(details);
  const priorityObj = mapPriorityToActPriority(priority);
  const encounterClass = mapPriorityToEncounterClass(priority);
  const nodeId = node.id || `enc-${randomUUID()}`; // graph id aligns to Encounter id

  const serviceTypeCoding =
    CATEGORY_SERVICE_TYPE[category] || CATEGORY_SERVICE_TYPE.Consultation;

  // Define buildEncounter helper function first
  const buildEncounter = (typeCode, typeDisplay) => ({
    resourceType: "Encounter",
    id: nodeId,
    status: mapNormalityToStatus(normality),
    class: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: encounterClass.code,
            display: encounterClass.display,
          },
        ],
      },
    ],
    type: [
      {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: typeCode,
            display: typeDisplay,
          },
        ],
      },
    ],
    serviceType: [
      {
        concept: {
          coding: [
            {
              system: serviceTypeCoding.system,
              code: serviceTypeCoding.code,
              display: serviceTypeCoding.display,
            },
          ],
        },
      },
    ],
    subject: { reference: `Patient/${patientId}` },
    actualPeriod: {
      start: eventDate,
      end: eventDate,
    },
    ...(eocId
      ? { episodeOfCare: [{ reference: `EpisodeOfCare/${eocId}` }] }
      : {}),
    reason: [
      {
        value: [
          {
            concept: {
              coding: [
                {
                  system: "http://snomed.info/sct",
                  code: "185349003",
                  display: title,
                },
              ],
              text: title,
            },
          },
        ],
      },
    ],
    text: {
      status: "generated",
      div: `<div xmlns="http://www.w3.org/1999/xhtml">Encounter: ${safeTitle}</div>`,
    },
  });

  // Handle diagnosis: create Condition resource if isDiagnosis=true
  if (isDiagnosis) {
    const condition = {
      resourceType: "Condition",
      id: `cond-${nodeId}`,
      clinicalStatus: {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
            code: normality === "Abnormal" ? "active" : "resolved",
            display: normality === "Abnormal" ? "Active" : "Resolved",
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/condition-ver-status",
            code: "confirmed",
            display: "Confirmed",
          },
        ],
      },
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "404684003",
            display: title,
          },
        ],
        text: title,
      },
      subject: { reference: `Patient/${patientId}` },
      onsetDateTime: eventDate,
      recordedDate: eventDate,
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">Condition: ${safeTitle}</div>`,
      },
      ...(details
        ? {
            note: [
              {
                text: details,
              },
            ],
          }
        : {}),
    };

    const wrapperEncounter = buildEncounter("11429006", "Diagnosis Encounter");
    return {
      nodeId,
      primaryResource: wrapperEncounter,
      relatedResources: [condition],
    };
  }

  if (category === "Consultation") {
    return {
      nodeId,
      primaryResource: buildEncounter("11429006", "Consultation"),
      relatedResources: [],
    };
  }

  if (category === "Lab") {
    const observationId = nodeId;
    const interpretation = mapNormalityToInterpretation(normality);
    const observation = {
      resourceType: "Observation",
      id: observationId,
      status: mapNormalityToObservationStatus(normality),
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "laboratory",
              display: "Laboratory",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: CATEGORY_TYPE_CODING.Lab.code,
            display: title,
          },
        ],
        text: title,
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: eventDate,
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">Laboratory Observation: ${safeTitle}</div>`,
      },
      ...(details ? { valueString: details } : {}),
      ...(interpretation
        ? {
            interpretation: [
              {
                coding: [
                  {
                    system:
                      "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                    code: interpretation.code,
                    display: interpretation.display,
                  },
                ],
              },
            ],
          }
        : {}),
    };

    const diagnosticReport = {
      resourceType: "DiagnosticReport",
      id: `dr-${observationId}`,
      status: observation.status === "preliminary" ? "partial" : "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0074",
              code: "LAB",
              display: "Laboratory",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "LP29684-5",
            display: "Laboratory report",
          },
        ],
        text: title,
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: eventDate,
      result: [{ reference: `Observation/${observationId}` }],
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">Laboratory Report: ${safeTitle}</div>`,
      },
      ...(details ? { conclusion: details } : {}),
    };

    const wrapperEncounter = buildEncounter(
      CATEGORY_TYPE_CODING.Lab.code,
      CATEGORY_TYPE_CODING.Lab.display,
    );

    return {
      nodeId,
      primaryResource: observation,
      relatedResources: [diagnosticReport, wrapperEncounter],
    };
  }

  if (category === "Imaging") {
    const imagingId = nodeId;
    const imagingStudy = {
      resourceType: "ImagingStudy",
      id: imagingId,
      status: "available",
      subject: { reference: `Patient/${patientId}` },
      started: eventDate,
      modality: [
        {
          coding: [
            {
              system: "http://dicom.nema.org/resources/ontology/DCM",
              code: "CT",
              display: "Computed Tomography",
            },
          ],
        },
      ],
      description: title,
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">ImagingStudy: ${safeTitle}</div>`,
      },
    };

    const diagnosticReport = {
      resourceType: "DiagnosticReport",
      id: `dr-${imagingId}`,
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0074",
              code: "RAD",
              display: "Radiology",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "18748-4",
            display: "Diagnostic imaging study",
          },
        ],
        text: title,
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: eventDate,
      study: [{ reference: `ImagingStudy/${imagingId}` }],
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">Radiology Report: ${safeTitle}</div>`,
      },
      ...(details ? { conclusion: details } : {}),
    };

    const wrapperEncounter = buildEncounter(
      CATEGORY_TYPE_CODING.Imaging.code,
      CATEGORY_TYPE_CODING.Imaging.display,
    );

    return {
      nodeId,
      primaryResource: imagingStudy,
      relatedResources: [diagnosticReport, wrapperEncounter],
    };
  }

  if (category === "Prescription") {
    const medicationRequest = {
      resourceType: "MedicationRequest",
      id: nodeId,
      status: "active",
      intent: "order",
      subject: { reference: `Patient/${patientId}` },
      authoredOn: eventDate,
      medication: {
        concept: {
          text: title,
        },
      },
      text: {
        status: "generated",
        div: `<div xmlns=\"http://www.w3.org/1999/xhtml\">MedicationRequest: ${safeTitle}</div>`,
      },
      ...(details ? { note: [{ text: details }] } : {}),
    };

    const wrapperEncounter = buildEncounter(
      CATEGORY_TYPE_CODING.Prescription.code,
      CATEGORY_TYPE_CODING.Prescription.display,
    );

    return {
      nodeId,
      primaryResource: medicationRequest,
      relatedResources: [wrapperEncounter],
    };
  }

  if (category === "AISuggestion") {
    const interpretation = mapNormalityToInterpretation(normality);
    const aiObservation = {
      resourceType: "Observation",
      id: nodeId,
      status: mapNormalityToObservationStatus(normality),
      category: [
        {
          coding: [
            {
              system:
                "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "procedure",
              display: "Procedure",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: CATEGORY_TYPE_CODING.AISuggestion.code,
            display: CATEGORY_TYPE_CODING.AISuggestion.display,
          },
        ],
        text: title,
      },
      subject: { reference: `Patient/${patientId}` },
      effectiveDateTime: eventDate,
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">AI Suggestion: ${safeTitle}</div>`,
      },
      ...(details ? { valueString: details } : {}),
      ...(interpretation
        ? {
            interpretation: [
              {
                coding: [
                  {
                    system:
                      "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                    code: interpretation.code,
                    display: interpretation.display,
                  },
                ],
              },
            ],
          }
        : {}),
    };

    const wrapperEncounter = buildEncounter(
      CATEGORY_TYPE_CODING.AISuggestion.code,
      CATEGORY_TYPE_CODING.AISuggestion.display,
    );

    return {
      nodeId,
      primaryResource: aiObservation,
      relatedResources: [wrapperEncounter],
    };
  }

  if (category === "FollowUp") {
    const followUpDate = new Date(eventDate).getTime();
    const isFuture = followUpDate > Date.now();

    if (isFuture) {
      const startTime = new Date(eventDate).toISOString();
      const endTime = new Date(
        new Date(eventDate).getTime() + 30 * 60 * 1000,
      ).toISOString();

      const appointment = {
        resourceType: "Appointment",
        id: nodeId,
        status: "booked",
        appointmentType: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0276",
              code: "FOLLOWUP",
              display: "Follow-up",
            },
          ],
        },
        description: title,
        start: startTime,
        end: endTime,
        participant: [
          {
            actor: { reference: `Patient/${patientId}` },
            status: "accepted",
          },
        ],
        text: {
          status: "generated",
          div: `<div xmlns=\"http://www.w3.org/1999/xhtml\">Follow-up Appointment: ${safeTafeTitle}</div>`,
        },
      };
      const wrapperEncounter = buildEncounter(
        CATEGORY_TYPE_CODING.FollowUp.code,
        CATEGORY_TYPE_CODING.FollowUp.display,
      );

      return {
        nodeId,
        primaryResource: appointment,
        relatedResources: [wrapperEncounter],
      };
    }

    return {
      nodeId,
      primaryResource: buildEncounter(
        CATEGORY_TYPE_CODING.FollowUp.code,
        CATEGORY_TYPE_CODING.FollowUp.display,
      ),
      relatedResources: [],
    };
  }

  if (category === "Allergy") {
    const allergy = {
      resourceType: "AllergyIntolerance",
      id: nodeId,
      clinicalStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
            code: "active",
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system:
              "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification",
            code: "confirmed",
          },
        ],
      },
      code: {
        text: title,
      },
      patient: { reference: `Patient/${patientId}` },
      recordedDate: eventDate,
      text: {
        status: "generated",
        div: `<div xmlns="http://www.w3.org/1999/xhtml">Allergy: ${safeTitle}</div>`,
      },
      ...(details ? { note: [{ text: details }] } : {}),
    };

    const wrapperEncounter = buildEncounter(
      CATEGORY_TYPE_CODING.Allergy.code,
      CATEGORY_TYPE_CODING.Allergy.display,
    );

    return {
      nodeId,
      primaryResource: allergy,
      relatedResources: [wrapperEncounter],
    };
  }

  return {
    nodeId,
    primaryResource: buildEncounter("11429006", "Consultation"),
    relatedResources: [],
  };
}

async function persistMappedResources(mappedResources) {
  const { primaryResource, relatedResources = [] } = mappedResources;
  const primaryResult = await upsertFHIRResource(primaryResource);
  const relatedResults = [];

  for (const res of relatedResources) {
    relatedResults.push(await upsertFHIRResource(res));
  }

  return { primaryResult, relatedResults };
}

async function InitalizeHistoryGraph(episodeOfCareData) {
  if (!episodeOfCareData) {
    throw new Error("Missing required argument: episodeOfCareData");
  }

  const episodeOfCare =
    await eocService.createEpisodeOfCareWithSpecificId(episodeOfCareData);

  if (!episodeOfCare || !episodeOfCare.data) {
    throw new Error("Failed to create EpisodeOfCare: No data returned");
  }

  const eocdata = episodeOfCare.data;
  const eocId = eocdata.id;
  const patientRef =
    episodeOfCare.data.patient && episodeOfCare.data.patient.reference;

  let patientId = null;
  if (patientRef) {
    patientId = patientRef.split("/")[1];
  }
  return { eocId, patientId };
}

async function createheadNodeEncounter(patientId, eocId, nodeData) {
  const pId = patientId || "pat-001";
  const eId = eocId || "eoc-001";

  if (!nodeData.id) nodeData.id = `enc-${randomUUID()}`;

  const mappedResources = mapNodeToFHIRResources(nodeData, pId, eId);
  // Ensure database uses the encounter-aligned id
  nodeData.id = mappedResources.nodeId;

  const createdFHIR = await persistMappedResources(mappedResources);

  // 2. Insert into Graph (encounter_nodes)
  await ensureDbConnection();

  const insertNodeQuery = `
    INSERT INTO encounter_nodes 
    (encounter_fhir_id, patient_id, title, category, priority, normality, event_date, details, is_diagnosis, is_manual_branch)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (encounter_fhir_id) DO NOTHING
  `;

  const nodeValues = [
    nodeData.id,
    pId,
    nodeData.title || nodeData.text_1 || "Untitled",
    nodeData.category || "Consultation",
    nodeData.priority || "Medium",
    nodeData.normality || "Pending",
    nodeData.dateIssued || new Date(),
    nodeData.details || "",
    nodeData.isDiagnosis || false,
    nodeData.isManualBranch || false,
  ];

  await client.query(insertNodeQuery, nodeValues);

  return {
    primary: createdFHIR.primaryResult,
    related: createdFHIR.relatedResults,
  };
}

async function getGraphForPatient(patientId, options = {}) {
  const {
    limit = null,
    offset = 0,
    filterCategory = null,
    filterPriority = null,
    filterNormality = null,
    dateFrom = null,
    dateTo = null,
    sortBy = "event_date",
    sortOrder = "DESC",
  } = options;

  try {
    // Check toon cache first (dedicated cache for formatted nodes)
    const cachedToonData = await getToonNodes(patientId, options);
    if (cachedToonData) {
      return cachedToonData;
    }

    await ensureDbConnection();

    let nodesQuery = `
      SELECT 
        encounter_fhir_id, patient_id, title, category, priority, 
        normality, event_date, details, is_diagnosis, is_manual_branch, related_resource_ids,
        created_at, updated_at, CASE WHEN is_deleted THEN deleted_at ELSE NULL END as deleted_at
      FROM encounter_nodes 
      WHERE patient_id = $1
        AND (is_deleted IS NULL OR is_deleted = FALSE)
    `;

    const params = [patientId];
    let paramCount = 2;

    if (filterCategory) {
      nodesQuery += ` AND category = $${paramCount}`;
      params.push(filterCategory);
      paramCount++;
    }
    if (filterPriority) {
      nodesQuery += ` AND priority = $${paramCount}`;
      params.push(filterPriority);
      paramCount++;
    }
    if (filterNormality) {
      nodesQuery += ` AND normality = $${paramCount}`;
      params.push(filterNormality);
      paramCount++;
    }
    if (dateFrom) {
      nodesQuery += ` AND event_date >= $${paramCount}`;
      params.push(dateFrom);
      paramCount++;
    }
    if (dateTo) {
      nodesQuery += ` AND event_date <= $${paramCount}`;
      params.push(dateTo);
      paramCount++;
    }

    nodesQuery += ` ORDER BY ${sortBy} ${sortOrder}`;

    if (limit) {
      nodesQuery += ` LIMIT $${paramCount}`;
      params.push(limit);
      paramCount++;
      nodesQuery += ` OFFSET $${paramCount}`;
      params.push(offset);
    }

    const nodesRes = await client.query(nodesQuery, params);

    const hasEdgeRelType = await checkEdgeRelationshipTypeSupport();
    const hasEdgeSoftDelete = await checkEdgeSoftDeleteSupport();
    const edgesSelectRel = hasEdgeRelType ? ", nr.relationship_type" : "";
    const edgesSoftDeleteFilter = hasEdgeSoftDelete
      ? "AND (nr.is_deleted IS NULL OR nr.is_deleted = FALSE)"
      : "";

    const edgesQuery = `
      SELECT nr.source_node_id, nr.target_node_id${edgesSelectRel}
      FROM node_relations nr
      JOIN encounter_nodes en ON nr.source_node_id = en.encounter_fhir_id
      WHERE en.patient_id = $1
        ${edgesSoftDeleteFilter}
    `;
    const edgesRes = await client.query(edgesQuery, [patientId]);

    const parentMap = {};
    const relationshipMap = {};
    edgesRes.rows.forEach((edge) => {
      parentMap[edge.target_node_id] = edge.source_node_id;
      relationshipMap[edge.target_node_id] = hasEdgeRelType
        ? edge.relationship_type
        : null;
    });

    // Try to get the eocId from existing FHIR encounters
    let eocId = null;
    const encounterCandidates = nodesRes.rows.filter(
      (row) => row.category === "Consultation" || row.category === "FollowUp",
    );
    for (const row of encounterCandidates) {
      try {
        const encounterResponse = await encounterService.getEncounterById(
          row.encounter_fhir_id,
        );
        if (encounterResponse?.episodeOfCare?.[0]?.reference) {
          eocId = encounterResponse.episodeOfCare[0].reference.replace(
            "EpisodeOfCare/",
            "",
          );
          break;
        }
      } catch (err) {
        console.log("Could not retrieve eocId from FHIR:", err.message);
      }
    }

    const formattedData = nodesRes.rows.map((row) => ({
      id: row.encounter_fhir_id,
      text_1: row.title || "Untitled Node",
      father: parentMap[row.encounter_fhir_id] || null,
      relationshipType: relationshipMap[row.encounter_fhir_id] || null,
      category: row.category || "Consultation",
      priority: row.priority || "Low",
      normality: row.normality || "Normal",
      dateIssued: formatDateOnly(row.event_date),
      details: row.details || "",
      isDiagnosis: row.is_diagnosis || false,
      isManualBranch: row.is_manual_branch || false,
      relatedResourceIds: row.related_resource_ids || {},
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    }));

    const result = {
      nodes: formattedData,
      eocId,
      pagination: limit
        ? { limit, offset, total: nodesRes.rowCount + offset }
        : null,
    };

    // Store in both toon cache (for formatted nodes) and general cache
    await setToonNodes(
      patientId,
      result,
      options,
      TOON_CACHE_EXPIRATION.NODE_COLLECTION,
    );
    await setInCache(
      `historyGraph:patient:${patientId}:${JSON.stringify(options)}`,
      result,
      CACHE_EXPIRATION.PATIENT,
    );

    return result;
  } catch (error) {
    console.error("Error fetching history graph:", error.message);
    throw new Error("Could not fetch history graph for patient.");
  }
}

// Create Mock Data for Testing
async function seedSampleData(patientId, nodes) {
  await ensureDbConnection();

  const eocId = `eoc-seed-${randomUUID()}`;

  const eocData = {
    resourceType: "EpisodeOfCare",
    id: eocId,
    status: "active",
    type: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/episodeofcare-type",
            code: "hacc",
            display: "Home and Community Care",
          },
        ],
      },
    ],
    patient: { reference: `Patient/${patientId}` },
  };

  try {
    await eocService.createEpisodeOfCareWithSpecificId(eocData);
    console.log("Seed EOC Created:", eocId);
  } catch (e) {
    console.log("Note: EOC might already exist or failed:", e.message);
    if (e.message.includes("Validation Failed")) return;
  }

  const nodeMap = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    nodeMap[i] = n.id;

    // 2. CREATE FHIR RESOURCES
    const nodeWithDate = { ...n, dateIssued: n.date || n.dateIssued };
    const mappedResources = mapNodeToFHIRResources(
      nodeWithDate,
      patientId,
      eocId,
    );
    n.id = mappedResources.nodeId;

    try {
      await persistMappedResources(mappedResources);
    } catch (e) {
      console.error(
        `Failed to create FHIR resource for node ${n.id}:`,
        e.message,
      );
      continue;
    }

    // 3. INSERT INTO GRAPH TABLE
    const insertNodeQuery = `
      INSERT INTO encounter_nodes 
      (encounter_fhir_id, patient_id, title, category, priority, normality, event_date, details, is_diagnosis)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (encounter_fhir_id) DO NOTHING
    `;

    const eventDateValue =
      nodeWithDate.dateIssued || n.date || n.dateIssued || new Date();

    await client.query(insertNodeQuery, [
      n.id,
      patientId,
      n.title,
      n.category,
      n.priority,
      n.normality,
      eventDateValue,
      n.details,
      n.isDiagnosis || false,
    ]);

    // 4. CREATE RELATIONSHIP
    if (n.father !== null && n.father !== undefined && nodeMap[n.father]) {
      const parentId = nodeMap[n.father];
      await insertEdge(
        `rel-${randomUUID()}`,
        parentId,
        n.id,
        normalizeRelationshipType(n.relationshipType),
      );
    }
  }
}

// add new node to graph
async function addNode(patientId, eocId, nodeData, parentNodeId = null) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeData) throw new Error("nodeData is required");
  try {
    validateNodeData(nodeData);
  } catch (err) {
    if (err.statusCode) throw err;
    throw { statusCode: 400, errors: { nodeData: err.message } };
  }

  // Auto-create EpisodeOfCare if not provided or is 'auto'/'eoc-default'
  let finalEocId = eocId;
  if (!eocId || eocId === "auto" || eocId === "eoc-default") {
    finalEocId = await getExistingEocForPatient(patientId);

    if (!finalEocId) {
      // Create a new EpisodeOfCare for this patient only if none exists
      finalEocId = `eoc-${randomUUID()}`;
      const eocData = {
        id: finalEocId,
        status: "active",
        patient: { reference: `Patient/${patientId}` },
      };
      try {
        await eocService.createEpisodeOfCareWithSpecificId(eocData);
        console.log(`Created new EpisodeOfCare: ${finalEocId}`);
      } catch (err) {
        throw new Error(`Failed to create EpisodeOfCare: ${err.message}`);
      }
    }
  }

  // Generate ID if not provided or starts with 'temp-'
  if (!nodeData.id || nodeData.id.startsWith("temp-")) {
    nodeData.id = `enc-${randomUUID()}`;
  }

  // Normalize title field
  const nodeTitle = nodeData.title || nodeData.text_1;

  // Set defaults for optional fields
  const priority = nodeData.priority || "Medium";
  const normality = nodeData.normality || "Pending";
  const category = nodeData.category;
  const details = nodeData.details || "";
  const isDiagnosis = nodeData.isDiagnosis || false;
  const isManualBranch = nodeData.isManualBranch || false;

  // Parse and format date
  let eventDate = nodeData.dateIssued || new Date().toISOString();
  if (typeof eventDate === "string" && !eventDate.includes("T")) {
    eventDate = new Date(eventDate).toISOString();
  } else if (!(eventDate instanceof Date)) {
    eventDate = new Date(eventDate).toISOString();
  }

  const mappedResources = mapNodeToFHIRResources(
    {
      id: nodeData.id,
      text_1: nodeTitle,
      title: nodeTitle,
      category: category,
      priority: priority,
      normality: normality,
      dateIssued: eventDate,
      details: details,
    },
    patientId,
    finalEocId,
    isDiagnosis,
  );

  // Keep graph/node id aligned to Encounter id
  nodeData.id = mappedResources.nodeId;

  const buildRelatedResourceIds = (primaryResult, relatedResults = []) => {
    const bucket = {};
    if (primaryResult?.resourceType && primaryResult?.id) {
      bucket[primaryResult.resourceType] = [primaryResult.id];
    }
    for (const r of relatedResults) {
      if (r?.resourceType && r?.id) {
        bucket[r.resourceType] = bucket[r.resourceType] || [];
        bucket[r.resourceType].push(r.id);
      }
    }
    return bucket;
  };

  let createdResources;
  try {
    createdResources = await persistMappedResources(mappedResources);
    console.log(
      `FHIR ${mappedResources.primaryResource.resourceType} created with ID: ${nodeData.id}`,
    );
  } catch (err) {
    throw new Error(
      `Failed to create FHIR resource (${mappedResources.primaryResource.resourceType}): ${err.message}`,
    );
  }

  const relatedResourceIds = buildRelatedResourceIds(
    createdResources.primaryResult,
    createdResources.relatedResults,
  );

  await ensureDbConnection();

  const insertNodeQuery = `
    INSERT INTO encounter_nodes 
    (encounter_fhir_id, patient_id, title, category, priority, normality, event_date, details, is_diagnosis, is_manual_branch, related_resource_ids, is_deleted, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, NULL)
    ON CONFLICT (encounter_fhir_id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      priority = EXCLUDED.priority,
      normality = EXCLUDED.normality,
      event_date = EXCLUDED.event_date,
      details = EXCLUDED.details,
      is_diagnosis = EXCLUDED.is_diagnosis,
      is_manual_branch = EXCLUDED.is_manual_branch,
      related_resource_ids = EXCLUDED.related_resource_ids,
      is_deleted = FALSE,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING *
  `;

  const nodeValues = [
    nodeData.id,
    patientId,
    nodeTitle,
    category,
    priority,
    normality,
    eventDate,
    details,
    isDiagnosis,
    isManualBranch,
    relatedResourceIds,
  ];

  let dbNodeResult;
  try {
    dbNodeResult = await client.query(insertNodeQuery, nodeValues);
    console.log(`Node inserted into encounter_nodes table: ${nodeData.id}`);
  } catch (err) {
    throw new Error(`Failed to insert node into database: ${err.message}`);
  }

  const relationshipType = normalizeRelationshipType(nodeData.relationshipType);

  if (parentNodeId) {
    const parentCheckQuery =
      "SELECT encounter_fhir_id FROM encounter_nodes WHERE encounter_fhir_id = $1";
    const parentCheckResult = await client.query(parentCheckQuery, [
      parentNodeId,
    ]);

    if (parentCheckResult.rows.length === 0) {
      throw new Error(
        `Parent node with ID ${parentNodeId} does not exist in the database`,
      );
    }

    const relationId = `rel-${randomUUID()}`;

    try {
      await insertEdge(relationId, parentNodeId, nodeData.id, relationshipType);
      console.log(
        `Relationship created: ${parentNodeId} -> ${nodeData.id} (${relationId})`,
      );
    } catch (err) {
      throw new Error(`Failed to create node relationship: ${err.message}`);
    }
  }

  // Invalidate and proactively refresh cache (both general and toon cache)
  await invalidatePatientCache(patientId);
  await invalidateToonCacheForPatient(patientId);
  // Fetch fresh data to warm up the cache
  await getGraphForPatient(patientId).catch((err) =>
    console.warn("Cache refresh failed after addNode:", err.message),
  );

  const now = new Date().toISOString();
  return {
    id: nodeData.id,
    text_1: nodeTitle,
    father: parentNodeId || null,
    relationshipType,
    category: category,
    priority: priority,
    normality: normality,
    dateIssued: eventDate.split("T")[0],
    details: details,
    isDiagnosis: isDiagnosis,
    isManualBranch: isManualBranch,
    eocId: finalEocId,
    fhirResource: {
      primary: createdResources.primaryResult,
      related: createdResources.relatedResults,
    },
    relatedResourceIds,
    createdAt: now,
    updatedAt: now,
  };
}

async function updateNode(patientId, nodeId, updatedData, newParentNodeId) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeId) throw new Error("nodeId is required");
  if (!updatedData) throw new Error("updatedData is required");
  try {
    validateNodeData(updatedData);
  } catch (err) {
    if (err.statusCode) throw err;
    throw { statusCode: 400, errors: { updatedData: err.message } };
  }

  await ensureDbConnection();

  const title = updatedData.text_1 || updatedData.title;
  const category = updatedData.category;
  const priority = updatedData.priority || "Medium";
  const normality = updatedData.normality || "Pending";
  const details = updatedData.details || "";
  const isDiagnosis = updatedData.isDiagnosis || false;
  const isManualBranch = updatedData.isManualBranch || false;
  const relationshipType =
    updatedData.relationshipType !== undefined
      ? normalizeRelationshipType(updatedData.relationshipType)
      : null;

  if (!title) throw new Error("title/text_1 is required");
  if (!category) throw new Error("category is required");

  let eventDate = updatedData.dateIssued || new Date().toISOString();
  if (typeof eventDate === "string" && !eventDate.includes("T")) {
    eventDate = new Date(eventDate).toISOString();
  } else if (!(eventDate instanceof Date)) {
    eventDate = new Date(eventDate).toISOString();
  }

  // Preserve EpisodeOfCare reference for encounter-based categories
  let eocId = null;
  if (category === "Consultation" || category === "FollowUp") {
    try {
      const existingEncounter = await encounterService.getEncounterById(nodeId);
      if (existingEncounter?.episodeOfCare?.[0]?.reference) {
        eocId = existingEncounter.episodeOfCare[0].reference.replace(
          "EpisodeOfCare/",
          "",
        );
      }
    } catch (err) {
      console.log("Could not retrieve eocId from FHIR:", err.message);
    }
  }

  // Get existing category to detect category change
  const existingNodeQuery = await client.query(
    "SELECT category, event_date FROM encounter_nodes WHERE encounter_fhir_id = $1 AND patient_id = $2",
    [nodeId, patientId],
  );

  if (existingNodeQuery.rowCount === 0) {
    throw new Error(`Node ${nodeId} not found for patient ${patientId}`);
  }

  const existingCategory = existingNodeQuery.rows[0].category;
  const existingEventDate = existingNodeQuery.rows[0].event_date;

  // If category changed, delete old FHIR resources first
  if (existingCategory !== category) {
    console.log(
      `Category changed from ${existingCategory} to ${category} for node ${nodeId}. Deleting old FHIR resources...`,
    );
    const oldResourceInfos = resolveResourceIdentifiers(
      existingCategory,
      nodeId,
      existingEventDate,
    );

    for (const info of oldResourceInfos) {
      try {
        await deleteFHIRResource(info.resourceType, info.id);
        console.log(
          `Deleted old FHIR ${info.resourceType} ${info.id} due to category change`,
        );
      } catch (err) {
        console.warn(
          `Failed to delete old FHIR ${info.resourceType} ${info.id}:`,
          err.message,
        );
      }
    }
  }

  // Update FHIR resources (category-aware)
  const mappedResources = mapNodeToFHIRResources(
    {
      id: nodeId,
      text_1: title,
      title: title,
      category: category,
      priority: priority,
      normality: normality,
      dateIssued: eventDate,
      details: details,
    },
    patientId,
    eocId,
    isDiagnosis,
  );

  try {
    await persistMappedResources(mappedResources);
    console.log(
      `FHIR ${mappedResources.primaryResource.resourceType} ${nodeId} updated successfully`,
    );
  } catch (err) {
    throw new Error(`Failed to update FHIR resource ${nodeId}: ${err.message}`);
  }

  const relatedResourceIds = {
    [mappedResources.primaryResource.resourceType]: [
      mappedResources.primaryResource.id,
    ],
  };
  for (const r of mappedResources.relatedResources || []) {
    if (r?.resourceType && r?.id) {
      relatedResourceIds[r.resourceType] =
        relatedResourceIds[r.resourceType] || [];
      relatedResourceIds[r.resourceType].push(r.id);
    }
  }

  const updateQuery = `
    UPDATE encounter_nodes
    SET title = $1, category = $2, priority = $3, normality = $4, event_date = $5, details = $6, is_diagnosis = $7, is_manual_branch = $8, related_resource_ids = $9, updated_at = NOW()
    WHERE encounter_fhir_id = $10 AND patient_id = $11
    RETURNING encounter_fhir_id
  `;

  const result = await client.query(updateQuery, [
    title,
    category,
    priority,
    normality,
    eventDate,
    details,
    isDiagnosis,
    isManualBranch,
    relatedResourceIds,
    nodeId,
    patientId,
  ]);

  if (result.rowCount === 0) {
    throw new Error(`Node ${nodeId} not found for patient ${patientId}`);
  }

  // Get current parent relationship from database
  let currentParentId = null;
  const parentQuery = await client.query(
    "SELECT source_node_id FROM node_relations WHERE target_node_id = $1",
    [nodeId],
  );
  if (parentQuery.rowCount > 0) {
    currentParentId = parentQuery.rows[0].source_node_id;
  }

  console.log(
    `updateNode: newParentNodeId=${newParentNodeId}, currentParentId=${currentParentId}`,
  );

  // Only update parent relationship if newParentNodeId is explicitly provided (not undefined)
  // undefined = don't change, null = make it a root node, value = change parent
  if (newParentNodeId !== undefined) {
    console.log(
      `Updating parent relationship for ${nodeId} to ${newParentNodeId}`,
    );
    await client.query("DELETE FROM node_relations WHERE target_node_id = $1", [
      nodeId,
    ]);

    if (newParentNodeId !== null) {
      const parentCheck = await client.query(
        "SELECT encounter_fhir_id FROM encounter_nodes WHERE encounter_fhir_id = $1",
        [newParentNodeId],
      );
      if (parentCheck.rowCount === 0) {
        throw new Error(`Parent node ${newParentNodeId} does not exist`);
      }

      await insertEdge(
        `rel-${randomUUID()}`,
        newParentNodeId,
        nodeId,
        relationshipType || "association",
      );
    }
    currentParentId = newParentNodeId;
  } else {
    console.log(
      `Preserving parent relationship for ${nodeId}: ${currentParentId}`,
    );
  }

  // Invalidate cache and trigger background refresh
  await invalidatePatientCache(patientId);
  await invalidateToonCacheForPatient(patientId);
  // Proactively refresh cache in background (non-blocking)
  setImmediate(() => {
    getGraphForPatient(patientId).catch((err) =>
      console.warn("[CACHE REFRESH] Failed after updateNode:", err.message),
    );
  });

  const now = new Date().toISOString();
  return {
    id: nodeId,
    text_1: title,
    father: currentParentId,
    category,
    priority,
    normality,
    dateIssued: eventDate.split("T")[0],
    details,
    isDiagnosis,
    isManualBranch,
    relatedResourceIds,
    relationshipType: relationshipType || undefined,
    updatedAt: now,
  };
}

// Helper: recursively collect descendants for deletion
async function collectDescendants(nodeIds) {
  const queue = [...nodeIds];
  const all = new Set(queue);

  while (queue.length) {
    const current = queue.shift();
    const hasEdgeSoftDelete = await checkEdgeSoftDeleteSupport();
    const res = await client.query(
      `SELECT target_node_id FROM node_relations WHERE source_node_id = $1 ${
        hasEdgeSoftDelete
          ? "AND (is_deleted IS NULL OR is_deleted = FALSE)"
          : ""
      }`,
      [current],
    );
    res.rows.forEach((r) => {
      if (!all.has(r.target_node_id)) {
        all.add(r.target_node_id);
        queue.push(r.target_node_id);
      }
    });
  }
  return Array.from(all);
}

async function fetchNodeMetadata(nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return {};
  const res = await client.query(
    "SELECT encounter_fhir_id, category, event_date, related_resource_ids FROM encounter_nodes WHERE encounter_fhir_id = ANY($1)",
    [nodeIds],
  );
  const map = {};
  res.rows.forEach((row) => {
    map[row.encounter_fhir_id] = {
      category: row.category || "Consultation",
      eventDate: row.event_date,
      relatedResourceIds: row.related_resource_ids,
    };
  });
  return map;
}

function resolveResourceIdentifiers(category, nodeId, eventDate) {
  const resources = [];
  const addEncounter = () =>
    resources.push({ resourceType: "Encounter", id: nodeId });
  switch (category) {
    case "Lab":
      addEncounter();
      resources.push({ resourceType: "Observation", id: nodeId });
      resources.push({
        resourceType: "DiagnosticReport",
        id: `dr-${nodeId}`,
      });
      break;
    case "Imaging":
      addEncounter();
      resources.push({ resourceType: "ImagingStudy", id: nodeId });
      resources.push({ resourceType: "DiagnosticReport", id: `dr-${nodeId}` });
      break;
    case "Prescription":
      addEncounter();
      resources.push({ resourceType: "MedicationRequest", id: nodeId });
      break;
    case "AISuggestion":
      addEncounter();
      resources.push({ resourceType: "Observation", id: nodeId });
      break;
    case "FollowUp": {
      const ts = eventDate ? new Date(eventDate).getTime() : Date.now();
      const isFuture = ts > Date.now();
      if (isFuture) {
        resources.push({ resourceType: "Appointment", id: nodeId });
      }
      addEncounter();
      break;
    }
    case "Allergy":
      addEncounter();
      resources.push({ resourceType: "AllergyIntolerance", id: nodeId });
      break;
    default:
      addEncounter();
      break;
  }
  return resources;
}

// Delete a node and its descendants
async function deleteNode(patientId, nodeId) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeId) throw new Error("nodeId is required");

  await ensureDbConnection();

  // Collect node + descendants
  const targets = await collectDescendants([nodeId]);
  const metadataMap = await fetchNodeMetadata(targets);

  // Delete from FHIR server first
  const fhirDeleteResults = [];
  for (const targetId of targets) {
    const meta = metadataMap[targetId] || { category: "Consultation" };
    const relatedResourceIds = meta.relatedResourceIds || {};

    const seen = new Set();
    const resourceInfos = [];
    const addResource = (resourceType, id) => {
      if (!resourceType || !id) return;
      const key = `${resourceType}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      resourceInfos.push({ resourceType, id });
    };

    Object.entries(relatedResourceIds || {}).forEach(([resourceType, ids]) => {
      (ids || []).forEach((id) => addResource(resourceType, id));
    });

    const categoryDerived = resolveResourceIdentifiers(
      meta.category,
      targetId,
      meta.eventDate,
    );
    categoryDerived.forEach((info) => addResource(info.resourceType, info.id));

    for (const info of resourceInfos) {
      try {
        await deleteFHIRResource(info.resourceType, info.id);
        fhirDeleteResults.push({
          id: info.id,
          resourceType: info.resourceType,
          success: true,
        });
        console.log(
          `FHIR ${info.resourceType} ${info.id} deleted successfully`,
        );
      } catch (err) {
        console.error(
          `Failed to delete FHIR ${info.resourceType} ${info.id}:`,
          err.message,
        );
        fhirDeleteResults.push({
          id: info.id,
          resourceType: info.resourceType,
          success: false,
          error: err.message,
        });
      }
    }
  }

  const hasEdgeSoftDelete = await checkEdgeSoftDeleteSupport();

  if (hasEdgeSoftDelete) {
    try {
      await client.query(
        "UPDATE node_relations SET is_deleted = TRUE, deleted_at = NOW() WHERE source_node_id = ANY($1) OR target_node_id = ANY($1)",
        [targets],
      );
    } catch (err) {
      console.warn(
        "Soft delete edges failed, falling back to hard delete:",
        err.message,
      );
      await client.query(
        "DELETE FROM node_relations WHERE source_node_id = ANY($1) OR target_node_id = ANY($1)",
        [targets],
      );
    }
  } else {
    await client.query(
      "DELETE FROM node_relations WHERE source_node_id = ANY($1) OR target_node_id = ANY($1)",
      [targets],
    );
  }

  // Soft delete encounters; fallback to hard delete on failure
  try {
    await client.query(
      "UPDATE encounter_nodes SET is_deleted = TRUE, deleted_at = NOW() WHERE patient_id = $1 AND encounter_fhir_id = ANY($2)",
      [patientId, targets],
    );
  } catch (err) {
    console.warn(
      "Soft delete nodes failed, falling back to hard delete:",
      err.message,
    );
    await client.query(
      "DELETE FROM encounter_nodes WHERE patient_id = $1 AND encounter_fhir_id = ANY($2)",
      [patientId, targets],
    );
  }

  // Invalidate cache and trigger background refresh
  await invalidatePatientCache(patientId);
  await invalidateToonCacheForPatient(patientId);
  // Proactively refresh cache in background (non-blocking)
  setImmediate(() => {
    getGraphForPatient(patientId).catch((err) =>
      console.warn("[CACHE REFRESH] Failed after deleteNode:", err.message),
    );
  });

  return { deleted: targets, fhirDeleteResults };
}

// Undelete a node and restore its edges (if soft deletes are supported)
async function restoreNode(patientId, nodeId) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeId) throw new Error("nodeId is required");

  await ensureDbConnection();
  const hasSoftDelete = await checkEdgeSoftDeleteSupport();

  if (!hasSoftDelete) {
    throw {
      statusCode: 400,
      errors: {
        restore:
          "Soft delete not supported on node_relations; undelete unavailable",
      },
    };
  }

  try {
    const result = await client.query(
      "UPDATE encounter_nodes SET is_deleted = FALSE, deleted_at = NULL WHERE patient_id = $1 AND encounter_fhir_id = $2 RETURNING encounter_fhir_id",
      [patientId, nodeId],
    );

    if (result.rowCount === 0) {
      throw { statusCode: 404, errors: { node: "Node not found" } };
    }

    // Restore edges
    await client.query(
      "UPDATE node_relations SET is_deleted = FALSE, deleted_at = NULL WHERE (source_node_id = $1 OR target_node_id = $1)",
      [nodeId],
    );

    // Invalidate cache and trigger background refresh
    await invalidatePatientCache(patientId);
    await invalidateToonCacheForPatient(patientId);
    // Proactively refresh cache in background (non-blocking)
    setImmediate(() => {
      getGraphForPatient(patientId).catch((err) =>
        console.warn("[CACHE REFRESH] Failed after restoreNode:", err.message),
      );
    });

    return {
      success: true,
      restored: nodeId,
      message: "Node and related edges restored",
    };
  } catch (err) {
    if (err.statusCode) throw err;
    throw {
      statusCode: 500,
      errors: { restore: `Failed to restore node: ${err.message}` },
    };
  }
}

// Get graph analytics and metrics
async function getGraphStats(patientId) {
  if (!patientId) throw new Error("patientId is required");

  await ensureDbConnection();

  try {
    const totalNodesRes = await client.query(
      "SELECT COUNT(*) as count FROM encounter_nodes WHERE patient_id = $1",
      [patientId],
    );
    const totalNodes = parseInt(totalNodesRes.rows[0].count, 10);

    const activeNodesRes = await client.query(
      "SELECT COUNT(*) as count FROM encounter_nodes WHERE patient_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)",
      [patientId],
    );
    const activeNodes = parseInt(activeNodesRes.rows[0].count, 10);

    const deletedNodesRes = await client.query(
      "SELECT COUNT(*) as count FROM encounter_nodes WHERE patient_id = $1 AND is_deleted = TRUE",
      [patientId],
    );
    const deletedNodes = parseInt(deletedNodesRes.rows[0].count, 10);

    const totalEdgesRes = await client.query(
      "SELECT COUNT(*) as count FROM node_relations nr JOIN encounter_nodes en ON nr.source_node_id = en.encounter_fhir_id WHERE en.patient_id = $1",
      [patientId],
    );
    const totalEdges = parseInt(totalEdgesRes.rows[0].count, 10);

    const hasSoftDelete = await checkEdgeSoftDeleteSupport();
    let activeEdges = totalEdges;
    let deletedEdges = 0;

    if (hasSoftDelete) {
      const activeEdgesRes = await client.query(
        "SELECT COUNT(*) as count FROM node_relations nr JOIN encounter_nodes en ON nr.source_node_id = en.encounter_fhir_id WHERE en.patient_id = $1 AND (nr.is_deleted IS NULL OR nr.is_deleted = FALSE)",
        [patientId],
      );
      activeEdges = parseInt(activeEdgesRes.rows[0].count, 10);
      deletedEdges = totalEdges - activeEdges;
    }

    const categoryBreakdownRes = await client.query(
      "SELECT category, COUNT(*) as count FROM encounter_nodes WHERE patient_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE) GROUP BY category",
      [patientId],
    );

    const categoryBreakdown = {};
    categoryBreakdownRes.rows.forEach((row) => {
      categoryBreakdown[row.category || "Unknown"] = parseInt(row.count, 10);
    });

    const priorityBreakdownRes = await client.query(
      "SELECT priority, COUNT(*) as count FROM encounter_nodes WHERE patient_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE) GROUP BY priority",
      [patientId],
    );

    const priorityBreakdown = {};
    priorityBreakdownRes.rows.forEach((row) => {
      priorityBreakdown[row.priority || "Unknown"] = parseInt(row.count, 10);
    });

    const ageRes = await client.query(
      "SELECT MIN(event_date) as oldest, MAX(event_date) as newest FROM encounter_nodes WHERE patient_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)",
      [patientId],
    );

    const oldest = ageRes.rows[0]?.oldest || null;
    const newest = ageRes.rows[0]?.newest || null;

    return {
      patientId,
      totalNodes,
      activeNodes,
      deletedNodes,
      deletionRatio:
        totalNodes > 0 ? (deletedNodes / totalNodes).toFixed(2) : 0,
      totalEdges,
      activeEdges,
      deletedEdges,
      categoryBreakdown,
      priorityBreakdown,
      oldestRecord: oldest ? new Date(oldest).toISOString() : null,
      newestRecord: newest ? new Date(newest).toISOString() : null,
    };
  } catch (err) {
    throw {
      statusCode: 500,
      errors: { stats: `Failed to fetch stats: ${err.message}` },
    };
  }
}

module.exports = {
  InitalizeHistoryGraph,
  createheadNodeEncounter,
  getGraphForPatient,
  seedSampleData,
  addNode,
  updateNode,
  deleteNode,
  restoreNode,
  getGraphStats,
  validateNodeData,
  buildErrorResponse,
  ALLOWED_CATEGORIES,
  ALLOWED_PRIORITIES,
  ALLOWED_NORMALITIES,
};
