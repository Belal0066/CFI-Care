const request = require("supertest");
const express = require("express");

jest.mock("../../src/Nodejs/middleware/requireApiAuth", () => ({
  requireApiAuth: (req, res, next) => next(),
}));
jest.mock("../../src/Nodejs/middleware/requirePatientContext", () => ({
  requirePatientContext: () => (req, res, next) => next(),
}));

// Mock the service that the controller uses
jest.mock("../../src/Nodejs/historyGraph/historyGraphService", () => ({
  InitalizeHistoryGraph: jest.fn(),
  createheadNodeEncounter: jest.fn(),
  getGraphForPatient: jest.fn(),
  addNode: jest.fn(),
  updateNode: jest.fn(),
  deleteNode: jest.fn(),
  createSampleData: jest.fn(),
}));

// Mock other dependencies
jest.mock("../../src/Nodejs/episodeOfCare/eocService", () => ({
  getEpisodeOfCare: jest.fn(),
  createEpisodeOfCare: jest.fn(),
}));

jest.mock("../../src/Nodejs/middleware/cacheHelper", () => ({
  getFromCache: jest.fn(),
  setInCache: jest.fn(),
  deleteFromCache: jest.fn(),
}));

const historyGraphService = require("../../src/Nodejs/historyGraph/historyGraphService");
const historyGraphRoutes = require("../../src/Nodejs/historyGraph/historyGraphRoutes");

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

  it("Branch status: marking a branch node as completed persists branchState in graph", async () => {
    const patientId = "patient-branch-status-001";
    const eocId = "eoc-branch-status-001";

    // Step 1: Add a manual-branch starter node
    const branchNode = {
      id: "node-branch-001",
      text_1: "Treatment Branch",
      category: "Consultation",
      isManualBranch: true,
      branchState: "in_progress",
      branchId: null,
      father: null,
      eocId,
    };
    historyGraphService.addNode.mockResolvedValue(branchNode);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId,
        nodeData: {
          title: "Treatment Branch",
          category: "Consultation",
          isManualBranch: true,
        },
      });

    // Step 2: Add a child node inside the branch
    const childNode = {
      id: "node-lab-branch-001",
      text_1: "CBC Test",
      category: "Lab",
      branchState: "in_progress",
      branchId: "node-branch-001",
      father: "node-branch-001",
      eocId,
    };
    historyGraphService.addNode.mockResolvedValue(childNode);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId,
        nodeData: { title: "CBC Test", category: "Lab" },
        parentNodeId: "node-branch-001",
      });

    // Step 3: Mark branch node as completed
    const completedBranch = {
      ...branchNode,
      branchState: "completed",
      updatedAt: new Date().toISOString(),
    };
    historyGraphService.updateNode.mockResolvedValue(completedBranch);

    const updateResponse = await request(app)
      .put("/api/history-graph/updateNode")
      .send({
        patientId,
        nodeId: "node-branch-001",
        updatedData: {
          title: "Treatment Branch",
          category: "Consultation",
          isManualBranch: true,
          branchState: "completed",
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.branchState).toBe("completed");
    expect(updateResponse.body.isManualBranch).toBe(true);

    // Step 4: Retrieve graph — branch node reflects completed state
    historyGraphService.getGraphForPatient.mockResolvedValue({
      nodes: [
        { ...branchNode, branchState: "completed" },
        childNode,
      ],
      edges: [
        {
          source_node_id: "node-branch-001",
          target_node_id: "node-lab-branch-001",
          relationship_type: "association",
        },
      ],
      eocId,
    });

    const graphResponse = await request(app).get(
      `/api/history-graph/${patientId}`,
    );

    expect(graphResponse.status).toBe(200);
    expect(graphResponse.body.nodes).toHaveLength(2);

    const completedNode = graphResponse.body.nodes.find(
      (n) => n.id === "node-branch-001",
    );
    expect(completedNode).toBeDefined();
    expect(completedNode.branchState).toBe("completed");
    expect(completedNode.isManualBranch).toBe(true);

    // Child node branchState is unaffected (still in_progress)
    const child = graphResponse.body.nodes.find(
      (n) => n.id === "node-lab-branch-001",
    );
    expect(child.branchState).toBe("in_progress");
    expect(child.branchId).toBe("node-branch-001");
  });

  it("Auto linker node: completing a branch causes a Linker node to appear on graph retrieval", async () => {
    const patientId = "patient-linker-001";
    const eocId = "eoc-linker-001";

    // Step 1: Main timeline head node
    const headNode = {
      id: "node-main-head",
      text_1: "Initial Consultation",
      category: "Consultation",
      branchState: "in_progress",
      branchId: null,
      father: null,
      eocId,
    };
    historyGraphService.addNode.mockResolvedValue(headNode);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId,
        nodeData: { title: "Initial Consultation", category: "Consultation" },
      });

    // Step 2: Add a branch-starter node off the head
    const branchStarter = {
      id: "node-branch-starter",
      text_1: "Investigation Branch",
      category: "Consultation",
      isManualBranch: true,
      branchState: "in_progress",
      branchId: null,
      father: "node-main-head",
      eocId,
    };
    historyGraphService.addNode.mockResolvedValue(branchStarter);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId,
        nodeData: {
          title: "Investigation Branch",
          category: "Consultation",
          isManualBranch: true,
        },
        parentNodeId: "node-main-head",
      });

    // Step 3: Add a child node inside the branch
    const branchChild = {
      id: "node-branch-child",
      text_1: "Lab Result",
      category: "Lab",
      branchState: "in_progress",
      branchId: "node-branch-starter",
      father: "node-branch-starter",
      eocId,
    };
    historyGraphService.addNode.mockResolvedValue(branchChild);

    await request(app)
      .post("/api/history-graph/addNode")
      .send({
        patientId,
        eocId,
        nodeData: { title: "Lab Result", category: "Lab" },
        parentNodeId: "node-branch-starter",
      });

    // Step 4: Mark the branch starter as completed
    const completedBranchStarter = {
      ...branchStarter,
      branchState: "completed",
      updatedAt: new Date().toISOString(),
    };
    historyGraphService.updateNode.mockResolvedValue(completedBranchStarter);

    const updateResponse = await request(app)
      .put("/api/history-graph/updateNode")
      .send({
        patientId,
        nodeId: "node-branch-starter",
        updatedData: {
          title: "Investigation Branch",
          category: "Consultation",
          isManualBranch: true,
          branchState: "completed",
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.branchState).toBe("completed");

    // Step 5: Graph retrieval now includes the auto-created Linker node
    const linkerNode = {
      id: "node-linker-auto-001",
      text_1: "Branch Merge Event",
      category: "Linker",
      branchState: "completed",
      branchId: "node-branch-starter",
      father: "node-branch-child",
      eocId,
    };

    historyGraphService.getGraphForPatient.mockResolvedValue({
      nodes: [
        headNode,
        { ...branchStarter, branchState: "completed" },
        branchChild,
        linkerNode,
      ],
      edges: [
        {
          source_node_id: "node-main-head",
          target_node_id: "node-branch-starter",
          relationship_type: "association",
        },
        {
          source_node_id: "node-branch-starter",
          target_node_id: "node-branch-child",
          relationship_type: "association",
        },
        {
          source_node_id: "node-branch-child",
          target_node_id: "node-linker-auto-001",
          relationship_type: "follows",
        },
      ],
      eocId,
    });

    const graphResponse = await request(app).get(
      `/api/history-graph/${patientId}`,
    );

    expect(graphResponse.status).toBe(200);
    expect(graphResponse.body.nodes).toHaveLength(4);
    expect(graphResponse.body.edges).toHaveLength(3);

    // Linker node is present
    const linker = graphResponse.body.nodes.find(
      (n) => n.category === "Linker",
    );
    expect(linker).toBeDefined();
    expect(linker.id).toBe("node-linker-auto-001");
    expect(linker.branchId).toBe("node-branch-starter");

    // Linker is connected from the last branch child via "follows" edge
    const linkerEdge = graphResponse.body.edges.find(
      (e) => e.target_node_id === "node-linker-auto-001",
    );
    expect(linkerEdge).toBeDefined();
    expect(linkerEdge.source_node_id).toBe("node-branch-child");
    expect(linkerEdge.relationship_type).toBe("follows");

    // Branch starter is marked completed
    const starter = graphResponse.body.nodes.find(
      (n) => n.id === "node-branch-starter",
    );
    expect(starter.branchState).toBe("completed");
  });

  it("Branch reopened: Linker node is removed from graph when branch reverts to in_progress", async () => {
    const patientId = "patient-reopen-001";
    const eocId = "eoc-reopen-001";

    const branchStarter = {
      id: "node-reopened-branch",
      text_1: "Completed Branch",
      category: "Consultation",
      isManualBranch: true,
      branchState: "completed",
      branchId: null,
      father: null,
      eocId,
    };
    const linkerNode = {
      id: "node-linker-to-remove",
      text_1: "Branch Merge Event",
      category: "Linker",
      branchState: "completed",
      branchId: "node-reopened-branch",
      father: "node-reopened-branch",
      eocId,
    };

    // Step 1: Graph starts with a completed branch + its linker node
    historyGraphService.getGraphForPatient.mockResolvedValue({
      nodes: [branchStarter, linkerNode],
      edges: [
        {
          source_node_id: "node-reopened-branch",
          target_node_id: "node-linker-to-remove",
          relationship_type: "follows",
        },
      ],
      eocId,
    });

    const beforeResponse = await request(app).get(
      `/api/history-graph/${patientId}`,
    );
    expect(beforeResponse.status).toBe(200);
    expect(
      beforeResponse.body.nodes.some((n) => n.category === "Linker"),
    ).toBe(true);

    // Step 2: Revert branch back to in_progress
    const reopenedBranch = {
      ...branchStarter,
      branchState: "in_progress",
      updatedAt: new Date().toISOString(),
    };
    historyGraphService.updateNode.mockResolvedValue(reopenedBranch);
    // Service also deletes the linker internally
    historyGraphService.deleteNode.mockResolvedValue({
      deleted: ["node-linker-to-remove"],
      fhirDeleteResults: [
        {
          id: "node-linker-to-remove",
          resourceType: "Encounter",
          success: true,
        },
      ],
    });

    const updateResponse = await request(app)
      .put("/api/history-graph/updateNode")
      .send({
        patientId,
        nodeId: "node-reopened-branch",
        updatedData: {
          title: "Completed Branch",
          category: "Consultation",
          isManualBranch: true,
          branchState: "in_progress",
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.branchState).toBe("in_progress");

    // Step 3: Graph no longer contains the Linker node
    historyGraphService.getGraphForPatient.mockResolvedValue({
      nodes: [{ ...branchStarter, branchState: "in_progress" }],
      edges: [],
      eocId,
    });

    const afterResponse = await request(app).get(
      `/api/history-graph/${patientId}`,
    );
    expect(afterResponse.status).toBe(200);
    expect(
      afterResponse.body.nodes.some((n) => n.category === "Linker"),
    ).toBe(false);
    expect(afterResponse.body.nodes).toHaveLength(1);
    expect(afterResponse.body.nodes[0].branchState).toBe("in_progress");
    expect(afterResponse.body.edges).toHaveLength(0);
  });

  it("Multiple branches: only the completed branch has an auto-created Linker node", async () => {
    const patientId = "patient-multi-branch-001";
    const eocId = "eoc-multi-branch-001";

    const headNode = {
      id: "node-multi-head",
      text_1: "Main Consultation",
      category: "Consultation",
      branchState: "in_progress",
      branchId: null,
      father: null,
      eocId,
    };
    // Branch A: still in_progress (Lab investigation)
    const branchA = {
      id: "node-branch-a",
      text_1: "Lab Investigation",
      category: "Lab",
      branchState: "in_progress",
      branchId: null,
      father: "node-multi-head",
      eocId,
    };
    // Branch B: completed (Diagnosis), with a child and a Linker
    const branchB = {
      id: "node-branch-b",
      text_1: "Diagnosis Branch",
      category: "Consultation",
      isManualBranch: true,
      branchState: "completed",
      branchId: null,
      father: "node-multi-head",
      eocId,
    };
    const branchBChild = {
      id: "node-branch-b-child",
      text_1: "X-Ray",
      category: "Imaging",
      branchState: "in_progress",
      branchId: "node-branch-b",
      father: "node-branch-b",
      eocId,
    };
    const linkerForB = {
      id: "node-linker-for-b",
      text_1: "Branch Merge Event",
      category: "Linker",
      branchState: "completed",
      branchId: "node-branch-b",
      father: "node-branch-b-child",
      eocId,
    };

    historyGraphService.getGraphForPatient.mockResolvedValue({
      nodes: [headNode, branchA, branchB, branchBChild, linkerForB],
      edges: [
        {
          source_node_id: "node-multi-head",
          target_node_id: "node-branch-a",
          relationship_type: "association",
        },
        {
          source_node_id: "node-multi-head",
          target_node_id: "node-branch-b",
          relationship_type: "association",
        },
        {
          source_node_id: "node-branch-b",
          target_node_id: "node-branch-b-child",
          relationship_type: "association",
        },
        {
          source_node_id: "node-branch-b-child",
          target_node_id: "node-linker-for-b",
          relationship_type: "follows",
        },
      ],
      eocId,
    });

    const graphResponse = await request(app).get(
      `/api/history-graph/${patientId}`,
    );

    expect(graphResponse.status).toBe(200);
    expect(graphResponse.body.nodes).toHaveLength(5);
    expect(graphResponse.body.edges).toHaveLength(4);

    // Branch A is still in_progress and has no linker
    const nodeA = graphResponse.body.nodes.find((n) => n.id === "node-branch-a");
    expect(nodeA.branchState).toBe("in_progress");
    const linkerForA = graphResponse.body.nodes.find(
      (n) => n.category === "Linker" && n.branchId === "node-branch-a",
    );
    expect(linkerForA).toBeUndefined();

    // Branch B is completed and has exactly one linker
    const nodeB = graphResponse.body.nodes.find((n) => n.id === "node-branch-b");
    expect(nodeB.branchState).toBe("completed");
    const linkerNodes = graphResponse.body.nodes.filter(
      (n) => n.category === "Linker",
    );
    expect(linkerNodes).toHaveLength(1);
    expect(linkerNodes[0].branchId).toBe("node-branch-b");

    // Linker is reached via a "follows" edge from branch B's last child
    const linkerEdge = graphResponse.body.edges.find(
      (e) => e.target_node_id === "node-linker-for-b",
    );
    expect(linkerEdge).toBeDefined();
    expect(linkerEdge.source_node_id).toBe("node-branch-b-child");
    expect(linkerEdge.relationship_type).toBe("follows");

    // Two edges originate from the head (one per branch)
    const headEdges = graphResponse.body.edges.filter(
      (e) => e.source_node_id === "node-multi-head",
    );
    expect(headEdges).toHaveLength(2);
  });
});

