import { defineConfig } from "allure";
import { env } from "node:process";

const reportName = env.ALLURE_REPORT_NAME ?? "CFI-Care Test Report";
const output = env.ALLURE_OUTPUT_DIR ?? "./allure-report";
const historyPath = env.ALLURE_HISTORY_PATH ?? "./allure-history/history.jsonl";

export default defineConfig({
  name: reportName,
  output,
  historyPath,
  appendHistory: true,
  variables: {
    Repository: "CFI-Care",
    "Run Mode": env.CI ? "CI" : "local",
  },
  defaultLabels: {
    severity: "normal",
    owner: "unassigned",
    layer: "integration",
  },
  categories: {
    rules: [
      {
        name: "Product errors",
        matchers: { statuses: ["failed"] },
      },
      {
        name: "Test errors",
        matchers: { statuses: ["broken"] },
      },
    ],
  },
  plugins: {
    awesome: {
      options: {
        reportName,
        singleFile: false,
        reportLanguage: env.ALLURE_REPORT_LANGUAGE ?? "en",
        groupBy: ["epic", "feature", "story"],
      },
    },
  },
});