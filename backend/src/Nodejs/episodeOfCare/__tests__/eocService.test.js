jest.mock("axios", () => {
  const mockInstance = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});

jest.mock("../../middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn().mockResolvedValue(undefined),
  invalidateEOCCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { EOC: 60 },
}));

let mockFhirApi;
let eocService;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  mockFhirApi = require("axios").__mockInstance;
  require("axios").create.mockReturnValue(mockFhirApi);

  const ch = require("../../middleware/cacheHelper");
  ch.getFromCache.mockResolvedValue(null);
  ch.setInCache.mockResolvedValue(undefined);
  ch.invalidateEOCCache.mockResolvedValue(undefined);
  ch.CACHE_EXPIRATION = { EOC: 60 };

  eocService = require("../eocService");
});

// ─── getEpisodeOfCareById ────────────────────────────────────────────────────

describe("getEpisodeOfCareById", () => {
  const eocId = "eoc-001";
  const mockEoc = { resourceType: "EpisodeOfCare", id: eocId, status: "active" };

  it("returns cached data without calling FHIR on cache hit", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(mockEoc);

    const result = await eocService.getEpisodeOfCareById(eocId);

    expect(result).toEqual(mockEoc);
    expect(getFromCache).toHaveBeenCalledWith(`eoc:${eocId}`);
    expect(mockFhirApi.get).not.toHaveBeenCalled();
  });

  it("fetches from FHIR, caches result, and returns data on cache miss", async () => {
    const { setInCache } = require("../../middleware/cacheHelper");
    mockFhirApi.get.mockResolvedValueOnce({ data: mockEoc });

    const result = await eocService.getEpisodeOfCareById(eocId);

    expect(result).toEqual(mockEoc);
    expect(mockFhirApi.get).toHaveBeenCalledWith(`/EpisodeOfCare/${eocId}`);
    expect(setInCache).toHaveBeenCalledWith(`eoc:${eocId}`, mockEoc, 60);
  });

  it("throws 'EpisodeOfCare not found' when FHIR returns 404", async () => {
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.get.mockRejectedValueOnce(error);

    await expect(eocService.getEpisodeOfCareById(eocId)).rejects.toThrow(
      "EpisodeOfCare not found",
    );
  });

  it("throws 'Could not connect to the FHIR server.' on network error", async () => {
    mockFhirApi.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(eocService.getEpisodeOfCareById(eocId)).rejects.toThrow(
      "Could not connect to the FHIR server.",
    );
  });
});

// ─── getEpisodeOfCareByPatient ───────────────────────────────────────────────

describe("getEpisodeOfCareByPatient", () => {
  const patientId = "patient-001";
  const mockResources = [
    { resourceType: "EpisodeOfCare", id: "eoc-001" },
    { resourceType: "EpisodeOfCare", id: "eoc-002" },
  ];

  it("returns cached data without calling FHIR on cache hit", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(mockResources);

    const result = await eocService.getEpisodeOfCareByPatient(patientId);

    expect(result).toEqual(mockResources);
    expect(mockFhirApi.get).not.toHaveBeenCalled();
  });

  it("fetches FHIR with patient param, maps entry resources, and caches on cache miss", async () => {
    const { setInCache } = require("../../middleware/cacheHelper");
    mockFhirApi.get.mockResolvedValueOnce({
      data: { entry: mockResources.map((r) => ({ resource: r })) },
    });

    const result = await eocService.getEpisodeOfCareByPatient(patientId);

    expect(result).toEqual(mockResources);
    expect(mockFhirApi.get).toHaveBeenCalledWith(
      "/EpisodeOfCare",
      expect.objectContaining({
        params: { patient: `Patient/${patientId}` },
      }),
    );
    expect(setInCache).toHaveBeenCalledWith(
      `eoc:patient:${patientId}`,
      mockResources,
      60,
    );
  });

  it("returns empty array when FHIR response has no entry field", async () => {
    mockFhirApi.get.mockResolvedValueOnce({ data: {} });

    const result = await eocService.getEpisodeOfCareByPatient(patientId);

    expect(result).toEqual([]);
  });

  it("throws 'Could not connect to the FHIR server.' on error", async () => {
    mockFhirApi.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(eocService.getEpisodeOfCareByPatient(patientId)).rejects.toThrow(
      "Could not connect to the FHIR server.",
    );
  });
});

// ─── getEncountersByEpisodeOfCareId ──────────────────────────────────────────

describe("getEncountersByEpisodeOfCareId", () => {
  const eocId = "eoc-001";
  const mockEncounters = [
    { resourceType: "Encounter", id: "enc-001" },
    { resourceType: "Encounter", id: "enc-002" },
  ];

  it("returns cached data without calling FHIR on cache hit", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(mockEncounters);

    const result = await eocService.getEncountersByEpisodeOfCareId(eocId);

    expect(result).toEqual(mockEncounters);
    expect(mockFhirApi.get).not.toHaveBeenCalled();
  });

  it("fetches /Encounter with episode-of-care param and maps entry resources on miss", async () => {
    const { setInCache } = require("../../middleware/cacheHelper");
    mockFhirApi.get.mockResolvedValueOnce({
      data: { entry: mockEncounters.map((e) => ({ resource: e })) },
    });

    const result = await eocService.getEncountersByEpisodeOfCareId(eocId);

    expect(result).toEqual(mockEncounters);
    expect(mockFhirApi.get).toHaveBeenCalledWith(
      `/Encounter`,
      expect.objectContaining({ params: { "episode-of-care": eocId } }),
    );
    expect(setInCache).toHaveBeenCalledWith(
      `encounters:eoc:${eocId}`,
      mockEncounters,
      60,
    );
  });

  it("returns empty array when FHIR bundle has no entry field", async () => {
    mockFhirApi.get.mockResolvedValueOnce({ data: {} });

    const result = await eocService.getEncountersByEpisodeOfCareId(eocId);

    expect(result).toEqual([]);
  });

  it("throws 'Could not connect to the FHIR server.' on error", async () => {
    mockFhirApi.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      eocService.getEncountersByEpisodeOfCareId(eocId),
    ).rejects.toThrow("Could not connect to the FHIR server.");
  });
});

// ─── createEpisodeOfCareWithSpecificId ───────────────────────────────────────

describe("createEpisodeOfCareWithSpecificId", () => {
  const eocData = {
    id: "eoc-new-001",
    status: "active",
    patient: { reference: "Patient/patient-001" },
  };
  const mockResponse = {
    data: { resourceType: "EpisodeOfCare", id: "eoc-new-001" },
    headers: { etag: '"W/\\"1\\""' },
  };

  it("throws when eocData argument is null or undefined", async () => {
    await expect(eocService.createEpisodeOfCareWithSpecificId(null)).rejects.toThrow(
      "createEpisodeOfCareWithSpecificId Error: 'eocData' argument is missing or undefined.",
    );
    await expect(eocService.createEpisodeOfCareWithSpecificId(undefined)).rejects.toThrow(
      "createEpisodeOfCareWithSpecificId Error: 'eocData' argument is missing or undefined.",
    );
  });

  it("throws 'EpisodeOfCare ID is required inside the data object' when id is missing", async () => {
    await expect(
      eocService.createEpisodeOfCareWithSpecificId({ status: "active" }),
    ).rejects.toThrow("EpisodeOfCare ID is required inside the data object");
  });

  it("calls FHIR PUT /EpisodeOfCare/<id> with required fields only", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await eocService.createEpisodeOfCareWithSpecificId(eocData);

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      `/EpisodeOfCare/${eocData.id}`,
      expect.objectContaining({
        resourceType: "EpisodeOfCare",
        id: eocData.id,
        status: "active",
        patient: eocData.patient,
      }),
    );
  });

  it("omits type field when type is an empty array", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await eocService.createEpisodeOfCareWithSpecificId({ ...eocData, type: [] });

    const body = mockFhirApi.put.mock.calls[0][1];
    expect(body).not.toHaveProperty("type");
  });

  it("includes type field when type is a non-empty array", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);
    const typeData = [{ coding: [{ code: "hacc" }] }];

    await eocService.createEpisodeOfCareWithSpecificId({ ...eocData, type: typeData });

    const body = mockFhirApi.put.mock.calls[0][1];
    expect(body.type).toEqual(typeData);
  });

  it("omits diagnosis field when diagnosis is an empty array", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await eocService.createEpisodeOfCareWithSpecificId({ ...eocData, diagnosis: [] });

    const body = mockFhirApi.put.mock.calls[0][1];
    expect(body).not.toHaveProperty("diagnosis");
  });

  it("omits period field when period is an empty object", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await eocService.createEpisodeOfCareWithSpecificId({ ...eocData, period: {} });

    const body = mockFhirApi.put.mock.calls[0][1];
    expect(body).not.toHaveProperty("period");
  });

  it("includes period field when period has keys", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);
    const period = { start: "2025-01-01" };

    await eocService.createEpisodeOfCareWithSpecificId({ ...eocData, period });

    const body = mockFhirApi.put.mock.calls[0][1];
    expect(body.period).toEqual(period);
  });

  it("returns { data, eocVersion } where eocVersion comes from etag header", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    const result = await eocService.createEpisodeOfCareWithSpecificId(eocData);

    expect(result).toEqual({
      data: mockResponse.data,
      eocVersion: mockResponse.headers.etag,
    });
  });

  it("calls invalidateEOCCache with eocId and patientId from patient.reference", async () => {
    const { invalidateEOCCache } = require("../../middleware/cacheHelper");
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await eocService.createEpisodeOfCareWithSpecificId(eocData);

    expect(invalidateEOCCache).toHaveBeenCalledWith("eoc-new-001", "patient-001");
  });

  it("throws 'FHIR Validation Failed: <diagnostics>' on FHIR 400 with issues", async () => {
    const error = Object.assign(new Error("Bad Request"), {
      response: {
        status: 400,
        data: { issue: [{ diagnostics: "Missing required field: patient" }] },
      },
    });
    mockFhirApi.put.mockRejectedValueOnce(error);

    await expect(
      eocService.createEpisodeOfCareWithSpecificId(eocData),
    ).rejects.toThrow("FHIR Validation Failed: Missing required field: patient");
  });

  it("throws 'Could not connect to the FHIR server.' on network error", async () => {
    mockFhirApi.put.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      eocService.createEpisodeOfCareWithSpecificId(eocData),
    ).rejects.toThrow("Could not connect to the FHIR server.");
  });
});

// ─── updateEpisodeOfCare ─────────────────────────────────────────────────────

describe("updateEpisodeOfCare", () => {
  const eocId = "eoc-update-001";
  const existingEoc = {
    resourceType: "EpisodeOfCare",
    id: eocId,
    status: "active",
    patient: { reference: "Patient/patient-001" },
  };
  const updateFields = { status: "finished" };
  const mockPutResponse = {
    data: { resourceType: "EpisodeOfCare", id: eocId, status: "finished" },
  };

  it("throws 'EpisodeOfCare ID is required' when eocId is falsy", async () => {
    await expect(eocService.updateEpisodeOfCare(null, updateFields)).rejects.toThrow(
      "EpisodeOfCare ID is required",
    );
  });

  it("throws 'EpisodeOfCare <id> not found' when getEpisodeOfCareById fails", async () => {
    const notFoundError = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.get.mockRejectedValueOnce(notFoundError);

    await expect(
      eocService.updateEpisodeOfCare(eocId, updateFields),
    ).rejects.toThrow(`EpisodeOfCare ${eocId} not found`);
  });

  it("merges existing EOC data with update fields before PUT", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    await eocService.updateEpisodeOfCare(eocId, updateFields);

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      `/EpisodeOfCare/${eocId}`,
      expect.objectContaining({
        ...existingEoc,
        ...updateFields,
        resourceType: "EpisodeOfCare",
        id: eocId,
      }),
    );
  });

  it("returns response.data on successful update", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    const result = await eocService.updateEpisodeOfCare(eocId, updateFields);

    expect(result).toEqual(mockPutResponse.data);
  });

  it("calls invalidateEOCCache with eocId and patientId when patient reference present", async () => {
    const { getFromCache, invalidateEOCCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    await eocService.updateEpisodeOfCare(eocId, updateFields);

    expect(invalidateEOCCache).toHaveBeenCalledWith(eocId, "patient-001");
  });

  it("calls invalidateEOCCache with only eocId when merged data has no patient reference", async () => {
    const { getFromCache, invalidateEOCCache } = require("../../middleware/cacheHelper");
    const eocWithoutPatient = { resourceType: "EpisodeOfCare", id: eocId, status: "active" };
    getFromCache.mockResolvedValueOnce(eocWithoutPatient);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    await eocService.updateEpisodeOfCare(eocId, updateFields);

    expect(invalidateEOCCache).toHaveBeenCalledWith(eocId);
  });

  it("throws 'FHIR Validation Failed: <issue>' when FHIR PUT returns an error with issues", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    const error = Object.assign(new Error("Bad Request"), {
      response: {
        status: 400,
        data: { issue: [{ diagnostics: "Status transition invalid" }] },
      },
    });
    mockFhirApi.put.mockRejectedValueOnce(error);

    await expect(
      eocService.updateEpisodeOfCare(eocId, updateFields),
    ).rejects.toThrow("FHIR Validation Failed: Status transition invalid");
  });

  it("throws 'Could not connect to the FHIR server.' on network error during PUT", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    mockFhirApi.put.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      eocService.updateEpisodeOfCare(eocId, updateFields),
    ).rejects.toThrow("Could not connect to the FHIR server.");
  });
});

// ─── deleteEpisodeOfCare ─────────────────────────────────────────────────────

describe("deleteEpisodeOfCare", () => {
  const eocId = "eoc-del-001";
  const existingEoc = {
    resourceType: "EpisodeOfCare",
    id: eocId,
    patient: { reference: "Patient/patient-001" },
  };

  it("throws 'EpisodeOfCare ID is required' when eocId is falsy", async () => {
    await expect(eocService.deleteEpisodeOfCare(null)).rejects.toThrow(
      "EpisodeOfCare ID is required",
    );
  });

  it("returns { success: true, id } on successful deletion", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    mockFhirApi.delete.mockResolvedValueOnce({ status: 204 });

    const result = await eocService.deleteEpisodeOfCare(eocId);

    expect(result).toEqual({ success: true, id: eocId });
  });

  it("calls invalidateEOCCache with eocId and patientId after successful deletion", async () => {
    const { getFromCache, invalidateEOCCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    mockFhirApi.delete.mockResolvedValueOnce({ status: 204 });

    await eocService.deleteEpisodeOfCare(eocId);

    expect(invalidateEOCCache).toHaveBeenCalledWith(eocId, "patient-001");
  });

  it("calls invalidateEOCCache with only eocId when patient fetch fails", async () => {
    const { getFromCache, invalidateEOCCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(null);
    const notFoundError = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    // First get (for pre-fetch) fails, delete succeeds
    mockFhirApi.get.mockRejectedValueOnce(notFoundError);
    mockFhirApi.delete.mockResolvedValueOnce({ status: 204 });

    await eocService.deleteEpisodeOfCare(eocId);

    expect(invalidateEOCCache).toHaveBeenCalledWith(eocId);
  });

  it("returns { success: true, id, alreadyDeleted: true } when FHIR DELETE returns 404", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.delete.mockRejectedValueOnce(error);

    const result = await eocService.deleteEpisodeOfCare(eocId);

    expect(result).toEqual({ success: true, id: eocId, alreadyDeleted: true });
  });

  it("calls invalidateEOCCache when FHIR DELETE returns 404", async () => {
    const { getFromCache, invalidateEOCCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.delete.mockRejectedValueOnce(error);

    await eocService.deleteEpisodeOfCare(eocId);

    expect(invalidateEOCCache).toHaveBeenCalledWith(eocId);
  });

  it("throws 'Could not delete EpisodeOfCare.' for non-404 FHIR errors", async () => {
    const { getFromCache } = require("../../middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEoc);
    const error = Object.assign(new Error("Server Error"), {
      response: { status: 500, data: {} },
    });
    mockFhirApi.delete.mockRejectedValueOnce(error);

    await expect(eocService.deleteEpisodeOfCare(eocId)).rejects.toThrow(
      "Could not delete EpisodeOfCare.",
    );
  });
});
