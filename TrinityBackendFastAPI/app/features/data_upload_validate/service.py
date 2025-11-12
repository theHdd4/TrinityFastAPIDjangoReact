from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple
from time import perf_counter

import pandas as pd
import polars as pl

from app.DataStorageRetrieval.arrow_client import upload_dataframe
from app.DataStorageRetrieval.minio_utils import (
    ensure_minio_bucket,
    get_arrow_dir,
    get_client,
    save_arrow_table,
    upload_to_minio,
)
from app.features.data_upload_validate.app.database import (
    get_validator_atom_from_mongo,
    log_operation_to_mongo,
    save_validation_log_to_mongo,
)
from app.features.data_upload_validate.app.validators.custom_validator import (
    perform_enhanced_validation,
)

logger = logging.getLogger("app.features.data_upload_validate.service")

CUSTOM_CONFIG_DIR = Path("custom_validations")
CUSTOM_CONFIG_DIR.mkdir(exist_ok=True)

MONGODB_DIR = Path("mongodb")
MONGODB_DIR.mkdir(exist_ok=True)

extraction_results: Dict[str, Any] = {}

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

CSV_READ_KWARGS: Dict[str, Any] = {
    "low_memory": True,
    "infer_schema_length": 10_000,
    "encoding": "utf8-lossy",
}


def load_non_validation_data(validator_atom_id: str, data_type: str) -> dict:
    try:
        file_path = MONGODB_DIR / f"{validator_atom_id}_{data_type}.json"
        if file_path.exists():
            with open(file_path, "r") as handle:
                return json.load(handle)
        return {}
    except Exception:  # pragma: no cover - defensive loading
        logger.exception("Failed to load %s for validator %s", data_type, validator_atom_id)
        return {}


def load_all_non_validation_data(validator_atom_id: str) -> dict:
    return {
        "business_dimensions": load_non_validation_data(validator_atom_id, "business_dimensions"),
        "identifier_assignments": load_non_validation_data(validator_atom_id, "identifier_assignments"),
    }


def get_validator_from_memory_or_disk(validator_atom_id: str) -> dict | None:
    if validator_atom_id in extraction_results:
        return extraction_results[validator_atom_id]

    config_path = CUSTOM_CONFIG_DIR / f"{validator_atom_id}.json"
    if not config_path.exists():
        return None

    try:
        with open(config_path, "r") as handle:
            config = json.load(handle)
    except Exception:  # pragma: no cover - defensive loading
        logger.exception("Failed to load validator config %s", config_path)
        return None

    data = {
        "validator_atom_id": validator_atom_id,
        "schemas": config.get("schemas", {}),
        "column_types": config.get("column_types", {}),
        "config_saved": True,
        "config_path": str(config_path),
    }
    data.update(load_all_non_validation_data(validator_atom_id))
    extraction_results[validator_atom_id] = data
    return data


def load_existing_configs() -> None:
    if not CUSTOM_CONFIG_DIR.exists():
        return
    for config_file in CUSTOM_CONFIG_DIR.glob("*.json"):
        try:
            with open(config_file, "r") as handle:
                config = json.load(handle)
            validator_atom_id = config.get("validator_atom_id")
            if not validator_atom_id:
                continue
            data = {
                "validator_atom_id": validator_atom_id,
                "schemas": config.get("schemas", {}),
                "column_types": config.get("column_types", {}),
                "config_saved": True,
                "config_path": str(config_file),
            }
            data.update(load_all_non_validation_data(validator_atom_id))
            extraction_results[validator_atom_id] = data
        except Exception:  # pragma: no cover - defensive loading
            logger.exception("Failed to hydrate validator config from %s", config_file)


def read_minio_object(object_name: str) -> bytes:
    client = get_client()
    response = client.get_object(MINIO_BUCKET, object_name)
    try:
        return response.read()
    finally:  # pragma: no cover - defensive cleanup
        try:
            response.close()
            response.release_conn()
        except Exception:
            pass


def _smart_csv_parse(content: bytes, csv_kwargs: Dict[str, Any]) -> Tuple[pl.DataFrame, List[str], Dict[str, Any]]:
    warnings: List[str] = []
    metadata: Dict[str, Any] = {
        "mixed_dtype_columns": [],
        "encoding_used": "utf8-lossy",
        "parsing_method": "standard",
    }

    try:
        df = pl.read_csv(io.BytesIO(content), **csv_kwargs)
        return df, warnings, metadata
    except Exception as first_error:  # pragma: no cover - defensive parsing
        error_msg = str(first_error).lower()
        if "could not parse" in error_msg and "as dtype" in error_msg:
            kwargs_ignore = csv_kwargs.copy()
            kwargs_ignore["ignore_errors"] = True
            try:
                df = pl.read_csv(io.BytesIO(content), **kwargs_ignore)
                metadata["parsing_method"] = "ignore_errors"
                try:
                    import re

                    match = re.search(r"at column '([^']+)'", str(first_error))
                    if match:
                        problematic_col = match.group(1)
                        metadata["mixed_dtype_columns"] = [problematic_col]
                        warnings.append(f"Detected mixed data types in column: {problematic_col}")
                        warnings.append(
                            "File may contain mixed numeric and text values - converted problematic data to preserve integrity"
                        )
                except Exception:  # pragma: no cover - diagnostic helper
                    warnings.append("Detected mixed data types - some problematic data was handled")
                return df, warnings, metadata
            except Exception:
                pass
        kwargs_strings = {k: v for k, v in csv_kwargs.items() if k not in ["infer_schema_length"]}
        try:
            df = pl.read_csv(io.BytesIO(content), dtypes=pl.Utf8, **kwargs_strings)
            metadata["parsing_method"] = "all_strings"
            warnings.append("All columns read as strings to handle data type conflicts")
            warnings.append("Please use Dataframe Operations atom to fix column data types if needed")
            return df, warnings, metadata
        except Exception:
            raise first_error


def process_temp_upload(*, file_b64: str, filename: str, tmp_prefix: str) -> Dict[str, Any]:
    content = base64.b64decode(file_b64)
    ensure_minio_bucket()
    logger.info("data_upload.temp_upload.worker_start file=%s size=%s", filename, len(content))

    parsing_warnings: List[str] = []
    parsing_metadata: Dict[str, Any] = {}
    if filename.lower().endswith(".csv"):
        df_pl, parsing_warnings, parsing_metadata = _smart_csv_parse(content, CSV_READ_KWARGS)
    elif filename.lower().endswith((".xls", ".xlsx")):
        try:
            df_pandas = pd.read_excel(io.BytesIO(content))
            df_pl = pl.from_pandas(df_pandas)
        except Exception as exc:  # pragma: no cover - relies on pandas engine
            logger.exception("Excel parsing failed for file %s", filename)
            raise ValueError(f"Error parsing file {filename}: {exc}") from exc
    else:
        raise ValueError("Only CSV and XLSX files supported")

    arrow_buf = io.BytesIO()
    df_pl.write_ipc(arrow_buf)
    arrow_name = Path(filename).stem + ".arrow"
    logger.info(
        "data_upload.temp_upload.arrow_ready file=%s rows=%s cols=%s size=%s",
        filename,
        df_pl.height,
        df_pl.width,
        arrow_buf.getbuffer().nbytes,
    )

    result = upload_to_minio(arrow_buf.getvalue(), arrow_name, tmp_prefix)
    if result.get("status") != "success":
        error_msg = result.get("error_message", "Upload failed")
        logger.error("data_upload.temp_upload.upload_failed file=%s error=%s", filename, error_msg)
        raise ValueError(error_msg)

    response: Dict[str, Any] = {
        "file_path": result["object_name"],
        "file_name": filename,
        "has_data_quality_issues": False,
        "message": "File uploaded successfully",
    }

    if parsing_warnings:
        response["warnings"] = parsing_warnings
        response["has_data_quality_issues"] = True
        mixed_cols = parsing_metadata.get("mixed_dtype_columns", [])
        if mixed_cols:
            response["mixed_dtype_columns"] = mixed_cols
            response["mixed_dtype_count"] = len(mixed_cols)
            col_list = ", ".join(mixed_cols[:5])
            if len(mixed_cols) > 5:
                col_list += f" and {len(mixed_cols) - 5} more"
            response["message"] = (
                f"File '{filename}' has mixed data types in columns: {col_list}. "
                "This may lead to unstable results. Please use Dataframe Operations atom to fix column data types."
            )
        else:
            response["message"] = (
                "File uploaded successfully with data quality warnings. Some atoms may need data type conversion."
            )

    return response


def run_validation(
    *,
    validator_atom_id: str,
    file_payloads: List[Dict[str, str]] | None,
    file_paths: List[str],
    keys: List[str],
    date_frequency: str | None,
    user_id: str,
    client_id: str,
) -> Dict[str, Any]:
    start_time = perf_counter()
    validator_data = get_validator_atom_from_mongo(validator_atom_id)
    if not validator_data:
        validator_data = get_validator_from_memory_or_disk(validator_atom_id)
    if not validator_data:
        raise ValueError(f"Validator atom '{validator_atom_id}' not found")
    validator_data["validator_atom_id"] = validator_atom_id

    def preprocess_column_name(col_name: str) -> str:
        col_name = col_name.strip().lower()
        col_name = re.sub(r"(?<!_)\s+(?!_)", "", col_name)
        return col_name

    files_data: List[Tuple[str, pd.DataFrame]] = []
    file_contents: List[Tuple[int, str, str]] = []

    if file_payloads:
        for payload in file_payloads:
            key = payload["key"]
            filename = payload.get("filename", key)
            content = base64.b64decode(payload["content_b64"])
            if filename.lower().endswith(".csv"):
                df_pl = pl.read_csv(io.BytesIO(content), **CSV_READ_KWARGS)
            elif filename.lower().endswith((".xls", ".xlsx")):
                df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(content)))
            elif filename.lower().endswith(".arrow"):
                df_pl = pl.read_ipc(io.BytesIO(content))
            else:
                raise ValueError("Only CSV, XLSX and Arrow files supported")
            df = df_pl.to_pandas()
            df.columns = [preprocess_column_name(col) for col in df.columns]
            files_data.append((key, df))
            file_contents.append((len(content), filename, key))

    if file_paths:
        for path, key in zip(file_paths, keys):
            data = read_minio_object(path)
            filename = Path(path).name
            if filename.lower().endswith(".csv"):
                df_pl = pl.read_csv(io.BytesIO(data), **CSV_READ_KWARGS)
            elif filename.lower().endswith((".xls", ".xlsx")):
                df_pl = pl.from_pandas(pd.read_excel(io.BytesIO(data)))
            elif filename.lower().endswith(".arrow"):
                df_pl = pl.read_ipc(io.BytesIO(data))
            else:
                raise ValueError("Only CSV, XLSX and Arrow files supported")
            df = df_pl.to_pandas()
            df.columns = [preprocess_column_name(col) for col in df.columns]
            files_data.append((key, df))
            file_contents.append((len(data), filename, key))

    if not files_data:
        raise ValueError("No files provided for validation")

    validation_results = perform_enhanced_validation(files_data, validator_data)

    minio_uploads: List[Dict[str, Any]] = []
    flight_uploads: List[Dict[str, str]] = []
    if validation_results["overall_status"] in ["passed", "passed_with_warnings"]:
        for (_, filename, key), (_, df) in zip(file_contents, files_data):
            arrow_file = get_arrow_dir() / f"{validator_atom_id}_{key}.arrow"
            save_arrow_table(df, arrow_file)
            flight_path = f"{validator_atom_id}/{key}"
            upload_dataframe(df, flight_path)
            flight_uploads.append({"file_key": key, "flight_path": flight_path})
            minio_uploads.append({"file_key": key, "arrow_path": str(arrow_file)})

    validation_log_data = {
        "validator_atom_id": validator_atom_id,
        "files_validated": [
            {
                "file_key": key,
                "filename": next((f[1] for f in file_contents if f[2] == key), ""),
                "file_size_bytes": next((f[0] for f in file_contents if f[2] == key), 0),
                "overall_status": validation_results["file_results"].get(key, {}).get("status", "unknown"),
                "errors": validation_results["file_results"].get(key, {}).get("errors", []),
                "warnings": validation_results["file_results"].get(key, {}).get("warnings", []),
                "auto_corrections": validation_results["file_results"].get(key, {}).get("auto_corrections", []),
                "condition_failures": validation_results["file_results"].get(key, {}).get("condition_failures", []),
                "columns_checked": validation_results["file_results"].get(key, {}).get("columns_checked", 0),
                "data_corrections_applied": validation_results["file_results"].get(key, {}).get("data_corrections_applied", 0),
                "custom_conditions_failed": validation_results["file_results"].get(key, {}).get("custom_conditions_failed", 0),
                "validation_duration_ms": 0,
            }
            for key, _ in files_data
        ],
        "overall_status": validation_results["overall_status"],
        "total_files": len(files_data),
        "total_duration_ms": (perf_counter() - start_time) * 1000,
        "minio_uploads": minio_uploads,
        "summary_stats": {
            "total_auto_corrections": validation_results["summary"].get("total_auto_corrections", 0),
            "total_condition_failures": validation_results["summary"].get("total_condition_failures", 0),
            "total_errors": sum(len(result.get("errors", [])) for result in validation_results["file_results"].values()),
            "total_warnings": sum(len(result.get("warnings", [])) for result in validation_results["file_results"].values()),
        },
    }

    mongo_log_result = save_validation_log_to_mongo(validation_log_data)
    log_operation_to_mongo(
        user_id=user_id,
        client_id=client_id,
        validator_atom_id=validator_atom_id,
        operation="validate",
        details={"overall_status": validation_results["overall_status"]},
    )

    return {
        "overall_status": validation_results["overall_status"],
        "validator_atom_id": validator_atom_id,
        "file_validation_results": validation_results["file_results"],
        "summary": validation_results["summary"],
        "minio_uploads": minio_uploads,
        "flight_uploads": flight_uploads,
        "validation_log_saved": mongo_log_result.get("status") == "success",
        "validation_log_id": mongo_log_result.get("mongo_id", ""),
        "total_auto_corrections": validation_results["summary"].get("total_auto_corrections", 0),
        "total_condition_failures": validation_results["summary"].get("total_condition_failures", 0),
    }


__all__ = [
    "CUSTOM_CONFIG_DIR",
    "MONGODB_DIR",
    "extraction_results",
    "CSV_READ_KWARGS",
    "load_all_non_validation_data",
    "get_validator_from_memory_or_disk",
    "load_existing_configs",
    "read_minio_object",
    "process_temp_upload",
    "run_validation",
]
