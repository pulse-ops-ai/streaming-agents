# Grafana Dashboards

This directory contains Grafana dashboard JSON files for the streaming-agents project.

## Dashboards

### fleet-overview.json
Comprehensive dashboard for monitoring the robot fleet health and pipeline performance.

**Rows:**
1. **Fleet Health Overview** - Risk map, distribution, active incidents
2. **Signal Agent Metrics** - Composite risk over time, z-scores, state transitions
3. **Pipeline Throughput** - Events per stage, processing latency, Bedrock calls
4. **Infrastructure Health** - Kinesis iterator age, DLQ depth, Lambda errors
5. **Incident Timeline** - Recent incidents and diagnosis events

**Variables:**
- `$asset_id` - Filter by specific asset
- `$risk_state` - Filter by risk state (nominal/elevated/critical)
- `$time_range` - Standard Grafana time picker

## Setup

### Prerequisites
1. Amazon Managed Grafana workspace deployed (via Terraform)
2. Amazon Managed Prometheus workspace deployed (via Terraform)
3. IAM Identity Center configured for Grafana authentication
4. Grafana API key with Admin role

### Import Dashboard

#### Option 1: Using the setup script (recommended)
```bash
# Create Grafana API key first (see below)
export GRAFANA_API_KEY=<your-api-key>

# Run setup script
./tools/setup-grafana.sh
```

#### Option 2: Manual import via UI
1. Open Grafana workspace URL (from Terraform output)
2. Log in via IAM Identity Center
3. Go to Dashboards → Import
4. Upload `fleet-overview.json`
5. Select data sources:
   - AMP (Prometheus)
   - CloudWatch
   - X-Ray

### Creating Grafana API Key

1. Open Grafana workspace URL
2. Navigate to Configuration → API Keys
3. Click "Add API key"
4. Name: `terraform-setup`
5. Role: `Admin`
6. Time to live: `1d` (or as needed)
7. Click "Add"
8. Copy the key and export it:
   ```bash
   export GRAFANA_API_KEY=<your-key>
   ```

## Data Sources

The dashboard requires three data sources:

### AMP (Amazon Managed Prometheus)
- **Type**: Prometheus
- **URL**: From Terraform output `prometheus_query_endpoint`
- **Auth**: AWS SigV4 (IAM role)
- **Region**: us-east-1

### CloudWatch
- **Type**: CloudWatch
- **Auth**: AWS SigV4 (IAM role)
- **Region**: us-east-1

### X-Ray
- **Type**: AWS X-Ray
- **Auth**: AWS SigV4 (IAM role)
- **Region**: us-east-1

## Metrics Reference

### Custom Prometheus Metrics (from ADOT)
- `streaming_agents_signal_agent_risk_score` - Composite risk score per asset
- `streaming_agents_signal_agent_z_scores` - Individual z-scores per metric
- `streaming_agents_signal_agent_risk_state` - Risk state (nominal/elevated/critical)
- `streaming_agents_*_processing_time_ms` - Processing latency per stage
- `streaming_agents_diagnosis_agent_bedrock_calls` - Bedrock invocation count

### AWS CloudWatch Metrics
- `AWS/Lambda` - Invocations, Errors, Duration, Throttles
- `AWS/Kinesis` - GetRecords.IteratorAgeMilliseconds, IncomingRecords
- `AWS/SQS` - ApproximateNumberOfMessagesVisible (DLQ depth)
- `AWS/DynamoDB` - ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits

## Troubleshooting

### Dashboard shows "No data"
1. Verify data sources are configured correctly
2. Check Prometheus has metrics: `aws amp query --workspace-id <id> --query-string 'up'`
3. Ensure Lambda functions are running with ADOT layer enabled
4. Check time range - metrics may take 5-10 minutes to appear

### "Permission denied" errors
1. Verify Grafana workspace IAM role has correct permissions
2. Check IAM role trust policy allows Grafana service
3. Ensure data source authentication is set to "AWS SigV4"

### Metrics not appearing in Prometheus
1. Verify Lambda functions have ADOT layer attached
2. Check Lambda environment variables for OTEL configuration
3. Verify Lambda execution role has `aps:RemoteWrite` permission
4. Check CloudWatch Logs for ADOT collector errors

## Screenshots for Article

With the pipeline running and mixed fleet (some degraded assets):

1. **Row 1: Fleet Risk Map** - Shows red/yellow/green assets
2. **Row 2: Risk Climbing** - Time series of degrading asset
3. **Row 5: Incident Timeline** - Bedrock-generated root causes
4. **Full Dashboard** - Hero image for article

## Budget Considerations

- **AMP**: ~$0.03 per 10,000 samples ingested
- **AMG**: ~$9 per editor per month
- **CloudWatch**: Included in free tier for basic metrics
- **X-Ray**: First 100,000 traces/month free

Total estimated cost: ~$10-15/month for development/demo usage.
