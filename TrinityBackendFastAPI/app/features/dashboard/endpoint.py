from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import logging

from .share_links import fetch_shared_link_context
from app.features.project_state.routes import get_atom_list_configuration

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

logger = logging.getLogger(__name__)

class DashboardLayoutResponse(BaseModel):
    client_name: str
    app_name: str
    project_name: str
    cards: List[Dict[str, Any]]
    updated_at: Optional[str] = None

@router.get("/shared/{token}", response_model=DashboardLayoutResponse)
async def get_shared_dashboard_layout(token: str):
    cleaned_token = token.strip()
    if not cleaned_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared dashboard link not found")

    try:
        context = await fetch_shared_link_context(cleaned_token)
    except Exception as exc:
        logging.exception("Failed to resolve dashboard share link: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate share link",
        ) from exc

    if context is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared dashboard link not found")

    if not context.is_valid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared dashboard link expired")

    # Fetch dashboard layout using project_state logic
    # Use "laboratory-dashboard" mode to match frontend save logic
    result = await get_atom_list_configuration(
        client_name=context.client_name,
        app_name=context.app_name,
        project_name=context.project_name,
        mode="laboratory-dashboard"
    )

    if result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=result.get("error", "Failed to retrieve dashboard configuration"),
        )

    return DashboardLayoutResponse(
        client_name=context.client_name,
        app_name=context.app_name,
        project_name=context.project_name,
        cards=result.get("cards", []),
        updated_at=result.get("retrieved_at")
    )
