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

jest.mock("../src/Nodejs/slot/slotService", () => ({
  updateSlot: jest.fn().mockResolvedValue({}),
}));

describe("appointmentService", () => {
  let service;
  let mockFhirApi;
  let cacheHelper;
  let slotService;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockFhirApi = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockFhirApi);

    cacheHelper = require("../src/Nodejs/middleware/cacheHelper");
    cacheHelper.getFromCache.mockResolvedValue(null);
    cacheHelper.setInCache.mockResolvedValue(undefined);
    cacheHelper.deleteFromCache.mockResolvedValue(undefined);

    slotService = require("../src/Nodejs/slot/slotService");
    slotService.updateSlot.mockResolvedValue({});

    service = require("../src/Nodejs/appointment/appointmentService");
  });

  // ─── getAppointmentsByPatient ──────────────────────────────────────────────

  describe("getAppointmentsByPatient", () => {
    it("returns cached data when not dirty", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache
        .mockResolvedValueOnce(null)    // dirty check
        .mockResolvedValueOnce(cached); // cache hit

      const result = await service.getAppointmentsByPatient("p-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("skips cache and fetches when dirty flag is set", async () => {
      cacheHelper.getFromCache.mockResolvedValueOnce(1); // dirty
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      const result = await service.getAppointmentsByPatient("p-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Appointment?patient=Patient/p-001");
      expect(result).toBe(bundle);
      // should NOT re-cache when dirty
      expect(cacheHelper.setInCache).not.toHaveBeenCalledWith(
        "appointments:patient:p-001",
        expect.anything(),
        expect.anything(),
      );
    });

    it("fetches from FHIR and caches on clean cache miss", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      const bundle = { resourceType: "Bundle" };
      mockFhirApi.get.mockResolvedValue({ data: bundle });

      await service.getAppointmentsByPatient("p-001");

      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "appointments:patient:p-001",
        bundle,
        60,
      );
    });

    it("throws on FHIR error", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAppointmentsByPatient("p-001")).rejects.toThrow(
        "Could not fetch patient appointments.",
      );
    });
  });

  // ─── getAppointmentsByPractitioner ────────────────────────────────────────

  describe("getAppointmentsByPractitioner", () => {
    it("returns cached data when not dirty", async () => {
      const cached = { resourceType: "Bundle" };
      cacheHelper.getFromCache
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(cached);

      const result = await service.getAppointmentsByPractitioner("prac-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches and enriches with patient names on cache miss", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      const bundle = {
        entry: [
          {
            resource: {
              id: "appt-001",
              participant: [{ actor: { reference: "Patient/p-001" } }],
            },
          },
        ],
      };
      mockFhirApi.get
        .mockResolvedValueOnce({ data: bundle })
        .mockResolvedValueOnce({
          data: { name: [{ given: ["Alice"], family: "Smith" }] },
        });

      const result = await service.getAppointmentsByPractitioner("prac-001");

      expect(result.entry[0].resource._patientName).toBe("Alice Smith");
    });

    it("throws on FHIR error", async () => {
      cacheHelper.getFromCache.mockResolvedValue(null);
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(
        service.getAppointmentsByPractitioner("prac-001"),
      ).rejects.toThrow("Could not fetch practitioner appointments.");
    });
  });

  // ─── getAppointmentById ───────────────────────────────────────────────────

  describe("getAppointmentById", () => {
    it("returns cached data without calling FHIR", async () => {
      const cached = { id: "appt-001" };
      cacheHelper.getFromCache.mockResolvedValue(cached);

      const result = await service.getAppointmentById("appt-001");

      expect(result).toBe(cached);
      expect(mockFhirApi.get).not.toHaveBeenCalled();
    });

    it("fetches from FHIR on cache miss and caches result", async () => {
      const data = { id: "appt-001" };
      mockFhirApi.get.mockResolvedValue({ data });

      const result = await service.getAppointmentById("appt-001");

      expect(mockFhirApi.get).toHaveBeenCalledWith("/Appointment/appt-001");
      expect(cacheHelper.setInCache).toHaveBeenCalledWith("appointment:appt-001", data, 60);
      expect(result).toBe(data);
    });

    it("throws 'Appointment not found' on 404", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.getAppointmentById("appt-001")).rejects.toThrow(
        "Appointment not found",
      );
    });

    it("throws connection error on non-404", async () => {
      mockFhirApi.get.mockRejectedValue(new Error("network"));

      await expect(service.getAppointmentById("appt-001")).rejects.toThrow(
        "Could not connect to the FHIR server.",
      );
    });
  });

  // ─── transformBookingDataToFHIR ────────────────────────────────────────────

  describe("transformBookingDataToFHIR", () => {
    it("throws when required fields are missing", () => {
      expect(() => service.transformBookingDataToFHIR({})).toThrow(
        "Missing required fields: patientId, practitionerId, start, end",
      );
    });

    it("transforms simplified booking data to FHIR Appointment", () => {
      const result = service.transformBookingDataToFHIR({
        patientId: "p-001",
        practitionerId: "prac-001",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T09:30:00Z",
      });

      expect(result.resourceType).toBe("Appointment");
      expect(result.status).toBe("booked");
      expect(result.participant).toHaveLength(2);
      expect(result.participant[0].actor.reference).toBe("Patient/p-001");
      expect(result.participant[1].actor.reference).toBe("Practitioner/prac-001");
    });

    it("includes slot reference when slotId provided", () => {
      const result = service.transformBookingDataToFHIR({
        patientId: "p-001",
        practitionerId: "prac-001",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T09:30:00Z",
        slotId: "slot-001",
      });

      expect(result.slot[0].reference).toBe("Slot/slot-001");
    });

    it("includes description when comment is provided", () => {
      const result = service.transformBookingDataToFHIR({
        patientId: "p-001",
        practitionerId: "prac-001",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T09:30:00Z",
        comment: "Routine checkup",
      });

      expect(result.description).toContain("Patient note: Routine checkup");
    });
  });

  // ─── createAppointmentWithSpecificId ──────────────────────────────────────

  describe("createAppointmentWithSpecificId", () => {
    it("throws when id is missing", async () => {
      await expect(service.createAppointmentWithSpecificId({})).rejects.toThrow(
        "The JSON body is missing the required 'id' field for this operation.",
      );
    });

    it("PUTs to FHIR and returns response data", async () => {
      const data = { id: "appt-001", resourceType: "Appointment" };
      mockFhirApi.put.mockResolvedValue({ data });

      const result = await service.createAppointmentWithSpecificId({ id: "appt-001" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Appointment/appt-001",
        expect.objectContaining({ resourceType: "Appointment", id: "appt-001" }),
      );
      expect(result).toBe(data);
    });

    it("invalidates appointment cache on success", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createAppointmentWithSpecificId({ id: "appt-001" });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("appointment:appt-001");
    });

    it("invalidates patient and practitioner caches from participant array", async () => {
      mockFhirApi.put.mockResolvedValue({ data: {} });

      await service.createAppointmentWithSpecificId({
        id: "appt-001",
        participant: [
          { actor: { reference: "Patient/p-001" } },
          { actor: { reference: "Practitioner/prac-001" } },
        ],
      });

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("appointments:patient:p-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith(
        "appointments:practitioner:prac-001",
      );
      expect(cacheHelper.setInCache).toHaveBeenCalledWith(
        "appointments:patient:p-001:dirty",
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
        service.createAppointmentWithSpecificId({ id: "appt-001" }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });
  });

  // ─── createAppointment ────────────────────────────────────────────────────

  describe("createAppointment", () => {
    it("POSTs FHIR resource directly when already in FHIR format", async () => {
      const fhirAppt = {
        resourceType: "Appointment",
        status: "booked",
        participant: [],
      };
      const created = { id: "appt-001", ...fhirAppt };
      mockFhirApi.post.mockResolvedValue({ data: created });

      const result = await service.createAppointment(fhirAppt);

      expect(mockFhirApi.post).toHaveBeenCalledWith(
        "/Appointment",
        expect.objectContaining({ resourceType: "Appointment", status: "booked" }),
      );
      expect(result).toBe(created);
    });

    it("transforms simplified booking data before POSTing", async () => {
      mockFhirApi.post.mockResolvedValue({
        data: { id: "appt-001", resourceType: "Appointment" },
      });

      await service.createAppointment({
        patientId: "p-001",
        practitionerId: "prac-001",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T09:30:00Z",
      });

      expect(mockFhirApi.post).toHaveBeenCalledWith(
        "/Appointment",
        expect.objectContaining({ resourceType: "Appointment", status: "booked" }),
      );
    });

    it("updates slot to busy when slotId is in booking data", async () => {
      mockFhirApi.post.mockResolvedValue({
        data: { id: "appt-001", resourceType: "Appointment" },
      });

      await service.createAppointment({
        patientId: "p-001",
        practitionerId: "prac-001",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T09:30:00Z",
        slotId: "slot-001",
      });

      expect(slotService.updateSlot).toHaveBeenCalledWith("slot-001", { status: "busy" });
    });

    it("still returns appointment even when slot update fails", async () => {
      const created = { id: "appt-001", resourceType: "Appointment" };
      mockFhirApi.post.mockResolvedValue({ data: created });
      slotService.updateSlot.mockRejectedValue(new Error("slot error"));

      const result = await service.createAppointment({
        patientId: "p-001",
        practitionerId: "prac-001",
        start: "2026-01-01T09:00:00Z",
        end: "2026-01-01T09:30:00Z",
        slotId: "slot-001",
      });

      expect(result).toBe(created);
    });

    it("throws FHIR validation error on server error", async () => {
      mockFhirApi.post.mockRejectedValue(
        Object.assign(new Error("bad"), {
          response: { status: 422, data: { issue: [{ diagnostics: "bad code" }] } },
        }),
      );

      await expect(
        service.createAppointment({
          patientId: "p-001",
          practitionerId: "prac-001",
          start: "2026-01-01T09:00:00Z",
          end: "2026-01-01T09:30:00Z",
        }),
      ).rejects.toThrow("FHIR Validation Failed: bad code");
    });
  });

  // ─── updateAppointment ────────────────────────────────────────────────────

  describe("updateAppointment", () => {
    it("throws when appointmentId is missing", async () => {
      await expect(service.updateAppointment(null, {})).rejects.toThrow(
        "Appointment ID is required",
      );
    });

    it("throws when existing appointment is not found", async () => {
      mockFhirApi.get.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.updateAppointment("appt-001", {})).rejects.toThrow(
        "Appointment appt-001 not found",
      );
    });

    it("merges and PUTs to FHIR", async () => {
      const existing = { id: "appt-001", status: "booked" };
      const updated = { id: "appt-001", status: "fulfilled" };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: updated });

      const result = await service.updateAppointment("appt-001", { status: "fulfilled" });

      expect(mockFhirApi.put).toHaveBeenCalledWith(
        "/Appointment/appt-001",
        expect.objectContaining({ resourceType: "Appointment", id: "appt-001" }),
      );
      expect(result).toBe(updated);
    });

    it("updates slot to free when appointment is cancelled", async () => {
      const existing = {
        id: "appt-001",
        status: "booked",
        slot: [{ reference: "Slot/slot-001" }],
      };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: { id: "appt-001", status: "cancelled" } });

      await service.updateAppointment("appt-001", { status: "cancelled" });

      expect(slotService.updateSlot).toHaveBeenCalledWith("slot-001", { status: "free" });
    });

    it("does not update slot when appointment was already cancelled", async () => {
      const existing = {
        id: "appt-001",
        status: "cancelled",
        slot: [{ reference: "Slot/slot-001" }],
      };
      mockFhirApi.get.mockResolvedValue({ data: existing });
      mockFhirApi.put.mockResolvedValue({ data: { id: "appt-001", status: "cancelled" } });

      await service.updateAppointment("appt-001", { status: "cancelled" });

      expect(slotService.updateSlot).not.toHaveBeenCalled();
    });

    it("invalidates appointment cache after update", async () => {
      mockFhirApi.get.mockResolvedValue({ data: { id: "appt-001", status: "booked" } });
      mockFhirApi.put.mockResolvedValue({ data: { id: "appt-001" } });

      await service.updateAppointment("appt-001", {});

      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("appointment:appt-001");
    });
  });

  // ─── deleteAppointment ────────────────────────────────────────────────────

  describe("deleteAppointment", () => {
    it("throws when appointmentId is missing", async () => {
      await expect(service.deleteAppointment(null)).rejects.toThrow(
        "Appointment ID is required",
      );
    });

    it("deletes from FHIR and invalidates cache", async () => {
      mockFhirApi.delete.mockResolvedValue({});

      const result = await service.deleteAppointment("appt-001");

      expect(mockFhirApi.delete).toHaveBeenCalledWith("/Appointment/appt-001");
      expect(cacheHelper.deleteFromCache).toHaveBeenCalledWith("appointment:appt-001");
      expect(result).toEqual({
        success: true,
        message: "Appointment deleted successfully",
      });
    });

    it("throws 'Appointment not found' on 404", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("not found"), { response: { status: 404 } }),
      );

      await expect(service.deleteAppointment("appt-001")).rejects.toThrow(
        "Appointment not found",
      );
    });

    it("throws on non-404 FHIR error", async () => {
      mockFhirApi.delete.mockRejectedValue(
        Object.assign(new Error("server error"), { response: { status: 500 } }),
      );

      await expect(service.deleteAppointment("appt-001")).rejects.toThrow(
        "Could not delete appointment.",
      );
    });
  });
});
