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
from typing import Dict, Any, List, Tuple
from numbers import Real
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

SAFE_EVAL_FUNCTIONS = {
    name for name in SAFE_EVAL_GLOBALS if name not in {"__builtins__", "True", "False", "None"}
}


def _normalize_formula_functions(expr: str) -> str:
    """Normalize function names to match the casing expected by SAFE_EVAL_GLOBALS."""

    result: List[str] = []
    i = 0
    in_quote: str | None = None
    length = len(expr)

    while i < length:
        ch = expr[i]

        if in_quote:
            result.append(ch)
            if ch == "\\" and i + 1 < length:
                # Preserve escaped characters within strings
                result.append(expr[i + 1])
                i += 2
                continue
            if ch == in_quote:
                in_quote = None
            i += 1
            continue

        if ch in {'"', "'"}:
            in_quote = ch
            result.append(ch)
            i += 1
            continue

        if ch.isalpha() or ch == "_":
            start = i
            while i < length and (expr[i].isalnum() or expr[i] == "_"):
                i += 1
            name = expr[start:i]
            j = i
            while j < length and expr[j].isspace():
                j += 1
            if j < length and expr[j] == "(":
                canonical = name.upper()
                if canonical in SAFE_EVAL_FUNCTIONS:
                    result.append(canonical)
                else:
                    result.append(name)
            else:
                result.append(name)
            if j > i:
                result.append(expr[i:j])
            i = j
            continue

        result.append(ch)
        i += 1

    return "".join(result)


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


@router.post("/delete_rows_bulk")
async def delete_rows_bulk(df_id: str = Body(...), indices: list = Body(...)):
    df = _get_df(df_id)
    try:
        # Convert indices to a list of row numbers to exclude
        df = df.with_row_count().filter(~pl.col("row_nr").is_in(indices)).drop("row_nr")
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
            zscore_pattern = re.compile(r"(?i)\b(ZSCORE|NORM)\s*\(([^)]+)\)")
            zscore_placeholders: List[Tuple[str, str]] = []

            def _capture_zscore(match: re.Match) -> str:
                column_name = match.group(2).strip()
                if (column_name.startswith("\"") and column_name.endswith("\"")) or (
                    column_name.startswith("'") and column_name.endswith("'")
                ):
                    column_name = column_name[1:-1]
                placeholder = f"__ZFUNC_{len(zscore_placeholders)}__"
                zscore_placeholders.append((placeholder, column_name))
                return placeholder

            expr_body_processed = zscore_pattern.sub(_capture_zscore, expr_body)
            expr_body_processed = _normalize_formula_functions(expr_body_processed)

            zscore_values: Dict[str, List[Any]] = {}
            if zscore_placeholders:
                for column_name in {col for _, col in zscore_placeholders}:
                    if column_name not in df.columns:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{column_name}' not found for ZSCORE/NORM",
                        )
                    try:
                        series = df.get_column(column_name)
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=str(e))
                    try:
                        numeric_series = series.cast(pl.Float64, strict=False)
                        numeric_series = numeric_series.fill_nan(None)
                    except Exception as e:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{column_name}' could not be converted to numeric values for ZSCORE/NORM: {e}",
                        )

                    values = numeric_series.to_list()
                    valid_values = [
                        float(v)
                        for v in values
                        if v is not None and isinstance(v, Real) and math.isfinite(float(v))
                    ]

                    if not valid_values:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Column '{column_name}' has no numeric values for ZSCORE/NORM",
                        )

                    mean_val = numeric_series.mean()
                    std_val = numeric_series.std()

                    mean_val_f: float | None = None
                    if isinstance(mean_val, Real) and math.isfinite(float(mean_val)):
                        mean_val_f = float(mean_val)

                    std_val_f: float | None = None
                    if isinstance(std_val, Real) and math.isfinite(float(std_val)):
                        std_val_f = float(std_val)

                    if mean_val_f is None:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Unable to compute mean for column '{column_name}'",
                        )

                    if std_val_f is None or math.isclose(std_val_f, 0.0, rel_tol=1e-12, abs_tol=1e-12):
                        zscore_values[column_name] = [
                            None if v is None else 0.0
                            for v in values
                        ]
                    else:
                        zscore_values[column_name] = [
                            None
                            if v is None
                            else (float(v) - mean_val_f) / std_val_f
                            for v in values
                        ]

            headers_pattern = "|".join(re.escape(h) for h in df.columns if h)
            regex = re.compile(f"\\b({headers_pattern})\\b") if headers_pattern else None
            new_vals: List[Any] = []
            for row_idx, r in enumerate(rows):
                replaced = expr_body_processed
                if regex:
                    replaced = regex.sub(lambda m: _format_value(r.get(m.group(0))), replaced)
                if zscore_placeholders:
                    for placeholder, column_name in zscore_placeholders:
                        column_series = zscore_values.get(column_name)
                        z_val = (
                            column_series[row_idx]
                            if column_series is not None and row_idx < len(column_series)
                            else None
                        )
                        replaced = replaced.replace(placeholder, _format_value(z_val))
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


@router.post("/round_column")
async def round_column(df_id: str = Body(...), name: str = Body(...), decimal_places: int = Body(...)):
    df = _get_df(df_id)
    try:
        # Round the specified column to the given decimal places
        df = df.with_columns(pl.col(name).round(decimal_places))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result


@router.post("/transform_column_case")
async def transform_column_case(df_id: str = Body(...), column: str = Body(...), case_type: str = Body(...)):
    """Transform the case of text values in a column with various case styles."""
    df = _get_df(df_id)
    
    if column not in df.columns:
        raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
    
    try:
        # Convert column to string first to handle any data type
        df = df.with_columns(pl.col(column).cast(pl.Utf8))
        
        if case_type == "lower":
            # Convert to lowercase
            df = df.with_columns(pl.col(column).str.to_lowercase())
        elif case_type == "upper":
            # Convert to uppercase
            df = df.with_columns(pl.col(column).str.to_uppercase())
        elif case_type == "pascal":
            # Pascal Case: FirstLetterOfEachWord
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: ''.join(word.capitalize() for word in re.split(r'[\s_\-]+', x)) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "lower_camel":
            # Lower Camel Case: firstLetterOfEachWord
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: ''.join(word.capitalize() if i > 0 else word.lower() for i, word in enumerate(re.split(r'[\s_\-]+', x))) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "snake":
            # Snake Case: snake_case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '_', re.sub(r'[\s\-]+', '_', x)).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "screaming_snake":
            # Screaming Snake Case: SCREAMING_SNAKE_CASE
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '_', re.sub(r'[\s\-]+', '_', x)).upper() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "kebab":
            # Kebab Case: kebab-case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'(?<!^)(?=[A-Z])', '-', re.sub(r'[\s_]+', '-', x)).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "train":
            # Train Case: Train-Case
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: '-'.join(word.capitalize() for word in re.split(r'[\s_\-]+', x)) if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        elif case_type == "flat":
            # Flat Case: flatcase
            df = df.with_columns(
                pl.col(column).map_elements(
                    lambda x: re.sub(r'[\s_\-]+', '', x).lower() if isinstance(x, str) and x.strip() else x,
                    return_dtype=pl.Utf8
                )
            )
        else:
            raise HTTPException(status_code=400, detail=f"Invalid case_type '{case_type}'. Supported types: lower, upper, pascal, lower_camel, snake, screaming_snake, kebab, train, flat")
            
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


@router.post("/describe_column")
async def describe_column(df_id: str = Body(...), column: str = Body(...)):
    """Get statistical description of a specific column."""
    df = _get_df(df_id)
    
    if column not in df.columns:
        raise HTTPException(status_code=404, detail=f"Column '{column}' not found")
    
    try:
        series = df.get_column(column)
        dtype = str(series.dtype)
        
        # Check if column is numeric
        is_numeric = dtype in ['Float64', 'Int64', 'Float32', 'Int32', 'Float16', 'Int16', 'Int8', 'UInt8', 'UInt16', 'UInt32', 'UInt64']
        
        # Basic stats that apply to all columns
        total_count = len(series)
        null_count = series.null_count()
        non_null_count = total_count - null_count
        unique_count = series.n_unique()
        
        result = {
            "column": column,
            "dtype": dtype,
            "is_numeric": is_numeric,
            "total_count": total_count,
            "null_count": null_count,
            "non_null_count": non_null_count,
            "unique_count": unique_count,
            "null_percentage": round((null_count / total_count) * 100, 2) if total_count > 0 else 0,
        }
        
        if is_numeric and non_null_count > 0:
            # Convert to numeric for calculations
            numeric_series = series.cast(pl.Float64, strict=False).fill_nan(None)
            
            # Calculate numeric statistics
            try:
                mean_val = numeric_series.mean()
                median_val = numeric_series.median()
                std_val = numeric_series.std()
                min_val = numeric_series.min()
                max_val = numeric_series.max()
                sum_val = numeric_series.sum()
                
                # Calculate quartiles
                q25 = numeric_series.quantile(0.25)
                q75 = numeric_series.quantile(0.75)
                
                result.update({
                    "mean": float(mean_val) if mean_val is not None else None,
                    "median": float(median_val) if median_val is not None else None,
                    "std": float(std_val) if std_val is not None else None,
                    "min": float(min_val) if min_val is not None else None,
                    "max": float(max_val) if max_val is not None else None,
                    "sum": float(sum_val) if sum_val is not None else None,
                    "q25": float(q25) if q25 is not None else None,
                    "q75": float(q75) if q75 is not None else None,
                    "range": float(max_val - min_val) if max_val is not None and min_val is not None else None,
                })
            except Exception as e:
                # If numeric calculations fail, mark as non-numeric
                result["is_numeric"] = False
                result["numeric_error"] = str(e)
        else:
            # For categorical columns, show NaN for mathematical operations
            result.update({
                "mean": None,
                "median": None,
                "std": None,
                "min": None,
                "max": None,
                "sum": None,
                "q25": None,
                "q75": None,
                "range": None,
            })
            
            # For categorical columns, show most frequent values
            if non_null_count > 0:
                try:
                    value_counts = series.value_counts().sort("count", descending=True)
                    top_values = value_counts.head(5).to_dicts()
                    result["top_values"] = [
                        {"value": str(item["column"]), "count": item["count"]} 
                        for item in top_values
                    ]
                except Exception:
                    result["top_values"] = []
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error describing column: {str(e)}")


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

@router.post("/find_and_replace")
async def find_and_replace(
    df_id: str = Body(...), 
    find_text: str = Body(...), 
    replace_text: str = Body(...),
    replace_all: bool = Body(False),
    case_sensitive: bool = Body(False)
):
    df = _get_df(df_id)
    try:
        # Get all string columns
        string_columns = [col for col in df.columns if df[col].dtype == pl.Utf8]
        
        if not string_columns:
            raise HTTPException(status_code=400, detail="No string columns found to search")
        
        # Apply find and replace to all string columns
        expressions = []
        for col in string_columns:
            if case_sensitive:
                # Case sensitive replacement
                if replace_all:
                    expr = pl.col(col).str.replace_all(find_text, replace_text, literal=True)
                else:
                    expr = pl.col(col).str.replace(find_text, replace_text, literal=True)
            else:
                # Case insensitive replacement - convert to lowercase for comparison
                if replace_all:
                    # For case insensitive replace all, we need to handle this differently
                    expr = pl.col(col).map_elements(
                        lambda x: x.replace(find_text.lower(), replace_text) if isinstance(x, str) and find_text.lower() in x.lower() else x,
                        return_dtype=pl.Utf8
                    )
                else:
                    expr = pl.col(col).map_elements(
                        lambda x: x.replace(find_text.lower(), replace_text, 1) if isinstance(x, str) and find_text.lower() in x.lower() else x,
                        return_dtype=pl.Utf8
                    )
            expressions.append(expr.alias(col))
        
        # Apply the expressions
        df = df.with_columns(expressions)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    SESSIONS[df_id] = df
    result = _df_payload(df, df_id)
    return result

@router.post("/count_matches")
async def count_matches(
    df_id: str = Body(...), 
    find_text: str = Body(...), 
    case_sensitive: bool = Body(False)
):
    """Count occurrences of text in the dataframe."""
    df = _get_df(df_id)
    try:
        # Get all string columns
        string_columns = [col for col in df.columns if df[col].dtype == pl.Utf8]
        
        if not string_columns:
            return {"total_matches": 0, "matches_by_column": {}}
        
        total_matches = 0
        matches_by_column = {}
        
        for col in string_columns:
            if case_sensitive:
                # Case sensitive search
                matches = df.select(
                    pl.col(col).str.count_matches(find_text, literal=True).sum()
                ).item()
            else:
                # Case insensitive search
                matches = df.select(
                    pl.col(col).str.count_matches(find_text.lower(), literal=True).sum()
                ).item()
            
            matches_by_column[col] = matches
            total_matches += matches
        
        return {
            "total_matches": total_matches,
            "matches_by_column": matches_by_column,
            "string_columns": string_columns
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
