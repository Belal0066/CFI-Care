// DOTENV Setup
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Require Services
const eocService = require("../episodeOfCare/eocService");
const encounterService = require("../encounter/encounterService");

// FHIR API Setup
const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

// DB Setup
const { Client } = require("pg");
const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function connectToDb() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database");
  } catch (err) {
    console.error("Error connecting to PostgreSQL:", err);
  }
}

async function createHistoryGraph(episodeOfCareData) {
  // Validation
  if (!episodeOfCareData) {
    throw new Error("Missing required argument: episodeOfCareData");
  }

  // 1. Create Episode of Care
  const episodeOfCare = await eocService.createEpisodeOfCareWithSpecificId(
    episodeOfCareData
  );

  if (!episodeOfCare || !episodeOfCare.data) {
    throw new Error("Failed to create EpisodeOfCare: No data returned");
  }

  const eocdata = episodeOfCare.data;
  const eocId = eocdata.id;
  const patientRef =
    episodeOfCare.data.patient && episodeOfCare.data.patient.reference;

  let patientId = null;

  if (patientRef) {
    // Split "Patient/pat-001" to get "pat-001"
    patientId = patientRef.split("/")[1];
  } else {
    console.warn(
      "Warning: EpisodeOfCare created, but patient reference is missing."
    );
  }

  const encounterData = {
    resourceType: "Encounter",
    id: "enc-101",
    meta: {
      versionId: "1",
      lastUpdated: "2025-12-10T00:52:08.282+02:00",
      profile: ["http://hl7.org/fhir/StructureDefinition/Encounter"],
    },
    text: {
      status: "generated",
      div: '<div xmlns="http://www.w3.org/1999/xhtml">Routine Hypertension Check-up</div>',
    },
    status: "completed",
    class: [
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
    type: [
      {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: "185345009",
            display: "Encounter for symptom",
          },
        ],
        text: "Routine Follow-up",
      },
    ],
    subject: {
      reference: "Patient/pat-001",
      display: "George O'Malley",
    },
    episodeOfCare: [
      {
        reference: "EpisodeOfCare/eoc-001",
        display: "Hypertension Management",
      },
    ],
    participant: [
      {
        type: [
          {
            coding: [
              {
                system:
                  "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                code: "PPRF",
                display: "primary performer",
              },
            ],
          },
        ],
        actor: {
          reference: "Practitioner/prac-001",
          display: "Dr. Miranda Bailey",
        },
      },
    ],
    actualPeriod: {
      start: "2024-02-15T10:00:00+02:00",
      end: "2024-02-15T10:30:00+02:00",
    },
    reason: [
      {
        value: [
          {
            concept: {
              coding: [
                {
                  system: "http://snomed.info/sct",
                  code: "38341003",
                  display: "Hypertension",
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const encounter = await encounterService.createEncounterWithSpecificIdForEOC(
    patientId,
    encounterData,
    eocId
  );

  const encounterId = encounter.data.id;

  console.log(
    `Successfully created History Graph: EoC ID = ${eocId}, Encounter ID = ${encounterId}`
  );

  return { eocId, patientId, encounterId };
}


module.exports = {
  createHistoryGraph,
};
