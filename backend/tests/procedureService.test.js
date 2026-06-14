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
  deleteByPattern: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { PROCEDURE: 60 },
}));

describe("procedureService", () => {
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

    service = require("../src/Nodejs/procedure/procedureService");
  });

  describe("getProceduresByPatientId", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);
      const result = await service.getProceduresByPatientId("p-001");
      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches with PROCEDURE TTL", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });
      const result = await service.getProceduresByPatientId("p-001");
      expect(mockFhirApi.get).toHaveBeenCalledWith("/Procedure?subject=Patient/p-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("procedures:patient:p-001", bundle, 60);
      expect(result).toBe(bundle);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));
      await expect(service.getProceduresByPatientId("p-001")).rejects.toThrow("Could not fetch patient procedures.");
    });
  });

  describe("getProcedureById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "proc-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);
      const result = await service.getProcedureById("proc-001");
      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "proc-001" };
      mockFhirApi.get.mockResolvedValue({ data });
      const result = await service.getProcedureById("proc-001");
      expect(mockFhirApi.get).toHaveBeenCalledWith("/Procedure/proc-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("procedure:proc-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));
      await expect(service.getProcedureById("proc-001")).rejects.toThrow("Could not fetch procedure.");
    });
  });

  describe("createProcedure", () => {
    it("POSTs to FHIR and returns response data", async () => {
      const data = { id: "proc-001", resourceType: "Procedure" };
      mockFhirApi.post.mockResolvedValue({ data });
      const result = await service.createProcedure({ status: "completed" });
      expect(mockFhirApi.post).toHaveBeenCalledWith("/Procedure", expect.objectContaining({ status: "completed" }));
      expect(result).toBe(data);
    });

    it("invalidates patient cache when subject reference present", async () => {
      const data = { id: "proc-001" };
      mockFhirApi.post.mockResolvedValue({ data });
      await service.createProcedure({ subject: { reference: "Patient/p-001" } });
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("procedures:patient:p-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("patient:p-001:everything");
    });

    it("caches the new procedure when response has id", async () => {
      const data = { id: "proc-001" };
      mockFhirApi.post.mockResolvedValue({ data });
      await service.createProcedure({});
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("procedure:proc-001", data, 60);
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.post.mockRejectedValue(new Error("network"));
      await expect(service.createProcedure({})).rejects.toThrow("Could not create procedure.");
    });
  });

  describe("updateProcedure", () => {
    it("throws when procedureId is missing", async () => {
      await expect(service.updateProcedure(null, {})).rejects.toThrow("Procedure ID is required");
    });

    it("throws when existing procedure is not found", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));
      await expect(service.updateProcedure("proc-001", {})).rejects.toThrow("Procedure proc-001 not found");
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "proc-001", status: "in-progress" };
      const updated = { id: "proc-001", status: "completed" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });
      const result = await service.updateProcedure("proc-001", { status: "completed" });
      expect(mockFhirApi.put).toHaveBeenCalledWith("/Procedure/proc-001", expect.objectContaining({ resourceType: "Procedure", id: "proc-001" }));
      expect(result).toBe(updated);
    });

    it("invalidates procedure cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "proc-001" } });
      mockFhirApi.put.mockResolvedValue({ data: {} });
      await service.updateProcedure("proc-001", {});
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("procedure:proc-001");
    });

    it("throws on FHIR error during update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "proc-001" } });
      mockFhirApi.put.mockRejectedValue(new Error("network"));
      await expect(service.updateProcedure("proc-001", {})).rejects.toThrow("Could not update procedure.");
    });
  });

  describe("deleteProcedure", () => {
    it("throws when procedureId is missing", async () => {
      await expect(service.deleteProcedure(null)).rejects.toThrow("Procedure ID is required");
    });

    it("deletes from FHIR and invalidates caches", async () => {
      const procedure = { id: "proc-001", subject: { reference: "Patient/p-001" } };
      mockFhirApi.get.mockResolvedValue({ data: procedure });
      mockFhirApi.delete.mockResolvedValue({});
      const result = await service.deleteProcedure("proc-001");
      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Procedure/proc-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("procedures:patient:p-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("procedure:proc-001");
      expect(result).toEqual({ success: true, id: "proc-001" });
    });

    it("returns alreadyDeleted:true on 404 without throwing", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "proc-001" } });
      mockFhirApi.delete.mockRejectedValue(Object.assign(new Error("not found"), { response: { status: 404 } }));
      const result = await service.deleteProcedure("proc-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("procedure:proc-001");
      expect(result).toEqual({ success: true, id: "proc-001", alreadyDeleted: true });
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "proc-001" } });
      mockFhirApi.delete.mockRejectedValue(Object.assign(new Error("server error"), { response: { status: 500 } }));
      await expect(service.deleteProcedure("proc-001")).rejects.toThrow("Could not delete procedure.");
    });
  });
});
