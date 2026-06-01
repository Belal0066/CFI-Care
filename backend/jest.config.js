module.exports = {
  testEnvironment: "allure-jest/node",
  testEnvironmentOptions: {
    resultsDir: "../tests/allure-results/backend",
    environmentInfo: {
      suite: "backend-unit",
      framework: "jest",
    },
  },
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/unit/**/*.test.js"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/src/**/*.js"],
  coverageDirectory: "<rootDir>/../tests/allure-results/backend",
  coverageReporters: ["json-summary", "text"],
};
