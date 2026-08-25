import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const NPM_PACKAGE = "agora-agents";
const PYPI_PACKAGE = "agora-agents";
const OUTPUT_FILE = "api/v1/dashboard.json";
const GO_HISTORY_FILE = "api/v1/packages/agora-agents-go/clones/daily.json";
const GO_LATEST_FILE = "api/v1/packages/agora-agents-go/clones/latest.json";

const repositories = {
  npm: "AgoraIO/agora-agents-ts",
  pypi: "AgoraIO/agora-agents-python",
  go: "AgoraIO/agora-agents-go",
};

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GH_TOKEN
    ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
    : {}),
};

async function fetchResponse(url, options = {}, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "User-Agent": "agora-agents-sdk-metric/1.0",
          ...options.headers,
        },
      });

      if (response.ok) {
        return response;
      }

      lastError = new Error(`${url} returned HTTP ${response.status}`);
      if (response.status !== 429 && response.status < 500) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError;
}

async function fetchJson(url, options = {}) {
  return (await fetchResponse(url, options)).json();
}

async function fetchText(url, options = {}) {
  return (await fetchResponse(url, options)).text();
}

function dateOnly(value) {
  return value.slice(0, 10);
}

function sumDaily(daily) {
  return daily.reduce((sum, item) => sum + item.count, 0);
}

function trailingTotal(daily, days) {
  return sumDaily(daily.slice(-days));
}

function totals(daily, knownTotal = sumDaily(daily)) {
  return {
    all: knownTotal,
    last_7_days: trailingTotal(daily, 7),
    last_30_days: trailingTotal(daily, 30),
  };
}

async function latestRelease(repository) {
  try {
    const release = await fetchJson(
      `https://api.github.com/repos/${repository}/releases/latest`,
      { headers: githubHeaders },
    );

    return {
      tag: release.tag_name,
      published_at: release.published_at,
      url: release.html_url,
      notes: release.body?.trim() || "No release notes provided.",
    };
  } catch (error) {
    console.warn(`Release lookup failed for ${repository}: ${error.message}`);
    return null;
  }
}

async function collectNpm() {
  const [metadata, packageDocument, release] = await Promise.all([
    fetchJson(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`),
    fetchJson(`https://registry.npmjs.org/${NPM_PACKAGE}`),
    latestRelease(repositories.npm),
  ]);

  const start = dateOnly(packageDocument.time.created);
  // npm download data is finalized with a delay; skip the still-open day.
  const end = dateOnly(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString());
  const range = await fetchJson(
    `https://api.npmjs.org/downloads/range/${start}:${end}/${NPM_PACKAGE}`,
  );
  const daily = range.downloads.map(({ day, downloads }) => ({
    date: day,
    count: downloads,
  }));

  return {
    id: "npm",
    name: "TypeScript SDK",
    platform: "npm",
    package: NPM_PACKAGE,
    metric: "downloads",
    metric_label: "Downloads",
    version: metadata.version,
    package_url: `https://www.npmjs.com/package/${NPM_PACKAGE}`,
    repository_url: `https://github.com/${repositories.npm}`,
    data_source_url: `https://api.npmjs.org/downloads/range/last-month/${NPM_PACKAGE}`,
    daily,
    totals: totals(daily),
    release,
  };
}

function parsePepyProject(html) {
  const totalMatch = html.match(/\\"totalDownloads\\":(\d+)/);
  const downloadsMatch = html.match(
    /\\"downloads\\":(\{.*?\}),\\"versions\\":\[/s,
  );

  if (!totalMatch || !downloadsMatch) {
    throw new Error("pepy.tech response did not contain download data");
  }

  const perVersion = JSON.parse(downloadsMatch[1].replaceAll('\\"', '"'));
  const daily = Object.entries(perVersion)
    .map(([date, versions]) => ({
      date,
      count: Object.values(versions).reduce((sum, count) => sum + count, 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    total: Number(totalMatch[1]),
    daily,
  };
}

async function collectPypi() {
  const [metadata, pepyHtml, release] = await Promise.all([
    fetchJson(`https://pypi.org/pypi/${PYPI_PACKAGE}/json`),
    fetchText(`https://pepy.tech/projects/${PYPI_PACKAGE}`),
    latestRelease(repositories.pypi),
  ]);
  const downloads = parsePepyProject(pepyHtml);

  return {
    id: "pypi",
    name: "Python SDK",
    platform: "PyPI",
    package: PYPI_PACKAGE,
    metric: "downloads",
    metric_label: "Downloads",
    version: metadata.info.version,
    package_url: `https://pypi.org/project/${PYPI_PACKAGE}/`,
    repository_url: `https://github.com/${repositories.pypi}`,
    data_source_url: `https://pepy.tech/projects/${PYPI_PACKAGE}`,
    daily: downloads.daily,
    totals: totals(downloads.daily, downloads.total),
    release,
  };
}

async function collectGo() {
  const [history, latest, release] = await Promise.all([
    readFile(GO_HISTORY_FILE, "utf8").then(JSON.parse),
    readFile(GO_LATEST_FILE, "utf8").then(JSON.parse),
    latestRelease(repositories.go),
  ]);
  const daily = history.daily.map(({ date, count }) => ({ date, count }));

  return {
    id: "go",
    name: "Go SDK",
    platform: "GitHub",
    package: repositories.go,
    metric: "clones",
    metric_label: "Repository clones",
    version: release?.tag?.replace(/^v/, "") || "unknown",
    package_url: `https://github.com/${repositories.go}`,
    repository_url: `https://github.com/${repositories.go}`,
    data_source_url: `https://api.github.com/repos/${repositories.go}/traffic/clones`,
    daily,
    totals: totals(daily),
    unique_cloners_14_days: latest.uniques,
    release,
  };
}

async function main() {
  const sdks = await Promise.all([collectNpm(), collectPypi(), collectGo()]);
  const dashboard = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    timezone: "UTC",
    sdks,
  };

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(dashboard, null, 2)}\n`);
  console.log(`Wrote ${OUTPUT_FILE} with ${sdks.length} SDKs.`);
}

await main();
