const fs = require("fs");
const path = require("path");

const scriptDir = path.dirname(__filename);
const resultsDir = path.resolve(scriptDir, "..", "allure-results");

function writeExecutor(basePath) {
  const base = path.resolve(basePath);
  const isCI = !!process.env.CI;

  const executor = isCI
    ? {
        name: "GitHub Actions",
        type: "github",
        reportName: "Allure Test Report",
        url: `https://github.com/${process.env.GITHUB_REPOSITORY || "unknown"}/actions/runs/${process.env.GITHUB_RUN_ID || "0"}`,
        buildName: `Run #${process.env.GITHUB_RUN_NUMBER || "0"}`,
        buildUrl: `https://github.com/${process.env.GITHUB_REPOSITORY || "unknown"}/actions/runs/${process.env.GITHUB_RUN_ID || "0"}`,
        reportUrl: "",
      }
    : {
        name: "Local Development",
        type: "local",
        reportName: "Allure Test Report",
      };

  const outPath = path.join(base, "executor.json");
  fs.writeFileSync(outPath, JSON.stringify(executor, null, 2));
  console.log(`[executor] Written to ${outPath}`);
}

if (require.main === module) {
  writeExecutor(process.argv[2] || resultsDir);
}

module.exports = { writeExecutor };
