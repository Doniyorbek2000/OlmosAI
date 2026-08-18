# Observability

- **Metrics**: the API exposes Prometheus metrics at `/api/metrics` (prom-client);
  AI + asset workers expose `/metrics` (prometheus-client). Key series:
  `veyra_generations_total{kind,status}`, `veyra_generation_duration_seconds`,
  `veyra_queue_wait_seconds`, `veyra_credits_captured_total`,
  `veyra_webhook_deliveries_total{status}`, plus default process metrics.
- **Logs**: structured JSON via pino with request/job/worker/user ids (`@veyra/logger`).
- **Traces**: OpenTelemetry-compatible naming; set `OTEL_EXPORTER_OTLP_ENDPOINT`
  to export.

Run the local stack with the observability profile:

```bash
docker compose -f infra/docker/docker-compose.yml --profile observability up -d
```

Prometheus → http://localhost:9090, Grafana → http://localhost:3001
(admin/admin). Point Grafana at the Prometheus data source and build dashboards
for generation throughput, success rate, queue wait, and revenue/credits.
