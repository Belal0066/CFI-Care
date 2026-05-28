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
  CACHE_EXPIRATION: { SHORT: 60 },
}));

describe("slotService", () => {
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

    service = require("../slotService");
  });

  // ─── getSlotsBySchedule ────────────────────────────────────────────────────

  describe("getSlotsBySchedule", () => {
    it("returns cached data when not dirty", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache
        .mockResolvedValueOnce(null)    // dirty check → not dirty
        .mockResolvedValueOnce(cached); // cache hit

      const result = await service.getSlotsBySchedule("sched-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("skips cache when dirty flag is set", async () => {
      cacheHelper.getFromCache.mockResolvedValueOnce(1); // dirty
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getSlotsBySchedule("sched-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Slot?schedule=sched-001");
      expect(result).toBe(bundle);
      // should NOT cache when dirty
      expect(cacheHelper.setInCache).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches with SHORT TTL", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getSlotsBySchedule("sched-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Slot?schedule=sched-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "slots:schedule:sched-001:status:all",
        bundle,
        60,
      );
    });

    it("appends status param when provided", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: {} });

      await service.getSlotsBySchedule("sched-001", "free");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Slot?schedule=sched-001&status=free");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "slots:schedule:sched-001:status:free",
        expect.anything(),
        60,
      );
    });

    it("throws on FHIR error", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getSlotsBySchedule("sched-001")).rejects.toThrow(
        "Could not fetch slots.",
      );
    });
  });

  // ─── getAvailableSlots ────────────────────────────────────────────────────

  describe("getAvailableSlots", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAvailableSlots("prac-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches status=free slots on cache miss", async () => {
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getAvailableSlots("prac-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Slot?status=free");
    });

    it("includes schedule and date params when provided", async () => {
      mockFhirApi.get.mockResolvedValue({ data: {} });

      await service.getAvailableSlots("prac-001", "2026-05-24", "sched-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/Slot?status=free&schedule=sched-001&start=2026-05-24",
      );
    });

    it("throws on FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAvailableSlots("prac-001")).rejects.toThrow(
        "Could not fetch available slots.",
      );
    });
  });

  // ─── getSlotsByPractitioner ────────────────────────────────────────────────

  describe("getSlotsByPractitioner", () => {
    it("returns empty array when practitioner has no schedules", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { entry: [] } });

      const result = await service.getSlotsByPractitioner("prac-001");

      expect(result).toEqual([]);
    });

    it("fetches slots for each schedule and flattens results", async () => {
      mockFhirApi.get
        .mockResolvedValueOnce({
          data: {
            entry: [{ resource: { id: "sched-001" } }],
          },
        })
        .mockResolvedValueOnce({
          data: {
            entry: [
              {
                resource: {
                  id: "slot-001",
                  status: "free",
                  start: "2026-01-01T09:00:00Z",
                  end: "2026-01-01T09:30:00Z",
                },
              },
            ],
            link: [],
          },
        });

      const result = await service.getSlotsByPractitioner("prac-001");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("slot-001");
      expect(result[0].resourceType).toBe("Slot");
    });

    it("returns empty slots for a schedule when slot fetch fails", async () => {
      mockFhirApi.get
        .mockResolvedValueOnce({
          data: { entry: [{ resource: { id: "sched-001" } }] },
        })
        .mockRejectedValueOnce(new Error("slots error"));

      const result = await service.getSlotsByPractitioner("prac-001");

      expect(result).toEqual([]);
    });

    it("throws on top-level FHIR error", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getSlotsByPractitioner("prac-001")).rejects.toThrow(
        "Could not fetch slots for practitioner.",
      );
    });
  });

  // ─── getSlotById ──────────────────────────────────────────────────────────

  describe("getSlotById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "slot-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getSlotById("slot-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "slot-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getSlotById("slot-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Slot/slot-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("slot:slot-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Slot not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getSlotById("slot-001")).rejects.toThrow("Slot not found");
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getSlotById("slot-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createSlotWithSpecificId ─────────────────────────────────────────────

  describe("createSlotWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createSlotWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "slot-001", resourceType: "Slot", status: "free" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createSlotWithSpecificId({ id: "slot-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Slot/slot-001",
        expect.objectContaining({ resourceType: "Slot", id: "slot-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates slot and schedule caches on success", async () => {
      const data = {
        id: "slot-001",
        status: "free",
        schedule: { reference: "Schedule/sched-001" },
      };
      mockFhirApi.put.mockResolvedValue({ data });

      await service.createSlotWithSpecificId({ id: "slot-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("slot:slot-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "slots:schedule:sched-001:status:all",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "slots:schedule:sched-001:status:all:dirty",
        1,
        15,
      );
    });

    it("throws FHIR validation error with diagnostics", async () => {
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(service.createSlotWithSpecificId({ id: "slot-001" })).rejects.toThrow(
        "FHIR Validation Failed: bad code",
      );
    });

    it("throws connection error on network failure", async () => {
      mockFhirApi.put.mockRejectedValue(new Error("network"));

      await expect(service.createSlotWithSpecificId({ id: "slot-001" })).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── updateSlot ───────────────────────────────────────────────────────────

  describe("updateSlot", () => {
    it("throws when slotId is missing", async () => {
      await expect(service.updateSlot(null, {})).rejects.toThrow("Slot ID is required");
    });

    it("throws when existing slot is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateSlot("slot-001", {})).rejects.toThrow("Slot slot-001 not found");
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "slot-001", status: "free" };
      const updated = { id: "slot-001", status: "busy" };
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateSlot("slot-001", { status: "busy" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Slot/slot-001",
        expect.objectContaining({ resourceType: "Slot", id: "slot-001", status: "busy" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates slot cache after update", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: { id: "slot-001" } });
      mockFhirApi.put.mockResolvedValue({ data: { id: "slot-001" } });

      await service.updateSlot("slot-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("slot:slot-001");
    });

    it("throws FHIR validation error on update failure", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: { id: "slot-001" } });
      mockFhirApi.put.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "update fail" }] } },
        }),
      );

      await expect(service.updateSlot("slot-001", {})).rejects.toThrow(
        "FHIR Validation Failed: update fail",
      );
    });
  });

  // ─── deleteSlot ───────────────────────────────────────────────────────────

  describe("deleteSlot", () => {
    it("throws when slotId is missing", async () => {
      await expect(service.deleteSlot(null)).rejects.toThrow("Slot ID is required");
    });

    it("deletes from FHIR and invalidates slot cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteSlot("slot-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Slot/slot-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("slot:slot-001");
      expect(result).toEqual({ success: true, message: "Slot deleted successfully" });
    });

    it("throws 'Slot not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteSlot("slot-001")).rejects.toThrow("Slot not found");
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteSlot("slot-001")).rejects.toThrow("Could not delete slot.");
    });
  });
});
