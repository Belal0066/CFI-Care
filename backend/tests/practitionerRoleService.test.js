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
  invalidatePractitionerCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { DEFAULT: 60 },
}));

describe("practitionerRoleService", () => {
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

    service = require("../src/Nodejs/practitionerRole/practitionerRoleService");
  });

  // ─── getAllPractitionerRoles ───────────────────────────────────────────────

  describe("getAllPractitionerRoles", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAllPractitionerRoles();

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAllPractitionerRoles();

      expect(mockFhirApi.get).toHaveBeenCalledWith("/PractitionerRole");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("practitionerRoles:all", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllPractitionerRoles()).rejects.toThrow(
        "Could not fetch practitioner roles.",
      );
    });
  });

  // ─── getPractitionerRolesByPractitioner ───────────────────────────────────

  describe("getPractitionerRolesByPractitioner", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getPractitionerRolesByPractitioner("prac-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getPractitionerRolesByPractitioner("prac-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/PractitionerRole?practitioner=Practitioner/prac-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "practitionerRoles:practitioner:prac-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getPractitionerRolesByPractitioner("prac-001"),
      ).rejects.toThrow("Could not fetch practitioner roles for practitioner.");
    });
  });

  // ─── getPractitionerRolesByOrganization ───────────────────────────────────

  describe("getPractitionerRolesByOrganization", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getPractitionerRolesByOrganization("org-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR and caches", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getPractitionerRolesByOrganization("org-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/PractitionerRole?organization=Organization/org-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "practitionerRoles:organization:org-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getPractitionerRolesByOrganization("org-001"),
      ).rejects.toThrow("Could not fetch practitioner roles for organization.");
    });
  });

  // ─── getPractitionerRoleById ───────────────────────────────────────────────

  describe("getPractitionerRoleById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "pr-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getPractitionerRoleById("pr-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "pr-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getPractitionerRoleById("pr-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/PractitionerRole/pr-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("practitionerRole:pr-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'PractitionerRole not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getPractitionerRoleById("pr-001")).rejects.toThrow(
        "PractitionerRole not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getPractitionerRoleById("pr-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createPractitionerRoleWithSpecificId ─────────────────────────────────

  describe("createPractitionerRoleWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createPractitionerRoleWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "pr-001", resourceType: "PractitionerRole" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createPractitionerRoleWithSpecificId({ id: "pr-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/PractitionerRole/pr-001",
        expect.objectContaining({ resourceType: "PractitionerRole", id: "pr-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates practitionerRole and all caches", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createPractitionerRoleWithSpecificId({ id: "pr-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("practitionerRole:pr-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("practitionerRoles:all");
    });

    it("invalidates practitioner cache when practitioner reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createPractitionerRoleWithSpecificId({
        id: "pr-001",
        practitioner: { reference: "Practitioner/prac-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "practitionerRoles:practitioner:prac-001",
      );
    });

    it("invalidates organization cache when organization reference present", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createPractitionerRoleWithSpecificId({
        id: "pr-001",
        organization: { reference: "Organization/org-001" },
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "practitionerRoles:organization:org-001",
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createPractitionerRoleWithSpecificId({ id: "pr-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createPractitionerRoleWithSpecificId({ id: "pr-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updatePractitionerRole ────────────────────────────────────────────────

  describe("updatePractitionerRole", () => {
    it("throws when practitionerRoleId is missing", async () => {
      await expect(service.updatePractitionerRole(null, {})).rejects.toThrow(
        "PractitionerRole ID is required",
      );
    });

    it("throws when existing practitioner role is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updatePractitionerRole("pr-001", {})).rejects.toThrow(
        "PractitionerRole pr-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "pr-001", active: true };
      const updated = { id: "pr-001", active: false };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updatePractitionerRole("pr-001", { active: false });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/PractitionerRole/pr-001",
        expect.objectContaining({ resourceType: "PractitionerRole", id: "pr-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates caches after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "pr-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updatePractitionerRole("pr-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("practitionerRole:pr-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("practitionerRoles:all");
    });
  });

  // ─── deletePractitionerRole ────────────────────────────────────────────────

  describe("deletePractitionerRole", () => {
    it("throws when practitionerRoleId is missing", async () => {
      await expect(service.deletePractitionerRole(null)).rejects.toThrow(
        "PractitionerRole ID is required",
      );
    });

    it("deletes from FHIR and invalidates caches", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deletePractitionerRole("pr-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/PractitionerRole/pr-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("practitionerRole:pr-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("practitionerRoles:all");
      expect(result).toEqual({
        success: true,
        message: "PractitionerRole deleted successfully",
      });
    });

    it("throws 'PractitionerRole not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deletePractitionerRole("pr-001")).rejects.toThrow(
        "PractitionerRole not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deletePractitionerRole("pr-001")).rejects.toThrow(
        "Could not delete practitioner role.",
      );
    });
  });
});

