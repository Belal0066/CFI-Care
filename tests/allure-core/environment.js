const fs = require("fs");
const path = require("path");

const scriptDir = path.dirname(__filename);
const defaultPath = path.resolve(scriptDir, "..", "allure-results");

const PYTHON = (() => {
  try {
    return require("child_process")
      .execSync("python3 --version", { encoding: "utf-8" })
      .trim()
      .replace("Python ", "");
  } catch {
    return "unknown";
  }
})();

function readRunId(base) {
  const file = path.join(base, "run.properties");
  try {
    return fs.readFileSync(file, "utf-8").trim();
  } catch {
    return "unknown";
  }
}

function readDurationSeconds(base) {
  const file = path.join(base, ".start_time");
  try {
    const start = parseInt(fs.readFileSync(file, "utf-8").trim());
    return Math.floor(Date.now() / 1000 - start);
  } catch {
    return 0;
  }
}

function writeEnvironment(basePath) {
  const base = path.resolve(basePath);

  const env = {
    OS: process.platform,
    PYTHON: PYTHON,
    NODE_VERSION: process.version,
    CI: process.env.CI || "local",
    PROJECT: "CFI-Care",
    RUN_TIME: new Date().toISOString(),
    RUN_ID: readRunId(base),
    RUN_DURATION_SECONDS: readDurationSeconds(base),
  };

  const suites = ["backend", "ai", "integration"];
  for (const suite of suites) {
    const suiteDir = path.join(base, suite);

    const existing = {};
    const envPath = path.join(suiteDir, "environment.properties");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      content
        .split("\n")
        .filter(Boolean)
        .forEach(line => {
          const idx = line.indexOf("=");
          if (idx > 0) existing[line.slice(0, idx)] = line.slice(idx + 1);
        });
    }

    const merged = { ...existing, ...env };
    const content = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir, { recursive: true });
    fs.writeFileSync(envPath, content);
  }

  const parentPath = path.join(base, "environment.properties");
  const parentContent = Object.entries(env)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(parentPath, parentContent);
}

if (require.main === module) {
  const base = process.argv[2];
  writeEnvironment(base || defaultPath);
}

module.exports = { writeEnvironment };
