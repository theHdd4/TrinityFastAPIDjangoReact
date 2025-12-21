import base64
import os
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi import Depends
from typing import List, Dict
import json

from .service import chart_service
from .schemas import (
    ColumnResponse,
    UniqueValuesResponse,
    AllColumnsResponse,
    CSVUploadResponse,
    LoadSavedDataframeRequest,
    FilterResponse,
    ChartRequest,
    ChartResponse
)

from app.core.observability import timing_dependency_factory
from app.core.task_queue import celery_task_client, format_task_response
from app.features.pipeline.service import record_atom_execution
from app.features.project_state.routes import get_atom_list_configuration

logger = logging.getLogger(__name__)

timing_dependency = timing_dependency_factory("app.features.chart_maker")

router = APIRouter(prefix="/chart-maker", tags=["chart-maker"], dependencies=[Depends(timing_dependency)])


def get_dataframe_with_reload(file_id: str):
    """
    Get dataframe by file_id, reloading from saved source if not in memory.
    Returns tuple of (dataframe, file_id) - file_id may be updated if reloaded.
    """
    try:
        return chart_service.ensure_dataframe(file_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/upload-csv", response_model=CSVUploadResponse)
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload CSV, Excel, or Arrow file and return comprehensive file info including:
    - File ID for subsequent operations
    - All columns
    - Column types (numeric/categorical)
    - Unique values for categorical columns
    - Sample data
    """
    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls", ".arrow")):
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Please upload CSV, Excel, or Arrow files.",
        )

    contents = await file.read()
    submission = celery_task_client.submit_callable(
        name="chart_maker.upload_csv",
        dotted_path="app.features.chart_maker.service.load_dataframe_from_upload",
        kwargs={
            "content_b64": base64.b64encode(contents).decode("utf-8"),
            "filename": file.filename,
        },
        metadata={
            "atom": "chart_maker",
            "operation": "upload_csv",
            "filename": file.filename,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to process uploaded file",
        )

    return format_task_response(submission)


@router.post("/load-saved-dataframe", response_model=CSVUploadResponse)
async def load_saved_dataframe(request: LoadSavedDataframeRequest):
    """
    Load a saved dataframe from Arrow Flight and return comprehensive file info including:
    - File ID for subsequent operations
    - All columns
    - Column types (numeric/categorical)
    - Unique values for categorical columns
    - Sample data
    """
    execution_started_at = datetime.utcnow()
    
    submission = celery_task_client.submit_callable(
        name="chart_maker.load_saved_dataframe",
        dotted_path="app.features.chart_maker.service.load_saved_dataframe_task",
        kwargs={"object_name": request.object_name},
        metadata={
            "atom": "chart_maker",
            "operation": "load_saved_dataframe",
            "object_name": request.object_name,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=404,
            detail=submission.detail or f"Error loading saved dataframe {request.object_name}",
        )

    execution_completed_at = datetime.utcnow()
    execution_status = "success" if submission.status == "success" else "failed"
    execution_error = submission.detail if submission.status == "failure" else None

    # Record atom execution for pipeline tracking (if validator_atom_id is provided)
    if request.validator_atom_id:
        try:
            # Extract project context from environment
            client_name = os.getenv("CLIENT_NAME", "")
            app_name = os.getenv("APP_NAME", "")
            project_name = os.getenv("PROJECT_NAME", "")
            user_id = os.getenv("USER_ID", "unknown")
            
            # Get card_id and canvas_position from atom_list_configuration
            card_id_from_config = None
            canvas_position_from_config = None
            
            if client_name and app_name and project_name:
                try:
                    atom_config_response = await get_atom_list_configuration(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        mode="laboratory"
                    )
                    
                    if atom_config_response.get("status") == "success":
                        cards = atom_config_response.get("cards", [])
                        for card in cards:
                            atoms = card.get("atoms", [])
                            for atom in atoms:
                                if atom.get("id") == request.validator_atom_id:
                                    card_id_from_config = card.get("id")
                                    canvas_position_from_config = card.get("canvas_position", 0)
                                    break
                            if card_id_from_config:
                                break
                except Exception as e:
                    logger.warning(f"Failed to get card_id from atom_list_configuration: {e}")
            
            # Prioritize atom_list_configuration as source of truth
            final_card_id = card_id_from_config or request.card_id or (request.validator_atom_id.split("-")[0] if "-" in request.validator_atom_id else request.validator_atom_id)
            final_canvas_position = canvas_position_from_config if canvas_position_from_config is not None else (request.canvas_position if request.canvas_position is not None else 0)
            
            # Build configuration
            configuration = {
                "object_name": request.object_name,
            }
            
            # Build API calls
            api_calls = [
                {
                    "endpoint": "/chart-maker/load-saved-dataframe",
                    "method": "POST",
                    "timestamp": execution_started_at,
                    "params": configuration,
                    "response_status": 200 if execution_status == "success" else 404,
                    "response_data": {
                        "status": execution_status.upper(),
                        "task_id": submission.task_id if hasattr(submission, "task_id") else None
                    }
                }
            ]
            
            # Build output files (file_id from response)
            output_files = []
            if submission.status == "success" and hasattr(submission, "result"):
                result = submission.result if hasattr(submission, "result") else {}
                file_id = result.get("file_id") if isinstance(result, dict) else None
                if file_id:
                    # Extract filename from file_id for save_as_name
                    save_as_name = file_id.split("/")[-1] if "/" in file_id else file_id
                    output_files.append({
                        "file_key": file_id,
                        "file_path": file_id,
                        "flight_path": file_id,  # Required field for pipeline schema
                        "save_as_name": save_as_name,  # Use filename instead of None to avoid validation errors
                        "is_default_name": True,
                        "columns": result.get("columns", []) if isinstance(result, dict) else [],
                        "dtypes": {},
                        "row_count": result.get("row_count", 0) if isinstance(result, dict) else 0
                    })
            
            if client_name and app_name and project_name:
                await record_atom_execution(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    atom_instance_id=request.validator_atom_id,
                    card_id=final_card_id,
                    atom_type="chart-maker",
                    atom_title="Chart Maker - Load Dataframe",
                    input_files=[request.object_name],
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
        except Exception as e:
            # Don't fail the request if pipeline recording fails
            logger.warning(f"Failed to record atom execution for pipeline: {e}")

    return format_task_response(submission)


@router.get("/get-all-columns/{file_id}", response_model=AllColumnsResponse)
async def get_all_columns(file_id: str):
    """Get all column names for a stored file"""
    submission = celery_task_client.submit_callable(
        name="chart_maker.get_all_columns",
        dotted_path="app.features.chart_maker.service.get_all_columns_task",
        kwargs={"file_id": file_id},
        metadata={
            "atom": "chart_maker",
            "operation": "get_all_columns",
            "file_id": file_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=404,
            detail=submission.detail or "Failed to load dataframe columns",
        )

    return format_task_response(submission)


@router.get("/columns/{file_id}", response_model=ColumnResponse)
async def get_columns(file_id: str):
    """Get numeric and categorical columns for a stored file"""
    submission = celery_task_client.submit_callable(
        name="chart_maker.get_column_types",
        dotted_path="app.features.chart_maker.service.get_column_types_task",
        kwargs={"file_id": file_id},
        metadata={
            "atom": "chart_maker",
            "operation": "get_column_types",
            "file_id": file_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=404,
            detail=submission.detail or "Failed to determine column types",
        )

    return format_task_response(submission)


@router.post("/unique-values/{file_id}")
async def get_unique_values(file_id: str, columns: List[str]):
    """Get unique values for specified columns"""
    submission = celery_task_client.submit_callable(
        name="chart_maker.unique_values",
        dotted_path="app.features.chart_maker.service.get_unique_values_task",
        kwargs={"file_id": file_id, "columns": columns},
        metadata={
            "atom": "chart_maker",
            "operation": "unique_values",
            "file_id": file_id,
            "columns": list(columns),
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=500,
            detail=submission.detail or "Failed to compute unique values",
        )

    return format_task_response(submission)


@router.post("/filter-data/{file_id}", response_model=FilterResponse)
async def filter_data(file_id: str, filters: Dict[str, List[str]]):
    """Apply filters to stored file data"""
    submission = celery_task_client.submit_callable(
        name="chart_maker.filter_data",
        dotted_path="app.features.chart_maker.service.filter_data_task",
        kwargs={"file_id": file_id, "filters": filters},
        metadata={
            "atom": "chart_maker",
            "operation": "filter_data",
            "file_id": file_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=500,
            detail=submission.detail or "Failed to filter dataframe",
        )

    return format_task_response(submission)


@router.get("/sample-data/{file_id}")
async def get_sample_data(file_id: str, n: int = 10):
    """Get sample data from stored file"""
    submission = celery_task_client.submit_callable(
        name="chart_maker.sample_data",
        dotted_path="app.features.chart_maker.service.get_sample_data_task",
        kwargs={"file_id": file_id, "n": n},
        metadata={
            "atom": "chart_maker",
            "operation": "sample_data",
            "file_id": file_id,
            "sample_size": n,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=500,
            detail=submission.detail or "Failed to fetch sample data",
        )

    return format_task_response(submission)


@router.post("/charts", response_model=ChartResponse)
async def generate_chart(request: ChartRequest):
    """
    Generate recharts configuration from chart request
    
    This endpoint creates a recharts-ready configuration that can be directly
    used by the frontend to render charts. It supports:
    - Multiple chart types (line, bar, area, pie, scatter)
    - Data aggregation (sum, mean, count, min, max)
    - Filtering (uses filtered_data if provided, or applies filters to stored data)
    - Custom styling and configuration
    
    The response includes:
    - chart_config: Ready-to-use recharts configuration
    - data_summary: Metadata about the processed data
    """
    execution_started_at = datetime.utcnow()
    
    submission = celery_task_client.submit_callable(
        name="chart_maker.generate_chart",
        dotted_path="app.features.chart_maker.service.generate_chart_task",
        kwargs={"payload": request.dict()},
        metadata={
            "atom": "chart_maker",
            "operation": "generate_chart",
            "file_id": request.file_id,
            "chart_type": request.chart_type,
            "trace_count": len(request.traces),
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to generate chart",
        )

    execution_completed_at = datetime.utcnow()
    execution_status = "success" if submission.status == "success" else "failed"
    execution_error = submission.detail if submission.status == "failure" else None

    # Record atom execution for pipeline tracking (if validator_atom_id is provided)
    if request.validator_atom_id:
        try:
            # Extract project context from environment
            client_name = os.getenv("CLIENT_NAME", "")
            app_name = os.getenv("APP_NAME", "")
            project_name = os.getenv("PROJECT_NAME", "")
            user_id = os.getenv("USER_ID", "unknown")
            
            # Get card_id and canvas_position from atom_list_configuration
            card_id_from_config = None
            canvas_position_from_config = None
            
            if client_name and app_name and project_name:
                try:
                    atom_config_response = await get_atom_list_configuration(
                        client_name=client_name,
                        app_name=app_name,
                        project_name=project_name,
                        mode="laboratory"
                    )
                    
                    if atom_config_response.get("status") == "success":
                        cards = atom_config_response.get("cards", [])
                        for card in cards:
                            atoms = card.get("atoms", [])
                            for atom in atoms:
                                if atom.get("id") == request.validator_atom_id:
                                    card_id_from_config = card.get("id")
                                    canvas_position_from_config = card.get("canvas_position", 0)
                                    break
                            if card_id_from_config:
                                break
                except Exception as e:
                    logger.warning(f"Failed to get card_id from atom_list_configuration: {e}")
            
            # Prioritize atom_list_configuration as source of truth
            final_card_id = card_id_from_config or request.card_id or (request.validator_atom_id.split("-")[0] if "-" in request.validator_atom_id else request.validator_atom_id)
            final_canvas_position = canvas_position_from_config if canvas_position_from_config is not None else (request.canvas_position if request.canvas_position is not None else 0)
            
            # Build configuration (convert column names to lowercase for pipeline)
            # Use explicit dual_axis_mode and second_y_axis from request if provided
            # Otherwise, detect from traces for backward compatibility
            dual_axis_mode = request.dual_axis_mode
            second_y_axis = request.second_y_axis.lower() if request.second_y_axis else None
            
            # If not explicitly provided, detect dual Y-axis from traces (backward compatibility)
            if not dual_axis_mode and not second_y_axis:
                is_dual_y_axis = (
                    len(request.traces) == 2 and
                    request.traces[0].x_column and
                    request.traces[1].x_column and
                    request.traces[0].x_column.lower() == request.traces[1].x_column.lower() and
                    request.traces[0].y_column and
                    request.traces[1].y_column and
                    request.traces[0].y_column.lower() != request.traces[1].y_column.lower() and
                    not request.traces[0].legend_field and
                    not request.traces[1].legend_field
                )
                if is_dual_y_axis and len(request.traces) >= 2:
                    second_y_axis = request.traces[1].y_column.lower() if request.traces[1].y_column else None
                    dual_axis_mode = "dual"
            
            # Build configuration for this specific chart
            chart_config = {
                "file_id": request.file_id,
                "chart_type": request.chart_type,
                "title": request.title,
                "traces": [
                    {
                        "x_column": trace.x_column.lower() if trace.x_column else None,
                        "y_column": trace.y_column.lower() if trace.y_column else None,
                        "name": trace.name,
                        "aggregation": trace.aggregation,  # Save aggregation per trace
                        "chart_type": trace.chart_type,
                        "legend_field": trace.legend_field.lower() if trace.legend_field else None,  # Include legend_field (segregation)
                    }
                    for trace in request.traces
                ],
                "filters": {k.lower(): v for k, v in (request.filters or {}).items()} if request.filters else None,
                "second_y_axis": second_y_axis,  # Save second Y-axis (explicit or detected)
                "dual_axis_mode": dual_axis_mode,  # Save axis mode (explicit or detected)
            }
            
            # 🔧 NEW: Check if all_charts is provided - this contains ALL charts in the atom
            # If provided, use it as the full configuration; otherwise, use single chart config for backward compatibility
            if request.all_charts and len(request.all_charts) > 0:
                # Build configuration with all charts
                all_charts_config = []
                for chart_data in request.all_charts:
                    chart_traces = chart_data.get('traces', [])
                    chart_config_item = {
                        "file_id": chart_data.get('file_id') or request.file_id,
                        "chart_type": chart_data.get('chart_type') or 'line',
                        "title": chart_data.get('title') or 'Chart',
                        "traces": [
                            {
                                "x_column": trace.get('x_column', '').lower() if trace.get('x_column') else None,
                                "y_column": trace.get('y_column', '').lower() if trace.get('y_column') else None,
                                "name": trace.get('name') or 'Series',
                                "aggregation": trace.get('aggregation') or 'sum',
                                "chart_type": trace.get('chart_type') or chart_data.get('chart_type') or 'line',
                                "legend_field": trace.get('legend_field', '').lower() if trace.get('legend_field') else None,
                            }
                            for trace in chart_traces
                        ],
                        "filters": {k.lower(): v for k, v in (chart_data.get('filters') or {}).items()} if chart_data.get('filters') else None,
                        "second_y_axis": chart_data.get('second_y_axis'),
                        "dual_axis_mode": chart_data.get('dual_axis_mode'),
                    }
                    all_charts_config.append(chart_config_item)
                
                # Configuration with all charts
                configuration = {
                    "file_id": request.file_id,
                    "charts": all_charts_config,  # Array of all charts
                    "chart_type": request.chart_type,  # Keep for backward compatibility (latest chart)
                    "title": request.title,  # Keep for backward compatibility (latest chart)
                }
            else:
                # Backward compatibility: single chart configuration
                configuration = chart_config
            
            # Build API calls
            api_calls = [
                {
                    "endpoint": "/chart-maker/charts",
                    "method": "POST",
                    "timestamp": execution_started_at,
                    "params": configuration,
                    "response_status": 200 if execution_status == "success" else 400,
                    "response_data": {
                        "status": execution_status.upper(),
                        "task_id": submission.task_id if hasattr(submission, "task_id") else None
                    }
                }
            ]
            
            # Build output files (chartmaker doesn't produce output files, but we track the chart config)
            output_files = []
            
            if client_name and app_name and project_name:
                await record_atom_execution(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    atom_instance_id=request.validator_atom_id,
                    card_id=final_card_id,
                    atom_type="chart-maker",
                    atom_title="Chart Maker",
                    input_files=[request.file_id],
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
        except Exception as e:
            # Don't fail the request if pipeline recording fails
            logger.warning(f"Failed to record atom execution for pipeline: {e}")

    return format_task_response(submission)


# @router.post("/multiple-charts", response_model=List[ChartResponse])
# async def generate_multiple_charts(request: List[ChartRequest]):
#     """
#     Generate multiple charts from a list of chart requests
    
#     This endpoint creates multiple recharts-ready configurations for side-by-side
#     or dashboard-style chart layouts. It supports:
#     - Multiple chart types (line, bar, area, pie, scatter)
#     - Data aggregation (sum, mean, count, min, max)
#     - Consistent data source across all charts
#     - Batch processing for efficiency
    
#     The response includes:
#     - List of chart_config: Ready-to-use recharts configurations
#     - data_summary: Metadata about the processed data for each chart
#     """
#     try:
#         # 🚨 MULTIPLE CHARTS API ENDPOINT CALLED 🚨
#         print(f"🚨🚨🚨 MULTIPLE CHARTS API ENDPOINT: /multiple-charts 🚨🚨🚨")
#         print(f"🚨🚨🚨 MULTIPLE CHARTS API ENDPOINT: /multiple-charts 🚨🚨🚨")
#         print(f"🚨🚨🚨 MULTIPLE CHARTS API ENDPOINT: /multiple-charts 🚨🚨🚨")
        
#         # 🔍 COMPREHENSIVE LOGGING: Show incoming request
#         print(f"🔍 ===== MULTIPLE CHARTS GENERATION REQUEST =====")
#         print(f"📥 Request received: {len(request)} charts")
#         print(f"📊 Charts: {[f'{i+1}. {r.chart_type} - {r.title}' for i, r in enumerate(request)]}")
        
#         # 🔍 DETAILED REQUEST LOGGING
#         for i, chart_request in enumerate(request):
#             print(f"🔍 Chart {i+1} Details:")
#             print(f"   File ID: {chart_request.file_id}")
#             print(f"   Chart Type: {chart_request.chart_type}")
#             print(f"   Title: {chart_request.title}")
#             print(f"   Traces Count: {len(chart_request.traces)}")
#             for j, trace in enumerate(chart_request.traces):
#                 print(f"     Trace {j+1}: x_column='{trace.x_column}', y_column='{trace.y_column}', name='{trace.name}'")
        
#         print(f"🔍 ===== END REQUEST LOG =====")
        
#         if not request or len(request) == 0:
#             raise HTTPException(status_code=400, detail="At least one chart request is required")
        
#         if len(request) > 2:
#             raise HTTPException(status_code=400, detail="Maximum 2 charts supported")
        
#         # Validate that all charts use the same file_id for consistency
#         file_id = request[0].file_id
#         for i, chart_request in enumerate(request):
#             if chart_request.file_id != file_id:
#                 raise HTTPException(
#                     status_code=400, 
#                     detail=f"All charts must use the same file_id. Chart {i+1} uses {chart_request.file_id}, expected {file_id}"
#                 )
        
#         # Validate that the file exists
#         try:
#             df = chart_service.get_file(file_id)
#             print(f"✅ File loaded successfully: {len(df)} rows, {len(df.columns)} columns")
#             print(f"📊 Available columns: {list(df.columns)}")
#         except Exception as e:
#             print(f"❌ File loading failed: {e}")
#             raise HTTPException(status_code=404, detail=f"File with id {file_id} not found: {str(e)}")
        
#         # Validate traces against available columns for all charts
#         for chart_index, chart_request in enumerate(request):
#             for trace_index, trace in enumerate(chart_request.traces):
#                 if trace.x_column not in df.columns:
#                     print(f"❌ Chart {chart_index+1}, Trace {trace_index+1}: X-column '{trace.x_column}' not found in file")
#                     raise HTTPException(
#                         status_code=400, 
#                         detail=f"Chart {chart_index+1}, Trace {trace_index+1}: X-column '{trace.x_column}' not found in file. Available columns: {list(df.columns)}"
#                     )
#                 if trace.y_column not in df.columns:
#                     print(f"❌ Chart {chart_index+1}, Trace {trace_index+1}: Y-column '{trace.y_column}' not found in file")
#                     raise HTTPException(
#                         status_code=400, 
#                         detail=f"Chart {chart_index+1}, Trace {trace_index+1}: Y-column '{trace.y_column}' not found in file. Available columns: {list(df.columns)}"
#                     )
#                 print(f"✅ Chart {chart_index+1}, Trace {trace_index+1}: X='{trace.x_column}', Y='{trace.y_column}' - columns found")
        
#         # Generate chart configurations for all charts
#         print("🚀 Generating multiple chart configurations...")
#         chart_responses = []
        
#         for i, chart_request in enumerate(request):
#             print(f"📊 Generating chart {i+1}: {chart_request.chart_type} - {chart_request.title}")
#             chart_response = chart_service.generate_chart_config(chart_request)
#             chart_responses.append(chart_response)
#             print(f"✅ Chart {i+1} configuration generated successfully")
#             print(f"📊 Chart {i+1} data rows: {len(chart_response.chart_config.data)}")
#             print(f"📈 Chart {i+1} traces: {len(chart_response.chart_config.traces)}")
        
#         print(f"🎉 All {len(chart_responses)} charts generated successfully")
#         return chart_responses
        
#     except ValueError as e:
#         print(f"❌ Validation error: {e}")
#         raise HTTPException(status_code=404, detail=str(e))
#     except HTTPException:
#         raise
#     except Exception as e:
#         print(f"❌ Unexpected error: {e}")
#         raise HTTPException(status_code=500, detail=f"Error generating multiple charts: {str(e)}")


# Legacy endpoints for backwards compatibility
@router.post("/columns", response_model=ColumnResponse)
async def get_chart_columns_legacy(file: UploadFile = File(...)):
    """Legacy endpoint - get columns from uploaded file"""
    try:
        contents = await file.read()
        df = chart_service.read_file(contents, file.filename)
        column_types = chart_service.get_column_types(df)
        return ColumnResponse(
            numeric_columns=column_types["numeric_columns"],
            categorical_columns=column_types["categorical_columns"]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/unique-values", response_model=UniqueValuesResponse)
async def get_unique_values_legacy(
    file: UploadFile = File(...),
    columns: str = Form(...)
):
    """Legacy endpoint - get unique values from uploaded file"""
    try:
        contents = await file.read()
        df = chart_service.read_file(contents, file.filename)
        
        # Parse columns
        columns_list = json.loads(columns)
        unique_values = chart_service.get_unique_values(df, columns_list)
        
        return UniqueValuesResponse(values=unique_values)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in columns parameter")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.post("/filter", response_model=FilterResponse)
async def filter_data_legacy(
    file: UploadFile = File(...),
    filters: str = Form(...)
):
    """Legacy endpoint - filter data from uploaded file"""
    try:
        contents = await file.read()
        df = chart_service.read_file(contents, file.filename)
        
        # Parse filters
        filters_dict = json.loads(filters)
        filtered_df = chart_service.apply_filters(df, filters_dict)
        
        return FilterResponse(
            filtered_data=filtered_df.to_dict('records')
        )
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in filters parameter")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@router.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """Delete a stored file"""
    try:
        if file_id in chart_service.file_storage:
            del chart_service.file_storage[file_id]
            return {"message": "File deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="File not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")


@router.get("/files")
async def list_available_files():
    """List all available files for chart generation"""
    try:
        # 🔧 SIMPLIFIED: Return files from chart service storage instead of complex MinIO imports
        files = []
        for file_id, df in chart_service.file_storage.items():
            files.append({
                "name": f"file_{file_id[:8]}",  # Use first 8 chars of UUID as name
                "path": file_id,
                "size": len(df),
                "columns": list(df.columns)
            })
        
        return {
            "success": True,
            "files": files,
            "total_count": len(files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list files: {str(e)}")


@router.get("/column_summary")
async def get_column_summary(object_name: str):
    """
    Get column summary information for cardinality view
    Returns detailed information about each column including:
    - Column name
    - Data type
    - Unique count
    - Sample unique values
    
    Accepts either:
    - file_id (UUID) - will reload from saved source if not in memory
    - Arrow filename (e.g., "default_client/file.arrow") - will load directly from Arrow Flight
    """
    try:
        print(f"🔍 ===== COLUMN SUMMARY REQUEST =====")
        print(f"📥 Object name: {object_name}")
        print(f"🔍 ===== END REQUEST LOG =====")
        
        # Check if object_name looks like an Arrow file path (contains .arrow)
        if object_name.endswith('.arrow') or '/' in object_name:
            # This is an Arrow filename - load directly from Arrow Flight
            print(f"📂 Detected Arrow filename, loading directly from Arrow Flight...")
            try:
                file_id = chart_service.load_saved_dataframe(object_name)
                df = chart_service.get_file(file_id)
                print(f"✅ Loaded from Arrow Flight: {len(df)} rows, {len(df.columns)} columns")
                # Update object_name to the new file_id for metadata retrieval later
                object_name = file_id
            except Exception as arrow_error:
                print(f"❌ Failed to load from Arrow Flight: {arrow_error}")
                raise HTTPException(status_code=404, detail=f"Failed to load Arrow file {object_name}: {str(arrow_error)}")
        else:
            # This is a file_id (UUID) - use helper to get or reload
            print(f"🔑 Detected file_id (UUID), attempting to get or reload...")
            df, object_name = get_dataframe_with_reload(object_name)
        
        print(f"📊 Processing dataframe: {len(df)} rows, {len(df.columns)} columns")
        
        # Generate column summary
        summary = []
        for column in df.columns:
            # Get unique values
            unique_values = df[column].dropna().unique()
            unique_count = len(unique_values)
            
            # Determine data type (same format as feature overview)
            data_type = str(df[column].dtype)
            
            # Get all unique values (no truncation)
            sample_values = unique_values.tolist()
            
            summary.append({
                "column": column,
                "data_type": data_type,
                "unique_count": unique_count,
                "unique_values": sample_values
            })
        
        print(f"✅ Column summary generated: {len(summary)} columns")
        print(f"🔍 ===== END RESPONSE LOG =====")
        
        # Get the original object name from metadata for dataframe viewer
        original_name = object_name
        if object_name in chart_service.file_metadata:
            metadata = chart_service.file_metadata[object_name]
            if metadata.get("data_source") == "arrow_flight":
                original_name = metadata.get("filename", object_name)
        
        return {
            "summary": summary,
            "original_name": original_name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error generating column summary: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating column summary: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "chart-maker"}

