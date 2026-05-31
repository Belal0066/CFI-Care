import { readFile, writeFile, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { augmentDashboardData } = require("./plugin.js");

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = currentDir;
const outputDir = path.resolve(currentDir, "../allure-report/plugins/custom-dashboard");

const ensureOutputDir = async () => {
  await mkdir(outputDir, { recursive: true });
};

const copyAssets = async () => {
  await Promise.all([
    copyFile(path.join(sourceDir, "js/dashboard.js"), path.join(outputDir, "dashboard.js")),
    copyFile(path.join(sourceDir, "css/dashboard.css"), path.join(outputDir, "dashboard.css")),
  ]);
};

const rewriteData = async () => {
  const dataPath = path.join(outputDir, "data.json");
  const raw = JSON.parse(await readFile(dataPath, "utf8"));
  const updated = augmentDashboardData(raw);
  await writeFile(dataPath, `${JSON.stringify(updated, null, 2)}\n`);
};

await ensureOutputDir();
await copyAssets();
await rewriteData();