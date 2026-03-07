#!/usr/bin/env bash
# Validate observability infrastructure setup
# Checks Prometheus, Grafana, CloudWatch, and ADOT configuration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../infra/envs/aws-sandbox"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_step() { echo -e "${BLUE}▶${NC} $1"; }

ERRORS=0

# Step 1: Check Terraform outputs
log_step "Step 1: Checking Terraform outputs..."
cd "$INFRA_DIR"

if ! terraform output prometheus_endpoint &>/dev/null; then
    log_error "Prometheus endpoint not found in Terraform outputs"
    log_warn "Run: cd infra/envs/aws-sandbox && terraform apply"
    ERRORS=$((ERRORS + 1))
else
    PROMETHEUS_ENDPOINT=$(terraform output -raw prometheus_endpoint)
    log_info "Prometheus endpoint: $PROMETHEUS_ENDPOINT"
fi

if ! terraform output grafana_endpoint &>/dev/null; then
    log_error "Grafana endpoint not found in Terraform outputs"
    ERRORS=$((ERRORS + 1))
else
    GRAFANA_ENDPOINT=$(terraform output -raw grafana_endpoint)
    log_info "Grafana endpoint: $GRAFANA_ENDPOINT"
fi

if ! terraform output cloudwatch_dashboard_name &>/dev/null; then
    log_error "CloudWatch dashboard not found in Terraform outputs"
    ERRORS=$((ERRORS + 1))
else
    DASHBOARD_NAME=$(terraform output -raw cloudwatch_dashboard_name)
    log_info "CloudWatch dashboard: $DASHBOARD_NAME"
fi

# Step 2: Verify Prometheus workspace
log_step "Step 2: Verifying Amazon Managed Prometheus..."
if aws amp list-workspaces --query 'workspaces[?alias==`streaming-agents-metrics`]' --output json | jq -e '.[0]' &>/dev/null; then
    WORKSPACE_ID=$(aws amp list-workspaces --query 'workspaces[?alias==`streaming-agents-metrics`].workspaceId' --output text)
    log_info "Prometheus workspace exists: $WORKSPACE_ID"

    # Try to query metrics
    log_step "  Checking for metrics..."
    if aws amp query --workspace-id "$WORKSPACE_ID" --query-string 'up' --region us-east-1 &>/dev/null; then
        log_info "  Prometheus is queryable"
    else
        log_warn "  No metrics found yet (this is normal if ADOT not configured)"
    fi
else
    log_error "Prometheus workspace 'streaming-agents-metrics' not found"
    ERRORS=$((ERRORS + 1))
fi

# Step 3: Verify Grafana workspace
log_step "Step 3: Verifying Amazon Managed Grafana..."
if aws grafana list-workspaces --query 'workspaces[?name==`streaming-agents-dashboard`]' --output json | jq -e '.[0]' &>/dev/null; then
    log_info "Grafana workspace exists"
    log_info "  URL: $GRAFANA_ENDPOINT"
    log_warn "  Note: Requires IAM Identity Center for authentication"
else
    log_error "Grafana workspace 'streaming-agents-dashboard' not found"
    ERRORS=$((ERRORS + 1))
fi

# Step 4: Verify CloudWatch dashboard
log_step "Step 4: Verifying CloudWatch dashboard..."
if aws cloudwatch get-dashboard --dashboard-name "$DASHBOARD_NAME" &>/dev/null; then
    log_info "CloudWatch dashboard exists: $DASHBOARD_NAME"
    DASHBOARD_URL="https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=$DASHBOARD_NAME"
    log_info "  URL: $DASHBOARD_URL"
else
    log_error "CloudWatch dashboard not found"
    ERRORS=$((ERRORS + 1))
fi

# Step 5: Check Lambda X-Ray tracing
log_step "Step 5: Checking Lambda X-Ray configuration..."
FUNCTION_NAME="streaming-agents-conversation-agent"
if aws lambda get-function-configuration --function-name "$FUNCTION_NAME" --query 'TracingConfig.Mode' --output text | grep -q "Active"; then
    log_info "X-Ray tracing enabled on $FUNCTION_NAME"
else
    log_warn "X-Ray tracing not active on $FUNCTION_NAME"
    log_warn "  Update lambda.tf to enable X-Ray"
fi

# Step 6: Check Lambda IAM permissions
log_step "Step 6: Checking Lambda IAM permissions..."
ROLE_NAME="streaming-agents-conversation-agent-role"

# Check X-Ray permissions
if aws iam list-role-policies --role-name "$ROLE_NAME" --query 'PolicyNames' --output text | grep -q "xray"; then
    log_info "X-Ray permissions attached to Lambda role"
else
    log_warn "X-Ray permissions not found on Lambda role"
fi

# Check Prometheus permissions
if aws iam list-role-policies --role-name "$ROLE_NAME" --query 'PolicyNames' --output text | grep -q "prometheus"; then
    log_info "Prometheus write permissions attached to Lambda role"
else
    log_warn "Prometheus write permissions not found on Lambda role"
    log_warn "  ADOT layer will not be able to send metrics"
fi

# Step 7: Check ADOT layer (if Lambda exists)
log_step "Step 7: Checking ADOT layer configuration..."
if aws lambda get-function --function-name "$FUNCTION_NAME" --query 'Configuration.Layers[*].Arn' --output text | grep -q "aws-otel"; then
    log_info "ADOT layer attached to $FUNCTION_NAME"
else
    log_warn "ADOT layer not attached to $FUNCTION_NAME"
    log_warn "  Uncomment ADOT layer in lambda.tf to enable metrics"
fi

# Step 8: Check CloudWatch Log Groups
log_step "Step 8: Checking CloudWatch Log Groups..."
LOG_GROUP="/aws/lambda/$FUNCTION_NAME"
if aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --query 'logGroups[0].logGroupName' --output text | grep -q "$LOG_GROUP"; then
    log_info "CloudWatch Log Group exists: $LOG_GROUP"
else
    log_warn "CloudWatch Log Group not found (will be created on first invocation)"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    log_info "All checks passed! Observability infrastructure is ready."
    echo ""
    echo "Next steps:"
    echo "  1. Open CloudWatch Dashboard: https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=$DASHBOARD_NAME"
    echo "  2. Open Grafana: $GRAFANA_ENDPOINT"
    echo "  3. Run pipeline for 5 minutes to generate metrics"
    echo "  4. Import Grafana dashboard: ./tools/setup-grafana.sh"
else
    log_error "$ERRORS error(s) found. Please fix the issues above."
    exit 1
fi
