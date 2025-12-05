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

    def _object_key(self, session_id: str, request_id: str) -> str:
        return f"{self.prefix}/{session_id}/{request_id}.json"

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
                "session_id": document.envelope.session_id,
                "request_id": document.envelope.request_id,
                "timestamp": document.envelope.timestamp,
                "model_version": document.envelope.model_version,
                "prompt_template_version": document.envelope.prompt_template_version,
                "prompt_template_hash": document.envelope.prompt_template_hash,
                "input_hash": document.envelope.input_hash,
                "response_hash": LaboratoryMemoryDocument.compute_hash_for_payload(payload),
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
        return list(cursor)

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
