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

describe("organizationService", () => {
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

    service = require("../src/Nodejs/organization/organizationService");
  });

  describe("getAllOrganizations", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);
      const result = await service.getAllOrganizations();
      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });
      const result = await service.getAllOrganizations();
      expect(mockFhirApi.get).toHaveBeenCalledWith("/Organization");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("organizations:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));
      await expect(service.getAllOrganizations()).rejects.toThrow("Could not fetch organizations.");
    });
  });

  describe("getOrganizationById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "org-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);
      const result = await service.getOrganizationById("org-001");
      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "org-001" };
      mockFhirApi.get.mockResolvedValue({ data });
      const result = await service.getOrganizationById("org-001");
      expect(mockFhirApi.get).toHaveBeenCalledWith("/Organization/org-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("organization:org-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Organization not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(Object.assign(new Error("not found"), { response: { status: 404 } }));
      await expect(service.getOrganizationById("org-001")).rejects.toThrow("Organization not found");
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));
      await expect(service.getOrganizationById("org-001")).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  describe("createOrganizationWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createOrganizationWithSpecificId({})).rejects.toThrow("The JSON body is missing the required 'id' field for this operation.");
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "org-001", resourceType: "Organization" };
      mockFhirApi.put.mockResolvedValue({ data });
      const result = await service.createOrganizationWithSpecificId({ id: "org-001" });
      expect(mockFhirApi.put).toHaveBeenCalledWith("/Organization/org-001", expect.objectContaining({ resourceType: "Organization", id: "org-001" }));
      expect(result).toBe(data);
    });

    it("invalidates org and all-orgs caches on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });
      await service.createOrganizationWithSpecificId({ id: "org-001" });
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("organization:org-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("organizations:all");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(Object.assign(new Error("bad"), { response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } } }));
      await expect(service.createOrganizationWithSpecificId({ id: "org-001" })).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));
      await expect(service.createOrganizationWithSpecificId({ id: "org-001" })).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  describe("updateOrganization", () => {
    it("throws when organizationId is missing", async () => {
      await expect(service.updateOrganization(null, {})).rejects.toThrow("Organization ID is required");
    });

    it("throws when existing organization is not found", async () => {
      mockFhirApi.get.mockRejectedValue(Object.assign(new Error("not found"), { response: { status: 404 } }));
      await expect(service.updateOrganization("org-001", {})).rejects.toThrow("Organization org-001 not found");
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "org-001", name: "Old Org" };
      const updated = { id: "org-001", name: "New Org" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });
      const result = await service.updateOrganization("org-001", { name: "New Org" });
      expect(mockFhirApi.put).toHaveBeenCalledWith("/Organization/org-001", expect.objectContaining({ resourceType: "Organization", id: "org-001", name: "New Org" }));
      expect(result).toBe(updated);
    });

    it("invalidates caches after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "org-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });
      await service.updateOrganization("org-001", {});
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("organization:org-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("organizations:all");
    });
  });

  describe("deleteOrganization", () => {
    it("throws when organizationId is missing", async () => {
      await expect(service.deleteOrganization(null)).rejects.toThrow("Organization ID is required");
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});
      const result = await service.deleteOrganization("org-001");
      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Organization/org-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("organization:org-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("organizations:all");
      expect(result).toEqual({ success: true, message: "Organization deleted successfully" });
    });

    it("throws 'Organization not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(Object.assign(new Error("not found"), { response: { status: 404 } }));
      await expect(service.deleteOrganization("org-001")).rejects.toThrow("Organization not found");
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(Object.assign(new Error("server error"), { response: { status: 500 } }));
      await expect(service.deleteOrganization("org-001")).rejects.toThrow("Could not delete organization.");
    });
  });
});
