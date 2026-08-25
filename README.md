# Agora Agent SDK Metrics

Daily download, clone, version, and release telemetry for Agora Agent SDKs,
collected by GitHub Actions and published as a static dashboard.

## Dashboard

```text
https://mxvar.dev/agora-agent-sdk-metric/
```

## Public API

Latest 14-day GitHub clone traffic:

```text
https://raw.githubusercontent.com/seymourtang/agora-agent-sdk-metric/main/api/v1/packages/agora-agents-go/clones/latest.json
```

Daily history retained by this repository:

```text
https://raw.githubusercontent.com/seymourtang/agora-agent-sdk-metric/main/api/v1/packages/agora-agents-go/clones/daily.json
```

Unified dashboard data for npm, PyPI, and Go:

```text
https://raw.githubusercontent.com/seymourtang/agora-agent-sdk-metric/main/api/v1/dashboard.json
```

Example:

```bash
curl -sS \
  https://raw.githubusercontent.com/seymourtang/agora-agent-sdk-metric/main/api/v1/packages/agora-agents-go/clones/latest.json \
  | jq
```

## Metric definitions

- npm uses the official npm downloads API.
- PyPI download events are aggregated by pepy.tech from PyPI data.
- Go uses GitHub repository clone traffic because public Go module proxies do
  not publish package download counts.

The `clones` metric comes from GitHub's repository traffic API. It measures
repository clones and does not include downloads served from public Go module
proxies such as `proxy.golang.org`.

GitHub only exposes a rolling 14-day window. The collector runs every day and
upserts all returned daily values into `daily.json`, allowing missed runs and
late adjustments to be recovered while they remain in that window.

## Collection

The workflow runs daily at 09:15 Asia/Shanghai and can also be started with
`workflow_dispatch`. It requires a `TRAFFIC_TOKEN` Actions secret with read
access to traffic data for `AgoraIO/agora-agents-go`.
