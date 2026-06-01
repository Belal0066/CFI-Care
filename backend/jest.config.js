const path = require("path");

module.exports = {
  testEnvironment: "allure-jest/node",
  testEnvironmentOptions: {
    resultsDir: path.resolve(__dirname, "../tests/allure-results/backend"),
    environmentInfo: {
      suite: "backend-unit",
      framework: "jest",
    },
  },
  rootDir: path.resolve(__dirname, ".."),
  testMatch: ["<rootDir>/backend/tests/**/unit/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/backend/tests/unit/jest.setup.js"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/backend/src/**/*.js"],
  coverageDirectory: "<rootDir>/tests/allure-results/backend",
  coverageReporters: ["json-summary", "text"],
};
