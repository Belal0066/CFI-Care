const fs = require("fs");
const path = require("path");

const scriptDir = path.dirname(__filename);
const resultsDir = path.resolve(scriptDir, "..", "allure-results");

const CATEGORIES = [
  {
    name: "Assertion Failures",
    matchedStatuses: ["failed"],
    messageRegex: ".*assert.*",
  },
  {
    name: "Infrastructure",
    matchedStatuses: ["broken"],
  },
  {
    name: "Product Bug",
    matchedStatuses: ["failed", "broken"],
  },
  {
    name: "Known Issues",
    matchedStatuses: ["known"],
  },
];

function writeCategories(basePath) {
  const base = path.resolve(basePath);
  const outPath = path.join(base, "categories.json");
  fs.writeFileSync(outPath, JSON.stringify(CATEGORIES, null, 2));
  console.log(`[categories] Written to ${outPath}`);
}

if (require.main === module) {
  writeCategories(process.argv[2] || resultsDir);
}

module.exports = { writeCategories };
