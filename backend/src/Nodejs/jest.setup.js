require("dotenv").config({ path: ".env.test" });

// Mock environment variables for testing
process.env.FHIR_SERVER_URL =
  process.env.FHIR_SERVER_URL || "http://localhost:8080/fhir";
process.env.REDIS_URL_PATIENTS =
  process.env.REDIS_URL_PATIENTS || "redis://localhost:6379";
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "5432";
process.env.DB_USER = process.env.DB_USER || "testuser";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "testpass";
process.env.DB_NAME = process.env.DB_NAME || "test_db";

// Increase timeout for database operations
jest.setTimeout(10000);

// Mock console to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};
