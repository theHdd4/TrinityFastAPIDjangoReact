import os
import json
import hashlib
from typing import Any, Dict
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.accounts.views import CsrfExemptSessionAuthentication
from redis_store.redis_client import redis_client
from redis_store.cache_events import publish_cache_invalidation
from pymongo import MongoClient
from django.conf import settings
from asgiref.sync import async_to_sync
from apps.accounts.utils import get_env_vars
# Removed import to avoid circular dependency with FastAPI backend

TTL = 3600  # 1 hour to align with FastAPI cache policy
TRINITY_DB_NAME = "trinity_db"
VERSION_SUFFIX = ":version"


def _session_key(client_id: str, user_id: str, app_id: str, project_id: str) -> str:
    return f"session:{client_id}:{user_id}:{app_id}:{project_id}"


def _session_version_key(session_id: str) -> str:
    return f"{session_id}{VERSION_SUFFIX}"


def _session_version(state: Dict[str, Any]) -> str:
    payload = json.dumps(state, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _mongo_client() -> MongoClient:
    uri = getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
    return MongoClient(uri, serverSelectionTimeoutMS=5000)


def _redis_namespace(client_name: str, app_name: str, project_name: str) -> str:
    return f"{client_name}/{app_name}/{project_name}"


@method_decorator(csrf_exempt, name="dispatch")
class SessionInitView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        data = request.data
        client_id = data.get("client_id", "")
        user_id = data.get("user_id", str(request.user.id))
        app_id = data.get("app_id", "")
        project_id = data.get("project_id", "")
        client_name = data.get("client_name", "")
        app_name = data.get("app_name", "")
        project_name = data.get("project_name", "")
        session_id = _session_key(client_id, user_id, app_id, project_id)
        ns = _redis_namespace(client_name, app_name, project_name)
        raw = redis_client.get(session_id)
        if raw:
            try:
                session = json.loads(raw)
            except Exception:
                session = {}
        else:
            session = {}
            try:
                mc = _mongo_client()
                db = mc[TRINITY_DB_NAME]
                record = db.session_state.find_one({"_id": session_id})
                if record and isinstance(record.get("state"), dict):
                    session = record["state"]
            except Exception:
                pass
            if not session:
                envvars = {}
                identifiers = []
                measures = []
                dimensions = {}
                try:
                    envvars = async_to_sync(get_env_vars)(
                        client_id,
                        app_id,
                        project_id,
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                    )
                except Exception:
                    pass
                # Removed classifier config import to avoid circular dependency
                # Default values will be used for identifiers, measures, and dimensions
                session = {
                    "envvars": envvars,
                    "identifiers": identifiers,
                    "measures": measures,
                    "dimensions": dimensions,
                    "navigation": [],
                }
        if "navigation" not in session:
            session["navigation"] = []
        session.update(
            {
                "client_id": client_id,
                "user_id": user_id,
                "app_id": app_id,
                "project_id": project_id,
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
            }
        )
        serialized = json.dumps(session, default=str)
        redis_client.setex(session_id, TTL, serialized)
        version = _session_version(session)
        redis_client.setex(_session_version_key(session_id), TTL, version)
        redis_client.setex(ns, TTL, session_id)
        publish_cache_invalidation(
            "session",
            {
                "session_id": session_id,
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
            },
            action="write",
            ttl=TTL,
            version=version,
            metadata={"source": "django"},
        )
        return Response({"session_id": session_id, "state": session})


@method_decorator(csrf_exempt, name="dispatch")
class SessionStateView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        session_id = request.query_params.get("session_id")
        if not session_id:
            return Response({"detail": "session_id required"}, status=status.HTTP_400_BAD_REQUEST)
        raw = redis_client.get(session_id)
        if raw:
            try:
                session = json.loads(raw)
            except Exception:
                session = {}
        else:
            session = {}
            try:
                mc = _mongo_client()
                db = mc[TRINITY_DB_NAME]
                record = db.session_state.find_one({"_id": session_id})
                if record and isinstance(record.get("state"), dict):
                    session = record["state"]
            except Exception:
                pass
            if not session:
                parts = session_id.split(":")
                envvars = {}
                identifiers = []
                measures = []
                dimensions = {}
                if len(parts) == 5:
                    c_id, u_id, a_id, p_id = parts[1], parts[2], parts[3], parts[4]
                else:
                    c_id = a_id = p_id = ""
                try:
                    envvars = async_to_sync(get_env_vars)(
                        c_id,
                        a_id,
                        p_id,
                    )
                except Exception:
                    pass
                # Removed classifier config import to avoid circular dependency
                # Default values will be used for identifiers, measures, and dimensions
                session = {
                    "envvars": envvars,
                    "identifiers": identifiers,
                    "measures": measures,
                    "dimensions": dimensions,
                    "navigation": [],
                }
            if "navigation" not in session:
                session["navigation"] = []
            if session:
                redis_client.setex(session_id, TTL, json.dumps(session, default=str))
        return Response({"session_id": session_id, "state": session})


@method_decorator(csrf_exempt, name="dispatch")
class SessionUpdateView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request):
        session_id = request.data.get("session_id")
        key = request.data.get("key")
        value = request.data.get("value")
        if not session_id or key is None:
            return Response({"detail": "session_id and key required"}, status=status.HTTP_400_BAD_REQUEST)
        raw = redis_client.get(session_id)
        session: Dict[str, Any] = {}
        if raw:
            try:
                session = json.loads(raw)
            except Exception:
                pass
        if key == "navigation":
            nav = session.get("navigation", [])

            def upsert(item: Dict[str, Any]):
                if isinstance(item, dict) and "atom" in item:
                    atom = item["atom"]
                    filtered = [n for n in nav if not (isinstance(n, dict) and n.get("atom") == atom)]
                    filtered.append(item)
                    return filtered
                nav.append(item)
                return nav

            if isinstance(value, list):
                for itm in value:
                    nav = upsert(itm)
            else:
                nav = upsert(value)
            session["navigation"] = nav
        else:
            session[key] = value
        serialized = json.dumps(session, default=str)
        redis_client.setex(session_id, TTL, serialized)
        version = _session_version(session)
        redis_client.setex(_session_version_key(session_id), TTL, version)
        try:
            mc = _mongo_client()
            db = mc[TRINITY_DB_NAME]
            db.session_state.update_one(
                {"_id": session_id},
                {"$set": {"state": session}},
                upsert=True,
            )
        except Exception:
            pass
        publish_cache_invalidation(
            "session",
            {
                "session_id": session_id,
                "client_id": session.get("client_id", ""),
                "app_id": session.get("app_id", ""),
                "project_id": session.get("project_id", ""),
            },
            action="write",
            ttl=TTL,
            version=version,
            metadata={"source": "django"},
        )
        return Response({"session_id": session_id, "state": session})


@method_decorator(csrf_exempt, name="dispatch")
class SessionEndView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        session_id = request.query_params.get("session_id")
        if not session_id:
            return Response({"detail": "session_id required"}, status=status.HTTP_400_BAD_REQUEST)
        redis_client.delete(session_id)
        redis_client.delete(_session_version_key(session_id))
        try:
            mc = _mongo_client()
            db = mc[TRINITY_DB_NAME]
            db.session_state.delete_one({"_id": session_id})
        except Exception:
            pass
        parts = session_id.split(":")
        metadata = {}
        if len(parts) == 5:
            metadata = {
                "client_id": parts[1],
                "user_id": parts[2],
                "app_id": parts[3],
                "project_id": parts[4],
            }
        publish_cache_invalidation(
            "session",
            {"session_id": session_id, **metadata},
            action="delete",
            ttl=0,
            metadata={"source": "django"},
        )
        return Response({"detail": "session ended"})
