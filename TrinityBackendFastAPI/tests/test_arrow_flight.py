import os
import sys
import pathlib
import pandas as pd
import pyarrow.flight as flight
import threading

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from flight_server import ArrowFlightServer
import importlib
arrow_client = importlib.import_module("utils.arrow_client")


def test_flight_round_trip():
    server = ArrowFlightServer(host="0.0.0.0", port=0)
    thread = threading.Thread(target=server.serve, daemon=True)
    thread.start()
    import time
    time.sleep(0.2)

    os.environ["FLIGHT_HOST"] = "localhost"
    os.environ["FLIGHT_PORT"] = str(server.port)
    import importlib
    importlib.reload(arrow_client)

    df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
    arrow_client.upload_dataframe(df, "test/table")
    result = arrow_client.download_dataframe("test/table")

    server.shutdown()
    thread.join()

    pd.testing.assert_frame_equal(df, result)
