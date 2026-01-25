module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],
  collectCoverageFrom: [
    "**/*.js",
    "!**/node_modules/**",
    "!**/dist/**",
    "!**/__tests__/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "./test-results",
        outputName: "junit.xml",
      },
    ],
    [
      "jest-html-reporters",
      {
        publicPath: "./test-results",
        filename: "report.html",
      },
    ],
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testTimeout: 10000,
};
