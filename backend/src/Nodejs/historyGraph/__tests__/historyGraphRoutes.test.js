const request = require("supertest");
const express = require("express");
const historyGraphRoutes = require("../historyGraphRoutes");
const historyGraphController = require("../historyGraphController");

jest.mock("../historyGraphController");

const app = express();
app.use(express.json());
app.use("/api/history-graph", historyGraphRoutes);

describe("History Graph API Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("PUT /api/history-graph/initialize", () => {
    it("should initialize history graph for a patient", async () => {
      const mockResponse = {
        success: true,
        message: "History graph initialized",
        patientId: "patient-001",
      };

      historyGraphController.InitalizeHistoryGraph.mockImplementation(
        (req, res) => {
          res.status(200).json(mockResponse);
        },
      );

      const response = await request(app)
        .put("/api/history-graph/initialize")
        .send({ patientId: "patient-001" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("PUT /api/history-graph/head-node/:patientId/:eocId", () => {
    it("should create head node for patient", async () => {
      const mockHeadNode = {
        nodeId: "node-head-001",
        patientId: "patient-001",
        eocId: "eoc-001",
        category: "Consultation",
      };

      historyGraphController.createheadNodeEncounter.mockImplementation(
        (req, res) => {
          res.status(201).json(mockHeadNode);
        },
      );

      const response = await request(app)
        .put("/api/history-graph/head-node/patient-001/eoc-001")
        .send({ title: "Initial Consultation" });

      expect(response.status).toBe(201);
      expect(response.body.nodeId).toBe("node-head-001");
    });
  });

  describe("GET /api/history-graph/:patientId", () => {
    it("should retrieve graph data for a patient", async () => {
      const mockGraphData = {
        nodes: [
          {
            node_id: "node-001",
            patient_id: "patient-001",
            title: "Initial Consultation",
            category: "Consultation",
          },
          {
            node_id: "node-002",
            patient_id: "patient-001",
            title: "Blood Test",
            category: "Lab",
          },
        ],
        edges: [
          {
            source_node_id: "node-001",
            target_node_id: "node-002",
            relationship_type: "leads_to",
          },
        ],
      };

      historyGraphController.getGraphData.mockImplementation((req, res) => {
        res.status(200).json(mockGraphData);
      });

      const response = await request(app).get("/api/history-graph/patient-001");

      expect(response.status).toBe(200);
      expect(response.body.nodes).toHaveLength(2);
      expect(response.body.edges).toHaveLength(1);
    });

    it("should return empty graph for patient with no nodes", async () => {
      historyGraphController.getGraphData.mockImplementation((req, res) => {
        res.status(200).json({ nodes: [], edges: [] });
      });

      const response = await request(app).get("/api/history-graph/patient-new");

      expect(response.status).toBe(200);
      expect(response.body.nodes).toEqual([]);
      expect(response.body.edges).toEqual([]);
    });
  });

  describe("POST /api/history-graph/seed/:patientId", () => {
    it("should create sample data for testing", async () => {
      const mockSeedResponse = {
        success: true,
        nodesCreated: 5,
        edgesCreated: 4,
      };

      historyGraphController.createSampleData.mockImplementation((req, res) => {
        res.status(201).json(mockSeedResponse);
      });

      const response = await request(app).post(
        "/api/history-graph/seed/patient-001",
      );

      expect(response.status).toBe(201);
      expect(response.body.nodesCreated).toBeGreaterThan(0);
    });
  });

  describe("POST /api/history-graph/addNode", () => {
    it("should add a new node to the graph", async () => {
      const newNode = {
        patientId: "patient-001",
        title: "X-Ray Scan",
        category: "Imaging",
        parentNodeId: "node-001",
      };

      const mockCreatedNode = {
        node_id: "node-003",
        ...newNode,
      };

      historyGraphController.addNode.mockImplementation((req, res) => {
        res.status(201).json(mockCreatedNode);
      });

      const response = await request(app)
        .post("/api/history-graph/addNode")
        .send(newNode);

      expect(response.status).toBe(201);
      expect(response.body.node_id).toBe("node-003");
      expect(response.body.category).toBe("Imaging");
    });

    it("should validate required fields", async () => {
      const invalidNode = {
        patientId: "patient-001",
        // Missing title and category
      };

      historyGraphController.addNode.mockImplementation((req, res) => {
        res.status(400).json({ error: "Title and category are required" });
      });

      const response = await request(app)
        .post("/api/history-graph/addNode")
        .send(invalidNode);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe("PUT /api/history-graph/updateNode", () => {
    it("should update an existing node", async () => {
      const updateData = {
        nodeId: "node-001",
        patientId: "patient-001",
        title: "Updated Consultation Title",
        category: "Consultation",
      };

      const mockUpdatedNode = {
        ...updateData,
        updated_at: new Date().toISOString(),
      };

      historyGraphController.updateNode.mockImplementation((req, res) => {
        res.status(200).json(mockUpdatedNode);
      });

      const response = await request(app)
        .put("/api/history-graph/updateNode")
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Updated Consultation Title");
    });
  });

  describe("DELETE /api/history-graph/:patientId/:nodeId", () => {
    it("should soft delete a node", async () => {
      historyGraphController.deleteNode.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: "Node deleted successfully",
          nodeId: "node-002",
        });
      });

      const response = await request(app).delete(
        "/api/history-graph/patient-001/node-002",
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should return 404 for non-existent node", async () => {
      historyGraphController.deleteNode.mockImplementation((req, res) => {
        res.status(404).json({ error: "Node not found" });
      });

      const response = await request(app).delete(
        "/api/history-graph/patient-001/nonexistent",
      );

      expect(response.status).toBe(404);
    });
  });
});
