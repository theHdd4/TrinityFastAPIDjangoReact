# Pydantic Models for Data Upload Feature
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional


class ColumnProcessingInstruction(BaseModel):
    column: str = Field(..., description="Original column name")
    new_name: Optional[str] = Field(default=None, description="Optional new column name")
    dtype: Optional[str] = Field(default=None, description="Target dtype (string, int, float, bool, datetime)")
    fill_value: Optional[Any] = Field(default=None, description="Value used to fill missing entries (legacy)")
    datetime_format: Optional[str] = Field(default=None, description="Datetime format to use when converting to datetime64")
    missing_strategy: Optional[str] = Field(default=None, description="Missing value handling strategy (drop, mean, median, mode, zero, empty, custom)")
    custom_value: Optional[Any] = Field(default=None, description="Custom value used for missing value replacement")
    drop_column: Optional[bool] = Field(default=False, description="Whether to drop the column entirely")


class ProcessDataframeRequest(BaseModel):
    object_name: str = Field(..., description="MinIO object path for the dataframe")
    instructions: List[ColumnProcessingInstruction] = Field(default_factory=list, description="Per-column processing instructions")


class ProcessDataframeResponse(BaseModel):
    status: str = Field(..., description="Operation status")
    object_name: str = Field(..., description="Updated dataframe object path")
    rows: int = Field(..., description="Row count after processing")
    columns: List[Dict[str, Any]] = Field(..., description="Column metadata after processing")

