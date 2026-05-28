jest.mock("axios", () => {
  const mockInstance = { get: jest.fn(), post: jest.fn(), put: jest.fn() };
  return { create: jest.fn(() => mockInstance), __mockInstance: mockInstance };
});
jest.mock("../../middleware/cacheHelper", () => ({
  getFromCache: jest.fn().mockResolvedValue(null),
  setInCache: jest.fn(),
  deleteFromCache: jest.fn(),
  invalidatePatientCache: jest.fn(),
  CACHE_EXPIRATION: { PATIENT: 60 },
}));

const axios = require("axios");

let mockAxiosInstance;
let patientService;
let getFromCache;
let setInCache;
let deleteFromCache;

describe("Patient Service - Integration Tests", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAxiosInstance = require("axios").__mockInstance;
    require("axios").create.mockReturnValue(mockAxiosInstance);
    ({
      getFromCache,
      setInCache,
      deleteFromCache,
    } = require("../../middleware/cacheHelper"));
    patientService = require("../../patient/patientService");
  });

  describe("getPatientById", () => {
    const patientId = "patient-001";
    const mockPatientData = {
      resourceType: "Patient",
      id: patientId,
      name: [{ given: ["John"], family: "Doe" }],
      birthDate: "1990-01-15",
    };

    it("should return cached patient data on cache hit", async () => {
      getFromCache.mockResolvedValueOnce(mockPatientData);

      const result = await patientService.getPatientById(patientId);

      expect(result).toEqual(mockPatientData);
      expect(getFromCache).toHaveBeenCalledWith(`patient:${patientId}`);
      expect(mockAxiosInstance.get).not.toHaveBeenCalled();
    });

    it("should fetch from FHIR API on cache miss", async () => {
      getFromCache.mockResolvedValueOnce(null);
      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockPatientData });
      setInCache.mockResolvedValueOnce(true);

      const result = await patientService.getPatientById(patientId);

      expect(result).toEqual(mockPatientData);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/Patient/${patientId}`,
        expect.any(Object),
      );
      expect(setInCache).toHaveBeenCalledWith(
        `patient:${patientId}`,
        mockPatientData,
        60,
      );
    });

    it("should throw error when patient not found (404)", async () => {
      getFromCache.mockResolvedValueOnce(null);
      const error = new Error("Not Found");
      error.response = { status: 404 };
      mockAxiosInstance.get.mockRejectedValueOnce(error);

      await expect(patientService.getPatientById(patientId)).rejects.toThrow(
        "Patient not found",
      );
    });

    it("should throw error when FHIR server is unavailable", async () => {
      getFromCache.mockResolvedValueOnce(null);
      const error = new Error("Connection refused");
      mockAxiosInstance.get.mockRejectedValueOnce(error);

      await expect(patientService.getPatientById(patientId)).rejects.toThrow(
        "Could not connect to the FHIR server",
      );
    });
  });

  describe("createPatient", () => {
    const patientData = {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      birthDate: "1995-05-20",
    };

    const mockCreatedPatient = {
      resourceType: "Patient",
      id: "patient-new-001",
      name: [{ given: ["Jane"], family: "Smith" }],
      contact: [{ telecom: [{ system: "email", value: "jane@example.com" }] }],
    };

    it("should successfully create a patient", async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        data: mockCreatedPatient,
      });

      const result = await patientService.createPatient(patientData);

      expect(result).toEqual(mockCreatedPatient);
      expect(mockAxiosInstance.post).toHaveBeenCalled();
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        "/Patient",
        expect.any(Object),
      );
    });

    it("should handle FHIR validation errors", async () => {
      const error = new Error("Validation error");
      error.response = {
        status: 400,
        data: {
          issue: [{ diagnostics: "Invalid date format" }],
        },
      };
      mockAxiosInstance.post.mockRejectedValueOnce(error);

      await expect(patientService.createPatient(patientData)).rejects.toThrow(
        "FHIR server rejected the patient resource. Check data.",
      );
    });
  });

  describe("createPatientWithSpecificId", () => {
    it("should throw error if patient ID is missing", async () => {
      const patientData = {
        name: [{ given: ["John"], family: "Doe" }],
      };

      await expect(
        patientService.createPatientWithSpecificId(patientData),
      ).rejects.toThrow("missing the required 'id' field");
    });

    it("should create patient with specific ID", async () => {
      const patientData = {
        id: "custom-patient-id",
        resourceType: "Patient",
        name: [{ given: ["John"], family: "Doe" }],
      };

      mockAxiosInstance.put.mockResolvedValueOnce({ data: patientData });
      deleteFromCache.mockResolvedValueOnce(true);

      const result =
        await patientService.createPatientWithSpecificId(patientData);

      expect(result).toEqual(patientData);
      expect(mockAxiosInstance.put).toHaveBeenCalledWith(
        `/Patient/custom-patient-id`,
        expect.any(Object),
      );
    });
  });

  describe("getPatientAllRelatedData", () => {
    it("should fetch all related patient resources", async () => {
      const mockBundle = {
        resourceType: "Bundle",
        entry: [
          { resource: { resourceType: "Patient", id: "patient-001" } },
          { resource: { resourceType: "Condition", id: "cond-001" } },
          { resource: { resourceType: "Encounter", id: "enc-001" } },
        ],
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockBundle });

      const result =
        await patientService.getPatientAllRelatedData("patient-001");

      expect(result).toEqual(mockBundle);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        "/Patient/patient-001/$everything?_count=100",
      );
    });
  });
});
