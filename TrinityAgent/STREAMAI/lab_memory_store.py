"""Storage adapters for Laboratory Mode deterministic memory."""

from __future__ import annotations

import io
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from minio import Minio
from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError

from BaseAgent.config import settings
from STREAMAI.lab_memory_models import (
    AnalysisInsights,
    BusinessGoals,
    LaboratoryEnvelope,
    LaboratoryMemoryDocument,
    WorkflowState,
    WorkflowStepRecord,
)

logger = logging.getLogger("trinity.trinityai.lab_memory_store")


class LabMemoryStore:
    """Persist and retrieve laboratory-mode memory using MinIO + MongoDB."""

    def __init__(
        self,
        minio_client: Optional[Minio] = None,
        mongo_client: Optional[MongoClient] = None,
        bucket: Optional[str] = None,
        prefix: str = "lab",
    ) -> None:
        self.minio_client = minio_client or self._build_minio_client()
        self.mongo_client = mongo_client or self._build_mongo_client()
        self.bucket = bucket or settings.MINIO_BUCKET
        self.prefix = prefix.rstrip("/")
        self.client_name, self.app_name, self.project_name = self._resolve_context()
        self._ensure_bucket()
        self.mongo_collection = self._ensure_collection()

    @staticmethod
    def _build_minio_client() -> Minio:
        secure = str(settings.MINIO_SECURE).lower() == "true"
        return Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=secure,
        )

    @staticmethod
    def _build_mongo_client() -> MongoClient:
        if settings.MONGO_URI:
            return MongoClient(settings.MONGO_URI)
        auth_source = settings.MONGO_AUTH_SOURCE or settings.MONGO_AUTH_DB or "admin"
        uri = f"mongodb://{settings.MONGO_HOST or settings.HOST_IP}:{settings.MONGO_PORT}/{settings.CONFIG_DB}?authSource={auth_source}"
        return MongoClient(uri)

    def _ensure_bucket(self) -> None:
        try:
            if not self.minio_client.bucket_exists(self.bucket):
                self.minio_client.make_bucket(self.bucket)
                logger.info("Created MinIO bucket for laboratory memory: %s", self.bucket)
        except Exception as exc:  # pragma: no cover - infrastructure guard
            logger.warning("Failed to ensure MinIO bucket: %s", exc)

    def _ensure_collection(self) -> Collection:
        database_name = settings.CONFIG_DB or getattr(settings, "MONGO_DB", None) or "trinity_db"
        database = self.mongo_client[database_name]
        collection = database.get_collection("Trinity_AI_Context")
        try:
            collection.create_index(
                [
                    ("client_name", ASCENDING),
                    ("app_name", ASCENDING),
                    ("project_name", ASCENDING),
                    ("session_id", ASCENDING),
                    ("request_id", ASCENDING),
                ]
            )
            collection.create_index(
                [
                    ("client_name", ASCENDING),
                    ("app_name", ASCENDING),
                    ("project_name", ASCENDING),
                    ("model_version", ASCENDING),
                    ("prompt_template_version", ASCENDING),
                ]
            )
            collection.create_index([("record_type", ASCENDING), ("step_number", ASCENDING)])
        except PyMongoError as exc:  # pragma: no cover - index creation best-effort
            logger.warning("Failed to create MongoDB indices for lab context: %s", exc)
        return collection

    def update_react_context(
        self,
        *,
        session_id: str,
        request_id: Optional[str],
        latest_dataset_alias: Optional[str],
        output_path: Optional[str],
        output_schema: Optional[Any],
        created_by: Optional[str],
        step_number: Optional[int],
        project_context: Optional[Dict[str, Any]] = None,
        previous_available_files: Optional[List[str]] = None,
        execution_inputs: Optional[Dict[str, Any]] = None,
        react_metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Persist ReAct loop state so downstream atoms can consume fresh outputs.

        This mirrors the laboratory-mode state diagram by ensuring MongoDB holds
        the latest dataset alias, dataset registry, and atom lineage so the
        next atom can deterministically locate the correct input file.
        """

        if not request_id or not latest_dataset_alias or not output_path:
            return

        self.apply_context(project_context)

        dataset_entry = {
            "path": output_path,
            "schema": output_schema,
            "created_by": created_by,
            "updated_at": datetime.utcnow(),
        }

        history_entry = {
            "step_number": step_number,
            "atom_id": created_by,
            "output_alias": latest_dataset_alias,
            "output_path": output_path,
            "timestamp": datetime.utcnow(),
            "inputs": execution_inputs or {},
        }

        base_filter = {
            "client_name": self.client_name,
            "app_name": self.app_name,
            "project_name": self.project_name,
            "session_id": session_id,
            "request_id": request_id,
            "record_type": {"$ne": "atom_snapshot"},
        }

        update_doc: Dict[str, Any] = {
            "$set": {
                "client_name": self.client_name,
                "app_name": self.app_name,
                "project_name": self.project_name,
                "session_id": session_id,
                "request_id": request_id,
                "record_type": "react_context",
                "latest_dataset_alias": latest_dataset_alias,
                "react_state.last_output_alias": latest_dataset_alias,
                f"datasets.{latest_dataset_alias}": dataset_entry,
                "updated_at": datetime.utcnow(),
            },
            "$push": {
                "atom_history": history_entry,
            },
        }

        if previous_available_files is not None:
            update_doc["$set"]["available_files"] = previous_available_files
        if react_metadata is not None:
            update_doc["$set"]["react_state.metadata"] = react_metadata

        try:
            self.mongo_collection.update_one(base_filter, update_doc, upsert=True)
            logger.info(
                "💾 Updated Trinity_AI_Context for session=%s request=%s with alias %s → %s",
                session_id,
                request_id,
                latest_dataset_alias,
                output_path,
            )
        except PyMongoError as exc:  # pragma: no cover - database guard
            logger.warning("Failed to update Trinity_AI_Context for ReAct chaining: %s", exc)

    def _load_existing_context(
        self,
        *,
        session_id: str,
        request_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Return the latest persisted context document for a session/request.

        Atom snapshots are excluded because they are stored separately with
        ``record_type="atom_snapshot"`` and should not be merged with the
        primary request document.
        """

        query: Dict[str, Any] = {
            "client_name": self.client_name,
            "app_name": self.app_name,
            "project_name": self.project_name,
            "session_id": session_id,
            "record_type": {"$ne": "atom_snapshot"},
        }
        if request_id:
            query["request_id"] = request_id

        try:
            return self.mongo_collection.find_one(query, sort=[("timestamp", -1)])
        except PyMongoError as exc:  # pragma: no cover - defensive read guard
            logger.warning("Failed to load existing lab context: %s", exc)
            return None

    def load_react_context(
        self,
        *,
        session_id: str,
        request_id: Optional[str] = None,
        project_context: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Return the most recent ReAct context document for chaining outputs.

        The returned document includes ``latest_dataset_alias``, ``datasets``
        (alias → path/schema), and ``available_files`` so that the orchestrator
        can hydrate alias resolution after a restart or crash.
        """

        self.apply_context(project_context)

        query: Dict[str, Any] = {
            "client_name": self.client_name,
            "app_name": self.app_name,
            "project_name": self.project_name,
            "session_id": session_id,
            "record_type": "react_context",
        }
        if request_id:
            query["request_id"] = request_id

        try:
            return self.mongo_collection.find_one(query, sort=[("updated_at", -1)])
        except PyMongoError as exc:  # pragma: no cover - defensive read guard
            logger.warning("Failed to load ReAct context for chaining: %s", exc)
            return None

    @staticmethod
    def _merge_atom_execution_metadata(
        existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Merge atom execution metadata lists while deduplicating entries.

        Entries are keyed by (step_number, atom_id, normalized inputs) to avoid
        duplicate cards or repeated execution history rows.
        """

        def _metadata_key(entry: Dict[str, Any]) -> Tuple[Any, Any, str]:
            try:
                inputs_serialized = json.dumps(entry.get("inputs") or {}, sort_keys=True, default=str)
            except Exception:
                inputs_serialized = str(entry.get("inputs"))
            return (
                entry.get("step_number"),
                entry.get("atom_id"),
                inputs_serialized,
            )

        merged: Dict[Tuple[Any, Any, str], Dict[str, Any]] = {}
        for source in (existing or []) + (incoming or []):
            key = _metadata_key(source)
            merged[key] = {**source}

        # Stable ordering by step number then timestamp if available
        def _sort_key(entry: Dict[str, Any]) -> Tuple[int, datetime]:
            step_num = entry.get("step_number") or 0
            timestamp = entry.get("timestamp")
            if isinstance(timestamp, datetime):
                return step_num, timestamp
            return step_num, datetime.utcnow()

        merged_list = list(merged.values())
        merged_list.sort(key=_sort_key)
        return merged_list

    def get_or_create_request_id(
        self, session_id: str, incoming_request_id: Optional[str], project_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Return a stable request ID for a session/project combination.

        If a context document already exists for the session, reuse its
        ``request_id`` to keep a single Mongo row per project/session. When no
        record exists, the provided ``incoming_request_id`` is returned.
        """

        self.apply_context(project_context)
        existing = self._load_existing_context(session_id=session_id)
        if existing and existing.get("request_id"):
            return str(existing["request_id"])
        return incoming_request_id or f"req-{session_id}"

    def get_atom_execution_metadata(
        self,
        *,
        session_id: str,
        request_id: Optional[str] = None,
        project_context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Load atom execution metadata for the given session/request."""

        self.apply_context(project_context)
        existing = self._load_existing_context(session_id=session_id, request_id=request_id)
        if not existing:
            return []
        return existing.get("atom_execution_metadata") or []

    def _resolve_context_from_env(self) -> Tuple[str, str, str]:
        """Resolve client/app/project from environment and settings overrides."""

        def _first_non_empty(*candidates: Optional[str]) -> Optional[str]:
            for candidate in candidates:
                if candidate and str(candidate).strip():
                    return str(candidate).strip("/")
            return None

        client = _first_non_empty(
            os.getenv("CLIENT_NAME"),
            os.getenv("REDIS_CLIENT_NAME"),
            os.getenv("POSTGRES_CLIENT_NAME"),
            os.getenv("MONGO_CLIENT_NAME"),
            getattr(settings, "CLIENT_NAME", None),
        )
        app = _first_non_empty(
            os.getenv("APP_NAME"),
            os.getenv("REDIS_APP_NAME"),
            os.getenv("POSTGRES_APP_NAME"),
            os.getenv("MONGO_APP_NAME"),
            getattr(settings, "APP_NAME", None),
        )
        project = _first_non_empty(
            os.getenv("PROJECT_NAME"),
            os.getenv("REDIS_PROJECT_NAME"),
            os.getenv("POSTGRES_PROJECT_NAME"),
            os.getenv("MONGO_PROJECT_NAME"),
            getattr(settings, "PROJECT_NAME", None),
        )

        return (
            (client or "default_client"),
            (app or "default_app"),
            (project or "default_project"),
        )

    def _resolve_context(self, overrides: Optional[Dict[str, Any]] = None) -> Tuple[str, str, str]:
        base_client, base_app, base_project = self._resolve_context_from_env()
        overrides = overrides or {}

        def _sanitize(value: Optional[str], fallback: str) -> str:
            if value and str(value).strip():
                return str(value).strip("/")
            return fallback

        client_name = _sanitize(
            overrides.get("client_name") or overrides.get("client") or overrides.get("clientName"),
            base_client,
        )
        app_name = _sanitize(
            overrides.get("app_name") or overrides.get("app") or overrides.get("appName"),
            base_app,
        )
        project_name = _sanitize(
            overrides.get("project_name") or overrides.get("project") or overrides.get("projectName"),
            base_project,
        )

        return client_name or "default_client", app_name or "default_app", project_name or "default_project"

    def apply_context(self, project_context: Optional[Dict[str, Any]]) -> None:
        """Update context using project context or environment fallbacks."""

        if project_context is None:
            return

        resolved_client, resolved_app, resolved_project = self._resolve_context(project_context)
        if (
            resolved_client == self.client_name
            and resolved_app == self.app_name
            and resolved_project == self.project_name
        ):
            return

        logger.info(
            "🔧 Updating lab memory context to %s/%s/%s (previous %s/%s/%s)",
            resolved_client,
            resolved_app,
            resolved_project,
            self.client_name,
            self.app_name,
            self.project_name,
        )
        self.client_name = resolved_client
        self.app_name = resolved_app
        self.project_name = resolved_project

    def _object_prefix(self, session_id: str) -> str:
        return "/".join(
            [
                self.client_name,
                self.app_name,
                self.project_name,
                self.prefix,
                session_id,
            ]
        )

    def _object_key(self, session_id: str, request_id: str) -> str:
        return f"{self._object_prefix(session_id)}/{request_id}.json"

    def _atom_history_prefix(self, session_id: str, request_id: str) -> str:
        return f"{self._object_prefix(session_id)}/{request_id}/atoms"

    def _atom_history_key(self, session_id: str, request_id: str, step_number: int) -> str:
        return f"{self._atom_history_prefix(session_id, request_id)}/{step_number:04d}.json"

    def save_document(self, document: LaboratoryMemoryDocument, project_context: Optional[Dict[str, Any]] = None) -> None:
        self.apply_context(project_context)
        payload = document.to_sorted_dict()
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        data = serialized.encode("utf-8")
        key = self._object_key(document.envelope.session_id, document.envelope.request_id)
        existing_doc = self._load_existing_context(
            session_id=document.envelope.session_id,
            request_id=document.envelope.request_id,
        )

        try:
            self.minio_client.put_object(
                bucket_name=self.bucket,
                object_name=key,
                data=io.BytesIO(data),
                length=len(data),
            )
            logger.info("Stored laboratory memory in MinIO at %s", key)
        except Exception as exc:  # pragma: no cover - network/storage guard
            logger.warning("Failed to store laboratory memory in MinIO: %s", exc)

        try:
            new_atom_metadata = [
                {
                    "step_number": step.step_number,
                    "atom_id": step.atom_id,
                    "tool_calls": step.tool_calls,
                    "inputs": step.inputs,
                    "outputs": step.outputs,
                    "timestamp": step.timestamp,
                }
                for step in document.workflow_state.steps
            ]

            merged_metadata = self._merge_atom_execution_metadata(
                existing_doc.get("atom_execution_metadata") if existing_doc else [],
                new_atom_metadata,
            )

            mongo_payload = {
                **payload,
                "memory_type": "Trinity AI Persistent JSON Memory",
                "client_name": self.client_name,
                "app_name": self.app_name,
                "project_name": self.project_name,
                "session_id": document.envelope.session_id,
                "request_id": document.envelope.request_id,
                "timestamp": document.envelope.timestamp,
                "model_version": document.envelope.model_version,
                "prompt_template_version": document.envelope.prompt_template_version,
                "prompt_template_hash": document.envelope.prompt_template_hash,
                "input_hash": document.envelope.input_hash,
                "response_hash": LaboratoryMemoryDocument.compute_hash_for_payload(payload),
                "freshness_state": {
                    "template_hash": document.envelope.prompt_template_hash,
                    "input_hash": document.envelope.input_hash,
                    "deterministic_params": document.envelope.deterministic_params,
                    "retrieved_at": datetime.utcnow(),
                },
                "session_management": {
                    "user_id": document.envelope.user_id,
                    "feature_flags": document.envelope.feature_flags,
                },
                "atom_execution_metadata": merged_metadata,
            }
            self.mongo_collection.replace_one(
                {
                    "client_name": self.client_name,
                    "app_name": self.app_name,
                    "project_name": self.project_name,
                    "session_id": document.envelope.session_id,
                    "request_id": document.envelope.request_id,
                },
                mongo_payload,
                upsert=True,
            )
            logger.info(
                "Persisted laboratory memory to MongoDB for session=%s request=%s",
                document.envelope.session_id,
                document.envelope.request_id,
            )
        except PyMongoError as exc:  # pragma: no cover - database guard
            logger.warning("Failed to persist laboratory memory to MongoDB: %s", exc)

    def load_recent_documents(
        self,
        session_id: str,
        model_version: str,
        prompt_template_version: str,
        max_docs: int = 5,
        freshness_minutes: int = 360,
        project_context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Return recent lab documents that match freshness/version constraints."""

        self.apply_context(project_context)

        threshold = datetime.utcnow() - timedelta(minutes=freshness_minutes)
        cursor = self.mongo_collection.find(
            {
                "client_name": self.client_name,
                "app_name": self.app_name,
                "project_name": self.project_name,
                "session_id": session_id,
                "model_version": model_version,
                "prompt_template_version": prompt_template_version,
                "timestamp": {"$gte": threshold},
            }
        ).sort("timestamp", -1).limit(max_docs)
        documents = list(cursor)
        if documents:
            return documents

        # Fallback to MinIO retrieval when Mongo has no matching fresh documents
        try:
            records: List[Dict[str, Any]] = []
            for obj in self.minio_client.list_objects(self.bucket, prefix=self._object_prefix(session_id)):
                if not obj.object_name.endswith(".json"):
                    continue
                response = self.minio_client.get_object(self.bucket, obj.object_name)
                with response as stream:
                    raw = stream.read()
                record = json.loads(raw.decode("utf-8"))
                timestamp = record.get("envelope", {}).get("timestamp")
                if timestamp:
                    try:
                        record_timestamp = datetime.fromisoformat(str(timestamp))
                    except Exception:
                        record_timestamp = None
                else:
                    record_timestamp = None
                if record_timestamp and record_timestamp < threshold:
                    continue
                if record.get("envelope", {}).get("model_version") != model_version:
                    continue
                if record.get("envelope", {}).get("prompt_template_version") != prompt_template_version:
                    continue
                records.append(record)
            records.sort(key=lambda r: r.get("envelope", {}).get("timestamp", ""), reverse=True)
            return records[:max_docs]
        except Exception as exc:  # pragma: no cover - network/storage guard
            logger.warning("Failed MinIO fallback retrieval for lab context: %s", exc)
            return []

    def build_document(
        self,
        envelope: LaboratoryEnvelope,
        workflow_state: WorkflowState,
        business_goals: BusinessGoals,
        analysis_insights: AnalysisInsights,
        ) -> LaboratoryMemoryDocument:
        return LaboratoryMemoryDocument(
            envelope=envelope,
            workflow_state=workflow_state,
            business_goals=business_goals,
            analysis_insights=analysis_insights,
        )

    def append_atom_execution_metadata(
        self,
        *,
        envelope: LaboratoryEnvelope,
        step_record: WorkflowStepRecord,
        project_context: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Upsert atom execution metadata into the primary context document."""

        self.apply_context(project_context)

        incoming_entry = {
            "step_number": step_record.step_number,
            "atom_id": step_record.atom_id,
            "tool_calls": step_record.tool_calls,
            "inputs": step_record.inputs,
            "outputs": step_record.outputs,
            "timestamp": step_record.timestamp,
            "decision_rationale": step_record.decision_rationale,
            "edge_cases": step_record.edge_cases,
        }

        existing_doc = self._load_existing_context(
            session_id=envelope.session_id, request_id=envelope.request_id
        ) or {}
        merged_metadata = self._merge_atom_execution_metadata(
            existing_doc.get("atom_execution_metadata") or [], [incoming_entry]
        )

        base_filter = {
            "client_name": self.client_name,
            "app_name": self.app_name,
            "project_name": self.project_name,
            "session_id": envelope.session_id,
            "request_id": envelope.request_id,
        }

        try:
            self.mongo_collection.update_one(
                base_filter,
                {
                    "$set": {
                        "atom_execution_metadata": merged_metadata,
                        "memory_type": "Trinity AI Persistent JSON Memory",
                        "model_version": envelope.model_version,
                        "prompt_template_version": envelope.prompt_template_version,
                        "prompt_template_hash": envelope.prompt_template_hash,
                        "input_hash": envelope.input_hash,
                        "freshness_state": {
                            "template_hash": envelope.prompt_template_hash,
                            "input_hash": envelope.input_hash,
                            "deterministic_params": envelope.deterministic_params,
                            "retrieved_at": datetime.utcnow(),
                        },
                    },
                    "$setOnInsert": {
                        "app_name": self.app_name,
                        "client_name": self.client_name,
                        "project_name": self.project_name,
                        "session_id": envelope.session_id,
                        "request_id": envelope.request_id,
                        "timestamp": envelope.timestamp,
                    },
                },
                upsert=True,
            )
        except PyMongoError as exc:  # pragma: no cover - database guard
            logger.warning("Failed to append atom execution metadata: %s", exc)

    def save_atom_snapshot(
        self,
        envelope: LaboratoryEnvelope,
        step_record: WorkflowStepRecord,
        project_context: Optional[Dict[str, Any]] = None,
        available_files: Optional[List[str]] = None,
    ) -> None:
        """Persist a real-time atom execution snapshot to MinIO for lab-mode drift prevention."""

        self.apply_context(project_context)
        payload = {
            "envelope": envelope.model_dump(mode="python", exclude_none=True),
            "step": step_record.model_dump(mode="python", exclude_none=True),
            "available_files": available_files or [],
            "project_context": project_context or {},
            "deterministic_params": envelope.deterministic_params,
            "saved_at": datetime.utcnow().isoformat(),
        }
        data = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
        key = self._atom_history_key(envelope.session_id, envelope.request_id, step_record.step_number)

        try:
            self.minio_client.put_object(
                bucket_name=self.bucket,
                object_name=key,
                data=io.BytesIO(data),
                length=len(data),
            )
            logger.info(
                "Stored laboratory atom snapshot in MinIO at %s (step=%s, atom=%s)",
                key,
                step_record.step_number,
                step_record.atom_id,
            )
        except Exception as exc:  # pragma: no cover - network/storage guard
            logger.warning("Failed to store laboratory atom snapshot in MinIO: %s", exc)

        # Persist snapshot to MongoDB for queryable lineage and repeat detection
        try:
            mongo_payload = {
                "record_type": "atom_snapshot",
                "memory_type": "Trinity AI Persistent JSON Memory",
                "client_name": self.client_name,
                "app_name": self.app_name,
                "project_name": self.project_name,
                "session_id": envelope.session_id,
                "request_id": envelope.request_id,
                "step_number": step_record.step_number,
                "atom_id": step_record.atom_id,
                "description": step_record.decision_rationale,
                "timestamp": step_record.timestamp or datetime.utcnow(),
                "model_version": envelope.model_version,
                "prompt_template_version": envelope.prompt_template_version,
                "prompt_template_hash": envelope.prompt_template_hash,
                "input_hash": envelope.input_hash,
                "deterministic_params": envelope.deterministic_params,
                "project_context": project_context or {},
                "available_files": available_files or [],
                "step_payload": step_record.model_dump(mode="python", exclude_none=True),
            }
            self.mongo_collection.replace_one(
                {
                    "client_name": self.client_name,
                    "app_name": self.app_name,
                    "project_name": self.project_name,
                    "session_id": envelope.session_id,
                    "request_id": envelope.request_id,
                    "step_number": step_record.step_number,
                    "record_type": "atom_snapshot",
                },
                mongo_payload,
                upsert=True,
            )
            logger.info(
                "Persisted laboratory atom snapshot to MongoDB for session=%s request=%s step=%s",
                envelope.session_id,
                envelope.request_id,
                step_record.step_number,
            )
        except PyMongoError as exc:  # pragma: no cover - database guard
            logger.warning("Failed to persist laboratory atom snapshot to MongoDB: %s", exc)

    def load_atom_snapshots(
        self,
        session_id: str,
        request_id: str,
        limit: int = 20,
        project_context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """Retrieve recent atom execution snapshots for the given session/request."""

        self.apply_context(project_context)
        snapshots: List[Dict[str, Any]] = []

        # Prefer MongoDB for fast retrieval and richer filters
        try:
            cursor = (
                self.mongo_collection.find(
                    {
                        "record_type": "atom_snapshot",
                        "client_name": self.client_name,
                        "app_name": self.app_name,
                        "project_name": self.project_name,
                        "session_id": session_id,
                        "request_id": request_id,
                    }
                )
                .sort("step_number", -1)
                .limit(limit)
            )
            snapshots.extend(list(cursor))
        except PyMongoError as exc:  # pragma: no cover - database guard
            logger.warning("Failed to load lab atom snapshots from MongoDB: %s", exc)

        # Fallback to MinIO when MongoDB has no records or retrieval fails
        if not snapshots:
            prefix = self._atom_history_prefix(session_id, request_id)
            try:
                objects = list(self.minio_client.list_objects(self.bucket, prefix=prefix))
                objects.sort(key=lambda obj: obj.object_name, reverse=True)
                for obj in objects:
                    if len(snapshots) >= limit:
                        break
                    if not obj.object_name.endswith(".json"):
                        continue
                    response = self.minio_client.get_object(self.bucket, obj.object_name)
                    with response as stream:
                        raw = stream.read()
                    snapshots.append(json.loads(raw.decode("utf-8")))
            except Exception as exc:  # pragma: no cover - network/storage guard
                logger.warning("Failed to load laboratory atom snapshots from MinIO: %s", exc)

        return snapshots
