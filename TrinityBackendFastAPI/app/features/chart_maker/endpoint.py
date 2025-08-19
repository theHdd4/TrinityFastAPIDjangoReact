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
        file_id = chart_service.store_file(df)
        
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
        # Load the dataframe from Arrow Flight
        file_id = chart_service.load_saved_dataframe(request.object_name)
        df = chart_service.get_file(file_id)
        
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
        raise HTTPException(status_code=500, detail=f"Error loading saved dataframe: {str(e)}")


@router.get("/get-all-columns/{file_id}", response_model=AllColumnsResponse)
async def get_all_columns(file_id: str):
    """Get all column names for a stored file"""
    try:
        df = chart_service.get_file(file_id)
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
        df = chart_service.get_file(file_id)
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
        df = chart_service.get_file(file_id)
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
        df = chart_service.get_file(file_id)
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
        df = chart_service.get_file(file_id)
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
        chart_response = chart_service.generate_chart_config(request)
        return chart_response
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating chart: {str(e)}")


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


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "chart-maker"}