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

describe("observationService", () => {
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

    service = require("../observationService");
  });

  // ─── getObservationsByPatient ──────────────────────────────────────────────

  describe("getObservationsByPatient", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getObservationsByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR using bare patientId (no Patient/ prefix)", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getObservationsByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Observation?patient=p-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "observations:patient:p-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getObservationsByPatient("p-001")).rejects.toThrow(
        "Could not fetch patient observations.",
      );
    });
  });

  // ─── getObservationsByCategory ─────────────────────────────────────────────

  describe("getObservationsByCategory", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getObservationsByCategory("p-001", "vital-signs");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR with patient and category params", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getObservationsByCategory("p-001", "vital-signs");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/Observation?patient=p-001&category=vital-signs",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "observations:patient:p-001:category:vital-signs",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getObservationsByCategory("p-001", "lab"),
      ).rejects.toThrow("Could not fetch observations by category.");
    });
  });

  // ─── getObservationById ───────────────────────────────────────────────────

  describe("getObservationById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "obs-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getObservationById("obs-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "obs-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getObservationById("obs-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Observation/obs-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("observation:obs-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Observation not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getObservationById("obs-001")).rejects.toThrow(
        "Observation not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getObservationById("obs-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createObservationWithSpecificId ──────────────────────────────────────

  describe("createObservationWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createObservationWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "obs-001", resourceType: "Observation" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createObservationWithSpecificId({ id: "obs-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Observation/obs-001",
        expect.objectContaining({ resourceType: "Observation", id: "obs-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates observation cache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createObservationWithSpecificId({ id: "obs-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("observation:obs-001");
    });

    it("invalidates patient observation cache when subject reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createObservationWithSpecificId({
        id: "obs-001",
        subject: { reference: "Patient/p-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("observations:patient:p-001");
    });

    it("invalidates category cache when subject and category present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createObservationWithSpecificId({
        id: "obs-001",
        subject: { reference: "Patient/p-001" },
        category: [{ coding: [{ code: "vital-signs" }] }],
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "observations:patient:p-001:category:vital-signs",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createObservationWithSpecificId({ id: "obs-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createObservationWithSpecificId({ id: "obs-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updateObservation ────────────────────────────────────────────────────

  describe("updateObservation", () => {
    it("throws when observationId is missing", async () => {
      await expect(service.updateObservation(null, {})).rejects.toThrow(
        "Observation ID is required",
      );
    });

    it("throws when existing observation is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateObservation("obs-001", {})).rejects.toThrow(
        "Observation obs-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "obs-001", status: "registered" };
      const updated = { id: "obs-001", status: "final" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateObservation("obs-001", { status: "final" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Observation/obs-001",
        expect.objectContaining({ resourceType: "Observation", id: "obs-001", status: "final" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "obs-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateObservation("obs-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("observation:obs-001");
    });
  });

  // ─── deleteObservation ────────────────────────────────────────────────────

  describe("deleteObservation", () => {
    it("throws when observationId is missing", async () => {
      await expect(service.deleteObservation(null)).rejects.toThrow(
        "Observation ID is required",
      );
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteObservation("obs-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Observation/obs-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("observation:obs-001");
      expect(result).toEqual({ success: true, message: "Observation deleted successfully" });
    });

    it("throws 'Observation not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteObservation("obs-001")).rejects.toThrow(
        "Observation not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteObservation("obs-001")).rejects.toThrow(
        "Could not delete observation.",
      );
    });
  });
});
