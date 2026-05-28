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

describe("diagnosticReportService", () => {
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

    service = require("../diagnosticReportService");
  });

  // ─── getDiagnosticReportsByPatient ─────────────────────────────────────────

  describe("getDiagnosticReportsByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getDiagnosticReportsByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR with cache key including 'all' when no category", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getDiagnosticReportsByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/DiagnosticReport?patient=Patient/p-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "diagnosticReports:patient:p-001:category:all",
        bundle,
        60,
      );
    });

    it("fetches from FHIR with category param when provided", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getDiagnosticReportsByPatient("p-001", "LAB");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/DiagnosticReport?patient=Patient/p-001&category=LAB",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "diagnosticReports:patient:p-001:category:LAB",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getDiagnosticReportsByPatient("p-001")).rejects.toThrow(
        "Could not fetch patient diagnostic reports.",
      );
    });
  });

  // ─── getDiagnosticReportById ───────────────────────────────────────────────

  describe("getDiagnosticReportById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "dr-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getDiagnosticReportById("dr-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "dr-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getDiagnosticReportById("dr-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/DiagnosticReport/dr-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("diagnosticReport:dr-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'DiagnosticReport not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getDiagnosticReportById("dr-001")).rejects.toThrow(
        "DiagnosticReport not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getDiagnosticReportById("dr-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createDiagnosticReportWithSpecificId ─────────────────────────────────

  describe("createDiagnosticReportWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createDiagnosticReportWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "dr-001", resourceType: "DiagnosticReport" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createDiagnosticReportWithSpecificId({ id: "dr-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/DiagnosticReport/dr-001",
        expect.objectContaining({ resourceType: "DiagnosticReport", id: "dr-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates diagnosticReport cache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDiagnosticReportWithSpecificId({ id: "dr-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("diagnosticReport:dr-001");
    });

    it("invalidates patient category caches when subject reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDiagnosticReportWithSpecificId({
        id: "dr-001",
        subject: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "diagnosticReports:patient:p-001:category:all",
      );
    });

    it("invalidates specific category cache when category present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDiagnosticReportWithSpecificId({
        id: "dr-001",
        subject: { reference: "Patient/p-001" },
        category: [{ coding: [{ code: "LAB" }] }],
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "diagnosticReports:patient:p-001:category:LAB",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createDiagnosticReportWithSpecificId({ id: "dr-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createDiagnosticReportWithSpecificId({ id: "dr-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateDiagnosticReport ────────────────────────────────────────────────

  describe("updateDiagnosticReport", () => {
    it("throws when diagnosticReportId is missing", async () => {
      await expect(service.updateDiagnosticReport(null, {})).rejects.toThrow(
        "DiagnosticReport ID is required",
      );
    });

    it("throws when existing diagnostic report is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateDiagnosticReport("dr-001", {})).rejects.toThrow(
        "DiagnosticReport dr-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "dr-001", status: "registered" };
      const updated = { id: "dr-001", status: "final" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateDiagnosticReport("dr-001", { status: "final" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/DiagnosticReport/dr-001",
        expect.objectContaining({ resourceType: "DiagnosticReport", id: "dr-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "dr-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateDiagnosticReport("dr-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("diagnosticReport:dr-001");
    });
  });

  // ─── deleteDiagnosticReport ────────────────────────────────────────────────

  describe("deleteDiagnosticReport", () => {
    it("throws when diagnosticReportId is missing", async () => {
      await expect(service.deleteDiagnosticReport(null)).rejects.toThrow(
        "DiagnosticReport ID is required",
      );
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteDiagnosticReport("dr-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/DiagnosticReport/dr-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("diagnosticReport:dr-001");
      expect(result).toEqual({ success: true, message: "DiagnosticReport deleted successfully" });
    });

    it("throws 'DiagnosticReport not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteDiagnosticReport("dr-001")).rejects.toThrow(
        "DiagnosticReport not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteDiagnosticReport("dr-001")).rejects.toThrow(
        "Could not delete diagnostic report.",
      );
    });
  });
});
