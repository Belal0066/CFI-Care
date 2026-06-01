const fs = require('fs');
const path = require('path');

// Lightweight helper to provide a consistent API for applying labels and attachments
// so test authors can use the same calls across frameworks.
function applyLabels(allure, labels = {}) {
  try {
    if (!allure || !labels) return;
    const entries = Object.entries(labels);
    for (const [k, v] of entries) {
      if (v === undefined || v === null) continue;
      // allure-js-commons uses `label` or `addLabel` depending on API; try both
      try { allure.label(k, v); } catch (e) {}
      try { allure.addLabel && allure.addLabel(k, v); } catch (e) {}
    }
  } catch (e) {
    // swallow errors — helpers are best-effort
    // eslint-disable-next-line no-console
    console.warn('[taxonomy] applyLabels failed', e && e.message);
  }
}

function setHistoryId(allure, id) {
  try {
    if (!id) return;
    applyLabels(allure, { historyId: id });
  } catch (e) {}
}

function attachJson(allure, name, obj) {
  try {
    const content = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    allure.attachment(name, content, 'application/json');
  } catch (e) {
    console.warn('[taxonomy] attachJson failed', e && e.message);
  }
}

function attachRequestResponse(allure, req, res) {
  try {
    attachJson(allure, 'request', req);
    attachJson(allure, 'response', res);
  } catch (e) {
    console.warn('[taxonomy] attachRequestResponse failed', e && e.message);
  }
}

function getRunId() {
  try {
    const runPath = path.resolve(__dirname, '..', 'allure-results', 'run.properties');
    return fs.readFileSync(runPath, 'utf-8').trim();
  } catch (e) {
    return 'unknown';
  }
}

module.exports = { applyLabels, setHistoryId, attachJson, attachRequestResponse, getRunId };
