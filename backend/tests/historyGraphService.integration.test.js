const historyGraphService = require("../src/Nodejs/historyGraph/historyGraphService");
const eocService = require("../src/Nodejs/episodeOfCare/eocService");
const encounterService = require("../src/Nodejs/encounter/encounterService");
const cacheHelper = require("../src/Nodejs/middleware/cacheHelper");

jest.mock("../src/Nodejs/episodeOfCare/eocService");
jest.mock("../src/Nodejs/encounter/encounterService");
jest.mock("../src/Nodejs/middleware/cacheHelper");

jest.mock("axios", () => {
  const mockFhirApi = {
    put: jest
      .fn()
      .mockResolvedValue({ data: { resourceType: "Encounter", id: "enc-test-001" } }),
    delete: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue({ data: {} }),
  };
  return { create: jest.fn(() => mockFhirApi), __mockFhirApi: mockFhirApi };
});

jest.mock("pg", () => {
  const mockPool = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
  };
  return {
    Client: jest.fn(function () { return mockPool; }),
    Pool: jest.fn(function () { return mockPool; }),
    __mockClient: mockPool,
  };
});

describe("History Graph Service", () => {
  let mockClient;
  let mockFhirApi;

  beforeEach(() => {
    jest.clearAllMocks();

    const pg = require("pg");
    mockClient = pg.__mockClient;
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const axios = require("axios");
    mockFhirApi = axios.__mockFhirApi;
    mockFhirApi.put.mockResolvedValue({
      data: { resourceType: "Encounter", id: "enc-test-001" },
    });
    mockFhirApi.delete.mockResolvedValue({});

    cacheHelper.setInCache.mockResolvedValue(undefined);
    cacheHelper.invalidatePatientCache.mockResolvedValue(undefined);
    cacheHelper.getFromCache.mockResolvedValue(null);
    cacheHelper.CACHE_EXPIRATION = { PATIENT: 60 };
  });

  describe("getExistingEocForPatient", () => {
    it("should return existing EOC if found (tested via addNode with eocId=auto)", async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ encounter_fhir_id: "enc-consultation-001" }],
      });
      encounterService.getEncounterById = jest.fn().mockResolvedValue({
        id: "enc-consultation-001",
        episodeOfCare: [{ reference: "EpisodeOfCare/eoc-existing-001" }],
      });

      const result = await historyGraphService.addNode("patient-001", "auto", {
        title: "Follow-up Visit",
        category: "Consultation",
      });

      expect(result.eocId).toBe("eoc-existing-001");
      expect(eocService.createEpisodeOfCareWithSpecificId).not.toHaveBeenCalled();
    });

    it("should create new EOC when no existing EOC is found", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      eocService.createEpisodeOfCareWithSpecificId = jest.fn().mockResolvedValue({
        id: "eoc-new-auto",
        status: "active",
      });

      const result = await historyGraphService.addNode("patient-001", null, {
        title: "Initial Visit",
        category: "Consultation",
      });

      expect(eocService.createEpisodeOfCareWithSpecificId).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("Graph Data Retrieval", () => {
    it("should retrieve all nodes for a patient", async () => {
      const mockNodes = [
        {
          encounter_fhir_id: "node-001",
          patient_id: "patient-001",
          title: "Consultation",
          category: "Consultation",
          priority: "Medium",
          normality: "Pending",
          event_date: new Date("2025-01-15"),
          details: "",
          is_diagnosis: false,
          is_manual_branch: false,
          related_resource_ids: {},
          branch_state: "in_progress",
          branch_id: null,
          practitioner_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
        {
          encounter_fhir_id: "node-002",
          patient_id: "patient-001",
          title: "Lab Test",
          category: "Lab",
          priority: "Low",
          normality: "Normal",
          event_date: new Date("2025-01-20"),
          details: "",
          is_diagnosis: false,
          is_manual_branch: false,
          related_resource_ids: {},
          branch_state: "in_progress",
          branch_id: null,
          practitioner_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockNodes, rowCount: 2 })
        .mockResolvedValueOnce({ rows: [] });

      encounterService.getEncounterById = jest.fn().mockRejectedValue(new Error("no eoc"));

      const result = await historyGraphService.getGraphForPatient("patient-001");

      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe("node-001");
      expect(result.nodes[0].category).toBe("Consultation");
      expect(result.nodes[1].id).toBe("node-002");
    });

    it("should map edges (father/child relationships) correctly", async () => {
      const mockNodes = [
        {
          encounter_fhir_id: "node-002",
          patient_id: "patient-001",
          title: "Lab Test",
          category: "Lab",
          priority: "Low",
          normality: "Pending",
          event_date: new Date(),
          details: "",
          is_diagnosis: false,
          is_manual_branch: false,
          related_resource_ids: {},
          branch_state: "in_progress",
          branch_id: null,
          practitioner_id: null,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
      ];
      const mockEdges = [
        {
          source_node_id: "node-001",
          target_node_id: "node-002",
          relationship_type: "association",
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: mockNodes, rowCount: 1 })
        .mockResolvedValueOnce({ rows: mockEdges });

      encounterService.getEncounterById = jest.fn().mockRejectedValue(new Error("no eoc"));

      const result = await historyGraphService.getGraphForPatient("patient-001");

      expect(result.nodes[0].father).toBe("node-001");
      expect(result.nodes[0].relationshipType).toBe("association");
    });

    it("should throw a friendly error on database failure", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("Database connection failed"));

      await expect(
        historyGraphService.getGraphForPatient("patient-001"),
      ).rejects.toThrow("Could not fetch history graph for patient.");
    });
  });

  describe("Node Creation", () => {
    it("should create a node with valid category and return formatted result", async () => {
      const result = await historyGraphService.addNode("patient-001", "eoc-001", {
        title: "Blood Test",
        category: "Lab",
      });

      expect(result.id).toBeDefined();
      expect(result.category).toBe("Lab");
      expect(result.eocId).toBe("eoc-001");
      expect(result.father).toBeNull();
      expect(mockFhirApi.put).toHaveBeenCalled();
    });

    it("should reject an invalid node category with statusCode 400", async () => {
      await expect(
        historyGraphService.addNode("patient-001", "eoc-001", {
          title: "Invalid Test",
          category: "InvalidCategory",
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        errors: expect.objectContaining({ category: expect.any(String) }),
      });

      expect(mockFhirApi.put).not.toHaveBeenCalled();
    });

    it("should set isDiagnosis on result and create Condition FHIR resource", async () => {
      const result = await historyGraphService.addNode("patient-001", "eoc-001", {
        title: "Hypertension",
        category: "Consultation",
        isDiagnosis: true,
        normality: "Abnormal",
      });

      expect(result.isDiagnosis).toBe(true);
      // isDiagnosis=true → Encounter (primary) + Condition (related): at least 2 PUT calls
      expect(mockFhirApi.put.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Node Update", () => {
    it("should update node and return updated fields", async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ category: "Consultation", event_date: new Date(), branch_state: "in_progress" }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ branch_id: null }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ encounter_fhir_id: "node-001", branch_id: null }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await historyGraphService.updateNode(
        "patient-001",
        "node-001",
        { title: "Updated Title", category: "Consultation", normality: "Normal" },
      );

      expect(result.id).toBe("node-001");
      expect(result.category).toBe("Consultation");
      expect(mockFhirApi.put).toHaveBeenCalled();
    });

    it("should invalidate patient cache after update", async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ category: "Lab", event_date: new Date(), branch_state: "in_progress" }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ branch_id: null }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{ encounter_fhir_id: "node-001", branch_id: null }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await historyGraphService.updateNode("patient-001", "node-001", {
        title: "Updated Lab",
        category: "Lab",
        normality: "Normal",
      });

      expect(cacheHelper.invalidatePatientCache).toHaveBeenCalledWith("patient-001");
    });
  });

  describe("Node Deletion", () => {
    it("should soft-delete a node and return it in deleted list", async () => {
      const nodeId = "node-002";

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ encounter_fhir_id: nodeId, category: "Consultation", event_date: new Date(), related_resource_ids: {} }],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await historyGraphService.deleteNode("patient-001", nodeId);

      expect(result.deleted).toContain(nodeId);
      expect(result.fhirDeleteResults).toBeDefined();
    });

    it("should cascade-delete descendants", async () => {
      const parentId = "node-parent";
      const childId = "node-child";

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ target_node_id: childId }] })
        .mockResolvedValueOnce({
          rows: [
            { encounter_fhir_id: parentId, category: "Consultation", event_date: new Date(), related_resource_ids: {} },
            { encounter_fhir_id: childId, category: "Lab", event_date: new Date(), related_resource_ids: {} },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 2 })
        .mockResolvedValueOnce({ rowCount: 2 });

      const result = await historyGraphService.deleteNode("patient-001", parentId);

      expect(result.deleted).toContain(parentId);
      expect(result.deleted).toContain(childId);
    });

    it("should throw when patientId is missing", async () => {
      await expect(historyGraphService.deleteNode(null, "node-001")).rejects.toThrow(
        "patientId is required",
      );
    });
  });

  describe("Edge Management", () => {
    it("should create an edge when parentNodeId is provided", async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ encounter_fhir_id: "node-001", is_diagnosis: false, is_manual_branch: false, branch_id: null }],
        })
        .mockResolvedValueOnce({ rows: [{ encounter_fhir_id: "node-002" }] })
        .mockResolvedValueOnce({ rows: [{ encounter_fhir_id: "node-001" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await historyGraphService.addNode(
        "patient-001",
        "eoc-001",
        { title: "Follow-up", category: "Consultation" },
        "node-001",
      );

      expect(result.father).toBe("node-001");
    });

    it("should throw when parentNodeId does not exist", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        historyGraphService.addNode(
          "patient-001",
          "eoc-001",
          { title: "Orphan", category: "Consultation" },
          "nonexistent-parent",
        ),
      ).rejects.toThrow("does not exist in the database");
    });

    it("should inherit branchId from a non-branch-starter parent", async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ encounter_fhir_id: "parent-node", is_diagnosis: false, is_manual_branch: false, branch_id: "branch-root-001" }],
        })
        .mockResolvedValueOnce({ rows: [{ encounter_fhir_id: "new-child" }] })
        .mockResolvedValueOnce({ rows: [{ encounter_fhir_id: "parent-node" }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await historyGraphService.addNode(
        "patient-001",
        "eoc-001",
        { title: "Child Node", category: "Lab" },
        "parent-node",
      );

      expect(result.branchId).toBe("branch-root-001");
    });
  });

  describe("FHIR Integration", () => {
    it("should call FHIR API when creating any node", async () => {
      await historyGraphService.addNode("patient-001", "eoc-001", {
        title: "Chest X-Ray",
        category: "Imaging",
      });

      expect(mockFhirApi.put).toHaveBeenCalled();
      const [url] = mockFhirApi.put.mock.calls[0];
      expect(url).toMatch(/^\/ImagingStudy\//);
    });

    it("should throw a FHIR error when the FHIR server is unavailable", async () => {
      mockFhirApi.put.mockRejectedValue(
        new Error("connect ECONNREFUSED"),
      );

      await expect(
        historyGraphService.addNode("patient-001", "eoc-001", {
          title: "Test",
          category: "Consultation",
        }),
      ).rejects.toThrow("Failed to create FHIR resource");
    });
  });

  describe("Episode of Care Integration", () => {
    it("should use the explicitly provided eocId", async () => {
      const result = await historyGraphService.addNode("patient-001", "eoc-explicit-001", {
        title: "Consultation",
        category: "Consultation",
      });

      expect(result.eocId).toBe("eoc-explicit-001");
      expect(eocService.createEpisodeOfCareWithSpecificId).not.toHaveBeenCalled();
    });

    it("should create a new EOC when eocId is null and none exists for patient", async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      eocService.createEpisodeOfCareWithSpecificId = jest.fn().mockResolvedValue({
        id: "eoc-brand-new",
        status: "active",
      });

      await historyGraphService.addNode("patient-001", null, {
        title: "First Ever Visit",
        category: "Consultation",
      });

      expect(eocService.createEpisodeOfCareWithSpecificId).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      );
    });
  });

  describe("Cache Management", () => {
    it("should call setInCache after retrieving graph data", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] });

      await historyGraphService.getGraphForPatient("patient-001");

      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        expect.stringContaining("historyGraph:patient:patient-001"),
        expect.any(Object),
        60,
      );
    });

    it("should invalidate cache after addNode", async () => {
      await historyGraphService.addNode("patient-001", "eoc-001", {
        title: "Test",
        category: "Consultation",
      });

      expect(cacheHelper.invalidatePatientCache).toHaveBeenCalledWith("patient-001");
    });

    it("should invalidate cache after deleteNode", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ encounter_fhir_id: "node-001", category: "Consultation", event_date: new Date(), related_resource_ids: {} }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await historyGraphService.deleteNode("patient-001", "node-001");

      expect(cacheHelper.invalidatePatientCache).toHaveBeenCalledWith("patient-001");
    });
  });

  describe("Data Validation", () => {
    it("should accept all valid node categories without throwing", () => {
      const validCategories = [
        "Consultation", "Lab", "Imaging", "Prescription",
        "AISuggestion", "FollowUp", "Allergy", "Historical", "Linker",
      ];

      for (const category of validCategories) {
        expect(() =>
          historyGraphService.validateNodeData({ title: "Test", category }),
        ).not.toThrow();
      }
    });

    it("should throw with statusCode 400 when category is missing", () => {
      expect(() =>
        historyGraphService.validateNodeData({ title: "Test" }),
      ).toThrow();

      let caught;
      try {
        historyGraphService.validateNodeData({ title: "Test" });
      } catch (err) {
        caught = err;
      }
      expect(caught.statusCode).toBe(400);
      expect(caught.errors.category).toBeDefined();
    });

    it("should throw with statusCode 400 when both title and text_1 are absent", () => {
      let caught;
      try {
        historyGraphService.validateNodeData({ category: "Consultation" });
      } catch (err) {
        caught = err;
      }
      expect(caught.statusCode).toBe(400);
      expect(caught.errors.title).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should throw patientId is required when patientId is null", async () => {
      await expect(
        historyGraphService.addNode(null, "eoc-001", { title: "Test", category: "Consultation" }),
      ).rejects.toThrow("patientId is required");
    });

    it("should throw a friendly error on query timeout in getGraphForPatient", async () => {
      mockClient.query.mockRejectedValueOnce(new Error("Query timeout exceeded"));

      await expect(
        historyGraphService.getGraphForPatient("patient-001"),
      ).rejects.toThrow("Could not fetch history graph for patient.");
    });

    it("should throw FHIR failure message when fhirApi.put rejects", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("FHIR 500"));

      await expect(
        historyGraphService.addNode("patient-001", "eoc-001", {
          title: "Test",
          category: "Consultation",
        }),
      ).rejects.toThrow("Failed to create FHIR resource");
    });
  });

  describe("Sample Data Creation", () => {
    it("should resolve without throwing for valid seed nodes", async () => {
      eocService.createEpisodeOfCareWithSpecificId = jest.fn().mockResolvedValue({
        id: "eoc-seed-001",
        status: "active",
      });

      const nodes = [
        { id: "n1", title: "Initial Consultation", category: "Consultation", father: null },
        { id: "n2", title: "Blood Test", category: "Lab", father: 0 },
      ];

      await expect(
        historyGraphService.seedSampleData("patient-test-001", nodes),
      ).resolves.not.toThrow();
    });
  });
});

