const validateRequest = require("../../middleware/validateRequest");
const { createPatientSchema } = require("../../models/patientValidation");

describe("Request Validation Middleware", () => {
  it("should pass valid request to next middleware", () => {
    const middleware = validateRequest(createPatientSchema);
    const req = {
      body: {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 400 error for invalid request", () => {
    const middleware = validateRequest(createPatientSchema);
    const req = {
      body: {
        lastName: "Doe", // Missing firstName
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should return specific error message for validation failure", () => {
    const middleware = validateRequest(createPatientSchema);
    const req = {
      body: {
        firstName: "J", // Too short
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining("firstName"),
      }),
    );
  });
});
