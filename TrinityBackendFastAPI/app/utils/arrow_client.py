import os
import pyarrow as pa
import pyarrow.flight as flight
import pandas as pd

FLIGHT_HOST = os.getenv("FLIGHT_HOST", "flight")
FLIGHT_PORT = int(os.getenv("FLIGHT_PORT", "8815"))


def _client() -> flight.FlightClient:
    location = f"grpc://{FLIGHT_HOST}:{FLIGHT_PORT}"
    return flight.FlightClient(location)


def upload_dataframe(df: pd.DataFrame, key: str) -> str:
    """Upload a pandas DataFrame as an Arrow table via Flight."""
    table = pa.Table.from_pandas(df)
    desc = flight.FlightDescriptor.for_path(key)
    client = _client()
    writer, _ = client.do_put(desc, table.schema)
    writer.write_table(table)
    writer.close()
    return key


def download_dataframe(key: str) -> pd.DataFrame:
    """Download an Arrow table via Flight and return it as a DataFrame."""
    client = _client()
    ticket = flight.Ticket(key.encode())
    reader = client.do_get(ticket)
    table = reader.read_all()
    return table.to_pandas()
