from fastapi import APIRouter, HTTPException, Body
from typing import Dict, List, Any
import pandas as pd
import io
import uuid
import pyarrow as pa
import pyarrow.ipc as ipc
from app.features.data_upload_validate.app.routes import get_object_prefix
from app.features.groupby_weighted_avg.deps import minio_client, MINIO_BUCKET, get_minio_df

router = APIRouter()

@router.get("/")
async def root():
    """Root endpoint for create-transform backend."""
    return {
        "message": "Create-Transform backend is running", 
        "endpoints": ["/ping", "/perform", "/health"]
    }

@router.get("/ping")
async def ping():
    """Health check endpoint for create-transform backend."""
    return {"msg": "Create-Transform backend is alive"}

@router.get("/health")
async def health():
    """Health check endpoint for create-transform backend."""
    return {"status": "healthy", "service": "create-transform"}

@router.post("/perform")
async def perform_create_transform_operation(
    file_name: str = Body(...),
    operations: List[Dict[str, Any]] = Body(...),
):
    """
    Perform create/transform operations based on AI agent configuration.
    Expected format from AI agent:
    {
        "file_name": "data.csv",
        "operations": [
            {
                "type": "create_column",
                "new_column": "total_price",
                "expression": "price * quantity"
            },
            {
                "type": "rename_column",
                "old_name": "old_column",
                "new_name": "new_column"
            },
            {
                "type": "transform_column",
                "column": "date_column",
                "transformation": "extract_year"
            }
        ]
    }
    """
    try:
        # Load the dataframe
        df = get_minio_df("trinity", file_name)
        
        # Apply each operation
        for operation in operations:
            op_type = operation.get("type")
            
            if op_type == "create_column":
                new_column = operation.get("new_column")
                expression = operation.get("expression")
                
                if not new_column or not expression:
                    raise HTTPException(status_code=400, detail="create_column requires 'new_column' and 'expression'")
                
                # Simple expression evaluation (extend as needed)
                try:
                    # Replace column names in expression with df['column_name'] format
                    safe_expression = expression
                    for col in df.columns:
                        safe_expression = safe_expression.replace(col, f"df['{col}']")
                    
                    # Evaluate the expression
                    df[new_column] = eval(safe_expression)
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to create column '{new_column}': {str(e)}")
            
            elif op_type == "rename_column":
                old_name = operation.get("old_name")
                new_name = operation.get("new_name")
                
                if not old_name or not new_name:
                    raise HTTPException(status_code=400, detail="rename_column requires 'old_name' and 'new_name'")
                
                if old_name not in df.columns:
                    raise HTTPException(status_code=400, detail=f"Column '{old_name}' not found")
                
                df = df.rename(columns={old_name: new_name})
            
            elif op_type == "transform_column":
                column = operation.get("column")
                transformation = operation.get("transformation")
                
                if not column or not transformation:
                    raise HTTPException(status_code=400, detail="transform_column requires 'column' and 'transformation'")
                
                if column not in df.columns:
                    raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
                
                # Apply transformation
                if transformation == "extract_year":
                    df[column] = pd.to_datetime(df[column]).dt.year
                elif transformation == "extract_month":
                    df[column] = pd.to_datetime(df[column]).dt.month
                elif transformation == "to_uppercase":
                    df[column] = df[column].astype(str).str.upper()
                elif transformation == "to_lowercase":
                    df[column] = df[column].astype(str).str.lower()
                else:
                    raise HTTPException(status_code=400, detail=f"Unknown transformation: {transformation}")
            
            else:
                raise HTTPException(status_code=400, detail=f"Unknown operation type: {op_type}")
        
        # Generate result filename
        result_id = str(uuid.uuid4())[:8]
        prefix = await get_object_prefix()
        result_filename = f"{prefix}create-transform-data/{result_id}_transformed.arrow"
        
        # Save as Arrow file
        table = pa.Table.from_pandas(df)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = sink.getvalue().to_pybytes()
        
        minio_client.put_object(
            MINIO_BUCKET,
            result_filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream"
        )
        
        return {
            "status": "SUCCESS",
            "message": "Create/Transform operations completed successfully",
            "result_file": result_filename,
            "row_count": len(df),
            "columns": list(df.columns),
            "data": df.to_csv(index=False)
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Create/Transform operation failed: {str(e)}")

@router.post("/save")
async def save_transformed_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body("", embed=True)
):
    """Save transformed dataframe to MinIO as Arrow."""
    try:
        # Load dataframe from CSV payload
        df = pd.read_csv(io.StringIO(csv_data))

        # Determine output filename
        if not filename:
            transform_id = str(uuid.uuid4())[:8]
            filename = f"{transform_id}_transformed.arrow"
        if not filename.endswith(".arrow"):
            filename += ".arrow"
            
        # Get standard prefix and create full path
        prefix = await get_object_prefix()
        filename = f"{prefix}create-transform-data/{filename}"

        # Convert to Arrow bytes
        table = pa.Table.from_pandas(df)
        buf = pa.BufferOutputStream()
        with ipc.new_file(buf, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = buf.getvalue().to_pybytes()

        # Upload to MinIO
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )

        return {
            "result_file": filename,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Save failed: {str(e)}")