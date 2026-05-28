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

describe("locationService", () => {
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

    service = require("../locationService");
  });

  // ─── getAllLocations ───────────────────────────────────────────────────────

  describe("getAllLocations", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllLocations();

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllLocations();

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Location");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("locations:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllLocations()).rejects.toThrow("Could not fetch locations.");
    });
  });

  // ─── getLocationsByOrganization ────────────────────────────────────────────

  describe("getLocationsByOrganization", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getLocationsByOrganization("org-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getLocationsByOrganization("org-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/Location?organization=Organization/org-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "locations:organization:org-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getLocationsByOrganization("org-001")).rejects.toThrow(
        "Could not fetch locations for organization.",
      );
    });
  });

  // ─── getLocationById ───────────────────────────────────────────────────────

  describe("getLocationById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "loc-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getLocationById("loc-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "loc-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getLocationById("loc-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Location/loc-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("location:loc-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Location not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getLocationById("loc-001")).rejects.toThrow("Location not found");
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getLocationById("loc-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createLocationWithSpecificId ─────────────────────────────────────────

  describe("createLocationWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createLocationWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "loc-001", resourceType: "Location" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createLocationWithSpecificId({ id: "loc-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Location/loc-001",
        expect.objectContaining({ resourceType: "Location", id: "loc-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates location and all-locations caches", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createLocationWithSpecificId({ id: "loc-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("location:loc-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("locations:all");
    });

    it("invalidates organization cache when managingOrganization reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createLocationWithSpecificId({
        id: "loc-001",
        managingOrganization: { reference: "Organization/org-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("locations:organization:org-001");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(service.createLocationWithSpecificId({ id: "loc-001" })).rejects.toThrow(
        "FHIR Validation Failed: bad code",
      );
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(service.createLocationWithSpecificId({ id: "loc-001" })).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── updateLocation ────────────────────────────────────────────────────────

  describe("updateLocation", () => {
    it("throws when locationId is missing", async () => {
      await expect(service.updateLocation(null, {})).rejects.toThrow("Location ID is required");
    });

    it("throws when existing location is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateLocation("loc-001", {})).rejects.toThrow(
        "Location loc-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "loc-001", name: "Old Name" };
      const updated = { id: "loc-001", name: "New Name" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateLocation("loc-001", { name: "New Name" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Location/loc-001",
        expect.objectContaining({ resourceType: "Location", id: "loc-001", name: "New Name" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates caches after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "loc-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateLocation("loc-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("location:loc-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("locations:all");
    });
  });

  // ─── deleteLocation ────────────────────────────────────────────────────────

  describe("deleteLocation", () => {
    it("throws when locationId is missing", async () => {
      await expect(service.deleteLocation(null)).rejects.toThrow("Location ID is required");
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteLocation("loc-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Location/loc-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("location:loc-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("locations:all");
      expect(result).toEqual({ success: true, message: "Location deleted successfully" });
    });

    it("throws 'Location not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteLocation("loc-001")).rejects.toThrow("Location not found");
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteLocation("loc-001")).rejects.toThrow("Could not delete location.");
    });
  });
});
