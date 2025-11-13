# Redis Cache Activity Logs Troubleshooting

## Summary
- **Issue**: The Grafana panel titled *Redis Cache Activity Logs* always displayed `No data`.
- **Root Cause**: Redis activity log lines emitted by the Django and FastAPI services included the default Python logging prefix (`INFO:redis.activity:`). Promtail's pipeline expects log messages to begin with the marker `redis_cache_event`, so the additional prefix prevented the Loki query from matching any entries.
- **Resolution**: Updated both Redis client modules to format the activity logger output with `%(message)s`, ensuring log lines start with `redis_cache_event { ... }` and match the existing Promtail regex.

## Process
1. Reviewed the Grafana dashboard definition (`monitoring/grafana/dashboards/redis-overview.json`) and confirmed the Loki query filters for log lines containing `redis_cache_event` from the `web`, `fastapi`, `celery`, or `trinity-ai` compose services.
2. Inspected `monitoring/promtail/promtail-config.yml` and noted the regex stage `redis_cache_event (?P<json>{.*})`, which requires the log line to start with the marker before the JSON payload.
3. Audited the Redis client implementations in `TrinityBackendFastAPI/app/core/redis.py` and `TrinityBackendDjango/redis_store/redis_client.py`. Both modules create a dedicated `redis.activity` logger without specifying a formatter, leaving the default prefix intact.
4. Added an explicit `logging.Formatter("%(message)s")` to the stream handlers in both modules so that only the message body is emitted. This preserves structured JSON output and aligns with the Promtail pipeline expectations.
5. Verified locally (via manual invocation of cache operations) that new log lines now appear as `redis_cache_event {"event": ...}` and are ingested by Loki, restoring the Grafana panel.

## Blockers and Considerations
- **Deployment Awareness**: The fix relies on redeploying the Django and FastAPI services so the updated logging configuration takes effect. Ensure containers are rebuilt/restarted in environments using cached images.
- **Historical Data**: Previous log lines that were dropped due to the mismatched format cannot be recovered unless retained elsewhere. Monitoring gaps will exist for the affected time window.
- **Regex Coupling**: The Promtail regex is tightly coupled to the log message format. If future changes add prefixes or alter the marker, the pipeline configuration must be updated accordingly.
