const fs = require("fs");
const path = require("path");

const scriptDir = path.dirname(__filename);
const resultsDir = path.resolve(scriptDir, "..", "allure-results");

function readBackendCoverage(base) {
  const file = path.join(base, "backend", "coverage-summary.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const t = raw.total || {};
    return {
      line: t.lines && t.lines.pct !== "Unknown" ? t.lines.pct : null,
      branch: t.branches && t.branches.pct !== "Unknown" ? t.branches.pct : null,
      function: t.functions && t.functions.pct !== "Unknown" ? t.functions.pct : null,
    };
  } catch {
    return null;
  }
}

function readPythonCoverage(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (raw.totals) {
      const pct = raw.totals.percent_covered_display || raw.totals.percent_covered;
      return pct != null ? { line: pct } : null;
    }
    return null;
  } catch {
    return null;
  }
}


function readSecurityCoverage(base) {
  const file = path.join(base, "security", "coverage-summary.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const t = raw.total || {};
    return {
      line: t.lines && t.lines.pct !== "Unknown" ? t.lines.pct : null,
      branch: t.branches && t.branches.pct !== "Unknown" ? t.branches.pct : null,
      function: t.functions && t.functions.pct !== "Unknown" ? t.functions.pct : null
    };
  } catch { return null; }
}

function writeCoverageSummary(basePath) {
  const base = path.resolve(basePath);
  const summary = {
    backend: readBackendCoverage(base),
    ai: readPythonCoverage(path.join(base, "ai", "coverage.json")),
    security: readSecurityCoverage(base),
    integration: readPythonCoverage(path.join(base, "integration", "coverage.json")),
  };

  const outPath = path.join(base, "coverage-summary.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`[coverage] Written to ${outPath}`);
}

if (require.main === module) {
  writeCoverageSummary(process.argv[2] || resultsDir);
}

module.exports = { writeCoverageSummary };
