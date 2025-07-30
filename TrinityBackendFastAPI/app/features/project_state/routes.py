from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.session_state import save_state, load_state

router = APIRouter()


class StateIn(BaseModel):
    client_id: str
    app_id: str
    project_id: str
    state: dict


@router.post("/save", status_code=201)
async def save_project_state(payload: StateIn):
    try:
        await save_state(
            payload.client_id, payload.app_id, payload.project_id, payload.state
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "saved"}


@router.get("/{client_id}/{app_id}/{project_id}")
async def get_project_state(client_id: str, app_id: str, project_id: str):
    state = await load_state(client_id, app_id, project_id)
    return {"state": state}
