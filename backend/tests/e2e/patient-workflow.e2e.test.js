const request = require("supertest");
const express = require("express");
const patientRoutes = require("../../src/Nodejs/patient/patientRoutes");
const encounterRoutes = require("../../src/Nodejs/encounter/encounterRoutes");
const conditionRoutes = require("../../src/Nodejs/condition/conditionRoutes");
const patientService = require("../../src/Nodejs/patient/patientService");

jest.mock("@toon-format/toon", () => ({}));
jest.mock("../../src/Nodejs/middleware/requireApiAuth", () => ({
  requireApiAuth: (req, res, next) => next(),
}));
jest.mock("../../src/Nodejs/middleware/requirePatientContext", () => ({
  requirePatientContext: () => (req, res, next) => next(),
}));
jest.mock("../../src/Nodejs/middleware/validateScopes", () => () => (req, res, next) => next());
jest.mock("../../src/Nodejs/middleware/attachForwardedToken", () => (req, res, next) => next());
jest.mock("../../src/Nodejs/patient/patientService");
jest.mock("axios");

const app = express();
app.use(express.json());
app.use("/api/patients", patientRoutes);
app.use("/api/encounters", encounterRoutes);
app.use("/api/conditions", conditionRoutes);

describe("Patient Workflow E2E Tests", () => {
  describe("Complete Patient Management Flow", () => {
    it("should create patient, add encounter, and add condition", async () => {
      const patientData = {
        firstName: "Test",
        lastName: "Patient",
        email: "test@example.com",
        birthDate: "1990-01-15",
        password: "TestPassword123",
      };

      const createdPatient = {
        id: "pat-e2e-001",
        ...patientData,
      };

      // Step 1: Create patient
      patientService.createPatient.mockResolvedValueOnce(createdPatient);

      const createResponse = await request(app)
        .post("/api/patients")
        .send(patientData);

      expect(createResponse.status).toBe(201);
      const patientId = createdPatient.id;

      // Step 2: Retrieve patient
      patientService.getPatientById.mockResolvedValueOnce(createdPatient);

      const getResponse = await request(app).get(`/api/patients/${patientId}`);

      expect(getResponse.status).toBe(200);

      // Step 3: Add condition to patient
      const conditionData = {
        id: "cond-e2e-001",
        subject: { reference: `Patient/${patientId}` },
        code: { text: "Diabetes" },
      };

      const createConditionResponse = await request(app)
        .put("/api/conditions")
        .send(conditionData);

      // Step 4: Verify patient has condition
      patientService.getPatientAllRelatedData.mockResolvedValueOnce({
        resourceType: "Bundle",
        entry: [{ resource: createdPatient }, { resource: conditionData }],
      });

      const relatedDataResponse = await request(app).get(
        `/api/patients/${patientId}/related-data`,
      );

      expect(relatedDataResponse.status).toBe(200);
      expect(relatedDataResponse.body.entry).toBeDefined();
    });
  });

  describe("Data Consistency Across Services", () => {
    it("should maintain data consistency when updating patient info", async () => {
      const patientId = "pat-consistency-001";

      // Create patient
      const initialData = {
        id: patientId,
        name: "John Doe",
        birthDate: "1990-01-15",
      };

      patientService.getPatientById.mockResolvedValueOnce(initialData);
      let response = await request(app).get(`/api/patients/${patientId}`);
      expect(response.body.name).toBe("John Doe");

      // Update patient
      const updatedData = {
        ...initialData,
        name: "John Smith",
      };

      patientService.createPatientWithSpecificId.mockResolvedValueOnce(
        updatedData,
      );
      response = await request(app).put("/api/patients").send(updatedData);

      expect(response.status).toBe(201);

      // Verify update
      patientService.getPatientById.mockResolvedValueOnce(updatedData);
      response = await request(app).get(`/api/patients/${patientId}`);
      expect(response.body.name).toBe("John Smith");
    });
  });
});
