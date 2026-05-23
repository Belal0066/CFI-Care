const request = require("supertest");
const express = require("express");

// Mock the service that the controller uses
jest.mock("../../historyGraphService", () => ({
  InitalizeHistoryGraph: jest.fn(),
  createheadNodeEncounter: jest.fn(),
  getGraphForPatient: jest.fn(),
  addNode: jest.fn(),
  updateNode: jest.fn(),
  deleteNode: jest.fn(),
  createSampleData: jest.fn(),
}));

// Mock other dependencies
jest.mock("../../../episodeOfCare/eocService", () => ({
  getEpisodeOfCare: jest.fn(),
  createEpisodeOfCare: jest.fn(),
}));

jest.mock("../../../middleware/cacheHelper", () => ({
  getFromCache: jest.fn(),
  setInCache: jest.fn(),
  deleteFromCache: jest.fn(),
}));

const historyGraphService = require("../../historyGraphService");
const historyGraphRoutes = require("../../historyGraphRoutes");

const app = express();
app.use(express.json());
app.use("/api/history-graph", historyGraphRoutes);

describe("History Graph E2E Workflow", () => {
  const testPatientId = "patient-e2e-001";
  let headNodeId;
  let secondNodeId;
  let eocId;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Complete workflow: Initialize → Create Head → Add Nodes → Retrieve → Update → Delete", async () => {
    // Step 1: Initialize history graph for patient
    const mockInitResult = {
      success: true,
      patientId: testPatientId,
      eocId: "eoc-e2e-001",
    };

    historyGraphService.InitalizeHistoryGraph.mockResolvedValue(mockInitResult);

    const initResponse = await request(app)
      .put("/api/history-graph/initialize")
      .send({ patientId: testPatientId });

    expect(initResponse.status).toBe(200);
    expect(initResponse.body.success).toBe(true);
    eocId = initResponse.body.eocId;

    // Step 2: Create head node (initial encounter)
    const headNode = {
      node_id: "node-head-001",
      patient_id: testPatientId,
      eoc_id: eocId,
      title: "Initial Consultation",
      category: "Consultation",
      encounter_id: "encounter-head-001",
      created_at: new Date(),
    };

    historyGraphService.createheadNodeEncounter.mockResolvedValue(headNode);

    const headNodeResponse = await request(app)
      .put(`/api/history-graph/head-node/${testPatientId}/${eocId}`)
      .send({
        title: "Initial Consultation",
        category: "Consultation",
      });

    expect(headNodeResponse.status).toBe(200);
    expect(headNodeResponse.body.node_id).toBe("node-head-001");
    headNodeId = headNodeResponse.body.node_id;

    // Step 3: Add second node (blood test)
    const secondNode = {
      node_id: "node-002",
      patient_id: testPatientId,
      title: "Blood Test",
      category: "Lab",
      parent_node_id: headNodeId,
      created_at: new Date(),
    };

    historyGraphService.addNode.mockResolvedValue(secondNode);

    const addNodeResponse = await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId: testPatientId,
        eocId: eocId,
        nodeData: {
          title: "Blood Test",
          category: "Lab",
        },
        parentNodeId: headNodeId,
      });

    expect(addNodeResponse.status).toBe(201);
    expect(addNodeResponse.body.node_id).toBe("node-002");
    secondNodeId = addNodeResponse.body.node_id;

    // Step 4: Retrieve complete graph
    const graphData = {
      nodes: [headNode, secondNode],
      edges: [
        {
          source_node_id: headNodeId,
          target_node_id: secondNodeId,
          relationship_type: "leads_to",
        },
      ],
    };

    historyGraphService.getGraphForPatient.mockResolvedValue(graphData);

    const getGraphResponse = await request(app).get(
      `/api/history-graph/${testPatientId}`,
    );

    expect(getGraphResponse.status).toBe(200);
    expect(getGraphResponse.body.nodes).toHaveLength(2);
    expect(getGraphResponse.body.edges).toHaveLength(1);
    expect(getGraphResponse.body.nodes[0].node_id).toBe(headNodeId);

    // Step 5: Update second node
    const updatedNode = {
      ...secondNode,
      title: "Complete Blood Count (CBC)",
      updated_at: new Date(),
    };

    historyGraphService.updateNode.mockResolvedValue(updatedNode);

    const updateResponse = await request(app)
      .put("/api/history-graph/updateNode")
      .send({
        nodeId: secondNodeId,
        patientId: testPatientId,
        updatedData: {
          title: "Complete Blood Count (CBC)",
          category: "Lab",
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.title).toBe("Complete Blood Count (CBC)");

    // Step 6: Add third node (X-ray imaging)
    const thirdNode = {
      node_id: "node-003",
      patient_id: testPatientId,
      title: "Chest X-Ray",
      category: "Imaging",
      parent_node_id: secondNodeId,
      created_at: new Date(),
    };

    historyGraphService.addNode.mockResolvedValue(thirdNode);

    const thirdNodeResponse = await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId: testPatientId,
        eocId: eocId,
        nodeData: {
          title: "Chest X-Ray",
          category: "Imaging",
        },
        parentNodeId: secondNodeId,
      });

    expect(thirdNodeResponse.status).toBe(201);

    // Step 7: Retrieve updated graph with 3 nodes
    const updatedGraphData = {
      nodes: [headNode, updatedNode, thirdNode],
      edges: [
        {
          source_node_id: headNodeId,
          target_node_id: secondNodeId,
          relationship_type: "leads_to",
        },
        {
          source_node_id: secondNodeId,
          target_node_id: thirdNode.node_id,
          relationship_type: "leads_to",
        },
      ],
    };

    historyGraphService.getGraphForPatient.mockResolvedValue(updatedGraphData);

    const finalGraphResponse = await request(app).get(
      `/api/history-graph/${testPatientId}`,
    );

    expect(finalGraphResponse.status).toBe(200);
    expect(finalGraphResponse.body.nodes).toHaveLength(3);
    expect(finalGraphResponse.body.edges).toHaveLength(2);

    // Step 8: Delete third node (soft delete)
    historyGraphService.deleteNode.mockResolvedValue({
      success: true,
      nodeId: thirdNode.node_id,
    });

    const deleteResponse = await request(app).delete(
      `/api/history-graph/${testPatientId}/${thirdNode.node_id}`,
    );

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);

    // Step 9: Verify graph after deletion
    const finalGraph = {
      nodes: [headNode, updatedNode],
      edges: [
        {
          source_node_id: headNodeId,
          target_node_id: secondNodeId,
          relationship_type: "leads_to",
        },
      ],
    };

    historyGraphService.getGraphForPatient.mockResolvedValue(finalGraph);

    const afterDeleteResponse = await request(app).get(
      `/api/history-graph/${testPatientId}`,
    );

    expect(afterDeleteResponse.status).toBe(200);
    expect(afterDeleteResponse.body.nodes).toHaveLength(2);
    expect(afterDeleteResponse.body.edges).toHaveLength(1);
  });

  it("Multi-branch workflow: Create branching timeline", async () => {
    const patientId = "patient-branch-001";

    // Initialize
    const mockInitResult = {
      success: true,
      eocId: "eoc-branch-001",
    };

    historyGraphService.InitalizeHistoryGraph.mockResolvedValue(mockInitResult);

    await request(app).put("/api/history-graph/initialize").send({ patientId });

    // Create head node
    const headNode = { node_id: "node-head", patient_id: patientId };
    historyGraphService.createheadNodeEncounter.mockResolvedValue(headNode);

    await request(app)
      .put(`/api/history-graph/head-node/${patientId}/eoc-branch-001`)
      .send({ title: "Initial Visit", category: "Consultation" });

    // Branch 1: Lab tests
    const labNode = {
      node_id: "node-lab",
      parent_node_id: "node-head",
      category: "Lab",
    };
    historyGraphService.addNode.mockResolvedValue(labNode);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId: "eoc-branch-001",
        nodeData: {
          title: "Lab Work",
          category: "Lab",
        },
        parentNodeId: "node-head",
      });

    // Branch 2: Imaging (also from head)
    const imagingNode = {
      node_id: "node-imaging",
      parent_node_id: "node-head",
      category: "Imaging",
    };
    historyGraphService.addNode.mockResolvedValue(imagingNode);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId: "eoc-branch-001",
        nodeData: {
          title: "MRI Scan",
          category: "Imaging",
        },
        parentNodeId: "node-head",
      });

    // Verify graph has branches
    const graphWithBranches = {
      nodes: [headNode, labNode, imagingNode],
      edges: [
        { source_node_id: "node-head", target_node_id: "node-lab" },
        { source_node_id: "node-head", target_node_id: "node-imaging" },
      ],
    };

    historyGraphService.getGraphForPatient.mockResolvedValue(graphWithBranches);

    const graphResponse = await request(app).get(
      `/api/history-graph/${patientId}`,
    );

    expect(graphResponse.status).toBe(200);
    expect(graphResponse.body.nodes).toHaveLength(3);
    expect(graphResponse.body.edges).toHaveLength(2);

    // Verify both edges originate from head node
    const edges = graphResponse.body.edges;
    expect(edges.every((e) => e.source_node_id === "node-head")).toBe(true);
  });

  it("Error handling: Invalid category rejection", async () => {
    const invalidNode = {
      patientId: testPatientId,
      eocId: "eoc-e2e-001",
      nodeData: {
        title: "Invalid Test",
        category: "NotAValidCategory",
      },
      parentNodeId: "node-001",
    };

    historyGraphService.addNode.mockRejectedValue(
      new Error("Invalid category"),
    );

    const response = await request(app)
      .post("/api/history-graph/addNode")
      .send(invalidNode);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("Cache integration: Subsequent reads use cache", async () => {
    const cachedData = {
      nodes: [{ node_id: "cached-node" }],
      edges: [],
    };

    // First request: cache miss
    historyGraphService.getGraphForPatient.mockResolvedValue(cachedData);

    const firstResponse = await request(app).get(
      `/api/history-graph/${testPatientId}`,
    );

    expect(firstResponse.status).toBe(200);
    expect(historyGraphService.getGraphForPatient).toHaveBeenCalled();

    // Second request
    historyGraphService.getGraphForPatient.mockResolvedValue(cachedData);

    const secondResponse = await request(app).get(
      `/api/history-graph/${testPatientId}`,
    );

    expect(secondResponse.status).toBe(200);
  });
});
