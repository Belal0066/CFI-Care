jest.mock("axios", () => {
  const mockInstance = { get: jest.fn(), put: jest.fn() };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});
jest.mock("../src/Nodejs/middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn(),
  invalidateConditionCache: jest.fn(),
  deleteFromCache: jest.fn(),
  CACHE_EXPIRATION: { CONDITION: 86400 },
}));

const axios = require("axios");

let mockAxiosInstance;
let conditionService;

describe("Condition Service - Integration Tests", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAxiosInstance = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockAxiosInstance);
    conditionService = require("../src/Nodejs/condition/conditionService");
  });

  describe("getConditionsByPatientId", () => {
    it("should fetch all conditions for a patient", async () => {
      const mockConditions = {
        resourceType: "Bundle",
        entry: [
          {
            resource: {
              resourceType: "Condition",
              id: "cond-001",
              subject: { reference: "Patient/patient-001" },
              code: { text: "Diabetes" },
            },
          },
          {
            resource: {
              resourceType: "Condition",
              id: "cond-002",
              subject: { reference: "Patient/patient-001" },
              code: { text: "Hypertension" },
            },
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockConditions });

      const result =
        await conditionService.getConditionsByPatientId("patient-001");

      expect(result).toEqual(mockConditions);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/Condition?subject=Patient/patient-001",
      );
    });

    it("should return empty bundle if no conditions found", async () => {
      const emptyBundle = {
        resourceType: "Bundle",
        total: 0,
        entry: [],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: emptyBundle });

      const result = await conditionService.getConditionsByPatientId(
        "patient-no-conditions",
      );

      expect(result.entry.length).toBe(0);
    });
  });

  describe("createConditionWithSpecificId", () => {
    it("should create a new condition", async () => {
      const conditionData = {
        id: "cond-new-001",
        resourceType: "Condition",
        subject: { reference: "Patient/patient-001" },
        code: {
          coding: [{ system: "http://snomed.info/sct", code: "11850006" }],
        },
      };

      mockAxiosInstance.put.mockResolvedValueOnce({ data: conditionData });

      const result =
        await conditionService.createConditionWithSpecificId(conditionData);

      expect(result).toEqual(conditionData);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/Condition/${conditionData.id}`,
        expect.any(Object),
      );
    });
  });

  describe("updateCondition", () => {
    it("should update an existing condition", async () => {
      const existingCondition = {
        id: "cond-001",
        resourceType: "Condition",
      };
      const updatedCondition = {
        ...existingCondition,
        clinicalStatus: { coding: [{ code: "resolved" }] },
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: existingCondition });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: updatedCondition });

      const result = await conditionService.updateCondition(
        "cond-001",
        updatedCondition,
      );

      expect(result).toEqual(updatedCondition);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/Condition/cond-001`,
        expect.any(Object),
      );
    });
  });
});
