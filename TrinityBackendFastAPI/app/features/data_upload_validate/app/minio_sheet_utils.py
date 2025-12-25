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

# Import fastexcel for Excel reading (same as CSV uses pl.read_csv)
try:
    import fastexcel
    FASTEXCEL_AVAILABLE = True
except ImportError:
    FASTEXCEL_AVAILABLE = False
    logger.warning("fastexcel not available, Excel reading may fail")


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
    Extract all sheets from an Excel file and store each as a separate Arrow file in MinIO.
    Uses fastexcel (same approach as CSV uses pl.read_csv) to read Excel files directly to Polars.
    Saves directly to Arrow format (no Parquet intermediate step).
    Stores files in a folder structure: {prefix}uploads/{upload_session_id}/sheets/
    
    Args:
        excel_content: Binary content of the Excel file
        upload_session_id: Unique session ID for this upload
        prefix: MinIO prefix (e.g., "client/app/project/")
        
    Returns:
        Dictionary with upload_session_id, folder_path, and list of sheet names
        
    Raises:
        ValueError: If file is corrupted or has no valid sheets
    """
    if not FASTEXCEL_AVAILABLE:
        raise ValueError("fastexcel is not available. Please install it to read Excel files.")
    
    ensure_minio_bucket()
    minio_client = get_client()
    
    try:
        # Read Excel file using fastexcel (same approach as CSV)
        try:
            reader = fastexcel.read_excel(excel_content)
        except Exception as read_error:
            logger.error(f"Failed to read Excel file with fastexcel: {read_error}", exc_info=True)
            raise ValueError(f"Failed to read Excel file. The file may be corrupted or in an unsupported format: {str(read_error)}")
        
        # Get sheet count by iterating through sheets until we get an error
        # fastexcel ExcelReader doesn't have sheet_count() method, so we iterate
        sheet_count = 0
        sheet_names_list = []
        max_sheets_to_check = 100  # Safety limit to prevent infinite loops
        
        while sheet_count < max_sheets_to_check:
            try:
                sheet = reader.load_sheet_by_idx(sheet_count)
                # Try to get sheet name
                try:
                    if hasattr(sheet, 'name'):
                        name_attr = getattr(sheet, 'name', None)
                        # Check if it's callable (method) or a property (attribute)
                        if callable(name_attr):
                            sheet_name = name_attr()
                        else:
                            sheet_name = name_attr if name_attr else f"Sheet{sheet_count + 1}"
                    else:
                        sheet_name = f"Sheet{sheet_count + 1}"
                except Exception as name_error:
                    logger.warning(f"Error getting sheet name for sheet {sheet_count}: {name_error}")
                    sheet_name = f"Sheet{sheet_count + 1}"
                sheet_names_list.append(sheet_name)
                sheet_count += 1
            except IndexError:
                # IndexError means we've reached the end of sheets
                break
            except Exception as e:
                # For other exceptions, log and try to continue
                logger.warning(f"Error loading sheet {sheet_count}: {e}")
                # If it's the first sheet (index 0), this might be a real error
                if sheet_count == 0:
                    logger.error(f"Failed to load first sheet: {e}")
                    raise ValueError(f"Failed to read Excel file: {str(e)}")
                break
        
        # If 0 or 1 sheet, this should be uploaded as normal xlsx file, not multi-sheet
        if sheet_count == 0:
            raise ValueError("SINGLE_SHEET_OR_EMPTY:Excel file contains no sheets")
        elif sheet_count == 1:
            raise ValueError("SINGLE_SHEET_OR_EMPTY:Excel file has only one sheet - upload as normal xlsx file")
        
        logger.info(f"Found {sheet_count} sheets (session_id={upload_session_id})")
        
        # Create folder structure: {prefix}uploads/{upload_session_id}/
        folder_name = upload_session_id
        folder_prefix = f"{prefix}uploads/{folder_name}/"
        
        # Store original Excel file in the folder
        original_path = f"{folder_prefix}original.xlsx"
        excel_bytes_for_storage = io.BytesIO(excel_content)
        minio_client.put_object(
            MINIO_BUCKET,
            original_path,
            excel_bytes_for_storage,
            length=len(excel_content),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        logger.info(f"Stored original Excel file: {original_path}")
        
        # Import normalize function from data_upload_service (same as CSV uses)
        from app.features.data_upload_validate import service as data_upload_service
        
        # Extract and store each sheet directly as Arrow (same as CSV)
        extracted_sheets = []
        sheet_names = []
        
        for sheet_idx in range(sheet_count):
            try:
                logger.info(f"Processing sheet {sheet_idx + 1}/{sheet_count}")
                
                # Load sheet using fastexcel (same as CSV uses pl.read_csv)
                sheet = reader.load_sheet_by_idx(sheet_idx)
                df_pl = sheet.to_polars()
                
                # Get sheet name
                try:
                    if hasattr(sheet, 'name'):
                        name_attr = getattr(sheet, 'name', None)
                        # Check if it's callable (method) or a property (attribute)
                        if callable(name_attr):
                            sheet_name = name_attr()
                        else:
                            sheet_name = name_attr if name_attr else f"Sheet{sheet_idx + 1}"
                    else:
                        sheet_name = f"Sheet{sheet_idx + 1}"
                except Exception as name_error:
                    logger.warning(f"Error getting sheet name for sheet {sheet_idx}: {name_error}")
                    sheet_name = f"Sheet{sheet_idx + 1}"
                sheet_names.append(sheet_name)
                
                # Check if empty
                if df_pl.height == 0:
                    logger.warning(f"Skipping empty sheet (0 rows): {sheet_name}")
                    continue
                
                # Normalize column names (same as CSV does)
                df_pl = data_upload_service._normalize_column_names(df_pl)
                
                # Log column names to verify they're preserved
                logger.info(f"Sheet '{sheet_name}' column names (first 10): {df_pl.columns[:10]}")
                
                # Verify column names are not numeric
                if df_pl.columns and all(str(col).strip().isdigit() for col in df_pl.columns[:5] if str(col).strip()):
                    logger.error(f"⚠️ CRITICAL: Sheet '{sheet_name}' has numeric column names: {df_pl.columns[:10]}")
                    raise ValueError(f"Sheet '{sheet_name}' has numeric column names instead of proper headers. "
                                   f"Found: {df_pl.columns[:10]}")
                
                # Convert directly to Arrow format (same as CSV does)
                arrow_buffer = io.BytesIO()
                df_pl.write_ipc(arrow_buffer)
                arrow_bytes = arrow_buffer.getvalue()
                
                # Verify Arrow file was written correctly
                verify_arrow = pl.read_ipc(io.BytesIO(arrow_bytes))
                verify_columns = verify_arrow.columns
                logger.info(f"Arrow file column names after write (verified, first 10): {verify_columns[:10]}")
                if verify_columns != df_pl.columns:
                    logger.error(f"⚠️ CRITICAL: Column names changed during Arrow write! "
                               f"Before: {df_pl.columns[:10]}, After: {verify_columns[:10]}")
                    raise ValueError(f"Column names were lost during Arrow write. "
                                   f"Expected: {df_pl.columns[:10]}, Got: {verify_columns[:10]}")
                
                # Normalize sheet name for file path
                normalized_name = normalize_sheet_name(sheet_name)
                arrow_filename = f"{normalized_name}.arrow"
                arrow_path = f"{folder_prefix}sheets/{arrow_filename}"
                
                # Upload Arrow file to MinIO (same as CSV does)
                arrow_buffer.seek(0)
                minio_client.put_object(
                    MINIO_BUCKET,
                    arrow_path,
                    arrow_buffer,
                    length=len(arrow_bytes),
                    content_type="application/octet-stream"
                )
                
                extracted_sheets.append({
                    "original_name": sheet_name,
                    "normalized_name": normalized_name,
                    "path": arrow_path,  # Now Arrow path, not Parquet
                    "rows": df_pl.height,
                    "columns": df_pl.width
                })
                
                logger.info(
                    f"Extracted sheet '{sheet_name}' -> {arrow_path} "
                    f"({df_pl.height} rows, {df_pl.width} cols)"
                )
                
            except Exception as e:
                logger.error(f"Error extracting sheet {sheet_idx}: {e}", exc_info=True)
                # Continue with other sheets even if one fails
                continue
        
        if not extracted_sheets:
            error_msg = f"No valid sheets could be extracted from the Excel file. "
            if sheet_count > 0:
                error_msg += f"Found {sheet_count} sheet(s), but all were either empty or failed to process."
            else:
                error_msg += "No sheets were found in the file."
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        return {
            "upload_session_id": upload_session_id,
            "folder_path": folder_prefix,
            "sheets": [s["original_name"] for s in extracted_sheets],
            "sheet_details": extracted_sheets,
            "original_file_path": original_path
        }
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Error extracting sheets from Excel file: {e}", exc_info=True)
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
                    "path": "prefix/uploads/uuid/sheets/Sheet1.arrow",
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
            
            # Check if it's a sheet file (in sheets/ subfolder) - now Arrow files
            if "/sheets/" in obj.object_name and obj.object_name.endswith(".arrow"):
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
    Now reads Arrow files directly (same as CSV files are saved).
    
    Args:
        upload_session_id: The ID of the upload session (folder name).
        sheet_name: The normalized name of the sheet.
        prefix: The MinIO prefix for the current project.
        format: The desired output format ('json', 'csv', 'arrow_bytes').
        
    Returns:
        A dictionary containing sheet data.
        
    Raises:
        ValueError: If sheet not found or format is invalid.
    """
    minio_client = get_client()
    folder_prefix = f"{prefix}uploads/{upload_session_id}/"
    arrow_path = f"{folder_prefix}sheets/{sheet_name}.arrow"
    
    logger.info(
        "data_upload.get_sheet_data.start session_id=%s sheet=%s path=%s format=%s",
        upload_session_id,
        sheet_name,
        arrow_path,
        format,
    )
    
    try:
        # Check if sheet exists
        try:
            stat = minio_client.stat_object(MINIO_BUCKET, arrow_path)
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise ValueError(f"Sheet '{sheet_name}' not found in upload folder '{upload_session_id}'")
            raise
        
        # Read Arrow file from MinIO (same as CSV files)
        response = minio_client.get_object(MINIO_BUCKET, arrow_path)
        arrow_bytes = response.read()
        response.close()
        response.release_conn()
        
        # Load into Polars DataFrame (same as CSV files)
        df_pl = pl.read_ipc(io.BytesIO(arrow_bytes))
        
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
        elif format == "arrow_bytes":
            return {
                "sheet_name": sheet_name,
                "normalized_name": sheet_name,
                "format": "arrow_bytes",
                "rows": df_pl.height,
                "columns": df_pl.width,
                "column_names": df_pl.columns,
                "data": base64.b64encode(arrow_bytes).decode("utf-8") # Base64 encode bytes
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
    Lists all sheet names (arrow files) for a given upload session ID.
    Now looks for Arrow files instead of Parquet (same as CSV files).
    
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
            if obj.object_name.endswith(".arrow"):
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


def convert_session_sheet_to_arrow(upload_session_id: str, sheet_name: str, original_filename: str, prefix: str, use_folder_structure: bool = True, sheet_index: Optional[int] = None) -> Dict[str, Any]:
    """
    Copies a specific sheet (Arrow file) from the upload folder to the main MinIO prefix.
    Since sheets are now saved directly as Arrow files (same as CSV), this just copies the file.
    
    Args:
        upload_session_id: The ID of the upload session (folder name).
        sheet_name: The normalized name of the sheet.
        original_filename: The original name of the Excel file (e.g., "my_workbook.xlsx").
        prefix: The main MinIO prefix for the current project.
        use_folder_structure: If True, saves in folder structure {excel_filename}/sheets/{sheet_name}.arrow
        sheet_index: Optional 1-based index of the sheet (not used anymore, kept for compatibility).
        
    Returns:
        A dictionary containing the file_path of the Arrow file in the main prefix.
    """
    minio_client = get_client()
    ensure_minio_bucket()
    
    folder_prefix = f"{prefix}uploads/{upload_session_id}/"
    session_arrow_path = f"{folder_prefix}sheets/{sheet_name}.arrow"
    
    logger.info(
        "data_upload.convert_sheet_to_arrow.start session_id=%s sheet=%s original_filename=%s use_folder_structure=%s",
        upload_session_id,
        sheet_name,
        original_filename,
        use_folder_structure,
    )
    
    try:
        # Read Arrow file from upload folder (already in Arrow format, no conversion needed)
        # First try the uploads folder (multi-sheet case)
        try:
            response = minio_client.get_object(MINIO_BUCKET, session_arrow_path)
            arrow_bytes = response.read()
            response.close()
            response.release_conn()
        except S3Error as e:
            if e.code == "NoSuchKey":
                # File not found in uploads folder - might be a single-sheet upload saved to tmp folder
                # Check tmp folder for the file
                tmp_prefix = f"{prefix}tmp/"
                tmp_arrow_path = f"{tmp_prefix}{Path(original_filename).stem}.arrow"
                
                logger.info(
                    "data_upload.convert_sheet_to_arrow.fallback_checking_tmp session_id=%s tmp_path=%s",
                    upload_session_id,
                    tmp_arrow_path,
                )
                
                try:
                    response = minio_client.get_object(MINIO_BUCKET, tmp_arrow_path)
                    arrow_bytes = response.read()
                    response.close()
                    response.release_conn()
                    logger.info(
                        "data_upload.convert_sheet_to_arrow.found_in_tmp session_id=%s tmp_path=%s",
                        upload_session_id,
                        tmp_arrow_path,
                    )
                except S3Error as tmp_error:
                    if tmp_error.code == "NoSuchKey":
                        # File not found in either location
                        raise HTTPException(
                            status_code=404,
                            detail=f"Sheet '{sheet_name}' not found in upload folder '{upload_session_id}' or tmp folder"
                        )
                    raise
            else:
                raise
        
        # Verify Arrow file has proper column names
        df_pl = pl.read_ipc(io.BytesIO(arrow_bytes))
        column_names = df_pl.columns
        logger.info(f"Arrow file column names (first 10): {column_names[:10]}")
        
        # Check if column names are numeric (0, 1, 2, 3...) - this indicates a problem
        if column_names and all(str(col).strip().isdigit() for col in column_names[:5] if str(col).strip()):
            logger.error(f"⚠️ CRITICAL: Arrow file has numeric column names: {column_names[:10]}")
            raise ValueError(f"Arrow file has numeric column names instead of proper headers. "
                           f"Column names: {column_names[:10]}")
        
        # Create file path based on folder structure preference
        base_file_key = Path(original_filename).stem.replace(' ', '_').replace('.', '_')
        
        if use_folder_structure:
            # Create folder structure: {excel_filename}/sheets/{sheet_name}.arrow
            excel_folder_name = base_file_key
            arrow_file_key = f"{excel_folder_name}/sheets/{sheet_name}"
            arrow_object_name = f"{prefix}{arrow_file_key}.arrow"
        else:
            # Flat structure: use the actual sheet name (normalized)
            arrow_file_key = f"{base_file_key}_{sheet_name}"
            arrow_object_name = f"{prefix}{arrow_file_key}.arrow"
        
        # Upload the Arrow file to the main prefix (just copy, no conversion needed)
        if use_folder_structure:
            minio_client.put_object(
                MINIO_BUCKET,
                arrow_object_name,
                io.BytesIO(arrow_bytes),
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
            # Determine display file name
            if use_folder_structure:
                display_file_name = f"{original_filename} ({sheet_name})"
            else:
                base_name = Path(original_filename).stem
                display_file_name = f"{base_name}_{sheet_name}"
            
            result = {
                "file_path": arrow_object_name,
                "file_name": display_file_name,
                "file_key": arrow_file_key,
            }
            if use_folder_structure:
                result["excel_folder_name"] = excel_folder_name
            return result
        else:
            error_msg = upload_result.get("error_message", "Failed to upload Arrow file")
            logger.error("Failed to upload Arrow file: %s", error_msg)
            raise HTTPException(status_code=500, detail=error_msg)
            
    except S3Error as e:
        if e.code == "NoSuchKey":
            raise HTTPException(status_code=404, detail=f"Sheet '{sheet_name}' not found in upload folder '{upload_session_id}'")
        logger.error(
            "MinIO S3Error copying sheet '%s' from folder '%s': %s",
            sheet_name,
            upload_session_id,
            str(e),
        )
        raise HTTPException(status_code=500, detail=f"MinIO error: {e.message}")
    except Exception as e:
        logger.exception(
            "Error copying sheet '%s' from folder '%s': %s",
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
