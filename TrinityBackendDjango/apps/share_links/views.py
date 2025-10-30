from __future__ import annotations

from typing import Any, Dict

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.views import CsrfExemptSessionAuthentication

from .utils import create_exhibition_share_link


def _build_share_url(token: str) -> str:
    base = getattr(settings, "FRONTEND_URL", "")
    if base:
        base = base.rstrip("/")
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
