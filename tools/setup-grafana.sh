#!/usr/bin/env bash
# Setup Grafana data sources and import dashboards
# Run this after terraform apply to configure Grafana workspace
#
# Prerequisites:
#   1. aws sso login --profile streaming-agents-sandbox-kong
#   2. Create a Grafana service account token (Admin role) in the UI
#   3. export GRAFANA_API_KEY=<your-token>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../infra/envs/dev"
REGION="us-east-1"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

for cmd in terraform aws jq curl; do
  command -v "$cmd" &>/dev/null || { log_error "$cmd not found"; exit 1; }
done

# Resolve outputs — use env vars or fall back to terraform output
GRAFANA_HOST="${GRAFANA_HOST:-}"
PROMETHEUS_ENDPOINT="${PROMETHEUS_ENDPOINT:-}"
GRAFANA_WORKSPACE_ID="${GRAFANA_WORKSPACE_ID:-}"

if [ -z "$GRAFANA_HOST" ]; then
  log_info "Fetching Terraform outputs..."
  cd "$INFRA_DIR"
  GRAFANA_HOST=$(AWS_PROFILE=streaming-agents-sandbox-kong terraform output -raw grafana_endpoint 2>/dev/null) || true
  PROMETHEUS_ENDPOINT=$(AWS_PROFILE=streaming-agents-sandbox-kong terraform output -raw prometheus_query_endpoint 2>/dev/null) || true
  GRAFANA_WORKSPACE_ID=$(AWS_PROFILE=streaming-agents-sandbox-kong terraform output -raw grafana_workspace_id 2>/dev/null) || true
fi

# Fallback to known values if terraform unavailable
GRAFANA_HOST="${GRAFANA_HOST:-g-5acbf57870.grafana-workspace.us-east-1.amazonaws.com}"
PROMETHEUS_ENDPOINT="${PROMETHEUS_ENDPOINT:-https://aps-workspaces.us-east-1.amazonaws.com/workspaces/ws-e1aae1bf-50c3-45a2-a010-4b8ca5d89024/api/v1/query}"
GRAFANA_WORKSPACE_ID="${GRAFANA_WORKSPACE_ID:-g-5acbf57870}"

GRAFANA_URL="https://${GRAFANA_HOST}"

log_info "Grafana URL: $GRAFANA_URL"
log_info "Prometheus: $PROMETHEUS_ENDPOINT"
log_info "Workspace ID: $GRAFANA_WORKSPACE_ID"

if [ -z "${GRAFANA_API_KEY:-}" ]; then
  log_warn "GRAFANA_API_KEY not set."
  log_warn ""
  log_warn "Create a service account token in Grafana:"
  log_warn "  1. Open $GRAFANA_URL"
  log_warn "  2. Administration > Service Accounts > Create"
  log_warn "  3. Name: terraform-provisioner, Role: Admin"
  log_warn "  4. Create Token, copy it"
  log_warn "  5. export GRAFANA_API_KEY=<token>"
  log_warn ""
  log_warn "Then run this script again."
  exit 1
fi

# Helper to POST to Grafana API
grafana_post() {
  local path="$1"
  local data="$2"
  local resp
  resp=$(curl -s -X POST "${GRAFANA_URL}${path}" \
    -H "Authorization: Bearer $GRAFANA_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$data")
  echo "$resp" | jq . 2>/dev/null || echo "$resp"
}

# ── Data Sources ────────────────────────────────────────────────

log_info "Adding Prometheus (AMP) data source..."
grafana_post "/api/datasources" '{
  "name": "AMP",
  "type": "prometheus",
  "url": "'"$PROMETHEUS_ENDPOINT"'",
  "access": "proxy",
  "isDefault": false,
  "jsonData": {
    "httpMethod": "POST",
    "sigV4Auth": true,
    "sigV4AuthType": "default",
    "sigV4Region": "'"$REGION"'"
  }
}' && echo "" || log_warn "AMP data source may already exist"

log_info "Adding CloudWatch data source..."
grafana_post "/api/datasources" '{
  "name": "CloudWatch",
  "type": "cloudwatch",
  "isDefault": true,
  "jsonData": {
    "authType": "default",
    "defaultRegion": "'"$REGION"'"
  }
}' && echo "" || log_warn "CloudWatch data source may already exist"

log_info "Adding X-Ray data source..."
grafana_post "/api/datasources" '{
  "name": "X-Ray",
  "type": "grafana-x-ray-datasource",
  "jsonData": {
    "authType": "default",
    "defaultRegion": "'"$REGION"'"
  }
}' && echo "" || log_warn "X-Ray data source may already exist"

# ── Dashboard Import ────────────────────────────────────────────

log_info "Importing Fleet Overview dashboard..."
DASHBOARD_JSON="$SCRIPT_DIR/../infra/grafana/dashboards/fleet-overview.json"

if [ ! -f "$DASHBOARD_JSON" ]; then
  log_error "Dashboard JSON not found at $DASHBOARD_JSON"
  exit 1
fi

# Wrap dashboard JSON in the import payload
IMPORT_PAYLOAD=$(jq '{ dashboard: ., overwrite: true }' "$DASHBOARD_JSON")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${GRAFANA_URL}/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$IMPORT_PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "$BODY" | jq .
else
  log_error "Dashboard import failed (HTTP $HTTP_CODE):"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi

log_info "Grafana setup complete!"
log_info "Open: $GRAFANA_URL"
log_info "Dashboard: Fleet Overview - Streaming Agents"
