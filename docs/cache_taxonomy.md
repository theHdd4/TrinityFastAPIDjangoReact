# Cache Taxonomy

This document summarizes the Redis namespaces that back the Trinity platform's
stateful features.  It captures the recommended time-to-live (TTL) settings and
outlines the canonical eviction triggers so that both the FastAPI and Django
services apply the same cache hygiene rules.

## Namespaces

### `session`
* **Scope:** Project level notebooks, exhibition layouts and other session state
  blobs written by the FastAPI service (`app/session_state.py`) and mirrored by
  the Django admin APIs (`apps/session_state`).
* **Recommended TTL:** 3,600 seconds (1 hour) for interactive workloads.  The
  Django service previously used a two hour TTL; align to the one hour policy so
  that idle sessions age out consistently across stacks.
* **Eviction triggers:**
  * Explicit write/delete operations publish invalidation events on the
    `cache:invalidate` channel with the hashed session payload version.
  * TTL expiry automatically removes cold sessions from Redis.
  * Manual deletes remove the primary key and the sibling `:version` entry.

### `env`
* **Scope:** Environment variable bundles resolved from Postgres/Django and
  stored for reuse by both services (`app/core/utils.py`,
  `redis_store/env_cache.py`).
* **Recommended TTL:** 3,600 seconds to match the session cache and prevent long
  lived stale credentials.
* **Eviction triggers:**
  * Cache writes attach a deterministic version hash that is stored alongside a
    dedicated `:version` key.  Any schema/project update that changes the
    resolved payload bumps the hash, causing readers to refresh.
  * `cache:invalidate` pub/sub notifications are emitted on write/delete so
    workers that subscribe can evict local process caches immediately.
  * TTL expiry as a final safety net.

### `arrow`
* **Scope:** Metadata about Arrow uploads/flight paths used by analytic
  workloads in `DataStorageRetrieval`.  Consumers read via
  `arrow_client.load_env_from_redis`.
* **Recommended TTL:** 1,800 seconds.  Arrow descriptors change frequently when
  notebooks iterate; the shorter TTL encourages fresh discovery without putting
  unnecessary pressure on the storage backend.
* **Eviction triggers:**
  * Version hashes mirrored from the `env` namespace ensure that schema/project
    updates trigger automatic refreshes when the Arrow client reloads
    environment context.
  * TTL expiry keeps transient descriptors lightweight.

### `cluster`
* **Scope:** Clustering outputs (dataframes, metadata and configs) materialised
  by the FastAPI clustering feature set.
* **Recommended TTL:** 7,200 seconds (2 hours).  Clustering jobs are heavier and
  the extended TTL lets downstream consumers reuse expensive computations.
* **Eviction triggers:**
  * Writes publish invalidation notices that downstream workers consume to drop
    outdated slices.
  * Manual deletes remove associated blobs as part of clean-up flows.
  * TTL expiry ensures stale experiment results do not accumulate indefinitely.

## Pub/Sub channel

Both stacks publish structured JSON payloads to the `cache:invalidate` channel
with the following shape:

```json
{
  "namespace": "session",
  "action": "write",
  "identifiers": {"client_id": "123", "project_id": "456"},
  "ttl": 3600,
  "version": "…",
  "metadata": {"source": "fastapi"},
  "ts": 1710000000.0
}
```

Services that maintain in-process caches (for example the FastAPI `_ENV_CACHE`)
should subscribe and evict when they observe a matching namespace+identifier
combination or when the advertised version diverges from their local view.
