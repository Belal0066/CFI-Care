# Allure Test Reporting — Developer Guide

This directory is the central hub for test orchestration and Allure reporting across all CFI-Care suites (backend, AI, integration, and any future ones). It implements a **3-layer architecture** that keeps test frameworks, reporting DSL, and Allure consumption separate.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installation](#2-installation)
3. [Quick Start](#3-quick-start)
4. [Available Commands](#4-available-commands)
5. [Architecture](#5-architecture)
6. [Adding a New Test Suite](#6-adding-a-new-test-suite)
7. [Labels & Taxonomy](#7-labels--taxonomy)
8. [Categories & Known Issues](#8-categories--known-issues)
9. [Stability System](#9-stability-system)
10. [CI/CD Pipeline](#10-cicd-pipeline)
11. [Troubleshooting](#11-troubleshooting)
12. [Automation Script](#12-automation-script)

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| npm | ≥ 10 | ships with Node |
| Python | ≥ 3.11 | `python3 --version` |
| pip | ≥ 23 | `pip --version` |
| Java | ≥ 11 (JRE) | `java -version` — required by Allure CLI |

### Allure CLI

Allure CLI is installed via npm in this project (declared in `tests/package.json`). You do **not** need a global install — all commands use `npx allure` or `npm run`.

If you want the standalone CLI for debugging:

**Linux:**
```bash
# via npm global (easiest)
npm install -g allure-commandline

# via Homebrew
brew install allure

# via APT (Debian/Ubuntu)
sudo apt-add-repository ppa:qameta/allure
sudo apt update && sudo apt install allure
```

**Windows:**
```powershell
# via Scoop
scoop install allure

# via winget
winget install Allure.Allure

# Manual: download from https://github.com/allure-framework/allure2/releases
# extract, add bin/ to your PATH
```

Verify: `allure --version` → should print `2.33.x` or similar.

---

## 2. Installation

```bash
# 1. Install Allure CLI + dev tools
cd tests
npm install

# 2. Install backend test deps
cd ../backend
npm install
cd ../tests

# 3. Install Python deps (AI + integration)
pip install -r ../ai/requirements.txt
pip install -r integration/requirements.txt

# 4 Install security dep 
cd ../security
npm install
cd ../tests
```

---

## 3. Quick Start

```bash
cd tests

# Run a single suite and open its report
npm run test:backend
npm run report:backend
npm run report:open

# Run all suites (full CI-like pipeline)
npm run pipeline

# Open the report at http://localhost:9876
npm run report:open
```

---

## 4. Available Commands

All commands run from the `tests/` directory.

### Run a specific suite

Each suite auto-cleans old results, re-initializes the run ID, runs tests, and writes per-suite environment metadata.

| Command | What it runs |
|---|---|
| `npm run test:backend` | Jest (6 unit tests) — output to `allure-results/backend/` |
| `npm run test:ai` | pytest (4 unit tests) — output to `allure-results/ai/` |
| `npm run test:integration` | pytest (2 smoke tests) — output to `allure-results/integration/` |

### Run all suites

| Command | What it does |
|---|---|
| `npm test` | Runs all suites in sequence: `test:backend && test:ai && test:integration` |

### Generate the Allure report

| Command | What it does |
|---|---|
| `npm run report` | Generates report from **all** non-empty result directories |
| `npm run report:backend` | Report from `allure-results/backend/` only |
| `npm run report:ai` | Report from `allure-results/ai/` only |
| `npm run report:integration` | Report from `allure-results/integration/` only |
| `npm run report:open` | Serves the report at `http://localhost:9876` |

### Stability analysis

| Command | What it does |
|---|---|
| `npm run stability:precompute` | Reads `allure-results/history/`, writes `precomputed-stability.json` (run **before** tests) |
| `npm run stability:summary` | Reads current results + history, writes `stability-summary.json` (run **after** tests) |
| `npm run stability` | Alias for `stability:summary` |

### Full pipeline

| Command | What it does |
|---|---|
| `npm run pipeline` | Full CI-like run: `stability:precompute → npm test → stability:summary → environment.js → coverage.js → executor.js → postrun → report` |

### Utility scripts

| Command | What it does |
|---|---|
| `npm run postrun` | Collects global logs + copies `categories.json` / `known-issues.json` to `allure-results/` |

---

## 5. Architecture

The reporting system is structured in **3 layers**:

```
Layer 1: Test Frameworks
  backend/tests/unit/        Jest + allure-jest
  ai/tests/                  pytest + allure-pytest
  tests/integration/tests/   pytest + allure-pytest
        │
        │  produce Allure result JSONs + coverage data
        ▼
Layer 2: Reporting DSL
  tests/allure-core/         labels.js, environment.js, stability.js, ...
  tests/categories.json      Failure classification source of truth
  tests/build-config.mjs     Build-time orchestration config
        │
        │  reads result JSONs, writes env/coverage/stability artifacts
        ▼
Layer 3: Allure Consumption
  tests/allure-results/      ALL input to `allure generate`
    ├── backend/             ─result JSONs + environment.properties + coverage-summary.json
    ├── ai/                  ─result JSONs + environment.properties + coverage.json
    ├── integration/         ─result JSONs + environment.properties + coverage.json
    ├── history/             ─previous run test results (for stability trends)
    ├── global/              ─global artifact logs
    ├── categories.json      ─Copied from tests/categories.json
    ├── known-issues.json    ─Copied from tests/known-issues.json
    ├── executor.json        ─CI/local build metadata
    ├── coverage-summary.json─Aggregated coverage
    ├── environment.properties
    └── precomputed-stability.json / stability-summary.json
```

**Allure CLI never reads Layer 2 directly.** Layer 2 transforms and enriches data into Layer 3, which is what `allure generate` consumes.

### Data flow (single suite run)

```
npm run clean:backend     → rm -rf allure-results/backend + env files
npm run init:run          → write .start_time + run.properties
stability --precompute    → read history → write precomputed-stability.json
cd backend && npm test    → Jest runs, writes result JSONs to allure-results/backend/
environment --suite backend → write environment.properties per suite + root
stability.js (summary)    → compute stability from results + history
bash generate-report.sh   → allure generate (auto-detects non-empty dirs)
```

---

## 6. Adding a New Test Suite

You have two options:

### Option A: Automated (recommended)

Use the `generate-suite.sh` script (see [section 12](#12-automation-script)).

```bash
cd tests
bash scripts/generate-suite.sh --name security --framework jest --path ../security/tests
```

This creates all boilerplate and updates the pipeline files automatically.

### Option B: Manual step-by-step

Let's add a `security/tests/` suite using Jest as an example.

#### Step 1: Create the directory structure

```
mkdir -p security/tests
```

#### Step 2: Create `security/package.json`

```json
{
  "private": true,
  "scripts": {
    "test": "jest --coverage"
  },
  "devDependencies": {
    "allure-jest": "^3.9.0",
    "allure-js-commons": "^3.9.0",
    "jest": "^30.2.0",
    "jest-circus": "^30.2.0",
    "jest-environment-node": "^30.2.0"
  }
}
```

#### Step 3: Create `security/jest.config.js`

```javascript
const path = require("path");

module.exports = {
  testEnvironment: "allure-jest/node",
  testEnvironmentOptions: {
    resultsDir: path.resolve(__dirname, "../tests/allure-results/security"),
    environmentInfo: {
      suite: "security-unit",
      framework: "jest",
    },
  },
  rootDir: path.resolve(__dirname, ".."),
  testMatch: ["<rootDir>/security/tests/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/security/tests/jest.setup.js"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/security/src/**/*.js"],
  coverageDirectory: "<rootDir>/tests/allure-results/security",
  coverageReporters: ["json-summary", "text"],
};
```

#### Step 4: Create `security/tests/jest.setup.js`

```javascript
const fs = require("fs");
const path = require("path");
const allure = require("allure-js-commons");
const { Label, Layer, Component, Stability } = require("../../tests/allure-core/labels");
const taxonomy = require("../../tests/allure-core/taxonomy");

const precomputedPath = path.resolve(__dirname, "../../tests/allure-results/precomputed-stability.json");
const precomputedStability = (() => {
  try { return JSON.parse(fs.readFileSync(precomputedPath, "utf-8")); }
  catch { return {}; }
})();

beforeEach(async () => {
  const testName = expect.getState().currentTestName || "unknown";
  taxonomy.applyLabels(allure, {
    [Label.LAYER]: Layer.UNIT,
    [Label.COMPONENT]: Component.SECURITY,
    testID: testName,
    historyId: testName,
    RunID: taxonomy.getRunId()
  });

  const prev = precomputedStability[testName];
  if (prev === undefined) {
    taxonomy.applyLabels(allure, { [Label.STABILITY]: Stability.NEW });
  } else {
    taxonomy.applyLabels(allure, { [Label.STABILITY]: prev });
  }
});
```

#### Step 5: Create `security/tests/example.test.js`

```javascript
const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("../../tests/allure-core/labels");
const taxonomy = require("../../tests/allure-core/taxonomy");

describe("security example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, {
      [Label.LAYER]: Layer.UNIT,
      [Label.COMPONENT]: Component.SECURITY
    });
  });

  it("should pass", async () => {
    await allure.epic("Security");
    await allure.feature("Example");
    await allure.story("First test");
    taxonomy.attachJson(allure, "payload", { status: "ok" });
    expect(true).toBe(true);
  });
});
```

#### Step 6: Update `tests/package.json`

Add these scripts:

```json
"clean:security": "mkdir -p allure-results && rm -rf allure-results/security allure-results/environment.properties allure-results/run.properties allure-results/.start_time",
"test:security": "npm run clean:security && npm run init:run && node ../tests/allure-core/stability.js --precompute && bash -c 'cd ../security && npm test; status=$?; node ../tests/allure-core/environment.js allure-results --suite security; node ../tests/allure-core/stability.js; exit $status'",
"report:security": "bash scripts/generate-report.sh security",
```

And add `npm run test:security` to the `"test"` chain.

#### Step 7: Update `tests/allure-core/environment.js`

Add `"security"` to the `allSuites` array (line ~131):

```javascript
const allSuites = ["backend", "ai", "integration", "security"];
```

Add a `suiteMeta` block in the `writeEnvironment` function:

```javascript
if (suite === "security") {
  return {
    FRAMEWORK: "jest",
    JEST_VERSION: getJestVersion(),
    LANGUAGE: "node"
  };
}
```

#### Step 8: Update `tests/allure-core/coverage.js`

Add a coverage reader function and include it in `writeCoverageSummary`:

```javascript
function readSecurityCoverage(base) {
  const file = path.join(base, "security", "coverage-summary.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const t = raw.total || {};
    return {
      line: t.lines && t.lines.pct !== "Unknown" ? t.lines.pct : null,
      branch: t.branches && t.branches.pct !== "Unknown" ? t.branches.pct : null,
      function: t.functions && t.functions.pct !== "Unknown" ? t.functions.pct : null,
    };
  } catch { return null; }
}

// In writeCoverageSummary:
const summary = {
  security: readSecurityCoverage(base),
  // ... existing suites
};
```

#### Step 9: Update `tests/allure-core/stability.js`

Add `"security"` to `RESULT_DIRS`:

```javascript
const RESULT_DIRS = ["backend", "ai", "integration", "security"];
```

#### Step 10: (Optional) Add to `tests/allure-core/labels.js`

```javascript
const Component = {
  BACKEND: "backend",
  AI: "ai",
  SECURITY: "security"
};
```

#### Step 11: Update `.github/workflows/allure.yml`

- Add `security/**` to the `on.push.paths` and `on.pull_request.paths` lists
- Add a step to install security dependencies:
  ```yaml
  - name: Install Node dependencies (security tests)
    run: npm ci
    working-directory: security
  ```
- Add to cache-dependency-path if needed

#### Step 12: Install and run

```bash
cd security && npm install
cd ../tests
npm run test:security
npm run report:security
npm run report:open
```

### Adding a pytest suite (e.g., `performance/tests/`)

The process is similar but with these differences:

- Create `performance/tests/conftest.py` instead of `jest.setup.js`
- Create `performance/requirements.txt` with `pytest`, `allure-pytest`, `pytest-cov`
- The `test:performance` script uses pytest instead of jest:
  ```json
  "test:performance": "npm run clean:performance && npm run init:run && bash -c 'pytest ../performance/tests --alluredir=allure-results/performance --cov=../performance --cov-report=json:allure-results/performance/coverage.json; status=$?; node ../tests/allure-core/environment.js allure-results --suite performance; exit $status'"
  ```

---

## 7. Labels & Taxonomy

### Available labels

Defined in `tests/allure-core/labels.js`:

| Label | Purpose | Example values |
|---|---|---|
| `epic` | High-level feature area | `"Backend"`, `"Authentication Flow"`, `"Patient Records"` |
| `feature` | Specific feature | `"FHIR Validation"`, `"CRUD"`, `"Login"` |
| `story` | Individual test scenario | `"Create Patient"`, `"User Login"` |
| `layer` | Test level | `unit`, `integration`, `system` |
| `component` | System component | `backend`, `ai`, `security` |
| `scope` | Interaction scope | `backend-ai`, `backend-db`, `backend-auth`, `backend-fhir` |
| `stability` | Flakiness classification | `new`, `stable`, `flaky`, `fixed`, `regressed` |
| `severity` | Impact level | `blocker`, `critical`, `normal`, `minor`, `trivial` |
| `owner` | Team or person | `"team-core"`, `"team-ai"` |
| `dependency` | External dependency | `postgres`, `redis`, `fhir`, `openai` |
| `journey` | User journey | `patient`, `provider`, `admin` |
| `platform` | Target platform | `web`, `android`, `ios` |
| `environment` | Deployment env | `local`, `dev`, `staging`, `prod` |

### How to apply labels

**Jest (Node.js):**
```javascript
const { Label, Layer, Component } = require("../../tests/allure-core/labels");
const taxonomy = require("../../tests/allure-core/taxonomy");

// In beforeEach or test body:
taxonomy.applyLabels(allure, {
  [Label.LAYER]: Layer.UNIT,
  [Label.COMPONENT]: Component.BACKEND,
  [Label.SCOPE]: "backend-fhir",
  [Label.DEPENDENCY]: "postgres"
});
```

**pytest (Python):**
```python
from taxonomy import apply_labels

# In test function or conftest fixture:
apply_labels({"layer": "unit", "component": "ai", "scope": "backend-ai"})
```

### Attachment helpers

**Jest:**
```javascript
taxonomy.attachJson(allure, "request", { body: payload });
taxonomy.attachRequestResponse(allure, req, res);
```

**pytest:**
```python
from taxonomy import attach_json, attach_request_response

attach_json("request", {"body": payload})
attach_request_response(req, res)
```

### Conftest conventions

Every test suite needs a conftest (pytest) or jest.setup.js (Jest) that:

1. Sets base labels (`layer`, `component`, `RunID`)
2. Reads `precomputed-stability.json` and applies the `stability` label
3. (pytest) Implements `pytest_runtest_makereport` for post-outcome stability and failure trace capture

See `ai/tests/conftest.py` and `backend/tests/unit/jest.setup.js` for reference implementations.

---

## 8. Categories & Known Issues

### Failure categories (`tests/categories.json`)

Categories classify test failures in the Allure report. Current categories:

```json
[
  { "name": "Assertion Failures", "matchedStatuses": ["failed"], "messageRegex": ".*assert.*" },
  { "name": "Infrastructure",      "matchedStatuses": ["broken"] },
  { "name": "Product Bug",         "matchedStatuses": ["failed", "broken"] }
]
```

To add integration-specific categories (e.g., Database Error, Authentication Failure), add new entries with appropriate `messageRegex` patterns. The file is copied to `allure-results/categories.json` during `npm run postrun` and `npm run report`.

### Known issues (`tests/known-issues.json`)

An empty array `[]` by default. Add test UIDs here to mark known failures:

```json
[
  { "issueId": "JIRA-123", "testId": "test_something" }
]
```

---

## 9. Stability System

The stability system tracks which tests are new, stable, flaky, fixed, or regressed across runs.

### How it works

1. **Previous run history** is stored in `allure-results/history/` (populated by CI from a previous artifact)
2. **`stability:precompute`** reads history and writes `precomputed-stability.json`
3. **During test execution**, conftest/jest.setup reads the precomputed file and applies stability labels
4. **After tests**, `stability:summary` compares current results against history and writes final analysis to `stability-summary.json`

### Stability values

| Label | Meaning |
|---|---|
| `new` | No history found for this test |
| `stable` | Same status as previous run |
| `regressed` | Was passing, now failing |
| `fixed` | Was failing, now passing |
| `flaky` | Other status changes |
| `dependency-flaky` | Flagged as dependency-related flakiness (manual override) |
| `workflow-flaky` | Flagged as workflow-related flakiness (manual override) |

---

## 10. CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/allure.yml`) runs on push/PR to any test-related path.

### CI Steps

1. Checkout + setup Python 3.11 + Node.js 20
2. Install all dependencies (Python + npm)
3. Download `allure-history` artifact from the previous successful run
4. `stability:precompute` — read history
5. `npm test` — run all suites
6. `stability:summary` — analyze results
7. Write environment metadata + coverage + executor.json
8. Collect global logs + copy config files
9. `npm run report` — generate the Allure report
10. Upload `allure-report` and `allure-history` artifacts

### History persistence

The `allure-history` artifact contains `allure-report/data/test-results/` from the previous run. It is:
- **Downloaded** at the start of each CI run (restored to `allure-results/history/`)
- **Uploaded** at the end (saved for the next run)

This enables the stability trend graph and flaky detection across CI runs.

---

## 11. Troubleshooting

### "Allure command not found" / `npx allure` fails

Ensure Java 11+ is installed: `java -version`. Allure CLI requires a JRE.

### Old tests appear in the report

Each `test:*` command auto-cleans its own result directory. If you ran a different suite previously, stale results in other directories are ignored — `generate-report.sh` only includes directories with `.json` files. To force a full clean:

```bash
rm -rf allure-results
```

### Report shows wrong framework (e.g., pytest instead of jest)

The `FRAMEWORK` field comes from `environment.properties` written by `environment.js`. Each `test:*` script passes `--suite <name>` to `environment.js`, which picks the correct framework metadata. If they're mixed up, clean and re-run:

```bash
npm run test:backend && npm run report:backend
```

### Tests appear under wrong path hierarchy

For Jest tests, test paths are relative to `rootDir` in `jest.config.js`. The backend config uses:

```javascript
rootDir: path.resolve(__dirname, "..")  // project root
testMatch: ["<rootDir>/backend/tests/**/unit/**/*.test.js"]
```

This makes tests appear as `backend/tests/unit/...` in the Allure report. If you add a new suite, follow the same pattern with your suite's path.

### Stability shows "new" for all tests

The `precomputed-stability.json` file is missing or empty. This is normal on the first run. After a second CI run with history downloaded, tests will show `stable`, `flaky`, etc.

### Coverage is 0%

Coverage is 0% when example tests don't import any source code. This is expected for placeholder tests — real tests will produce real coverage by importing from `src/`.

### `npm test` fails because one suite has intentional failures

`npm test` uses `&&` chaining, which stops on the first failure. Run individual suites separately:

```bash
npm run test:backend ; npm run test:ai ; npm run test:integration
```

---

## 12. Automation Script

To avoid the manual 11-step process above, use `scripts/generate-suite.sh`:

```bash
cd tests
bash scripts/generate-suite.sh --name security --framework jest --path ../security/tests
```

### What it does

| Step | Description |
|---|---|
| 1 | Creates the test directory with `.gitkeep` |
| 2 | Generates `jest.config.js` / `conftest.py` with correct paths |
| 3 | Generates `jest.setup.js` (Jest) or `requirements.txt` (pytest) |
| 4 | Generates `package.json` with the correct devDependencies |
| 5 | Creates an example test file |
| 6 | Updates `tests/package.json` — adds `clean:`, `test:`, `report:` scripts + updates the `test` chain |
| 7 | Updates `environment.js` — adds suite to `allSuites` + framework metadata |
| 8 | Updates `coverage.js` — adds coverage reader for the new suite |
| 9 | Updates `stability.js` — adds suite to `RESULT_DIRS` |
| 10 | (Optional) Updates `labels.js` — adds Component constant |
| 11 | Prints remaining manual steps (CI workflow, git commit) |

### Arguments

| Argument | Required | Default | Description |
|---|---|---|---|
| `--name` | yes | — | Short unique name (e.g., `security`, `performance`) |
| `--framework` | yes | — | `jest` or `pytest` |
| `--path` | yes | — | Path to test directory (e.g., `../security/tests`) |
| `--component` | no | uppercase of `--name` | Component constant name in `labels.js` |
| `--layer` | no | `unit` | `unit`, `integration`, or `system` |

### Example: Adding a pytest suite

```bash
bash scripts/generate-suite.sh \
  --name performance \
  --framework pytest \
  --path ../performance/tests \
  --layer integration \
  --component PERFORMANCE
```
