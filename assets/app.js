const SDK_THEME = {
  npm: {
    color: "#cb3837",
    logo: "https://cdn.simpleicons.org/npm/CB3837",
  },
  pypi: {
    color: "#ffd343",
    logo: "https://cdn.simpleicons.org/pypi/FFD343",
  },
  go: {
    color: "#00add8",
    logo: "https://cdn.simpleicons.org/go/00ADD8",
  },
};

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const fullNumber = new Intl.NumberFormat("en-US");
let dashboardData;
let dailyChart;
let weeklyChart;

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
    const theme = SDK_THEME[sdk.id];
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
      borderColor: SDK_THEME[sdk.id].color,
      backgroundColor: SDK_THEME[sdk.id].color,
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
        backgroundColor: "#171b1f",
        borderColor: "#3b464c",
        borderWidth: 1,
        titleColor: "#eff4f2",
        bodyColor: "#c4ccca",
        padding: 12,
        callbacks: {
          label: (context) => ` ${context.dataset.label}: ${fullNumber.format(context.raw ?? 0)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: "#293036" },
        ticks: {
          color: "#707b78",
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
        grid: { color: "rgba(59, 70, 76, 0.38)" },
        border: { display: false },
        ticks: {
          color: "#707b78",
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
      <span class="legend-item" style="--legend-color:${SDK_THEME[sdk.id].color}">
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
  options.scales.y.grid.color = "rgba(59, 70, 76, 0.26)";
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
      <div class="pulse-item" style="--sdk-color:${SDK_THEME[sdk.id].color}">
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
      const theme = SDK_THEME[sdk.id];
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
