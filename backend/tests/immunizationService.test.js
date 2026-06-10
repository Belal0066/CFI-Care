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

describe("immunizationService", () => {
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

    service = require("../src/Nodejs/immunization/immunizationService");
  });

  // ─── getAllImmunizations ───────────────────────────────────────────────────

  describe("getAllImmunizations", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllImmunizations();

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllImmunizations();

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Immunization");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("immunizations:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllImmunizations()).rejects.toThrow(
        "Could not fetch immunizations.",
      );
    });
  });

  // ─── getImmunizationsByPatient ─────────────────────────────────────────────

  describe("getImmunizationsByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getImmunizationsByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getImmunizationsByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Immunization?patient=Patient/p-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "immunizations:patient:p-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getImmunizationsByPatient("p-001")).rejects.toThrow(
        "Could not fetch immunizations for patient.",
      );
    });
  });

  // ─── getImmunizationById ───────────────────────────────────────────────────

  describe("getImmunizationById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "imm-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getImmunizationById("imm-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "imm-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getImmunizationById("imm-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Immunization/imm-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("immunization:imm-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Immunization not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getImmunizationById("imm-001")).rejects.toThrow(
        "Immunization not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getImmunizationById("imm-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createImmunizationWithSpecificId ─────────────────────────────────────

  describe("createImmunizationWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createImmunizationWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "imm-001", resourceType: "Immunization" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createImmunizationWithSpecificId({ id: "imm-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Immunization/imm-001",
        expect.objectContaining({ resourceType: "Immunization", id: "imm-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates immunization and all caches", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createImmunizationWithSpecificId({ id: "imm-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunization:imm-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunizations:all");
    });

    it("invalidates patient cache when patient reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createImmunizationWithSpecificId({
        id: "imm-001",
        patient: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunizations:patient:p-001");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createImmunizationWithSpecificId({ id: "imm-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createImmunizationWithSpecificId({ id: "imm-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateImmunization ────────────────────────────────────────────────────

  describe("updateImmunization", () => {
    it("throws when immunizationId is missing", async () => {
      await expect(service.updateImmunization(null, {})).rejects.toThrow(
        "Immunization ID is required",
      );
    });

    it("throws when existing immunization is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateImmunization("imm-001", {})).rejects.toThrow(
        "Immunization imm-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "imm-001", status: "completed" };
      const updated = { id: "imm-001", status: "entered-in-error" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateImmunization("imm-001", { status: "entered-in-error" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Immunization/imm-001",
        expect.objectContaining({ resourceType: "Immunization", id: "imm-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates caches after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "imm-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateImmunization("imm-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunization:imm-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunizations:all");
    });
  });

  // ─── deleteImmunization ────────────────────────────────────────────────────

  describe("deleteImmunization", () => {
    it("throws when immunizationId is missing", async () => {
      await expect(service.deleteImmunization(null)).rejects.toThrow(
        "Immunization ID is required",
      );
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteImmunization("imm-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Immunization/imm-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunization:imm-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("immunizations:all");
      expect(result).toEqual({ success: true, message: "Immunization deleted successfully" });
    });

    it("throws 'Immunization not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteImmunization("imm-001")).rejects.toThrow(
        "Immunization not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteImmunization("imm-001")).rejects.toThrow(
        "Could not delete immunization.",
      );
    });
  });
});
