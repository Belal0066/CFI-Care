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
│   ├── allure.yml                   # CI: run all tests + generate Allure report
│   └── documentation-pdf.yml
│
├── ai/
│   ├── requirements.txt             # pytest + allure-pytest
│   ├── tests/
│   │   └── test_smoke.py            # 2 pytest smoke tests
│   └── src/                         # (placeholder)
│
├── backend/
│   ├── package.json                 # jest + allure-jest
│   ├── jest.config.js               # allure-jest/node env → tests/allure-results/backend
│   ├── tests/
│   │   └── unit/
│   │       └── sample.test.js       # 2 Jest smoke tests
│   └── src/Nodejs/                  # Express API source
│
├── tests/                           # Centralized test orchestration
│   ├── package.json                 # npm run test, npm run report
│   ├── integration/
│   │   ├── requirements.txt         # pytest + allure-pytest
│   │   └── tests/
│   │       └── test_smoke.py        # 2 pytest smoke tests
│   ├── system/                      # (future)
│   ├── scripts/
│   │   └── generate-report.sh       # allure generate from 3 dirs → report
│   ├── allure-results/              # Allure raw results (gitignored)
│   │   ├── backend/                 # ← Jest output
│   │   ├── ai/                      # ← pytest output
│   │   └── integration/             # ← pytest output
│   └── allure-report/               # generated HTML report (gitignored)
│
└── STATE.md                         # this file
```

---

## 3. Allure Integration — How It Flows

```
┌────────────────────────────────────────────────────────────────┐
│                     tests/package.json                         │
│  npm test → test:backend + test:ai + test:integration          │
│  npm run report → bash scripts/generate-report.sh              │
└────────────────────────────────────────────────────────────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│   backend/      │  │   ai/           │  │   tests/integration/ │
│   Jest 30       │  │   pytest        │  │   pytest             │
│   allure-jest   │  │   allure-pytest │  │   allure-pytest      │
└────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘
         │                    │                       │
         ▼                    ▼                       ▼
┌─────────────────────────────────────────────────────────────┐
│                tests/allure-results/                         │
│  backend/     ai/     integration/                          │
│  (JSON files) (JSON files) (JSON files)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  tests/scripts/generate-report.sh                            │
│  allure generate backend/ ai/ integration/ -o allure-report/ │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              tests/allure-report/                            │
│              index.html — pure Allure 3 UI                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Backend Unit Tests — Jest + allure-jest

| File | Purpose |
|---|---|
| `backend/package.json` | Declares `jest`, `allure-jest`, `allure-js-commons`, `jest-environment-node` |
| `backend/jest.config.js` | `testEnvironment: "allure-jest/node"` + `resultsDir: "../tests/allure-results/backend"` |
| `backend/tests/unit/sample.test.js` | 2 smoke tests with `allure.epic()`, `allure.feature()`, `allure.story()` |

Run: `cd backend && npm test` or `cd tests && npm run test:backend`

### 3.2 AI Unit Tests — pytest + allure-pytest

| File | Purpose |
|---|---|
| `ai/requirements.txt` | `pytest>=8.0`, `allure-pytest>=2.13.5` |
| `ai/tests/test_smoke.py` | 2 smoke tests with `@allure.title`, `@allure.feature`, `@allure.story` |

Run: `cd tests && pytest ../ai/tests --alluredir=allure-results/ai` or `cd tests && npm run test:ai`

### 3.3 Integration Tests — pytest + allure-pytest

| File | Purpose |
|---|---|
| `tests/integration/requirements.txt` | `pytest>=8.0`, `allure-pytest>=2.13.5` |
| `tests/integration/tests/test_smoke.py` | 2 smoke tests with `@allure.title`, `@allure.feature`, `@allure.story` |

Run: `cd tests && pytest integration --alluredir=allure-results/integration` or `cd tests && npm run test:integration`

---

## 4. Allure Report Generation

| Step | Command | What it does |
|---|---|---|
| Generate | `npx allure generate backend/ ai/ integration/ -o allure-report/` | Reads all 3 result dirs independently, no manual merge needed |

Full pipeline: `cd tests && npm test && npm run report`

> ⚠️ **Must serve via HTTP** — Allure 3 is a JavaScript SPA that uses `fetch()` to load data files. Opening `index.html` directly via `file://` will show an infinite loading spinner. Use `npm run report:open` to serve on `http://localhost:9876`.

---

## 5. CI/CD — GitHub Actions

**File:** `.github/workflows/allure.yml`

```yaml
Triggers: push/PR on tests/**, backend/tests/**, ai/**, .github/workflows/allure.yml

Steps:
  1. Checkout
  2. Setup Python 3.11 + Node.js 20
  3. Install Python deps (integration + ai requirements)
  4. npm ci in tests/ (Allure CLI)
  5. npm ci in backend/ (Jest + allure-jest)
  6. npm test – runs all 3 suites
  7. npm run report – generates merged Allure report
  8. Upload tests/allure-report/ + tests/allure-results/ as artifact
```

---

## 6. Versions & Dependencies

### Python packages (shared by ai + integration)

| Package | Version |
|---|---|
| `pytest` | >= 8.0 |
| `allure-pytest` | >= 2.13.5 |

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

## 7. Current Test Count

| Suite | Framework | Tests | Allure Output |
|---|---|---|---|
| Backend unit | Jest 30 | 2 | `tests/allure-results/backend/` |
| AI unit | pytest 9 | 2 | `tests/allure-results/ai/` |
| Integration | pytest 9 | 2 | `tests/allure-results/integration/` |
| **Total** | | **6** | **→ report** |

---

## 8. Quick Reference

```bash
# Run everything
cd tests && npm test

# Run a single suite
cd backend && npm test
cd tests && npm run test:ai
cd tests && npm run test:integration

# Generate report (after running tests)
cd tests && npm run report

# Full pipeline (tests + report)
cd tests && npm test && npm run report

# Open report (serves via HTTP — file:// won't work)
cd tests && npm run report:open
# Opens at http://localhost:9876
```
