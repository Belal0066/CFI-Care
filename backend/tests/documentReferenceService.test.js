jest.mock("axios", () => {
  const mockInstance = {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});

jest.mock("../src/Nodejs/middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn().mockResolvedValue(undefined),
  deleteFromCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { DEFAULT: 60 },
}));

describe("documentReferenceService", () => {
  let service;
  let mockFhirApi;
  let cacheHelper;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFhirApi = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockFhirApi);

    cacheHelper = require("../src/Nodejs/middleware/cacheHelper");
    cacheHelper.getFromCache.mockResolvedValue(null);
    cacheHelper.setInCache.mockResolvedValue(undefined);
    cacheHelper.deleteFromCache.mockResolvedValue(undefined);

    service = require("../src/Nodejs/documentReference/documentReferenceService");
  });

  // ─── getDocumentReferencesByPatient ────────────────────────────────────────

  describe("getDocumentReferencesByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getDocumentReferencesByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches with cache key including 'all' for type and category when none provided", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getDocumentReferencesByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/DocumentReference?patient=Patient/p-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "documentReferences:patient:p-001:type:all:category:all",
        bundle,
        60,
      );
    });

    it("fetches with type and category params when provided", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getDocumentReferencesByPatient("p-001", "discharge-summary", "clinical-note");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/DocumentReference?patient=Patient/p-001&type=discharge-summary&category=clinical-note",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "documentReferences:patient:p-001:type:discharge-summary:category:clinical-note",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getDocumentReferencesByPatient("p-001")).rejects.toThrow(
        "Could not fetch patient document references.",
      );
    });
  });

  // ─── getDocumentReferenceById ──────────────────────────────────────────────

  describe("getDocumentReferenceById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "docref-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getDocumentReferenceById("docref-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "docref-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getDocumentReferenceById("docref-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/DocumentReference/docref-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "documentReference:docref-001",
        data,
        60,
      );
      expect(result).toBe(data);
    });

    it("throws 'DocumentReference not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getDocumentReferenceById("docref-001")).rejects.toThrow(
        "DocumentReference not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getDocumentReferenceById("docref-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createDocumentReferenceWithSpecificId ────────────────────────────────

  describe("createDocumentReferenceWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createDocumentReferenceWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "docref-001", resourceType: "DocumentReference" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createDocumentReferenceWithSpecificId({ id: "docref-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/DocumentReference/docref-001",
        expect.objectContaining({ resourceType: "DocumentReference", id: "docref-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates documentReference cache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDocumentReferenceWithSpecificId({ id: "docref-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("documentReference:docref-001");
    });

    it("invalidates patient cache when subject reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDocumentReferenceWithSpecificId({
        id: "docref-001",
        subject: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "documentReferences:patient:p-001:type:all:category:all",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createDocumentReferenceWithSpecificId({ id: "docref-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createDocumentReferenceWithSpecificId({ id: "docref-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateDocumentReference ──────────────────────────────────────────────

  describe("updateDocumentReference", () => {
    it("throws when documentReferenceId is missing", async () => {
      await expect(service.updateDocumentReference(null, {})).rejects.toThrow(
        "DocumentReference ID is required",
      );
    });

    it("throws when existing document reference is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateDocumentReference("docref-001", {})).rejects.toThrow(
        "DocumentReference docref-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "docref-001", status: "current" };
      const updated = { id: "docref-001", status: "superseded" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateDocumentReference("docref-001", { status: "superseded" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/DocumentReference/docref-001",
        expect.objectContaining({ resourceType: "DocumentReference", id: "docref-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "docref-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateDocumentReference("docref-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("documentReference:docref-001");
    });
  });

  // ─── deleteDocumentReference ──────────────────────────────────────────────

  describe("deleteDocumentReference", () => {
    it("throws when documentReferenceId is missing", async () => {
      await expect(service.deleteDocumentReference(null)).rejects.toThrow(
        "DocumentReference ID is required",
      );
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteDocumentReference("docref-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/DocumentReference/docref-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("documentReference:docref-001");
      expect(result).toEqual({
        success: true,
        message: "DocumentReference deleted successfully",
      });
    });

    it("throws 'DocumentReference not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteDocumentReference("docref-001")).rejects.toThrow(
        "DocumentReference not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteDocumentReference("docref-001")).rejects.toThrow(
        "Could not delete document reference.",
      );
    });
  });
});
