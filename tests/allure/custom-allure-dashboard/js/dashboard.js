(function () {
  const DATA_URL = "./plugins/custom-dashboard/data.json";
  const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  const toText = (value, fallback = "") => {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text.length ? text : fallback;
  };
  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const formatInteger = (value) => new Intl.NumberFormat().format(Math.round(toNumber(value, 0)));
  const formatPercent = (value) => `${Math.round(toNumber(value, 0))}%`;
  const formatDuration = (milliseconds) => `${toNumber(milliseconds, 0)} ms`;
  const formatSeconds = (milliseconds) => `${(toNumber(milliseconds, 0) / 1000).toFixed(3)} s`;

  const createElement = (tagName, className, content) => {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (content !== undefined) element.innerHTML = content;
    return element;
  };

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.src === src);
      if (existing) {
        resolve(existing);
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });

  const ensureRoot = () => {
    const root = document.querySelector("#custom-dashboard");
    if (!root) {
      throw new Error("Missing custom dashboard root");
    }
    root.classList.add("custom-dashboard-shell");
    return root;
  };

  const statusClass = (status) => `status-badge status-${toText(status, "unknown").toLowerCase()}`;

  const badgeMarkup = (label, value, className = "") => `
    <div class="metric-chip ${className}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;

  const textBlock = (title, lines) => `
    <article class="text-block">
      <h3>${escapeHtml(title)}</h3>
      <div class="text-block-content">
        ${lines.map(([label, value]) => `<div class="text-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
      </div>
    </article>
  `;

  const groupSummary = (group) => {
    const passed = toNumber(group.stats?.passed);
    const total = toNumber(group.stats?.total);
    const retries = toNumber(group.stats?.retries);
    const passRate = total ? Math.round((passed / total) * 100) : 0;
    return `
      <div class="group-summary-copy">
        <div>
          <h4>${escapeHtml(group.kind === "file" ? group.fileName : group.kind === "package" ? group.package : group.feature || group.name || group.fileName)}</h4>
          <p>${escapeHtml(group.kind === "file" ? group.suite : group.kind)}</p>
        </div>
        <div class="group-summary-stats">
          <span>${formatInteger(total)} tests</span>
          <span>${passRate}% passed</span>
          <span>${formatInteger(retries)} retries</span>
        </div>
      </div>
    `;
  };

  const renderArtifact = (artifact) => {
    const href = `./data/test-results/${encodeURIComponent(artifact.source || "")}`;
    const kind = toText(artifact.kind, "file");
    if (!artifact.source) {
      return `<span class="artifact-chip">${escapeHtml(artifact.name)}</span>`;
    }

    if (kind === "screenshot") {
      return `<button class="artifact-chip artifact-preview" type="button" data-artifact="${escapeHtml(JSON.stringify(artifact))}"><img src="${href}" alt="${escapeHtml(artifact.name)}" loading="lazy" /><span>${escapeHtml(artifact.name)}</span></button>`;
    }

    if (kind === "video") {
      return `<button class="artifact-chip" type="button" data-artifact="${escapeHtml(JSON.stringify(artifact))}">▶ ${escapeHtml(artifact.name)}</button>`;
    }

    return `<button class="artifact-chip" type="button" data-artifact="${escapeHtml(JSON.stringify(artifact))}">${escapeHtml(artifact.name)}</button>`;
  };

  const renderTags = (tags = []) =>
    tags.length
      ? `<div class="tag-group">${tags.map((tag) => `<span class="tag-pill tag-pill-${escapeHtml(tag.toLowerCase())}">${escapeHtml(tag)}</span>`).join("")}</div>`
      : `<div class="tag-group tag-group-empty">No tags</div>`;

  const renderTestRow = (test) => {
    const artifactMarkup = toArray(test.attachments).length
      ? `<div class="artifact-group">${toArray(test.attachments).map(renderArtifact).join("")}</div>`
      : `<div class="artifact-group artifact-group-empty">No artifacts</div>`;

    const errorMarkup = test.error?.stack || test.error?.message || test.errorPreview
      ? `<button class="error-preview" type="button" data-error="${escapeHtml(JSON.stringify(test.error ?? { preview: test.errorPreview }))}">${escapeHtml(test.errorPreview || test.error?.message || "View error")}</button>`
      : `<span class="error-preview error-preview-empty">No error</span>`;

    return `
      <article class="test-row" data-status="${escapeHtml(test.status)}">
        <div class="test-grid">
          <div><span class="field-label">Suite</span><strong>${escapeHtml(test.suite || "-")}</strong></div>
          <div><span class="field-label">TestName</span><strong>${escapeHtml(test.name)}</strong></div>
          <div><span class="field-label">TestID</span><strong>${escapeHtml(test.id)}</strong></div>
          <div><span class="field-label">RunID</span><strong>${escapeHtml(test.historyId || "-")}</strong></div>
          <div><span class="field-label">Status</span><strong class="${statusClass(test.status)}">${escapeHtml(test.status)}</strong></div>
          <div><span class="field-label">Duration</span><strong>${escapeHtml(formatDuration(test.duration))}</strong></div>
          <div><span class="field-label">Trend</span><strong>${escapeHtml(test.trend || "stable")}</strong></div>
          <div><span class="field-label">Error</span>${errorMarkup}</div>
          <div><span class="field-label">Artifacts</span>${artifactMarkup}</div>
          <div><span class="field-label">Tags</span>${renderTags(test.tags || [])}</div>
        </div>
      </article>
    `;
  };

  const renderGroup = (group) => {
    const childPackages = toArray(group.packages);
    const childFeatures = toArray(group.features);
    const tests = toArray(group.tests);
    const childrenMarkup = childPackages.length
      ? childPackages.map(renderGroup).join("")
      : childFeatures.length
        ? childFeatures.map(renderGroup).join("")
        : tests.map(renderTestRow).join("");

    return `
      <article class="group-card group-card-${escapeHtml(group.kind)}">
        <button class="group-toggle" type="button" aria-expanded="false">
          ${groupSummary(group)}
        </button>
        <div class="group-body" hidden>
          ${childrenMarkup}
        </div>
      </article>
    `;
  };

  const renderSectionCard = (id, className, title, body) => `
    <section class="panel-card ${className}" id="${id}">
      <header class="section-card-header">
        <div>
          <span class="section-kicker">${escapeHtml(title)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </header>
      ${body}
    </section>
  `;

  const renderDashboard = async (data) => {
    const unit = data.unit ?? {};
    const header = data.header ?? {};
    const body = data.body ?? {};
    const conclusion = data.conclusion ?? {};
    const root = ensureRoot();

    root.innerHTML = `
      <div class="dashboard-bg"></div>
      <main class="dashboard-main">
        <section class="unit-card panel-card" id="unit">
          <div class="unit-banner">
            <div class="unit-title-group">
              <span class="section-kicker">Unit</span>
              <h1>${escapeHtml(unit.title || "Unit")}</h1>
              <p>${escapeHtml(unit.projectName || "Project")}</p>
            </div>
            <div class="unit-meta-grid">
              ${badgeMarkup("Project", unit.projectName || "-")}
              ${badgeMarkup("Branch", unit.branch || "-")}
              ${badgeMarkup("Pipeline", unit.pipeline || "-")}
              ${badgeMarkup("Build", unit.build || "-")}
              ${badgeMarkup("Generated", unit.generatedAt || "-")}
            </div>
          </div>
        </section>

        ${renderSectionCard(
          "header",
          "header-card",
          "Header",
          `
            <div class="header-grid">
              ${textBlock("Environment Setup", [
                ["OS", header.environment?.os || "-"],
                ["Framework", header.environment?.framework || "-"],
                ["Programming Language", header.environment?.language || "-"],
              ])}
              ${textBlock("Totals", [
                ["Passed", header.totals?.passed ?? 0],
                ["Failed", header.totals?.failed ?? 0],
                ["Skipped", header.totals?.skipped ?? 0],
                ["Broken", header.totals?.broken ?? 0],
                ["Time", formatSeconds(header.time?.durationMs ?? 0)],
              ])}
              ${textBlock("Time", [
                ["timestamp", header.time?.timestamp || "-"],
                ["duration in seconds", header.time?.durationSeconds ?? 0],
                ["execution %", formatPercent(header.time?.executionPercent ?? 0)],
              ])}
              ${header.coverage
                ? textBlock("Coverage", [
                    ["line", header.coverage.line ?? "-"],
                    ["branch", header.coverage.branch ?? "-"],
                    ["function coverage", header.coverage.function ?? "-"],
                  ])
                : `<article class="text-block"><h3>Coverage</h3><p class="muted-note">coverage data unavailable</p></article>`}
            </div>
          `,
        )}

        ${renderSectionCard(
          "body",
          "body-card",
          "Body",
          `
            <div class="body-intro">
              <p>Test Cases grouped by suite file, package, and feature.</p>
              <div class="toolbar">
                <input id="search-box" type="search" placeholder="Search tests, tags, errors, artifacts" />
                <select id="status-filter">
                  <option value="all">All statuses</option>
                  <option value="passed">Passed</option>
                  <option value="failed">Failed</option>
                  <option value="broken">Broken</option>
                  <option value="skipped">Skipped</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
            <div class="group-list" id="group-list">
              ${toArray(body.groupedTests).map(renderGroup).join("")}
            </div>
          `,
        )}

        ${renderSectionCard(
          "conclusion",
          "conclusion-card",
          "Conclusion",
          `
            <div class="conclusion-grid">
              <div class="conclusion-summary">
                ${badgeMarkup("Stability", formatPercent(conclusion.stability ?? 0), "badge-green")}
                ${badgeMarkup("Retired", formatInteger(conclusion.retired ?? 0), "badge-green")}
                ${badgeMarkup("Flaky", formatInteger(conclusion.flaky ?? 0), "badge-green")}
                ${badgeMarkup("Fixed", formatInteger(conclusion.fixed ?? 0), "badge-green")}
                ${badgeMarkup("Regressed", formatInteger(conclusion.regressed ?? 0), "badge-green")}
                ${badgeMarkup("Malfunctions", formatInteger(conclusion.malfunctions ?? 0), "badge-green")}
                ${badgeMarkup("History", formatInteger(toArray(conclusion.history).length), "badge-green")}
                ${badgeMarkup("Retries", formatInteger(conclusion.retries ?? 0), "badge-green")}
              </div>
              <div class="conclusion-analytics">
                <article class="score-card">
                  <h3>Overall Quality</h3>
                  <div class="score-ring">
                    <canvas id="quality-chart" height="220"></canvas>
                    <div class="score-value">${formatPercent(conclusion.analytics?.overallQualityScore ?? 0)}</div>
                  </div>
                  <p>Pass rate, flaky rate, retry rate, and regressions combined into a single quality indicator.</p>
                </article>
                <article class="mini-card">
                  <h3>Analytics</h3>
                  <div class="mini-card-grid">
                    ${badgeMarkup("Passed Rate", formatPercent(conclusion.analytics?.passedRate ?? 0))}
                    ${badgeMarkup("Flaky Rate", formatPercent(conclusion.analytics?.flakyRate ?? 0))}
                    ${badgeMarkup("Retry Rate", formatPercent(conclusion.analytics?.retryRate ?? 0))}
                    ${badgeMarkup("Average Duration", formatDuration(conclusion.analytics?.averageDuration ?? 0))}
                  </div>
                </article>
              </div>
            </div>
          `,
        )}
      </main>
    `;

    const toggleButtons = Array.from(root.querySelectorAll(".group-toggle"));
    for (const button of toggleButtons) {
      button.addEventListener("click", () => {
        const card = button.closest(".group-card");
        const bodyElement = card.querySelector(".group-body");
        const expanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!expanded));
        bodyElement.hidden = expanded;
      });
    }

    const searchBox = root.querySelector("#search-box");
    const statusFilter = root.querySelector("#status-filter");
    const filterGroups = () => {
      const query = toText(searchBox.value).toLowerCase();
      const selectedStatus = toText(statusFilter.value, "all").toLowerCase();
      for (const card of root.querySelectorAll(".group-card, .test-row")) {
        const text = card.textContent.toLowerCase();
        const matchesQuery = !query || text.includes(query);
        const matchesStatus = selectedStatus === "all" || text.includes(selectedStatus);
        card.style.display = matchesQuery && matchesStatus ? "" : "none";
      }
    };

    searchBox.addEventListener("input", filterGroups);
    statusFilter.addEventListener("change", filterGroups);

    const artifactDialog = document.createElement("dialog");
    artifactDialog.className = "artifact-dialog";
    artifactDialog.innerHTML = `
      <form method="dialog" class="artifact-dialog-shell">
        <button class="dialog-close" value="cancel" aria-label="Close">×</button>
        <div class="artifact-dialog-body"></div>
      </form>
    `;
    document.body.appendChild(artifactDialog);

    const openArtifactDialog = async (artifact) => {
      const bodyElement = artifactDialog.querySelector(".artifact-dialog-body");
      const href = `./data/test-results/${encodeURIComponent(artifact.source || "")}`;
      if (artifact.kind === "screenshot") {
        bodyElement.innerHTML = `<img src="${href}" alt="${escapeHtml(artifact.name)}" class="artifact-full-image" />`;
      } else if (artifact.kind === "video") {
        bodyElement.innerHTML = `<video src="${href}" controls autoplay class="artifact-full-media"></video>`;
      } else {
        const response = await fetch(href);
        const text = response.ok ? await response.text() : "Unable to load artifact";
        bodyElement.innerHTML = `<pre class="artifact-full-text">${escapeHtml(text)}</pre>`;
      }
      artifactDialog.showModal();
    };

    const openErrorDialog = async (error) => {
      const bodyElement = artifactDialog.querySelector(".artifact-dialog-body");
      bodyElement.innerHTML = `<pre class="artifact-full-text">${escapeHtml(error.stack || error.message || error.preview || "No error details")}</pre>`;
      artifactDialog.showModal();
    };

    root.querySelectorAll("[data-artifact]").forEach((button) => {
      button.addEventListener("click", () => {
        openArtifactDialog(JSON.parse(button.getAttribute("data-artifact")));
      });
    });

    root.querySelectorAll("[data-error]").forEach((button) => {
      button.addEventListener("click", () => {
        openErrorDialog(JSON.parse(button.getAttribute("data-error")));
      });
    });

    await loadScript(CHART_JS_URL);
    if (window.Chart) {
      const theme = { text: getComputedStyle(document.body).color || "#d9f0ff", grid: "rgba(148, 163, 184, 0.2)", accent: ["#38bdf8", "#22c55e", "#f97316", "#ef4444"] };
      new window.Chart(root.querySelector("#quality-chart"), {
        type: "doughnut",
        data: {
          labels: ["Quality", "Remaining"],
          datasets: [{ data: [toNumber(conclusion.analytics?.overallQualityScore, 0), Math.max(0, 100 - toNumber(conclusion.analytics?.overallQualityScore, 0))], backgroundColor: ["#22c55e", "rgba(148, 163, 184, 0.18)"] }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "76%",
          plugins: { legend: { display: false } },
        },
      });
    }
  };

  fetch(DATA_URL)
    .then((response) => response.json())
    .then((data) => renderDashboard(data))
    .catch((error) => {
      console.error("Custom dashboard failed to load", error);
      const root = ensureRoot();
      root.innerHTML = `<div class="dashboard-error"><h1>Dashboard failed to load</h1><pre>${escapeHtml(error.message)}</pre></div>`;
    });
})();