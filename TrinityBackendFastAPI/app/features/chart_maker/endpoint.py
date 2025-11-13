import base64
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