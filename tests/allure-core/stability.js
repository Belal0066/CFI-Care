const fs = require("fs");
const path = require("path");

const scriptDir = path.dirname(__filename);
const resultsDir = path.resolve(scriptDir, "..", "allure-results");

const RESULT_DIRS = ["backend", "ai", "integration"];

function readHistory(base) {
  const historyDir = path.join(base, "history");
  if (!fs.existsSync(historyDir)) return {};
  const files = fs.readdirSync(historyDir).filter(f => f.endsWith(".json"));
  const byName = {};
  for (const file of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(historyDir, file), "utf-8"));
      if (d.name && d.status) {
        if (d.fullName && d.fullName.includes("::")) {
          byName[d.fullName.split("::").pop()] = d.status;
        } else {
          byName[d.name] = d.status;
        }
      }
    } catch {}
  }
  return byName;
}

function computeStability(currentStatus, historyStatus) {
  if (!historyStatus) return "new";
  if (currentStatus === historyStatus) return "stable";
  if (historyStatus === "passed" && currentStatus !== "passed") return "regressed";
  if (currentStatus === "passed" && historyStatus !== "passed") return "fixed";
  return "flaky";
}

function precompute(basePath) {
  const base = path.resolve(basePath);
  console.log("[stability:precompute] Reading history from:", path.join(base, "history"));
  const history = readHistory(base);
  console.log(`[stability:precompute] History entries: ${Object.keys(history).length}`);

  const outPath = path.join(base, "precomputed-stability.json");
  fs.writeFileSync(outPath, JSON.stringify(history, null, 2));
  console.log(`[stability:precompute] Written to ${outPath}`);
}

function summary(basePath) {
  const base = path.resolve(basePath);
  console.log("[stability:summary] Reading history from:", path.join(base, "history"));
  const history = readHistory(base);
  console.log(`[stability:summary] History entries: ${Object.keys(history).length}`);

  let grandTotal = 0;
  const results = { new: 0, stable: 0, flaky: 0, fixed: 0, regressed: 0 };

  for (const suite of RESULT_DIRS) {
    const suiteDir = path.join(base, suite);
    if (!fs.existsSync(suiteDir)) continue;
    const files = fs.readdirSync(suiteDir).filter(f => f.endsWith("-result.json"));
    for (const file of files) {
      try {
        const result = JSON.parse(fs.readFileSync(path.join(suiteDir, file), "utf-8"));
        const name = result.name;
        if (!name) continue;
        grandTotal++;
        const key = (result.fullName && result.fullName.includes("::"))
          ? result.fullName.split("::").pop()
          : name;
        const historyStatus = history[key] || null;
        const stability = computeStability(result.status, historyStatus);
        results[stability]++;
      } catch {}
    }
  }

  const outPath = path.join(base, "stability-summary.json");
  fs.writeFileSync(outPath, JSON.stringify({ total: grandTotal, ...results }, null, 2));
  console.log(`[stability:summary] Written to ${outPath}`);
  console.log(`[stability:summary] Total: ${grandTotal}, New: ${results.new}, Stable: ${results.stable}, Flaky: ${results.flaky}, Fixed: ${results.fixed}, Regressed: ${results.regressed}`);
}

if (require.main === module) {
  const base = process.argv[2] || resultsDir;
  if (process.argv.includes("--precompute")) {
    precompute(base);
  } else {
    summary(base);
  }
}

module.exports = { precompute, summary, computeStability };
