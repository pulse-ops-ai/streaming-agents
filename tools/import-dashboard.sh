#!/usr/bin/env bash
set -euo pipefail
GRAFANA_URL="https://g-5acbf57870.grafana-workspace.us-east-1.amazonaws.com"
PAYLOAD=$(jq '{dashboard:.,overwrite:true}' "$(dirname "$0")/../infra/grafana/dashboards/fleet-overview.json")
curl -s --max-time 15 -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY:?Set GRAFANA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .
