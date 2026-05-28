jest.mock("axios", () => {
  const mockInstance = {
    get: jest.fn(),
    put: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});

jest.mock("../../middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn().mockResolvedValue(undefined),
  deleteFromCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { DEFAULT: 60 },
}));

describe("relatedPersonService", () => {
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

    service = require("../relatedPersonService");
  });

  // ─── getAllRelatedPersons ──────────────────────────────────────────────────

  describe("getAllRelatedPersons", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllRelatedPersons();

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllRelatedPersons();

      expect(mockFhirApi.get).toHaveBeenCalledWith("/RelatedPerson");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("relatedPersons:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllRelatedPersons()).rejects.toThrow(
        "Could not fetch related persons.",
      );
    });
  });

  // ─── getRelatedPersonsByPatient ────────────────────────────────────────────

  describe("getRelatedPersonsByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getRelatedPersonsByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getRelatedPersonsByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/RelatedPerson?patient=Patient/p-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "relatedPersons:patient:p-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getRelatedPersonsByPatient("p-001")).rejects.toThrow(
        "Could not fetch related persons for patient.",
      );
    });
  });

  // ─── getRelatedPersonById ─────────────────────────────────────────────────

  describe("getRelatedPersonById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "rp-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getRelatedPersonById("rp-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "rp-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getRelatedPersonById("rp-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/RelatedPerson/rp-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("relatedPerson:rp-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'RelatedPerson not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getRelatedPersonById("rp-001")).rejects.toThrow(
        "RelatedPerson not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getRelatedPersonById("rp-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createRelatedPersonWithSpecificId ────────────────────────────────────

  describe("createRelatedPersonWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createRelatedPersonWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "rp-001", resourceType: "RelatedPerson" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createRelatedPersonWithSpecificId({ id: "rp-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/RelatedPerson/rp-001",
        expect.objectContaining({ resourceType: "RelatedPerson", id: "rp-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates relatedPerson and all caches", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createRelatedPersonWithSpecificId({ id: "rp-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPerson:rp-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPersons:all");
    });

    it("invalidates patient cache when patient reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createRelatedPersonWithSpecificId({
        id: "rp-001",
        patient: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPersons:patient:p-001");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createRelatedPersonWithSpecificId({ id: "rp-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createRelatedPersonWithSpecificId({ id: "rp-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateRelatedPerson ──────────────────────────────────────────────────

  describe("updateRelatedPerson", () => {
    it("throws when relatedPersonId is missing", async () => {
      await expect(service.updateRelatedPerson(null, {})).rejects.toThrow(
        "RelatedPerson ID is required",
      );
    });

    it("throws when existing related person is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateRelatedPerson("rp-001", {})).rejects.toThrow(
        "RelatedPerson rp-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "rp-001", active: true };
      const updated = { id: "rp-001", active: false };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateRelatedPerson("rp-001", { active: false });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/RelatedPerson/rp-001",
        expect.objectContaining({ resourceType: "RelatedPerson", id: "rp-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates caches after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "rp-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateRelatedPerson("rp-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPerson:rp-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPersons:all");
    });
  });

  // ─── deleteRelatedPerson ──────────────────────────────────────────────────

  describe("deleteRelatedPerson", () => {
    it("throws when relatedPersonId is missing", async () => {
      await expect(service.deleteRelatedPerson(null)).rejects.toThrow(
        "RelatedPerson ID is required",
      );
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteRelatedPerson("rp-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/RelatedPerson/rp-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPerson:rp-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("relatedPersons:all");
      expect(result).toEqual({ success: true, message: "RelatedPerson deleted successfully" });
    });

    it("throws 'RelatedPerson not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteRelatedPerson("rp-001")).rejects.toThrow(
        "RelatedPerson not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteRelatedPerson("rp-001")).rejects.toThrow(
        "Could not delete related person.",
      );
    });
  });
});
