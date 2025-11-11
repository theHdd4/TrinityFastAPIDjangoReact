import pandas as pd
import numpy as np
import io
import uuid
from typing import Dict, List, Optional, Any
from fastapi import HTTPException
import json
from datetime import datetime, date
from .schemas import (
    ChartRequest, RechartsConfig, RechartsDataKey, 
    RechartsAxisConfig, RechartsLegendConfig, RechartsTooltipConfig, 
    RechartsResponsiveConfig, ChartResponse, ChartTrace
)
from app.DataStorageRetrieval.arrow_client import download_dataframe

# Helper function to convert date values to ISO format (YYYY-MM-DD)
def convert_date_to_iso(value):
    """Convert date/datetime values to ISO format string (YYYY-MM-DD) for proper sorting"""
    if value is None or pd.isna(value):
        return value
    
    if isinstance(value, datetime):
        return value.date().isoformat()
    elif isinstance(value, date):
        return value.isoformat()
    elif isinstance(value, pd.Timestamp):
        return value.date().isoformat()
    else:
        # Try to parse if it's a string date
        try:
            parsed_date = pd.to_datetime(value)
            return parsed_date.date().isoformat()
        except:
            return value


class ChartMakerService:
    def __init__(self):
        # In-memory storage for uploaded files
        # In production, this should use a proper storage solution
        self.file_storage: Dict[str, pd.DataFrame] = {}
        # Track file metadata including names and sources
        self.file_metadata: Dict[str, Dict[str, str]] = {}
    
    def read_file(self, file_bytes: bytes, filename: str) -> pd.DataFrame:
        """Read file from bytes and return DataFrame"""
        try:
            if filename.lower().endswith('.csv'):
                df = pd.read_csv(io.BytesIO(file_bytes))
            elif filename.lower().endswith(('.xls', '.xlsx')):
                df = pd.read_excel(io.BytesIO(file_bytes))
            elif filename.lower().endswith('.arrow'):
                import pyarrow as pa
                import pyarrow.ipc as ipc
                reader = ipc.RecordBatchFileReader(pa.BufferReader(file_bytes))
                df = reader.read_all().to_pandas()
            else:
                raise ValueError('Unsupported file format. Please upload CSV, Excel, or Arrow files.')
            return df
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    def store_file(self, df: pd.DataFrame, filename: str = None, data_source: str = None) -> str:
        """Store DataFrame and return file_id"""
        file_id = str(uuid.uuid4())
        self.file_storage[file_id] = df
        # Store metadata
        self.file_metadata[file_id] = {
            "filename": filename or f"file_{file_id}",
            "data_source": data_source or "uploaded_file"
        }
        return file_id
    
    def get_file(self, file_id: str) -> pd.DataFrame:
        """Get DataFrame by file_id"""
        if file_id not in self.file_storage:
            raise HTTPException(status_code=404, detail=f"File with id {file_id} not found")
        return self.file_storage[file_id]
    
    def get_file_metadata(self, file_id: str) -> Dict[str, str]:
        """Get file metadata by file_id"""
        if file_id not in self.file_metadata:
            return {"filename": f"file_{file_id}", "data_source": "unknown"}
        return self.file_metadata[file_id]
    
    def load_saved_dataframe(self, object_name: str) -> str:
        """Load a saved dataframe from Arrow Flight and return file_id"""
        try:
            print(f"🔍 ===== LOAD SAVED DATAFRAME SERVICE =====")
            print(f"📥 Object name: {object_name}")
            
            # Download dataframe from Arrow Flight using the object name as path
            print("🚀 Downloading dataframe from Arrow Flight...")
            df = download_dataframe(object_name)
            print(f"✅ Dataframe downloaded: {len(df)} rows, {len(df.columns)} columns")
            print(f"📋 Columns: {list(df.columns)}")
            
            # Store it and return file_id
            print("💾 Storing dataframe in local storage...")
            file_id = self.store_file(df, filename=object_name, data_source="arrow_flight")
            print(f"✅ Dataframe stored with file ID: {file_id}")
            print(f"🔍 ===== END SERVICE LOG =====")
            
            return file_id
        except Exception as e:
            print(f"❌ Error in load_saved_dataframe: {e}")
            print(f"🔍 ===== END SERVICE LOG =====")
            
            # Try fallback to direct MinIO loading if Arrow Flight fails
            if "No table for" in str(e) or "flight download failed" in str(e).lower():
                print(f"🔄 Arrow Flight failed, trying direct MinIO fallback...")
                try:
                    from app.DataStorageRetrieval.arrow_client import get_minio_df
                    df = get_minio_df("trinity", object_name)
                    print(f"✅ MinIO fallback successful: {len(df)} rows, {len(df.columns)} columns")
                    
                    # Store it and return file_id
                    file_id = self.store_file(df, filename=object_name, data_source="minio_fallback")
                    print(f"✅ Dataframe stored with file ID: {file_id}")
                    return file_id
                except Exception as minio_error:
                    print(f"❌ MinIO fallback also failed: {minio_error}")
            
            # Provide more specific error messages for common issues
            if "No table for" in str(e):
                error_msg = f"File {object_name} exists but no table is registered in Arrow Flight. The file may need to be re-uploaded or the table may not be properly cached. Detail: {str(e)}"
            elif "not found" in str(e).lower():
                error_msg = f"File {object_name} not found. Please check if the file exists and try again. Detail: {str(e)}"
            else:
                error_msg = f"Error loading saved dataframe {object_name}: {str(e)}. Detail: Unavailable"
            
            raise HTTPException(status_code=404, detail=error_msg)
    
    def get_all_columns(self, df: pd.DataFrame) -> List[str]:
        """Get all column names"""
        return df.columns.tolist()
    
    def get_column_types(self, df: pd.DataFrame) -> Dict[str, List[str]]:
        """Classify columns into numeric and categorical."""
        numeric_columns = df.select_dtypes(include=["number"]).columns.tolist()
        categorical_columns = df.select_dtypes(include=["object", "category"]).columns.tolist()
        datetime_columns = df.select_dtypes(include=["datetime", "datetimetz"]).columns.tolist()

        # Ensure datetime columns are available for selection (e.g., as X-axis options)
        combined_categorical = list(dict.fromkeys([*categorical_columns, *datetime_columns]))
        
        return {
            "numeric_columns": numeric_columns,
            "categorical_columns": combined_categorical
        }
    
    def get_unique_values(self, df: pd.DataFrame, columns: List[str]) -> Dict[str, List[str]]:
        """Get unique values for specified columns"""
        result = {}
        for col in columns:
            if col in df.columns:
                # Get unique values and convert to strings, excluding NaN values
                unique_vals = df[col].dropna().unique()
                result[col] = [str(val) for val in unique_vals]
            else:
                result[col] = []
        return result
    
    def get_sample_data(self, df: pd.DataFrame, n: int = 10) -> List[Dict[str, Any]]:
        """Get sample data from DataFrame"""
        sample_df = df.head(n)
        return self._convert_numpy_types(sample_df.to_dict('records'))
    
    def apply_filters(self, df: pd.DataFrame, filters: Dict[str, List[str]]) -> pd.DataFrame:
        """Apply categorical filters to DataFrame"""
        filtered_df = df.copy()
        
        for column, values in filters.items():
            if column in filtered_df.columns and values:
                # For datetime columns, ensure consistent string formatting
                if pd.api.types.is_datetime64_any_dtype(filtered_df[column]):
                    # Convert datetime to string in a consistent format that matches unique values
                    column_as_str = filtered_df[column].apply(lambda x: str(x) if pd.notna(x) else '')
                else:
                    # For non-datetime columns, use astype(str)
                    column_as_str = filtered_df[column].astype(str)
                
                filtered_df = filtered_df[column_as_str.isin(values)]
        
        return filtered_df

    def _convert_numpy_types(self, data: Any) -> Any:
        """Convert numpy types to Python native types for JSON serialization"""
        if isinstance(data, dict):
            return {key: self._convert_numpy_types(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._convert_numpy_types(item) for item in data]
        elif isinstance(data, np.integer):
            return int(data)
        elif isinstance(data, np.floating):
            return float(data)
        elif isinstance(data, np.ndarray):
            return data.tolist()
        elif pd.isna(data):
            return None
        else:
            return data
    
    def _convert_dates_to_iso(self, data: List[Dict[str, Any]], x_column: str) -> List[Dict[str, Any]]:
        """Convert date columns to ISO format (YYYY-MM-DD) for proper sorting in frontend"""
        if not data:
            return data
        
        # Check if we have date columns - only check for columns named exactly 'date'
        date_columns = []
        
        # Check x_column
        if x_column:
            sample_value = data[0].get(x_column) if data else None
            # Check if sample value is a date type or if column name is exactly 'date'
            if sample_value is not None and (
                isinstance(sample_value, (datetime, date, pd.Timestamp)) or
                x_column.lower() == 'date'
            ):
                date_columns.append(x_column)
        
        # Also check other columns that might be dates - only check for exact 'date' name
        for key in data[0].keys() if data else []:
            if key not in date_columns and key.lower() == 'date':
                date_columns.append(key)
        
        # Convert date values in identified date columns
        if date_columns:
            print(f"🗓️ Converting date columns to ISO format: {date_columns}")
            for item in data:
                for col in date_columns:
                    if col in item:
                        item[col] = convert_date_to_iso(item[col])
        
        return data

    def generate_chart_config(self, request: ChartRequest) -> ChartResponse:
        """Generate recharts configuration from chart request"""
        print(f"🔍 ===== GENERATE CHART CONFIG SERVICE =====")
        print(f"📥 Request file_id: {request.file_id}")
        print(f"📊 Chart type: {request.chart_type}")
        print(f"📈 Traces count: {len(request.traces)}")
        
        df = self.get_file(request.file_id)
        print(f"✅ File loaded: {len(df)} rows, {len(df.columns)} columns")
        print(f"📋 Available columns: {list(df.columns)}")
        
        # Check if any trace has filters (advanced mode)
        has_trace_filters = any(trace.filters for trace in request.traces)
        print(f"🔍 Has trace filters: {has_trace_filters}")
        
        # Create a copy of traces to avoid modifying the original request
        traces_copy = []
        for i, trace in enumerate(request.traces):
            print(f"📊 Trace {i+1}: X='{trace.x_column}', Y='{trace.y_column}', Type='{trace.chart_type}', Agg='{trace.aggregation}', LegendField='{trace.legend_field}'")
            trace_copy = ChartTrace(
                x_column=trace.x_column,
                y_column=trace.y_column,
                name=trace.name,
                chart_type=trace.chart_type,
                aggregation=trace.aggregation,
                filters=trace.filters,
                color=trace.color,
                style=trace.style,
                legend_field=trace.legend_field
            )
            traces_copy.append(trace_copy)
        
        if has_trace_filters:
            # Advanced mode: Process each trace with its own filters
            print("🚀 Processing multi-trace data with individual filters...")
            processed_data = self._process_multi_trace_data(df, traces_copy)
        else:
            # Legacy mode: Apply chart-level filters
            print("🚀 Processing single-trace data...")
            if request.filters:
                df = self.apply_filters(df, request.filters)
                # print(f"✅ Filters applied: {len(df)} rows remaining")
            chart_data = self._convert_numpy_types(df.to_dict('records'))
            processed_data = self._process_chart_data(chart_data, traces_copy)
        
        print(f"✅ Data processed: {len(processed_data)} rows")
        
        # Generate recharts data keys using the updated column names from data processing
        recharts_traces = []
        default_colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#8dd1e1", "#d084d0"]
        
        for i, trace in enumerate(traces_copy):
            # Use trace color if provided, otherwise use default
            color = trace.color or default_colors[i % len(default_colors)]
            
            if trace.style and trace.style.stroke:
                color = trace.style.stroke
            elif trace.style and trace.style.fill:
                color = trace.style.fill
            
            # Use the updated y_column that was set during data processing
            dataKey = trace.y_column
            
            recharts_trace = RechartsDataKey(
                dataKey=dataKey,
                name=trace.name or f"Trace {i+1}",
                type=trace.style.type if trace.style and hasattr(trace.style, 'type') else "monotone",
                stroke=color,
                fill=color if request.chart_type in ["area", "bar", "pie"] else None,
                strokeWidth=trace.style.strokeWidth if trace.style else 2,
                fillOpacity=trace.style.fillOpacity if trace.style else (0.6 if request.chart_type == "area" else None)
            )
            recharts_traces.append(recharts_trace)
            # print(f"📊 Recharts trace {i+1}: dataKey='{dataKey}', name='{recharts_trace.name}', color='{color}'")
        
        # Set up axis configurations
        x_axis_config = request.x_axis or RechartsAxisConfig(
            dataKey=request.traces[0].x_column if request.traces else None,
            type="category"
        )
        
        # For y-axis, don't specify a dataKey for multi-trace charts as each trace has its own data
        if len(traces_copy) > 1:
            y_axis_config = request.y_axis or RechartsAxisConfig(
                dataKey=None,  # Let recharts auto-scale based on all traces
                type="number"
            )
        else:
            # For single trace, use the updated column name
            y_axis_config = request.y_axis or RechartsAxisConfig(
                dataKey=traces_copy[0].y_column if traces_copy else None,
                type="number"
            )
        
        # print(f"📊 X-axis config: dataKey='{x_axis_config.dataKey}', type='{x_axis_config.type}'")
        # print(f"📊 Y-axis config: dataKey='{y_axis_config.dataKey}', type='{y_axis_config.type}'")
        
        # Create final recharts configuration
        chart_config = RechartsConfig(
            chart_type=request.chart_type,
            data=processed_data,
            traces=recharts_traces,
            title=request.title,
            x_axis=x_axis_config,
            y_axis=y_axis_config,
            legend=request.legend or RechartsLegendConfig(),
            tooltip=request.tooltip or RechartsTooltipConfig(),
            responsive=request.responsive or RechartsResponsiveConfig()
        )
        
        # Generate response
        chart_id = str(uuid.uuid4())
        
        # Check if we have trace-specific filters for summary
        has_trace_filters = any(trace.filters for trace in request.traces)
        
        data_summary = {
            "total_records": len(processed_data),
            "columns_used": [trace.x_column for trace in request.traces] + [trace.y_column for trace in request.traces],
            "chart_type": request.chart_type,
            "filters_applied": bool(request.filters) or has_trace_filters,
            "trace_filters_used": has_trace_filters
        }
        
        # Get file metadata for response
        file_metadata = self.get_file_metadata(request.file_id)
        
        # print(f"✅ Chart config generated successfully")
        # print(f"📊 Chart ID: {chart_id}")
        # print(f"📈 Data summary: {data_summary}")
        # print(f"🔍 ===== END SERVICE LOG =====")
        
        return ChartResponse(
            chart_id=chart_id,
            chart_config=chart_config,
            data_summary=data_summary,
            file_name=file_metadata["filename"],
            data_source=file_metadata["data_source"]
        )
    
    def _process_multi_trace_data(self, df: pd.DataFrame, traces: List[ChartTrace]) -> List[Dict[str, Any]]:
        """Process chart data for multiple traces with individual filters"""
        if not traces:
            return []
        
        x_column = traces[0].x_column
        
        # Get all unique x values across all filtered datasets
        all_x_values = set()
        trace_datasets = {}
        
        # Store original column names before processing
        original_y_columns = [trace.y_column for trace in traces]
        
        # Process each trace with its own filters
        for i, trace in enumerate(traces):
            # Apply trace-specific filters
            trace_df = df.copy()
            if trace.filters:
                trace_df = self.apply_filters(trace_df, trace.filters)
            
            # Use original column name for data lookup
            original_y_column = original_y_columns[i]
            
            # Aggregate the trace data
            if x_column in trace_df.columns and original_y_column in trace_df.columns:
                if trace_df[x_column].duplicated().any():
                    # Group and aggregate
                    grouped = trace_df.groupby(x_column)[original_y_column].agg(trace.aggregation or 'sum')
                    trace_data = grouped.to_dict()
                else:
                    # No aggregation needed
                    trace_data = trace_df.set_index(x_column)[original_y_column].to_dict()
                
                # Store the trace data and collect x values
                trace_datasets[i] = trace_data
                all_x_values.update(trace_data.keys())
        
        # Create unified dataset with unique column names for each trace
        result = []
        for x_val in sorted(all_x_values):
            if pd.isna(x_val):
                continue
                
            row = {x_column: x_val}
            
            # Add data for each trace with unique column names
            for i, trace in enumerate(traces):
                if i in trace_datasets:
                    # Get the original column name for reference
                    original_y_column = original_y_columns[i]
                    
                    # Always use index-based unique column names for multiple traces
                    if len(traces) > 1:
                        # Create unique column name using trace index
                        trace_column = f"{original_y_column}_trace_{i}"
                        # Update the trace to use the new column name for recharts
                        trace.y_column = trace_column
                    else:
                        trace_column = trace.y_column
                    
                    row[trace_column] = trace_datasets[i].get(x_val, 0)
            
            result.append(row)
        
        # Convert date columns to ISO format (YYYY-MM-DD) for proper sorting in frontend
        result = self._convert_dates_to_iso(result, x_column)
        
        return self._convert_numpy_types(result)

    def _process_chart_data_with_legend(self, df: pd.DataFrame, traces: List[ChartTrace], x_column: str, legend_field: str) -> List[Dict[str, Any]]:
        """Process chart data with legend field segregation (e.g., sales by brand, segregated by channel)"""
        primary_trace = traces[0]
        y_column = primary_trace.y_column
        aggregation = primary_trace.aggregation or 'sum'
        
        # print(f"🎨 Processing with legend field: {legend_field}")
        # print(f"📊 X-column: {x_column}, Y-column: {y_column}, Aggregation: {aggregation}")
        
        # Group by both x_column and legend_field, then aggregate the y_column
        # This creates a "long format" dataset suitable for RechartsChartRenderer with legendField
        grouped = df.groupby([x_column, legend_field])[y_column].agg(aggregation).reset_index()
        
        # Rename columns to match expected format
        grouped.columns = [x_column, legend_field, y_column]
        
        # Convert to list of dictionaries
        result = grouped.to_dict('records')
        
        print(f"✅ Processed {len(result)} rows with legend field")
        if len(result) > 0:
            print(f"📊 Sample rows: {result[:3]}")
        
        # DON'T modify traces - keep the original trace
        # RechartsChartRenderer will handle legendField internally to create grouped bars
        
        # Convert date columns to ISO format
        result = self._convert_dates_to_iso(result, x_column)
        
        return self._convert_numpy_types(result)

    def _process_chart_data(self, data: List[Dict[str, Any]], traces: List[ChartTrace]) -> List[Dict[str, Any]]:
        """Process and aggregate chart data based on traces"""
        if not data or not traces:
            return []
        
        df = pd.DataFrame(data)
        
        # Group by x_column and aggregate y_columns
        primary_trace = traces[0]
        x_column = primary_trace.x_column
        legend_field = primary_trace.legend_field
        
        if x_column not in df.columns:
            return data
        
        # Check if we need to segregate by legend_field
        if legend_field and legend_field in df.columns:
            print(f"🎨 Segregating by legend field: {legend_field}")
            return self._process_chart_data_with_legend(df, traces, x_column, legend_field)
        
        # Check if aggregation is needed
        if df[x_column].duplicated().any():
            # Group and aggregate
            grouped_data = {}
            
            # Store original column names before processing
            original_y_columns = [trace.y_column for trace in traces]
            
            for x_val in df[x_column].unique():
                if pd.isna(x_val):
                    continue
                    
                group_data = df[df[x_column] == x_val]
                result_row = {x_column: x_val}
                
                for i, trace in enumerate(traces):
                    # Get the original column name for data lookup
                    original_column = original_y_columns[i]
                    
                    # Create unique column names for multiple traces
                    if len(traces) > 1:
                        trace_column = f"{original_column}_trace_{i}"
                        # Update the trace to use the new column name for recharts
                        trace.y_column = trace_column
                    else:
                        trace_column = original_column
                    
                    if original_column in df.columns:
                        y_values = group_data[original_column].dropna()
                        if len(y_values) > 0:
                            if trace.aggregation == "sum":
                                result_row[trace_column] = float(y_values.sum())
                            elif trace.aggregation == "mean":
                                result_row[trace_column] = float(y_values.mean())
                            elif trace.aggregation == "count":
                                result_row[trace_column] = len(y_values)
                            elif trace.aggregation == "min":
                                result_row[trace_column] = float(y_values.min())
                            elif trace.aggregation == "max":
                                result_row[trace_column] = float(y_values.max())
                            else:
                                result_row[trace_column] = float(y_values.sum())
                        else:
                            result_row[trace_column] = 0
                
                grouped_data[x_val] = result_row
            
            # Convert to list and sort by x_column
            result = list(grouped_data.values())
            try:
                # Try to sort numerically if possible
                result.sort(key=lambda x: float(x[x_column]) if str(x[x_column]).replace('.', '').replace('-', '').isdigit() else x[x_column])
            except (ValueError, TypeError):
                # Fall back to string sorting
                result.sort(key=lambda x: str(x[x_column]))
            
            # Convert date columns to ISO format (YYYY-MM-DD) for proper sorting in frontend
            result = self._convert_dates_to_iso(result, x_column)
                
            return self._convert_numpy_types(result)
        else:
            # No aggregation needed but still need unique column names for multiple traces
            # Store original column mapping for data processing
            original_y_columns = [trace.y_column for trace in traces]
            column_mapping = {}
            for i, trace in enumerate(traces):
                original_column = original_y_columns[i]
                if len(traces) > 1:
                    new_column = f"{original_column}_trace_{i}"
                    column_mapping[original_column] = new_column
                    trace.y_column = new_column
                else:
                    column_mapping[original_column] = original_column
            
            result = []
            for row in data:
                processed_row = {}
                for key, value in row.items():
                    # Map original column names to new column names if needed
                    new_key = column_mapping.get(key, key)
                    
                    # Try to convert numeric strings to numbers for recharts
                    if isinstance(value, str) and value.replace('.', '').replace('-', '').isdigit():
                        try:
                            processed_row[new_key] = float(value) if '.' in value else int(value)
                        except ValueError:
                            processed_row[new_key] = value
                    else:
                        processed_row[new_key] = value
                result.append(processed_row)
            
            # Convert date columns to ISO format (YYYY-MM-DD) for proper sorting in frontend
            result = self._convert_dates_to_iso(result, x_column)
            return self._convert_numpy_types(result)


# Singleton instance
chart_service = ChartMakerService()