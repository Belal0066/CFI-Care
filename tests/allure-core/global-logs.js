const fs = require("fs");
const path = require("path");

const scriptDir = path.dirname(__filename);
const resultsDir = path.resolve(scriptDir, "..", "allure-results");

function collectGlobalLogs(basePath) {
  const base = path.resolve(basePath || resultsDir);
  const globalDir = path.join(base, "global");
  fs.mkdirSync(globalDir, { recursive: true });

  // Placeholder for future:
  // - stdout capture
  // - stderr capture
  // - docker logs
  // - pytest session logs
  // - jest session logs

  const logPath = path.join(globalDir, "global-logs.json");
  fs.writeFileSync(logPath, JSON.stringify({ collected: [], timestamp: new Date().toISOString() }, null, 2));
  console.log(`[global-logs] Written to ${logPath}`);
}

if (require.main === module) {
  collectGlobalLogs(process.argv[2]);
}

module.exports = { collectGlobalLogs };
