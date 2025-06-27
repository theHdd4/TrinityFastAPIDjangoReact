import asyncio
import pyarrow as pa
import pyarrow.flight as flight


class TrinityFlightServer(flight.FlightServerBase):
    """Simple in-memory Arrow Flight server."""

    def __init__(self, host="0.0.0.0", port=8815):
        location = f"grpc://{host}:{port}"
        super().__init__(location)
        self._tables: dict[str, pa.Table] = {}

    def do_get(self, context, ticket):
        key = ticket.ticket.decode()
        table = self._tables.get(key)
        if table is None:
            raise flight.FlightUnavailableError(f"Table {key} not found")
        return flight.RecordBatchStream(table)

    def do_put(self, context, descriptor, reader, writer):
        key = descriptor.path[0].decode()
        table = reader.read_all()
        self._tables[key] = table
        writer.write_table(table)

    def list_flights(self, context, criteria):
        for key, table in self._tables.items():
            yield flight.FlightInfo(
                table.schema,
                flight.FlightDescriptor.for_path(key),
                [flight.FlightEndpoint(key, [self.location])],
                -1,
                -1,
            )


async def serve():
    server = TrinityFlightServer()
    print("Starting Arrow Flight server on port 8815")
    await server.serve()


if __name__ == "__main__":
    asyncio.run(serve())
