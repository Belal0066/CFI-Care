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

describe("allergyIntoleranceService", () => {
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

    service = require("../src/Nodejs/allergyIntolerance/allergyIntoleranceService");
  });

  // ─── getAllergiesByPatient ─────────────────────────────────────────────────

  describe("getAllergiesByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle", entry: [] };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllergiesByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and stores result", async () => {
      const bundle = { resourceType: "Bundle", entry: [{ resource: {} }] };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllergiesByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/AllergyIntolerance?patient=Patient/p-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "allergies:patient:p-001",
        bundle,
        60,
      );
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllergiesByPatient("p-001")).rejects.toThrow(
        "Could not fetch patient allergies.",
      );
    });
  });

  // ─── getAllergyById ────────────────────────────────────────────────────────

  describe("getAllergyById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "AllergyIntolerance", id: "a-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllergyById("a-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { resourceType: "AllergyIntolerance", id: "a-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getAllergyById("a-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/AllergyIntolerance/a-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("allergy:a-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'AllergyIntolerance not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getAllergyById("a-001")).rejects.toThrow(
        "AllergyIntolerance not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllergyById("a-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createAllergyWithSpecificId ──────────────────────────────────────────

  describe("createAllergyWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createAllergyWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "a-001", resourceType: "AllergyIntolerance" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createAllergyWithSpecificId({ id: "a-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/AllergyIntolerance/a-001",
        expect.objectContaining({ resourceType: "AllergyIntolerance", id: "a-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates allergy and patient caches on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createAllergyWithSpecificId({
        id: "a-001",
        patient: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("allergy:a-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("allergies:patient:p-001");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: {
            status: 422,
            data: { issue: [{ diagnostics: "bad code" }] },
          },
        }),
      );

      await expect(
        service.createAllergyWithSpecificId({ id: "a-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createAllergyWithSpecificId({ id: "a-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateAllergy ────────────────────────────────────────────────────────

  describe("updateAllergy", () => {
    it("throws when allergyId is missing", async () => {
      await expect(service.updateAllergy(null, {})).rejects.toThrow(
        "AllergyIntolerance ID is required",
      );
    });

    it("throws when existing allergy is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateAllergy("a-001", {})).rejects.toThrow(
        "AllergyIntolerance a-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { resourceType: "AllergyIntolerance", id: "a-001", status: "active" };
      const updated = { resourceType: "AllergyIntolerance", id: "a-001", status: "inactive" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateAllergy("a-001", { status: "inactive" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/AllergyIntolerance/a-001",
        expect.objectContaining({ resourceType: "AllergyIntolerance", id: "a-001", status: "inactive" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "a-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateAllergy("a-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("allergy:a-001");
    });

    it("throws FHIR validation error on 422", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "a-001" } });
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "validation failed" }] } },
        }),
      );

      await expect(service.updateAllergy("a-001", {})).rejects.toThrow(
        "FHIR Validation Failed: validation failed",
      );
    });
  });

  // ─── deleteAllergy ────────────────────────────────────────────────────────

  describe("deleteAllergy", () => {
    it("throws when allergyId is missing", async () => {
      await expect(service.deleteAllergy(null)).rejects.toThrow(
        "AllergyIntolerance ID is required",
      );
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteAllergy("a-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/AllergyIntolerance/a-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("allergy:a-001");
      expect(result).toEqual({ success: true, message: "AllergyIntolerance deleted successfully" });
    });

    it("throws 'AllergyIntolerance not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteAllergy("a-001")).rejects.toThrow(
        "AllergyIntolerance not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteAllergy("a-001")).rejects.toThrow(
        "Could not delete allergy.",
      );
    });
  });
});
