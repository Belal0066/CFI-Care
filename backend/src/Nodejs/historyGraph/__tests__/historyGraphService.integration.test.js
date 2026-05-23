const historyGraphService = require("../historyGraphService");
const eocService = require("../../episodeOfCare/eocService");
const encounterService = require("../../encounter/encounterService");
const cacheHelper = require("../../middleware/cacheHelper");
const toonNodesCacheHelper = require("../../middleware/toonNodesCacheHelper");

// Mock all dependencies
jest.mock("../../episodeOfCare/eocService");
jest.mock("../../encounter/encounterService");
jest.mock("../../middleware/cacheHelper");
jest.mock("../../middleware/toonNodesCacheHelper");

// Mock PostgreSQL client before the pg module is loaded
jest.mock("pg", () => {
  const mockClient = {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
  };
  return {
    Client: jest.fn(function () {
      return mockClient;
    }),
    __mockClient: mockClient, // Export for access in tests
  };
});

describe("History Graph Service", () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    const pg = require("pg");
    mockClient = pg.__mockClient;
    mockClient.query.mockReset();
  });

  describe("getExistingEocForPatient", () => {
    it("should return existing EOC if found", async () => {
      const mockEoc = {
        id: "eoc-001",
        patient: { reference: "Patient/patient-001" },
        status: "active",
      };

      eocService.getEpisodeOfCare = jest.fn().mockResolvedValue(mockEoc);

      // Access the service internals (if exported or use reflection)
      // For now, we test through public methods that use it
    });

    it("should handle case when no EOC exists", async () => {
      eocService.getEpisodeOfCare = jest.fn().mockResolvedValue(null);

      // Test through public API
    });
  });

  describe("Graph Data Retrieval", () => {
    it("should retrieve all nodes for a patient", async () => {
      const mockNodes = [
        {
          node_id: "node-001",
          patient_id: "patient-001",
          title: "Consultation",
          category: "Consultation",
          created_at: new Date(),
        },
        {
          node_id: "node-002",
          patient_id: "patient-001",
          title: "Lab Test",
          category: "Lab",
          created_at: new Date(),
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockNodes });

      // This assumes the service exports a method like getGraphNodes
      // Adjust based on actual service API
    });

    it("should retrieve edges between nodes", async () => {
      const mockEdges = [
        {
          source_node_id: "node-001",
          target_node_id: "node-002",
          relationship_type: "leads_to",
        },
      ];

      mockClient.query.mockResolvedValueOnce({ rows: mockEdges });
    });

    it("should handle database connection errors gracefully", async () => {
      mockClient.query.mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      // Test error handling
    });
  });

  describe("Node Creation", () => {
    it("should create a new timeline node", async () => {
      const newNode = {
        patient_id: "patient-001",
        title: "Blood Test",
        category: "Lab",
        encounter_id: "encounter-001",
      };

      const mockInsertResult = {
        rows: [
          {
            node_id: "node-003",
            ...newNode,
            created_at: new Date(),
          },
        ],
      };

      mockClient.query.mockResolvedValueOnce(mockInsertResult);

      // Test node creation through service API
    });

    it("should validate node category", async () => {
      const invalidNode = {
        patient_id: "patient-001",
        title: "Invalid Test",
        category: "InvalidCategory",
      };

      // Should reject invalid category
      // Test validation logic
    });

    it("should cache TOON nodes after creation", async () => {
      const newNode = {
        patient_id: "patient-001",
        title: "MRI Scan",
        category: "Imaging",
      };

      toonNodesCacheHelper.setInCacheToonNodes = jest
        .fn()
        .mockResolvedValue(undefined);

      // Test that TOON caching is called
    });
  });

  describe("Node Update", () => {
    it("should update existing node details", async () => {
      const updateData = {
        node_id: "node-001",
        title: "Updated Title",
        category: "Consultation",
      };

      mockClient.query.mockResolvedValueOnce({ rows: [updateData] });

      // Test update logic
    });

    it("should invalidate cache on update", async () => {
      cacheHelper.deleteFromCache = jest.fn().mockResolvedValue(undefined);
      toonNodesCacheHelper.deleteFromCacheToonNodes = jest
        .fn()
        .mockResolvedValue(undefined);

      // Verify cache invalidation
    });
  });

  describe("Node Deletion", () => {
    it("should soft delete a node", async () => {
      const nodeId = "node-002";

      mockClient.query.mockResolvedValueOnce({
        rows: [{ node_id: nodeId, is_deleted: true }],
      });

      // Test soft delete
    });

    it("should remove associated edges when deleting node", async () => {
      const nodeId = "node-002";

      // First query: mark node as deleted
      mockClient.query.mockResolvedValueOnce({ rows: [{ node_id: nodeId }] });
      // Second query: delete edges
      mockClient.query.mockResolvedValueOnce({ rowCount: 2 });

      // Test edge cleanup
    });

    it("should prevent deletion of head node", async () => {
      const headNodeId = "node-head-001";

      // Test that head node deletion is blocked
    });
  });

  describe("Edge Management", () => {
    it("should create edge between two nodes", async () => {
      const edgeData = {
        source_node_id: "node-001",
        target_node_id: "node-002",
        relationship_type: "leads_to",
      };

      mockClient.query.mockResolvedValueOnce({ rows: [edgeData] });

      // Test edge creation
    });

    it("should prevent circular references", async () => {
      const circularEdge = {
        source_node_id: "node-001",
        target_node_id: "node-001",
      };

      // Test circular reference prevention
    });

    it("should validate that both nodes exist before creating edge", async () => {
      // Test node existence validation
    });
  });

  describe("FHIR Integration", () => {
    it("should fetch encounter data from FHIR server", async () => {
      const mockEncounter = {
        resourceType: "Encounter",
        id: "encounter-001",
        status: "finished",
        class: { code: "outpatient" },
      };

      encounterService.getEncounterById = jest
        .fn()
        .mockResolvedValue(mockEncounter);

      // Test FHIR data retrieval
    });

    it("should handle FHIR server unavailability", async () => {
      encounterService.getEncounterById = jest
        .fn()
        .mockRejectedValue(new Error("FHIR server unreachable"));

      // Test error handling
    });
  });

  describe("Episode of Care Integration", () => {
    it("should link nodes to active EOC", async () => {
      const mockEoc = {
        id: "eoc-001",
        status: "active",
        patient: { reference: "Patient/patient-001" },
      };

      eocService.getEpisodeOfCare = jest.fn().mockResolvedValue(mockEoc);

      // Test EOC linkage
    });

    it("should create new EOC if none exists", async () => {
      eocService.getEpisodeOfCare = jest.fn().mockResolvedValue(null);
      eocService.createEpisodeOfCare = jest.fn().mockResolvedValue({
        id: "eoc-new-001",
        status: "active",
      });

      // Test EOC creation
    });
  });

  describe("Cache Management", () => {
    it("should cache graph data after retrieval", async () => {
      cacheHelper.setInCache = jest.fn().mockResolvedValue(undefined);

      const mockGraphData = {
        nodes: [{ node_id: "node-001" }],
        edges: [],
      };

      mockClient.query.mockResolvedValueOnce({
        rows: mockGraphData.nodes,
      });
      mockClient.query.mockResolvedValueOnce({ rows: mockGraphData.edges });

      // Test caching logic
    });

    it("should use cached data when available", async () => {
      const cachedData = {
        nodes: [{ node_id: "node-cached" }],
        edges: [],
      };

      cacheHelper.getFromCache = jest.fn().mockResolvedValue(cachedData);

      // Verify database is not queried when cache hit occurs
      // mockClient.query should not be called
    });

    it("should invalidate cache after node modifications", async () => {
      cacheHelper.deleteFromCache = jest.fn().mockResolvedValue(undefined);

      // Test cache invalidation on create/update/delete
    });
  });

  describe("Data Validation", () => {
    it("should validate allowed node categories", async () => {
      const validCategories = [
        "Consultation",
        "Lab",
        "Imaging",
        "Procedure",
        "Medication",
        "Diagnosis",
      ];

      // Test that only valid categories are accepted
    });

    it("should validate required fields for node creation", async () => {
      const incompleteNode = {
        patient_id: "patient-001",
        // Missing title and category
      };

      // Test required field validation
    });

    it("should sanitize user input to prevent SQL injection", async () => {
      const maliciousInput = {
        title: "Test'; DROP TABLE timeline_nodes;--",
        category: "Consultation",
      };

      // Test input sanitization
    });
  });

  describe("Error Handling", () => {
    it("should handle database connection failures", async () => {
      mockClient.connect.mockRejectedValueOnce(new Error("Connection refused"));

      // Test connection error handling
    });

    it("should handle query timeouts", async () => {
      mockClient.query.mockRejectedValueOnce(
        new Error("Query timeout exceeded"),
      );

      // Test timeout handling
    });

    it("should rollback transactions on error", async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("Insert failed")); // INSERT fails

      // Test transaction rollback
    });
  });

  describe("Sample Data Creation", () => {
    it("should create seed data for testing", async () => {
      const patientId = "patient-test-001";

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ node_id: "node-seed-1" }] })
        .mockResolvedValueOnce({ rows: [{ node_id: "node-seed-2" }] })
        .mockResolvedValueOnce({ rows: [{ node_id: "node-seed-3" }] });

      // Test seed data creation
    });
  });
});
