# app/features/kpi_dashboard/routes.py

from fastapi import APIRouter, HTTPException, Query, Body
import logging
from typing import Optional

from .mongodb_saver import (
    save_kpi_dashboard_config,
    get_kpi_dashboard_config,
    delete_kpi_dashboard_config
)

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/save-config")
async def save_kpi_dashboard_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    atom_id: str = Query(..., description="Atom ID for per-instance storage"),
    kpi_data: dict = Body(..., description="KPI Dashboard configuration data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: Optional[int] = Query(None, description="Project ID"),
    explicit_save: bool = Query(False, description="If True, saves table row data to MinIO (explicit save). If False (autosave), only strips rows from MongoDB.")
):
    """
    Save KPI Dashboard configuration to MongoDB (per atom instance).
    
    Note: Table row data is handled separately:
    - Table element's Save/Save As buttons save via table API (creates MinIO files)
    - Autosave (explicit_save=False) only strips rows from MongoDB, doesn't create new MinIO files
    - Explicit save (explicit_save=True) would create MinIO files, but typically not used since tables save independently
    """
    try:
        result = await save_kpi_dashboard_config(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            atom_id=atom_id,
            kpi_dashboard_data=kpi_data,
            user_id=user_id,
            project_id=project_id,
            explicit_save=explicit_save
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"KPI Dashboard configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save KPI Dashboard configuration: {result.get('error', 'Unknown error')}")
            
    except Exception as e:
        logger.error(f"Error saving KPI Dashboard configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save KPI Dashboard configuration: {str(e)}")


@router.get("/get-config")
async def get_kpi_dashboard_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    atom_id: str = Query(..., description="Atom ID for per-instance storage")
):
    """Retrieve saved KPI Dashboard configuration from MongoDB (per atom instance)"""
    try:
        result = await get_kpi_dashboard_config(client_name, app_name, project_name, atom_id)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No configuration found"
            }
            
    except Exception as e:
        logger.error(f"Error retrieving KPI Dashboard configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve KPI Dashboard configuration: {str(e)}")


@router.delete("/delete-config")
async def delete_kpi_dashboard_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    atom_id: str = Query(..., description="Atom ID for per-instance storage")
):
    """Delete KPI Dashboard configuration from MongoDB (per atom instance)"""
    try:
        result = await delete_kpi_dashboard_config(client_name, app_name, project_name, atom_id)
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": result["message"],
                "deleted_count": result.get("deleted_count", 0)
            }
        elif result["status"] == "not_found":
            return {
                "success": False,
                "message": result["message"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to delete KPI Dashboard configuration: {result.get('error', 'Unknown error')}")
            
    except Exception as e:
        logger.error(f"Error deleting KPI Dashboard configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete KPI Dashboard configuration: {str(e)}")

