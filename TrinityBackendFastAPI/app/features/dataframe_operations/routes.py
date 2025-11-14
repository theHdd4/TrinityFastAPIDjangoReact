from fastapi import APIRouter, Body, HTTPException, Depends
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
import io
import uuid
from app.features.concat.deps import minio_client, OBJECT_PREFIX, MINIO_BUCKET, redis_client
from app.core.observability import timing_dependency_factory

timing_dependency = timing_dependency_factory("app.features.dataframe_operations")

router = APIRouter(dependencies=[Depends(timing_dependency)])

@router.post("/save")
async def save_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """
    Save a dataframe (CSV) to MinIO as Arrow file and return file info.
    """
    try:
        df = pd.read_csv(io.StringIO(csv_data))
        if not filename:
            df_id = str(uuid.uuid4())[:8]
            filename = f"{df_id}_dataframe_ops.arrow"
        if not filename.endswith('.arrow'):
            filename += '.arrow'

        # Store result inside dedicated "dataframe operations" folder
        object_name = f"{OBJECT_PREFIX}dataframe operations/{filename}" if not filename.startswith(OBJECT_PREFIX) else filename

        table = pa.Table.from_pandas(df)
        arrow_buffer = pa.BufferOutputStream()
        with ipc.new_file(arrow_buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = arrow_buffer.getvalue().to_pybytes()
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )
        redis_client.setex(object_name, 3600, arrow_bytes)
        return {
            "result_file": object_name,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
