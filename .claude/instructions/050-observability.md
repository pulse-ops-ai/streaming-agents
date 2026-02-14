# 050 – Observability

- OpenTelemetry for traces + metrics
- Structured JSON logging (pino for TS, structlog for Python)
- Local stack: Grafana + Tempo + Loki (via `docker/grafana/`)
- Every service exposes `/health` and `/ready` endpoints
