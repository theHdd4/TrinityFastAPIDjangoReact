import os
import logging
import json
from pathlib import Path
from typing import Dict

import pandas as pd
import pyarrow as pa
import pyarrow.flight as flight
import pyarrow.ipc as ipc
from minio import Minio
from dotenv import load_dotenv

# Load environment variables from the repo's .env file on import so other
# modules can rely on CLIENT_NAME/APP_NAME/PROJECT_NAME being set. This
# mirrors how the backend loads its environment when running inside Docker.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env.dev"
if not ENV_FILE.exists():
    ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ENV_FILE, override=False)

try:
    import redis  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - redis optional
    redis = None

from .flight_registry import get_arrow_for_flight_path

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
_redis_client = (
    redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True) if redis else None
)


def load_env_from_redis() -> Dict[str, str]:
    """Load environment variables from Redis and update ``os.environ``."""
    logger.debug("load_env_from_redis() called")
    if _redis_client is None:
        logger.debug("redis client not available")
        return {}
    env: Dict[str, str] = {}
    user_id = os.getenv("USER_ID", "")
    if user_id:
        key = f"currentenv:{user_id}"
        current = _redis_client.hgetall(key)
        if current:
            logger.debug("redis %s -> %s", key, current)
            for k, v in current.items():
                os.environ[k.upper()] = v
                env[k.upper()] = v
    client = os.getenv("CLIENT_NAME", env.get("CLIENT_NAME", ""))
    app = os.getenv("APP_NAME", env.get("APP_NAME", ""))
    project = os.getenv("PROJECT_NAME", env.get("PROJECT_NAME", ""))
    if client and project:
        env_key = f"env:{client}:{app}:{project}"
        logger.debug("redis namespace %s", env_key)
        cached = _redis_client.get(env_key)
        if cached:
            try:
                data = json.loads(cached)
                logger.debug("redis %s -> %s", env_key, data)
                env.update(data)
                for k, v in data.items():
                    os.environ[k] = v
            except Exception as exc:  # pragma: no cover
                logger.error("failed to decode %s: %s", env_key, exc)
    logger.debug("env after redis load: %s", env)
    return env


def get_current_names(
    client_override: str | None = None,
    app_override: str | None = None,
    project_override: str | None = None,
) -> tuple[str, str, str]:
    """Return (client, app, project) using Redis and Postgres."""
    env = load_env_from_redis()
    client = client_override or os.getenv("CLIENT_NAME", env.get("CLIENT_NAME", ""))
    app = app_override or os.getenv("APP_NAME", env.get("APP_NAME", ""))
    project = project_override or os.getenv("PROJECT_NAME", env.get("PROJECT_NAME", ""))
    if not client or not app or not project:
        try:
            import asyncio
            from app.DataStorageRetrieval.db.environment import fetch_environment_names
            from app.DataStorageRetrieval.db.connection import get_tenant_schema

            schema = get_tenant_schema(client) or client
            if schema:
                names = asyncio.run(fetch_environment_names(schema))
                if names:
                    client, app, project = names
                    os.environ["CLIENT_NAME"] = client
                    os.environ["APP_NAME"] = app
                    os.environ["PROJECT_NAME"] = project
                    logger.info(
                        "📥 loaded env from postgres %s/%s/%s", client, app, project
                    )
        except Exception as exc:  # pragma: no cover - db optional
            logger.warning("fetch_environment_names failed: %s", exc)
    return client, app, project


def get_minio_prefix(
    client_override: str | None = None,
    app_override: str | None = None,
    project_override: str | None = None,
) -> str:
    """Return the MinIO object prefix derived from resolved names."""
    logger.debug("get_minio_prefix() called")
    client, app, project = get_current_names(
        client_override, app_override, project_override
    )
    prefix = f"{client}/{app}/{project}/"
    os.environ["MINIO_PREFIX"] = prefix
    logger.debug(
        "prefix resolved to %s using CLIENT_NAME=%s APP_NAME=%s PROJECT_NAME=%s",
        prefix,
        client,
        app,
        project,
    )
    return prefix


# Backwards compatibility
_get_prefix = get_minio_prefix


def _find_latest_object(basename: str, client: Minio, bucket: str, prefix: str) -> str | None:
    """Return the newest object ending with the given basename within prefix."""
    latest_name: str | None = None
    latest_time = None
    for obj in client.list_objects(bucket, prefix=prefix, recursive=True):
        name = obj.object_name.split("/")[-1]
        if name.endswith(basename) or name.split("_", 1)[-1] == basename:
            if latest_time is None or obj.last_modified > latest_time:
                latest_name = obj.object_name
                latest_time = obj.last_modified
    if latest_name:
        logger.debug("latest object for %s under %s is %s", basename, prefix, latest_name)
    else:
        logger.debug("no object found for %s under %s", basename, prefix)
    return latest_name

logger = logging.getLogger("trinity.flight")


def _get_client() -> flight.FlightClient:
    """Return a Flight client configured from environment variables."""
    host = os.getenv("FLIGHT_HOST") or os.getenv("HOST_IP", "localhost")
    port = int(os.getenv("FLIGHT_PORT", "8815"))
    logger.debug("Connecting to Flight server %s:%s", host, port)
    return flight.FlightClient(f"grpc://{host}:{port}")


def upload_dataframe(df: pd.DataFrame, path: str) -> str:
    client = _get_client()
    table = pa.Table.from_pandas(df)
    descriptor = flight.FlightDescriptor.for_path(path)
    writer, _ = client.do_put(descriptor, table.schema)
    writer.write_table(table)
    writer.close()
    return path


def download_dataframe(path: str) -> pd.DataFrame:
    """Download a dataframe from the Arrow Flight service with debug logs."""
    logger.info("⬇️ downloading via flight: %s", path)
    client = _get_client()
    descriptor = flight.FlightDescriptor.for_path(path)
    try:
        info = client.get_flight_info(descriptor)
        reader = client.do_get(info.endpoints[0].ticket)
        df = reader.read_pandas()
        logger.info("✔️ downloaded flight table %s rows=%d", path, len(df))
        return df
    except Exception as e:
        logger.error("❌ flight download failed for %s: %s", path, e)
        arrow_obj = get_arrow_for_flight_path(path)
        endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
        access_key = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
        secret_key = os.getenv("MINIO_SECRET_KEY", "pass_dev")
        bucket = os.getenv("MINIO_BUCKET", "trinity")
        logger.info(
            "🔍 using MinIO endpoint=%s bucket=%s access_key=%s prefix_env=%s",
            endpoint,
            bucket,
            access_key,
            os.getenv("MINIO_PREFIX"),
        )
        # Log the actual endpoint derived by the client for easier debugging
        m_client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=False,
        )
        try:
            actual = m_client._base_url._url.netloc
            logger.debug("MinIO client connected to %s", actual)
        except Exception:
            logger.debug("MinIO client created for %s", endpoint)
        if not arrow_obj:
            basename = os.path.basename(path)
            prefix = get_minio_prefix()
            arrow_obj = _find_latest_object(basename + ".arrow", m_client, bucket, prefix)
            if arrow_obj is None:
                arrow_obj = os.path.join(prefix, basename)
            logger.info(
                "🪶 searching for %s in bucket=%s prefix=%s -> %s",
                basename,
                bucket,
                prefix,
                arrow_obj,
            )
        try:
            resp = m_client.get_object(bucket, arrow_obj)
            data = resp.read()
            table = ipc.RecordBatchFileReader(pa.BufferReader(data)).read_all()
            logger.info(
                "✔️ fallback minio download %s rows=%d from %s",
                path,
                table.num_rows,
                arrow_obj,
            )
            # store table back in Flight so future requests succeed
            try:
                writer, _ = client.do_put(descriptor, table.schema)
                writer.write_table(table)
                writer.close()
                logger.info("🛬 cached table %s on flight server", path)
            except Exception as cache_exc:
                logger.error("⚠️ failed to cache table on flight: %s", cache_exc)
            return table.to_pandas()
        except Exception as exc:
            logger.error(
                "❌ fallback minio download failed for %s: %s", path, exc
            )
        raise


def download_table_bytes(path: str) -> bytes:
    """Return the Arrow IPC bytes for the table at the given flight path."""
    logger.info("⬇️ downloading arrow bytes via flight: %s", path)
    client = _get_client()
    descriptor = flight.FlightDescriptor.for_path(path)
    try:
        info = client.get_flight_info(descriptor)
        reader = client.do_get(info.endpoints[0].ticket)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, reader.schema) as writer:
            for chunk in reader:
                # each chunk is a FlightStreamChunk, so use its .data RecordBatch
                writer.write_batch(chunk.data)
        logger.info("✔️ downloaded arrow bytes %s", path)
        return sink.getvalue().to_pybytes()
    except Exception as e:
        logger.error("❌ flight byte download failed for %s: %s", path, e)
        arrow_obj = get_arrow_for_flight_path(path)
        endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
        access_key = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
        secret_key = os.getenv("MINIO_SECRET_KEY", "pass_dev")
        bucket = os.getenv("MINIO_BUCKET", "trinity")
        logger.info(
            "🔍 using MinIO endpoint=%s bucket=%s access_key=%s prefix_env=%s",
            endpoint,
            bucket,
            access_key,
            os.getenv("MINIO_PREFIX"),
        )
        m_client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=False,
        )
        try:
            actual = m_client._base_url._url.netloc
            logger.debug("MinIO client connected to %s", actual)
        except Exception:
            logger.debug("MinIO client created for %s", endpoint)
        if not arrow_obj:
            basename = os.path.basename(path)
            prefix = get_minio_prefix()
            arrow_obj = _find_latest_object(basename + ".arrow", m_client, bucket, prefix)
            if arrow_obj is None:
                arrow_obj = os.path.join(prefix, basename)
            logger.info(
                "🪶 searching for %s in bucket=%s prefix=%s -> %s",
                basename,
                bucket,
                prefix,
                arrow_obj,
            )
        try:
            resp = m_client.get_object(bucket, arrow_obj)
            data = resp.read()
            table = ipc.RecordBatchFileReader(pa.BufferReader(data)).read_all()
            logger.info("✔️ fallback minio bytes %s from %s", path, arrow_obj)
            # store table back in Flight for future requests
            try:
                writer, _ = client.do_put(descriptor, table.schema)
                writer.write_table(table)
                writer.close()
                logger.info("🛬 cached bytes for %s on flight server", path)
            except Exception as cache_exc:
                logger.error("⚠️ failed to cache bytes on flight: %s", cache_exc)
            return data
        except Exception as exc:
            logger.error(
                "❌ fallback minio byte download failed for %s: %s",
                path,
                exc,
            )
        raise


def flight_table_exists(path: str) -> bool:
    """Return True if the given flight path is available on the Flight server."""
    client = _get_client()
    descriptor = flight.FlightDescriptor.for_path(path)
    try:
        client.get_flight_info(descriptor)
        return True
    except Exception:
        return False
