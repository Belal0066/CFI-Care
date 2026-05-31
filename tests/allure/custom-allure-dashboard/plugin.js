const path = require("node:path");

const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const toText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length ? text : fallback;
};

const unique = (values) => [...new Set(values.filter(Boolean))];

const getLabelValue = (labels = [], labelName) => {
  const found = labels.find((label) => String(label?.name ?? "").toLowerCase() === labelName.toLowerCase());
  return found ? toText(found.value) : "";
};

const inferArtifactKind = (attachment = {}) => {
  const name = toText(attachment.name).toLowerCase();
  const source = toText(attachment.source).toLowerCase();
  const type = toText(attachment.type).toLowerCase();
  const blob = `${name} ${source} ${type}`;

  if (blob.includes("video") || blob.endsWith(".mp4") || blob.endsWith(".webm")) return "video";
  if (blob.includes("screenshot") || blob.endsWith(".png") || blob.endsWith(".jpg") || blob.endsWith(".jpeg") || blob.endsWith(".gif")) return "screenshot";
  if (blob.includes("json") || blob.endsWith(".json")) return "json";
  if (blob.includes("xml") || blob.endsWith(".xml")) return "xml";
  if (blob.includes("log") || blob.endsWith(".log") || blob.endsWith(".txt")) return "logs";
  return "file";
};

const normalizeAttachments = (attachments = []) =>
  toArray(attachments).map((attachment) => ({
    name: toText(attachment.name, attachment.source ?? "Attachment"),
    source: toText(attachment.source),
    type: toText(attachment.type, attachment.mimeType ?? ""),
    kind: inferArtifactKind(attachment),
  }));

const normalizeTags = (testRow = {}) => {
  const labelTags = toArray(testRow.labels)
    .filter((label) => String(label?.name ?? "").toLowerCase() === "tag")
    .map((label) => toText(label.value));
  return unique([...(testRow.tags ?? []), ...labelTags].map((tag) => toText(tag)));
};

const normalizeError = (testRow = {}) => {
  const error = testRow.error ?? {};
  const message = toText(error.message);
  const stack = toText(error.stack);
  const preview = toText(testRow.errorPreview) || message || stack.split("\n")[0] || "";
  return {
    preview,
    message,
    stack,
  };
};

const buildTestRows = (data = {}) =>
  toArray(data.groupedTests).flatMap((group) =>
    toArray(group.tests ?? group.testRows ?? []).map((testRow) => {
      const labels = toArray(testRow.labels);
      const suite = toText(testRow.suite, getLabelValue(labels, "suite") || getLabelValue(labels, "parentSuite") || group.suite || group.fileName || "Suite");
      const fileName = toText(testRow.fileName, group.fileName || testRow.titlePath?.[1] || "unknown-file");
      const packageName = toText(testRow.package, getLabelValue(labels, "package") || "");
      const feature = toText(testRow.feature, getLabelValue(labels, "feature") || getLabelValue(labels, "story") || getLabelValue(labels, "epic") || "");
      const error = normalizeError(testRow);

      return {
        id: toText(testRow.id),
        historyId: toText(testRow.historyId),
        name: toText(testRow.name, "Unnamed test"),
        status: toText(testRow.status, "unknown"),
        duration: Number(testRow.duration ?? 0),
        start: Number(testRow.start ?? 0),
        suite,
        fileName,
        package: packageName,
        feature,
        owner: toText(testRow.owner, getLabelValue(labels, "owner") || "unassigned"),
        severity: toText(testRow.severity, getLabelValue(labels, "severity") || "normal"),
        retries: Number(testRow.retries ?? testRow.retriesCount ?? 0),
        trend: toText(testRow.trend, testRow.flaky ? "flaky" : "stable"),
        errorPreview: error.preview,
        error,
        tags: normalizeTags(testRow),
        attachments: normalizeAttachments(testRow.attachments),
        labels,
        titlePath: toArray(testRow.titlePath),
      };
    }),
  );

const countStatuses = (testRows = []) =>
  testRows.reduce(
    (accumulator, testRow) => {
      accumulator.total += 1;
      accumulator[testRow.status] = (accumulator[testRow.status] ?? 0) + 1;
      accumulator.retries += Number(testRow.retries ?? 0);
      return accumulator;
    },
    { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, retries: 0 },
  );

const buildCoverage = (data = {}) => {
  const coverage = data.widgets?.coverage ?? data.coverage ?? null;
  if (!coverage) return null;
  return {
    line: coverage.line ?? coverage.lines ?? coverage.lineCoverage ?? null,
    branch: coverage.branch ?? coverage.branches ?? coverage.branchCoverage ?? null,
    function: coverage.function ?? coverage.functions ?? coverage.functionCoverage ?? null,
  };
};

const buildEnvironment = (data = {}, firstTest = {}) => {
  const labels = toArray(firstTest.labels);
  const environment = data.widgets?.environments?.[0] ?? data.environments?.[0] ?? {};
  return {
    os: toText(environment.os, getLabelValue(labels, "os") || process.platform),
    framework: toText(environment.framework, getLabelValue(labels, "framework") || "pytest"),
    language: toText(environment.language, getLabelValue(labels, "language") || "python"),
    browser: toText(environment.browser, getLabelValue(labels, "browser") || "N/A"),
    device: toText(environment.device, getLabelValue(labels, "device") || "N/A"),
    runtime: toText(environment.runtime, getLabelValue(labels, "runtime") || process.version),
  };
};

const buildTime = (data = {}, testRows = []) => {
  const starts = testRows.map((testRow) => Number(testRow.start ?? 0)).filter(Number.isFinite).filter((start) => start > 0);
  const start = Number(data.summary?.start ?? data.summary?.createdAt ?? starts[0] ?? 0);
  const stop = Number(data.summary?.stop ?? data.summary?.createdAt ?? starts[starts.length - 1] ?? start);
  const durationMs = Number(data.analytics?.duration ?? data.summary?.duration ?? Math.max(stop - start, 0));
  const executionPercent = data.statusCounts?.total ? Math.round((Number(data.statusCounts.passed ?? 0) / Number(data.statusCounts.total)) * 100) : 0;

  return {
    timestamp: toText(data.meta?.generatedAt, new Date().toISOString()),
    durationSeconds: Number((durationMs / 1000).toFixed(3)),
    executionPercent,
    start,
    stop,
    durationMs,
  };
};

const buildUnit = (data = {}) => ({
  title: "Unit",
  projectName: toText(data.variables?.Repository, data.meta?.project ?? "CFI-Care"),
  branch: toText(data.meta?.branch, process.env.GITHUB_REF_NAME || process.env.CI_COMMIT_BRANCH || process.env.BRANCH_NAME || "local"),
  pipeline: toText(data.summary?.jobHref, process.env.GITHUB_RUN_ID || process.env.CI_PIPELINE_ID || "local"),
  build: toText(data.summary?.meta?.reportId, process.env.GITHUB_RUN_NUMBER || process.env.BUILD_NUMBER || data.meta?.reportUuid || "local"),
  generatedAt: toText(data.meta?.generatedAt, new Date().toISOString()),
});

const buildHeader = (data = {}, testRows = []) => {
  const firstTest = testRows[0] ?? {};
  const statusCounts = countStatuses(testRows);
  const environment = buildEnvironment(data, firstTest);
  const time = buildTime(data, testRows);
  const coverage = buildCoverage(data);
  return {
    environment,
    totals: {
      passed: Number(data.statusCounts?.passed ?? statusCounts.passed),
      failed: Number(data.statusCounts?.failed ?? statusCounts.failed),
      skipped: Number(data.statusCounts?.skipped ?? statusCounts.skipped),
      broken: Number(data.statusCounts?.broken ?? statusCounts.broken),
      total: Number(data.statusCounts?.total ?? statusCounts.total),
      retries: Number(data.statusCounts?.retries ?? statusCounts.retries),
    },
    time,
    coverage,
  };
};

const buildGroupedTree = (testRows = []) => {
  const suiteMap = new Map();

  const ensureNode = (map, key, factory) => {
    if (!map.has(key)) map.set(key, factory());
    return map.get(key);
  };

  const updateStats = (stats, testRow) => {
    stats.total += 1;
    stats[testRow.status] = (stats[testRow.status] ?? 0) + 1;
    stats.retries += Number(testRow.retries ?? 0);
    stats.duration += Number(testRow.duration ?? 0);
  };

  for (const testRow of testRows) {
    const suiteName = toText(testRow.suite, "Suite");
    const fileName = toText(testRow.fileName, "unknown-file");
    const packageName = toText(testRow.package, "unassigned-package");
    const featureName = toText(testRow.feature, "unassigned-feature");

    const suiteNode = ensureNode(suiteMap, fileName, () => ({
      id: `file:${fileName}`,
      kind: "file",
      suite: suiteName,
      fileName,
      stats: { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, retries: 0, duration: 0 },
      packages: new Map(),
    }));
    updateStats(suiteNode.stats, testRow);

    const packageNode = ensureNode(suiteNode.packages, packageName, () => ({
      id: `package:${fileName}:${packageName}`,
      kind: "package",
      package: packageName,
      stats: { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, retries: 0, duration: 0 },
      features: new Map(),
    }));
    updateStats(packageNode.stats, testRow);

    const featureNode = ensureNode(packageNode.features, featureName, () => ({
      id: `feature:${fileName}:${packageName}:${featureName}`,
      kind: "feature",
      feature: featureName,
      stats: { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, retries: 0, duration: 0 },
      tests: [],
    }));
    updateStats(featureNode.stats, testRow);
    featureNode.tests.push(testRow);
  }

  const mapToList = (map) =>
    [...map.values()].map((node) => ({
      ...node,
      passedPercent: node.stats.total ? Math.round((node.stats.passed / node.stats.total) * 100) : 0,
      durationSeconds: Number((node.stats.duration / 1000).toFixed(3)),
      packages: node.packages ? mapToList(node.packages) : undefined,
      features: node.features ? mapToList(node.features) : undefined,
    }));

  return mapToList(suiteMap).map((node) => ({
    ...node,
    packages: toArray(node.packages).map((pkgNode) => ({
      ...pkgNode,
      features: toArray(pkgNode.features).map((featureNode) => ({
        ...featureNode,
        tests: toArray(featureNode.tests),
      })),
    })),
  }));
};

const buildConclusion = (data = {}, testRows = []) => {
  const total = Number(data.statusCounts?.total ?? testRows.length ?? 0);
  const passed = Number(data.statusCounts?.passed ?? 0);
  const failed = Number(data.statusCounts?.failed ?? 0);
  const broken = Number(data.statusCounts?.broken ?? 0);
  const skipped = Number(data.statusCounts?.skipped ?? 0);
  const retries = Number(data.statusCounts?.retries ?? 0);
  const stability = total ? Math.round((passed / total) * 100) : 0;
  const regressionCount = Number(data.analytics?.regressionCount ?? 0);
  const flakyCount = Number(data.analytics?.flakyCount ?? 0);
  const quality = Number(data.analytics?.overallQualityScore ?? Math.max(0, Math.min(100, Math.round(stability - broken - failed / 2))));

  return {
    stability,
    retired: skipped,
    flaky: flakyCount,
    fixed: Number(data.history?.fixed ?? 0),
    regressed: regressionCount,
    malfunctions: failed + broken,
    history: toArray(data.trends),
    retries,
    analytics: {
      overallQualityScore: quality,
      passedRate: Number(data.analytics?.passedRate ?? 0),
      flakyRate: Number(data.analytics?.flakyRate ?? 0),
      retryRate: Number(data.analytics?.retryRate ?? 0),
      regressionCount,
      averageDuration: Number(data.analytics?.averageDuration ?? 0),
    },
  };
};

const augmentDashboardData = (data = {}) => {
  const testRows = buildTestRows(data);
  const unit = buildUnit(data);
  const header = buildHeader(data, testRows);
  const groupedTests = buildGroupedTree(testRows);
  const conclusion = buildConclusion(data, testRows);

  return {
    ...data,
    unit,
    header,
    groupedTests,
    body: {
      groupedTests,
      totalTests: testRows.length,
      testRows,
    },
    conclusion,
  };
};

module.exports = {
  augmentDashboardData,
  buildUnit,
  buildHeader,
  buildGroupedTree,
  buildConclusion,
  inferArtifactKind,
  normalizeAttachments,
  normalizeTags,
};