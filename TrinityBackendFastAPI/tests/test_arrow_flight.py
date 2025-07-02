import os
import sys
import pathlib
import pandas as pd
import pyarrow.flight as flight
import threading
import json

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app"))
from flight_server import ArrowFlightServer
import importlib
arrow_client = importlib.import_module("utils.arrow_client")
flight_registry = importlib.import_module("utils.flight_registry")


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


def test_flight_registry():
    flight_registry.set_ticket("sales", "file.arrow", "path/to/table", "file.csv")
    path, arrow = flight_registry.get_ticket_by_key("sales")
    assert path == "path/to/table"
    assert arrow == "file.arrow"
    assert flight_registry.get_flight_path_for_csv("file.arrow") == "path/to/table"
    path2, arrow2 = flight_registry.get_latest_ticket_for_basename("file.csv")
    assert path2 == "path/to/table"
    assert arrow2 == "file.arrow"


def test_registry_persistence(tmp_path, monkeypatch):
    reg_file = tmp_path / "registry.json"
    monkeypatch.setenv("FLIGHT_REGISTRY_FILE", str(reg_file))
    import importlib
    reg = importlib.reload(flight_registry)
    reg.set_ticket("sales", "file.arrow", "path/to/table", "file.csv")
    assert json.load(open(reg_file, "r"))[
        "latest_by_key"]["sales"] == "path/to/table"
    reg2 = importlib.reload(flight_registry)
    assert reg2.get_ticket_by_key("sales")[0] == "path/to/table"

