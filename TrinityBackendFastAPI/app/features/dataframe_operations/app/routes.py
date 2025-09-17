from fastapi import APIRouter, Response, Body, HTTPException, UploadFile, File
import os
from minio import Minio
from minio.error import S3Error
from urllib.parse import unquote
import polars as pl
import numba as nb
import io
import uuid
import re
import datetime
import math
from bisect import bisect_right
from typing import Dict, Any, List
from pydantic import BaseModel
from app.DataStorageRetrieval.arrow_client import download_table_bytes
from app.features.data_upload_validate.app.routes import get_object_prefix

router = APIRouter()

# Self-contained MinIO config (match feature-overview)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)

# In-memory storage for dataframe sessions
SESSIONS: Dict[str, pl.DataFrame] = {}


def _get_df(df_id: str) -> pl.DataFrame:
    df = SESSIONS.get(df_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DataFrame not found")
    return df


def _df_payload(df: pl.DataFrame, df_id: str) -> Dict[str, Any]:
    """Serialize the entire dataframe for the frontend using Polars."""

    return {
        "df_id": df_id,
        "headers": df.columns,
        "rows": df.to_dicts(),
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
        "row_count": df.height,
        "column_count": df.width,
    }


def _is_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float):
        return math.isnan(value)
    return False


def _to_number(value: Any) -> float | None:
    if _is_null(value):
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value))
    except (TypeError, ValueError):
        return None


def _parse_datetime(value: Any) -> datetime.datetime | None:
    if _is_null(value):
        return None
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, datetime.date):
        return datetime.datetime.combine(value, datetime.time())
    if isinstance(value, (int, float)):
        try:
            return datetime.datetime.fromtimestamp(float(value))
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return datetime.datetime.fromisoformat(text)
        except ValueError:
            pass
        for fmt in (
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%m/%d/%Y",
            "%d-%m-%Y",
            "%Y-%m-%d %H:%M:%S",
        ):
            try:
                return datetime.datetime.strptime(text, fmt)
            except ValueError:
                continue
    return None


def _format_value(value: Any) -> str:
    if _is_null(value):
        return "None"
    if isinstance(value, datetime.datetime):
        return repr(value.isoformat())
    if isinstance(value, datetime.date):
        return repr(value.isoformat())
    return repr(value)


def _fn_if(condition: Any, true_val: Any, false_val: Any) -> Any:
    return true_val if condition else false_val


def _fn_lower(value: Any) -> Any:
    if _is_null(value):
        return None
    return str(value).lower()


def _fn_upper(value: Any) -> Any:
    if _is_null(value):
        return None
    return str(value).upper()


def _fn_len(value: Any) -> int:
    if _is_null(value):
        return 0
    return len(str(value))


def _fn_substr(value: Any, start: Any, end: Any | None = None) -> Any:
    if _is_null(value):
        return None
    text = str(value)
    try:
        start_idx = int(start)
    except (TypeError, ValueError):
        start_idx = 0
    end_idx: int | None
    if end is None:
        end_idx = None
    else:
        try:
            end_idx = int(end)
        except (TypeError, ValueError):
            end_idx = None
    return text[start_idx:end_idx]


def _fn_str_replace(value: Any, old: Any, new: Any) -> Any:
    if _is_null(value):
        return None
    return str(value).replace(str(old), str(new))


def _fn_year(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.year if dt else None


def _fn_month(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.month if dt else None


def _fn_day(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.day if dt else None


def _fn_weekday(value: Any) -> Any:
    dt = _parse_datetime(value)
    return dt.strftime("%A") if dt else None


def _fn_date_diff(a: Any, b: Any) -> Any:
    dt_a = _parse_datetime(a)
    dt_b = _parse_datetime(b)
    if not dt_a or not dt_b:
        return None
    return (dt_a - dt_b).days


def _fn_abs(value: Any) -> Any:
    num = _to_number(value)
    return abs(num) if num is not None else None


def _fn_round(value: Any, digits: Any = 0) -> Any:
    num = _to_number(value)
    if num is None:
        return None
    try:
        places = int(digits)
    except (TypeError, ValueError):
        places = 0
    return round(num, places)


def _fn_floor(value: Any) -> Any:
    num = _to_number(value)
    return math.floor(num) if num is not None else None


def _fn_ceil(value: Any) -> Any:
    num = _to_number(value)
    return math.ceil(num) if num is not None else None


def _fn_exp(value: Any) -> Any:
    num = _to_number(value)
    return math.exp(num) if num is not None else None


def _fn_log(value: Any) -> Any:
    num = _to_number(value)
    if num is None or num <= 0:
        return None
    return math.log(num)


def _fn_sqrt(value: Any) -> Any:
    num = _to_number(value)
    if num is None or num < 0:
        return None
    return math.sqrt(num)


def _fn_sum(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    return sum(nums)


def _fn_prod(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    result = 1.0
    if not nums:
        return 0
    for n in nums:
        result *= n
    return result


def _fn_div(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    if not nums:
        return None
    result = nums[0]
    for n in nums[1:]:
        if n == 0:
            continue
        result /= n
    return result


def _fn_avg(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    if not nums:
        return None
    return sum(nums) / len(nums)


def _fn_max(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    return max(nums) if nums else None


def _fn_min(*values: Any) -> Any:
    nums = [n for v in values if (n := _to_number(v)) is not None]
    return min(nums) if nums else None


def _fn_bin(value: Any, bins: Any) -> Any:
    try:
        edges = [float(b) for b in bins]
    except TypeError:
        return None
    if len(edges) < 2:
        return None
    edges.sort()
    num = _to_number(value)
    if num is None:
        return None
    if num < edges[0]:
        return f"<{edges[0]}"
    idx = bisect_right(edges, num) - 1
    if idx >= len(edges) - 1:
        return f">={edges[-1]}"
    lower = edges[idx]
    upper = edges[idx + 1]
    return f"[{lower}, {upper})"


def _fn_map(value: Any, mapping: Any) -> Any:
    if not isinstance(mapping, dict):
        return value
    if value in mapping:
        return mapping[value]
    key = str(value) if not isinstance(value, str) else value
    return mapping.get(key, value)


def _fn_isnull(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip() == ""
    return _is_null(value)


def _fn_fillna(value: Any, replacement: Any) -> Any:
    return replacement if _fn_isnull(value) else value


SAFE_EVAL_GLOBALS: Dict[str, Any] = {
    "__builtins__": {},
    "True": True,
    "False": False,
    "None": None,
    "IF": _fn_if,
    "LOWER": _fn_lower,
    "UPPER": _fn_upper,
    "LEN": _fn_len,
    "SUBSTR": _fn_substr,
    "STR_REPLACE": _fn_str_replace,
    "YEAR": _fn_year,
    "MONTH": _fn_month,
    "DAY": _fn_day,
    "WEEKDAY": _fn_weekday,
    "DATE_DIFF": _fn_date_diff,
    "ABS": _fn_abs,
    "ROUND": _fn_round,
    "FLOOR": _fn_floor,
    "CEIL": _fn_ceil,
    "EXP": _fn_exp,
    "LOG": _fn_log,
    "SQRT": _fn_sqrt,
    "SUM": _fn_sum,
    "AVG": _fn_avg,
    "MEAN": _fn_avg,
    "PROD": _fn_prod,
    "DIV": _fn_div,
    "MAX": _fn_max,
    "MIN": _fn_min,
    "BIN": _fn_bin,
    "MAP": _fn_map,
    "ISNULL": _fn_isnull,
    "FILLNA": _fn_fillna,
}


def _fetch_df_from_object(object_name: str) -> pl.DataFrame:
    """Fetch a DataFrame from the Flight server or MinIO given an object key."""
    object_name = unquote(object_name)
    if not object_name.endswith(".arrow"):
        raise HTTPException(
            status_code=400, detail="Only .arrow objects are supported"
        )
    try:
        data = download_table_bytes(object_name)
        return pl.read_ipc(io.BytesIO(data))
    except Exception:
        raise HTTPException(status_code=404, detail="Not Found")

@router.get("/test_alive")
async def test_alive():
    return {"status": "alive"}

@router.get("/cached_dataframe")
async def cached_dataframe(object_name: str):
    df = _fetch_df_from_object(object_name)
    buf = io.StringIO()
    df.write_csv(buf)
    return Response(content=buf.getvalue(), media_type="text/csv")


@router.post("/load_cached")
async def load_cached_dataframe(object_name: str = Body(..., embed=True)):
    """Load a cached dataframe by object key and create a session."""
    df = _fetch_df_from_object(object_name)
    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)

class SaveRequest(BaseModel):
    csv_data: str | None = None
    filename: str | None = None
    df_id: str | None = None


@router.post("/save")
async def save_dataframe(payload: SaveRequest):
    """Save a dataframe session to MinIO, falling back to CSV payloads when no session is available."""

    df: pl.DataFrame | None = None
    session_id = payload.df_id

    if session_id:
        df = SESSIONS.get(session_id)
        if df is None and payload.csv_data is None:
            raise HTTPException(status_code=404, detail="DataFrame session not found")

    if df is None:
        if not payload.csv_data:
            raise HTTPException(status_code=400, detail="csv_data is required when df_id is missing")
        try:
            df = pl.read_csv(io.StringIO(payload.csv_data))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid csv_data: {exc}") from exc

    filename = (payload.filename or "").strip()
    if not filename:
        stub = (session_id or str(uuid.uuid4())).replace("-", "")[:8]
        filename = f"{stub}_dataframe_ops.arrow"
    if not filename.endswith(".arrow"):
        filename += ".arrow"

    try:
        prefix = await get_object_prefix()
        dfops_prefix = f"{prefix}dataframe operations/"
        try:
            minio_client.stat_object(MINIO_BUCKET, dfops_prefix)
        except S3Error:
            minio_client.put_object(MINIO_BUCKET, dfops_prefix, io.BytesIO(b""), 0)

        object_name = f"{dfops_prefix}{filename}"

        arrow_buffer = io.BytesIO()
        df.write_ipc(arrow_buffer)
        arrow_bytes = arrow_buffer.getvalue()
        minio_client.put_object(
            MINIO_BUCKET,
            object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream",
        )

        response = {
            "result_file": object_name,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully",
        }
        if session_id:
            response["df_id"] = session_id
        return response
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Backend dataframe operation endpoints
# ---------------------------------------------------------------------------


@router.post("/load")
async def load_dataframe(file: UploadFile = File(...)):
    """Load a CSV file and store it in a session."""
    try:
        content = await file.read()
        df = pl.read_csv(io.BytesIO(content))
    except Exception:
        raise HTTPException(status_code=400, detail="Failed to parse uploaded file")
    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/filter_rows")
async def filter_rows(df_id: str = Body(...), column: str = Body(...), value: Any = Body(...)):
    df = _get_df(df_id)
    try:
        if isinstance(value, dict):
            min_v = value.get("min")
            max_v = value.get("max")
            df = df.filter(pl.col(column).is_between(min_v, max_v))
        elif isinstance(value, list):
            df = df.filter(pl.col(column).is_in(value))
        else:
            df = df.filter(pl.col(column) == value)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/sort")
async def sort_dataframe(df_id: str = Body(...), column: str = Body(...), direction: str = Body("asc")):
    df = _get_df(df_id)
    try:
        df = df.sort(column, descending=direction != "asc")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/insert_row")
async def insert_row(
    df_id: str = Body(...),
    index: int = Body(...),
    direction: str = Body("below"),
):
    df = _get_df(df_id)
    empty = {col: None for col in df.columns}
    insert_at = index if direction == "above" else index + 1
    insert_at = max(0, min(insert_at, df.height))
    upper = df.slice(0, insert_at)
    lower = df.slice(insert_at, df.height - insert_at)
    df = pl.concat([upper, pl.DataFrame([empty], schema=df.schema), lower])
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_row")
async def delete_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.with_row_count().filter(pl.col("row_nr") != index).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/insert_column")
async def insert_column(
    df_id: str = Body(...),
    index: int = Body(...),
    name: str = Body(...),
    default: Any = Body(None),
):
    df = _get_df(df_id)
    if index >= len(df.columns):
        df = df.with_columns(pl.lit(default).alias(name))
    else:
        df = df.with_columns(pl.lit(default).alias(name))
        cols = df.columns
        cols.remove(name)
        cols.insert(index, name)
        df = df.select(cols)
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/delete_column")
async def delete_column(df_id: str = Body(...), name: str = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.drop(name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/edit_cell")
async def edit_cell(df_id: str = Body(...), row: int = Body(...), column: str = Body(...), value: Any = Body(...)):
    df = _get_df(df_id)
    try:
        df = df.with_row_count().with_columns(
            pl.when(pl.col("row_nr") == row)
            .then(pl.lit(value))
            .otherwise(pl.col(column))
            .alias(column)
        ).drop("row_nr")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/apply_formula")
async def apply_formula(
    df_id: str = Body(...),
    target_column: str = Body(...),
    formula: str = Body(...),
):
    """Apply a simple column-based formula to the dataframe."""
    df = _get_df(df_id)
    expr = formula.strip()
    rows = df.to_dicts()
    if expr.startswith("="):
        expr_body = expr[1:].strip()
        corr_match = re.match(r"^CORR\(([^,]+),([^)]+)\)$", expr_body, re.IGNORECASE)
        if corr_match:
            cols = [c.strip() for c in corr_match.groups()]
            if len(cols) != 2:
                raise HTTPException(status_code=400, detail="CORR requires two columns")
            c1, c2 = cols
            try:
                corr_val = df.select(pl.corr(pl.col(c1), pl.col(c2))).to_series()[0]
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            df = df.with_columns(pl.lit(corr_val).alias(target_column))
        else:
            headers_pattern = "|".join(re.escape(h) for h in df.columns if h)
            regex = re.compile(f"\\b({headers_pattern})\\b") if headers_pattern else None
            new_vals: List[Any] = []
            for r in rows:
                replaced = expr_body
                if regex:
                    replaced = regex.sub(lambda m: _format_value(r.get(m.group(0))), replaced)
                try:
                    val = eval(replaced, SAFE_EVAL_GLOBALS, {})
                except Exception:
                    val = None
                new_vals.append(val)
            df = df.with_columns(pl.Series(target_column, new_vals))
    else:
        df = df.with_columns(pl.lit(expr).alias(target_column))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)

@router.post("/apply_udf")
async def apply_udf(
    df_id: str = Body(...),
    column: str = Body(...),
    udf_code: str = Body(...),
    new_column: str | None = Body(None),
):
    """Apply a custom scalar UDF using Polars with a Numba-compiled function."""
    df = _get_df(df_id)
    try:
        local_ns: Dict[str, Any] = {}
        exec("def _udf(x):\n    return " + udf_code, {}, local_ns)
        udf = nb.njit(local_ns["_udf"])  # type: ignore[arg-type]
        target = new_column or column
        df = df.with_columns(pl.col(column).apply(udf).alias(target))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    return _df_payload(df, df_id)


@router.post("/rename_column")
async def rename_column(df_id: str = Body(...), old_name: str = Body(...), new_name: str = Body(...)):
    df = _get_df(df_id)
    df = df.rename({old_name: new_name})
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/duplicate_row")
async def duplicate_row(df_id: str = Body(...), index: int = Body(...)):
    df = _get_df(df_id)
    try:
        row = df.slice(index, 1)
        df = pl.concat([df.slice(0, index), row, df.slice(index, df.height - index)])
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/duplicate_column")
async def duplicate_column(df_id: str = Body(...), name: str = Body(...), new_name: str = Body(...)):
    df = _get_df(df_id)
    try:
        idx = df.columns.index(name)
        df = df.with_columns(pl.col(name).alias(new_name))
        cols = df.columns
        cols.remove(new_name)
        cols.insert(idx, new_name)
        df = df.select(cols)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/move_column")
async def move_column(df_id: str = Body(...), from_col: str = Body(..., alias="from"), to_index: int = Body(...)):
    df = _get_df(df_id)
    try:
        cols = df.columns
        
        # Validate column exists
        if from_col not in cols:
            available_cols = ", ".join(cols)
            raise HTTPException(
                status_code=400, 
                detail=f"Column '{from_col}' not found. Available columns: {available_cols}"
            )
        
        # Validate to_index is within bounds
        if to_index < 0 or to_index >= len(cols):
            raise HTTPException(
                status_code=400, 
                detail=f"Index {to_index} is out of bounds. Valid range: 0-{len(cols)-1} (total columns: {len(cols)})"
            )
        
        cols.remove(from_col)
        cols.insert(to_index, from_col)
        df = df.select(cols)
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Move column operation failed: {str(e)}")
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/retype_column")
async def retype_column(df_id: str = Body(...), name: str = Body(...), new_type: str = Body(...)):
    df = _get_df(df_id)
    try:
        if new_type == "number":
            df = df.with_columns(pl.col(name).cast(pl.Float64, strict=False))
        elif new_type in ["string", "text"]:
            df = df.with_columns(pl.col(name).cast(pl.Utf8))
        else:
            df = df.with_columns(pl.col(name).cast(pl.Utf8))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.get("/preview")
async def preview(df_id: str, n: int = 5):
    df = _get_df(df_id)
    preview_df = df.head(n)
    return {
        "df_id": df_id,
        "headers": df.columns,
        "rows": preview_df.to_dicts(),
    }


@router.get("/info")
async def info(df_id: str):
    df = _get_df(df_id)
    return {
        "df_id": df_id,
        "row_count": df.height,
        "column_count": df.width,
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
    }


@router.post("/ai/execute_operations")
async def ai_execute(df_id: str = Body(...), operations: List[Dict[str, Any]] = Body(...)):
    df = _get_df(df_id)
    for op in operations:
        name = op.get("op")
        params = op.get("params", {})
        if name == "filter_rows":
            df = df.filter(pl.col(params.get("column")) == params.get("value"))
        elif name == "sort":
            df = df.sort(params.get("column"), descending=params.get("direction", "asc") != "asc")
        elif name == "insert_column":
            idx = params.get("index", len(df.columns))
            df = df.with_columns(pl.lit(params.get("default")).alias(params.get("name")))
            cols = df.columns
            cols.remove(params.get("name"))
            cols.insert(idx, params.get("name"))
            df = df.select(cols)
        elif name == "delete_row":
            df = df.with_row_count().filter(pl.col("row_nr") != params.get("index")).drop("row_nr")
        elif name == "edit_cell":
            df = df.with_row_count().with_columns(
                pl.when(pl.col("row_nr") == params.get("row"))
                .then(pl.lit(params.get("value")))
                .otherwise(pl.col(params.get("column")))
                .alias(params.get("column"))
            ).drop("row_nr")
    SESSIONS[df_id] = df
    return _df_payload(SESSIONS[df_id], df_id)
