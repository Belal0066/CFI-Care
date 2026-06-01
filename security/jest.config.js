const path = require("path");

module.exports = {
  testEnvironment: "allure-jest/node",
  testEnvironmentOptions: {
    resultsDir: path.resolve(__dirname, "../tests/allure-results/security"),
    environmentInfo: {
      suite: "security-unit",
      framework: "jest"
    }
  },

  rootDir: path.resolve(__dirname, ".."),
  testMatch: ["<rootDir>/security/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/security/tests/jest.setup.js"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/security/src/**/*.js"],
  coverageDirectory: "<rootDir>/tests/allure-results/security",

  coverageReporters: ["json-summary", "text"]
};