from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import List, Dict, Optional
import json
import io

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

router = APIRouter(prefix="/chart-maker", tags=["chart-maker"])


def get_dataframe_with_reload(file_id: str):
    """
    Get dataframe by file_id, reloading from saved source if not in memory.
    Returns tuple of (dataframe, file_id) - file_id may be updated if reloaded.
    """
    if file_id in chart_service.file_storage:
        return chart_service.get_file(file_id), file_id
    
    # File not in memory - try to reload from the file_id directly (it might be a full path)
    print(f"⚠️ File {file_id} not in memory storage, trying to reload directly...")
    
    # Extract filename from path if it's a full path
    filename = file_id.split('/')[-1] if '/' in file_id else file_id
    print(f"🔄 Attempting to reload from filename: {filename}")
    
    try:
        new_file_id = chart_service.load_saved_dataframe(filename)
        df = chart_service.get_file(new_file_id)
        print(f"✅ Dataframe reloaded: {len(df)} rows, {len(df.columns)} columns")
        return df, new_file_id
    except Exception as reload_error:
        print(f"❌ Failed to reload from filename: {reload_error}")
        
        # If the filename approach fails, try the original file_id as a fallback
        if filename != file_id:
            print(f"🔄 Trying original file_id as fallback: {file_id}")
            try:
                new_file_id = chart_service.load_saved_dataframe(file_id)
                df = chart_service.get_file(new_file_id)
                print(f"✅ Dataframe reloaded from original file_id: {len(df)} rows, {len(df.columns)} columns")
                return df, new_file_id
            except Exception as fallback_error:
                print(f"❌ Fallback also failed: {fallback_error}")
        
        # Final fallback: check metadata to see if it has a saved source
        print(f"⚠️ Trying metadata approach for: {file_id}")
        try:
            metadata = chart_service.get_file_metadata(file_id)
            
            if metadata.get("data_source") in ["arrow_flight", "minio_fallback"]:
                # Reload from the saved file
                print(f"🔄 Reloading from saved source: {metadata.get('filename')}")
                new_file_id = chart_service.load_saved_dataframe(metadata.get("filename"))
                df = chart_service.get_file(new_file_id)
                print(f"✅ Dataframe reloaded: {len(df)} rows, {len(df.columns)} columns")
                return df, new_file_id
            else:
                print(f"❌ File {file_id} not found and no saved source available")
                raise HTTPException(status_code=404, detail=f"File {file_id} not found")
        except Exception as metadata_error:
            print(f"❌ Metadata approach also failed: {metadata_error}")
            raise HTTPException(status_code=404, detail=f"File not found in memory and failed to reload: {str(reload_error)}")


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
    try:
        # Validate file type
        if not file.filename.lower().endswith((".csv", ".xlsx", ".xls", ".arrow")):
            raise HTTPException(
                status_code=400,
                detail="Unsupported file type. Please upload CSV, Excel, or Arrow files."
            )
        
        # Read file
        contents = await file.read()
        df = chart_service.read_file(contents, file.filename)
        
        # Store file and get ID
        file_id = chart_service.store_file(df, filename=file.filename)
        
        # Get all columns
        all_columns = chart_service.get_all_columns(df)
        
        # Get column types
        column_types = chart_service.get_column_types(df)
        
        # Get unique values for categorical columns (limit to first 100 for performance)
        categorical_columns = column_types["categorical_columns"][:20]  # Limit to prevent large payloads
        unique_values = chart_service.get_unique_values(df, categorical_columns)
        
        # Get sample data
        sample_data = chart_service.get_sample_data(df, n=5)
        
        return CSVUploadResponse(
            file_id=file_id,
            columns=all_columns,
            numeric_columns=column_types["numeric_columns"],
            categorical_columns=column_types["categorical_columns"],
            unique_values=unique_values,
            sample_data=sample_data,
            row_count=len(df)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


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
    try:
        print(f"🔍 ===== LOAD SAVED DATAFRAME REQUEST =====")
        print(f"📥 Object name: {request.object_name}")
        print(f"🔍 ===== END REQUEST LOG =====")
        
        # Load the dataframe from Arrow Flight
        print("🚀 Loading dataframe from Arrow Flight...")
        file_id = chart_service.load_saved_dataframe(request.object_name)
        print(f"✅ Dataframe loaded with file ID: {file_id}")
        
        df = chart_service.get_file(file_id)
        print(f"📊 DataFrame loaded: {len(df)} rows, {len(df.columns)} columns")
        print(f"📋 Available columns: {list(df.columns)}")
        
        # Get all columns
        all_columns = chart_service.get_all_columns(df)
        print(f"📋 Total columns: {len(all_columns)}")
        
        # Get column types
        column_types = chart_service.get_column_types(df)
        print(f"🔢 Numeric columns: {len(column_types['numeric_columns'])}")
        print(f"📝 Categorical columns: {len(column_types['categorical_columns'])}")
        
        # Get unique values for categorical columns (limit to first 100 for performance)
        categorical_columns = column_types["categorical_columns"][:20]  # Limit to prevent large payloads
        unique_values = chart_service.get_unique_values(df, categorical_columns)
        print(f"🎯 Unique values for {len(categorical_columns)} categorical columns")
        
        # Get sample data
        sample_data = chart_service.get_sample_data(df, n=5)
        print(f"📄 Sample data: {len(sample_data)} rows")
        
        response = CSVUploadResponse(
            file_id=file_id,
            columns=all_columns,
            numeric_columns=column_types["numeric_columns"],
            categorical_columns=column_types["categorical_columns"],
            unique_values=unique_values,
            sample_data=sample_data,
            row_count=len(df)
        )
        
        print(f"✅ Response prepared successfully")
        print(f"🔍 ===== END RESPONSE LOG =====")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error loading saved dataframe: {e}")
        raise HTTPException(status_code=404, detail=f"Error loading saved dataframe {request.object_name}: {str(e)}")


@router.get("/get-all-columns/{file_id}", response_model=AllColumnsResponse)
async def get_all_columns(file_id: str):
    """Get all column names for a stored file"""
    try:
        df, _ = get_dataframe_with_reload(file_id)
        columns = chart_service.get_all_columns(df)
        return AllColumnsResponse(columns=columns)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting columns: {str(e)}")


@router.get("/columns/{file_id}", response_model=ColumnResponse)
async def get_columns(file_id: str):
    """Get numeric and categorical columns for a stored file"""
    try:
        df, _ = get_dataframe_with_reload(file_id)
        column_types = chart_service.get_column_types(df)
        return ColumnResponse(
            numeric_columns=column_types["numeric_columns"],
            categorical_columns=column_types["categorical_columns"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting column types: {str(e)}")


@router.post("/unique-values/{file_id}")
async def get_unique_values(file_id: str, columns: List[str]):
    """Get unique values for specified columns"""
    try:
        df, _ = get_dataframe_with_reload(file_id)
        unique_values = chart_service.get_unique_values(df, columns)
        return {"values": unique_values}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting unique values: {str(e)}")


@router.post("/filter-data/{file_id}", response_model=FilterResponse)
async def filter_data(file_id: str, filters: Dict[str, List[str]]):
    """Apply filters to stored file data"""
    try:
        df, _ = get_dataframe_with_reload(file_id)
        filtered_df = chart_service.apply_filters(df, filters)
        
        return FilterResponse(
            filtered_data=filtered_df.to_dict('records')
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error filtering data: {str(e)}")


@router.get("/sample-data/{file_id}")
async def get_sample_data(file_id: str, n: int = 10):
    """Get sample data from stored file"""
    try:
        df, _ = get_dataframe_with_reload(file_id)
        sample_data = chart_service.get_sample_data(df, n)
        return {"sample_data": sample_data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting sample data: {str(e)}")


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
    try:
        # 🚨 SINGLE CHART API ENDPOINT CALLED 🚨
        print(f"🚨🚨🚨 SINGLE CHART API ENDPOINT: /charts 🚨🚨🚨")
        print(f"🚨🚨🚨 SINGLE CHART API ENDPOINT: /charts 🚨🚨🚨")
        print(f"🚨🚨🚨 SINGLE CHART API ENDPOINT: /charts 🚨🚨🚨")
        
        # 🔍 COMPREHENSIVE LOGGING: Show incoming request
        print(f"🔍 ===== CHART GENERATION REQUEST =====")
        print(f"📥 Request received: {request}")
        print(f"📊 Chart Type: {request.chart_type}")
        print(f"📈 Traces Count: {len(request.traces)}")
        print(f"📁 File ID: {request.file_id}")
        print(f"📝 Title: {request.title}")
        print(f"🔍 ===== END REQUEST LOG =====")
        
        # Validate that the file exists and get the correct file_id
        try:
            df, actual_file_id = get_dataframe_with_reload(request.file_id)
            print(f"✅ File loaded successfully: {len(df)} rows, {len(df.columns)} columns")
            print(f"📊 Available columns: {list(df.columns)}")
            print(f"🆔 Using file_id: {actual_file_id}")
        except Exception as e:
            print(f"❌ File loading failed: {e}")
            raise HTTPException(status_code=404, detail=f"File with id {request.file_id} not found: {str(e)}")
        
        # Validate traces against available columns
        for i, trace in enumerate(request.traces):
            if trace.x_column not in df.columns:
                print(f"❌ X-column '{trace.x_column}' not found in file")
                raise HTTPException(status_code=400, detail=f"X-column '{trace.x_column}' not found in file. Available columns: {list(df.columns)}")
            if trace.y_column not in df.columns:
                print(f"❌ Y-column '{trace.y_column}' not found in file")
                raise HTTPException(status_code=400, detail=f"Y-column '{trace.y_column}' not found in file. Available columns: {list(df.columns)}")
            print(f"✅ Trace {i+1}: X='{trace.x_column}', Y='{trace.y_column}' - columns found")
        
        # Generate chart configuration with the correct file_id
        print("🚀 Generating chart configuration...")
        # Update the request with the actual file_id that was loaded
        request.file_id = actual_file_id
        chart_response = chart_service.generate_chart_config(request)
        print(f"✅ Chart configuration generated successfully")
        print(f"📊 Chart data rows: {len(chart_response.chart_config.data)}")
        print(f"📈 Chart traces: {len(chart_response.chart_config.traces)}")
        
        return chart_response
        
    except ValueError as e:
        print(f"❌ Validation error: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating chart: {str(e)}")


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