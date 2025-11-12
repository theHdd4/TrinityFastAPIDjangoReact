"""Shared helpers for the data upload/validation workflow."""
from __future__ import annotations

import io
import os
import re
from typing import Tuple

import polars as pl

from app.core.utils import get_env_vars
from app.DataStorageRetrieval.db import fetch_client_app_project


# Common Polars CSV options to improve schema inference on large files
CSV_READ_KWARGS = {
    "low_memory": True,
    "infer_schema_length": 10_000,
    "encoding": "utf8-lossy",  # Handle all encodings gracefully (UTF-8, Latin-1, Windows-1252, etc.)
}


def _smart_csv_parse(content: bytes, csv_kwargs: dict) -> tuple[pl.DataFrame, list[str], dict]:
    """Smart CSV parsing that automatically detects and handles mixed data types."""

    warnings: list[str] = []
    metadata = {
        "mixed_dtype_columns": [],
        "encoding_used": "utf8-lossy",
        "parsing_method": "standard",
    }

    # Step 1: Try normal parsing first (FAST PATH)
    try:
        df = pl.read_csv(io.BytesIO(content), **csv_kwargs)
        return df, warnings, metadata
    except Exception as e1:
        error_msg = str(e1).lower()

        # Step 2: Quick check - if it's a mixed data type error, jump directly to ignore_errors
        if "could not parse" in error_msg and "as dtype" in error_msg:
            print("🔄 Mixed data type detected, using ignore_errors for fast handling...")
            try:
                kwargs_ignore = csv_kwargs.copy()
                kwargs_ignore["ignore_errors"] = True
                df = pl.read_csv(io.BytesIO(content), **kwargs_ignore)
                metadata["parsing_method"] = "ignore_errors"

                # Extract problematic column name from error message
                match = re.search(r"at column '([^']+)'", str(e1))
                if match:
                    problematic_col = match.group(1)
                    metadata["mixed_dtype_columns"] = [problematic_col]
                    warnings.append(f"Detected mixed data types in column: {problematic_col}")
                    warnings.append(
                        "File may contain mixed numeric and text values - converted problematic data to preserve integrity"
                    )

                return df, warnings, metadata
            except Exception as e2:
                print(f"❌ ignore_errors failed: {e2}")

        # Step 3: Final fallback - everything as strings (GUARANTEED TO WORK)
        try:
            print("🔄 Final fallback: Reading all columns as strings")
            kwargs_strings = {k: v for k, v in csv_kwargs.items() if k not in ["infer_schema_length"]}
            df = pl.read_csv(io.BytesIO(content), dtypes=pl.Utf8, **kwargs_strings)
            metadata["parsing_method"] = "all_strings"
            metadata["mixed_dtype_columns"] = []  # Can't determine specific columns
            warnings.append("All columns read as strings to handle data type conflicts")
            warnings.append("Please use Dataframe Operations atom to fix column data types if needed")
            return df, warnings, metadata
        except Exception as e3:
            print(f"❌ All parsing methods failed: {e3}")
            raise e1  # Re-raise original error


def _parse_numeric_id(value: str | int | None) -> int:
    """Return the numeric component of an ID string like ``"name_123"``."""

    if value is None:
        return 0
    try:
        return int(str(value).split("_")[-1])
    except Exception:
        return 0


async def get_object_prefix(
    client_id: str = "",
    app_id: str = "",
    project_id: str = "",
    *,
    client_name: str = "",
    app_name: str = "",
    project_name: str = "",
    include_env: bool = False,
) -> str | tuple[str, dict[str, str], str]:
    """Return the MinIO prefix for the current client/app/project."""

    USER_ID = _parse_numeric_id(os.getenv("USER_ID"))
    PROJECT_ID = _parse_numeric_id(project_id or os.getenv("PROJECT_ID", "0"))

    # If explicit names are provided, avoid using potentially stale identifier values from ``os.environ``.
    if client_name or app_name or project_name:
        client_id_env = client_id or ""
        app_id_env = app_id or ""
        project_id_env = project_id or ""
    else:
        client_id_env = client_id or os.getenv("CLIENT_ID", "")
        app_id_env = app_id or os.getenv("APP_ID", "")
        project_id_env = project_id or os.getenv("PROJECT_ID", "")

    env: dict[str, str] = {}
    env_source = "unknown"
    fresh = await get_env_vars(
        client_id_env,
        app_id_env,
        project_id_env,
        client_name=client_name or os.getenv("CLIENT_NAME", ""),
        app_name=app_name or os.getenv("APP_NAME", ""),
        project_name=project_name or os.getenv("PROJECT_NAME", ""),
        use_cache=True,
        return_source=True,
    )

    if isinstance(fresh, tuple):
        env, env_source = fresh
    else:
        env, env_source = fresh, "unknown"

    print(f"🔧 fetched env {env} (source={env_source})")

    client = env.get("CLIENT_NAME", os.getenv("CLIENT_NAME", "default_client"))
    app = env.get("APP_NAME", os.getenv("APP_NAME", "default_app"))
    project = env.get("PROJECT_NAME", os.getenv("PROJECT_NAME", "default_project"))

    if PROJECT_ID and (client == "default_client" or app == "default_app" or project == "default_project"):
        try:
            client_db, app_db, project_db = await fetch_client_app_project(
                USER_ID if USER_ID else None, PROJECT_ID
            )
            client = client_db or client
            app = app_db or app
            project = project_db or project
        except Exception as exc:  # pragma: no cover - database unreachable
            print(f"⚠️ Failed to load names from DB: {exc}")

    os.environ["CLIENT_NAME"] = client
    os.environ["APP_NAME"] = app
    os.environ["PROJECT_NAME"] = project
    prefix = f"{client}/{app}/{project}/"
    print(
        "📦 prefix %s (CLIENT_ID=%s APP_ID=%s PROJECT_ID=%s)"
        % (prefix, client_id or os.getenv("CLIENT_ID", ""), app_id or os.getenv("APP_ID", ""), PROJECT_ID)
    )
    if include_env:
        return prefix, env, env_source
    return prefix


__all__ = [
    "CSV_READ_KWARGS",
    "_smart_csv_parse",
    "get_object_prefix",
    "_parse_numeric_id",
]
