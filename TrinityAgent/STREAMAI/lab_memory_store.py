"""Storage adapters for Laboratory Mode deterministic memory."""

from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

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
        self.client_name = (getattr(settings, "CLIENT_NAME", None) or "default_client").strip("/") or "default_client"
        self.app_name = (getattr(settings, "APP_NAME", None) or "default_app").strip("/") or "default_app"
        self.project_name = (getattr(settings, "PROJECT_NAME", None) or "default_project").strip("/") or "default_project"
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
        database = self.mongo_client[settings.CONFIG_DB or "trinity_db"]
        collection = database.get_collection("Trinity_AI_Context")
        try:
            collection.create_index([("session_id", ASCENDING), ("request_id", ASCENDING)])
            collection.create_index([("model_version", ASCENDING), ("prompt_template_version", ASCENDING)])
        except PyMongoError as exc:  # pragma: no cover - index creation best-effort
            logger.warning("Failed to create MongoDB indices for lab context: %s", exc)
        return collection

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

    def save_document(self, document: LaboratoryMemoryDocument) -> None:
        payload = document.to_sorted_dict()
        serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
        data = serialized.encode("utf-8")
        key = self._object_key(document.envelope.session_id, document.envelope.request_id)

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
            mongo_payload = {
                **payload,
                "memory_type": "Trinity AI Persistent JSON Memory",
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
                "atom_execution_metadata": [
                    {
                        "step_number": step.step_number,
                        "atom_id": step.atom_id,
                        "tool_calls": step.tool_calls,
                        "inputs": step.inputs,
                        "outputs": step.outputs,
                        "timestamp": step.timestamp,
                    }
                    for step in document.workflow_state.steps
                ],
            }
            self.mongo_collection.replace_one(
                {"session_id": document.envelope.session_id, "request_id": document.envelope.request_id},
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
    ) -> List[Dict[str, Any]]:
        """Return recent lab documents that match freshness/version constraints."""

        threshold = datetime.utcnow() - timedelta(minutes=freshness_minutes)
        cursor = self.mongo_collection.find(
            {
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

    def save_atom_snapshot(
        self,
        envelope: LaboratoryEnvelope,
        step_record: WorkflowStepRecord,
        project_context: Optional[Dict[str, Any]] = None,
        available_files: Optional[List[str]] = None,
    ) -> None:
        """Persist a real-time atom execution snapshot to MinIO for lab-mode drift prevention."""

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

    def load_atom_snapshots(
        self,
        session_id: str,
        request_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Retrieve recent atom execution snapshots for the given session/request."""

        prefix = self._atom_history_prefix(session_id, request_id)
        snapshots: List[Dict[str, Any]] = []
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
