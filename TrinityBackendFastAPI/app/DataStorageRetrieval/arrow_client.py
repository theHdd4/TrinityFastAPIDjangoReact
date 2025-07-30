import os
import logging
import pandas as pd
import pyarrow as pa
import pyarrow.flight as flight
import pyarrow.ipc as ipc
from minio import Minio
from .flight_registry import get_arrow_for_flight_path

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
        if not arrow_obj:
            basename = os.path.basename(path)
            arrow_obj = os.path.join(
                os.getenv("CLIENT_NAME", "default_client"),
                os.getenv("APP_NAME", "default_app"),
                os.getenv("PROJECT_NAME", "default_project"),
                basename,
            )
            logger.info("🪶 inferred arrow object %s", arrow_obj)
        try:
            bucket = os.getenv("MINIO_BUCKET", "trinity")
            m_client = Minio(
                os.getenv("MINIO_ENDPOINT", "minio:9000"),
                access_key=os.getenv("MINIO_ACCESS_KEY", "admin_dev"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "pass_dev"),
                secure=False,
            )
            resp = m_client.get_object(bucket, arrow_obj)
            data = resp.read()
            table = ipc.RecordBatchFileReader(pa.BufferReader(data)).read_all()
            logger.info(
                "✔️ fallback minio download %s rows=%d",
                path,
                table.num_rows,
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
        if not arrow_obj:
            basename = os.path.basename(path)
            arrow_obj = os.path.join(
                os.getenv("CLIENT_NAME", "default_client"),
                os.getenv("APP_NAME", "default_app"),
                os.getenv("PROJECT_NAME", "default_project"),
                basename,
            )
            logger.info("🪶 inferred arrow object %s", arrow_obj)
        try:
            bucket = os.getenv("MINIO_BUCKET", "trinity")
            m_client = Minio(
                os.getenv("MINIO_ENDPOINT", "minio:9000"),
                access_key=os.getenv("MINIO_ACCESS_KEY", "admin_dev"),
                secret_key=os.getenv("MINIO_SECRET_KEY", "pass_dev"),
                secure=False,
            )
            resp = m_client.get_object(bucket, arrow_obj)
            data = resp.read()
            table = ipc.RecordBatchFileReader(pa.BufferReader(data)).read_all()
            logger.info("✔️ fallback minio bytes %s", arrow_obj)
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
