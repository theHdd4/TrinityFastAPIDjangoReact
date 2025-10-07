from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Iterable, List, Optional

from fastapi.concurrency import run_in_threadpool


def _default_storage_path() -> Path:
    """Return the default JSON file location for exhibition configurations."""

    root_dir = Path(os.getenv("EXHIBITION_STORAGE_DIR", "").strip() or Path(__file__).resolve().parents[3] / "storage")
    return Path(root_dir) / "exhibition_configurations.json"


class ExhibitionStorage:
    """Persist exhibition configurations to a JSON file.

    The production service uses MongoDB, however the developer environment that
    powers the automated tests does not ship with Mongo. To keep the API fully
    functional we persist the payloads to a JSON file instead. The helper wraps
    all file operations in a threadpool to avoid blocking the event loop when
    the FastAPI routes execute.
    """

    def __init__(self, storage_file: Optional[os.PathLike[str] | str] = None) -> None:
        self._path = Path(storage_file) if storage_file is not None else _default_storage_path()
        self._lock = Lock()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _read_all_sync(self) -> List[Dict[str, Any]]:
        with self._lock:
            if not self._path.exists():
                return []

            try:
                with self._path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except json.JSONDecodeError:
                return []

            if isinstance(payload, list):
                return [entry for entry in payload if isinstance(entry, dict)]
            return []

    def _write_all_sync(self, records: Iterable[Dict[str, Any]]) -> None:
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            serialisable = list(records)
            with self._path.open("w", encoding="utf-8") as handle:
                json.dump(serialisable, handle, ensure_ascii=False, indent=2, sort_keys=True, default=str)

    @staticmethod
    def _normalise_identity(value: str) -> str:
        return value.strip()

    @staticmethod
    def _sanitise_cards(cards: Any) -> List[Dict[str, Any]]:
        if isinstance(cards, list):
            return [card for card in cards if isinstance(card, dict)]
        return []

    @staticmethod
    def _sanitise_feature_overview(feature_overview: Any) -> List[Dict[str, Any]]:
        if isinstance(feature_overview, list):
            return [entry for entry in feature_overview if isinstance(entry, dict)]
        return []

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def list_configurations(self) -> List[Dict[str, Any]]:
        return await run_in_threadpool(self._read_all_sync)

    async def get_configuration(self, client_name: str, app_name: str, project_name: str) -> Optional[Dict[str, Any]]:
        def _lookup() -> Optional[Dict[str, Any]]:
            client = self._normalise_identity(client_name)
            app = self._normalise_identity(app_name)
            project = self._normalise_identity(project_name)

            for record in self._read_all_sync():
                if (
                    self._normalise_identity(str(record.get("client_name", ""))) == client
                    and self._normalise_identity(str(record.get("app_name", ""))) == app
                    and self._normalise_identity(str(record.get("project_name", ""))) == project
                ):
                    return record
            return None

        return await run_in_threadpool(_lookup)

    async def save_configuration(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        def _save() -> Dict[str, Any]:
            records = self._read_all_sync()

            client = self._normalise_identity(str(payload.get("client_name", "")))
            app = self._normalise_identity(str(payload.get("app_name", "")))
            project = self._normalise_identity(str(payload.get("project_name", "")))

            updated_payload: Dict[str, Any] = {
                **payload,
                "client_name": client,
                "app_name": app,
                "project_name": project,
                "cards": self._sanitise_cards(payload.get("cards")),
                "feature_overview": self._sanitise_feature_overview(payload.get("feature_overview")),
            }

            timestamp = self._timestamp()
            updated_payload.setdefault("created_at", timestamp)
            updated_payload["updated_at"] = timestamp

            replaced = False
            for index, record in enumerate(records):
                if (
                    self._normalise_identity(str(record.get("client_name", ""))) == client
                    and self._normalise_identity(str(record.get("app_name", ""))) == app
                    and self._normalise_identity(str(record.get("project_name", ""))) == project
                ):
                    updated_payload.setdefault("created_at", record.get("created_at", timestamp))
                    records[index] = updated_payload
                    replaced = True
                    break

            if not replaced:
                records.append(updated_payload)

            self._write_all_sync(records)
            return updated_payload

        return await run_in_threadpool(_save)


__all__ = ["ExhibitionStorage"]
