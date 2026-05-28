jest.mock("axios", () => {
  const mockInstance = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});

jest.mock("../../middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn().mockResolvedValue(undefined),
  deleteFromCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { MEDICATION_REQUEST: 60 },
}));

describe("medicationRequestService", () => {
  let service;
  let mockFhirApi;
  let cacheHelper;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFhirApi = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockFhirApi);

    cacheHelper = require("../../middleware/cacheHelper");
    cacheHelper.getFromCache.mockResolvedValue(null);
    cacheHelper.setInCache.mockResolvedValue(undefined);
    cacheHelper.deleteFromCache.mockResolvedValue(undefined);

    service = require("../medicationRequestService");
  });

  // ─── getMedicationRequestById ──────────────────────────────────────────────

  describe("getMedicationRequestById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "mr-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getMedicationRequestById("mr-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "mr-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getMedicationRequestById("mr-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/MedicationRequest/mr-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("medicationRequest:mr-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'MedicationRequest not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getMedicationRequestById("mr-001")).rejects.toThrow(
        "MedicationRequest not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getMedicationRequestById("mr-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── getMedicationRequestsByPatientId ─────────────────────────────────────

  describe("getMedicationRequestsByPatientId", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getMedicationRequestsByPatientId("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches with MEDICATION_REQUEST TTL", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getMedicationRequestsByPatientId("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/MedicationRequest?subject=Patient/p-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "medicationRequests:patient:p-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getMedicationRequestsByPatientId("p-001")).rejects.toThrow(
        "Could not fetch patient medication requests.",
      );
    });
  });

  // ─── getMedicationRequestsByEncounterId ───────────────────────────────────

  describe("getMedicationRequestsByEncounterId", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getMedicationRequestsByEncounterId("enc-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getMedicationRequestsByEncounterId("enc-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/MedicationRequest?encounter=Encounter/enc-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "medicationRequests:encounter:enc-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getMedicationRequestsByEncounterId("enc-001")).rejects.toThrow(
        "Could not fetch medication requests for encounter.",
      );
    });
  });

  // ─── getMedicationRequestsByPractitionerId ────────────────────────────────

  describe("getMedicationRequestsByPractitionerId", () => {
    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getMedicationRequestsByPractitionerId("prac-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/MedicationRequest?requester=Practitioner/prac-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "medicationRequests:practitioner:prac-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getMedicationRequestsByPractitionerId("prac-001"),
      ).rejects.toThrow("Could not fetch medication requests for practitioner.");
    });
  });

  // ─── getMedicationRequestsByStatus ────────────────────────────────────────

  describe("getMedicationRequestsByStatus", () => {
    it("fetches from FHIR with patient and status params", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getMedicationRequestsByStatus("p-001", "active");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/MedicationRequest?subject=Patient/p-001&status=active",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "medicationRequests:patient:p-001:status:active",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getMedicationRequestsByStatus("p-001", "active"),
      ).rejects.toThrow("Could not fetch medication requests by status.");
    });
  });

  // ─── createMedicationRequestWithSpecificId ────────────────────────────────

  describe("createMedicationRequestWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createMedicationRequestWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "mr-001", resourceType: "MedicationRequest" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createMedicationRequestWithSpecificId({ id: "mr-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/MedicationRequest/mr-001",
        expect.objectContaining({ resourceType: "MedicationRequest", id: "mr-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates patient cache when subject reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createMedicationRequestWithSpecificId({
        id: "mr-001",
        subject: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        expect.arrayContaining(["medicationRequests:patient:p-001"]),
      );
    });

    it("invalidates encounter cache when encounter reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createMedicationRequestWithSpecificId({
        id: "mr-001",
        encounter: { reference: "Encounter/enc-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "medicationRequests:encounter:enc-001",
      );
    });

    it("invalidates practitioner cache when requester reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createMedicationRequestWithSpecificId({
        id: "mr-001",
        requester: { reference: "Practitioner/prac-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "medicationRequests:practitioner:prac-001",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createMedicationRequestWithSpecificId({ id: "mr-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createMedicationRequestWithSpecificId({ id: "mr-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateMedicationRequest ───────────────────────────────────────────────

  describe("updateMedicationRequest", () => {
    it("throws when medicationRequestId is missing", async () => {
      await expect(service.updateMedicationRequest(null, {})).rejects.toThrow(
        "MedicationRequest ID is required",
      );
    });

    it("throws 'not found in FHIR server' when existing MR cannot be fetched", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateMedicationRequest("mr-001", {})).rejects.toThrow(
        "MedicationRequest mr-001 not found in FHIR server",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "mr-001", status: "active" };
      const updated = { id: "mr-001", status: "completed" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateMedicationRequest("mr-001", { status: "completed" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/MedicationRequest/mr-001",
        expect.objectContaining({ resourceType: "MedicationRequest", id: "mr-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates patient and single-resource caches after update", async () => {
      const existing = {
        id: "mr-001",
        subject: { reference: "Patient/p-001" },
      };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateMedicationRequest("mr-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        expect.arrayContaining([
          "medicationRequests:patient:p-001",
          "medicationRequest:mr-001",
        ]),
      );
    });

    it("throws 'FHIR Update Failed' on FHIR server validation error", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "mr-001" } });
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "update fail" }] } },
        }),
      );

      await expect(service.updateMedicationRequest("mr-001", {})).rejects.toThrow(
        "FHIR Update Failed: update fail",
      );
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "mr-001" } });
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(service.updateMedicationRequest("mr-001", {})).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── deleteMedicationRequest ───────────────────────────────────────────────

  describe("deleteMedicationRequest", () => {
    it("throws when medicationRequestId is missing", async () => {
      await expect(service.deleteMedicationRequest(null)).rejects.toThrow(
        "MedicationRequest ID is required",
      );
    });

    it("deletes from FHIR and returns success", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteMedicationRequest("mr-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/MedicationRequest/mr-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("medicationRequest:mr-001");
      expect(result).toEqual({ success: true, id: "mr-001" });
    });

    it("returns alreadyDeleted:true on 404 without throwing", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      const result = await service.deleteMedicationRequest("mr-001");

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("medicationRequest:mr-001");
      expect(result).toEqual({ success: true, id: "mr-001", alreadyDeleted: true });
    });

    it("throws 'FHIR Deletion Failed' on non-404 server error with issue", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 500, data: { issue: [{ diagnostics: "delete fail" }] } },
        }),
      );

      await expect(service.deleteMedicationRequest("mr-001")).rejects.toThrow(
        "FHIR Deletion Failed: delete fail",
      );
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.delete.mockRejectedValue(new Error("network"));

      await expect(service.deleteMedicationRequest("mr-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });
});
