const path = require("path");
const REPO_ROOT = path.resolve(__dirname, "..");

const ALLURE_REPORTER_PATH = path.resolve(
  REPO_ROOT,
  "security/node_modules/jest-allure2-reporter",
);

module.exports = {
  testEnvironment: "node",
  rootDir: REPO_ROOT,

  roots: ["<rootDir>/security", "<rootDir>/backend"],

  testMatch: ["<rootDir>/security/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/security/tests/jest.setup.js"],

  collectCoverage: true,

  collectCoverageFrom: [
    "**/backend/src/Nodejs/utils/**/*.js",
    "**/backend/src/Nodejs/middleware/**/*.js",
    "!**/node_modules/**",
    "!**/dist/**",
  ],

  coverageProvider: "v8",

  coverageDirectory: path.resolve(REPO_ROOT, "tests/allure-results/security"),
  coverageReporters: ["json-summary", "text"],

  moduleDirectories: [
    "node_modules",
    path.resolve(REPO_ROOT, "backend/src/Nodejs/node_modules"),
  ],

  coveragePathIgnorePatterns: ["/node_modules/"],

  reporters: [
    "default",
    [
      ALLURE_REPORTER_PATH,
      {
        resultsDir: path.resolve(REPO_ROOT, "tests/allure-results/security"),
      },
    ],
  ],
};
