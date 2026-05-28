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

describe("deviceService", () => {
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

    service = require("../deviceService");
  });

  // ─── getAllDevices ─────────────────────────────────────────────────────────

  describe("getAllDevices", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllDevices();

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllDevices();

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Device");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("devices:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllDevices()).rejects.toThrow("Could not fetch devices.");
    });
  });

  // ─── getDevicesByOrganization ──────────────────────────────────────────────

  describe("getDevicesByOrganization", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getDevicesByOrganization("org-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getDevicesByOrganization("org-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Device?owner=Organization/org-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "devices:organization:org-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getDevicesByOrganization("org-001")).rejects.toThrow(
        "Could not fetch devices for organization.",
      );
    });
  });

  // ─── getDeviceById ─────────────────────────────────────────────────────────

  describe("getDeviceById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "d-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getDeviceById("d-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "d-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getDeviceById("d-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Device/d-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("device:d-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Device not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getDeviceById("d-001")).rejects.toThrow("Device not found");
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getDeviceById("d-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createDeviceWithSpecificId ────────────────────────────────────────────

  describe("createDeviceWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createDeviceWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "d-001", resourceType: "Device" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createDeviceWithSpecificId({ id: "d-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Device/d-001",
        expect.objectContaining({ resourceType: "Device", id: "d-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates device and all-devices caches", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDeviceWithSpecificId({ id: "d-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("device:d-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("devices:all");
    });

    it("invalidates organization cache when owner reference is present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createDeviceWithSpecificId({
        id: "d-001",
        owner: { reference: "Organization/org-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("devices:organization:org-001");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(service.createDeviceWithSpecificId({ id: "d-001" })).rejects.toThrow(
        "FHIR Validation Failed: bad code",
      );
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(service.createDeviceWithSpecificId({ id: "d-001" })).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── updateDevice ──────────────────────────────────────────────────────────

  describe("updateDevice", () => {
    it("throws when deviceId is missing", async () => {
      await expect(service.updateDevice(null, {})).rejects.toThrow("Device ID is required");
    });

    it("throws when existing device is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateDevice("d-001", {})).rejects.toThrow("Device d-001 not found");
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "d-001", status: "active" };
      const updated = { id: "d-001", status: "inactive" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateDevice("d-001", { status: "inactive" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Device/d-001",
        expect.objectContaining({ resourceType: "Device", id: "d-001", status: "inactive" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "d-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updateDevice("d-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("device:d-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("devices:all");
    });
  });

  // ─── deleteDevice ──────────────────────────────────────────────────────────

  describe("deleteDevice", () => {
    it("throws when deviceId is missing", async () => {
      await expect(service.deleteDevice(null)).rejects.toThrow("Device ID is required");
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteDevice("d-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Device/d-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("device:d-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("devices:all");
      expect(result).toEqual({ success: true, message: "Device deleted successfully" });
    });

    it("throws 'Device not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteDevice("d-001")).rejects.toThrow("Device not found");
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteDevice("d-001")).rejects.toThrow("Could not delete device.");
    });
  });
});
