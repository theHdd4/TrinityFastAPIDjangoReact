## Trinity Observability & Monitoring Plan

### Objectives
- Achieve production-grade observability across metrics, logs, traces, and uptime.
- Detect regressions in multi-tenant Django + FastAPI workloads before they impact tenants.
- Provide runbooks, SLO/SLA insights, and capacity signals for operations and engineering.
- Align with CNCF/Grafana ecosystem best practices for Kubernetes (K3s) in 2025.

### Architectural Overview
- **Deployment Vehicle**: Helm `kube-prometheus-stack` (Prometheus Operator) in namespace `observability` with custom `ServiceMonitor`, `PodMonitor`, and `Probe` definitions for each Trinity component deployed in `trinity-staging`.
- **Metrics Pipeline**: Prometheus (TSDB on PVC, 15s scrape) → Alertmanager → Grafana dashboards; federated Prometheus (future) for multi-cluster growth.
- **Logs Pipeline**: Grafana Alloy (successor to Promtail) DaemonSet → Grafana Loki (boltdb-shipper + MinIO backend) → Grafana dashboards + LogQL.
- **Traces Pipeline**: OpenTelemetry (auto-instrumentation for Django, FastAPI, Celery, Flight) → Grafana Tempo → Grafana dashboards with logs/metrics correlation.
- **Uptime/Synthetic**: Blackbox exporter for HTTP/TCP probes of ingress, service mesh endpoints, and database readiness.

### Component Mapping
- **Django (`django-staging`)**
  - Integrate `django-prometheus` for request latency, HTTP status, DB query counts.
  - Expose `/metrics` via Kubernetes service annotated for scraping.
  - Instrument Celery beat schedule metrics for tenant jobs.
- **FastAPI (`fastapi-staging`)**
  - Use `prometheus-fastapi-instrumentator` with histogram buckets tuned to API latencies.
  - Track dependency call metrics (Redis, PostgreSQL, Mongo).
- **Celery Workers (`celery-staging`)**
  - Add `celery-prometheus-exporter` sidecar for queue depth, task runtime, retries.
  - Emit structured logs with task id, tenant id labels.
- **Frontend (`frontend-staging`)**
  - Nginx VTS exporter for upstream response codes & latency.
  - Capture build artifact fingerprints for release dashboards.
- **Datastores**
  - `postgres-staging`: `postgres-exporter` for connections, WAL, table bloat, tenant usage.
  - `mongo-staging`: `mongodb-exporter` for replication optime, cache hit ratio.
  - `redis-staging`: `redis-exporter` for memory/evictions/latency.
  - `minio-staging`: MinIO operator metrics (`tenant_usage_total_bytes`).
- **Flight / Trinity-AI**
  - Expose custom metrics for query throughput, Arrow stream durations.
  - Track GPU/CPU utilization via node exporter if applicable.
- **Cluster Infra**
  - `kube-state-metrics`, `node-exporter`, `kubelet` cAdvisor endpoints handled by Operator defaults.
  - `kube-event-exporter` into Loki via Alloy for auditing.

### Metrics Strategy
- **Scrape Design**
  - 15s scrape interval core workloads; 30-60s for exporters with heavier footprint.
  - Limit `sample_limit` per job; set relabel rules to drop high-cardinality labels (`pod_uid`, `container_hash`).
  - Record `environment=staging`, `tenant`, `component`, `tier` labels consistently via relabel configs.
- **Recording Rules**
  - API latency percentiles (`p50`, `p95`, `p99`) per service & tenant using histograms.
  - Error budgets: `rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])`.
  - Celery queue depth SLOs and worker saturation gauges.
  - Database resource saturation (e.g., `node_filesystem_avail_bytes` for PVC exhaustion).
- **Capacity Planning**
  - Prometheus PVC: start 64 Gi (retention ~15d), adjust via growth forecasts.
  - Implement remote write compatibility for future long-term storage (e.g., Thanos).

### Logging Strategy
- **Collector**: Deploy Grafana Alloy (2025 LTS) instead of Promtail; use `component=collector` label.
- **Targets**
  - Alloy Kubernetes discovery scrapes pods with label `logging=enabled` (apply to Django, FastAPI, Celery, Nginx, exporters).
  - Ingest application logs (JSON) and infrastructure logs (kubelet, event logs).
- **Pipelines**
  - Stages: `docker` → `cri` parsing → JSON decode → label mapping (`tenant`, `trace_id`, `request_id`).
  - Sampling: keep 100% error logs, 25% info logs for high-volume components.
- **Storage**
  - Loki StatefulSet with MinIO bucket backend, 14d retention staging; enable compactor & ruler.
  - Configure log alerting via Loki ruler for `tenant` scoped anomalies (e.g., spike in 500 logs).

### Tracing Strategy
- **Instrumentation**
  - Use OpenTelemetry Python auto-instrumentation for Django (ASGI), FastAPI, Celery, psycopg2, Redis, Mongo.
  - Adopt W3C trace context propagation across services.
- **Collector**
  - Deploy OpenTelemetry Collector (Gateway mode) for batching & exporting spans to Tempo and metrics to Prometheus (via `prometheusremotewrite`).
- **Sampling**
  - Probabilistic sampling at 10% baseline, auto-increase to 100% on errors (tail-sampling policy).
- **Correlation**
  - Inject trace ids into Alloy logs via OTLP log exporter; enable Grafana exemplars linking metrics ↔ traces ↔ logs.

### Synthetic Monitoring & Probes
- **Blackbox Exporter**: HTTP probes for `https://trinity-stag.quantmatrixai.com`, tenant-specific subdomains, and API endpoints (`/healthz`, `/api/tenant-status`).
- **TCP Probes**: PostgreSQL 5432, Redis 6379, MongoDB 27017 readiness.
- **SLO Uptime Checks**: Use Grafana OnCall or Cloudflare health probes as external verification.

### Alerting & Incident Response
- **Alertmanager Configuration**
  - Routes: `critical` → PagerDuty/MS Teams, `warning` → Teams channel, `info` → email.
  - Group alerts by `tenant`, `service` to reduce noise; configure `inhibit_rules` (e.g., suppress downstream alerts when ingress is failing).
  - Implement `DeadManSwitch` to verify pipeline availability.
- **Runbooks**
  - Create Markdown runbooks under `docs/runbooks/<alert>.md` linked in annotations.
  - Include query, hypothesis checklist, rollback steps, escalation contacts.
- **On-Call Tooling**
  - Optionally adopt Grafana OnCall for schedule management and incident timelines.

### Security & Governance
- **Networking**: Apply `NetworkPolicy` to restrict Prometheus/Alertmanager/Loki ingress; expose Grafana via authenticated ingress.
- **Authentication**: SSO integration (Azure AD) for Grafana, restrict Prometheus and Alertmanager with basic auth + mTLS between controllers.
- **Secret Management**: Store credentials (Grafana admin, Alertmanager webhooks) in `ExternalSecrets` or `SealedSecrets`.
- **Compliance**: Log retention policies matched to company requirements (PII scrubbing, right-to-erasure through Alloy pipeline transforms).

### Implementation Phases
1. **Foundation**: Install `kube-prometheus-stack`, Alloy + Loki, Tempo, Blackbox exporter. Verify cluster metrics dashboards.
2. **Service Instrumentation**: Enable `/metrics` for Django/FastAPI/Celery, deploy exporters for databases/cache, add ServiceMonitor resources.
3. **Dashboards & Alerts**: Provision Grafana dashboards (JSON-as-code); implement recording rules and alerting policies; write runbooks.
4. **Tracing & Correlation**: Roll out OpenTelemetry, Tempo, Grafana exemplars; ensure triage workflow covers logs/metrics/traces.
5. **Optimization**: Tune retention, storage, and sampling; add anomaly detection (Grafana Mimir/ML plugin if needed); plan multi-cluster federation.

### Dashboard Requirements & Layout
- **Unified Operations Home**
  - Live `Logs Explorer` panel backed by Grafana Loki for component-level tailing (auto-refresh, tenant filters, `request_id` correlation).
  - `Service Status` grid sourced from Kubernetes `Deployment`/`Pod` metrics (`kube_deployment_status_condition`) showing ready replicas, restart counts, and failing pods.
  - Incident ticker highlighting active `critical` alerts from Alertmanager.
- **Resource Utilization**
  - Per-service CPU, memory, and pod count using Prometheus queries (`container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`) with peak annotations and rolling 24h/7d comparisons.
  - Cluster capacity overview (node allocatable vs usage, PVC consumption, network throughput) derived from `node-exporter` and `kubelet` metrics.
- **Microservice Health**
  - Request latency heatmaps (p50/p95/p99) and error-rate panels for Django/FastAPI, segmented by tenant and endpoint.
  - Celery worker queue depth, task success/failure ratio, and longest running task panels.
  - Database health panels: PostgreSQL replication lag, locking, Mongo replication optime, Redis cache hit %.
- **API Consumption Analytics**
  - Top endpoints by request volume using PromQL (`sum by (path) (rate(http_requests_total[5m]))`), with tenant/service filters.
  - Outlier detection panel highlighting endpoints with sudden error spikes or latency regressions (Grafana anomaly detection or `predict_linear`).
- **Service-Level Logging Views**
  - Loki dashboards per service with structured log filters (severity, tenant, trace id) and quick links to corresponding traces.
  - Release markers overlay (CI/CD pushes) to correlate deployments with log bursts.
- **Health & Readiness Checks**
  - Blackbox exporter probe results (HTTP success %, DNS, TLS expiry) for ingress endpoints.
  - Internal gRPC/HTTP health endpoints tracked via synthetic checks with SLO burn rate indicators.
- **Developer Experience Enhancements**
  - Build/version dashboard showing current Git SHA, Docker image tags, and feature flags per environment.
  - Dependency latency panel (PostgreSQL query histograms, Redis round-trip) to spot downstream degradations.
  - Tenant adoption metrics (active users, API throughput per tenant) derived from application metrics/logs.
  - Error budget tracking board: current burn rate, remaining budget, historical trends.


### Study References
- Grafana Labs: Alloy & Loki production guides (2025).
- CNCF Observability Best Practices (SIG Observability whitepapers).
- Prometheus Operator user guide for custom resources.
- OpenTelemetry Python instrumentation docs.
- SRE Workbook (SLO/Alerting design patterns).

### Next Steps
- Validate namespace and storage availability for observability stack.
- Draft initial Helm `values.yaml` overlays for staging vs production.
- Schedule instrumentation work items per service squad; add observability checks to CI/CD smoke suite.

