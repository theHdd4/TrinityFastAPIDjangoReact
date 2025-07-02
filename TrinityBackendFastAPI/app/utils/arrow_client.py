import os
import pandas as pd
import pyarrow as pa
import pyarrow.flight as flight

FLIGHT_HOST = os.getenv("FLIGHT_HOST", "localhost")
FLIGHT_PORT = int(os.getenv("FLIGHT_PORT", "8815"))

_client: flight.FlightClient | None = None

def _get_client() -> flight.FlightClient:
    global _client
    if _client is None:
        _client = flight.FlightClient(f"grpc://{FLIGHT_HOST}:{FLIGHT_PORT}")
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
    client = _get_client()
    descriptor = flight.FlightDescriptor.for_path(path)
    info = client.get_flight_info(descriptor)
    reader = client.do_get(info.endpoints[0].ticket)
    return reader.read_pandas()
