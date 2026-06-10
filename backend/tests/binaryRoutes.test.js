const request = require("supertest");
const express = require("express");
const binaryRoutes = require("../src/Nodejs/binary/binaryRoutes");
const binaryController = require("../src/Nodejs/binary/binaryController");

jest.mock("../src/Nodejs/middleware/requireApiAuth", () => ({
  requireApiAuth: (req, res, next) => next(),
}));
jest.mock("../src/Nodejs/binary/binaryController");

const app = express();
app.use(express.json());
app.use("/api/binary", binaryRoutes);

describe("Binary API Routes", () => {
  describe("GET /api/binary/:id", () => {
    it("should retrieve PDF binary resource", async () => {
      const mockBinary = {
        resourceType: "Binary",
        id: "bin-001",
        contentType: "application/pdf",
        data: "base64encodedpdfdata...",
      };

      binaryController.getPDFBinaryResource.mockImplementation((req, res) => {
        res.status(200).json(mockBinary);
      });

      const response = await request(app).get("/api/binary/bin-001");

      expect(response.status).toBe(200);
      expect(response.body.contentType).toBe("application/pdf");
    });

    it("should return 404 for non-existent binary", async () => {
      binaryController.getPDFBinaryResource.mockImplementation((req, res) => {
        res.status(404).json({ error: "Binary resource not found" });
      });

      const response = await request(app).get("/api/binary/nonexistent");

      expect(response.status).toBe(404);
    });
  });

  describe("PUT /api/binary", () => {
    it("should create binary resource from PDF file", async () => {
      const binaryData = {
        file: "base64encodedpdfdata...",
        id: "bin-new-001",
        contentType: "application/pdf",
      };

      const createdBinary = {
        id: "bin-new-001",
        resourceType: "Binary",
        contentType: "application/pdf",
      };

      binaryController.createPDFBinaryResource.mockImplementation(
        (req, res) => {
          res.status(201).json(createdBinary);
        },
      );

      const response = await request(app).put("/api/binary").send(binaryData);

      expect(response.status).toBe(201);
      expect(response.body.resourceType).toBe("Binary");
    });

    it("should validate required fields", async () => {
      const invalidBinary = {
        // Missing 'file' and 'id'
        contentType: "application/pdf",
      };

      binaryController.createPDFBinaryResource.mockImplementation(
        (req, res) => {
          res.status(400).json({ error: "File path and ID are required" });
        },
      );

      const response = await request(app)
        .put("/api/binary")
        .send(invalidBinary);

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/binary/:id", () => {
    it("should update binary resource", async () => {
      const updatedBinary = {
        id: "bin-001",
        resourceType: "Binary",
        contentType: "application/pdf",
      };

      binaryController.updateBinary.mockImplementation((req, res) => {
        res.status(200).json(updatedBinary);
      });

      const response = await request(app)
        .post("/api/binary/bin-001")
        .send({ file: "updatedbase64data...", contentType: "application/pdf" });

      expect(response.status).toBe(200);
      expect(response.body.resourceType).toBe("Binary");
    });

    it("should return 404 when binary not found", async () => {
      binaryController.updateBinary.mockImplementation((req, res) => {
        res.status(404).json({ error: "Binary resource not found" });
      });

      const response = await request(app)
        .post("/api/binary/nonexistent")
        .send({ file: "data..." });

      expect(response.status).toBe(404);
    });

    it("should return 400 when no file data is provided", async () => {
      binaryController.updateBinary.mockImplementation((req, res) => {
        res.status(400).json({
          error:
            "ID and one of file path, base64 data, or multipart pdf are required",
        });
      });

      const response = await request(app).post("/api/binary/bin-001").send({});

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /api/binary/:id", () => {
    it("should delete binary resource", async () => {
      binaryController.deleteBinary.mockImplementation((req, res) => {
        res.status(200).json({ message: "Binary deleted successfully" });
      });

      const response = await request(app).delete("/api/binary/bin-001");

      expect(response.status).toBe(200);
    });
  });
});
