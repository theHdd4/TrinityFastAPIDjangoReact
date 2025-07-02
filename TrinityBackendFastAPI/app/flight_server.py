import os
import pyarrow as pa
import pyarrow.flight as flight

class ArrowFlightServer(flight.FlightServerBase):
    """Simple in-memory Flight server storing Arrow tables by path."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8815):
        self._host = host
        self._port = port
        location = f"grpc://{host}:{port}"
        super().__init__(location)
        self._tables: dict[str, pa.Table] = {}

    def _path(self, descriptor: flight.FlightDescriptor) -> str:
        return "/".join(
            p.decode() if isinstance(p, (bytes, bytearray)) else p
            for p in descriptor.path
        )

    def do_put(self, context, descriptor, reader, writer):  # type: ignore[override]
        path = self._path(descriptor)
        self._tables[path] = reader.read_all()
        writer.write(b"OK")

    def do_get(self, context, ticket):  # type: ignore[override]
        path = ticket.ticket.decode()
        table = self._tables.get(path)
        if table is None:
            raise flight.FlightUnavailableError(f"No table for {path}")
        return flight.RecordBatchStream(table)

    def get_flight_info(self, context, descriptor):  # type: ignore[override]
        path = self._path(descriptor)
        table = self._tables.get(path)
        if table is None:
            raise flight.FlightUnavailableError(f"No table for {path}")
        endpoint = flight.FlightEndpoint(
            ticket=flight.Ticket(path),
            locations=[flight.Location.for_grpc_tcp(self._host, self._port)],
        )
        return flight.FlightInfo(table.schema, descriptor, [endpoint], table.num_rows, table.nbytes)

if __name__ == "__main__":
    host = os.getenv("FLIGHT_HOST", "0.0.0.0")
    port = int(os.getenv("FLIGHT_PORT", "8815"))
    server = ArrowFlightServer(host, port)
    print(f"\u2708\ufe0f Arrow Flight server running on {host}:{port}")
    server.serve()
