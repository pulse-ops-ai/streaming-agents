# Observability

Local observability setup: Grafana, Tempo, Loki.

## Conversation Agent Structured Logging

The conversation-agent router emits structured JSON logs to CloudWatch Logs. All events include `service: 'conversation-agent'` for filtering.

### Log Events

| Event Name | Level | Description |
|------------|-------|-------------|
| `conversation.request_received` | info | Lex fulfillment request received; includes raw intent name, channel, transcript (if enabled) |
| `conversation.intent_resolved` | info | Intent mapped to handler; includes slot values, fallback detection |
| `conversation.response_generated` | info | Handler completed successfully; includes Bedrock usage, token counts, response type, confidence |
| `conversation.request_failed` | error | Unhandled error; includes failure stage, error details, asset_id, bedrock_model_id |

### Common Fields (all events)

| Field | Type | Description |
|-------|------|-------------|
| `service` | `'conversation-agent'` | Service identifier for CloudWatch filtering |
| `component` | `'router'` | Always `router` |
| `request_id` | string | UUID per request |
| `session_id` | string | Lex session ID |
| `channel` | `'voice' \| 'text'` | Input modality |
| `provider` | `'lex'` | Always `lex` |

### Bedrock Token Usage Fields (on `response_generated` when `used_bedrock = true`)

| Field | Type |
|-------|------|
| `bedrock_model_id` | string |
| `input_tokens` | number |
| `output_tokens` | number |
| `total_tokens` | number |

### OTel Metrics (emitted when `used_bedrock = true`)

All metrics are auto-prefixed with `streaming_agents.` and tagged with `intent_name_resolved`, `model_id`, `channel`.

| Metric | Type |
|--------|------|
| `conversation_bedrock_invocations_total` | counter |
| `conversation_bedrock_duration_ms` | histogram |
| `conversation_bedrock_input_tokens_total` | gauge |
| `conversation_bedrock_output_tokens_total` | gauge |
| `conversation_bedrock_total_tokens_total` | gauge |

### Example CloudWatch Logs Insights Queries

```
# Success vs Failure breakdown
filter service = "conversation-agent"
| filter event_name in ["conversation.response_generated", "conversation.request_failed"]
| stats count(*) as requests by event_name

# p95 latency by intent
filter service = "conversation-agent" and event_name = "conversation.response_generated"
| stats pct(duration_ms, 95) as p95_ms by intent_name_resolved

# Bedrock token usage by intent
filter service = "conversation-agent" and event_name = "conversation.response_generated" and used_bedrock = 1
| stats count(*) as invocations, sum(total_tokens) as total_tokens by intent_name_resolved

# Bedrock token usage over time (5m buckets)
filter service = "conversation-agent" and event_name = "conversation.response_generated" and used_bedrock = 1
| stats sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens, sum(total_tokens) as total_tokens by bin(5m)
```

### Fleet Overview Dashboard Panels (Conversation / Bedrock)

| Panel | Type | Description |
|-------|------|-------------|
| Conversation Success vs Failure | piechart | Success/failure ratio from router logs |
| Conversation Failures by Stage | bargauge | Failure count by `failure_stage` |
| Conversation Request Failures | stat | Total failure count |
| Conversation p95 Latency by Intent | bargauge | p95 `duration_ms` per intent |
| Bedrock Token Usage by Intent | barchart | Stacked input/output tokens per intent |
| Bedrock Token Usage Over Time | timeseries | Input/output token trend over 5m bins |
