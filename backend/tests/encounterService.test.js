jest.mock("axios", () => {
  const mockInstance = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});

jest.mock("../src/Nodejs/middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn().mockResolvedValue(undefined),
  invalidateEncounterCache: jest.fn().mockResolvedValue(undefined),
  CACHE_EXPIRATION: { ENCOUNTER: 60 },
}));

const axios = require("axios");
const cacheHelper = require("../src/Nodejs/middleware/cacheHelper");

let mockFhirApi;
let encounterService;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();

  mockFhirApi = require("axios").__mockInstance;
  require("axios").create.mockReturnValue(mockFhirApi);

  const ch = require("../src/Nodejs/middleware/cacheHelper");
  ch.getFromCache.mockResolvedValue(null);
  ch.setInCache.mockResolvedValue(undefined);
  ch.invalidateEncounterCache.mockResolvedValue(undefined);
  ch.CACHE_EXPIRATION = { ENCOUNTER: 60 };

  encounterService = require("../src/Nodejs/encounter/encounterService");
});

// ─── getEncounterById ────────────────────────────────────────────────────────

describe("getEncounterById", () => {
  const encounterId = "enc-001";
  const mockEncounter = {
    resourceType: "Encounter",
    id: encounterId,
    status: "finished",
  };

  it("returns cached data without calling FHIR when cache hit", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(mockEncounter);

    const result = await encounterService.getEncounterById(encounterId);

    expect(result).toEqual(mockEncounter);
    expect(getFromCache).toHaveBeenCalledWith(`encounter:${encounterId}`);
    expect(mockFhirApi.get).not.toHaveBeenCalled();
  });

  it("fetches from FHIR, caches result, and returns data on cache miss", async () => {
    const { getFromCache, setInCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(null);
    mockFhirApi.get.mockResolvedValueOnce({ data: mockEncounter });

    const result = await encounterService.getEncounterById(encounterId);

    expect(result).toEqual(mockEncounter);
    expect(mockFhirApi.get).toHaveBeenCalledWith(`/Encounter/${encounterId}`);
    expect(setInCache).toHaveBeenCalledWith(
      `encounter:${encounterId}`,
      mockEncounter,
      60,
    );
  });

  it("throws 'Encounter not found' when FHIR returns 404", async () => {
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.get.mockRejectedValueOnce(error);

    await expect(encounterService.getEncounterById(encounterId)).rejects.toThrow(
      "Encounter not found",
    );
  });

  it("throws 'Could not connect to the FHIR server.' on network error", async () => {
    mockFhirApi.get.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(encounterService.getEncounterById(encounterId)).rejects.toThrow(
      "Could not connect to the FHIR server.",
    );
  });
});

// ─── getEncounterEverything ──────────────────────────────────────────────────

describe("getEncounterEverything", () => {
  const encounterId = "enc-001";
  const resources = [
    { resourceType: "Condition", id: "cond-001" },
    { resourceType: "Observation", id: "obs-001" },
  ];

  it("returns cached data without calling FHIR on cache hit", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(resources);

    const result = await encounterService.getEncounterEverything(encounterId);

    expect(result).toEqual(resources);
    expect(mockFhirApi.get).not.toHaveBeenCalled();
  });

  it("fetches FHIR $everything, maps entry resources, and caches result", async () => {
    const { setInCache } = require("../src/Nodejs/middleware/cacheHelper");
    mockFhirApi.get.mockResolvedValueOnce({
      data: { entry: resources.map((r) => ({ resource: r })) },
    });

    const result = await encounterService.getEncounterEverything(encounterId);

    expect(result).toEqual(resources);
    expect(mockFhirApi.get).toHaveBeenCalledWith(
      `/Encounter/${encounterId}/$everything`,
    );
    expect(setInCache).toHaveBeenCalledWith(
      `encounter:${encounterId}:everything`,
      resources,
      60,
    );
  });

  it("returns empty array when FHIR response has no entry field", async () => {
    mockFhirApi.get.mockResolvedValueOnce({ data: {} });

    const result = await encounterService.getEncounterEverything(encounterId);

    expect(result).toEqual([]);
  });

  it("throws 'Could not connect to the FHIR server.' on any error", async () => {
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.get.mockRejectedValueOnce(error);

    await expect(
      encounterService.getEncounterEverything(encounterId),
    ).rejects.toThrow("Could not connect to the FHIR server.");
  });
});

// ─── createEncounterWithSpecificId ───────────────────────────────────────────

describe("createEncounterWithSpecificId", () => {
  const encounterData = {
    id: "enc-new-001",
    status: "finished",
    subject: { reference: "Patient/patient-001" },
  };
  const mockResponse = {
    data: { resourceType: "Encounter", id: "enc-new-001" },
  };

  it("throws 'Encounter ID is required' when encounterData.id is missing", async () => {
    await expect(
      encounterService.createEncounterWithSpecificId({ status: "finished" }),
    ).rejects.toThrow("Encounter ID is required");
  });

  it("calls FHIR PUT /Encounter/<id> with resourceType included", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await encounterService.createEncounterWithSpecificId(encounterData);

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      `/Encounter/${encounterData.id}`,
      expect.objectContaining({ resourceType: "Encounter", id: encounterData.id }),
    );
  });

  it("returns { data, id } on success", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    const result = await encounterService.createEncounterWithSpecificId(encounterData);

    expect(result).toEqual({
      data: mockResponse.data,
      id: mockResponse.data.id,
    });
  });

  it("calls invalidateEncounterCache with encounterId and patientId from subject.reference", async () => {
    const { invalidateEncounterCache } = require("../src/Nodejs/middleware/cacheHelper");
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await encounterService.createEncounterWithSpecificId(encounterData);

    expect(invalidateEncounterCache).toHaveBeenCalledWith("enc-new-001", "patient-001");
  });

  it("calls invalidateEncounterCache with only encounterId when no subject reference", async () => {
    const { invalidateEncounterCache } = require("../src/Nodejs/middleware/cacheHelper");
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await encounterService.createEncounterWithSpecificId({ id: "enc-new-001" });

    expect(invalidateEncounterCache).toHaveBeenCalledWith("enc-new-001", undefined);
  });

  it("throws 'FHIR Validation Failed: <diagnostics>' when FHIR returns 400 with issues array", async () => {
    const error = Object.assign(new Error("Bad Request"), {
      response: {
        status: 400,
        data: { issue: [{ diagnostics: "Invalid status value" }] },
      },
    });
    mockFhirApi.put.mockRejectedValueOnce(error);

    await expect(
      encounterService.createEncounterWithSpecificId(encounterData),
    ).rejects.toThrow("FHIR Validation Failed: Invalid status value");
  });

  it("throws 'FHIR Validation Failed: <statusText>' when FHIR error has no issues array", async () => {
    const error = Object.assign(new Error("Unprocessable"), {
      response: { status: 422, statusText: "Unprocessable Entity", data: {} },
    });
    mockFhirApi.put.mockRejectedValueOnce(error);

    await expect(
      encounterService.createEncounterWithSpecificId(encounterData),
    ).rejects.toThrow("FHIR Validation Failed: Unprocessable Entity");
  });

  it("throws 'Could not connect to the FHIR server.' on network error", async () => {
    mockFhirApi.put.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      encounterService.createEncounterWithSpecificId(encounterData),
    ).rejects.toThrow("Could not connect to the FHIR server.");
  });
});

// ─── createEncounterWithSpecificIdForEOC ─────────────────────────────────────

describe("createEncounterWithSpecificIdForEOC", () => {
  const patientId = "patient-001";
  const episodeOfCareId = "eoc-001";
  const encounterData = { id: "enc-eoc-001", status: "in-progress" };
  const mockResponse = {
    data: { resourceType: "Encounter", id: "enc-eoc-001" },
  };

  it("throws 'Encounter ID is required' when encounterData.id is missing", async () => {
    await expect(
      encounterService.createEncounterWithSpecificIdForEOC(patientId, {}, episodeOfCareId),
    ).rejects.toThrow("Encounter ID is required");
  });

  it("builds resource with episodeOfCare and subject references", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await encounterService.createEncounterWithSpecificIdForEOC(
      patientId,
      encounterData,
      episodeOfCareId,
    );

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      `/Encounter/${encounterData.id}`,
      expect.objectContaining({
        episodeOfCare: [{ reference: `EpisodeOfCare/${episodeOfCareId}` }],
        subject: { reference: `Patient/${patientId}` },
      }),
    );
  });

  it("uses default status 'finished' when not provided", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await encounterService.createEncounterWithSpecificIdForEOC(
      patientId,
      { id: "enc-eoc-002" },
      episodeOfCareId,
    );

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "finished" }),
    );
  });

  it("uses default AMB class coding when class not provided", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    await encounterService.createEncounterWithSpecificIdForEOC(
      patientId,
      { id: "enc-eoc-002" },
      episodeOfCareId,
    );

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        class: expect.arrayContaining([
          expect.objectContaining({
            coding: expect.arrayContaining([
              expect.objectContaining({ code: "AMB" }),
            ]),
          }),
        ]),
      }),
    );
  });

  it("returns { data, id } on success", async () => {
    mockFhirApi.put.mockResolvedValueOnce(mockResponse);

    const result = await encounterService.createEncounterWithSpecificIdForEOC(
      patientId,
      encounterData,
      episodeOfCareId,
    );

    expect(result).toEqual({ data: mockResponse.data, id: mockResponse.data.id });
  });
});

// ─── updateEncounter ─────────────────────────────────────────────────────────

describe("updateEncounter", () => {
  const encounterId = "enc-update-001";
  const existingEncounter = {
    resourceType: "Encounter",
    id: encounterId,
    status: "in-progress",
    subject: { reference: "Patient/patient-001" },
  };
  const updatedFields = { status: "finished", priority: { code: "routine" } };
  const mockPutResponse = {
    data: { resourceType: "Encounter", id: encounterId, status: "finished" },
  };

  it("throws 'Encounter ID is required' when encounterId is falsy", async () => {
    await expect(
      encounterService.updateEncounter(null, updatedFields),
    ).rejects.toThrow("Encounter ID is required");
  });

  it("throws 'Encounter <id> not found in FHIR server' when encounter does not exist", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    const notFoundError = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    getFromCache.mockResolvedValueOnce(null);
    mockFhirApi.get.mockRejectedValueOnce(notFoundError);

    await expect(
      encounterService.updateEncounter(encounterId, updatedFields),
    ).rejects.toThrow(`Encounter ${encounterId} not found in FHIR server`);
  });

  it("merges existing encounter with updated fields before PUT", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEncounter);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    await encounterService.updateEncounter(encounterId, updatedFields);

    expect(mockFhirApi.put).toHaveBeenCalledWith(
      `/Encounter/${encounterId}`,
      expect.objectContaining({
        ...existingEncounter,
        ...updatedFields,
        resourceType: "Encounter",
        id: encounterId,
      }),
    );
  });

  it("returns { data, id } on successful update", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEncounter);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    const result = await encounterService.updateEncounter(encounterId, updatedFields);

    expect(result).toEqual({ data: mockPutResponse.data, id: mockPutResponse.data.id });
  });

  it("calls invalidateEncounterCache after successful update", async () => {
    const { getFromCache, invalidateEncounterCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEncounter);
    mockFhirApi.put.mockResolvedValueOnce(mockPutResponse);

    await encounterService.updateEncounter(encounterId, updatedFields);

    expect(invalidateEncounterCache).toHaveBeenCalledWith(encounterId, "patient-001");
  });

  it("throws 'FHIR Update Failed: <issue>' when FHIR returns error with issues", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEncounter);
    const error = Object.assign(new Error("Bad Request"), {
      response: {
        status: 400,
        data: { issue: [{ diagnostics: "Field 'status' is invalid" }] },
      },
    });
    mockFhirApi.put.mockRejectedValueOnce(error);

    await expect(
      encounterService.updateEncounter(encounterId, updatedFields),
    ).rejects.toThrow("FHIR Update Failed: Field 'status' is invalid");
  });

  it("throws 'Could not connect to the FHIR server.' on network error during update", async () => {
    const { getFromCache } = require("../src/Nodejs/middleware/cacheHelper");
    getFromCache.mockResolvedValueOnce(existingEncounter);
    mockFhirApi.put.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      encounterService.updateEncounter(encounterId, updatedFields),
    ).rejects.toThrow("Could not connect to the FHIR server.");
  });
});

// ─── deleteEncounter ─────────────────────────────────────────────────────────

describe("deleteEncounter", () => {
  const encounterId = "enc-del-001";

  it("throws 'Encounter ID is required' when encounterId is falsy", async () => {
    await expect(encounterService.deleteEncounter(null)).rejects.toThrow(
      "Encounter ID is required",
    );
  });

  it("returns { success: true, id } on successful DELETE", async () => {
    mockFhirApi.delete.mockResolvedValueOnce({ status: 204 });

    const result = await encounterService.deleteEncounter(encounterId);

    expect(result).toEqual({ success: true, id: encounterId });
  });

  it("calls invalidateEncounterCache after successful deletion", async () => {
    const { invalidateEncounterCache } = require("../src/Nodejs/middleware/cacheHelper");
    mockFhirApi.delete.mockResolvedValueOnce({ status: 204 });

    await encounterService.deleteEncounter(encounterId);

    expect(invalidateEncounterCache).toHaveBeenCalledWith(encounterId);
  });

  it("returns { success: true, id, alreadyDeleted: true } when FHIR returns 404", async () => {
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.delete.mockRejectedValueOnce(error);

    const result = await encounterService.deleteEncounter(encounterId);

    expect(result).toEqual({ success: true, id: encounterId, alreadyDeleted: true });
  });

  it("still calls invalidateEncounterCache when FHIR returns 404", async () => {
    const { invalidateEncounterCache } = require("../src/Nodejs/middleware/cacheHelper");
    const error = Object.assign(new Error("Not Found"), {
      response: { status: 404 },
    });
    mockFhirApi.delete.mockRejectedValueOnce(error);

    await encounterService.deleteEncounter(encounterId);

    expect(invalidateEncounterCache).toHaveBeenCalledWith(encounterId);
  });

  it("throws 'FHIR Deletion Failed: <issue>' for non-404 FHIR errors", async () => {
    const error = Object.assign(new Error("Conflict"), {
      response: {
        status: 409,
        data: { issue: [{ diagnostics: "Resource has dependents" }] },
      },
    });
    mockFhirApi.delete.mockRejectedValueOnce(error);

    await expect(encounterService.deleteEncounter(encounterId)).rejects.toThrow(
      "FHIR Deletion Failed: Resource has dependents",
    );
  });

  it("throws 'Could not connect to the FHIR server.' on network error", async () => {
    mockFhirApi.delete.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(encounterService.deleteEncounter(encounterId)).rejects.toThrow(
      "Could not connect to the FHIR server.",
    );
  });
});

