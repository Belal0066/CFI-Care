function attachJson(allure, name, data) {
  allure.attachment(
    name,
    JSON.stringify(data, null, 2),
    "application/json"
  );
}

function attachText(allure, name, text) {
  allure.attachment(name, text, "text/plain");
}

function attachFile(allure, name, filePath) {
  const fs = require("fs");
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    allure.attachment(name, content, "text/plain");
  } catch (e) {
    console.warn(`[attachments] Could not read file: ${filePath}`, e.message);
  }
}

function attachScreenshot(allure, name, base64Png) {
  allure.attachment(name, base64Png, "image/png");
}

function attachVideo(allure, name, filePath) {
  const fs = require("fs");
  try {
    const buffer = fs.readFileSync(filePath);
    allure.attachment(name, buffer.toString("base64"), "video/mp4");
  } catch (e) {
    console.warn(`[attachments] Could not read video: ${filePath}`, e.message);
  }
}

function attachSQL(allure, name, sqlText) {
  // Attach SQL snapshots or queries
  try {
    allure.attachment(name, sqlText, "text/sql");
  } catch (e) {
    console.warn(`[attachments] Could not attach SQL: ${name}`, e.message);
  }
}

function attachHAR(allure, name, harObject) {
  // Attach HAR (HTTP Archive) as JSON
  try {
    const content = typeof harObject === "string" ? harObject : JSON.stringify(harObject, null, 2);
    allure.attachment(name, content, "application/json");
  } catch (e) {
    console.warn(`[attachments] Could not attach HAR: ${name}`, e.message);
  }
}

module.exports = { attachJson, attachText, attachFile, attachScreenshot, attachVideo };
