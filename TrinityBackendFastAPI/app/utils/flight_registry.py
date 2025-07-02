from typing import Dict, Tuple
import json
import os
from pathlib import Path
from datetime import datetime

REGISTRY_PATH = Path(os.getenv("FLIGHT_REGISTRY_FILE", "arrow_data/flight_registry.json"))

def _load() -> tuple[Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str]]:
    if REGISTRY_PATH.exists():
        try:
            with REGISTRY_PATH.open("r") as f:
                data = json.load(f)
                return (
                    data.get("latest_by_key", {}),
                    data.get("filekey_to_csv", {}),
                    data.get("csv_to_flight", {}),
                    data.get("arrow_to_original", {}),
                )
        except Exception:
            pass
    return {}, {}, {}, {}

def _save() -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REGISTRY_PATH.open("w") as f:
        json.dump(
            {
                "latest_by_key": LATEST_TICKETS_BY_KEY,
                "filekey_to_csv": FILEKEY_TO_CSV,
                "csv_to_flight": CSV_TO_FLIGHT,
                "arrow_to_original": ARROW_TO_ORIGINAL,
            },
            f,
        )

LATEST_TICKETS_BY_KEY: Dict[str, str]
FILEKEY_TO_CSV: Dict[str, str]
CSV_TO_FLIGHT: Dict[str, str]
ARROW_TO_ORIGINAL: Dict[str, str]

LATEST_TICKETS_BY_KEY, FILEKEY_TO_CSV, CSV_TO_FLIGHT, ARROW_TO_ORIGINAL = _load()


def set_ticket(file_key: str, arrow_name: str, flight_path: str, original_csv: str) -> None:
    """Register the flight path and mapping for a saved dataframe."""
    LATEST_TICKETS_BY_KEY[file_key] = flight_path
    FILEKEY_TO_CSV[file_key] = arrow_name
    CSV_TO_FLIGHT[arrow_name] = flight_path
    ARROW_TO_ORIGINAL[arrow_name] = original_csv
    _save()


def get_ticket_by_key(file_key: str) -> Tuple[str | None, str | None]:
    return LATEST_TICKETS_BY_KEY.get(file_key), FILEKEY_TO_CSV.get(file_key)


def get_flight_path_for_csv(csv_name: str) -> str | None:
    """Return the registered flight path for the given CSV."""
    path = CSV_TO_FLIGHT.get(csv_name)
    print(f"➡️ lookup flight path for {csv_name}: {path}")
    return path


def get_original_csv(arrow_name: str) -> str | None:
    """Return the original CSV filename for a stored Arrow object."""
    return ARROW_TO_ORIGINAL.get(arrow_name)


def get_latest_ticket_for_basename(csv_base: str) -> Tuple[str | None, str | None]:
    """Return the latest flight path and arrow name matching the base filename."""
    matches = []
    for arrow_name, flight_path in CSV_TO_FLIGHT.items():
        display = ARROW_TO_ORIGINAL.get(arrow_name, "")
        candidate = os.path.basename(display) if display else os.path.basename(arrow_name)
        if candidate.endswith(csv_base):
            base = os.path.basename(arrow_name)
            parts = base.split("_", 2)
            if len(parts) >= 2:
                try:
                    ts = datetime.strptime(f"{parts[0]}_{parts[1]}", "%Y%m%d_%H%M%S")
                except Exception:
                    ts = datetime.min
            else:
                ts = datetime.min
            matches.append((ts, flight_path, arrow_name))
    if not matches:
        return None, None
    matches.sort(key=lambda x: x[0], reverse=True)
    _, path, name = matches[0]
    return path, name
