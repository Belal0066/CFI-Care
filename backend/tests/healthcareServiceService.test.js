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

describe("healthcareServiceService", () => {
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

    service = require("../src/Nodejs/healthcareService/healthcareServiceService");
  });

  // ─── getAllHealthcareServices ──────────────────────────────────────────────

  describe("getAllHealthcareServices", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllHealthcareServices();

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllHealthcareServices();

      expect(mockFhirApi.get).toHaveBeenCalledWith("/HealthcareService");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("healthcareServices:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllHealthcareServices()).rejects.toThrow(
        "Could not fetch healthcare services.",
      );
    });
  });

  // ─── getHealthcareServicesByOrganization ──────────────────────────────────

  describe("getHealthcareServicesByOrganization", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getHealthcareServicesByOrganization("org-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getHealthcareServicesByOrganization("org-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/HealthcareService?organization=Organization/org-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "healthcareServices:organization:org-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getHealthcareServicesByOrganization("org-001"),
      ).rejects.toThrow("Could not fetch healthcare services for organization.");
    });
  });

  // ─── getHealthcareServiceById ──────────────────────────────────────────────

  describe("getHealthcareServiceById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "hs-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getHealthcareServiceById("hs-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "hs-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getHealthcareServiceById("hs-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/HealthcareService/hs-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("healthcareService:hs-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'HealthcareService not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getHealthcareServiceById("hs-001")).rejects.toThrow(
        "HealthcareService not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getHealthcareServiceById("hs-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createHealthcareServiceWithSpecificId ────────────────────────────────

  describe("createHealthcareServiceWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createHealthcareServiceWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "hs-001", resourceType: "HealthcareService" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createHealthcareServiceWithSpecificId({ id: "hs-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/HealthcareService/hs-001",
        expect.objectContaining({ resourceType: "HealthcareService", id: "hs-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates healthcareService and all caches", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createHealthcareServiceWithSpecificId({ id: "hs-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("healthcareService:hs-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("healthcareServices:all");
    });

    it("invalidates organization cache when providedBy reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createHealthcareServiceWithSpecificId({
        id: "hs-001",
        providedBy: { reference: "Organization/org-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "healthcareServices:organization:org-001",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createHealthcareServiceWithSpecificId({ id: "hs-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createHealthcareServiceWithSpecificId({ id: "hs-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateHealthcareService ──────────────────────────────────────────────

  describe("updateHealthcareService", () => {
    it("throws when healthcareServiceId is missing", async () => {
      await expect(service.updateHealthcareService(null, {})).rejects.toThrow(
        "HealthcareService ID is required",
      );
    });

    it("throws when existing healthcare service is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateHealthcareService("hs-001", {})).rejects.toThrow(
        "HealthcareService hs-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "hs-001", active: true };
      const updated = { id: "hs-001", active: false };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateHealthcareService("hs-001", { active: false });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/HealthcareService/hs-001",
        expect.objectContaining({ resourceType: "HealthcareService", id: "hs-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates caches after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "hs-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateHealthcareService("hs-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("healthcareService:hs-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("healthcareServices:all");
    });
  });

  // ─── deleteHealthcareService ──────────────────────────────────────────────

  describe("deleteHealthcareService", () => {
    it("throws when healthcareServiceId is missing", async () => {
      await expect(service.deleteHealthcareService(null)).rejects.toThrow(
        "HealthcareService ID is required",
      );
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteHealthcareService("hs-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/HealthcareService/hs-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("healthcareService:hs-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("healthcareServices:all");
      expect(result).toEqual({
        success: true,
        message: "HealthcareService deleted successfully",
      });
    });

    it("throws 'HealthcareService not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteHealthcareService("hs-001")).rejects.toThrow(
        "HealthcareService not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteHealthcareService("hs-001")).rejects.toThrow(
        "Could not delete healthcare service.",
      );
    });
  });
});
