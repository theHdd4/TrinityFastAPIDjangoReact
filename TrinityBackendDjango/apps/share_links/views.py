from __future__ import annotations

from typing import Any, Dict

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.views import CsrfExemptSessionAuthentication

from .utils import create_exhibition_share_link, create_dataframe_share_link, create_dashboard_share_link
from .models import DataFrameShareLink, DashboardShareLink


def _build_share_url(token: str, share_type: str = "exhibition") -> str:
    base = getattr(settings, "FRONTEND_URL", "")
    if base:
        base = base.rstrip("/")
    if share_type == "dataframe":
        return f"{base}/dataframe/shared/{token}" if base else f"/dataframe/shared/{token}"
    elif share_type == "dashboard":
        return f"{base}/dashboard/shared/{token}" if base else f"/dashboard/shared/{token}"
    return f"{base}/exhibition/shared/{token}" if base else f"/exhibition/shared/{token}"


@method_decorator(csrf_exempt, name="dispatch")
class ExhibitionShareLinkView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs) -> Response:
        payload: Dict[str, Any] = request.data if isinstance(request.data, dict) else {}
        client_name = (payload.get("client_name") or "").strip()
        app_name = (payload.get("app_name") or "").strip()
        project_name = (payload.get("project_name") or "").strip()
        expires_in = payload.get("expires_in")

        if not client_name or not app_name or not project_name:
            return Response(
                {"detail": "client_name, app_name, and project_name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            link = create_exhibition_share_link(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                created_by=getattr(request, "user", None),
                expires_in=int(expires_in) if expires_in is not None else None,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive fallback
            return Response(
                {"detail": "Unable to create share link", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        share_url = _build_share_url(link.token)

        return Response(
            {
                "token": link.token,
                "share_url": share_url,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class DataFrameShareLinkView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs) -> Response:
        payload: Dict[str, Any] = request.data if isinstance(request.data, dict) else {}
        object_name = (payload.get("object_name") or "").strip()
        client_name = (payload.get("client_name") or "").strip()
        app_name = (payload.get("app_name") or "").strip()
        project_name = (payload.get("project_name") or "").strip()
        expires_in = payload.get("expires_in")

        if not object_name:
            return Response(
                {"detail": "object_name is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not client_name or not app_name or not project_name:
            return Response(
                {"detail": "client_name, app_name, and project_name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            link = create_dataframe_share_link(
                object_name=object_name,
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                created_by=getattr(request, "user", None),
                expires_in=int(expires_in) if expires_in is not None else None,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive fallback
            return Response(
                {"detail": "Unable to create share link", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        share_url = _build_share_url(link.token, share_type="dataframe")

        return Response(
            {
                "token": link.token,
                "share_url": share_url,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class DataFrameShareLinkRetrieveView(APIView):
    """Retrieve dataframe share link information by token (public access, no auth required)."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, token: str, *args, **kwargs) -> Response:
        cleaned_token = (token or "").strip()
        if not cleaned_token:
            return Response(
                {"detail": "Token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            link = DataFrameShareLink.objects.filter(token=cleaned_token).first()
        except Exception as exc:
            return Response(
                {"detail": "Unable to retrieve share link", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if link is None:
            return Response(
                {"detail": "Share link not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not link.is_valid:
            return Response(
                {"detail": "Share link expired or inactive"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Mark as accessed
        try:
            link.mark_accessed()
        except Exception:
            pass  # Non-critical, continue even if update fails

        return Response(
            {
                "object_name": link.object_name,
                "client_name": link.client_name,
                "app_name": link.app_name,
                "project_name": link.project_name,
                "created_at": link.created_at.isoformat() if link.created_at else None,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            },
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_exempt, name="dispatch")
class DashboardShareLinkView(APIView):
    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs) -> Response:
        payload: Dict[str, Any] = request.data if isinstance(request.data, dict) else {}
        client_name = (payload.get("client_name") or "").strip()
        app_name = (payload.get("app_name") or "").strip()
        project_name = (payload.get("project_name") or "").strip()
        expires_in = payload.get("expires_in")

        if not client_name or not app_name or not project_name:
            return Response(
                {"detail": "client_name, app_name, and project_name are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            link = create_dashboard_share_link(
                client_name=client_name,
                app_name=app_name,
                project_name=project_name,
                created_by=getattr(request, "user", None),
                expires_in=int(expires_in) if expires_in is not None else None,
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - defensive fallback
            return Response(
                {"detail": "Unable to create share link", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        share_url = _build_share_url(link.token, share_type="dashboard")

        return Response(
            {
                "token": link.token,
                "share_url": share_url,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(csrf_exempt, name="dispatch")
class DashboardShareLinkRetrieveView(APIView):
    """Retrieve dashboard share link information by token (public access, no auth required)."""
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, token: str, *args, **kwargs) -> Response:
        cleaned_token = (token or "").strip()
        if not cleaned_token:
            return Response(
                {"detail": "Token is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            link = DashboardShareLink.objects.filter(token=cleaned_token).first()
        except Exception as exc:
            return Response(
                {"detail": "Unable to retrieve share link", "error": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if link is None:
            return Response(
                {"detail": "Share link not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not link.is_valid:
            return Response(
                {"detail": "Share link expired or inactive"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Mark as accessed
        try:
            link.mark_accessed()
        except Exception:
            pass  # Non-critical, continue even if update fails

        return Response(
            {
                "client_name": link.client_name,
                "app_name": link.app_name,
                "project_name": link.project_name,
                "created_at": link.created_at.isoformat() if link.created_at else None,
                "expires_at": link.expires_at.isoformat() if link.expires_at else None,
                "is_active": link.is_active,
            },
            status=status.HTTP_200_OK,
        )
