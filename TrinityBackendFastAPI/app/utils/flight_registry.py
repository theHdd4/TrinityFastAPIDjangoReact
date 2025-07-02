from typing import Dict, Tuple

LATEST_TICKETS_BY_KEY: Dict[str, str] = {}
FILEKEY_TO_CSV: Dict[str, str] = {}
CSV_TO_FLIGHT: Dict[str, str] = {}


def set_ticket(file_key: str, csv_name: str, flight_path: str) -> None:
    LATEST_TICKETS_BY_KEY[file_key] = flight_path
    FILEKEY_TO_CSV[file_key] = csv_name
    CSV_TO_FLIGHT[csv_name] = flight_path


def get_ticket_by_key(file_key: str) -> Tuple[str | None, str | None]:
    return LATEST_TICKETS_BY_KEY.get(file_key), FILEKEY_TO_CSV.get(file_key)


def get_flight_path_for_csv(csv_name: str) -> str | None:
    return CSV_TO_FLIGHT.get(csv_name)
