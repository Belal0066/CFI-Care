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

module.exports = { attachJson, attachText, attachFile, attachScreenshot, attachVideo };
