const { createPatientSchema } = require("../src/Nodejs/models/patientValidation");

describe("Patient Validation Schema", () => {
  describe("createPatientSchema", () => {
    it("should validate a correct patient object", () => {
      const validPatient = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      };

      const { error } = createPatientSchema.validate(validPatient);
      expect(error).toBeUndefined();
    });

    it("should reject patient with missing firstName", () => {
      const invalidPatient = {
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      };

      const { error } = createPatientSchema.validate(invalidPatient);
      expect(error).toBeDefined();
      expect(error.details[0].context.label).toBe("firstName");
    });

    it("should reject patient with firstName shorter than 2 characters", () => {
      const invalidPatient = {
        firstName: "J",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      };

      const { error } = createPatientSchema.validate(invalidPatient);
      expect(error).toBeDefined();
    });

    it("should reject patient with invalid email format", () => {
      const invalidPatient = {
        firstName: "John",
        lastName: "Doe",
        email: "invalid-email",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
      };

      const { error } = createPatientSchema.validate(invalidPatient);
      expect(error).toBeDefined();
    });

    it("should reject patient with invalid ISO date format", () => {
      const invalidPatient = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "01/15/1990", // Invalid format
        password: "SecurePassword123",
      };

      const { error } = createPatientSchema.validate(invalidPatient);
      expect(error).toBeDefined();
    });

    it("should reject patient with password shorter than 8 characters", () => {
      const invalidPatient = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "Short1!",
      };

      const { error } = createPatientSchema.validate(invalidPatient);
      expect(error).toBeDefined();
    });

    it("should allow additional fields", () => {
      const patientWithExtra = {
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        birthDate: "1990-01-15",
        password: "SecurePassword123",
        nickname: "Johnny", // Extra field
      };

      const { error } = createPatientSchema.validate(patientWithExtra);
      expect(error).toBeUndefined();
    });
  });
});
