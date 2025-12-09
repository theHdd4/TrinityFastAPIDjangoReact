import os
import io
import uuid
import re
import pandas as pd
import polars as pl
from pathlib import Path
from typing import List, Dict, Any, Optional
import logging
import base64
from minio import Minio
from minio.error import S3Error
from fastapi import HTTPException
from app.DataStorageRetrieval.minio_utils import get_client, MINIO_BUCKET, ensure_minio_bucket, upload_to_minio

logger = logging.getLogger(__name__)


def normalize_sheet_name(sheet_name: str) -> str:
    """
    Normalize sheet name for use in file paths.
    Removes spaces and special characters, keeps alphanumeric, underscores, and hyphens.
    
    Args:
        sheet_name: Original sheet name from Excel
        
    Returns:
        Normalized sheet name
    """
    # Replace spaces with underscores
    normalized = re.sub(r'\s+', '_', sheet_name)
    # Remove any characters that are not alphanumeric, underscore, or hyphen
    normalized = re.sub(r'[^a-zA-Z0-9_-]', '', normalized)
    if not normalized:
        normalized = 'Sheet'
    return normalized


def extract_all_sheets_from_excel(
    excel_content: bytes,
    upload_session_id: str,
    prefix: str
) -> Dict[str, Any]:
    """
    Extract all sheets from an Excel file and store each as a separate Parquet file in MinIO.
    Stores files in a folder structure: {prefix}uploads/{upload_session_id}/{filename}/sheets/
    
    Args:
        excel_content: Binary content of the Excel file
        upload_session_id: Unique session ID for this upload
        prefix: MinIO prefix (e.g., "client/app/project/")
        
    Returns:
        Dictionary with upload_session_id, folder_path, and list of sheet names
        
    Raises:
        ValueError: If file is corrupted or has no valid sheets
    """
    ensure_minio_bucket()
    minio_client = get_client()
    
    try:
        excel_bytes = io.BytesIO(excel_content)
        excel_file = pd.ExcelFile(excel_bytes)
        sheet_names = excel_file.sheet_names
        
        if not sheet_names:
            raise ValueError("Excel file contains no sheets")
        
        # Create folder structure: {prefix}uploads/{upload_session_id}/{filename}/
        # Extract filename without extension for folder name
        # For now, use upload_session_id as folder name (we'll get original filename from metadata)
        folder_name = upload_session_id
        folder_prefix = f"{prefix}uploads/{folder_name}/"
        
        # Store original Excel file in the folder
        original_path = f"{folder_prefix}original.xlsx"
        excel_bytes.seek(0)
        minio_client.put_object(
            MINIO_BUCKET,
            original_path,
            excel_bytes,
            length=len(excel_content),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        logger.info(f"Stored original Excel file: {original_path}")
        
        # Extract and store each sheet in the folder
        extracted_sheets = []
        for sheet_name in sheet_names:
            try:
                # Read sheet
                df_pandas = excel_file.parse(sheet_name)
                
                # Skip empty sheets
                if df_pandas.empty:
                    logger.warning(f"Skipping empty sheet: {sheet_name}")
                    continue
                
                # Convert to Polars and normalize column names
                df_pl = pl.from_pandas(df_pandas)
                df_pl = _normalize_column_names(df_pl)
                
                # Convert to Parquet format
                parquet_buffer = io.BytesIO()
                df_pl.write_parquet(parquet_buffer)
                parquet_bytes = parquet_buffer.getvalue()
                
                # Normalize sheet name for file path
                normalized_name = normalize_sheet_name(sheet_name)
                parquet_filename = f"{normalized_name}.parquet"
                parquet_path = f"{folder_prefix}sheets/{parquet_filename}"
                
                # Upload to MinIO
                parquet_buffer.seek(0)
                minio_client.put_object(
                    MINIO_BUCKET,
                    parquet_path,
                    parquet_buffer,
                    length=len(parquet_bytes),
                    content_type="application/octet-stream"
                )
                
                extracted_sheets.append({
                    "original_name": sheet_name,
                    "normalized_name": normalized_name,
                    "path": parquet_path,
                    "rows": df_pl.height,
                    "columns": df_pl.width
                })
                
                logger.info(
                    f"Extracted sheet '{sheet_name}' -> {parquet_path} "
                    f"({df_pl.height} rows, {df_pl.width} cols)"
                )
                
            except Exception as e:
                logger.error(f"Error extracting sheet '{sheet_name}': {e}")
                # Continue with other sheets even if one fails
                continue
        
        if not extracted_sheets:
            raise ValueError("No valid sheets could be extracted from the Excel file")
        
        return {
            "upload_session_id": upload_session_id,
            "folder_path": folder_prefix,
            "sheets": [s["original_name"] for s in extracted_sheets],
            "sheet_details": extracted_sheets,
            "original_file_path": original_path
        }
        
    except Exception as e:
        logger.error(f"Error extracting sheets from Excel file: {e}")
        raise ValueError(f"Failed to extract sheets from Excel file: {str(e)}") from e


def list_upload_folders(prefix: str) -> List[Dict[str, Any]]:
    """
    List all upload folders and their contents from MinIO.
    Returns folder structure with Excel files as folders and their sheets as files.
    
    Args:
        prefix: MinIO prefix (e.g., "client/app/project/")
        
    Returns:
        List of folder dictionaries with structure:
        {
            "folder_name": "uuid",
            "folder_path": "prefix/uploads/uuid/",
            "original_filename": "file.xlsx",
            "sheets": [
                {
                    "name": "Sheet1",
                    "path": "prefix/uploads/uuid/sheets/Sheet1.parquet",
                    "rows": 100,
                    "columns": 10
                }
            ]
        }
    """
    minio_client = get_client()
    uploads_prefix = f"{prefix}uploads/"
    
    try:
        # List all objects under uploads prefix
        objects = list(minio_client.list_objects(MINIO_BUCKET, prefix=uploads_prefix, recursive=True))
        
        # Group objects by folder (upload_session_id)
        folders: Dict[str, Dict[str, Any]] = {}
        
        for obj in objects:
            # Extract folder name from path: uploads/{folder_name}/...
            path_parts = obj.object_name.replace(uploads_prefix, "").split("/")
            if len(path_parts) < 2:
                continue
            
            folder_name = path_parts[0]
            
            # Initialize folder if not exists
            if folder_name not in folders:
                folders[folder_name] = {
                    "folder_name": folder_name,
                    "folder_path": f"{uploads_prefix}{folder_name}/",
                    "original_filename": None,
                    "sheets": []
                }
            
            # Check if it's the original Excel file
            if obj.object_name.endswith("original.xlsx"):
                # Try to extract original filename from metadata or use folder_name
                folders[folder_name]["original_filename"] = f"{folder_name}.xlsx"
            
            # Check if it's a sheet file (in sheets/ subfolder)
            if "/sheets/" in obj.object_name and obj.object_name.endswith(".parquet"):
                sheet_name = Path(obj.object_name).stem
                # Try to get original sheet name (we stored normalized, but can try to reverse)
                # For now, use normalized name
                folders[folder_name]["sheets"].append({
                    "name": sheet_name,
                    "normalized_name": sheet_name,
                    "path": obj.object_name,
                    "rows": 0,  # Will be populated if we have metadata
                    "columns": 0
                })
        
        return list(folders.values())
        
    except S3Error as e:
        logger.error(f"MinIO S3Error listing upload folders: {e}")
        return []
    except Exception as e:
        logger.exception(f"Error listing upload folders: {e}")
        return []


def get_sheet_data(upload_session_id: str, sheet_name: str, prefix: str, format: str = "json") -> Dict[str, Any]:
    """
    Retrieves a specific sheet's data from MinIO for a given upload session.
    
    Args:
        upload_session_id: The ID of the upload session (folder name).
        sheet_name: The normalized name of the sheet.
        prefix: The MinIO prefix for the current project.
        format: The desired output format ('json', 'csv', 'parquet_bytes').
        
    Returns:
        A dictionary containing sheet data.
        
    Raises:
        ValueError: If sheet not found or format is invalid.
    """
    minio_client = get_client()
    folder_prefix = f"{prefix}uploads/{upload_session_id}/"
    parquet_path = f"{folder_prefix}sheets/{sheet_name}.parquet"
    
    logger.info(
        "data_upload.get_sheet_data.start session_id=%s sheet=%s path=%s format=%s",
        upload_session_id,
        sheet_name,
        parquet_path,
        format,
    )
    
    try:
        # Check if sheet exists
        try:
            stat = minio_client.stat_object(MINIO_BUCKET, parquet_path)
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise ValueError(f"Sheet '{sheet_name}' not found in upload folder '{upload_session_id}'")
            raise
        
        # Read Parquet file from MinIO
        response = minio_client.get_object(MINIO_BUCKET, parquet_path)
        parquet_bytes = response.read()
        response.close()
        response.release_conn()
        
        # Load into Polars DataFrame
        df_pl = pl.read_parquet(io.BytesIO(parquet_bytes))
        
        # Convert to requested format
        if format == "json":
            # Convert to JSON records
            data = df_pl.to_dicts()
            return {
                "sheet_name": sheet_name,
                "normalized_name": sheet_name,
                "format": "json",
                "rows": df_pl.height,
                "columns": df_pl.width,
                "column_names": df_pl.columns,
                "data": data
            }
        elif format == "csv":
            # Convert to CSV string
            csv_string = df_pl.write_csv()
            return {
                "sheet_name": sheet_name,
                "normalized_name": sheet_name,
                "format": "csv",
                "rows": df_pl.height,
                "columns": df_pl.width,
                "column_names": df_pl.columns,
                "data": csv_string
            }
        elif format == "parquet_bytes":
            return {
                "sheet_name": sheet_name,
                "normalized_name": sheet_name,
                "format": "parquet_bytes",
                "rows": df_pl.height,
                "columns": df_pl.width,
                "column_names": df_pl.columns,
                "data": base64.b64encode(parquet_bytes).decode("utf-8") # Base64 encode bytes
            }
        else:
            raise ValueError(f"Unsupported format: {format}")
            
    except ValueError:
        raise # Re-raise ValueErrors (e.g., sheet not found)
    except S3Error as e:
        logger.error(
            "MinIO S3Error retrieving sheet '%s' from folder '%s': %s",
            sheet_name,
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"MinIO error: {e.message}")
    except Exception as e:
        logger.exception(
            "Error retrieving sheet '%s' from folder '%s': %s",
            sheet_name,
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


def list_upload_session_sheets(upload_session_id: str, prefix: str) -> List[str]:
    """
    Lists all sheet names (parquet files) for a given upload session ID.
    
    Args:
        upload_session_id: The ID of the upload session (folder name).
        prefix: The MinIO prefix for the current project.
        
    Returns:
        A list of normalized sheet names.
    """
    minio_client = get_client()
    folder_prefix = f"{prefix}uploads/{upload_session_id}/sheets/"
    
    logger.info(
        "data_upload.list_sheets.start session_id=%s prefix=%s",
        upload_session_id,
        folder_prefix,
    )
    
    sheet_names: List[str] = []
    try:
        objects = minio_client.list_objects(MINIO_BUCKET, prefix=folder_prefix, recursive=False)
        for obj in objects:
            if obj.object_name.endswith(".parquet"):
                # Extract sheet name from path
                sheet_name = Path(obj.object_name).stem
                sheet_names.append(sheet_name)
        logger.info(
            "data_upload.list_sheets.completed session_id=%s sheets=%s",
            upload_session_id,
            sheet_names,
        )
        return sheet_names
    except S3Error as e:
        logger.error(
            "MinIO S3Error listing sheets for session '%s': %s",
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"MinIO error: {e.message}")
    except Exception as e:
        logger.exception(
            "Error listing sheets for session '%s': %s",
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


def convert_session_sheet_to_arrow(upload_session_id: str, sheet_name: str, original_filename: str, prefix: str, use_folder_structure: bool = True) -> Dict[str, Any]:
    """
    Fetches a specific sheet (Parquet) from the upload folder,
    converts it to an Arrow file, and uploads the Arrow file to the main MinIO prefix.
    
    Args:
        upload_session_id: The ID of the upload session (folder name).
        sheet_name: The normalized name of the sheet.
        original_filename: The original name of the Excel file (e.g., "my_workbook.xlsx").
        prefix: The main MinIO prefix for the current project.
        use_folder_structure: If True, saves in folder structure {excel_filename}/sheets/{sheet_name}.arrow
        
    Returns:
        A dictionary containing the file_path of the newly created Arrow file.
    """
    minio_client = get_client()
    ensure_minio_bucket()
    
    folder_prefix = f"{prefix}uploads/{upload_session_id}/"
    session_parquet_path = f"{folder_prefix}sheets/{sheet_name}.parquet"
    
    logger.info(
        "data_upload.convert_sheet_to_arrow.start session_id=%s sheet=%s original_filename=%s use_folder_structure=%s",
        upload_session_id,
        sheet_name,
        original_filename,
        use_folder_structure,
    )
    
    try:
        # Read Parquet file from upload folder
        response = minio_client.get_object(MINIO_BUCKET, session_parquet_path)
        parquet_bytes = response.read()
        response.close()
        response.release_conn()
        
        df_pl = pl.read_parquet(io.BytesIO(parquet_bytes))
        
        # Create file path based on folder structure preference
        base_file_key = Path(original_filename).stem.replace(' ', '_').replace('.', '_')
        
        if use_folder_structure:
            # Create folder structure: {excel_filename}/sheets/{sheet_name}.arrow
            excel_folder_name = base_file_key
            arrow_file_key = f"{excel_folder_name}/sheets/{sheet_name}"
            arrow_object_name = f"{prefix}{arrow_file_key}.arrow"
        else:
            # Legacy flat structure: {excel_filename}_{sheet_name}.arrow
            arrow_file_key = f"{base_file_key}_{sheet_name}"
            arrow_object_name = f"{prefix}{arrow_file_key}.arrow"
        
        arrow_buffer = io.BytesIO()
        df_pl.write_ipc(arrow_buffer) # Use IPC for Arrow format
        arrow_bytes = arrow_buffer.getvalue()
        
        # Upload the Arrow file to the main prefix
        if use_folder_structure:
            # For folder structure, we need to upload directly to MinIO with the full path
            arrow_buffer.seek(0)
            minio_client.put_object(
                MINIO_BUCKET,
                arrow_object_name,
                arrow_buffer,
                length=len(arrow_bytes),
                content_type="application/octet-stream"
            )
            upload_result = {"status": "success", "object_name": arrow_object_name}
        else:
            # Use existing upload_to_minio helper for flat structure
            upload_result = upload_to_minio(arrow_bytes, f"{arrow_file_key}.arrow", prefix)
        
        if upload_result.get("status") == "success" or arrow_object_name:
            logger.info(
                "data_upload.convert_sheet_to_arrow.completed session_id=%s sheet=%s arrow_path=%s",
                upload_session_id,
                sheet_name,
                arrow_object_name,
            )
            # excel_folder_name is only defined when use_folder_structure is True
            result = {
                "file_path": arrow_object_name,
                "file_name": f"{original_filename} ({sheet_name})" if use_folder_structure else original_filename,
                "file_key": arrow_file_key,
            }
            if use_folder_structure:
                result["excel_folder_name"] = excel_folder_name
            return result
        else:
            error_msg = upload_result.get("error_message", "Failed to upload Arrow file")
            logger.error("Failed to upload converted Arrow file: %s", error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
            
    except S3Error as e:
        logger.error(
            "MinIO S3Error converting sheet '%s' from folder '%s': %s",
            sheet_name,
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"MinIO error: {e.message}")
    except Exception as e:
        logger.exception(
            "Error converting sheet '%s' from folder '%s': %s",
            sheet_name,
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


def _normalize_column_names(df: pl.DataFrame) -> pl.DataFrame:
    """Normalize column names: strip whitespace, handle duplicates."""
    columns = df.columns
    normalized = []
    seen = {}
    
    for col in columns:
        cleaned = str(col).strip()
        if cleaned in seen:
            seen[cleaned] += 1
            cleaned = f"{cleaned}_{seen[cleaned]}"
        else:
            seen[cleaned] = 0
        normalized.append(cleaned)
    
    return df.rename(dict(zip(columns, normalized)))
