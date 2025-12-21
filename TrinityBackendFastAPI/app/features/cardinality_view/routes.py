"""
Unified Cardinality View API Routes
Provides consistent cardinality data with metadata support for all atoms
"""
from typing import Dict, Any, Optional

from fastapi import APIRouter, Query, HTTPException

from app.core.task_queue import format_task_response
from .task_service import submit_unified_cardinality_task
from .deps import MINIO_BUCKET

router = APIRouter()


@router.get("/")
async def root():
    """Root endpoint for cardinality-view backend."""
    return {
        "message": "Unified Cardinality View backend is running",
        "endpoints": ["/cardinality"],
        "features": [
            "Consistent cardinality data across all atoms",
            "Metadata support for derived columns", 
            "Fallback compatibility with existing APIs"
        ]
    }


@router.get("/cardinality")
async def get_unified_cardinality_data(
    object_name: str = Query(..., description="Object name/path of the dataframe"),
    client_name: Optional[str] = Query(None, description="Client name for metadata lookup"),
    app_name: Optional[str] = Query(None, description="App name for metadata lookup"),
    project_name: Optional[str] = Query(None, description="Project name for metadata lookup"),
) -> Dict[str, Any]:
    """
    Get unified cardinality data with metadata support for derived columns.
    
    This endpoint provides consistent cardinality data across all atoms,
    with metadata support to show derived column information (formulas, etc.)
    
    Args:
        object_name: File path/name to analyze
        client_name: Client name for metadata lookup (optional)
        app_name: App name for metadata lookup (optional)
        project_name: Project name for metadata lookup (optional)
        
    Returns:
        Cardinality data with metadata for derived columns
        
    Example Response:
        {
            "status": "SUCCESS",
            "cardinality": [
                {
                    "column": "price",
                    "data_type": "float64",
                    "unique_count": 150,
                    "unique_values": ["10.5", "20.0", "..."],
                    "metadata": {
                        "is_created": false,
                        "operation_type": null,
                        "formula": null
                    }
                },
                {
                    "column": "total_value",
                    "data_type": "float64", 
                    "unique_count": 200,
                    "unique_values": ["10.5", "40.0", "..."],
                    "metadata": {
                        "is_created": true,
                        "operation_type": "multiply",
                        "formula": "price * quantity",
                        "input_columns": ["price", "quantity"]
                    }
                }
            ],
            "metadata_available": true,
            "total_columns": 5,
            "derived_columns": 2
        }
    """
    try:
        submission = submit_unified_cardinality_task(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
        )

        if submission.status == "failure":
            raise HTTPException(
                status_code=400,
                detail=submission.detail or "Failed to get unified cardinality data",
            )

        return format_task_response(submission)
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal server error: {str(e)}"
        )