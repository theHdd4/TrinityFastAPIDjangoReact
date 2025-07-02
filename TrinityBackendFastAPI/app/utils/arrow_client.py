import os
import pandas as pd
import pyarrow as pa
import pyarrow.flight as flight

_client: flight.FlightClient | None = None


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
    print(f"⬇️ downloading via flight: {path}")
    client = _get_client()
    descriptor = flight.FlightDescriptor.for_path(path)
    try:
        info = client.get_flight_info(descriptor)
        reader = client.do_get(info.endpoints[0].ticket)
        df = reader.read_pandas()
        print(f"✔️ downloaded flight table {path} rows={len(df)}")
        return df
    except Exception as e:
        print(f"❌ flight download failed for {path}: {e}")
        raise
