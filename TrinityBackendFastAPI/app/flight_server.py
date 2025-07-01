import os
import pyarrow as pa
import pyarrow.flight as flight


class TrinityFlightServer(flight.FlightServerBase):
    def __init__(self, host: str = "0.0.0.0", port: int = 8815, storage_dir: str = "/tmp/arrow-flight"):
        super().__init__((host, port))
        self.storage_dir = storage_dir
        os.makedirs(self.storage_dir, exist_ok=True)

    def _path(self, key: str) -> str:
        return os.path.join(self.storage_dir, f"{key}.arrow")

    def do_put(self, context, descriptor, reader, writer):
        key = descriptor.path[0].decode()
        table = reader.read_all()
        path = self._path(key)
        with pa.OSFile(path, "wb") as sink:
            with pa.ipc.new_file(sink, table.schema) as writer_f:
                writer_f.write(table)
        return flight.Result(pa.scalar(key))

    def do_get(self, context, ticket):
        key = ticket.ticket.decode()
        path = self._path(key)
        if not os.path.exists(path):
            raise flight.FlightUnavailableError(f"Dataset {key} not found")
        source = pa.memory_map(path, "r")
        reader = pa.ipc.RecordBatchFileReader(source)
        return flight.RecordBatchStream(reader)

    def list_flights(self, context, criteria):
        for fname in os.listdir(self.storage_dir):
            if fname.endswith(".arrow"):
                key = fname[:-6]
                desc = flight.FlightDescriptor.for_path(key)
                yield flight.FlightInfo(pa.schema([]), desc, [], -1, -1)


if __name__ == "__main__":
    host = os.environ.get("FLIGHT_HOST", "0.0.0.0")
    port = int(os.environ.get("FLIGHT_PORT", "8815"))
    server = TrinityFlightServer(host, port)
    print(f"Flight server listening on {host}:{port}")
    server.serve()
