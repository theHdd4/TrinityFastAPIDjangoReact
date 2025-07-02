from typing import Dict, Tuple
import json
import os
from pathlib import Path

REGISTRY_PATH = Path(os.getenv("FLIGHT_REGISTRY_FILE", "arrow_data/flight_registry.json"))

def _load() -> tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    if REGISTRY_PATH.exists():
        try:
            with REGISTRY_PATH.open("r") as f:
                data = json.load(f)
                return (
                    data.get("latest_by_key", {}),
                    data.get("filekey_to_csv", {}),
                    data.get("csv_to_flight", {}),
                )
        except Exception:
            pass
    return {}, {}, {}

def _save() -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REGISTRY_PATH.open("w") as f:
        json.dump(
            {
                "latest_by_key": LATEST_TICKETS_BY_KEY,
                "filekey_to_csv": FILEKEY_TO_CSV,
                "csv_to_flight": CSV_TO_FLIGHT,
            },
            f,
        )

LATEST_TICKETS_BY_KEY: Dict[str, str]
FILEKEY_TO_CSV: Dict[str, str]
CSV_TO_FLIGHT: Dict[str, str]

LATEST_TICKETS_BY_KEY, FILEKEY_TO_CSV, CSV_TO_FLIGHT = _load()


def set_ticket(file_key: str, csv_name: str, flight_path: str) -> None:
    LATEST_TICKETS_BY_KEY[file_key] = flight_path
    FILEKEY_TO_CSV[file_key] = csv_name
    CSV_TO_FLIGHT[csv_name] = flight_path
    _save()


def get_ticket_by_key(file_key: str) -> Tuple[str | None, str | None]:
    return LATEST_TICKETS_BY_KEY.get(file_key), FILEKEY_TO_CSV.get(file_key)


def get_flight_path_for_csv(csv_name: str) -> str | None:
    return CSV_TO_FLIGHT.get(csv_name)
