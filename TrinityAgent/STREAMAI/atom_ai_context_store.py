"""MongoDB persistence layer for atom-level AI context in laboratory mode."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

from BaseAgent.config import settings

logger = logging.getLogger("trinity.trinityai.atom_context_store")


class AtomAIContextStore:
    """Persist and hydrate per-session atom context for laboratory mode."""

    def __init__(
        self,
        mongo_client: Optional[MongoClient] = None,
        collection_name: str = "Trinity_AI_Context",
    ) -> None:
        self.mongo_client = mongo_client or self._build_mongo_client()
        database_name = getattr(settings, "MONGO_DB", None) or settings.CONFIG_DB or "trinity_db"
        self.collection: Collection = self.mongo_client[database_name].get_collection(collection_name)
        self._ensure_indexes()

    @staticmethod
    def _build_mongo_client() -> MongoClient:
        if settings.MONGO_URI:
            return MongoClient(
                settings.MONGO_URI,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000,
            )

        auth_source = settings.MONGO_AUTH_SOURCE or settings.MONGO_AUTH_DB or "admin"
        uri = (
            f"mongodb://{settings.MONGO_HOST or settings.HOST_IP}:{settings.MONGO_PORT}/"
            f"{getattr(settings, 'MONGO_DB', None) or settings.CONFIG_DB or 'trinity_db'}"
            f"?authSource={auth_source}"
        )
        return MongoClient(
            uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
        )

    def _ensure_indexes(self) -> None:
        try:
            self.collection.create_index(
                [
                    ("client_name", ASCENDING),
                    ("app_name", ASCENDING),
                    ("project_name", ASCENDING),
                    ("session_id", ASCENDING),
                ],
                name="ctx_scope_idx",
            )
            self.collection.create_index([("updated_at", ASCENDING)], name="ctx_updated_idx")
        except PyMongoError as exc:  # pragma: no cover - best effort
            logger.warning("⚠️ Failed to create Atom AI context indexes: %s", exc)

    @staticmethod
    def _context_filter(session_id: str, project_context: Dict[str, Any]) -> Dict[str, Any]:
        context = project_context or {}
        return {
            "client_name": context.get("client_name", ""),
            "app_name": context.get("app_name", ""),
            "project_name": context.get("project_name", ""),
            "session_id": session_id,
        }

    def load_metadata(self, session_id: str, project_context: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        """Return persisted metadata for a session/project combination."""

        try:
            doc = self.collection.find_one(self._context_filter(session_id, project_context))
            return (doc or {}).get("files") or {}
        except PyMongoError as exc:  # pragma: no cover - defensive read guard
            logger.warning("⚠️ Failed to load Atom AI context: %s", exc)
            return {}

    def upsert_metadata(
        self,
        *,
        session_id: str,
        project_context: Dict[str, Any],
        files: Dict[str, Dict[str, Any]],
        prompt: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Merge new metadata into the Trinity_AI_Context collection."""

        if not files:
            return

        filter_doc = self._context_filter(session_id, project_context)

        try:
            existing = self.collection.find_one(filter_doc) or {}
            merged_files = {**(existing.get("files") or {}), **files}

            update_doc: Dict[str, Any] = {
                "$set": {
                    **filter_doc,
                    "mode": (project_context or {}).get("mode", "laboratory"),
                    "files": merged_files,
                },
                "$currentDate": {"updated_at": True},
            }

            if prompt:
                update_doc["$set"]["last_prompt"] = prompt
            if analysis:
                update_doc["$set"]["last_analysis"] = analysis
            if "created_at" not in existing:
                update_doc.setdefault("$setOnInsert", {})["created_at"] = datetime.utcnow()

            self.collection.update_one(filter_doc, update_doc, upsert=True)
            logger.info(
                "💾 Atom AI context persisted for %s/%s/%s (session=%s, files=%s)",
                filter_doc.get("client_name"),
                filter_doc.get("app_name"),
                filter_doc.get("project_name"),
                session_id,
                len(files),
            )
        except PyMongoError as exc:  # pragma: no cover - defensive write guard
            logger.warning("⚠️ Failed to upsert Atom AI context: %s", exc)

