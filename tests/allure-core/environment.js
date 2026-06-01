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

const OS_NAME = (() => {
  try {
    const osRelease = fs.readFileSync("/etc/os-release", "utf-8");
    const lines = osRelease.split("\n");
    const map = {};
    for (const line of lines) {
      const idx = line.indexOf("=");
      if (idx > 0) {
        const key = line.slice(0, idx);
        const raw = line.slice(idx + 1).replace(/^"|"$/g, "");
        map[key] = raw;
      }
    }
    return map.PRETTY_NAME || map.NAME || "unknown";
  } catch {
    return "unknown";
  }
})();

function getPytestVersion() {
  try {
    return require("child_process")
      .execSync("python3 -c \"import pytest; print(pytest.__version__)\"", {
        encoding: "utf-8"
      })
      .trim();
  } catch {
    return "unknown";
  }
}

function getJestVersion() {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "backend", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    return (
      (pkg.devDependencies && pkg.devDependencies.jest) ||
      (pkg.dependencies && pkg.dependencies.jest) ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

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

function readCoverageForSuite(suiteDir, suiteName) {
  try {
    if (suiteName === "backend") {
      const covPath = path.join(suiteDir, "coverage-summary.json");
      const cov = JSON.parse(fs.readFileSync(covPath, "utf-8"));
      const total = cov.total || {};
      return {
        CVRG_LINE: total.lines ? total.lines.pct : "n/a",
        CVRG_BRANCH: total.branches ? total.branches.pct : "n/a",
        CVRG_FUNCTION: total.functions ? total.functions.pct : "n/a"
      };
    }

    const covPath = path.join(suiteDir, "coverage.json");
    const cov = JSON.parse(fs.readFileSync(covPath, "utf-8"));
    const totals = cov.totals || {};
    const coveredBranches = totals.covered_branches || 0;
    const numBranches = totals.num_branches || 0;
    const branchPct = numBranches > 0 ? (coveredBranches / numBranches) * 100 : "n/a";
    return {
      CVRG_LINE: totals.percent_covered || "n/a",
      CVRG_BRANCH: branchPct === "n/a" ? "n/a" : branchPct.toFixed(2),
      CVRG_FUNCTION: "n/a"
    };
  } catch {
    return {
      CVRG_LINE: "n/a",
      CVRG_BRANCH: "n/a",
      CVRG_FUNCTION: "n/a"
    };
  }
}

function writeEnvironment(basePath) {
  const base = path.resolve(basePath);

  const env = {
    OS: OS_NAME !== "unknown" ? OS_NAME : process.platform,
    OS_PLATFORM: process.platform,
    PYTHON: PYTHON,
    NODE_VERSION: process.version,
    CI: process.env.CI || "local",
    PROJECT: "CFI-Care",
    RUN_TIME: new Date().toISOString(),
    RUN_ID: readRunId(base),
    Duration_Sec: readDurationSeconds(base),
    Duration_Percent: 100,
  };

  const allSuites = ["backend", "ai", "integration"];
  let suiteOverride = null;
  const suiteIndex = process.argv.indexOf("--suite");
  if (suiteIndex > -1 && process.argv[suiteIndex + 1]) {
    suiteOverride = process.argv[suiteIndex + 1];
  } else {
    const suiteArg = process.argv.find(arg => arg.startsWith("--suite="));
    if (suiteArg) suiteOverride = suiteArg.split("=")[1];
  }

  const suites = suiteOverride ? [suiteOverride] : allSuites;
  for (const suite of suites) {
    const suiteDir = path.join(base, suite);

    const suiteMeta = (() => {
      if (suite === "backend") {
        return {
          FRAMEWORK: "jest",
          JEST_VERSION: getJestVersion(),
          LANGUAGE: "node"
        };
      }
      if (suite === "ai" || suite === "integration") {
        return {
          FRAMEWORK: "pytest",
          PYTEST_VERSION: getPytestVersion(),
          LANGUAGE: "python"
        };
      }
      return {};
    })();

    const coverageMeta = readCoverageForSuite(suiteDir, suite);

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

    const merged = { ...existing, ...env, ...suiteMeta, ...coverageMeta };
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
  const args = process.argv.slice(2);
  const baseArg = args.find(arg => !arg.startsWith("-"));
  const basePath = baseArg && fs.existsSync(baseArg) ? baseArg : defaultPath;
  writeEnvironment(basePath);
}

module.exports = { writeEnvironment };
