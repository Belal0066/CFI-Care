const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Require Services
const eocService = require("../episodeOfCare/eocService");
const encounterService = require("../encounter/encounterService");

// DB Setup
const { Client } = require("pg");
const { randomUUID } = require("crypto");

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

// ==========================================
// FHIR R5 MAPPING HELPERS
// ==========================================

function mapNormalityToStatus(normality) {
  switch (normality) {
    case "Pending":
      return "in-progress";
    case "Normal":
      return "completed";
    case "Abnormal":
      return "completed";
    default:
      return "in-progress";
  }
}

/**
 * Maps a custom graph node to a FHIR R5 Encounter Resource
 */
function mapNodeToFHiR5(node, patientId, eocId) {
  const priorityMap = {
    Low: { code: "R", display: "Routine" },
    Medium: { code: "UR", display: "Urgent" },
    High: { code: "EM", display: "Emergency" },
  };
  const priorityObj = priorityMap[node.priority] || priorityMap["Low"];

  const typeMap = {
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
  };
  const typeObj = typeMap[node.category] || {
    code: "11429006",
    display: "Consultation",
  };

  return {
    resourceType: "Encounter",
    id: node.id ? node.id.toString() : `enc-${randomUUID()}`,
    status: mapNormalityToStatus(node.normality),

    class: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: "IMP",
            display: "inpatient encounter",
          },
        ],
      },
    ],

    type: [
      {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: typeObj.code,
            display: typeObj.display,
          },
        ],
        text: node.title || node.text_1,
      },
    ],

    serviceType: [
      {
        concept: {
          coding: [
            {
              system: "http://snomed.info/sct",
              code: "394802001",
              display: "General medicine",
            },
          ],
          text: node.category,
        },
      },
    ],

    priority: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
          code: priorityObj.code,
          display: priorityObj.display,
        },
      ],
    },

    subject: {
      reference: `Patient/${patientId}`,
    },

    episodeOfCare: [
      {
        reference: `EpisodeOfCare/${eocId}`,
      },
    ],

    actualPeriod: {
      start: node.dateIssued
        ? new Date(node.dateIssued).toISOString()
        : new Date().toISOString(),
    },

    // Only include reason if non-empty to avoid FHIR validation failures
    ...(node.details
      ? {
          reason: [
            {
              value: [
                {
                  concept: {
                    text: node.details,
                  },
                },
              ],
            },
          ],
        }
      : {}),
  };
}

async function InitalizeHistoryGraph(episodeOfCareData) {
  if (!episodeOfCareData) {
    throw new Error("Missing required argument: episodeOfCareData");
  }

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
    patientId = patientRef.split("/")[1];
  }
  return { eocId, patientId };
}

async function createheadNodeEncounter(patientId, eocId, nodeData) {
  const pId = patientId || "pat-001";
  const eId = eocId || "eoc-001";

  if (!nodeData.id) nodeData.id = `enc-${randomUUID()}`;

  const fhirEncounter = mapNodeToFHiR5(nodeData, pId, eId);
  const headNodeEncounter =
    await encounterService.createEncounterWithSpecificIdForEOC(
      pId,
      fhirEncounter,
      eId
    );

  // 2. Insert into Graph (encounter_nodes)
  await ensureDbConnection();

  const insertNodeQuery = `
    INSERT INTO encounter_nodes 
    (encounter_fhir_id, patient_id, title, category, priority, normality, event_date, details, is_diagnosis)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
  ];

  await client.query(insertNodeQuery, nodeValues);

  return headNodeEncounter;
}

async function getGraphForPatient(patientId) {
  await ensureDbConnection();

  const nodesQuery = `
    SELECT 
      encounter_fhir_id, patient_id, title, category, priority, 
      normality, event_date, details, is_diagnosis 
    FROM encounter_nodes 
    WHERE patient_id = $1
  `;
  const nodesRes = await client.query(nodesQuery, [patientId]);

  const edgesQuery = `
    SELECT nr.source_node_id, nr.target_node_id 
    FROM node_relations nr
    JOIN encounter_nodes en ON nr.source_node_id = en.encounter_fhir_id
    WHERE en.patient_id = $1
  `;
  const edgesRes = await client.query(edgesQuery, [patientId]);

  const parentMap = {};
  edgesRes.rows.forEach((edge) => {
    parentMap[edge.target_node_id] = edge.source_node_id;
  });

  // Try to get the eocId from existing FHIR encounters
  let eocId = null;
  if (nodesRes.rows.length > 0) {
    try {
      const firstEncounterId = nodesRes.rows[0].encounter_fhir_id;
      const encounterResponse = await encounterService.getEncounterById(
        firstEncounterId
      );
      if (encounterResponse?.episodeOfCare?.[0]?.reference) {
        eocId = encounterResponse.episodeOfCare[0].reference.replace(
          "EpisodeOfCare/",
          ""
        );
      }
    } catch (err) {
      console.log("Could not retrieve eocId from FHIR:", err.message);
    }
  }

  const formattedData = nodesRes.rows.map((row) => ({
    id: row.encounter_fhir_id,
    text_1: row.title || "Untitled Node",
    father: parentMap[row.encounter_fhir_id] || null,
    category: row.category || "Consultation",
    priority: row.priority || "Low",
    normality: row.normality || "Normal",
    dateIssued: row.event_date
      ? new Date(row.event_date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    details: row.details || "",
    isDiagnosis: row.is_diagnosis || false,
  }));

  return { nodes: formattedData, eocId };
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

    // 2. CREATE FHIR ENCOUNTER
    const fhirResource = mapNodeToFHiR5(n, patientId, eocId);

    try {
      await encounterService.createEncounterWithSpecificIdForEOC(
        patientId,
        fhirResource,
        eocId
      );
    } catch (e) {
      console.error(
        `Failed to create FHIR resource for node ${n.id}:`,
        e.message
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

    await client.query(insertNodeQuery, [
      n.id,
      patientId,
      n.title,
      n.category,
      n.priority,
      n.normality,
      n.date,
      n.details,
      n.isDiagnosis || false,
    ]);

    // 4. CREATE RELATIONSHIP
    if (n.father !== null && n.father !== undefined && nodeMap[n.father]) {
      const parentId = nodeMap[n.father];
      const insertEdgeQuery = `
        INSERT INTO node_relations (relation_id, source_node_id, target_node_id)
        VALUES ($1, $2, $3)
      `;
      await client.query(insertEdgeQuery, [
        `rel-${randomUUID()}`,
        parentId,
        n.id,
      ]);
    }
  }
}

// add new node to graph
async function addNode(patientId, eocId, nodeData, parentNodeId = null) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeData) throw new Error("nodeData is required");
  if (!nodeData.text_1 && !nodeData.title) {
    throw new Error("nodeData must contain either 'text_1' or 'title'");
  }
  if (!nodeData.category) {
    throw new Error("nodeData.category is required");
  }

  // Auto-create EpisodeOfCare if not provided or is 'auto'/'eoc-default'
  let finalEocId = eocId;
  if (!eocId || eocId === "auto" || eocId === "eoc-default") {
    // Create a new EpisodeOfCare for this patient
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

  // Parse and format date
  let eventDate = nodeData.dateIssued || new Date().toISOString();
  if (typeof eventDate === "string" && !eventDate.includes("T")) {
    eventDate = new Date(eventDate).toISOString();
  } else if (!(eventDate instanceof Date)) {
    eventDate = new Date(eventDate).toISOString();
  }

  const fhirEncounter = mapNodeToFHiR5(
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
    finalEocId
  );

  let createdEncounter;
  try {
    createdEncounter =
      await encounterService.createEncounterWithSpecificIdForEOC(
        patientId,
        fhirEncounter,
        finalEocId
      );
    console.log(`FHIR Encounter created with ID: ${nodeData.id}`);
  } catch (err) {
    throw new Error(`Failed to create FHIR Encounter resource: ${err.message}`);
  }

  await ensureDbConnection();

  const insertNodeQuery = `
    INSERT INTO encounter_nodes 
    (encounter_fhir_id, patient_id, title, category, priority, normality, event_date, details, is_diagnosis)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (encounter_fhir_id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      priority = EXCLUDED.priority,
      normality = EXCLUDED.normality,
      event_date = EXCLUDED.event_date,
      details = EXCLUDED.details,
      is_diagnosis = EXCLUDED.is_diagnosis
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
  ];

  let dbNodeResult;
  try {
    dbNodeResult = await client.query(insertNodeQuery, nodeValues);
    console.log(`Node inserted into encounter_nodes table: ${nodeData.id}`);
  } catch (err) {
    throw new Error(`Failed to insert node into database: ${err.message}`);
  }

  if (parentNodeId) {
    const parentCheckQuery =
      "SELECT encounter_fhir_id FROM encounter_nodes WHERE encounter_fhir_id = $1";
    const parentCheckResult = await client.query(parentCheckQuery, [
      parentNodeId,
    ]);

    if (parentCheckResult.rows.length === 0) {
      throw new Error(
        `Parent node with ID ${parentNodeId} does not exist in the database`
      );
    }

    const relationId = `rel-${randomUUID()}`;
    const insertEdgeQuery = `
      INSERT INTO node_relations (relation_id, source_node_id, target_node_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (relation_id) DO NOTHING
    `;

    try {
      await client.query(insertEdgeQuery, [
        relationId,
        parentNodeId,
        nodeData.id,
      ]);
      console.log(
        `Relationship created: ${parentNodeId} -> ${nodeData.id} (${relationId})`
      );
    } catch (err) {
      throw new Error(`Failed to create node relationship: ${err.message}`);
    }
  }

  return {
    id: nodeData.id,
    text_1: nodeTitle,
    father: parentNodeId || null,
    category: category,
    priority: priority,
    normality: normality,
    dateIssued: eventDate.split("T")[0],
    details: details,
    isDiagnosis: isDiagnosis,
    eocId: finalEocId, // Return the eocId so frontend can use it for subsequent adds
    fhirResource: createdEncounter,
  };
}

async function updateNode(patientId, nodeId, updatedData, newParentNodeId) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeId) throw new Error("nodeId is required");
  if (!updatedData) throw new Error("updatedData is required");

  await ensureDbConnection();

  const title = updatedData.text_1 || updatedData.title;
  const category = updatedData.category;
  const priority = updatedData.priority || "Medium";
  const normality = updatedData.normality || "Pending";
  const details = updatedData.details || "";
  const isDiagnosis = updatedData.isDiagnosis || false;

  if (!title) throw new Error("title/text_1 is required");
  if (!category) throw new Error("category is required");

  let eventDate = updatedData.dateIssued || new Date().toISOString();
  if (typeof eventDate === "string" && !eventDate.includes("T")) {
    eventDate = new Date(eventDate).toISOString();
  } else if (!(eventDate instanceof Date)) {
    eventDate = new Date(eventDate).toISOString();
  }

  // Get the eocId from the existing FHIR encounter
  let eocId = null;
  try {
    const existingEncounter = await encounterService.getEncounterById(nodeId);
    if (existingEncounter?.episodeOfCare?.[0]?.reference) {
      eocId = existingEncounter.episodeOfCare[0].reference.replace(
        "EpisodeOfCare/",
        ""
      );
    }
  } catch (err) {
    console.log("Could not retrieve eocId from FHIR:", err.message);
  }

  // Update FHIR Encounter
  if (eocId) {
    const fhirEncounter = mapNodeToFHiR5(
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
      eocId
    );

    try {
      await encounterService.updateEncounter(nodeId, fhirEncounter);
      console.log(`FHIR Encounter ${nodeId} updated successfully`);
    } catch (err) {
      console.error(`Failed to update FHIR Encounter ${nodeId}:`, err.message);
      // Continue with DB update even if FHIR update fails
    }
  }

  const updateQuery = `
    UPDATE encounter_nodes
    SET title = $1, category = $2, priority = $3, normality = $4, event_date = $5, details = $6, is_diagnosis = $7
    WHERE encounter_fhir_id = $8 AND patient_id = $9
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
    [nodeId]
  );
  if (parentQuery.rowCount > 0) {
    currentParentId = parentQuery.rows[0].source_node_id;
  }

  console.log(
    `updateNode: newParentNodeId=${newParentNodeId}, currentParentId=${currentParentId}`
  );

  // Only update parent relationship if newParentNodeId is explicitly provided (not undefined)
  // undefined = don't change, null = make it a root node, value = change parent
  if (newParentNodeId !== undefined) {
    console.log(
      `Updating parent relationship for ${nodeId} to ${newParentNodeId}`
    );
    await client.query("DELETE FROM node_relations WHERE target_node_id = $1", [
      nodeId,
    ]);

    if (newParentNodeId !== null) {
      const parentCheck = await client.query(
        "SELECT encounter_fhir_id FROM encounter_nodes WHERE encounter_fhir_id = $1",
        [newParentNodeId]
      );
      if (parentCheck.rowCount === 0) {
        throw new Error(`Parent node ${newParentNodeId} does not exist`);
      }

      await client.query(
        `INSERT INTO node_relations (relation_id, source_node_id, target_node_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (relation_id) DO NOTHING`,
        [`rel-${randomUUID()}`, newParentNodeId, nodeId]
      );
    }
    currentParentId = newParentNodeId;
  } else {
    console.log(
      `Preserving parent relationship for ${nodeId}: ${currentParentId}`
    );
  }

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
  };
}

// Helper: recursively collect descendants for deletion
async function collectDescendants(nodeIds) {
  const queue = [...nodeIds];
  const all = new Set(queue);

  while (queue.length) {
    const current = queue.shift();
    const res = await client.query(
      "SELECT target_node_id FROM node_relations WHERE source_node_id = $1",
      [current]
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

// Delete a node and its descendants
async function deleteNode(patientId, nodeId) {
  if (!patientId) throw new Error("patientId is required");
  if (!nodeId) throw new Error("nodeId is required");

  await ensureDbConnection();

  // Collect node + descendants
  const targets = await collectDescendants([nodeId]);

  // Delete from FHIR server first
  const fhirDeleteResults = [];
  for (const encounterId of targets) {
    try {
      const result = await encounterService.deleteEncounter(encounterId);
      fhirDeleteResults.push({ id: encounterId, success: true, result });
      console.log(`FHIR Encounter ${encounterId} deleted successfully`);
    } catch (err) {
      console.error(
        `Failed to delete FHIR Encounter ${encounterId}:`,
        err.message
      );
      fhirDeleteResults.push({
        id: encounterId,
        success: false,
        error: err.message,
      });
      // Continue with other deletions even if one fails
    }
  }

  // Remove relations first
  await client.query(
    "DELETE FROM node_relations WHERE source_node_id = ANY($1) OR target_node_id = ANY($1)",
    [targets]
  );

  // Delete encounters from database
  await client.query(
    "DELETE FROM encounter_nodes WHERE patient_id = $1 AND encounter_fhir_id = ANY($2)",
    [patientId, targets]
  );

  return { deleted: targets, fhirDeleteResults };
}

module.exports = {
  InitalizeHistoryGraph,
  createheadNodeEncounter,
  getGraphForPatient,
  seedSampleData,
  addNode,
  updateNode,
  deleteNode,
};
