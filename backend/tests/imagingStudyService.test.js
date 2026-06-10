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

describe("imagingStudyService", () => {
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

    service = require("../src/Nodejs/imagingStudy/imagingStudyService");
  });

  // ─── getImagingStudiesByPatient ────────────────────────────────────────────

  describe("getImagingStudiesByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getImagingStudiesByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR with 'all' modality cache key when none provided", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getImagingStudiesByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/ImagingStudy?patient=Patient/p-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "imagingStudies:patient:p-001:modality:all",
        bundle,
        60,
      );
    });

    it("fetches from FHIR with modality param when provided", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getImagingStudiesByPatient("p-001", "CT");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/ImagingStudy?patient=Patient/p-001&modality=CT");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "imagingStudies:patient:p-001:modality:CT",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getImagingStudiesByPatient("p-001")).rejects.toThrow(
        "Could not fetch patient imaging studies.",
      );
    });
  });

  // ─── getImagingStudyById ───────────────────────────────────────────────────

  describe("getImagingStudyById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "img-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getImagingStudyById("img-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "img-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getImagingStudyById("img-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/ImagingStudy/img-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("imagingStudy:img-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'ImagingStudy not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getImagingStudyById("img-001")).rejects.toThrow(
        "ImagingStudy not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getImagingStudyById("img-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createImagingStudyWithSpecificId ─────────────────────────────────────

  describe("createImagingStudyWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createImagingStudyWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "img-001", resourceType: "ImagingStudy" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createImagingStudyWithSpecificId({ id: "img-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/ImagingStudy/img-001",
        expect.objectContaining({ resourceType: "ImagingStudy", id: "img-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates imagingStudy cache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createImagingStudyWithSpecificId({ id: "img-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("imagingStudy:img-001");
    });

    it("invalidates patient modality caches when subject reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createImagingStudyWithSpecificId({
        id: "img-001",
        subject: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "imagingStudies:patient:p-001:modality:all",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createImagingStudyWithSpecificId({ id: "img-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createImagingStudyWithSpecificId({ id: "img-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateImagingStudy ────────────────────────────────────────────────────

  describe("updateImagingStudy", () => {
    it("throws when imagingStudyId is missing", async () => {
      await expect(service.updateImagingStudy(null, {})).rejects.toThrow(
        "ImagingStudy ID is required",
      );
    });

    it("throws when existing imaging study is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateImagingStudy("img-001", {})).rejects.toThrow(
        "ImagingStudy img-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "img-001", status: "registered" };
      const updated = { id: "img-001", status: "available" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateImagingStudy("img-001", { status: "available" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/ImagingStudy/img-001",
        expect.objectContaining({ resourceType: "ImagingStudy", id: "img-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "img-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateImagingStudy("img-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("imagingStudy:img-001");
    });
  });

  // ─── deleteImagingStudy ────────────────────────────────────────────────────

  describe("deleteImagingStudy", () => {
    it("throws when imagingStudyId is missing", async () => {
      await expect(service.deleteImagingStudy(null)).rejects.toThrow(
        "ImagingStudy ID is required",
      );
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteImagingStudy("img-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/ImagingStudy/img-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("imagingStudy:img-001");
      expect(result).toEqual({ success: true, message: "ImagingStudy deleted successfully" });
    });

    it("throws 'ImagingStudy not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteImagingStudy("img-001")).rejects.toThrow(
        "ImagingStudy not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteImagingStudy("img-001")).rejects.toThrow(
        "Could not delete imaging study.",
      );
    });
  });
});
