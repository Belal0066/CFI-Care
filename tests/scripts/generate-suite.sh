#!/bin/bash
set -e

# ─────────────────────────────────────────────────────────────
# generate-suite.sh — Scaffold a new test suite into the Allure pipeline
#
# Usage:
#   bash scripts/generate-suite.sh \
#     --name security \
#     --framework jest \
#     --path ../security/tests \
#     [--component SECURITY] \
#     [--layer unit]
#
# Arguments:
#   --name        Short unique name (used for scripts, dirs, labels)
#   --framework   jest | pytest
#   --path        Where your test files live relative to project root
#                   Examples:
#                     --path ../security/tests          (top-level security/)
#                     --path tests/security/tests       (inside tests/)
#   --component   (optional) Component constant in labels.js, defaults to --name uppercase
#   --layer       (optional) unit | integration | system, defaults to "unit"
#
# What it does:
#   1. Creates the test directory and generates config boilerplate
#   2. Adds npm/pytest scripts to tests/package.json
#   3. Registers the suite in environment.js, coverage.js, stability.js
#   4. Optionally extends labels.js with the new Component
#   5. Prints a checklist of remaining manual steps
# ─────────────────────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ALLURE_CORE="$ROOT/allure-core"
PKG_JSON="$ROOT/package.json"

# ── Parse arguments ──────────────────────────────────────────
NAME=""
FRAMEWORK=""
TEST_PATH=""
COMPONENT=""
LAYER="unit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --framework) FRAMEWORK="$2"; shift 2 ;;
    --path) TEST_PATH="$2"; shift 2 ;;
    --component) COMPONENT="$2"; shift 2 ;;
    --layer) LAYER="$2"; shift 2 ;;
    *) echo "ERROR: Unknown argument $1"; exit 1 ;;
  esac
done

if [ -z "$NAME" ] || [ -z "$FRAMEWORK" ] || [ -z "$TEST_PATH" ]; then
  echo "Usage: bash $0 --name <name> --framework <jest|pytest> --path <test-dir>"
  echo "  --name       Short unique name (e.g. security)"
  echo "  --framework  jest | pytest"
  echo "  --path       Path to test directory (e.g. ../security/tests or tests/security/tests)"
  exit 1
fi

if [ "$FRAMEWORK" != "jest" ] && [ "$FRAMEWORK" != "pytest" ]; then
  echo "ERROR: --framework must be 'jest' or 'pytest'"
  exit 1
fi

COMPONENT="${COMPONENT:-$(echo "$NAME" | tr '[:lower:]' '[:upper:]')}"

# Convert TEST_PATH to absolute path (resolve relative to project root)
if [[ "$TEST_PATH" != /* ]]; then
  TEST_PATH="$ROOT/$TEST_PATH"
fi
# Normalize (remove any /./ or /../ segments)
TEST_PATH="$(cd "$ROOT" && node -e "console.log(require('path').resolve('$TEST_PATH'))" 2>/dev/null || echo "$TEST_PATH")"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Generating test suite: $NAME"
echo "║  Framework:              $FRAMEWORK"
echo "║  Test dir:               $TEST_PATH"
echo "║  Component label:        $COMPONENT"
echo "║  Layer:                  $LAYER"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Create test directory ───────────────────────────
mkdir -p "$TEST_PATH"
touch "$TEST_PATH/.gitkeep"
echo "[1/8] Created test directory: $TEST_PATH"

# ── Step 2: Generate framework config ────────────────────────
if [ "$FRAMEWORK" = "jest" ]; then
  # ── jest.config.js ──
  # Determine relative path from the suite's parent dir to tests/allure-results
  SUITE_PARENT="$(dirname "$TEST_PATH")"
  REL_TO_RESULTS="$(node -e "const p=require('path'); console.log(p.relative('$SUITE_PARENT', '$ROOT/allure-results'));" 2>/dev/null || echo "../tests/allure-results")"

  cat > "$SUITE_PARENT/jest.config.js" <<JESTCONF
const path = require("path");

module.exports = {
  testEnvironment: "allure-jest/node",
  testEnvironmentOptions: {
    resultsDir: path.resolve(__dirname, "$REL_TO_RESULTS/$NAME"),
    environmentInfo: {
      suite: "$NAME-$LAYER",
      framework: "jest",
    },
  },
  rootDir: path.resolve(__dirname, ".."),
  testMatch: ["<rootDir>/${TEST_PATH#$ROOT/}/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/${TEST_PATH#$ROOT/}/jest.setup.js"],
  collectCoverage: true,
  collectCoverageFrom: ["<rootDir>/${SUITE_PARENT#$ROOT/}/src/**/*.js"],
  coverageDirectory: "<rootDir>/$REL_TO_RESULTS/$NAME",
  coverageReporters: ["json-summary", "text"],
};
JESTCONF
  echo "[2/8] Created $SUITE_PARENT/jest.config.js"

  # ── jest.setup.js ──
  cat > "$TEST_PATH/jest.setup.js" <<JESTSETUP
const fs = require("fs");
const path = require("path");
const allure = require("allure-js-commons");
const { Label, Layer, Component, Stability } = require("$REL_TO_RESULTS/../allure-core/labels");
const taxonomy = require("$REL_TO_RESULTS/../allure-core/taxonomy");

const precomputedPath = path.resolve(__dirname, "$REL_TO_RESULTS/precomputed-stability.json");
const precomputedStability = (() => {
  try {
    return JSON.parse(fs.readFileSync(precomputedPath, "utf-8"));
  } catch {
    return {};
  }
})();

beforeEach(async () => {
  const testName = expect.getState().currentTestName || "unknown";
  taxonomy.applyLabels(allure, {
    [Label.LAYER]: Layer.${LAYER^^},
    [Label.COMPONENT]: Component.$COMPONENT,
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
JESTSETUP
  echo "[3/8] Created $TEST_PATH/jest.setup.js"

  # ── package.json for suite ──
  cat > "$SUITE_PARENT/package.json" <<PKGJSON
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
PKGJSON
  echo "[4/8] Created $SUITE_PARENT/package.json"

  # ── Example test ──
  EXAMPLE="$TEST_PATH/example.test.js"
  if [ ! -f "$EXAMPLE" ]; then
    cat > "$EXAMPLE" <<JSEXAMPLE
const allure = require("allure-js-commons");
const { Label, Layer, Component } = require("$REL_TO_RESULTS/../allure-core/labels");
const taxonomy = require("$REL_TO_RESULTS/../allure-core/taxonomy");

describe("$NAME example", () => {
  beforeEach(async () => {
    taxonomy.applyLabels(allure, {
      [Label.LAYER]: Layer.${LAYER^^},
      [Label.COMPONENT]: Component.$COMPONENT
    });
  });

  it("should pass", async () => {
    await allure.epic("$NAME");
    await allure.feature("Example");
    await allure.story("First test");

    taxonomy.attachJson(allure, "payload", { status: "ok" });
    expect(true).toBe(true);
  });
});
JSEXAMPLE
    echo "       Created $EXAMPLE (example passing test)"
  fi

elif [ "$FRAMEWORK" = "pytest" ]; then
  # ── conftest.py ──
  cat > "$TEST_PATH/conftest.py" <<PYCONFTEST
import allure
import json
import os
import pytest

PRECOMPUTED_STABILITY = {}
_precomputed_path = os.path.join(os.getcwd(), "allure-results", "precomputed-stability.json")
if os.path.exists(_precomputed_path):
    with open(_precomputed_path) as f:
        PRECOMPUTED_STABILITY = json.load(f)


@pytest.fixture(autouse=True)
def allure_${NAME}_labels():
    allure.dynamic.label("layer", "$LAYER")
    allure.dynamic.label("component", "$NAME")
    _run_id_file = os.path.join(os.getcwd(), "allure-results", "run.properties")
    if os.path.exists(_run_id_file):
        with open(_run_id_file) as f:
            allure.dynamic.label("RunID", f.read().strip())
    yield


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    if call.when == "call":
        rep = outcome.get_result()
        test_name = item.name
        prev_status = PRECOMPUTED_STABILITY.get(test_name)
        if prev_status is None:
            stability = "new"
        else:
            current_status = "passed" if rep.passed else "failed"
            if current_status == prev_status:
                stability = "stable"
            elif prev_status == "passed" and current_status != "passed":
                stability = "regressed"
            elif current_status == "passed" and prev_status != "passed":
                stability = "fixed"
            else:
                stability = "flaky"

        try:
            allure.dynamic.label("stability", stability)
            allure.dynamic.label("testID", item.nodeid)
            allure.dynamic.label("historyId", item.nodeid)
        except Exception:
            pass
PYCONFTEST
  echo "[2/8] Created $TEST_PATH/conftest.py"

  # ── requirements.txt in parent dir ──
  REQ_FILE="$(dirname "$TEST_PATH")/requirements.txt"
  if [ ! -f "$REQ_FILE" ]; then
    cat > "$REQ_FILE" <<REQ
pytest>=8.0
allure-pytest>=2.13.5
pytest-cov>=5.0
REQ
    echo "[3/8] Created $REQ_FILE"
  else
    echo "[3/8] $REQ_FILE already exists — skipped"
  fi

  # ── Example test ──
  EXAMPLE="$TEST_PATH/test_example.py"
  if [ ! -f "$EXAMPLE" ]; then
    cat > "$EXAMPLE" <<PYEXAMPLE
import allure
import json

EXAMPLE_INPUT = {"key": "value"}


@allure.feature("$NAME")
@allure.story("Example")
def test_example():
    with allure.step("Check payload"):
        allure.attach(
            json.dumps(EXAMPLE_INPUT, indent=2),
            "payload",
            allure.attachment_type.JSON
        )
    assert True
PYEXAMPLE
    echo "       Created $EXAMPLE (example passing test)"
  fi
fi

echo "[5/8] Generated framework boilerplate for $FRAMEWORK"

# ── Steps 3-7: Update pipeline files via temp Node.js script ──
echo "[6/8] Updating pipeline files (package.json, environment.js, coverage.js, stability.js)..."

# Compute relative paths
SUITE_PARENT="$(dirname "$TEST_PATH")"
if [ "$FRAMEWORK" = "jest" ]; then
  REL_FROM_TESTS="$(node -e "const p=require('path'); console.log(p.relative('$ROOT', '$SUITE_PARENT'));" 2>/dev/null || echo "../$SUITE_PARENT")"
  TEST_SCRIPT="npm run clean:$NAME && npm run init:run && node ../tests/allure-core/stability.js --precompute && bash -c 'cd $REL_FROM_TESTS && npm test; status=\$\?; node ../tests/allure-core/environment.js allure-results --suite $NAME; node ../tests/allure-core/stability.js; exit \$status'"
elif [ "$FRAMEWORK" = "pytest" ]; then
  COV_ROOT="$(node -e "const p=require('path'); console.log(p.relative('$ROOT', '$(dirname "$TEST_PATH")'));" 2>/dev/null || echo "../$(dirname "$TEST_PATH")")"
  TEST_SCRIPT="npm run clean:$NAME && npm run init:run && bash -c 'pytest $COV_ROOT/tests --alluredir=allure-results/$NAME --cov=$COV_ROOT --cov-report=json:allure-results/$NAME/coverage.json; status=\$\?; node ../tests/allure-core/environment.js allure-results --suite $NAME; exit \$status'"
fi

# Write a temp Node.js script that performs all updates
TMP_SCRIPT=$(mktemp /tmp/gen-suite-XXXXXX.js)
cat > "$TMP_SCRIPT" << 'NODESCRIPT'
const fs = require('fs');
const path = require('path');

// Read vars from env (passed by bash)
const NAME = process.env.SUITE_NAME;
const COMPONENT = process.env.SUITE_COMPONENT;
const FRAMEWORK = process.env.SUITE_FRAMEWORK;
const PKG_JSON = process.env.SUITE_PKG_JSON;
const ALLURE_CORE = process.env.SUITE_ALLURE_CORE;
const TEST_SCRIPT = process.env.SUITE_TEST_SCRIPT;
const LAYER = process.env.SUITE_LAYER || 'unit';
const CLEAN_SCRIPT = process.env.SUITE_CLEAN_SCRIPT;

// ─── Step 3: Update package.json ───────────────────────────
const pkg = JSON.parse(fs.readFileSync(PKG_JSON, 'utf-8'));
const scripts = pkg.scripts || {};

scripts[`clean:${NAME}`] = CLEAN_SCRIPT;
scripts[`test:${NAME}`] = TEST_SCRIPT;
scripts[`report:${NAME}`] = `bash scripts/generate-report.sh ${NAME}`;

// Add to the 'test' chain
const suiteRef = `npm run test:${NAME}`;
const testChain = scripts.test || '';
if (!testChain.includes(suiteRef)) {
  const parts = testChain.split(' && ').filter(Boolean);
  parts.push(suiteRef);
  scripts.test = parts.join(' && ');
}

// Sync all clean: scripts to remove all known suite dirs
const allSuites = Object.keys(scripts)
  .filter(k => k.startsWith('clean:'))
  .map(k => k.replace('clean:', ''));
const removeDirs = allSuites.map(s => `allure-results/${s}`).join(' ');
for (const suite of allSuites) {
  scripts[`clean:${suite}`] = `mkdir -p allure-results && rm -rf ${removeDirs} allure-results/environment.properties allure-results/run.properties allure-results/.start_time`;
}

pkg.scripts = scripts;
fs.writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + '\n');
console.log(`[pkg] Added clean:${NAME}, test:${NAME}, report:${NAME}`);

// ─── Step 4: Update environment.js ─────────────────────────
const envPath = path.join(ALLURE_CORE, 'environment.js');
let envContent = fs.readFileSync(envPath, 'utf-8');

// Add to allSuites
const suitesMatch = envContent.match(/(allSuites\s*=\s*\[)([^\]]*)(\])/);
if (suitesMatch) {
  const existing = suitesMatch[2];
  if (!existing.includes(`"${NAME}"`)) {
    const newList = existing.trim() ? existing.trim() + `, "${NAME}"` : `"${NAME}"`;
    envContent = envContent.replace(suitesMatch[0], suitesMatch[1] + newList + suitesMatch[3]);
    console.log(`[env] Added "${NAME}" to allSuites`);
  }
}

// Add suiteMeta block
const metaMarker = 'return {};';
if (FRAMEWORK === 'jest') {
  const jestBlock = `
      if (suite === "${NAME}") {
        return {
          FRAMEWORK: "jest",
          JEST_VERSION: getJestVersion(),
          LANGUAGE: "node"
        };
      }`;
  if (!envContent.includes(`suite === "${NAME}"`)) {
    envContent = envContent.replace(metaMarker, jestBlock + '\n    ' + metaMarker);
    console.log(`[env] Added Jest suiteMeta for "${NAME}"`);
  }
} else {
  const pytestBlock = `
      if (suite === "${NAME}") {
        return {
          FRAMEWORK: "pytest",
          PYTEST_VERSION: getPytestVersion(),
          LANGUAGE: "python"
        };
      }`;
  if (!envContent.includes(`suite === "${NAME}"`)) {
    envContent = envContent.replace(metaMarker, pytestBlock + '\n    ' + metaMarker);
    console.log(`[env] Added pytest suiteMeta for "${NAME}"`);
  }
}
fs.writeFileSync(envPath, envContent);

// ─── Step 5: Update coverage.js ────────────────────────────
const covPath = path.join(ALLURE_CORE, 'coverage.js');
let covContent = fs.readFileSync(covPath, 'utf-8');

if (FRAMEWORK === 'jest') {
  const readerFunc = `
function read${COMPONENT}Coverage(base) {
  const file = path.join(base, "${NAME}", "coverage-summary.json");
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const t = raw.total || {};
    return {
      line: t.lines && t.lines.pct !== "Unknown" ? t.lines.pct : null,
      branch: t.branches && t.branches.pct !== "Unknown" ? t.branches.pct : null,
      function: t.functions && t.functions.pct !== "Unknown" ? t.functions.pct : null,
    };
  } catch {
    return null;
  }
}`;
  if (!covContent.includes(`read${COMPONENT}Coverage`)) {
    covContent = covContent.replace(
      /function writeCoverageSummary/,
      readerFunc + '\n\nfunction writeCoverageSummary'
    );
  }
  const summaryLine = `    ${NAME}: read${COMPONENT}Coverage(base),`;
  if (!covContent.includes(`"${NAME}":`)) {
    covContent = covContent.replace(
      /const summary = \{/,
      'const summary = {\n' + summaryLine
    );
  }
} else {
  const line = `    ${NAME}: readPythonCoverage(path.join(base, "${NAME}", "coverage.json")),`;
  if (!covContent.includes(`"${NAME}":`)) {
    covContent = covContent.replace(
      /const summary = \{/,
      'const summary = {\n' + line
    );
  }
}
fs.writeFileSync(covPath, covContent);
console.log(`[cov] Added ${NAME} to coverage.js`);

// ─── Step 6: Update stability.js ───────────────────────────
const stabPath = path.join(ALLURE_CORE, 'stability.js');
let stabContent = fs.readFileSync(stabPath, 'utf-8');

const lineMatch = stabContent.match(/(const RESULT_DIRS\s*=\s*\[)([^\]]*)(\])/);
if (lineMatch) {
  const existing = lineMatch[2];
  if (!existing.includes(`"${NAME}"`)) {
    const quoted = `"${NAME}"`;
    const newList = existing.trim() ? existing.trim() + ', ' + quoted : quoted;
    stabContent = stabContent.replace(lineMatch[0], lineMatch[1] + newList + lineMatch[3]);
    console.log(`[stab] Added "${NAME}" to RESULT_DIRS`);
  }
}
fs.writeFileSync(stabPath, stabContent);

// ─── Step 7: Optionally extend labels.js ───────────────────
const labelsPath = path.join(ALLURE_CORE, 'labels.js');
let labelsContent = fs.readFileSync(labelsPath, 'utf-8');
const newEntry = `  ${COMPONENT}: "${NAME}",`;
if (!labelsContent.includes(newEntry)) {
  labelsContent = labelsContent.replace(
    /^};/m,
    newEntry + '\n};'
  );
  fs.writeFileSync(labelsPath, labelsContent);
  console.log(`[labels] Added Component.${COMPONENT} = "${NAME}"`);
}

console.log('Done updating pipeline files.');
NODESCRIPT

# Run the temp script with env vars
SUITE_NAME="$NAME" \
SUITE_COMPONENT="$COMPONENT" \
SUITE_FRAMEWORK="$FRAMEWORK" \
SUITE_PKG_JSON="$PKG_JSON" \
SUITE_ALLURE_CORE="$ALLURE_CORE" \
SUITE_TEST_SCRIPT="$TEST_SCRIPT" \
SUITE_LAYER="$LAYER" \
SUITE_CLEAN_SCRIPT="mkdir -p allure-results && rm -rf allure-results/$NAME allure-results/environment.properties allure-results/run.properties allure-results/.start_time" \
node "$TMP_SCRIPT"

rm -f "$TMP_SCRIPT"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Suite '$NAME' scaffolded successfully!            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Install dependencies:"
if [ "$FRAMEWORK" = "jest" ]; then
  echo "     cd $(dirname "$TEST_PATH") && npm install"
else
  echo "     pip install -r $(dirname "$TEST_PATH")/requirements.txt"
fi
echo ""
echo "  2. Write your tests in: $TEST_PATH"
echo ""
echo "  3. Run them:"
echo "     cd $ROOT && npm run test:$NAME && npm run report:$NAME && npm run report:open"
echo ""
echo "  4. Update .github/workflows/allure.yml (manual):"
echo "     - Add '$NAME/**' to the push/PR trigger paths"
if [ "$FRAMEWORK" = "jest" ]; then
  echo "     - Add: npm ci && npm ci"
  echo "       working-directory: $(dirname "$TEST_PATH" | sed "s|$ROOT/||")"
else
  echo "     - Add: pip install -r $(dirname "$TEST_PATH" | sed "s|$ROOT/||")/requirements.txt"
fi
echo "     - Add cache-dependency-path entry if Jest"
echo ""
echo "  5. Review and commit the new files."
