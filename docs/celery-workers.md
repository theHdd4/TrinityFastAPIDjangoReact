# Celery workers and beat

This guide explains how the Django and FastAPI services share a single Celery
configuration and how to run workers locally as well as in production.

## Shared configuration

All Celery settings now live in
`TrinityBackendDjango/config/celery_settings.py`. The module reads the
following environment variables:

- `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` – defaults to `REDIS_URL` when
  not provided.
- `CELERY_TASK_DEFAULT_QUEUE` – queue used by both frameworks for background
  work (defaults to `trinity.tasks`).
- `CELERY_BEAT_QUEUE` – optional queue for beat scheduled jobs
  (defaults to `<CELERY_TASK_DEFAULT_QUEUE>.beat`).
- `CELERY_WORKER_CONCURRENCY` – worker process/greenlet count. Adjust this to
  scale worker throughput.

The helper function `configure_celery_app` is imported from both
`config/celery.py` (Django) and `TrinityBackendFastAPI/app/celery_app.py`
(FastAPI). This means either service can enqueue tasks into the shared queue
without duplicating configuration.

## Environment management

The `envs/dev.env`, `envs/prod.env`, and Docker Compose templates expose the
same Redis and Celery variables. Any change to the broker URL or queue names in
those files automatically applies to both the Django and FastAPI services. For
Docker Compose deployments the `x-celery-env` anchor propagates Celery
variables to the `web`, `celery`, and `fastapi` services.

To increase worker parallelism in Docker Compose, set
`CELERY_WORKER_CONCURRENCY` (for example, `CELERY_WORKER_CONCURRENCY=8`) before
running `docker compose up`. The value is consumed by Celery at runtime, so you
can tune concurrency without modifying the code.

## Running services locally

1. Copy `docker-compose-dev.example.yml` to `docker-compose-dev.yml` and `envs/dev.env`
   to `.env` (or load the variables into your shell).
2. Start the infrastructure dependencies:

   ```bash
   docker compose -f docker-compose-dev.yml up -d postgres mongo redis
   ```

3. Launch the Django API, FastAPI gateway, and Celery worker:

   ```bash
   docker compose -f docker-compose-dev.yml up -d web fastapi celery
   ```

4. (Optional) Run a dedicated beat scheduler if you rely on periodic tasks:

   ```bash
   docker compose -f docker-compose-dev.yml run --rm \
     -e CELERY_BEAT_QUEUE=${CELERY_BEAT_QUEUE:-trinity.tasks.beat} \
     celery celery -A config.celery beat --loglevel=info
   ```

The Django and FastAPI services will both dispatch `.delay()` calls into the
`CELERY_TASK_DEFAULT_QUEUE` queue and the shared worker consumes them from
Redis.

## Production deployment

1. Copy `docker-compose.example.yml` to the environment where you deploy and
   update credentials in `envs/prod.env`.
2. Export or provide the Celery variables (`CELERY_BROKER_URL`,
   `CELERY_RESULT_BACKEND`, queue names, and concurrency) through your secret
   manager or orchestrator.
3. Bring up the stack:

   ```bash
   docker compose -f docker-compose.yml up -d web fastapi celery
   ```

4. Run Celery beat alongside workers if you schedule tasks:

   ```bash
   docker compose -f docker-compose.yml run --rm celery \
     celery -A config.celery beat --loglevel=warning
   ```

Because both frameworks reuse `configure_celery_app`, any task dispatched by
Django (`config.celery.celery_app`) or FastAPI (`TrinityBackendFastAPI.app.celery_app`)
arrives in the same Redis-backed broker and can be processed by whichever
workers are available.
