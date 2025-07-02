from typing import Dict, Tuple
import json
import os
from pathlib import Path
from datetime import datetime

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


def get_latest_ticket_for_basename(csv_base: str) -> Tuple[str | None, str | None]:
    """Return the latest flight path and csv name matching the base filename."""
    matches = []
    for csv_name, flight_path in CSV_TO_FLIGHT.items():
        if os.path.basename(csv_name).endswith(csv_base):
            base = os.path.basename(csv_name)
            parts = base.split("_", 2)
            if len(parts) >= 2:
                try:
                    ts = datetime.strptime(f"{parts[0]}_{parts[1]}", "%Y%m%d_%H%M%S")
                except Exception:
                    ts = datetime.min
            else:
                ts = datetime.min
            matches.append((ts, flight_path, csv_name))
    if not matches:
        return None, None
    matches.sort(key=lambda x: x[0], reverse=True)
    _, path, name = matches[0]
    return path, name
