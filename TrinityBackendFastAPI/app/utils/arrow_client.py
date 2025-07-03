import os
import logging
import pandas as pd
import pyarrow as pa
import pyarrow.flight as flight
import pyarrow.ipc as ipc

_client: flight.FlightClient | None = None
logger = logging.getLogger("trinity.flight")


def _get_client() -> flight.FlightClient:
    """Return a cached Flight client configured from environment variables."""
    global _client
    host = os.getenv("FLIGHT_HOST", "localhost")
    port = int(os.getenv("FLIGHT_PORT", "8815"))
    if _client is None:
        _client = flight.FlightClient(f"grpc://{host}:{port}")
    return _client

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
        raise
