from fastapi import APIRouter, Form, HTTPException, Query, Response
from typing import Dict, List
from .deps import get_minio_df, get_validator_atoms_collection, fetch_dimensions_dict, get_column_classifications_collection, fetch_measures_list, fetch_identifiers_and_measures, minio_client, MINIO_BUCKET, OBJECT_PREFIX
from .mongodb_saver import save_groupby_result
import io
import json
import pandas as pd
from .groupby.base import perform_groupby as groupby_base_func
import datetime
from urllib.parse import unquote

router = APIRouter()

# ----------- Export Endpoints (CSV / Excel) -----------
@router.get("/export_csv")
async def export_csv(object_name: str):
    """Export the grouped result as CSV file."""
    object_name = unquote(object_name)
    try:
        # Try object name as-is first
        try:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
        except Exception:
            # fallback with prefix
            prefixed = OBJECT_PREFIX + object_name if not object_name.startswith(OBJECT_PREFIX) else object_name[len(OBJECT_PREFIX):]
            response = minio_client.get_object(MINIO_BUCKET, prefixed)
        content = response.read()

        # Convert Arrow or Excel to CSV if needed
        if object_name.endswith(".arrow"):
            import pyarrow as pa, pyarrow.ipc as ipc, io, pandas as pd
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
            content = df.to_csv(index=False).encode("utf-8")
        elif object_name.endswith(".xlsx"):
            import io, pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            content = df.to_csv(index=False).encode("utf-8")
        # else assume content already CSV bytes

        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=groupby_result_{object_name.split('/')[-1].replace('.arrow','').replace('.xlsx','')} .csv"
            },
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Export failed: {e}")

@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export the grouped result as Excel file."""
    object_name = unquote(object_name)
    try:
        # Attempt cache (optional) - just skip for now
        # Fetch from MinIO with or without prefix
        key_try = [object_name]
        if not object_name.startswith(OBJECT_PREFIX):
            key_try.append(OBJECT_PREFIX + object_name)
        content = None
        for k in key_try:
            try:
                response = minio_client.get_object(MINIO_BUCKET, k)
                content = response.read()
                break
            except Exception:
                continue
        if content is None:
            raise FileNotFoundError("Object not found in MinIO")

        import io, pandas as pd
        if object_name.endswith(".arrow"):
            import pyarrow as pa, pyarrow.ipc as ipc
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        elif object_name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))

        excel_buffer = io.BytesIO()
        try:
            df.to_excel(excel_buffer, index=False, engine="openpyxl")
        except Exception:
            df.to_excel(excel_buffer, index=False)
        excel_bytes = excel_buffer.getvalue()

        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=groupby_result_{object_name.split('/')[-1].replace('.arrow','').replace('.csv','')}.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Export failed: {e}")
# async def export_excel(object_name: str):
#     """Export the grouped result as Excel file."""
#     object_name = unquote(object_name)
#     try:
#         # Try direct key first, fallback with prefix
#         try:
#             response = minio_client.get_object(MINIO_BUCKET, object_name)
#         except Exception:
#             prefixed = OBJECT_PREFIX + object_name if not object_name.startswith(OBJECT_PREFIX) else object_name[len(OBJECT_PREFIX):]
#             response = minio_client.get_object(MINIO_BUCKET, prefixed)
#         content = response.read()

#         import io, pandas as pd
#         if object_name.endswith(".arrow"):
#             import pyarrow as pa, pyarrow.ipc as ipc
#             reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
#             df = reader.read_all().to_pandas()
#         elif object_name.endswith(".csv"):
#             df = pd.read_csv(io.BytesIO(content))
#         else:  # already excel
#             df = pd.read_excel(io.BytesIO(content))

#         excel_buffer = io.BytesIO()
#         try:
#             df.to_excel(excel_buffer, index=False, engine="openpyxl")
#         except Exception as e:
#             df.to_excel(excel_buffer, index=False, engine="xlsxwriter")
#         excel_bytes = excel_buffer.getvalue()

#         return Response(
#             content=excel_bytes,
#             media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
#             headers={
#                 "Content-Disposition": f"attachment; filename=groupby_result_{object_name.split('/')[-1].replace('.arrow','').replace('.csv','')}.xlsx"
#             }
#         )
#     except Exception as e:
#         raise HTTPException(status_code=404, detail=f"Export failed: {e}")

def clean_columns(df):
    df.columns = [col.strip().lower() for col in df.columns]
    return df

@router.post("/init")
async def get_dimensions_and_measures(
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...)
) -> Dict:
    try:
        df = get_minio_df(bucket_name, object_names)
        df = clean_columns(df)
        dimensions_collection = await get_validator_atoms_collection()
        dimensions = await fetch_dimensions_dict(validator_atom_id, file_key, dimensions_collection)
        measures_collection = await get_column_classifications_collection()
        identifiers, measures = await fetch_identifiers_and_measures(validator_atom_id, file_key, measures_collection)
        numeric_measures = df.select_dtypes(include='number').columns.tolist()
        time_col_found = 'date' if 'date' in df.columns else None
        return {
            "status": "SUCCESS",
            "dimensions_from_db": dimensions,
            "identifiers": identifiers,
            "measures": measures,
            "numeric_measures": numeric_measures,
            "time_column_used": time_col_found,
        }
    except Exception as e:
        return {"status": "FAILURE", "error": str(e)}

@router.post("/run")
async def perform_groupby_route(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    identifiers: str = Form(...),
    aggregations: str = Form(...),
):
    try:
        identifiers = json.loads(identifiers) if isinstance(identifiers, str) else identifiers
        aggregations = json.loads(aggregations) if isinstance(aggregations, str) else aggregations
        df = get_minio_df(bucket=bucket_name, file_key=object_names)
        df = clean_columns(df)
        grouped = groupby_base_func(df, identifiers, aggregations)
        await save_groupby_result(validator_atom_id, file_key, grouped)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        new_filename = f"{validator_atom_id}_{file_key}_grouped.csv"
        csv_bytes = grouped.to_csv(index=False).encode("utf-8")
        minio_client.put_object(
            bucket_name=bucket_name,
            object_name=new_filename,
            data=io.BytesIO(csv_bytes),
            length=len(csv_bytes),
            content_type="text/csv"
        )
        return {
            "status": "SUCCESS",
            "message": "GroupBy complete",
            "result_file": new_filename,
            "row_count": len(grouped),
            "columns": list(grouped.columns)
        }
    except Exception as e:
        return {"status": "FAILURE", "error": str(e)}

import uuid
from fastapi import Body

@router.post("/save")
async def save_groupby_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """Save grouped DataFrame CSV to MinIO bucket and return saved filename"""
    try:
        if not filename:
            gid = str(uuid.uuid4())[:8]
            filename = f"groupby_{gid}.csv"
        if not filename.endswith('.csv'):
            filename += '.csv'
        # Ensure no path traversal
        filename = filename.replace('..', '')
        import pyarrow as pa, pyarrow.ipc as ipc
        import pandas as pd, io
        df = pd.read_csv(io.StringIO(csv_data))
        if not filename.endswith('.arrow'):
            filename = filename.replace('.csv','') + '.arrow'
        if not filename.startswith(OBJECT_PREFIX):
            filename = OBJECT_PREFIX + filename
        table = pa.Table.from_pandas(df)
        sink = pa.BufferOutputStream()
        with ipc.new_file(sink, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = sink.getvalue().to_pybytes()
        minio_client.put_object(
            MINIO_BUCKET,
            filename,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream"
        )
        return {"status": "SUCCESS", "result_file": filename}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Save failed: {str(e)}")

@router.get("/results")
async def get_latest_groupby_result_from_minio(
    validator_atom_id: str = Query(...),
    file_key: str = Query(...),
    bucket_name: str = Query(...),
):
    try:
        key = f"{validator_atom_id}_{file_key}_grouped.csv"
        group_obj = minio_client.get_object(bucket_name, key)
        grouped_df = pd.read_csv(io.BytesIO(group_obj.read()))
        return {
            "status": "SUCCESS",
            "row_count": len(grouped_df),
            "merged_data": grouped_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch merged data: {str(e)}")

