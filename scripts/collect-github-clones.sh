#!/usr/bin/env bash

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"

target_repository="${TARGET_REPOSITORY:-AgoraIO/agora-agents-go}"
package_name="${PACKAGE_NAME:-agora-agents-go}"
output_root="${OUTPUT_ROOT:-api/v1/packages}"
output_dir="${output_root}/${package_name}/clones"
snapshot_dir="${output_dir}/snapshots"
snapshot_date="$(date -u +%F)"
collected_at="$(date -u +%FT%TZ)"
latest_file="${output_dir}/latest.json"
history_file="${output_dir}/daily.json"

mkdir -p "${snapshot_dir}"

response_file="$(mktemp)"
history_tmp="$(mktemp)"
trap 'rm -f "${response_file}" "${history_tmp}"' EXIT

gh api "repos/${target_repository}/traffic/clones?per=day" > "${response_file}"

jq \
  --arg repository "${target_repository}" \
  --arg collected_at "${collected_at}" \
  '{
    schema_version: 1,
    provider: "github",
    repository: $repository,
    metric: "clones",
    collected_at: $collected_at,
    window_days: (.clones | length),
    count: .count,
    uniques: .uniques,
    daily: [
      .clones[] | {
        date: (.timestamp | split("T")[0]),
        count: .count,
        uniques: .uniques
      }
    ]
  }' "${response_file}" > "${latest_file}"

cp "${latest_file}" "${snapshot_dir}/${snapshot_date}.json"

if [[ -f "${history_file}" ]]; then
  jq \
    --slurpfile latest "${latest_file}" \
    '{
      schema_version: 1,
      provider: "github",
      repository: $latest[0].repository,
      metric: "clones",
      updated_at: $latest[0].collected_at,
      daily: (
        [.daily[], $latest[0].daily[]]
        | group_by(.date)
        | map(last)
        | sort_by(.date)
      )
    }' "${history_file}" > "${history_tmp}"
else
  jq '{
    schema_version,
    provider,
    repository,
    metric,
    updated_at: .collected_at,
    daily
  }' "${latest_file}" > "${history_tmp}"
fi

mv "${history_tmp}" "${history_file}"

echo "Collected ${target_repository} clone traffic at ${collected_at}."
