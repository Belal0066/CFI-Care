module.exports = {
  testEnvironment: "allure-jest/node",
  testEnvironmentOptions: {
    resultsDir: "../tests/allure-results/backend",
    environmentInfo: {
      suite: "backend-unit",
      framework: "jest",
    },
  },
  rootDir: "tests",
  testMatch: ["**/unit/**/*.test.js"],
};
