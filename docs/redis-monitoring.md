# Redis Monitoring, Health Checks, and Operations

This document explains how Redis is monitored, how the health endpoints surface cache
statistics, which alerts are configured, and how to operate the cache safely in
production-like and local environments.

## Metrics Pipeline Overview

1. **Redis exporter** (`oliver006/redis_exporter`) scrapes the cache instance using the
   same connection parameters exposed through `REDIS_*` environment variables.
2. **Prometheus** scrapes the exporter every 15 seconds and evaluates alert rules in
   `monitoring/prometheus/alerts/redis.rules.yml`.
3. **Grafana** is provisioned with the *Redis Cache Overview* dashboard that visualises
   the key metrics required by support and engineering teams: cache hit rate, command
   latency, memory fragmentation, memory usage, and client connections.
4. **Alertmanager** receives critical alerts (connection exhaustion and high memory
   pressure) so downstream notification channels can be configured per environment.

All services are available in both the production `docker-compose.example.yml` and the
local `docker-compose-dev.example.yml` stack (enable the `cache-monitoring` profile in
local environments).

## Service Health Endpoints

Both backend stacks expose lightweight health endpoints that validate Redis reachability
and return cached statistics. Responses use the same shape so they can be plugged into
synthetic monitors or load balancer health checks.

| Service | Endpoint | Description |
| ------- | -------- | ----------- |
| Django (TrinityBackendDjango) | `GET /health/redis/` | Validates `redis_store.redis_client` connectivity and returns latency, hit/miss counts, connected clients, and memory stats. |
| FastAPI (TrinityBackendFastAPI) | `GET /api/health/redis` | Uses `app.core.redis.get_sync_redis` to run a ping, surface hit/miss ratios, client counts, memory fragmentation, and command latency. |

A non-`PONG` response or connectivity exception will return HTTP 503 with a human readable
message in the `detail` field.

## Alerts

Prometheus evaluates the following rules:

- **RedisConnectionExhaustion** triggers when connected clients exceed 85% of
  `maxclients` for five minutes. This typically indicates connection leaks in the
  application code or insufficient pool sizing.
- **RedisHighMemoryUsage** triggers when memory utilisation is above 90% of the Redis
  maximum (when configured) or the fragmentation ratio crosses 1.8 for ten minutes. This
  guards against memory pressure that would otherwise lead to evictions or OOM kills.

Configure Slack, PagerDuty, email, or other receivers by adding them to
`monitoring/alertmanager/alertmanager.yml` in your deployment repository.

## Runbooks

### Controlled Cache Flush

1. **Validate the risk.** Confirm with the owning team which keys or namespaces must be
   flushed and communicate expected user impact.
2. **Take a snapshot.** Ensure `appendonly.aof` or RDB snapshots are current. For manual
   backups run `docker exec <redis-container> redis-cli save`.
3. **Warm the cache if necessary.** Preload critical datasets or prime caches using the
   API endpoints to avoid cold-start latency spikes post-flush.
4. **Execute the flush.** Prefer scoped deletion (`SCAN` + `DEL`) over `FLUSHALL`. Use the
   helper script: `docker exec <redis-container> redis-cli --scan --pattern '<prefix>*' | xargs redis-cli del`.
5. **Verify.** Watch the Grafana dashboard for hit rate recovery and check the
   `/health/redis` endpoints for expected key counts and latency.
6. **Communicate completion.** Update the incident or change ticket with the observed
   metrics.

### Failover or Replacement Node

1. **Assess symptoms.** Review alerts and Grafana panels to determine whether the issue is
   connection exhaustion, memory pressure, or hardware failure.
2. **Promote standby.** If running Redis Sentinel/Cluster, promote the replica via the
   orchestrator. Otherwise bring up a hot spare using the same `REDIS_*` settings.
3. **Update configuration.** Adjust the `REDIS_URL`/`REDIS_HOST` secrets, reload the
   services, and confirm the new node appears healthy on the dashboard.
4. **Validate clients.** Hit both health endpoints to ensure applications can connect and
   caches rebuild as expected.
5. **Decommission the faulty node.** After traffic drains, archive logs and snapshots for
   later analysis.

## Local Development Profiles

Enable the full cache monitoring stack locally with:

```bash
docker compose -f docker-compose-dev.example.yml --profile cache-monitoring up
```

This launches Redis with persistent storage (`redis_data`), the exporter, Prometheus,
Alertmanager, and Grafana (available on `http://localhost:3001`). Data persists across
restarts because Prometheus and Grafana share named volumes (`prometheus_data`,
`grafana_data`).

To mimic production port assignments run the production compose file:

```bash
docker compose -f docker-compose.example.yml up redis redis-exporter prometheus grafana
```

## Accessing the Dashboard and Validating Data

1. Browse to Grafana (`http://localhost:3000` in production compose or
   `http://localhost:3001` in dev compose) and sign in with the credentials defined by
   `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` (defaults to `admin` / `admin`).
2. Open the *Trinity Cache* folder and select **Redis Cache Overview**.
3. Validate the panels:
   - **Cache Hit Rate** should align with expectations for the workload (values near 1 for
     steady caches). Sudden drops indicate evictions or cold caches.
   - **Command Latency** trends highlight spikes in response time. Compare against
     application logs when latency rises.
   - **Memory Fragmentation** panel should stay close to 1.0. Sustained spikes above 1.8
     trigger the high-memory alert and suggest restarts or `CONFIG SET activedefrag yes`.
   - **Connected Clients** panel shows active connections; cross-check against pool sizes
     in application settings.
4. Cross-verify with the health endpoints (`/api/health/redis` and `/health/redis/`) to
   ensure reported values (hit/miss counts, fragmentation ratio, latency) match the
   dashboard panels. The endpoints are lightweight, so they can be polled manually or
   integrated into smoke tests.

## Troubleshooting Data Gaps

- If Prometheus shows `target down`, verify that `redis-exporter` can resolve the Redis
  host and that credentials are correct. Check container logs with
  `docker compose logs redis-exporter`.
- If Grafana has no data, confirm the Prometheus datasource is healthy via *Connections →
  Data sources* inside Grafana and validate the scrape URLs match your docker network.
- When running locally, remember to pass the `cache-monitoring` profile; otherwise the
  monitoring stack stays disabled to keep resource usage low.
