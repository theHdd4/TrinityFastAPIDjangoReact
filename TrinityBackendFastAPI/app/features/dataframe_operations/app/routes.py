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
import math
import datetime as dt
from typing import Dict, Any, List, Tuple
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


SAFE_GLOBALS = {"__builtins__": {}}


def _is_null(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    if isinstance(value, str):
        lowered = value.strip().lower()
        return lowered in {"", "nan", "null"}
    return False


def _to_number(value: Any) -> float | None:
    if _is_null(value):
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _to_int(value: Any) -> int | None:
    number = _to_number(value)
    if number is None:
        return None
    try:
        return int(number)
    except (TypeError, ValueError):
        return None


def _parse_date(value: Any) -> dt.datetime | None:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value
    if isinstance(value, dt.date):
        return dt.datetime.combine(value, dt.time.min)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return dt.datetime.fromisoformat(text)
        except ValueError:
            pass
        common_formats = [
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%d-%m-%Y",
            "%m/%d/%Y",
            "%Y-%m-%d %H:%M:%S",
            "%Y/%m/%d %H:%M:%S",
        ]
        for fmt in common_formats:
            try:
                return dt.datetime.strptime(text, fmt)
            except ValueError:
                continue
        try:
            parsed = (
                pl.Series([text])
                .str.to_datetime(strict=False)
                .to_list()[0]
            )
        except Exception:
            parsed = None
        if isinstance(parsed, dt.datetime):
            return parsed
        if isinstance(parsed, dt.date):
            return dt.datetime.combine(parsed, dt.time.min)
    return None


def _bin_value(value: Any, bins: Any) -> Any:
    if not isinstance(bins, (list, tuple)) or len(bins) < 2:
        return None
    numeric = _to_number(value)
    if numeric is None:
        return None
    numeric_bins: List[float] = []
    for b in bins:
        num = _to_number(b)
        if num is None:
            return None
        numeric_bins.append(num)
    for idx in range(len(numeric_bins) - 1):
        start = numeric_bins[idx]
        end = numeric_bins[idx + 1]
        if numeric < start:
            break
        if start <= numeric < end:
            return f"{start}-{end}"
    if numeric < numeric_bins[0]:
        return f"< {numeric_bins[0]}"
    if numeric >= numeric_bins[-1]:
        return f"{numeric_bins[-1]}+"
    return None


def _alias_columns(expr: str, columns: List[str]) -> Tuple[str, Dict[str, str]]:
    alias_map: Dict[str, str] = {}
    sanitized = expr
    for idx, column in enumerate(sorted(columns, key=len, reverse=True)):
        alias = f"__col_{idx}"
        replaced, found = _replace_column_tokens(sanitized, column, alias)
        if found:
            alias_map[alias] = column
            sanitized = replaced
    return sanitized, alias_map


def _replace_column_tokens(expr: str, column: str, alias: str) -> Tuple[str, bool]:
    result: List[str] = []
    i = 0
    found = False
    length = len(column)
    while i < len(expr):
        ch = expr[i]
        if ch in {'"', "'"}:
            quote = ch
            result.append(ch)
            i += 1
            while i < len(expr):
                result.append(expr[i])
                if expr[i] == quote and expr[i - 1] != '\\':
                    i += 1
                    break
                i += 1
            continue
        if expr.startswith(column, i):
            prev_char = expr[i - 1] if i > 0 else ''
            next_index = i + length
            next_char = expr[next_index] if next_index < len(expr) else ''
            if (
                (prev_char and (prev_char.isalnum() or prev_char == '_'))
                or (next_char and (next_char.isalnum() or next_char == '_'))
            ):
                result.append(ch)
                i += 1
                continue
            result.append(alias)
            i += length
            found = True
            continue
        result.append(ch)
        i += 1
    return ''.join(result), found


def func_sum(*values: Any) -> Any:
    numbers = [n for n in (_to_number(v) for v in values) if n is not None]
    if not numbers:
        return 0
    return sum(numbers)


def func_avg(*values: Any) -> Any:
    numbers = [n for n in (_to_number(v) for v in values) if n is not None]
    if not numbers:
        return 0
    return sum(numbers) / len(numbers)


def func_prod(*values: Any) -> Any:
    numbers = [n for n in (_to_number(v) for v in values) if n is not None]
    if not numbers:
        return 1
    result = 1.0
    for num in numbers:
        result *= num
    return result


def func_div(*values: Any) -> Any:
    numbers = [n for n in (_to_number(v) for v in values) if n is not None]
    if not numbers:
        return None
    result = numbers[0]
    for num in numbers[1:]:
        if num == 0:
            continue
        result /= num
    return result


def func_max(*values: Any) -> Any:
    numbers = [n for n in (_to_number(v) for v in values) if n is not None]
    if not numbers:
        return None
    return max(numbers)


def func_min(*values: Any) -> Any:
    numbers = [n for n in (_to_number(v) for v in values) if n is not None]
    if not numbers:
        return None
    return min(numbers)


def func_abs(value: Any) -> Any:
    number = _to_number(value)
    return abs(number) if number is not None else None


def func_round(value: Any, digits: Any = 0) -> Any:
    number = _to_number(value)
    if number is None:
        return None
    places = _to_int(digits)
    return round(number, places if places is not None else 0)


def func_floor(value: Any) -> Any:
    number = _to_number(value)
    return math.floor(number) if number is not None else None


def func_ceil(value: Any) -> Any:
    number = _to_number(value)
    return math.ceil(number) if number is not None else None


def func_exp(value: Any) -> Any:
    number = _to_number(value)
    return math.exp(number) if number is not None else None


def func_log(value: Any) -> Any:
    number = _to_number(value)
    if number is None or number <= 0:
        return None
    return math.log(number)


def func_sqrt(value: Any) -> Any:
    number = _to_number(value)
    if number is None or number < 0:
        return None
    return math.sqrt(number)


def func_lower(value: Any) -> Any:
    if value is None:
        return None
    return str(value).lower()


def func_upper(value: Any) -> Any:
    if value is None:
        return None
    return str(value).upper()


def func_len(value: Any) -> int:
    return len(str(value)) if value is not None else 0


def func_substr(value: Any, start: Any, end: Any | None = None) -> Any:
    if value is None:
        return None
    text = str(value)
    start_idx = _to_int(start) or 0
    if end is None:
        return text[start_idx:]
    end_idx = _to_int(end)
    if end_idx is None:
        return text[start_idx:]
    return text[start_idx:end_idx]


def func_str_replace(value: Any, old: Any, new: Any) -> Any:
    if value is None:
        return None
    return str(value).replace(str(old), str(new))


def func_year(value: Any) -> Any:
    parsed = _parse_date(value)
    return parsed.year if parsed else None


def func_month(value: Any) -> Any:
    parsed = _parse_date(value)
    return parsed.month if parsed else None


def func_day(value: Any) -> Any:
    parsed = _parse_date(value)
    return parsed.day if parsed else None


def func_weekday(value: Any) -> Any:
    parsed = _parse_date(value)
    return parsed.strftime("%A") if parsed else None


def func_date_diff(value_a: Any, value_b: Any) -> Any:
    date_a = _parse_date(value_a)
    date_b = _parse_date(value_b)
    if not date_a or not date_b:
        return None
    delta = date_a - date_b
    return delta.days


def func_mean(*values: Any) -> Any:
    return func_avg(*values)


def func_if(condition: Any, truthy: Any, falsy: Any) -> Any:
    return truthy if condition else falsy


def func_bin(value: Any, bins: Any) -> Any:
    return _bin_value(value, bins)


def func_map(value: Any, mapping: Any) -> Any:
    if isinstance(mapping, dict):
        return mapping.get(value, mapping.get(str(value), value))
    return value


def func_isnull(value: Any) -> bool:
    return _is_null(value)


def func_fillna(value: Any, fill: Any) -> Any:
    return fill if func_isnull(value) else value


ALLOWED_FUNCTIONS = {
    "SUM": func_sum,
    "AVG": func_avg,
    "MEAN": func_mean,
    "PROD": func_prod,
    "DIV": func_div,
    "MAX": func_max,
    "MIN": func_min,
    "ABS": func_abs,
    "ROUND": func_round,
    "FLOOR": func_floor,
    "CEIL": func_ceil,
    "EXP": func_exp,
    "LOG": func_log,
    "SQRT": func_sqrt,
    "LOWER": func_lower,
    "UPPER": func_upper,
    "LEN": func_len,
    "SUBSTR": func_substr,
    "STR_REPLACE": func_str_replace,
    "YEAR": func_year,
    "MONTH": func_month,
    "DAY": func_day,
    "WEEKDAY": func_weekday,
    "DATE_DIFF": func_date_diff,
    "IF": func_if,
    "BIN": func_bin,
    "MAP": func_map,
    "ISNULL": func_isnull,
    "FILLNA": func_fillna,
}

ALLOWED_FUNCTIONS.update({k.lower(): v for k, v in list(ALLOWED_FUNCTIONS.items())})


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

@router.post("/save")
async def save_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True)
):
    """Save a dataframe (CSV) to MinIO under a `dataframe operations` folder using the original file name."""
    try:
        df = pl.read_csv(io.StringIO(csv_data))

        # Generate a filename if none supplied
        if not filename:
            df_id = str(uuid.uuid4())[:8]
            filename = f"{df_id}_dataframe_ops.arrow"
        if not filename.endswith(".arrow"):
            filename += ".arrow"

        # Determine current prefix and ensure folder exists
        prefix = await get_object_prefix()
        # Place results inside a dedicated "dataframe operations" folder
        dfops_prefix = f"{prefix}dataframe operations/"
        try:
            minio_client.stat_object(MINIO_BUCKET, dfops_prefix)
        except S3Error:
            minio_client.put_object(MINIO_BUCKET, dfops_prefix, io.BytesIO(b""), 0)

        object_name = f"{dfops_prefix}{filename}"

        # Convert to Arrow and upload
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

        return {
            "result_file": object_name,
            "shape": df.shape,
            "columns": list(df.columns),
            "message": "DataFrame saved successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


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
    if not expr:
        raise HTTPException(status_code=400, detail="Formula cannot be empty")
    rows = df.to_dicts()
    if expr.startswith("="):
        expr_body = expr[1:].strip()
        corr_match = re.match(r"^CORR\(([^,]+),([^)]+)\)$", expr_body, re.IGNORECASE)
        if corr_match:
            col_a = corr_match.group(1).strip()
            col_b = corr_match.group(2).strip()
            if col_a not in df.columns or col_b not in df.columns:
                raise HTTPException(status_code=400, detail="Unknown column in CORR formula")
            try:
                corr_val = df.select(pl.corr(pl.col(col_a), pl.col(col_b))).to_series()[0]
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            df = df.with_columns(pl.lit(corr_val).alias(target_column))
        else:
            sanitized_expr, alias_map = _alias_columns(expr_body, df.columns)
            try:
                compiled = compile(sanitized_expr, "<formula>", "eval")
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Invalid formula syntax: {exc}") from exc
            base_env = dict(ALLOWED_FUNCTIONS)
            new_vals: List[Any] = []
            for row in rows:
                row_env = {alias: row.get(column) for alias, column in alias_map.items()}
                env = {**base_env, **row_env}
                try:
                    value = eval(compiled, SAFE_GLOBALS, env)
                except NameError as exc:
                    message = exc.args[0] if exc.args else "Unknown reference"
                    match = re.search(r"name '([^']+)' is not defined", message)
                    missing = match.group(1) if match else "unknown"
                    if missing in alias_map:
                        missing = alias_map[missing]
                    raise HTTPException(status_code=400, detail=f"Unsupported reference '{missing}' in formula") from exc
                except Exception:
                    value = None
                new_vals.append(value)
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
        cols.remove(from_col)
        cols.insert(to_index, from_col)
        df = df.select(cols)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
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
