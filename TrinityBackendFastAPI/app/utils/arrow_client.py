import pyarrow as pa
import pyarrow.flight as flight
from functools import lru_cache


import os

# Allow the Flight host/port to be configured via environment variables
FLIGHT_HOST = os.getenv("FLIGHT_HOST", "flight")
FLIGHT_PORT = int(os.getenv("FLIGHT_PORT", "8815"))


@lru_cache()
def get_flight_client() -> flight.FlightClient:
    url = f"grpc://{FLIGHT_HOST}:{FLIGHT_PORT}"
    return flight.FlightClient(url)


def put_table(ticket: str, table: pa.Table) -> None:
    client = get_flight_client()
    descriptor = flight.FlightDescriptor.for_path(ticket)
    writer, _ = client.do_put(descriptor, table.schema)
    writer.write_table(table)
    writer.close()


def get_table(ticket: str) -> pa.Table:
    client = get_flight_client()
    info = client.get_flight_info(flight.FlightDescriptor.for_path(ticket))
    reader = client.do_get(info.endpoints[0].ticket)
    return reader.read_all()
