const historyGraphService = require("./historyGraphService");
const { randomUUID } = require("crypto");

const InitalizeHistoryGraph = async (req, res) => {
  try {
    const episodeOfCareData = req.body;
    const historyGraph =
      await historyGraphService.InitalizeHistoryGraph(episodeOfCareData);
    res.status(200).json(historyGraph);
  } catch (error) {
    console.error("Error in InitalizeHistoryGraph:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const createheadNodeEncounter = async (req, res) => {
  try {
    const { patientId, eocId } = req.params;
    const encounterData = req.body;

    const headNodeData = await historyGraphService.createheadNodeEncounter(
      patientId,
      eocId,
      encounterData,
    );
    res.status(200).json(headNodeData);
  } catch (error) {
    console.error("Error in createheadNodeEncounter:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

const getGraphData = async (req, res) => {
  try {
    const { patientId } = req.params;
    // Extract query parameters for filtering/pagination
    const options = {
      eocId: req.query.eocId || null,
      limit: req.query.limit ? parseInt(req.query.limit) : null,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
      filterCategory: req.query.filterCategory || null,
      filterPriority: req.query.filterPriority || null,
      filterNormality: req.query.filterNormality || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      sortBy: req.query.sortBy || "event_date",
      sortOrder: req.query.sortOrder || "DESC",
    };
    const graphData = await historyGraphService.getGraphForPatient(
      patientId,
      options,
    );
    res.status(200).json(graphData);
  } catch (error) {
    console.error("Error in getGraphData:", error.message);
    res.status(500).json({ error: "Failed to fetch graph data" });
  }
};

// Mock Data Creation for Testing
const createSampleData = async (req, res) => {
  const { patientId } = req.params;
  // Default to 'pat-001' if not provided
  const pid = patientId || "pat-001";

  try {
    // 1. Define the nodes for a sample "Stomach Pain" journey
    const sampleNodes = [
      {
        id: `enc-${randomUUID()}`,
        title: "Initial Consultation: Stomach Pain",
        category: "Consultation",
        priority: "Low",
        normality: "Normal",
        date: "2025-10-05",
        details: "Patient reports epigastric pain.",
        father: null, // Root
      },
      {
        id: `enc-${randomUUID()}`,
        title: "Lab Tests Ordered",
        category: "Lab",
        priority: "Medium",
        normality: "Pending",
        date: "2025-10-06",
        details: "CBC and H. Pylori test ordered.",
        father: 0, // Will link to index 0 (Consultation)
      },
      {
        id: `enc-${randomUUID()}`,
        title: "H. Pylori Positive",
        category: "Lab",
        priority: "High",
        normality: "Abnormal",
        date: "2025-10-08",
        details: "Test result positive.",
        father: 1,
      },
      {
        id: `enc-${randomUUID()}`,
        title: "Diagnosis: Gastritis",
        category: "AISuggestion",
        priority: "High",
        normality: "Abnormal",
        date: "2025-10-09",
        details: "Confirmed via lab results.",
        father: 1,
        isDiagnosis: true,
      },
      {
        id: `enc-${randomUUID()}`,
        title: "Prescription: Antibiotics",
        category: "Prescription",
        priority: "Medium",
        normality: "Normal",
        date: "2025-10-10",
        details: "Amoxicillin + Clarithromycin.",
        father: 1,
      },
    ];

    // 2. Call the service to save these nodes
    await historyGraphService.seedSampleData(pid, sampleNodes);

    res.status(201).json({
      message: "Sample data created successfully",
      patientId: pid,
      nodesCreated: sampleNodes.length,
    });
  } catch (error) {
    console.error("Error seeding data:", error.message);
    res.status(500).json({ error: "Failed to create sample data" });
  }
};

// Add a new node
const addNode = async (req, res) => {
  try {
    const { patientId, eocId, nodeData, parentNodeId } = req.body;

    // Validate required fields
    if (!patientId) {
      return res.status(400).json({ error: "patientId is required" });
    }
    if (!eocId) {
      return res.status(400).json({ error: "eocId is required" });
    }
    if (!nodeData) {
      return res.status(400).json({ error: "nodeData is required" });
    }

    // If the caller is a practitioner (not the patient themselves), capture their ID
    const callerId = req.accessContext?.reqId;
    const practitionerId = callerId && callerId !== patientId ? callerId : null;

    // Call the service to add the node
    const result = await historyGraphService.addNode(
      patientId,
      eocId,
      nodeData,
      parentNodeId,
      practitionerId,
    );

    res.status(201).json(result);
  } catch (error) {
    console.error("Error in addNode:", error.message || error);
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ errors: error.errors || error.message });
    }
    res.status(500).json({ error: error.message || "Failed to add node" });
  }
};

// Update an existing node
const updateNode = async (req, res) => {
  try {
    const { patientId, nodeId, updatedData, parentNodeId } = req.body;

    if (!patientId)
      return res.status(400).json({ error: "patientId is required" });
    if (!nodeId) return res.status(400).json({ error: "nodeId is required" });
    if (!updatedData)
      return res.status(400).json({ error: "updatedData is required" });

    const result = await historyGraphService.updateNode(
      patientId,
      nodeId,
      updatedData,
      parentNodeId,
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in updateNode:", error.message);
    res.status(500).json({ error: error.message || "Failed to update node" });
  }
};

// Delete a node (and its descendants)
const deleteNode = async (req, res) => {
  try {
    const { patientId, nodeId } = req.params;

    if (!patientId)
      return res.status(400).json({ error: "patientId is required" });
    if (!nodeId) return res.status(400).json({ error: "nodeId is required" });

    const result = await historyGraphService.deleteNode(patientId, nodeId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in deleteNode:", error.message);
    res.status(500).json({ error: error.message || "Failed to delete node" });
  }
};

module.exports = {
  InitalizeHistoryGraph,
  createheadNodeEncounter,
  getGraphData,
  createSampleData,
  addNode,
  updateNode,
  deleteNode,
};
