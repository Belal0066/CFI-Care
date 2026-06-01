# CFI-Care — Repository State

> Generated: 2026-06-01
> Sparse-checkout: `.github/`, `ai/`, `backend/`, `tests/`

---

## 1. Project Overview

| Field | Value |
|---|---|
| Type | AI-powered health‑record platform (FHIR) |
| App languages | Node.js/Express (backend), Flutter (mobile), Python (AI) |
| Node.js | v20.20.2 |
| Python | 3.12.3 |
| Latest commit | `8240f34` — Add testing scripts and report generation for Allure |
| Root `package.json` | Contains stale `allure-jest` + `jest` devDeps (superseded by `backend/package.json`) |

---

## 2. Directory Structure (checked out)

```
CFI-Care/
├── .github/workflows/
│   ├── allure.yml                   # CI: run tests + stability + history + report
│   └── documentation-pdf.yml
│
├── ai/
│   ├── requirements.txt             # pytest + allure-pytest + pytest-cov
│   ├── tests/
│   │   ├── conftest.py              # Autouse fixture (layer, component, RunID) + junit_makereport (stability + failure_trace)
│   │   ├── test_pass_example.py     # Passing test — allure steps, attach_json, apply_labels
│   │   ├── test_fail_example.py     # Failing test — assertion error, failure evidence in report
│   │   ├── test_skip_example.py     # Skipped test — @pytest.mark.skip with reason
│   │   └── test_broken_example.py   # Broken test — RuntimeError, shows as "broken" in Allure
│   └── src/                         # (placeholder)
│
├── backend/
│   ├── package.json                 # jest + allure-jest, test → jest --coverage
│   ├── jest.config.js               # allure-jest/node + coverage (json-summary) + rootDir: "."
│   ├── tests/
│   │   └── unit/
│   │       ├── validation.example.test.js      # Example: FHIR Patient validation (taxonomy.attachRequestResponse)
│   │       ├── transformation.example.test.js  # Example: data transformation (taxonomy.attachJson, async)
│   │       ├── pass.example.test.js            # Passing test — label/attach patterns
│   │       ├── fail.example.test.js            # Failing test — assertion error (statusCode 500 ≠ 200)
│   │       ├── skip.example.test.js            # Skipped test — test.skip for AllergyIntolerance validation
│   │       └── broken.example.test.js          # Broken test — unhandled Error (FHIR connection refused)
│   └── src/Nodejs/                  # Express API source (covered by istanbul)
│
├── tests/                           # Centralized test orchestration
│   ├── build-config.mjs             # Build-time orchestration config (historyLimit, paths)
│   ├── categories.json              # SOURCE of truth: failure classification (copied to allure-results)
│   ├── known-issues.json            # SOURCE of truth: known issues scaffold (copied to allure-results)
│   ├── allure-core/                 # Layer 2: Reporting DSL
│   │   ├── labels.js                # Full taxonomy: Label, Layer, Component, Scope, Dependency, Journey, Platform, Environment, Stability
│   │   ├── environment.js           # Write env.properties (OS, PYTHON, Node, RunID, duration)
│   │   ├── attachments.js           # attachJson, attachText, attachFile, attachScreenshot, attachVideo
│   │   ├── stability.js             # Precompute + summary mode (no JSON mutation); extended enums
│   │   ├── coverage.js              # Unified coverage-summary.json from all suites
│   │   ├── executor.js              # executor.json for Allure (CI / local)
│   │   └── global-logs.js           # Global artifact collector (scaffold)
│   ├── package.json                 # pretest, test, stability, report, pipeline, postrun scripts
│   ├── integration/
│   │   ├── requirements.txt         # pytest + allure-pytest + pytest-cov
│   │   └── tests/
│   │       ├── conftest.py          # Autouse fixture (layer, component) + junit_makereport (stability label)
│   │       └── test_smoke.py        # 2 pytest smoke tests
│   ├── system/                      # (future)
│   ├── scripts/
│   │   └── generate-report.sh       # allure generate + --history-limit 10
│   ├── allure-results/              # Layer 3: Allure consumption
│   │   ├── backend/                 # ← Jest output (+ coverage-summary.json)
│   │   ├── ai/                      # ← pytest output (+ coverage.json)
│   │   ├── integration/             # ← pytest output (+ coverage.json)
│   │   ├── history/                 # Previous run data (for stability / trend)
│   │   ├── global/                  # Global artifacts (logs, session output)
│   │   ├── categories.json          # Copied from tests/categories.json
│   │   ├── known-issues.json        # Copied from tests/known-issues.json
│   │   └── ... *.json               # executor.json, coverage-summary.json, etc.
│   └── allure-report/               # generated HTML report (gitignored)
│
└── STATE.md                         # this file
```

---

## 3. Allure Integration — Full Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    tests/package.json                               │
│  pretest → cleanup stale results + generate RunID + start_time      │
│  npm run stability:precompute → read history → write                │
│    precomputed-stability.json (test → history status)               │
│  npm test → test:backend + test:ai + test:integration (with --cov)  │
│  npm run stability:summary → compute actual stability from results  │
│    + history, write stability-summary.json (NO JSON mutation)       │
│  node environment.js → write env.properties (PYTHON, Node, RunID)  │
│  node coverage.js → write unified coverage-summary.json             │
│  node executor.js → write executor.json (CI/local metadata)         │
│  npm run postrun → global-logs.js (scaffold) +                │
│    cp categories.json + known-issues.json → allure-results/   │
│  npm run report → bash scripts/generate-report.sh             │
    + copies categories.json + known-issues.json to            │
      allure-results/ if not already present                   │
    + allure generate ... --history-limit 10                   │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│   backend/      │  │   ai/           │  │   tests/integration/ │
│   Jest 30       │  │   pytest        │  │   pytest             │
│   allure-jest   │  │   allure-pytest │  │   allure-pytest      │
│   --coverage    │  │   --cov         │  │   --cov              │
└────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│                tests/allure-results/                         │
│  backend/     ai/     integration/     history/             │
│  (result JSON) (result JSON) (result JSON) (prev run data)  │
│  + coverage    + coverage   + coverage                       │
│  -summary.json  .json       .json                           │
│  + precomputed-stability.json                               │
│  + stability-summary.json                                   │
│  + coverage-summary.json  + executor.json  + categories.json│
│  + known-issues.json  + global/                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  tests/allure-core/environment.js                            │
│  Write environment.properties:                               │
│  OS, PYTHON, NODE_VERSION, RUN_ID, RUN_DURATION             │
│  (coverage moved to dedicated coverage.js / coverage-summary)│
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  tests/scripts/generate-report.sh                            │
│  allure generate backend/ ai/ integration/ -o allure-report/ │
│  --history-limit 10                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              tests/allure-report/                            │
│              index.html — Allure 3 UI                        │
│              (includes stability, trends, history)           │
└─────────────────────────────────────────────────────────────┘
```

---

### 3.1 Backend Unit Tests — Jest + allure-jest

| File | Purpose |
|---|---|
| `backend/package.json` | Declares `jest`, `allure-jest`, `allure-js-commons`, `jest-environment-node`; test script is `jest --coverage` |
| `backend/jest.config.js` | `testEnvironment: "allure-jest/node"` + `resultsDir: "../tests/allure-results/backend"`; `collectCoverage: true` with `json-summary` reporter |
| `backend/tests/unit/validation.example.test.js` | Example: FHIR Patient resource validation using `taxonomy.attachRequestResponse`, `allure.epic`/`feature`/`story`, Jest `expect` |
| `backend/tests/unit/transformation.example.test.js` | Example: name merging transformation using `taxonomy.attachJson`, async test, multiple assertions |

Per-test labels: `layer=unit`, `component=backend`, `epic=Backend`, `feature=FHIR Validation` / `Data Transformation`, stability label.

Run: `cd backend && npm test` or `cd tests && npm run test:backend`

### 3.2 AI Unit Tests — pytest + allure-pytest

| File | Purpose |
|---|---|
| `ai/requirements.txt` | `pytest>=8.0`, `allure-pytest>=2.13.5`, `pytest-cov>=5.0` |
| `ai/tests/conftest.py` | Loads `precomputed-stability.json` at module level; autouse fixture sets `layer=unit`, `component=ai`, `RunID`; `pytest_runtest_makereport` hook computes stability label + attaches `failure_trace` for failed/broken tests |
| `ai/tests/test_pass_example.py` | Passing test — `@allure.feature`/`@allure.story`, `allure.step()`, `taxonomy.apply_labels`, `taxonomy.attach_json` |
| `ai/tests/test_fail_example.py` | Failing test — assertion error with message, confidence threshold demo |
| `ai/tests/test_skip_example.py` | Skipped test — `@pytest.mark.skip` with reason, no fixture execution |
| `ai/tests/test_broken_example.py` | Broken test — `RuntimeError` during `allure.step`, shows as "broken" in Allure |

Per-test labels: `layer=unit`, `component=ai`, `RunID`, `stability`, `feature`, `story`.  All 4 Allure statuses represented.

Run: `cd tests && npm run test:ai`

### 3.3 Integration Tests — pytest + allure-pytest

| File | Purpose |
|---|---|
| `tests/integration/requirements.txt` | `pytest>=8.0`, `allure-pytest>=2.13.5`, `pytest-cov>=5.0` |
| `tests/integration/tests/conftest.py` | Loads `precomputed-stability.json` at module level; autouse fixture sets `layer=integration`, `component=integration`; `pytest_runtest_makereport` hook computes stability label from test outcome + history |
| `tests/integration/tests/test_smoke.py` | 2 smoke tests with `@allure.title`, `@allure.feature`, `@allure.story` |

Per-test labels: `layer=integration`, `component=integration`, stability label (via dynamic hook).

Run: `cd tests && npm run test:integration`

---

## 4. Allure Report Content

Each Allure report now contains structured data mapped to the three report sections:

### 🟦 Header (Environment + Summary)

| Field | Source |
|---|---|
| OS | `/etc/os-release` — detected by `environment.js` (e.g. `Ubuntu 24.04.4 LTS`) |
| LANGUAGE | `environment.js` — always `Python` |
| FRAMEWORK | `python3 -c "import pytest; print(pytest.__version__)"` — detected by `environment.js` |
| PYTHON | `python3 --version` — detected by `environment.js` |
| NODE_VERSION | `process.version` — detected by `environment.js` |
| CI / PROJECT / RUN_TIME | `environment.properties` |
| RUN_ID | UUID generated in `pretest`, written to `run.properties` |
| Duration_Sec | Computed from `.start_time` file |
| CVRG_LINE/Branch/FUNCTION_PCT | `coverage-summary.json` — aggregated by `coverage.js`, mirrored in `environment.properties` |

### 🟦 Body (Test Cases)

| Field | Source |
|---|---|
| Suite / TestName / Status | Native Allure fields |
| Duration | Native Allure `start` / `stop` |
| RunID / testID | Conftest injects `RunID` label (from `run.properties`) + `testID` label (nodeid) |
| Tags (layer, component, scope, dependency, journey, stability, feature) | `taxonomy.apply_labels` / conftest fixture |
| Attachments | `attachJson`, `attachText`, `attachFile` — plus auto-attached `failure_trace.json` on fail/broken |
| Errors / Steps | Native Allure `steps` / `statusDetails` — failure messages include assertion diffs |

### 🟩 Conclusion (Analytics)

| Field | Source |
|---|---|
| Stability label | `stability.js` + conftest hooks: `new`, `stable`, `flaky`, `fixed`, `regressed`, `dependency-flaky`, `workflow-flaky` |
| History trend | `allure generate --history-limit 10` + preserved `allure-report/data/test-results/` |
| Retries | Native Allure — deduplicates by `historyId` within a run |

---

## 5. Stability Analysis

**File:** `tests/allure-core/stability.js`

Two-mode script that avoids JSON mutation:

### Mode 1 — Precompute (`--precompute`, runs before tests)
1. Reads previous test results from `tests/allure-results/history/` (if exists)
2. Builds a function-name → previous-status map from history
   - For pytest: extracts function name from `fullName` (e.g., `ai.tests.test_smoke::test_smoke_1` → `test_smoke_1`)
   - For Jest: uses `name` field directly (e.g., `"backend unit tests should bootstrap correctly"`)
3. Writes `tests/allure-results/precomputed-stability.json`
4. Conftest fixtures read this file and apply stability labels during test execution via `allure.dynamic.label` (pytest) or `afterEach` (Jest)

### Mode 2 — Summary (default, runs after tests)
1. Reads `history/` + current result JSONs
2. Computes actual stability per test using proper pass/fail comparison
3. Writes `tests/allure-results/stability-summary.json` (no JSON mutation)
4. Outputs summary to console

### Stability computation

| Condition | Label |
|---|---|
| No history for this test | `new` |
| Same status as history | `stable` |
| Was `passed`, now failed/broken | `regressed` |
| Was failed/broken, now `passed` | `fixed` |
| Other status changes | `flaky` |
| Dependency-related instability (override) | `dependency-flaky` |
| Workflow-related instability (override) | `workflow-flaky` |

### Label application (no JSON mutation)
- **pytest:** `pytest_runtest_makereport` hook in conftest calls `allure.dynamic.label("stability", value)` after test outcome is known
- **Jest:** `afterEach` in `sample.test.js` reads precomputed file, sets `allure.label("stability", "new")` for tests without history

The `history/` directory is populated in CI by downloading the previous run's `allure-history` artifact (contains `allure-report/data/test-results/`).

---

## 6. Code Coverage

| Suite | Tool | Output |
|---|---|---|
| Backend | Jest `--coverage` (istanbul) | `tests/allure-results/backend/coverage-summary.json` (json-summary) |
| AI | `pytest-cov` | `tests/allure-results/ai/coverage.json` |
| Integration | `pytest-cov` | `tests/allure-results/integration/coverage.json` |

Coverage is aggregated by `tests/allure-core/coverage.js` into a unified `tests/allure-results/coverage-summary.json`:

```json
{
  "backend": { "line": 0, "branch": 0, "function": 0 },
  "ai": { "line": 100 },
  "integration": { "line": 100 }
}
```

Coverage is **no longer** written into `environment.properties` — moved to a dedicated artifact to keep environment metadata focused on run context.

---

## 7. Allure Report Generation

| Step | Command | What it does |
|---|---|---|
| Clean | `rm -rf allure-results/backend ai integration` | `pretest` removes stale results (preserves `history/`) |
| Env init | Writes `.start_time` + `run.properties` | `pretest` generates RunID and start timestamp |
| Precompute stability | `node stability.js --precompute` | Reads history, writes `precomputed-stability.json` |
| Test | `npm test` | Runs all 3 suites with coverage; conftest fixtures apply stability labels dynamically |
| Stability summary | `node stability.js` | Computes actual stability, writes `stability-summary.json` (no JSON mutation) |
| Env final | `node environment.js` | Writes `environment.properties` with OS (distro), LANGUAGE, FRAMEWORK (pytest version), PYTHON, Node, RunID, duration, CVRG_PCT |
| Coverage artifact | `node coverage.js` | Aggregates coverage into unified `coverage-summary.json` |
| Executor metadata | `node executor.js` | Writes `executor.json` (CI or local build info) |
| Postrun | `npm run postrun` | Collects global logs (scaffold) + copies `categories.json` + `known-issues.json` to `allure-results/` |
| Generate | `npx allure generate ... --history-limit 10` | Produces `allure-report/` with history trends |

Full pipeline: `cd tests && npm run pipeline`

---

## 8. CI/CD — GitHub Actions

**File:** `.github/workflows/allure.yml`

```yaml
Triggers: push/PR on tests/**, backend/tests/**, ai/**, .github/workflows/allure.yml

Steps:
  1. Checkout
  2. Setup Python 3.11 + Node.js 20
  3. Install Python deps (integration + ai requirements)
  4. npm ci in tests/ (Allure CLI)
  5. npm ci in backend/ (Jest + allure-jest)
  6. Download `allure-history` artifact from previous successful run → `allure-results/history/`
  7. **npm run stability:precompute** – reads history, writes `precomputed-stability.json`
  8. **npm test** – runs all 3 suites; conftest fixtures apply stability labels dynamically
  9. **npm run stability:summary** – computes actual stability, writes `stability-summary.json`
 10. **node environment.js** – writes env.properties (PYTHON, Node, RunID, duration)
 11. **node coverage.js** – writes unified coverage-summary.json
 12. **node executor.js** – writes executor.json (GitHub Actions build metadata)
 13. **node global-logs.js** – collect global artifacts (scaffold)
 14. **cp categories.json + known-issues.json → allure-results/** – copy static config
 15. **npm run report** – generates merged Allure report (also copies categories/known-issues as fallback)
 16. Upload allure-report + allure-results as `allure-report` artifact
 17. Upload allure-report/data/test-results/ as `allure-history` artifact (for next run)
```

---

## 9. Versions & Dependencies

### Python packages (shared by ai + integration)

| Package | Version |
|---|---|
| `pytest` | >= 8.0 |
| `allure-pytest` | >= 2.13.5 |
| `pytest-cov` | >= 5.0 |

### Node packages (backend)

| Package | Version |
|---|---|
| `jest` | ^30.2.0 |
| `allure-jest` | ^3.9.0 |
| `allure-js-commons` | ^3.9.0 |
| `jest-environment-node` | ^30.2.0 |

### Node packages (tests/ orchestration)

| Package | Version |
|---|---|
| `allure` (CLI) | ^3.6.2 |

---

## 10. Current Test Count

| Suite | Framework | Tests | Statuses | Allure Output | Coverage |
|---|---|---|---|---|---|---|
| Backend unit (example) | Jest 30 | 6 | 3 ✅ 1 ❌ 1 💥 1 ⏭️ | `tests/allure-results/backend/` | `coverage-summary.json` |
| AI unit (example) | pytest 9 | 4 | 1 ✅ 1 ❌ 1 💥 1 ⏭️ | `tests/allure-results/ai/` | `coverage.json` |
| Integration | pytest 9 | 2 | 2 ✅ | `tests/allure-results/integration/` | `coverage.json` |
| **Total** | | **12** | **6 ✅ 2 ❌ 2 💥 2 ⏭️** | **→ report** | |

---

## 11. Architecture: Three-Layer Model

The reporting system is structured in 3 layers:

| Layer | Scope | Files |
|---|---|---|
| **Layer 1** — Test Frameworks | Jest, pytest execution | `backend/`, `ai/`, `tests/integration/` |
| **Layer 2** — Reporting DSL | Build-time orchestration & utilities | `tests/allure-core/*`, `tests/build-config.mjs`, `tests/categories.json`, `tests/known-issues.json` |
| **Layer 3** — Allure Consumption | What Allure CLI actually reads | `tests/allure-results/*.json`, `tests/allure-results/categories.json`, `tests/allure-results/environment.properties` |

Layer 2 generates/populates Layer 3. Allure never reads Layer 2 directly.

---

## 12. Quick Reference

```bash
# Full pipeline (test + stability + env + report)
cd tests && npm run pipeline

# Run everything (tests only)
cd tests && npm test

# Run a single suite
cd backend && npm test
cd tests && npm run test:ai
cd tests && npm run test:integration

# Analyze stability (after tests, before report)
cd tests && npm run stability

# Generate report (after tests + stability)
cd tests && npm run report

# Generate environment.properties (after tests)
cd tests && node ../tests/allure-core/environment.js

# Postrun (global logs + copy config to allure-results)
cd tests && npm run postrun

# Open report (serves via HTTP — file:// won't work)
cd tests && npm run report:open
# Opens at http://localhost:9876
```
