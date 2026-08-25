const SDK_THEME = {
  npm: {
    logo: "npm",
  },
  pypi: {
    logo: "pypi",
  },
  go: {
    logo: "go",
  },
};

const THEME_MODES = ["auto", "light", "dark"];
const themeMedia = matchMedia("(prefers-color-scheme: light)");

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat("en-US");
let dashboardData;
let dailyChart;
let weeklyChart;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function sdkTheme(id) {
  const color = cssVar(`--${id}`);
  return {
    color,
    logo: `https://cdn.simpleicons.org/${SDK_THEME[id].logo}/${color.replace("#", "")}`,
  };
}

function storedThemeMode() {
  try {
    const mode = localStorage.getItem("sdk-metric-theme") || "auto";
    return THEME_MODES.includes(mode) ? mode : "auto";
  } catch {
    return "auto";
  }
}

function resolvedTheme(mode) {
  return mode === "auto" ? (themeMedia.matches ? "light" : "dark") : mode;
}

function updateThemeButton(mode) {
  const button = document.querySelector("#themeToggle");
  const icons = { auto: "monitor", light: "sun", dark: "moon" };
  const label = `Theme: ${mode[0].toUpperCase()}${mode.slice(1)}`;
  button.dataset.mode = mode;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = `<i data-lucide="${icons[mode]}"></i>`;
}

function renderThemeAwareContent() {
  if (!dashboardData) return;
  const activeRange = document.querySelector("[data-range].active")?.dataset.range || "30";
  renderMetricCards(dashboardData.sdks);
  renderLegend(dashboardData.sdks);
  renderDailyChart(dashboardData.sdks, activeRange);
  renderWeeklyChart(dashboardData.sdks);
  renderReleases(dashboardData.sdks);
}

function applyTheme(mode, persist = true) {
  document.documentElement.dataset.theme = resolvedTheme(mode);
  document.documentElement.dataset.themeMode = mode;
  document.querySelector('meta[name="theme-color"]').content = cssVar("--bg");
  if (persist) {
    try {
      localStorage.setItem("sdk-metric-theme", mode);
    } catch {
      // The selected theme still applies for the current page session.
    }
  }
  updateThemeButton(mode);
  renderThemeAwareContent();
  lucide.createIcons();
}

function initializeTheme() {
  let mode = storedThemeMode();
  applyTheme(mode, false);
  document.querySelector("#themeToggle").addEventListener("click", () => {
    const currentIndex = THEME_MODES.indexOf(mode);
    mode = THEME_MODES[(currentIndex + 1) % THEME_MODES.length];
    applyTheme(mode);
  });
  themeMedia.addEventListener("change", () => {
    if (mode === "auto") applyTheme(mode, false);
  });
}

function formatDate(value, includeTime = false) {
  const options = includeTime
    ? { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { month: "short", day: "2-digit", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-US", options).format(new Date(value));
}

function trendFor(daily) {
  const current = daily.slice(-7).reduce((sum, item) => sum + item.count, 0);
  const previous = daily.slice(-14, -7).reduce((sum, item) => sum + item.count, 0);
  if (!previous) return { label: `${fullNumber.format(current)} / 7D`, direction: "up" };
  const delta = ((current - previous) / previous) * 100;
  return {
    label: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}% / 7D`,
    direction: delta >= 0 ? "up" : "down",
  };
}

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function releaseNoteHtml(notes) {
  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith("### "))?.slice(4);
  const body = lines.find((line) => line.startsWith("- "))?.slice(2)
    || lines.find((line) => !line.startsWith("#"))
    || "No release notes provided.";
  let safeBody = escapeHtml(body)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  if (heading) safeBody = `<strong>${escapeHtml(heading)}.</strong> ${safeBody}`;
  return safeBody;
}

function renderMetricCards(sdks) {
  const container = document.querySelector("#metricCards");
  const template = document.querySelector("#metricCardTemplate");
  container.replaceChildren();

  for (const sdk of sdks) {
    const theme = sdkTheme(sdk.id);
    const card = template.content.firstElementChild.cloneNode(true);
    const trend = trendFor(sdk.daily);
    card.style.setProperty("--sdk-color", theme.color);
    card.querySelector("img").src = theme.logo;
    card.querySelector("img").alt = `${sdk.platform} logo`;
    card.querySelector(".sdk-platform").textContent = sdk.platform;
    card.querySelector(".sdk-name").textContent = sdk.name;
    card.querySelector(".external-link").href = sdk.package_url;
    card.querySelector(".metric-total strong").textContent = compactNumber.format(sdk.totals.all);
    card.querySelector(".metric-label").textContent = `Total ${sdk.metric_label.toLowerCase()}`;
    card.querySelector(".version-chip").textContent = `VERSION ${sdk.version}`;
    card.querySelector(".trend-value").textContent = trend.label;
    card.querySelector(".trend-value").classList.toggle("down", trend.direction === "down");
    container.append(card);
  }
}

function labelsFor(sdks, range) {
  const labels = [...new Set(sdks.flatMap((sdk) => sdk.daily.map((item) => item.date)))].sort();
  return range === "all" ? labels : labels.slice(-Number(range));
}

function chartDatasets(sdks, labels, fill = false) {
  return sdks.map((sdk) => {
    const values = new Map(sdk.daily.map((item) => [item.date, item.count]));
    return {
      label: sdk.name,
      data: labels.map((date) => values.get(date) ?? null),
      borderColor: sdkTheme(sdk.id).color,
      backgroundColor: sdkTheme(sdk.id).color,
      borderWidth: 2,
      pointRadius: labels.length <= 7 ? 3 : 0,
      pointHoverRadius: 5,
      tension: 0.28,
      spanGaps: false,
      fill,
    };
  });
}

function baseChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: cssVar("--tooltip-bg"),
        borderColor: cssVar("--border-strong"),
        borderWidth: 1,
        titleColor: cssVar("--text"),
        bodyColor: cssVar("--tooltip-body"),
        padding: 12,
        callbacks: {
          label: (context) => ` ${context.dataset.label}: ${fullNumber.format(context.raw ?? 0)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: cssVar("--border") },
        ticks: {
          color: cssVar("--chart-muted"),
          font: { family: "SFMono-Regular, Consolas, monospace", size: 9 },
          maxRotation: 0,
          autoSkipPadding: 20,
          callback(value) {
            return formatDate(this.getLabelForValue(value));
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: cssVar("--chart-grid") },
        border: { display: false },
        ticks: {
          color: cssVar("--chart-muted"),
          padding: 8,
          font: { family: "SFMono-Regular, Consolas, monospace", size: 9 },
          callback: (value) => compactNumber.format(value),
        },
      },
    },
  };
}

function renderLegend(sdks) {
  document.querySelector("#dailyLegend").innerHTML = sdks
    .map((sdk) => `
      <span class="legend-item" style="--legend-color:${sdkTheme(sdk.id).color}">
        <i></i>${escapeHtml(sdk.name)} / ${escapeHtml(sdk.metric_label)}
      </span>
    `)
    .join("");
}

function renderDailyChart(sdks, range = "30") {
  const labels = labelsFor(sdks, range);
  dailyChart?.destroy();
  dailyChart = new Chart(document.querySelector("#dailyChart"), {
    type: "line",
    data: { labels, datasets: chartDatasets(sdks, labels) },
    options: baseChartOptions(),
  });
}

function renderWeeklyChart(sdks) {
  const labels = labelsFor(sdks, "7");
  const options = baseChartOptions();
  options.scales.x.stacked = false;
  options.scales.y.ticks.display = false;
  options.scales.y.grid.color = cssVar("--chart-grid-soft");
  weeklyChart?.destroy();
  weeklyChart = new Chart(document.querySelector("#weeklyChart"), {
    type: "bar",
    data: {
      labels,
      datasets: chartDatasets(sdks, labels).map((dataset) => ({
        ...dataset,
        borderWidth: 0,
        borderRadius: 1,
        maxBarThickness: 12,
      })),
    },
    options,
  });

  document.querySelector("#pulseSummary").innerHTML = sdks
    .map((sdk) => `
      <div class="pulse-item" style="--sdk-color:${sdkTheme(sdk.id).color}">
        <strong>${compactNumber.format(sdk.totals.last_7_days)}</strong>
        <span>${escapeHtml(sdk.platform)} / 7D</span>
      </div>
    `)
    .join("");
}

function renderReleases(sdks) {
  document.querySelector("#releaseCount").textContent = `${sdks.length} CHANNELS`;
  document.querySelector("#releaseList").innerHTML = sdks
    .map((sdk) => {
      const theme = sdkTheme(sdk.id);
      const release = sdk.release;
      return `
        <article class="release-row">
          <div class="release-meta">
            <span class="sdk-logo"><img src="${theme.logo}" alt="${escapeHtml(sdk.platform)} logo" /></span>
            <div>
              <h3>${escapeHtml(sdk.name)}</h3>
              <p>${release ? formatDate(release.published_at) : "NO RELEASE"}</p>
            </div>
          </div>
          <div class="release-note">
            <p>${releaseNoteHtml(release?.notes || "No release notes provided.")}</p>
          </div>
          <div class="release-actions">
            <span class="release-tag">${escapeHtml(release?.tag || sdk.version)}</span>
            <a class="external-link" href="${release?.url || sdk.repository_url}" target="_blank" rel="noreferrer" aria-label="Open release" title="Open release">
              <i data-lucide="arrow-up-right"></i>
            </a>
          </div>
        </article>
      `;
    })
    .join("");
}

function bindRangeControls(sdks) {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-range]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderDailyChart(sdks, button.dataset.range);
    });
  });
}

async function initialize() {
  const loading = document.querySelector("#loadingState");
  try {
    initializeTheme();
    const response = await fetch(`./api/v1/dashboard.json?v=${Date.now()}`);
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    dashboardData = await response.json();

    document.querySelector("#lastUpdated").textContent = `${formatDate(dashboardData.generated_at, true)} UTC`;
    renderMetricCards(dashboardData.sdks);
    renderLegend(dashboardData.sdks);
    renderDailyChart(dashboardData.sdks);
    renderWeeklyChart(dashboardData.sdks);
    renderReleases(dashboardData.sdks);
    bindRangeControls(dashboardData.sdks);
    lucide.createIcons();
    loading.classList.add("hidden");
  } catch (error) {
    console.error(error);
    loading.classList.add("error");
    loading.querySelector("p").textContent = "TELEMETRY FEED UNAVAILABLE";
  }
}

window.addEventListener("DOMContentLoaded", initialize);
