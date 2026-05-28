const request = require("supertest");
const express = require("express");
const patientRoutes = require("../../patient/patientRoutes");
const patientController = require("../../patient/patientController");

jest.mock("@toon-format/toon", () => ({}));
jest.mock("../../middleware/requireApiAuth", () => ({
  requireApiAuth: (req, res, next) => next(),
}));
jest.mock("../../middleware/requirePatientContext", () => ({
  requirePatientContext: () => (req, res, next) => next(),
}));
jest.mock("../../middleware/validateScopes", () => () => (req, res, next) => next());
jest.mock("../../middleware/attachForwardedToken", () => (req, res, next) => next());
jest.mock("../../patient/patientController");

const app = express();
app.use(express.json());
app.use("/api/patients", patientRoutes);

describe("Patient API Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/patients", () => {
    it("should return all patients", async () => {
      const mockPatients = [
        { id: "pat-001", name: "John Doe" },
        { id: "pat-002", name: "Jane Smith" },
      ];

      patientController.getAllPatients.mockImplementation((req, res) => {
        res.status(200).json(mockPatients);
      });

      const response = await request(app).get("/api/patients");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPatients);
    });
  });

  describe("POST /api/patients", () => {
    it("should create a new patient with valid data", async () => {
      const newPatient = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      };

      const createdPatient = {
        id: "pat-new-001",
        ...newPatient,
      };

      patientController.createPatient.mockImplementation((req, res) => {
        res.status(201).json(createdPatient);
      });

      const response = await request(app)
        .post("/api/patients")
        .send(newPatient)
        .set("Content-Type", "application/json");

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdPatient);
    });

    it("should reject invalid patient data", async () => {
      const invalidPatient = {
        firstName: "J", // Too short
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      };

      const response = await request(app)
        .post("/api/patients")
        .send(invalidPatient)
        .set("Content-Type", "application/json");

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/patients/:id", () => {
    it("should return patient by ID", async () => {
      const mockPatient = {
        resourceType: "Patient",
        id: "patient-001",
        name: [{ given: ["John"], family: "Doe" }],
      };

      patientController.getPatientById.mockImplementation((req, res) => {
        res.status(200).json(mockPatient);
      });

      const response = await request(app).get("/api/patients/patient-001");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPatient);
    });

    it("should return 404 for non-existent patient", async () => {
      patientController.getPatientById.mockImplementation((req, res) => {
        res.status(404).json({ error: "Patient not found" });
      });

      const response = await request(app).get("/api/patients/nonexistent");

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/patients/toon-everything/:id", () => {
    it("should export patient data in TOON format", async () => {
      patientController.toonPatientEverything.mockImplementation((req, res) => {
        res.setHeader("Content-Type", "text/plain");
        res.status(200).send("TOON formatted data");
      });

      const response = await request(app).get(
        "/api/patients/toon-everything/patient-001",
      );

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/plain");
    });
  });

  describe("GET /api/patients/:id/related-data", () => {
    it("should return all related patient resources", async () => {
      const mockRelatedData = {
        patient: { id: "patient-001" },
        encounters: [],
        conditions: [],
        observations: [],
      };

      patientController.getPatientAllRelatedData.mockImplementation(
        (req, res) => {
          res.status(200).json(mockRelatedData);
        },
      );

      const response = await request(app).get(
        "/api/patients/patient-001/related-data",
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRelatedData);
    });
  });

  describe("PUT /api/patients", () => {
    it("should create patient with specific ID", async () => {
      const patientData = {
        id: "custom-id",
        name: [{ given: ["Jane"], family: "Smith" }],
      };

      patientController.createPatientWithSpecificId.mockImplementation(
        (req, res) => {
          res.status(201).json(patientData);
        },
      );

      const response = await request(app)
        .put("/api/patients")
        .send(patientData)
        .set("Content-Type", "application/json");

      expect(response.status).toBe(201);
    });
  });

  describe("GET /api/patients/me", () => {
    it("should return the current authenticated patient", async () => {
      const mockPatient = {
        resourceType: "Patient",
        id: "patient-me",
        name: [{ given: ["John"], family: "Doe" }],
      };

      patientController.getCurrentPatient.mockImplementation((req, res) => {
        res.status(200).json(mockPatient);
      });

      const response = await request(app).get("/api/patients/me");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPatient);
    });
  });
});
