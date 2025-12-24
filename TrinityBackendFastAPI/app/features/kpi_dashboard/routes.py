# app/features/kpi_dashboard/routes.py

from fastapi import APIRouter, HTTPException, Query, Body
import logging
from typing import Optional
from datetime import datetime

from .mongodb_saver import (
    save_kpi_dashboard_config,
    get_kpi_dashboard_config,
    delete_kpi_dashboard_config
)
from app.features.pipeline.service import record_atom_execution
from app.features.project_state.routes import get_atom_list_configuration

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
    explicit_save: bool = Query(False, description="If True, saves table row data to MinIO (explicit save). If False (autosave), only strips rows from MongoDB."),
    card_id: Optional[str] = Query(None, description="Card ID containing the atom"),
    canvas_position: Optional[int] = Query(None, description="Canvas position of the atom")
):
    """
    Save KPI Dashboard configuration to MongoDB (per atom instance).
    
    Note: Table row data is handled separately:
    - Table element's Save/Save As buttons save via table API (creates MinIO files)
    - Autosave (explicit_save=False) only strips rows from MongoDB, doesn't create new MinIO files
    - Explicit save (explicit_save=True) would create MinIO files, but typically not used since tables save independently
    """
    execution_started_at = datetime.utcnow()
    execution_status = "success"
    execution_error = None
    
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
        
        execution_completed_at = datetime.utcnow()
        
        if result["status"] == "success":
            # Record atom execution to pipeline_execution collection
            try:
                # Get card_id from atom_list_configuration if not provided
                final_card_id = card_id
                final_canvas_position = canvas_position if canvas_position is not None else 0
                
                if not final_card_id:
                    try:
                        atom_config = await get_atom_list_configuration(
                            client_name, app_name, project_name, "laboratory"
                        )
                        if atom_config and atom_config.get("status") == "success":
                            cards = atom_config.get("cards", [])
                            for card in cards:
                                for atom in card.get("atoms", []):
                                    if atom.get("id") == atom_id:
                                        final_card_id = card.get("id")
                                        final_canvas_position = atom.get("canvasPosition", 0)
                                        break
                                if final_card_id:
                                    break
                    except Exception as e:
                        logger.warning(f"Failed to get card_id from atom_list_configuration: {e}")
                
                if not final_card_id:
                    # Extract card_id from atom_id if possible (format: kpi-dashboard-{timestamp}-{random})
                    final_card_id = atom_id.split("-")[0] if "-" in atom_id else atom_id
                
                # Extract input files from kpi_data (charts and tables have file references)
                input_files = []
                layouts = kpi_data.get("layouts", [])
                for layout in layouts:
                    for box in layout.get("boxes", []):
                        # Extract chart file references
                        if box.get("elementType") == "chart" and box.get("chartConfig"):
                            chart_config = box.get("chartConfig", {})
                            file_id = chart_config.get("fileId") or chart_config.get("file_id")
                            if file_id and file_id not in input_files:
                                input_files.append(file_id)
                        # Extract table file references
                        if box.get("elementType") == "table" and box.get("tableSettings"):
                            table_settings = box.get("tableSettings", {})
                            source_file = table_settings.get("sourceFile")
                            if source_file and source_file not in input_files:
                                input_files.append(source_file)
                
                # Build configuration (store layouts and settings)
                # IMPORTANT: Strip table data and chart data from layouts to avoid bloating pipeline_execution
                stripped_layouts = []
                for layout in layouts:
                    stripped_layout = layout.copy() if isinstance(layout, dict) else layout
                    if isinstance(stripped_layout, dict) and "boxes" in stripped_layout:
                        stripped_boxes = []
                        for box in stripped_layout.get("boxes", []):
                            stripped_box = box.copy() if isinstance(box, dict) else box
                            if isinstance(stripped_box, dict):
                                # Strip tableData from tableSettings (keep only metadata)
                                if "tableSettings" in stripped_box and isinstance(stripped_box["tableSettings"], dict):
                                    stripped_table_settings = stripped_box["tableSettings"].copy()
                                    if "tableData" in stripped_table_settings:
                                        table_data = stripped_table_settings["tableData"]
                                        if isinstance(table_data, dict):
                                            # Keep only essential metadata, remove rows
                                            stripped_table_data = {
                                                k: v for k, v in table_data.items() 
                                                if k not in ["rows", "data"]
                                            }
                                            stripped_table_settings["tableData"] = stripped_table_data
                                    stripped_box["tableSettings"] = stripped_table_settings
                                
                                # Strip chart data from chartConfig (keep only config, not rendered data)
                                if "chartConfig" in stripped_box and isinstance(stripped_box["chartConfig"], dict):
                                    stripped_chart_config = stripped_box["chartConfig"].copy()
                                    # Keep essential chart config but strip large data arrays
                                    if "chartConfig" in stripped_chart_config and isinstance(stripped_chart_config["chartConfig"], dict):
                                        inner_chart_config = stripped_chart_config["chartConfig"].copy()
                                        # Remove data array (can be large)
                                        if "data" in inner_chart_config:
                                            inner_chart_config["data"] = []  # Empty array placeholder
                                        stripped_chart_config["chartConfig"] = inner_chart_config
                                    stripped_box["chartConfig"] = stripped_chart_config
                            
                            stripped_boxes.append(stripped_box)
                        stripped_layout["boxes"] = stripped_boxes
                    stripped_layouts.append(stripped_layout)
                
                configuration = {
                    "layouts": stripped_layouts,
                    "title": kpi_data.get("title", "KPI Dashboard"),
                    "activeLayoutIndex": kpi_data.get("activeLayoutIndex", 0),
                    "editInteractionsMode": kpi_data.get("editInteractionsMode", False),
                    "elementInteractions": kpi_data.get("elementInteractions", {}),
                }
                
                # Build API calls - record per-box API calls for replacement support
                # Each box (chart/table) gets its own API call with box_id for per-box replacement
                api_calls = []
                
                # First, add the main save-config call
                stripped_kpi_data = {
                    "title": kpi_data.get("title", "KPI Dashboard"),
                    "activeLayoutIndex": kpi_data.get("activeLayoutIndex", 0),
                    "editInteractionsMode": kpi_data.get("editInteractionsMode", False),
                    "elementInteractions": kpi_data.get("elementInteractions", {}),
                    "layouts_count": len(layouts),
                    # Don't include full layouts in API call params
                }
                
                api_calls.append({
                    "endpoint": "/kpi-dashboard/save-config",
                    "method": "POST",
                    "timestamp": execution_started_at.isoformat(),
                    "params": {
                        "atom_id": atom_id,
                        "kpi_data": stripped_kpi_data,
                        "explicit_save": explicit_save,
                    },
                    "response_status": 200,
                    "response_data": {
                        "status": "SUCCESS",
                        "mongo_id": result.get("mongo_id"),
                        "operation": result.get("operation"),
                    }
                })
                
                # Then, add per-box API calls for charts and tables
                # This enables per-box replacement during normal operation and full replacement during pipeline rerun
                for layout in layouts:
                    for box in layout.get("boxes", []):
                        box_id = box.get("id")
                        element_type = box.get("elementType")
                        
                        if element_type == "chart" and box.get("chartConfig"):
                            chart_config = box.get("chartConfig", {})
                            file_id = chart_config.get("fileId") or chart_config.get("file_id")
                            
                            # Strip large data from chart config for API call logging
                            stripped_chart_config = {
                                "xAxis": chart_config.get("xAxis"),
                                "yAxis": chart_config.get("yAxis"),
                                "secondYAxis": chart_config.get("secondYAxis"),
                                "type": chart_config.get("type"),
                                "aggregation": chart_config.get("aggregation"),
                                "legendField": chart_config.get("legendField"),
                                "isAdvancedMode": chart_config.get("isAdvancedMode"),
                                "title": chart_config.get("title"),
                                "filters": chart_config.get("filters"),
                                "dualAxisMode": chart_config.get("dualAxisMode"),
                            }
                            
                            # Add traces if in advanced mode
                            if chart_config.get("isAdvancedMode") and chart_config.get("traces"):
                                stripped_chart_config["traces"] = [
                                    {
                                        "yAxis": t.get("yAxis"),
                                        "name": t.get("name"),
                                        "aggregation": t.get("aggregation"),
                                        "filters": t.get("filters"),
                                    }
                                    for t in chart_config.get("traces", [])
                                ]
                            
                            api_calls.append({
                                "endpoint": "/kpi-dashboard/box/chart",
                                "method": "POST",
                                "timestamp": execution_started_at.isoformat(),
                                "params": {
                                    "box_id": box_id,
                                    "element_type": "chart",
                                    "file_id": file_id,
                                    "chart_config": stripped_chart_config,
                                },
                                "response_status": 200,
                                "response_data": {"status": "SUCCESS"}
                            })
                        
                        elif element_type == "table" and box.get("tableSettings"):
                            table_settings = box.get("tableSettings", {})
                            source_file = table_settings.get("sourceFile")
                            table_id = table_settings.get("tableId") or table_settings.get("tableData", {}).get("table_id")
                            
                            api_calls.append({
                                "endpoint": "/kpi-dashboard/box/table",
                                "method": "POST",
                                "timestamp": execution_started_at.isoformat(),
                                "params": {
                                    "box_id": box_id,
                                    "element_type": "table",
                                    "source_file": source_file,
                                    "table_id": table_id,
                                    "visible_columns": table_settings.get("visibleColumns"),
                                    "page_size": table_settings.get("pageSize"),
                                },
                                "response_status": 200,
                                "response_data": {"status": "SUCCESS"}
                            })
                        
                        elif element_type == "metric-card":
                            variable_name_key = box.get("variableNameKey") or box.get("variableName")
                            
                            api_calls.append({
                                "endpoint": "/kpi-dashboard/box/metric-card",
                                "method": "POST",
                                "timestamp": execution_started_at.isoformat(),
                                "params": {
                                    "box_id": box_id,
                                    "element_type": "metric-card",
                                    "variable_name_key": variable_name_key,
                                    "metric_value": box.get("metricValue") or box.get("value"),
                                    "formula": box.get("formula"),
                                    "description": box.get("description"),
                                },
                                "response_status": 200,
                                "response_data": {"status": "SUCCESS"}
                            })
                
                # KPI Dashboard doesn't produce output files
                output_files = []
                
                await record_atom_execution(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    atom_instance_id=atom_id,
                    card_id=final_card_id,
                    atom_type="kpi-dashboard",
                    atom_title="KPI Dashboard",
                    input_files=input_files,
                    configuration=configuration,
                    api_calls=api_calls,
                    output_files=output_files,
                    execution_started_at=execution_started_at,
                    execution_completed_at=execution_completed_at,
                    execution_status=execution_status,
                    execution_error=execution_error,
                    user_id=user_id,
                    mode="laboratory",
                    canvas_position=final_canvas_position
                )
                
                logger.info(f"✅ KPI Dashboard execution recorded to pipeline: atom_id={atom_id}, card_id={final_card_id}")
                
            except Exception as e:
                # Don't fail the request if pipeline recording fails
                logger.warning(f"Failed to record KPI Dashboard execution for pipeline: {e}")
            
            return {
                "success": True,
                "message": f"KPI Dashboard configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            execution_status = "failed"
            execution_error = result.get('error', 'Unknown error')
            raise HTTPException(status_code=500, detail=f"Failed to save KPI Dashboard configuration: {execution_error}")
            
    except HTTPException:
        raise
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

