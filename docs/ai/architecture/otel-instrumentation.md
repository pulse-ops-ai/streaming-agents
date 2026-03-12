# Architecture: OpenTelemetry Instrumentation

## Philosophy

OTel is the **connective tissue** between decoupled services. Every telemetry
event gets a trace ID at ingestion. That trace follows the event through
Signal Agent → Diagnosis Agent → Actions Agent → Conversation Agent.

The demo win: show a Grafana trace view where you can follow a single sensor
reading from `edge exporter → ingestion → signal agent → risk score → incident`.

---

## Trace Propagation

### Trace Lifecycle

1. **Ingestion Service** creates the root span and generates `trace_id`
2. `trace_id` is embedded in the `IngestedEvent` envelope
3. **Signal Agent** reads `trace_id` from the envelope and continues the trace
4. **Diagnosis Agent** (Phase 3) continues the trace
5. **Actions Agent** (Phase 3) continues the trace
6. **Conversation Agent** (Phase 4) references the trace for evidence

### W3C Trace Context

Use W3C `traceparent` format for propagation through Kinesis records:

```typescript
// Producer side (ingestion service)
const span = tracer.startSpan('ingestion.process');
const traceId = span.spanContext().traceId;
// Embed in IngestedEvent.trace_id

// Consumer side (signal agent)
const parentContext = trace.setSpanContext(
  context.active(),
  { traceId: event.trace_id, spanId: '', traceFlags: 1 }
);
const span = tracer.startSpan('signal-agent.process', {}, parentContext);
```

---

## Span Naming Convention

Format: `{service}.{operation}[.{sub_operation}]`

| Service | Span Name | Description |
|---------|-----------|-------------|
| simulator-controller | `simulator.controller.invoke` | Fan-out to workers |
| simulator-worker | `simulator.worker.generate` | Event generation loop |
| simulator-worker | `simulator.worker.kinesis_put` | Kinesis batch write |
| ingestion | `ingestion.process` | Per-record processing (root span) |
| ingestion | `ingestion.validate` | Schema validation |
| ingestion | `ingestion.fanout` | Write to downstream Kinesis |
| signal-agent | `signal-agent.process` | Per-event risk computation |
| signal-agent | `signal-agent.dynamodb.read` | Load asset state |
| signal-agent | `signal-agent.compute` | Z-scores + risk formula |
| signal-agent | `signal-agent.dynamodb.write` | Save asset state |
| signal-agent | `signal-agent.emit` | Write risk event |
| diagnosis-agent | `diagnosis-agent.process` | Per-event risk explanation |
| diagnosis-agent | `diagnosis-agent.debounce-check` | Debounce window check |
| diagnosis-agent | `diagnosis-agent.bedrock.invoke` | Bedrock API call |
| diagnosis-agent | `diagnosis-agent.parse` | Response parsing + validation |
| diagnosis-agent | `diagnosis-agent.emit` | Write diagnosis event |
| actions-agent | `actions-agent.process` | Per-event action evaluation |
| actions-agent | `actions-agent.load-incident` | Load incident from DynamoDB |
| actions-agent | `actions-agent.evaluate` | Apply deterministic action rules |
| actions-agent | `actions-agent.dynamodb.write` | Save incident record |
| actions-agent | `actions-agent.emit` | Write action event |

---

## Required Span Attributes

### All Spans

| Attribute | Type | Description |
|-----------|------|-------------|
| `service.name` | string | From `OTEL_SERVICE_NAME` env var |
| `deployment.environment` | string | `local`, `sandbox`, `production` |

### Telemetry-Specific Attributes

| Attribute | Type | Where |
|-----------|------|-------|
| `telemetry.asset_id` | string | All services processing telemetry |
| `telemetry.source_type` | string | `edge`, `simulated`, `replay` |
| `telemetry.schema_version` | string | `v2` |
| `signal.composite_risk` | float | Signal agent |
| `signal.risk_state` | string | Signal agent |
| `ingestion.event_id` | string | Ingestion service |
| `diagnosis.confidence` | string | Diagnosis agent |
| `diagnosis.severity` | string | Diagnosis agent |
| `bedrock.model_id` | string | Diagnosis agent |
| `bedrock.prompt_tokens` | int | Diagnosis agent |
| `bedrock.completion_tokens` | int | Diagnosis agent |
| `incident.status` | string | Actions agent |
| `action.type` | string | Actions agent |

---

## Metrics

### Naming Convention

Format: `streaming_agents.{service}.{metric_name}`

### Metric Definitions

| Metric | Type | Tags | Service |
|--------|------|------|---------|
| `streaming_agents.simulator.events_produced` | counter | scenario, asset_id | simulator-worker |
| `streaming_agents.simulator.invocations` | counter | hour, worker_count | simulator-controller |
| `streaming_agents.ingestion.events_processed` | counter | source_type, valid | ingestion |
| `streaming_agents.ingestion.validation_errors` | counter | error_code | ingestion |
| `streaming_agents.ingestion.latency_ms` | histogram | source_type | ingestion |
| `streaming_agents.ingestion.dlq_sent` | counter | error_code | ingestion |
| `streaming_agents.signal_agent.risk_score` | gauge | asset_id, risk_state | signal-agent |
| `streaming_agents.signal_agent.events_processed` | counter | risk_state | signal-agent |
| `streaming_agents.signal_agent.dynamodb_latency_ms` | histogram | operation | signal-agent |
| `streaming_agents.diagnosis_agent.events_processed` | counter | risk_state | diagnosis-agent |
| `streaming_agents.diagnosis_agent.events_skipped` | counter | reason | diagnosis-agent |
| `streaming_agents.diagnosis_agent.bedrock_latency_ms` | histogram | — | diagnosis-agent |
| `streaming_agents.diagnosis_agent.tokens_used` | counter | token_type | diagnosis-agent |
| `streaming_agents.actions_agent.actions_emitted` | counter | action, severity | actions-agent |
| `streaming_agents.actions_agent.incidents_created` | counter | severity | actions-agent |
| `streaming_agents.actions_agent.incidents_escalated` | counter | — | actions-agent |
| `streaming_agents.actions_agent.dynamodb_latency_ms` | histogram | operation | actions-agent |

### Cardinality Rules

**DO** use as metric tags: service, source_type, risk_state, scenario, error_code, operation
**DO NOT** use as metric tags: asset_id (>50 values), event_id, trace_id, timestamp

Exception: `risk_score` gauge uses asset_id because it's the key monitoring dimension
and cardinality is bounded by fleet size (≤ 200).

---

## SDK Configuration

### NestJS Lambda (core-telemetry package)

```typescript
// packages/core-telemetry/src/otel.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export function initOtel(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/metrics',
      }),
      exportIntervalMillis: 10_000,
    }),
  });
  sdk.start();
  return sdk;
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_SERVICE_NAME` | — | Required per service |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP HTTP endpoint |
| `OTEL_TRACES_SAMPLER` | `always_on` | Sampling strategy |
| `OTEL_METRICS_EXPORT_INTERVAL` | `10000` | Metric export interval (ms) |

### LocalStack + Local Development

For local development, use the OTel Collector or Jaeger:

```yaml
# docker-compose.otel.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "4318:4318"    # OTLP HTTP
```

For AWS deployment, OTLP exports to:
- AWS Distro for OpenTelemetry (ADOT) collector sidecar → Managed Prometheus + X-Ray
