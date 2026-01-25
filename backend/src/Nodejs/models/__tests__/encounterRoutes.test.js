const request = require("supertest");
const express = require("express");
const encounterRoutes = require("../../encounter/encounterRoutes");
const encounterController = require("../../encounter/encounterController");

jest.mock("../../encounter/encounterController");

const app = express();
app.use(express.json());
app.use("/api/encounters", encounterRoutes);

describe("Encounter API Routes", () => {
  describe("GET /api/encounters/:id", () => {
    it("should return encounter by ID", async () => {
      const mockEncounter = {
        resourceType: "Encounter",
        id: "enc-001",
        status: "finished",
        class: { code: "office" },
      };

      encounterController.getEncounterById.mockImplementation((req, res) => {
        res.status(200).json(mockEncounter);
      });

      const response = await request(app).get("/api/encounters/enc-001");

      expect(response.status).toBe(200);
      expect(response.body.resourceType).toBe("Encounter");
    });
  });

  describe("GET /api/encounters/:id/related-data", () => {
    it("should return encounter with related resources", async () => {
      const mockEverything = {
        encounter: { id: "enc-001" },
        conditions: [],
        observations: [],
        medications: [],
      };

      encounterController.getEncounterEverything.mockImplementation(
        (req, res) => {
          res.status(200).json(mockEverything);
        },
      );

      const response = await request(app).get(
        "/api/encounters/enc-001/related-data",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("encounter");
    });
  });

  describe("PUT /api/encounters", () => {
    it("should create a new encounter", async () => {
      const newEncounter = {
        id: "enc-new-001",
        resourceType: "Encounter",
        status: "planned",
        class: { code: "office" },
      };

      encounterController.createEncounterWithSpecificId.mockImplementation(
        (req, res) => {
          res.status(201).json(newEncounter);
        },
      );

      const response = await request(app)
        .put("/api/encounters")
        .send(newEncounter);

      expect(response.status).toBe(201);
    });
  });
});
