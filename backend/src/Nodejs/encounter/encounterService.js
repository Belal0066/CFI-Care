const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const axios = require("axios");
const fhirApi = axios.create({
  baseURL: process.env.FHIR_SERVER_URL,
  headers: {
    "Content-Type": "application/fhir+json",
  },
});

const { Client } = require("pg");
const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const tableName = "encounter_nodes";
const encounter_fhir_id_column = "encounter_fhir_id";
const insert_query = `INSERT INTO ${tableName} (${encounter_fhir_id_column}) VALUES ($1) RETURNING encounter_fhir_id`;

async function connectToDb() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL database");
  } catch (err) {
    console.error("Error connecting to PostgreSQL:", err);
  }
}

//Get Encounter by ID
async function getEncounterById(encounterId) {
  try {
    const response = await fhirApi.get(`/Encounter/${encounterId}`);
    return response.data; // Return raw data without transformation
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error("Encounter not found");
    } else {
      console.error("FHIR Server Error:", error.message);
      throw new Error("Could not connect to the FHIR server.");
    }
  }
}

//Get Everything related to an Encounter
async function getEncounterEverything(encounterId) {
  try {
    const response = await fhirApi.get(`/Encounter/${encounterId}/$everything`);
    return response.data.entry
      ? response.data.entry.map((e) => e.resource)
      : [];
  } catch (error) {
    console.error("FHIR Server Error:", error.message);
    throw new Error("Could not connect to the FHIR server.");
  }
}

//Create Patient with Specific ID
async function createEncounterWithSpecificId(encounterData) {
  const encounterId = encounterData.id;
  if (!encounterId) {
    throw new Error("Encounter ID is required");
  }
  const fhirEncounterResource = {
    resourceType: "Encounter",
    ...encounterData,
  };
  console.log(`Attempting to PUT Encounter to /Encounter/${encounterId}`);
  try {
    // FHIR Server PUT Request
    const response = await fhirApi.put(
      `/Encounter/${encounterId}`,
      fhirEncounterResource
    );
    return { data: response.data, id: response.data.id };
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2)
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

// Create Encounter with Specific ID
async function createEncounterWithSpecificIdForEOC(
  patientId,
  encounterData,
  episodeOfCareId
) {
  const encounterId = encounterData.id;
  if (!encounterId) {
    throw new Error("Encounter ID is required");
  }
  const fhirEncounterResource = {
    resourceType: "Encounter",
    id: encounterId,
    // Status is mandatory
    status: encounterData.status || "finished",

    // Narrative (fixes dom-6 warning)
    text: {
      status: "generated",
      div: `<div xmlns="http://www.w3.org/1999/xhtml">Encounter for Patient ${patientId}</div>`,
    },

    // Class must be an Array containing a CodeableConcept with a Coding Array
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

    episodeOfCare: [
      {
        reference: `EpisodeOfCare/${episodeOfCareId}`,
      },
    ],
    subject: {
      reference: `Patient/${patientId}`,
    },
    // ...encounterData,
  };
  console.log(`Attempting to PUT Encounter to /Encounter/${encounterId}`);
  try {
    // FHIR Server PUT Request
    const response = await fhirApi.put(
      `/Encounter/${encounterId}`,
      fhirEncounterResource
    );

    // Insert into PostgreSQL
    connectToDb();
    const res = await client.query(insert_query, [encounterId]);
    console.log("Inserted Encounter node with DB ID:", res.rows[0].id);

    return { data: response.data, id: response.data.id };
  } catch (error) {
    if (error.response) {
      console.error("FHIR Server Error Status:", error.response.status);
      console.error(
        "FHIR Validation Details:",
        JSON.stringify(error.response.data, null, 2)
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

module.exports = {
  getEncounterById,
  getEncounterEverything,
  createEncounterWithSpecificId,
  createEncounterWithSpecificIdForEOC,
};
