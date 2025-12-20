"""
Service layer for Table atom - handles business logic and data processing.
"""
import polars as pl
import io
import os
import uuid
import logging
import asyncio
from datetime import datetime
from typing import Dict, Optional, List, Any, Tuple
from minio import Minio
from minio.error import S3Error
from motor.motor_asyncio import AsyncIOMotorClient

from app.DataStorageRetrieval.arrow_client import download_table_bytes
from app.core.mongo import build_host_mongo_uri

logger = logging.getLogger(__name__)

# In-memory session storage for active DataFrames
SESSIONS: Dict[str, pl.DataFrame] = {}

# MinIO client configuration
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

# MongoDB configuration
MONGO_URI = os.getenv("MONGO_URI", build_host_mongo_uri())
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")

# Draft save queue for debounced saves
_draft_save_queue: Dict[str, asyncio.Task] = {}


def load_table_from_minio(object_name: str) -> Tuple[pl.DataFrame, Optional[Dict[str, Dict[str, Dict[str, str]]]], Optional[Dict[str, Any]]]:
    """
    Load a DataFrame from MinIO using Arrow format and extract conditional formatting styles and table metadata.
    
    Args:
        object_name: Full path to the object in MinIO
        
    Returns:
        Tuple of (Polars DataFrame, conditional_format_styles, table_metadata)
        - conditional_format_styles: Style map or None if not present
        - table_metadata: Table metadata (formatting, design, layout) or None if not present
        
    Raises:
        Exception: If file cannot be loaded
    """
    logger.info(f"🔍 [TABLE] Loading table from MinIO: {object_name}")
    
    try:
        # Download Arrow file from MinIO
        data = download_table_bytes(object_name)
        logger.info(f"✅ [TABLE] Downloaded {len(data)} bytes")
        
        # Parse Arrow IPC format using PyArrow to access metadata
        import pyarrow as pa
        import pyarrow.ipc as ipc
        import json
        
        arrow_file = ipc.open_file(io.BytesIO(data))
        table = arrow_file.read_all()
        
        # Extract conditional formatting styles from metadata
        conditional_format_styles = None
        table_metadata = None
        metadata = table.schema.metadata
        if metadata:
            # Extract conditional formatting styles
            if b'conditional_formatting' in metadata:
                try:
                    styles_json = metadata[b'conditional_formatting'].decode('utf-8')
                    conditional_format_styles = json.loads(styles_json)
                    logger.info(f"🎨 [TABLE] Loaded conditional formatting styles for {len(conditional_format_styles)} rows")
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    logger.warning(f"⚠️ [TABLE] Failed to parse conditional formatting metadata: {e}")
            
            # Extract table metadata (formatting, design, layout)
            if b'table_metadata' in metadata:
                try:
                    metadata_json = metadata[b'table_metadata'].decode('utf-8')
                    table_metadata = json.loads(metadata_json)
                    logger.info(f"📋 [TABLE] Loaded table metadata (formatting, design, layout)")
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    logger.warning(f"⚠️ [TABLE] Failed to parse table metadata: {e}")
        
        # Convert to Polars DataFrame
        df = pl.from_arrow(table)
        logger.info(f"✅ [TABLE] Loaded DataFrame: {df.shape[0]} rows, {df.shape[1]} columns")
        logger.info(f"📋 [TABLE] Columns: {df.columns}")
        
        return df, conditional_format_styles, table_metadata
        
    except Exception as e:
        logger.error(f"❌ [TABLE] Failed to load table: {e}")
        raise Exception(f"Failed to load table from {object_name}: {str(e)}")


def apply_table_settings(df: pl.DataFrame, settings: Dict[str, Any]) -> pl.DataFrame:
    """
    Apply table settings (filtering, sorting, column selection) to DataFrame.
    
    Args:
        df: Input DataFrame
        settings: Dictionary containing table settings
        
    Returns:
        Processed DataFrame with __original_row_index__ column added
    """
    logger.info(f"🔧 [TABLE] Applying settings to DataFrame")
    
    # CRITICAL FIX: Add original row index BEFORE filtering
    # This allows frontend to map visible rows to actual rows in the full dataset
    df = df.with_row_count("__original_row_index__")
    
    # Apply filters
    filters = settings.get("filters", {})
    if filters:
        for column, filter_value in filters.items():
            if column not in df.columns or not filter_value:
                continue
                
            logger.info(f"🔍 [TABLE] Filtering {column} with value: {filter_value}")
            
            # Handle different filter value types
            if isinstance(filter_value, list) and len(filter_value) > 0:
                # Check if it's a number range [min, max] or string array
                if len(filter_value) == 2 and isinstance(filter_value[0], (int, float)) and isinstance(filter_value[1], (int, float)):
                    # Number range filter
                    min_val = filter_value[0]
                    max_val = filter_value[1]
                    
                    # Handle Infinity values
                    if min_val == float('-inf') or min_val == float('inf') or str(min_val) == '-Infinity':
                        min_val = None
                    if max_val == float('inf') or str(max_val) == 'Infinity':
                        max_val = None
                    
                    if min_val is not None and max_val is not None:
                        df = df.filter((pl.col(column) >= min_val) & (pl.col(column) <= max_val))
                    elif min_val is not None:
                        df = df.filter(pl.col(column) >= min_val)
                    elif max_val is not None:
                        df = df.filter(pl.col(column) <= max_val)
                    # If both are None, don't filter (show all)
                else:
                    # Multi-select filter (could be numeric or string values)
                    # Check if all values are numeric (except for "(blank)")
                    non_blank_values = [v for v in filter_value if v != '(blank)']
                    all_numeric = all(isinstance(v, (int, float)) for v in non_blank_values)
                    
                    # Handle "(blank)" special case
                    if '(blank)' in filter_value:
                        # Filter for blank values OR selected values
                        blank_filter = (pl.col(column).is_null()) | (pl.col(column) == '') | (pl.col(column).cast(pl.Utf8).str.strip_chars() == '')
                        
                        if non_blank_values:
                            # Convert numeric values to appropriate type for the column if needed
                            if all_numeric:
                                # For numeric columns, use numeric values directly
                                value_filter = pl.col(column).is_in(non_blank_values)
                            else:
                                # For string columns, convert to string
                                value_filter = pl.col(column).is_in([str(v) for v in non_blank_values])
                            df = df.filter(blank_filter | value_filter)
                        else:
                            # Only blank values selected
                            df = df.filter(blank_filter)
                    else:
                        # Regular multi-select filter (no blanks)
                        if all_numeric:
                            # Numeric multi-select filter
                            df = df.filter(pl.col(column).is_in(filter_value))
                        else:
                            # String multi-select filter
                            df = df.filter(pl.col(column).is_in([str(v) for v in filter_value]))
            elif isinstance(filter_value, dict) and 'min' in filter_value and 'max' in filter_value:
                # Range filter object
                min_val = filter_value.get('min')
                max_val = filter_value.get('max')
                if min_val is not None and max_val is not None:
                    df = df.filter((pl.col(column) >= min_val) & (pl.col(column) <= max_val))
                elif min_val is not None:
                    df = df.filter(pl.col(column) >= min_val)
                elif max_val is not None:
                    df = df.filter(pl.col(column) <= max_val)
            else:
                # Simple equality filter (backward compatibility)
                df = df.filter(pl.col(column) == filter_value)
    
    # Apply sorting
    sort_config = settings.get("sort_config", [])
    if sort_config:
        for sort_item in sort_config:
            column = sort_item.get("column")
            direction = sort_item.get("direction", "asc")
            if column in df.columns:
                logger.info(f"📊 [TABLE] Sorting by {column} ({direction})")
                descending = direction == "desc"
                df = df.sort(column, descending=descending)
    
    # Select visible columns (but keep __original_row_index__)
    visible_columns = settings.get("visible_columns")
    if visible_columns:
        # Ensure all visible columns exist, plus keep __original_row_index__
        valid_columns = [col for col in visible_columns if col in df.columns]
        if valid_columns:
            logger.info(f"👁️ [TABLE] Selecting visible columns: {valid_columns}")
            # Keep __original_row_index__ even if not in visible_columns
            columns_to_select = ["__original_row_index__"] + valid_columns
            df = df.select(columns_to_select)
    
    # Reorder columns if specified (but keep __original_row_index__)
    column_order = settings.get("column_order")
    if column_order:
        # Filter to only existing columns
        valid_order = [col for col in column_order if col in df.columns]
        if valid_order and len(valid_order) == len([c for c in df.columns if c != "__original_row_index__"]):
            logger.info(f"🔄 [TABLE] Reordering columns")
            # Keep __original_row_index__ first, then reordered columns
            columns_to_select = ["__original_row_index__"] + valid_order
            df = df.select(columns_to_select)
    
    logger.info(f"✅ [TABLE] Settings applied: {df.shape[0]} rows, {df.shape[1]} columns")
    return df


def save_table_to_minio(
    df: pl.DataFrame, 
    object_name: str,
    conditional_format_styles: Optional[Dict[str, Dict[str, Dict[str, str]]]] = None,
    table_metadata: Optional[Dict[str, Any]] = None
) -> str:
    """
    Save a DataFrame to MinIO in Arrow format with optional conditional formatting styles and table metadata.
    
    Args:
        df: DataFrame to save
        object_name: Full path where to save in MinIO
        conditional_format_styles: Optional style map to store in Arrow metadata
        table_metadata: Optional table metadata (formatting, design, layout) to store in Arrow metadata
        
    Returns:
        Object name of saved file
        
    Raises:
        Exception: If save fails
    """
    logger.info(f"💾 [TABLE] Saving table to MinIO: {object_name}")
    logger.info(f"📊 [TABLE] DataFrame shape: {df.shape}")
    
    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
        import json
        
        # Convert Polars DataFrame to PyArrow Table
        table = df.to_arrow()
        
        # Get existing metadata (if any)
        metadata = table.schema.metadata or {}
        
        # Add conditional formatting styles to metadata if provided
        if conditional_format_styles:
            try:
                # Convert styles dict to JSON string
                styles_json = json.dumps(conditional_format_styles)
                metadata[b'conditional_formatting'] = styles_json.encode('utf-8')
                logger.info(f"🎨 [TABLE] Added conditional formatting styles to metadata ({len(styles_json)} bytes)")
                logger.info(f"🎨 [TABLE] Formatting applied to {len(conditional_format_styles)} rows")
            except Exception as e:
                logger.warning(f"⚠️ [TABLE] Failed to add conditional formatting metadata: {e}")
        
        # Add table metadata (formatting, design, layout) if provided
        if table_metadata:
            try:
                # Convert metadata dict to JSON string
                metadata_json = json.dumps(table_metadata)
                metadata[b'table_metadata'] = metadata_json.encode('utf-8')
                logger.info(f"📋 [TABLE] Added table metadata to Arrow file ({len(metadata_json)} bytes)")
            except Exception as e:
                logger.warning(f"⚠️ [TABLE] Failed to add table metadata: {e}")
        
        # Recreate table with updated metadata
        if metadata:
            table = table.replace_schema_metadata(metadata)
        
        # Write Arrow file with metadata
        buffer = pa.BufferOutputStream()
        with ipc.new_file(buffer, table.schema) as writer:
            writer.write_table(table)
        arrow_bytes = buffer.getvalue().to_pybytes()
        
        logger.info(f"📦 [TABLE] Arrow buffer size: {len(arrow_bytes)} bytes")
        
        # Upload to MinIO
        minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream"
        )
        
        logger.info(f"✅ [TABLE] Successfully saved to: {object_name}")
        return object_name
        
    except Exception as e:
        logger.error(f"❌ [TABLE] Failed to save table: {e}")
        raise Exception(f"Failed to save table to {object_name}: {str(e)}")


def get_column_types(df: pl.DataFrame) -> Dict[str, str]:
    """
    Get column data types as string representations.
    
    Args:
        df: Input DataFrame
        
    Returns:
        Dictionary mapping column names to type strings
    """
    column_types = {}
    for col in df.columns:
        dtype = df[col].dtype
        
        # Map Polars types to simple strings
        if dtype in [pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64]:
            column_types[col] = "integer"
        elif dtype in [pl.Float32, pl.Float64]:
            column_types[col] = "float"
        elif dtype == pl.Boolean:
            column_types[col] = "boolean"
        elif dtype == pl.Date:
            column_types[col] = "date"
        elif dtype == pl.Datetime:
            column_types[col] = "datetime"
        else:
            column_types[col] = "string"
    
    return column_types


def dataframe_to_response(df: pl.DataFrame, table_id: str, 
                         object_name: Optional[str] = None,
                         settings: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Convert DataFrame to API response format.
    
    Args:
        df: DataFrame to convert
        table_id: Session ID for this table
        object_name: Optional MinIO object reference
        settings: Optional table settings
        
    Returns:
        Dictionary in TableResponse format
    """
    # Return all rows - frontend handles pagination (15 rows per page)
    # This ensures filter components have access to all unique values from entire dataset
    
    # CRITICAL FIX: Exclude __original_row_index__ from columns list (but keep it in rows for frontend mapping)
    columns = [col for col in df.columns if col != "__original_row_index__"]
    
    response = {
        "table_id": table_id,
        "columns": columns,  # Exclude __original_row_index__ from visible columns
        "rows": df.to_dicts(),  # Return all rows with __original_row_index__ included for mapping
        "row_count": len(df),
        "column_types": get_column_types(df.select(columns))  # Only get types for visible columns
    }
    
    if object_name:
        response["object_name"] = object_name
    
    if settings:
        response["settings"] = settings
    
    return response


def compute_aggregations(df: pl.DataFrame, agg_config: Dict[str, List[str]]) -> Dict[str, Dict[str, Any]]:
    """
    Compute aggregations for specified columns.
    
    Args:
        df: Input DataFrame
        agg_config: Dictionary mapping column names to list of aggregation functions
                   e.g., {"Sales": ["sum", "avg", "min", "max"], "Count": ["sum"]}
        
    Returns:
        Dictionary with aggregation results
    """
    logger.info(f"📊 [TABLE] Computing aggregations: {agg_config}")
    
    results = {}
    
    for column, agg_functions in agg_config.items():
        if column not in df.columns:
            logger.warning(f"⚠️ [TABLE] Column {column} not found, skipping")
            continue
        
        col_results = {}
        series = df[column]
        
        for agg_func in agg_functions:
            try:
                if agg_func == "sum":
                    col_results["sum"] = float(series.sum()) if series.sum() is not None else None
                elif agg_func == "avg" or agg_func == "mean":
                    col_results["avg"] = float(series.mean()) if series.mean() is not None else None
                elif agg_func == "min":
                    col_results["min"] = float(series.min()) if series.min() is not None else None
                elif agg_func == "max":
                    col_results["max"] = float(series.max()) if series.max() is not None else None
                elif agg_func == "count":
                    col_results["count"] = int(series.count())
                elif agg_func == "median":
                    col_results["median"] = float(series.median()) if series.median() is not None else None
                elif agg_func == "std":
                    col_results["std"] = float(series.std()) if series.std() is not None else None
            except Exception as e:
                logger.warning(f"⚠️ [TABLE] Failed to compute {agg_func} for {column}: {e}")
                col_results[agg_func] = None
        
        results[column] = col_results
    
    logger.info(f"✅ [TABLE] Aggregations computed: {results}")
    return results


# ============================================================================
# Conditional Formatting Functions
# ============================================================================

def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color (#RRGGBB) to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB tuple to hex color"""
    return f"#{r:02X}{g:02X}{b:02X}"


def interpolate_color(color1: str, color2: str, factor: float) -> str:
    """
    Interpolate between two hex colors.
    
    Args:
        color1: Start color (hex)
        color2: End color (hex)
        factor: Interpolation factor (0.0 to 1.0)
        
    Returns:
        Interpolated hex color
    """
    factor = max(0.0, min(1.0, factor))  # Clamp to [0, 1]
    rgb1 = hex_to_rgb(color1)
    rgb2 = hex_to_rgb(color2)
    
    r = int(rgb1[0] + (rgb2[0] - rgb1[0]) * factor)
    g = int(rgb1[1] + (rgb2[1] - rgb1[1]) * factor)
    b = int(rgb1[2] + (rgb2[2] - rgb1[2]) * factor)
    
    return rgb_to_hex(r, g, b)


def evaluate_highlight_rule(df: pl.DataFrame, rule: Any) -> List[int]:
    """
    Evaluate a highlight rule and return matching row indices.
    
    Args:
        df: DataFrame to evaluate
        rule: Highlight rule (from schemas.HighlightRule)
        
    Returns:
        List of row indices (0-based) that match the rule
    """
    from .schemas import HighlightRule, Operator
    
    if rule.column not in df.columns:
        logger.warning(f"⚠️ [CF] Column '{rule.column}' not found, skipping rule {rule.id}")
        return []
    
    if not rule.enabled:
        return []
    
    try:
        col = pl.col(rule.column)
        
        if rule.operator == Operator.GREATER_THAN:
            mask = col > rule.value1
        elif rule.operator == Operator.LESS_THAN:
            mask = col < rule.value1
        elif rule.operator == Operator.EQUAL:
            mask = col == rule.value1
        elif rule.operator == Operator.NOT_EQUAL:
            mask = col != rule.value1
        elif rule.operator == Operator.CONTAINS:
            mask = col.cast(pl.Utf8).str.contains(str(rule.value1), literal=True)
        elif rule.operator == Operator.STARTS_WITH:
            mask = col.cast(pl.Utf8).str.starts_with(str(rule.value1))
        elif rule.operator == Operator.ENDS_WITH:
            mask = col.cast(pl.Utf8).str.ends_with(str(rule.value1))
        elif rule.operator == Operator.BETWEEN:
            mask = (col >= rule.value1) & (col <= rule.value2)
        elif rule.operator == Operator.TOP_N:
            # Get top N values
            top_values = df.select(col).sort(descending=True).head(rule.value1).to_series()
            mask = col.is_in(top_values)
        elif rule.operator == Operator.BOTTOM_N:
            # Get bottom N values
            bottom_values = df.select(col).sort(descending=False).head(rule.value1).to_series()
            mask = col.is_in(bottom_values)
        elif rule.operator == Operator.ABOVE_AVERAGE:
            avg = df.select(col.mean()).item()
            mask = col > avg
        elif rule.operator == Operator.BELOW_AVERAGE:
            avg = df.select(col.mean()).item()
            mask = col < avg
        else:
            logger.warning(f"⚠️ [CF] Unsupported operator: {rule.operator}")
            return []
        
        # Get row indices where mask is True
        result_df = df.with_row_count("__row_idx__").filter(mask)
        row_indices = result_df["__row_idx__"].to_list()
        
        return row_indices
        
    except Exception as e:
        logger.error(f"❌ [CF] Error evaluating highlight rule {rule.id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return []


def evaluate_color_scale(df: pl.DataFrame, rule: Any) -> Dict[int, str]:
    """
    Evaluate a color scale rule and return color for each row.
    
    Args:
        df: DataFrame to evaluate
        rule: Color scale rule (from schemas.ColorScaleRule)
        
    Returns:
        Dictionary mapping row indices to hex colors
    """
    from .schemas import ColorScaleRule
    
    if rule.column not in df.columns:
        logger.warning(f"⚠️ [CF] Column '{rule.column}' not found, skipping rule {rule.id}")
        return {}
    
    if not rule.enabled:
        return {}
    
    try:
        col = df[rule.column]
        
        # Filter out nulls for min/max calculation
        numeric_values = col.drop_nulls()
        if len(numeric_values) == 0:
            return {}
        
        min_val = numeric_values.min()
        max_val = numeric_values.max()
        
        # Handle edge case: all values are the same
        if min_val == max_val:
            return {i: rule.min_color for i in range(len(df))}
        
        # Calculate normalized values (0.0 to 1.0)
        range_val = max_val - min_val
        
        # Add row indices and calculate colors
        df_with_idx = df.with_row_count("__row_idx__")
        result = {}
        
        for row in df_with_idx.iter_rows(named=True):
            row_idx = row["__row_idx__"]
            value = row[rule.column]
            
            if value is None:
                continue
            
            # Normalize value
            normalized = (value - min_val) / range_val
            normalized = max(0.0, min(1.0, normalized))  # Clamp
            
            # Interpolate color
            if rule.mid_color:
                # 3-color scale: 0-0.5 = min->mid, 0.5-1 = mid->max
                if normalized < 0.5:
                    factor = normalized * 2  # Scale to [0, 1]
                    color = interpolate_color(rule.min_color, rule.mid_color, factor)
                else:
                    factor = (normalized - 0.5) * 2  # Scale to [0, 1]
                    color = interpolate_color(rule.mid_color, rule.max_color, factor)
            else:
                # 2-color scale
                color = interpolate_color(rule.min_color, rule.max_color, normalized)
            
            result[row_idx] = color
        
        return result
        
    except Exception as e:
        logger.error(f"❌ [CF] Error evaluating color scale rule {rule.id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {}


def evaluate_conditional_formatting(
    df: pl.DataFrame, 
    rules: List[Any]
) -> Dict[str, Dict[str, Dict[str, str]]]:
    """
    Evaluate all conditional formatting rules and return sparse style map.
    
    Args:
        df: DataFrame to evaluate
        rules: List of conditional format rules
        
    Returns:
        Sparse style map: {
            "row_5": {
                "Sales": {
                    "backgroundColor": "#FF0000",
                    "textColor": "#FFFFFF"
                }
            }
        }
    """
    import time
    start_time = time.time()
    
    logger.info(f"🎨 [CF] Evaluating {len(rules)} rules on {len(df)} rows")
    
    # Sort rules by priority (lower number = higher priority)
    sorted_rules = sorted(
        [r for r in rules if r.enabled],
        key=lambda x: x.priority
    )
    
    # Initialize result structure
    # Use sets to track which cells have been formatted (for priority override)
    formatted_cells = set()  # (row_idx, column)
    result = {}  # { "row_5": { "Sales": { "backgroundColor": "#FF0000" } } }
    
    # Evaluate each rule in priority order
    for rule in sorted_rules:
        if rule.type == "highlight":
            from .schemas import HighlightRule
            row_indices = evaluate_highlight_rule(df, rule)
            
            # Apply styles to matching cells
            for row_idx in row_indices:
                cell_key = (row_idx, rule.column)
                
                # Check if this cell already has formatting (higher priority rule applied)
                if cell_key in formatted_cells:
                    continue  # Skip - higher priority rule already formatted this cell
                
                # Add to result
                row_key = f"row_{row_idx}"
                if row_key not in result:
                    result[row_key] = {}
                if rule.column not in result[row_key]:
                    result[row_key][rule.column] = {}
                
                # Apply style
                if rule.style.backgroundColor:
                    result[row_key][rule.column]["backgroundColor"] = rule.style.backgroundColor
                if rule.style.textColor:
                    result[row_key][rule.column]["textColor"] = rule.style.textColor
                if rule.style.fontWeight:
                    result[row_key][rule.column]["fontWeight"] = rule.style.fontWeight
                if rule.style.fontSize:
                    result[row_key][rule.column]["fontSize"] = str(rule.style.fontSize)
                
                formatted_cells.add(cell_key)
                
        elif rule.type == "color_scale":
            from .schemas import ColorScaleRule
            row_colors = evaluate_color_scale(df, rule)
            
            # Apply colors to cells
            for row_idx, color in row_colors.items():
                cell_key = (row_idx, rule.column)
                
                # Color scales have lower priority than highlights (unless same priority)
                # But we still apply if not already formatted
                if cell_key in formatted_cells:
                    continue
                
                row_key = f"row_{row_idx}"
                if row_key not in result:
                    result[row_key] = {}
                if rule.column not in result[row_key]:
                    result[row_key][rule.column] = {}
                
                result[row_key][rule.column]["backgroundColor"] = color
                formatted_cells.add(cell_key)
                
        # TODO: Add data_bar and icon_set evaluation in future phases
        # elif rule.type == "data_bar":
        #     ...
        # elif rule.type == "icon_set":
        #     ...
    
    elapsed_time = (time.time() - start_time) * 1000  # milliseconds
    logger.info(f"✅ [CF] Evaluated {len(sorted_rules)} rules in {elapsed_time:.2f}ms")
    logger.info(f"📊 [CF] Formatting applied to {len(formatted_cells)} cells")
    
    return result


# ============================================================================
# MongoDB Session Storage Functions
# ============================================================================

async def save_session_metadata(
    table_id: str,
    atom_id: str,
    project_id: str,
    object_name: str,
    has_unsaved_changes: bool = False,
    draft_object_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    table_metadata: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Save session metadata to MongoDB.
    
    Args:
        table_id: Session ID
        atom_id: Atom ID
        project_id: Project ID
        object_name: Original file path in MinIO
        has_unsaved_changes: Whether there are unsaved changes
        draft_object_name: Path to draft file in MinIO (if exists)
        metadata: Additional metadata (row_count, column_count, size_bytes)
        table_metadata: Table metadata (formatting, design, layout settings)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_sessions"]
        
        update_doc = {
            "atom_id": atom_id,
            "project_id": project_id,
            "object_name": object_name,
            "has_unsaved_changes": has_unsaved_changes,
            "last_modified": datetime.utcnow(),
            "last_accessed": datetime.utcnow(),
        }
        
        if draft_object_name:
            update_doc["draft_object_name"] = draft_object_name
        
        if metadata:
            update_doc["metadata"] = metadata
        
        if table_metadata:
            update_doc["table_metadata"] = table_metadata
        
        await coll.update_one(
            {"_id": table_id},
            {
                "$set": update_doc,
                "$setOnInsert": {
                    "created_at": datetime.utcnow(),
                }
            },
            upsert=True
        )
        
        logger.info(f"💾 [SESSION] Saved metadata for session {table_id}")
        if table_metadata:
            logger.info(f"📋 [SESSION] Saved table metadata (formatting, design, layout)")
        await client.close()
        return True
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to save metadata for {table_id}: {e}")
        return False


async def get_session_metadata(table_id: str) -> Optional[Dict[str, Any]]:
    """
    Get session metadata from MongoDB.
    
    Args:
        table_id: Session ID
        
    Returns:
        Session metadata dict or None if not found
        Includes table_metadata field if present
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_sessions"]
        
        doc = await coll.find_one({"_id": table_id})
        await client.close()
        
        if doc:
            # Convert ObjectId to string and datetime to ISO format
            result = {
                "table_id": str(doc.get("_id", table_id)),
                "atom_id": doc.get("atom_id"),
                "project_id": doc.get("project_id"),
                "object_name": doc.get("object_name"),
                "draft_object_name": doc.get("draft_object_name"),
                "has_unsaved_changes": doc.get("has_unsaved_changes", False),
                "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                "last_modified": doc.get("last_modified").isoformat() if doc.get("last_modified") else None,
                "last_accessed": doc.get("last_accessed").isoformat() if doc.get("last_accessed") else None,
                "metadata": doc.get("metadata", {}),
                "table_metadata": doc.get("table_metadata"),  # Table metadata (formatting, design, layout)
            }
            return result
        return None
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to get metadata for {table_id}: {e}")
        return None


async def update_session_access_time(table_id: str) -> bool:
    """Update last_accessed timestamp for a session."""
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_sessions"]
        
        await coll.update_one(
            {"_id": table_id},
            {"$set": {"last_accessed": datetime.utcnow()}}
        )
        
        await client.close()
        return True
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to update access time for {table_id}: {e}")
        return False


async def save_change_log(
    table_id: str,
    atom_id: str,
    change_type: str,
    change_data: Dict[str, Any]
) -> bool:
    """
    Save a change to MongoDB change log.
    
    Args:
        table_id: Session ID
        atom_id: Atom ID
        change_type: Type of change (cell_edit, filter, sort, etc.)
        change_data: Change-specific data
        
    Returns:
        True if successful, False otherwise
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_changes"]
        
        change_doc = {
            "table_id": table_id,
            "atom_id": atom_id,
            "change_type": change_type,
            "change_data": change_data,
            "timestamp": datetime.utcnow(),
            "applied": False
        }
        result = await coll.insert_one(change_doc)
        
        await client.close()
        logger.info(
            f"✅ [CHANGE] Logged {change_type} for session {table_id}, "
            f"atom_id={atom_id}, inserted_id={result.inserted_id}, "
            f"change_data={change_data}"
        )
        return True
    except Exception as e:
        logger.error(f"❌ [CHANGE] Failed to log change for {table_id}: {e}")
        return False


async def get_change_log(table_id: str, applied: Optional[bool] = None) -> List[Dict[str, Any]]:
    """
    Get change log for a session.
    
    Args:
        table_id: Session ID
        applied: Filter by applied status (None = all)
        
    Returns:
        List of change documents
    """
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_changes"]
        
        query = {"table_id": table_id}
        if applied is not None:
            query["applied"] = applied
        
        cursor = coll.find(query).sort("timestamp", 1)
        changes = await cursor.to_list(length=1000)  # Limit to 1000 changes
        
        await client.close()
        
        # Convert ObjectId and datetime
        result = []
        for change in changes:
            result.append({
                "change_id": str(change.get("_id")),
                "table_id": change.get("table_id"),
                "atom_id": change.get("atom_id"),
                "change_type": change.get("change_type"),
                "change_data": change.get("change_data"),
                "timestamp": change.get("timestamp").isoformat() if change.get("timestamp") else None,
                "applied": change.get("applied", False),
            })
        
        logger.info(
            f"🔍 [CHANGE] Retrieved {len(result)} changes for table_id='{table_id}', "
            f"applied={applied}, query={query}, "
            f"change_types={[c.get('change_type') for c in result]}"
        )
        
        return result
    except Exception as e:
        logger.error(f"❌ [CHANGE] Failed to get change log for {table_id}: {e}")
        return []


async def mark_changes_applied(table_id: str) -> bool:
    """Mark all changes for a session as applied (after save)."""
    try:
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_changes"]
        
        await coll.update_many(
            {"table_id": table_id, "applied": False},
            {"$set": {"applied": True}}
        )
        
        await client.close()
        logger.info(f"✅ [CHANGE] Marked changes as applied for session {table_id}")
        return True
    except Exception as e:
        logger.error(f"❌ [CHANGE] Failed to mark changes as applied for {table_id}: {e}")
        return False


async def queue_draft_save(
    table_id: str,
    df: pl.DataFrame,
    atom_id: str,
    project_id: str,
    object_name: str,
    debounce_seconds: float = 5.0
) -> None:
    """
    Queue a debounced draft save to MinIO.
    
    Args:
        table_id: Session ID
        df: DataFrame to save as draft
        atom_id: Atom ID
        project_id: Project ID
        object_name: Original file path (for reference)
        debounce_seconds: Delay before saving (default 5 seconds)
    """
    # Cancel existing task if any
    if table_id in _draft_save_queue:
        try:
            _draft_save_queue[table_id].cancel()
        except Exception:
            pass
    
    async def save_draft():
        try:
            await asyncio.sleep(debounce_seconds)
            
            # Save draft to MinIO
            draft_object_name = f"temp/draft_{table_id}.arrow"
            await asyncio.to_thread(save_table_to_minio, df, draft_object_name)
            
            # Calculate metadata
            metadata = {
                "row_count": df.height,
                "column_count": df.width,
                "size_bytes": len(df.write_ipc(io.BytesIO()).getvalue()),
            }
            
            # Update MongoDB metadata
            await save_session_metadata(
                table_id=table_id,
                atom_id=atom_id,
                project_id=project_id,
                object_name=object_name,
                has_unsaved_changes=True,
                draft_object_name=draft_object_name,
                metadata=metadata
            )
            
            logger.info(f"💾 [DRAFT] Saved draft for session {table_id} ({metadata['row_count']} rows)")
        except asyncio.CancelledError:
            logger.debug(f"⏸️ [DRAFT] Draft save cancelled for session {table_id}")
        except Exception as e:
            logger.error(f"❌ [DRAFT] Failed to save draft for {table_id}: {e}")
        finally:
            # Remove from queue
            _draft_save_queue.pop(table_id, None)
    
    # Create and store task
    task = asyncio.create_task(save_draft())
    _draft_save_queue[table_id] = task


async def restore_session_from_draft(table_id: str) -> Optional[pl.DataFrame]:
    """
    Restore a session from its draft file in MinIO.
    
    Args:
        table_id: Session ID
        
    Returns:
        Restored DataFrame or None if draft doesn't exist
    """
    try:
        metadata = await get_session_metadata(table_id)
        if not metadata:
            return None
        
        draft_object_name = metadata.get("draft_object_name")
        if not draft_object_name:
            return None
        
        # Load draft from MinIO
        df, _ = load_table_from_minio(draft_object_name)
        
        # Update access time
        await update_session_access_time(table_id)
        
        logger.info(f"🔄 [SESSION] Restored session {table_id} from draft ({df.height} rows)")
        return df
    except Exception as e:
        logger.error(f"❌ [SESSION] Failed to restore session {table_id} from draft: {e}")
        return None


async def clear_draft(table_id: str) -> bool:
    """
    Clear draft file and mark session as saved.
    
    Args:
        table_id: Session ID
        
    Returns:
        True if successful
    """
    try:
        metadata = await get_session_metadata(table_id)
        if not metadata:
            return False
        
        draft_object_name = metadata.get("draft_object_name")
        
        # Delete draft from MinIO if exists
        if draft_object_name:
            try:
                minio_client.remove_object(MINIO_BUCKET, draft_object_name)
                logger.info(f"🗑️ [DRAFT] Deleted draft file: {draft_object_name}")
            except Exception as e:
                logger.warning(f"⚠️ [DRAFT] Failed to delete draft file: {e}")
        
        # Update MongoDB metadata
        client = AsyncIOMotorClient(MONGO_URI)
        db = client[MONGO_DB]
        coll = db["table_sessions"]
        
        await coll.update_one(
            {"_id": table_id},
            {
                "$set": {
                    "has_unsaved_changes": False,
                    "last_modified": datetime.utcnow(),
                },
                "$unset": {
                    "draft_object_name": ""
                }
            }
        )
        
        # Mark changes as applied
        await mark_changes_applied(table_id)
        
        await client.close()
        logger.info(f"✅ [DRAFT] Cleared draft for session {table_id}")
        return True
    except Exception as e:
        logger.error(f"❌ [DRAFT] Failed to clear draft for {table_id}: {e}")
        return False

