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

jest.mock("../../slot/slotService", () => ({
  getSlotsBySchedule: jest.fn().mockResolvedValue({ entry: [] }),
}));

describe("scheduleService", () => {
  let service;
  let mockFhirApi;
  let cacheHelper;
  let slotService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFhirApi = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockFhirApi);

    cacheHelper = require("../../middleware/cacheHelper");
    cacheHelper.getFromCache.mockResolvedValue(null);
    cacheHelper.setInCache.mockResolvedValue(undefined);
    cacheHelper.deleteFromCache.mockResolvedValue(undefined);

    slotService = require("../../slot/slotService");
    slotService.getSlotsBySchedule.mockResolvedValue({ entry: [] });

    service = require("../scheduleService");
  });

  // ─── getSchedulesByActor ──────────────────────────────────────────────────

  describe("getSchedulesByActor", () => {
    it("returns cached data when not dirty", async () => {
      const cached = [{ id: "sched-001" }];
      cacheHelper.getFromCache
        .mockResolvedValueOnce(null)  // dirty check → not dirty
        .mockResolvedValueOnce(cached); // cache hit

      const result = await service.getSchedulesByActor("Practitioner/prac-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("skips cache and re-fetches when dirty flag is set", async () => {
      const bundle = { entry: [{ resource: { id: "sched-001" } }] };
      cacheHelper.getFromCache
        .mockResolvedValueOnce(1); // dirty flag set
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getSchedulesByActor("Practitioner/prac-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith(
        "/Schedule?actor=Practitioner/prac-001",
      );
      expect(result).toEqual([{ id: "sched-001" }]);
      // should NOT cache when dirty
      expect(cacheHelper.setInCache).not.toHaveBeenCalledWith(
        expect.stringContaining("schedules:actor:"),
        expect.anything(),
        expect.anything(),
      );
    });

    it("maps bundle entries to resources on cache miss", async () => {
      const bundle = {
        entry: [
          { resource: { id: "sched-001" } },
          { resource: { id: "sched-002" } },
        ],
      };
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getSchedulesByActor("Practitioner/prac-001");

      expect(result).toEqual([{ id: "sched-001" }, { id: "sched-002" }]);
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "schedules:actor:Practitioner/prac-001",
        result,
        60,
      );
    });

    it("returns empty array when bundle has no entries", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: {} });

      const result = await service.getSchedulesByActor("Practitioner/prac-001");

      expect(result).toEqual([]);
    });

    it("throws on FHIR error", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getSchedulesByActor("Practitioner/prac-001"),
      ).rejects.toThrow("Could not fetch schedules.");
    });
  });

  // ─── getScheduleById ──────────────────────────────────────────────────────

  describe("getScheduleById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "sched-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getScheduleById("sched-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "sched-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getScheduleById("sched-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Schedule/sched-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("schedule:sched-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Schedule not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getScheduleById("sched-001")).rejects.toThrow("Schedule not found");
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getScheduleById("sched-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── createScheduleWithSpecificId ─────────────────────────────────────────

  describe("createScheduleWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createScheduleWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "sched-001", resourceType: "Schedule" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createScheduleWithSpecificId({ id: "sched-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Schedule/sched-001",
        expect.objectContaining({ resourceType: "Schedule", id: "sched-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates schedule cache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: { id: "sched-001" } });

      await service.createScheduleWithSpecificId({ id: "sched-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("schedule:sched-001");
    });

    it("sets dirty flag for actor cache after create", async () => {
      mockFhirApi.put.mockResolvedValue({
        data: {
          id: "sched-001",
          actor: [{ reference: "Practitioner/prac-001" }],
        },
      });

      await service.createScheduleWithSpecificId({ id: "sched-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "schedules:actor:Practitioner/prac-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "schedules:actor:Practitioner/prac-001:dirty",
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

      await expect(
        service.createScheduleWithSpecificId({ id: "sched-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });
  });

  // ─── updateSchedule ───────────────────────────────────────────────────────

  describe("updateSchedule", () => {
    it("throws when scheduleId is missing", async () => {
      await expect(service.updateSchedule(null, {})).rejects.toThrow(
        "Schedule ID is required",
      );
    });

    it("throws when existing schedule is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateSchedule("sched-001", {})).rejects.toThrow(
        "Schedule sched-001 not found",
      );
    });

    it("merges existing data and PUTs to FHIR", async () => {
      const existing = { id: "sched-001", active: true };
      const updated = { id: "sched-001", active: false };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateSchedule("sched-001", { active: false });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Schedule/sched-001",
        expect.objectContaining({ resourceType: "Schedule", id: "sched-001" }),
      );
      expect(result).toBe(updated);
    });

    it("invalidates cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "sched-001" } });
      mockFhirApi.put.mockResolvedValue({ data: { id: "sched-001" } });

      await service.updateSchedule("sched-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("schedule:sched-001");
    });
  });

  // ─── deleteSchedule ───────────────────────────────────────────────────────

  describe("deleteSchedule", () => {
    it("throws when scheduleId is missing", async () => {
      await expect(service.deleteSchedule(null)).rejects.toThrow("Schedule ID is required");
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteSchedule("sched-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Schedule/sched-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("schedule:sched-001");
      expect(result).toEqual({ success: true, message: "Schedule deleted successfully" });
    });

    it("throws 'Schedule not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteSchedule("sched-001")).rejects.toThrow("Schedule not found");
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteSchedule("sched-001")).rejects.toThrow(
        "Could not delete schedule.",
      );
    });
  });

  // ─── getSchedulesWithSlotsByPractitioner ──────────────────────────────────

  describe("getSchedulesWithSlotsByPractitioner", () => {
    it("returns empty array when no schedules found", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({ data: {} });

      const result = await service.getSchedulesWithSlotsByPractitioner("prac-001");

      expect(result).toEqual([]);
    });

    it("returns schedule+slots pairs for each schedule", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({
        data: { entry: [{ resource: { id: "sched-001", active: true } }] },
      });
      slotService.getSlotsBySchedule.mockResolvedValue({
        entry: [
          {
            resource: {
              id: "slot-001",
              start: "2026-01-01T09:00:00Z",
              end: "2026-01-01T09:30:00Z",
              status: "free",
              schedule: { reference: "Schedule/sched-001" },
            },
          },
        ],
      });

      const result = await service.getSchedulesWithSlotsByPractitioner("prac-001");

      expect(result).toHaveLength(1);
      expect(result[0].schedule.id).toBe("sched-001");
      expect(result[0].slots).toHaveLength(1);
      expect(result[0].slots[0].id).toBe("slot-001");
    });

    it("includes schedule with empty slots when slot fetch fails", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockResolvedValue({
        data: { entry: [{ resource: { id: "sched-001" } }] },
      });
      slotService.getSlotsBySchedule.mockRejectedValue(new Error("slots error"));

      const result = await service.getSchedulesWithSlotsByPractitioner("prac-001");

      expect(result).toHaveLength(1);
      expect(result[0].slots).toEqual([]);
    });

    it("throws on top-level error", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getSchedulesWithSlotsByPractitioner("prac-001"),
      ).rejects.toThrow("Could not fetch schedules with slots for practitioner.");
    });
  });
});
