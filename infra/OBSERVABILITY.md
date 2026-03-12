# Observability Infrastructure

This document describes the observability setup for the streaming-agents project, including Amazon Managed Prometheus (AMP), Amazon Managed Grafana (AMG), CloudWatch dashboards, and AWS Distro for OpenTelemetry (ADOT) instrumentation.

## Architecture

```
┌─────────────────┐
│ Lambda Functions│
│  (with ADOT)    │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌──────────────┐
│   X-Ray Traces  │  │  Prometheus  │
│                 │  │   Metrics    │
└────────┬────────┘  └──────┬───────┘
         │                  │
         │                  │
         └──────┬───────────┘
                │
                ▼
        ┌───────────────┐
        │    Grafana    │
        │   Dashboard   │
        └───────────────┘
                │
                ▼
        ┌───────────────┐
        │  CloudWatch   │
        │   Dashboard   │
        └───────────────┘
```

## Components

### 1. Amazon Managed Prometheus (AMP)
- **Workspace**: `streaming-agents-metrics`
- **Purpose**: Store OpenTelemetry metrics from Lambda functions
- **Retention**: 150 days (default)
- **Cost**: ~$0.03 per 10,000 samples

**Metrics Collected:**
- `streaming_agents_signal_agent_risk_score` - Composite risk per asset
- `streaming_agents_signal_agent_z_scores` - Individual z-scores
- `streaming_agents_*_processing_time_ms` - Processing latency
- `streaming_agents_diagnosis_agent_bedrock_calls` - Bedrock invocations

### 2. Amazon Managed Grafana (AMG)
- **Workspace**: `streaming-agents-dashboard`
- **Authentication**: IAM Identity Center (SSO)
- **Data Sources**: Prometheus, CloudWatch, X-Ray
- **Cost**: ~$9 per editor per month

**Dashboards:**
- `fleet-overview.json` - Comprehensive fleet health and pipeline monitoring

### 3. CloudWatch Dashboard
- **Name**: `streaming-agents-fleet-overview`
- **Purpose**: Fallback monitoring without ADOT setup
- **Cost**: Free (within AWS Free Tier)

**Panels:**
- Lambda invocations, errors, duration
- DynamoDB consumed capacity
- CloudWatch Logs

### 4. AWS Distro for OpenTelemetry (ADOT)
- **Layer**: `aws-otel-nodejs-amd64-ver-1-18-1:3`
- **Purpose**: Collect and export traces/metrics from Lambda
- **Exporters**: OTLP (Prometheus), X-Ray

## Setup

### Prerequisites
- AWS CLI configured with appropriate credentials
- Terraform >= 1.5
- IAM Identity Center configured (for Grafana)
- jq installed (for setup scripts)

### Step 1: Deploy Infrastructure

```bash
cd infra/envs/aws-sandbox
terraform init
terraform plan
terraform apply
```

This creates:
- Amazon Managed Prometheus workspace
- Amazon Managed Grafana workspace
- CloudWatch dashboard
- IAM roles and policies
- Lambda functions with X-Ray tracing enabled

### Step 2: Verify Deployment

```bash
./tools/validate-observability.sh
```

This checks:
- Terraform outputs
- Prometheus workspace exists
- Grafana workspace exists
- CloudWatch dashboard exists
- Lambda X-Ray configuration
- IAM permissions

### Step 3: Configure Grafana

```bash
# Create API key in Grafana UI first
export GRAFANA_API_KEY=<your-key>

# Run setup script
./tools/setup-grafana.sh
```

This configures:
- Prometheus data source (with SigV4 auth)
- CloudWatch data source
- X-Ray data source
- Imports fleet-overview dashboard

### Step 4: Enable ADOT (Optional)

To enable full OpenTelemetry instrumentation:

1. Edit `infra/envs/aws-sandbox/lambda.tf`
2. Uncomment the ADOT layer and environment variables
3. Run `terraform apply`

```hcl
layers = [
  "arn:aws:lambda:us-east-1:901920570463:layer:aws-otel-nodejs-amd64-ver-1-18-1:3"
]

environment {
  variables = {
    AWS_LAMBDA_EXEC_WRAPPER      = "/opt/otel-handler"
    OTEL_EXPORTER_OTLP_ENDPOINT  = aws_prometheus_workspace.metrics.prometheus_endpoint
    OTEL_TRACES_EXPORTER         = "otlp"
    OTEL_METRICS_EXPORTER        = "otlp"
    OTEL_RESOURCE_ATTRIBUTES     = "service.name=conversation-agent"
  }
}
```

### Step 5: Verify Metrics

After running the pipeline for 5-10 minutes:

```bash
# Check Prometheus has metrics
WORKSPACE_ID=$(terraform output -raw prometheus_workspace_id)
aws amp query --workspace-id "$WORKSPACE_ID" \
  --query-string 'up' \
  --region us-east-1
```

### Step 6: Access Dashboards

**CloudWatch Dashboard:**
```bash
DASHBOARD_NAME=$(terraform output -raw cloudwatch_dashboard_name)
echo "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=$DASHBOARD_NAME"
```

**Grafana Dashboard:**
```bash
GRAFANA_URL=$(terraform output -raw grafana_endpoint)
echo "$GRAFANA_URL"
# Log in via IAM Identity Center
# Navigate to Dashboards → Fleet Overview
```

## Dashboards

### Fleet Overview Dashboard

**Row 1: Fleet Health Overview**
- Fleet Risk Map - Table showing all assets color-coded by risk
- Risk Distribution - Pie chart of assets by risk state
- Active Incidents - Count of open incidents

**Row 2: Signal Agent Metrics**
- Composite Risk Over Time - Time series per asset
- Z-Scores - Individual z-scores for selected asset
- Risk State Transitions - Annotation overlay

**Row 3: Pipeline Throughput**
- Events Per Stage - Stacked bar per pipeline stage
- Processing Latency - p50/p95/p99 per stage
- Bedrock Calls - Counter for diagnosis agent

**Row 4: Infrastructure Health**
- Kinesis Iterator Age - Leading indicator of lag
- DLQ Depth - Should be 0
- Lambda Errors - Stacked bar per function

**Row 5: Incident Timeline**
- Incident Table - Recent incidents with root causes
- Diagnosis Events - Log panel from diagnosis agent

### Variables
- `$asset_id` - Filter by specific asset
- `$risk_state` - Filter by risk state (nominal/elevated/critical)
- `$time_range` - Standard Grafana time picker

## IAM Permissions

### Lambda Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "aps:RemoteWrite"
      ],
      "Resource": "arn:aws:aps:us-east-1:ACCOUNT:workspace/WORKSPACE_ID"
    },
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}
```

### Grafana Workspace Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "aps:QueryMetrics",
        "aps:GetSeries",
        "aps:GetLabels"
      ],
      "Resource": "arn:aws:aps:us-east-1:ACCOUNT:workspace/WORKSPACE_ID"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetMetricData",
        "cloudwatch:ListMetrics"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "xray:GetTraceSummaries",
        "xray:BatchGetTraces"
      ],
      "Resource": "*"
    }
  ]
}
```

## Troubleshooting

### No metrics in Prometheus
1. Verify ADOT layer is attached to Lambda
2. Check Lambda environment variables for OTEL configuration
3. Verify Lambda execution role has `aps:RemoteWrite` permission
4. Check CloudWatch Logs for ADOT collector errors:
   ```bash
   aws logs tail /aws/lambda/streaming-agents-conversation-agent --follow
   ```

### Grafana shows "No data"
1. Verify data sources are configured correctly
2. Check time range - metrics may take 5-10 minutes to appear
3. Ensure Lambda functions have been invoked
4. Verify Grafana workspace IAM role has correct permissions

### CloudWatch Dashboard empty
1. Verify Lambda functions exist and have been invoked
2. Check DynamoDB tables exist
3. Wait 5 minutes for metrics to propagate

### X-Ray traces not appearing
1. Verify Lambda tracing mode is "Active"
2. Check Lambda execution role has X-Ray permissions
3. Ensure Lambda has been invoked
4. Check X-Ray console for traces

## Cost Optimization

### Development/Demo
- Use CloudWatch Dashboard (free tier)
- Enable ADOT only when needed
- Use Grafana viewer role instead of editor
- Set Prometheus retention to 30 days

### Production
- Enable ADOT on all Lambda functions
- Use Grafana editor role for team
- Set Prometheus retention to 150 days
- Configure CloudWatch Logs retention

### Estimated Costs
- **AMP**: $0.03 per 10,000 samples (~$5-10/month for demo)
- **AMG**: $9 per editor per month
- **CloudWatch**: Free tier covers basic metrics
- **X-Ray**: First 100,000 traces/month free
- **Total**: ~$15-20/month for development

## Screenshots for Article

With the pipeline running and mixed fleet (some degraded assets):

1. **Fleet Risk Map** - Shows red/yellow/green assets
   - Path: Grafana → Fleet Overview → Row 1
   - Highlight: Color-coded risk states

2. **Risk Climbing** - Time series of degrading asset
   - Path: Grafana → Fleet Overview → Row 2
   - Highlight: Upward trend in composite risk

3. **Incident Timeline** - Bedrock-generated root causes
   - Path: Grafana → Fleet Overview → Row 5
   - Highlight: AI-generated diagnoses

4. **Full Dashboard** - Hero image for article
   - Path: Grafana → Fleet Overview
   - Highlight: All panels populated with data

## References

- [Amazon Managed Prometheus](https://docs.aws.amazon.com/prometheus/)
- [Amazon Managed Grafana](https://docs.aws.amazon.com/grafana/)
- [AWS Distro for OpenTelemetry](https://aws-otel.github.io/)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Grafana Dashboard Best Practices](https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/)
