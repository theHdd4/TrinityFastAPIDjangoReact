from typing import Dict, Tuple
import json
import os
import logging
from pathlib import Path
from datetime import datetime

try:
    import redis  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    redis = None

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
_redis = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True) if redis else None

REGISTRY_PATH = Path(os.getenv("FLIGHT_REGISTRY_FILE", "arrow_data/flight_registry.json"))

logger = logging.getLogger("trinity.flight")

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
    logger.info(
        "\U0001f4cc register %s: flight_path=%s arrow=%s original=%s",
        file_key,
        flight_path,
        arrow_name,
        original_csv,
    )
    LATEST_TICKETS_BY_KEY[file_key] = flight_path
    FILEKEY_TO_CSV[file_key] = arrow_name
    CSV_TO_FLIGHT[arrow_name] = flight_path
    ARROW_TO_ORIGINAL[arrow_name] = original_csv
    _save()
    if _redis is not None:
        try:
            _redis.set(f"flight:{flight_path}", arrow_name)
        except Exception:
            pass

def rename_arrow_object(old_name: str, new_name: str) -> None:
    """Update registry mappings when an Arrow object is renamed."""
    flight_path = CSV_TO_FLIGHT.pop(old_name, None)
    if flight_path:
        CSV_TO_FLIGHT[new_name] = flight_path
        if _redis is not None:
            try:
                _redis.set(f"flight:{flight_path}", new_name)
            except Exception:
                pass
    for key, val in list(FILEKEY_TO_CSV.items()):
        if val == old_name:
            FILEKEY_TO_CSV[key] = new_name
    if old_name in ARROW_TO_ORIGINAL:
        ARROW_TO_ORIGINAL[new_name] = ARROW_TO_ORIGINAL.pop(old_name)
    _save()


def remove_arrow_object(arrow_name: str) -> None:
    """Remove mappings and Redis keys when an Arrow object is deleted."""
    flight_path = CSV_TO_FLIGHT.pop(arrow_name, None)
    if flight_path and _redis is not None:
        try:
            _redis.delete(f"flight:{flight_path}")
        except Exception:
            pass
    keys_to_remove = [k for k, v in FILEKEY_TO_CSV.items() if v == arrow_name]
    for key in keys_to_remove:
        FILEKEY_TO_CSV.pop(key, None)
        LATEST_TICKETS_BY_KEY.pop(key, None)
    ARROW_TO_ORIGINAL.pop(arrow_name, None)
    _save()


def get_ticket_by_key(file_key: str) -> Tuple[str | None, str | None]:
    path = LATEST_TICKETS_BY_KEY.get(file_key)
    arrow = FILEKEY_TO_CSV.get(file_key)
    logger.info("\U0001f50e lookup ticket by key %s: %s -> %s", file_key, path, arrow)
    return path, arrow


def get_flight_path_for_csv(csv_name: str) -> str | None:
    """Return the registered flight path for the given CSV."""
    path = CSV_TO_FLIGHT.get(csv_name)
    if path is None:
        path = CSV_TO_FLIGHT.get(Path(csv_name).name)
    logger.info("➡️ lookup flight path for %s: %s", csv_name, path)
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


def get_arrow_for_flight_path(flight_path: str) -> str | None:
    """Return stored arrow object for the given flight path."""
    arrow_name: str | None = None
    if _redis is not None:
        try:
            obj = _redis.get(f"flight:{flight_path}")
            arrow_name = obj if isinstance(obj, str) else obj.decode() if obj else None
            if arrow_name:
                logger.info("\U0001f50d redis lookup %s -> %s", flight_path, arrow_name)
                return arrow_name
        except Exception:
            pass

    # Fallback to the registry mappings if Redis is unavailable or missing data
    for a_name, path in CSV_TO_FLIGHT.items():
        if path == flight_path:
            logger.info("\U0001f50d registry lookup %s -> %s", flight_path, a_name)
            arrow_name = a_name
            break

    return arrow_name
