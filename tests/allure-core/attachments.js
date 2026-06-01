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

module.exports = { attachJson, attachText };
