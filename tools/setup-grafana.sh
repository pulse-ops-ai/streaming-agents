#!/usr/bin/env bash
# Setup Grafana data sources and import dashboards
# Run this after terraform apply to configure Grafana workspace

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../infra/envs/aws-sandbox"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
if ! command -v terraform &> /dev/null; then
    log_error "terraform not found. Please install Terraform."
    exit 1
fi

if ! command -v aws &> /dev/null; then
    log_error "aws CLI not found. Please install AWS CLI."
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log_error "jq not found. Please install jq."
    exit 1
fi

# Get Terraform outputs
log_info "Fetching Terraform outputs..."
cd "$INFRA_DIR"

GRAFANA_URL=$(terraform output -raw grafana_endpoint 2>/dev/null || echo "")
PROMETHEUS_QUERY_ENDPOINT=$(terraform output -raw prometheus_query_endpoint 2>/dev/null || echo "")
GRAFANA_WORKSPACE_ID=$(terraform output -raw grafana_workspace_id 2>/dev/null || echo "")

if [ -z "$GRAFANA_URL" ]; then
    log_error "Could not get Grafana endpoint from Terraform outputs."
    log_error "Make sure you've run 'terraform apply' first."
    exit 1
fi

log_info "Grafana URL: $GRAFANA_URL"
log_info "Prometheus Query Endpoint: $PROMETHEUS_QUERY_ENDPOINT"
log_info "Grafana Workspace ID: $GRAFANA_WORKSPACE_ID"

# Check if Grafana API key is provided
if [ -z "${GRAFANA_API_KEY:-}" ]; then
    log_warn "GRAFANA_API_KEY environment variable not set."
    log_warn "Please create an API key in the Grafana UI:"
    log_warn "  1. Open $GRAFANA_URL"
    log_warn "  2. Go to Configuration > API Keys"
    log_warn "  3. Create a new API key with Admin role"
    log_warn "  4. Export it: export GRAFANA_API_KEY=<your-key>"
    log_warn ""
    log_warn "Then run this script again."
    exit 1
fi

# Add Prometheus data source
log_info "Adding Prometheus data source..."
curl -X POST "$GRAFANA_URL/api/datasources" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AMP",
    "type": "prometheus",
    "url": "'"$PROMETHEUS_QUERY_ENDPOINT"'",
    "access": "proxy",
    "isDefault": true,
    "jsonData": {
      "httpMethod": "POST",
      "sigV4Auth": true,
      "sigV4AuthType": "default",
      "sigV4Region": "us-east-1"
    }
  }' || log_warn "Prometheus data source may already exist"

# Add CloudWatch data source
log_info "Adding CloudWatch data source..."
curl -X POST "$GRAFANA_URL/api/datasources" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CloudWatch",
    "type": "cloudwatch",
    "jsonData": {
      "authType": "default",
      "defaultRegion": "us-east-1"
    }
  }' || log_warn "CloudWatch data source may already exist"

# Add X-Ray data source
log_info "Adding X-Ray data source..."
curl -X POST "$GRAFANA_URL/api/datasources" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "X-Ray",
    "type": "grafana-x-ray-datasource",
    "jsonData": {
      "authType": "default",
      "defaultRegion": "us-east-1"
    }
  }' || log_warn "X-Ray data source may already exist"

# Import dashboard
log_info "Importing Fleet Overview dashboard..."
DASHBOARD_JSON="$SCRIPT_DIR/../infra/grafana/dashboards/fleet-overview.json"

if [ ! -f "$DASHBOARD_JSON" ]; then
    log_error "Dashboard JSON not found at $DASHBOARD_JSON"
    exit 1
fi

curl -X POST "$GRAFANA_URL/api/dashboards/db" \
  -H "Authorization: Bearer $GRAFANA_API_KEY" \
  -H "Content-Type: application/json" \
  -d @"$DASHBOARD_JSON" || log_warn "Dashboard import may have failed"

log_info "✓ Grafana setup complete!"
log_info "Open Grafana: $GRAFANA_URL"
log_info "Dashboard: Fleet Overview - Streaming Agents"
