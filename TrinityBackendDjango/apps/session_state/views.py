import os
import json
from typing import Any, Dict
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.accounts.views import CsrfExemptSessionAuthentication
from redis_store.redis_client import redis_client
from pymongo import MongoClient
from django.conf import settings
from asgiref.sync import async_to_sync
from apps.accounts.utils import get_env_vars
from app.features.column_classifier.database import get_classifier_config_from_mongo

TTL = 3600 * 2  # 2 hours


def _session_key(client_id: str, user_id: str, app_id: str, project_id: str) -> str:
    return f"session:{client_id}:{user_id}:{app_id}:{project_id}"


def _mongo_client() -> MongoClient:
    uri = getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity")
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
                db = mc.get_default_database()
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
                try:
                    cfg = get_classifier_config_from_mongo(
                        client_name, app_name, project_name
                    )
                    if cfg:
                        identifiers = cfg.get("identifiers", [])
                        measures = cfg.get("measures", [])
                        dimensions = cfg.get("dimensions", {})
                except Exception:
                    pass
                session = {
                    "envvars": envvars,
                    "identifiers": identifiers,
                    "measures": measures,
                    "dimensions": dimensions,
                }
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
        redis_client.setex(session_id, TTL, json.dumps(session))
        redis_client.setex(ns, TTL, session_id)
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
                db = mc.get_default_database()
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
                try:
                    cfg = get_classifier_config_from_mongo(parts[1], parts[3], parts[4]) if len(parts) == 5 else None
                    if cfg:
                        identifiers = cfg.get("identifiers", [])
                        measures = cfg.get("measures", [])
                        dimensions = cfg.get("dimensions", {})
                except Exception:
                    pass
                session = {
                    "envvars": envvars,
                    "identifiers": identifiers,
                    "measures": measures,
                    "dimensions": dimensions,
                }
            if session:
                redis_client.setex(session_id, TTL, json.dumps(session))
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
        session[key] = value
        redis_client.setex(session_id, TTL, json.dumps(session))
        try:
            mc = _mongo_client()
            db = mc.get_default_database()
            db.session_state.update_one(
                {"_id": session_id},
                {"$set": {"state": session}},
                upsert=True,
            )
        except Exception:
            pass
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
        try:
            mc = _mongo_client()
            db = mc.get_default_database()
            db.session_state.delete_one({"_id": session_id})
        except Exception:
            pass
        return Response({"detail": "session ended"})
