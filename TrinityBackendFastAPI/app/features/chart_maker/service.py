import pandas as pd
import numpy as np
import io
import uuid
from typing import Dict, List, Optional, Any
from fastapi import HTTPException
import json
from .schemas import (
    ChartRequest, RechartsConfig, RechartsDataKey, 
    RechartsAxisConfig, RechartsLegendConfig, RechartsTooltipConfig, 
    RechartsResponsiveConfig, ChartResponse, ChartTrace
)


class ChartMakerService:
    def __init__(self):
        # In-memory storage for uploaded files
        # In production, this should use a proper storage solution
        self.file_storage: Dict[str, pd.DataFrame] = {}
    
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
    
    def store_file(self, df: pd.DataFrame) -> str:
        """Store DataFrame and return file_id"""
        file_id = str(uuid.uuid4())
        self.file_storage[file_id] = df
        return file_id
    
    def get_file(self, file_id: str) -> pd.DataFrame:
        """Get DataFrame by file_id"""
        if file_id not in self.file_storage:
            raise HTTPException(status_code=404, detail=f"File with id {file_id} not found")
        return self.file_storage[file_id]
    
    def get_all_columns(self, df: pd.DataFrame) -> List[str]:
        """Get all column names"""
        return df.columns.tolist()
    
    def get_column_types(self, df: pd.DataFrame) -> Dict[str, List[str]]:
        """Classify columns into numeric and categorical"""
        numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
        categorical_columns = df.select_dtypes(include=['object', 'category']).columns.tolist()
        
        return {
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns
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
                # Convert values to appropriate types
                filtered_df = filtered_df[filtered_df[column].astype(str).isin(values)]
        
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

    def generate_chart_config(self, request: ChartRequest) -> ChartResponse:
        """Generate recharts configuration from chart request"""
        # Always apply filters to the CSV file if filters are present
        df = self.get_file(request.file_id)
        if request.filters:
            df = self.apply_filters(df, request.filters)
        chart_data = self._convert_numpy_types(df.to_dict('records'))
        # If you want to allow explicit override, you could do:
        # if request.filtered_data and not request.filters:
        #     chart_data = request.filtered_data
        
        # Process traces and aggregate data
        processed_data = self._process_chart_data(chart_data, request.traces)
        
        # Generate recharts data keys
        recharts_traces = []
        colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#8dd1e1", "#d084d0"]
        
        for i, trace in enumerate(request.traces):
            color = colors[i % len(colors)]
            if trace.style and trace.style.stroke:
                color = trace.style.stroke
            elif trace.style and trace.style.fill:
                color = trace.style.fill
                
            recharts_trace = RechartsDataKey(
                dataKey=trace.y_column,
                name=trace.name or trace.y_column,
                type=trace.style.type if trace.style and hasattr(trace.style, 'type') else "monotone",
                stroke=color,
                fill=color if request.chart_type in ["area", "bar", "pie"] else None,
                strokeWidth=trace.style.strokeWidth if trace.style else 2,
                fillOpacity=trace.style.fillOpacity if trace.style else (0.6 if request.chart_type == "area" else None)
            )
            recharts_traces.append(recharts_trace)
        
        # Set up axis configurations
        x_axis_config = request.x_axis or RechartsAxisConfig(
            dataKey=request.traces[0].x_column if request.traces else None,
            type="category"
        )
        
        y_axis_config = request.y_axis or RechartsAxisConfig(
            dataKey=request.traces[0].y_column if request.traces else None,
            type="number"
        )
        
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
        data_summary = {
            "total_records": len(processed_data),
            "columns_used": [trace.x_column for trace in request.traces] + [trace.y_column for trace in request.traces],
            "chart_type": request.chart_type,
            "filters_applied": bool(request.filters)
        }
        
        return ChartResponse(
            chart_id=chart_id,
            chart_config=chart_config,
            data_summary=data_summary
        )
    
    def _process_chart_data(self, data: List[Dict[str, Any]], traces: List[ChartTrace]) -> List[Dict[str, Any]]:
        """Process and aggregate chart data based on traces"""
        if not data or not traces:
            return []
        
        df = pd.DataFrame(data)
        
        # Group by x_column and aggregate y_columns
        primary_trace = traces[0]
        x_column = primary_trace.x_column
        
        if x_column not in df.columns:
            return data
        
        # Check if aggregation is needed
        if df[x_column].duplicated().any():
            # Group and aggregate
            grouped_data = {}
            
            for x_val in df[x_column].unique():
                if pd.isna(x_val):
                    continue
                    
                group_data = df[df[x_column] == x_val]
                result_row = {x_column: x_val}
                
                for trace in traces:
                    if trace.y_column in df.columns:
                        y_values = group_data[trace.y_column].dropna()
                        if len(y_values) > 0:
                            if trace.aggregation == "sum":
                                result_row[trace.y_column] = float(y_values.sum())
                            elif trace.aggregation == "mean":
                                result_row[trace.y_column] = float(y_values.mean())
                            elif trace.aggregation == "count":
                                result_row[trace.y_column] = len(y_values)
                            elif trace.aggregation == "min":
                                result_row[trace.y_column] = float(y_values.min())
                            elif trace.aggregation == "max":
                                result_row[trace.y_column] = float(y_values.max())
                            else:
                                result_row[trace.y_column] = float(y_values.sum())
                        else:
                            result_row[trace.y_column] = 0
                
                grouped_data[x_val] = result_row
            
            # Convert to list and sort by x_column
            result = list(grouped_data.values())
            try:
                # Try to sort numerically if possible
                result.sort(key=lambda x: float(x[x_column]) if str(x[x_column]).replace('.', '').replace('-', '').isdigit() else x[x_column])
            except (ValueError, TypeError):
                # Fall back to string sorting
                result.sort(key=lambda x: str(x[x_column]))
                
            return self._convert_numpy_types(result)
        else:
            # No aggregation needed, return as is but ensure numeric types
            result = []
            for row in data:
                processed_row = {}
                for key, value in row.items():
                    # Try to convert numeric strings to numbers for recharts
                    if isinstance(value, str) and value.replace('.', '').replace('-', '').isdigit():
                        try:
                            processed_row[key] = float(value) if '.' in value else int(value)
                        except ValueError:
                            processed_row[key] = value
                    else:
                        processed_row[key] = value
                result.append(processed_row)
            return self._convert_numpy_types(result)


# Singleton instance
chart_service = ChartMakerService()
