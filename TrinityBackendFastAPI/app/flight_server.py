import os
import io
import logging
import pyarrow as pa
import pyarrow.flight as flight
import pyarrow.ipc as ipc

from minio import Minio
from minio.error import S3Error

from utils.flight_registry import get_arrow_for_flight_path

logger = logging.getLogger("trinity.flight")

class ArrowFlightServer(flight.FlightServerBase):
    """Simple in-memory Flight server storing Arrow tables by path."""

    def __init__(self, host: str = "0.0.0.0", port: int = 8815):
        self._host = host
        self._port = port
        location = f"grpc://{host}:{port}"
        super().__init__(location)
        self._tables: dict[str, pa.Table] = {}
        self._minio = None
        endpoint = os.getenv("MINIO_ENDPOINT")
        access = os.getenv("MINIO_ACCESS_KEY")
        secret = os.getenv("MINIO_SECRET_KEY")
        bucket = os.getenv("MINIO_BUCKET")
        if endpoint and access and secret and bucket:
            self._bucket = bucket
            try:
                self._minio = Minio(endpoint, access_key=access, secret_key=secret, secure=False)
            except Exception:
                self._minio = None
        else:
            self._bucket = None

    def _path(self, descriptor: flight.FlightDescriptor) -> str:
        return "/".join(
            p.decode() if isinstance(p, (bytes, bytearray)) else p
            for p in descriptor.path
        )

    def do_put(self, context, descriptor, reader, writer):  # type: ignore[override]
        path = self._path(descriptor)
        table = reader.read_all()
        logger.info("💾 storing table %s rows=%d", path, table.num_rows)
        self._tables[path] = table
        writer.write(b"OK")

    def do_get(self, context, ticket):  # type: ignore[override]
        path = ticket.ticket.decode()
        logger.info("🔎 fetching table %s", path)
        table = self._tables.get(path)
        if table is None and self._minio and self._bucket:
            arrow_obj = get_arrow_for_flight_path(path)
            if arrow_obj:
                try:
                    logger.info("⬇️ loading %s from MinIO object %s", path, arrow_obj)
                    resp = self._minio.get_object(self._bucket, arrow_obj)
                    data = resp.read()
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(data))
                    table = reader.read_all()
                    self._tables[path] = table
                except S3Error:
                    table = None
        if table is None:
            raise flight.FlightUnavailableError(f"No table for {path}")
        logger.info("\u2705 returning table %s rows=%d", path, table.num_rows)
        return flight.RecordBatchStream(table)

    def get_flight_info(self, context, descriptor):  # type: ignore[override]
        path = self._path(descriptor)
        logger.info("\u2139\ufe0f info request for %s", path)
        table = self._tables.get(path)
        if table is None and self._minio and self._bucket:
            arrow_obj = get_arrow_for_flight_path(path)
            if arrow_obj:
                try:
                    logger.info("⬇️ loading %s from MinIO object %s", path, arrow_obj)
                    resp = self._minio.get_object(self._bucket, arrow_obj)
                    data = resp.read()
                    reader = ipc.RecordBatchFileReader(pa.BufferReader(data))
                    table = reader.read_all()
                    self._tables[path] = table
                except S3Error:
                    table = None
        if table is None:
            raise flight.FlightUnavailableError(f"No table for {path}")
        logger.info("\u2705 info found for %s rows=%d", path, table.num_rows)
        endpoint = flight.FlightEndpoint(
            ticket=flight.Ticket(path),
            locations=[flight.Location.for_grpc_tcp(self._host, self._port)],
        )
        return flight.FlightInfo(table.schema, descriptor, [endpoint], table.num_rows, table.nbytes)

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    host = os.getenv("FLIGHT_HOST", "0.0.0.0")
    port = int(os.getenv("FLIGHT_PORT", "8815"))
    server = ArrowFlightServer(host, port)
    logger.info("\u2708\ufe0f Arrow Flight server running on %s:%s", host, port)
    server.serve()
