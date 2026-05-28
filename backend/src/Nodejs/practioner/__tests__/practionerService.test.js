jest.mock("axios", () => {
  const mockInstance = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };{}
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});

jest.mock("../../middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn().mockResolvedValue(undefined),
  invalidatePractitionerCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { PRACTITIONER: 60 },
}));

jest.mock("../../practitionerRole/practitionerRoleService", () => ({
  getPractitionerRolesByPractitioner: jest.fn().mockResolvedValue({ entry: [] }),
}));

describe("practionerService", () => {
  let service;
  let mockFhirApi;
  let cacheHelper;
  let practitionerRoleService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFhirApi = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockFhirApi);

    cacheHelper = require("../../middleware/cacheHelper");
    cacheHelper.getFromCache.mockResolvedValue(null);
    cacheHelper.setInCache.mockResolvedValue(undefined);
    cacheHelper.invalidatePractitionerCache.mockResolvedValue(undefined);

    practitionerRoleService = require("../../practitionerRole/practitionerRoleService");
    practitionerRoleService.getPractitionerRolesByPractitioner.mockResolvedValue({ entry: [] });

    service = require("../practionerService");
  });

  // ─── getPractitionerById ──────────────────────────────────────────────────

  describe("getPractitionerById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "prac-001", name: "Dr. Cache" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getPractitionerById("prac-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR, enriches with role data, and caches mapped result", async () => {
      const fhirPractitioner = {
        id: "prac-001",
        resourceType: "Practitioner",
        name: [{ given: ["Alice"], family: "Smith" }],
      };
      mockFhirApi.get.mockResolvedValue({ data: fhirPractitioner });
      practitionerRoleService.getPractitionerRolesByPractitioner.mockResolvedValue({
        entry: [
          {
            resource: {
              code: [{ coding: [{ display: "General Practitioner" }] }],
              specialty: [{ coding: [{ display: "Internal Medicine" }] }],
            },
          },
        ],
      });

      const result = await service.getPractitionerById("prac-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Practitioner/prac-001");
      expect(result.id).toBe("prac-001");
      expect(result.name).toBe("Alice Smith");
      expect(result.title).toBe("General Practitioner");
      expect(result.specialtyDetail).toBe("Internal Medicine");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "practitioner:prac-001",
        expect.any(Object),
        60,
      );
    });

    it("returns default role values when no PractitionerRole entry exists", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "prac-001", name: [] } });
      practitionerRoleService.getPractitionerRolesByPractitioner.mockResolvedValue({ entry: [] });

      const result = await service.getPractitionerById("prac-001");

      expect(result.title).toBe("General Practitioner");
      expect(result.specialtyDetail).toBe("Dermatology");
    });

    it("injects mocked UI metadata with fees=150 and waitingTime=20", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "prac-001" } });

      const result = await service.getPractitionerById("prac-001");

      expect(result.fees).toBe(150);
      expect(result.waitingTime).toBe(20);
    });

    it("throws 'Practitioner not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getPractitionerById("prac-001")).rejects.toThrow(
        "Practitioner not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getPractitionerById("prac-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createPractitionerWithSpecificId ─────────────────────────────────────

  describe("createPractitionerWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createPractitionerWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "prac-001", resourceType: "Practitioner" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createPractitionerWithSpecificId({ id: "prac-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Practitioner/prac-001",
        expect.objectContaining({ resourceType: "Practitioner", id: "prac-001" }),
      );
      expect(result).toBe(data);
    });

    it("calls invalidatePractitionerCache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createPractitionerWithSpecificId({ id: "prac-001" });

      expect(cacheHelper.invalidatePractitionerCache).toHaveBeenCalledWith("prac-001");
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createPractitionerWithSpecificId({ id: "prac-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(
        service.createPractitionerWithSpecificId({ id: "prac-001" }),
      ).rejects.toThrow("Could not connect to the FHIR server.");
    });
  });

  // ─── updatePractitioner ────────────────────────────────────────────────────

  describe("updatePractitioner", () => {
    it("throws when practitionerId is missing", async () => {
      await expect(service.updatePractitioner(null, {})).rejects.toThrow(
        "Practitioner ID is required",
      );
    });

    it("throws when existing practitioner is not found", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("not found"));

      await expect(service.updatePractitioner("prac-001", {})).rejects.toThrow(
        "Practitioner prac-001 not found",
      );
    });

    it("fetches raw FHIR (not cached), merges and PUTs", async () => {
      const existing = { id: "prac-001", active: true };
      const updated = { id: "prac-001", active: false };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updatePractitioner("prac-001", { active: false });

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Practitioner/prac-001");
      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Practitioner/prac-001",
        expect.objectContaining({ resourceType: "Practitioner", id: "prac-001" }),
      );
      expect(result).toBe(updated);
    });

    it("calls invalidatePractitionerCache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "prac-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.updatePractitioner("prac-001", {});

      expect(cacheHelper.invalidatePractitionerCache).toHaveBeenCalledWith("prac-001");
    });

    it("throws FHIR validation error on 422", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "prac-001" } });
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "validation failed" }] } },
        }),
      );

      await expect(service.updatePractitioner("prac-001", {})).rejects.toThrow(
        "FHIR Validation Failed: validation failed",
      );
    });
  });

  // ─── deletePractitioner ────────────────────────────────────────────────────

  describe("deletePractitioner", () => {
    it("throws when practitionerId is missing", async () => {
      await expect(service.deletePractitioner(null)).rejects.toThrow(
        "Practitioner ID is required",
      );
    });

    it("deletes from FHIR, invalidates cache, returns success", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deletePractitioner("prac-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Practitioner/prac-001");
      expect(cacheHelper.invalidatePractitionerCache).toHaveBeenCalledWith("prac-001");
      expect(result).toEqual({ success: true, id: "prac-001" });
    });

    it("returns alreadyDeleted:true on 404 without throwing", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      const result = await service.deletePractitioner("prac-001");

      expect(cacheHelper.invalidatePractitionerCache).toHaveBeenCalledWith("prac-001");
      expect(result).toEqual({ success: true, id: "prac-001", alreadyDeleted: true });
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deletePractitioner("prac-001")).rejects.toThrow(
        "Could not delete practitioner.",
      );
    });
  });

  // ─── getAllPractitioners ───────────────────────────────────────────────────

  describe("getAllPractitioners", () => {
    it("returns empty array when bundle has no entries", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { entry: [] } });

      const result = await service.getAllPractitioners();

      expect(result).toEqual([]);
    });

    it("maps each entry through practitioner mapping", async () => {
      const fhirBundle = {
        entry: [
          { resource: { id: "prac-001", name: [{ given: ["Bob"], family: "Jones" }] } },
        ],
      };
      mockFhirApi.get.mockResolvedValue({ data: fhirBundle });

      const result = await service.getAllPractitioners();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("prac-001");
      expect(result[0].name).toBe("Bob Jones");
    });

    it("filters by specialty when specialtyFilter is provided", async () => {
      const fhirBundle = {
        entry: [
          { resource: { id: "prac-001", name: [] } },
          { resource: { id: "prac-002", name: [] } },
        ],
      };
      mockFhirApi.get.mockResolvedValue({ data: fhirBundle });
      practitionerRoleService.getPractitionerRolesByPractitioner
        .mockResolvedValueOnce({
          entry: [
            { resource: { specialty: [{ coding: [{ display: "Cardiology" }] }], code: [] } },
          ],
        })
        .mockResolvedValueOnce({
          entry: [
            { resource: { specialty: [{ coding: [{ display: "Dermatology" }] }], code: [] } },
          ],
        });

      const result = await service.getAllPractitioners("Cardiology");

      expect(result).toHaveLength(1);
      expect(result[0].specialtyDetail).toBe("Cardiology");
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAllPractitioners()).rejects.toThrow(
        "Could not fetch practitioners from the FHIR server.",
      );
    });
  });
});
