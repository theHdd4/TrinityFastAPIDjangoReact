# schemas.py
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional
from datetime import datetime

class ValidatorAtomRequest(BaseModel):
    """Request schema for getting classified columns"""
    validator_atom_id: str = Field(..., description="Validator atom identifier", min_length=1)
    include_metadata: bool = Field(True, description="Include classification metadata")
    
    class Config:
        json_schema_extra = {
            "example": {
                "validator_atom_id": "heinz_validated",
                "include_metadata": True
            }
        }

class ColumnClassification(BaseModel):
    """Individual column classification details"""
    column_name: str
    data_type: str
    classification_type: str  # 'identifier', 'metric', 'dimension', etc.
    confidence_score: Optional[float] = None
    sample_values: Optional[List[str]] = None

# schemas.py - Updated ClassificationSummary
class ClassificationSummary(BaseModel):
    """Simplified summary showing only identifiers"""
    identifiers: List[str]  # Only show identifiers, remove metrics, dimensions, other_columns

class ValidatorAtomResponse(BaseModel):
    """Response schema - keep everything else the same"""
    validator_atom_id: str
    classification_status: str
    file_key: Optional[str]
    classification_summary: ClassificationSummary  # Now only contains identifiers
    detailed_classifications: List[ColumnClassification]  # Keep detailed info here if needed
    metadata: Optional[Dict[str, Any]]
    retrieved_at: datetime

    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# Pydantic models (if not already defined elsewhere)
class ScopeRequest(BaseModel):
    """Simple scope selection request"""
    identifiers: List[str] = Field(..., description="Selected identifier columns", min_items=1)
    time_column: Optional[str] = Field(None, description="Time/date column for filtering")
    name: str = Field(..., description="Scope name")
    description: Optional[str] = Field(None, description="Optional description")

class ScopeResponse(BaseModel):
    """Simple scope creation response"""
    success: bool
    scope_id: str
    name: str
    identifiers: List[str]
    time_column: Optional[str]
    created_at: str
    
    
class ScopeFilterRequest(BaseModel):
    """Request model for creating a filtered scope with file key input"""
    file_key: str = Field(
        ..., 
        description="MinIO file key/path to the data file",
        example="sales/updated_dataset_with_base_price (9).csv"
    )
    identifier_filters: Dict[str, List[str]] = Field(
        ..., 
        description="Dictionary of identifier names to their selected values",
        example={"channel": ["Online", "Retail"], "brand": ["Heinz"], "ppg": ["PPG001"]}
    )
    start_date: Optional[str] = Field(None, description="Start date filter (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date filter (YYYY-MM-DD)")
    description: Optional[str] = Field(None, description="Optional description for the scope")


class CombinationFileInfo(BaseModel):
    """Model for individual combination file information"""
    combination: Dict[str, str] = Field(..., description="Dictionary of column names to values for this combination")
    file_key: str = Field(..., description="MinIO file path for this combination")
    filename: str = Field(..., description="Filename for this combination")
    record_count: int = Field(..., description="Number of records in this combination file")
    low_data_warning: bool = False  # Add this field
    
    
    
class ScopeFilterResponse(BaseModel):
    """Response model for filtered scope creation with multiple combination files"""
    success: bool
    scope_id: str
    scope_name: str
    total_combinations: int
    combination_files: List[CombinationFileInfo] = Field(..., description="List of combination files created")
    date_range: Optional[Dict[str, str]] = Field(None, description="Applied date range filter")
    total_filtered_records: int = Field(..., description="Total records across all combination files")
    original_records_count: int = Field(..., description="Original number of records before filtering")
    created_at: str

class CriteriaSettings(BaseModel):
    """Criteria settings for filtering combinations"""
    min_datapoints_enabled: bool = Field(True, description="Whether to apply minimum datapoints criteria")
    min_datapoints: int = Field(24, description="Minimum number of datapoints required")
    pct90_enabled: bool = Field(False, description="Whether to apply percentile criteria")
    pct_percentile: int = Field(90, description="Percentile to check (0-100)")
    pct_threshold: float = Field(10.0, description="Threshold percentage")
    pct_base: str = Field("max", description="Base for percentage calculation (max, min, mean, dist)")
    pct_column: Optional[str] = Field(None, description="Column to use for percentile calculation")

class MultiFilterScopeRequest(BaseModel):
    """Request model for multiple filter sets with optional time filtering"""
    file_key: str = Field(..., description="MinIO file key/path to the data file")
    
    # Filter Set 1 (Required) - Only identifier filters are required
    identifier_filters_1: Dict[str, List[str]] = Field(..., description="First set of identifier filters")
    start_date_1: Optional[str] = Field(None, description="Optional start date for first filter set (YYYY-MM-DD)")
    end_date_1: Optional[str] = Field(None, description="Optional end date for first filter set (YYYY-MM-DD)")
    
    # Filter Set 2 (Optional)
    identifier_filters_2: Optional[Dict[str, List[str]]] = Field(None, description="Second set of identifier filters")
    start_date_2: Optional[str] = Field(None, description="Optional start date for second filter set")
    end_date_2: Optional[str] = Field(None, description="Optional end date for second filter set")
    
    # Filter Set 3 (Optional)
    identifier_filters_3: Optional[Dict[str, List[str]]] = Field(None, description="Third set of identifier filters")
    start_date_3: Optional[str] = Field(None, description="Optional start date for third filter set")
    end_date_3: Optional[str] = Field(None, description="Optional end date for third filter set")
    
    # Filter Set 4 (Optional)
    identifier_filters_4: Optional[Dict[str, List[str]]] = Field(None, description="Fourth set of identifier filters")
    start_date_4: Optional[str] = Field(None, description="Optional start date for fourth filter set")
    end_date_4: Optional[str] = Field(None, description="Optional end date for fourth filter set")
    
    # Filter Set 5 (Optional)
    identifier_filters_5: Optional[Dict[str, List[str]]] = Field(None, description="Fifth set of identifier filters")
    start_date_5: Optional[str] = Field(None, description="Optional start date for fifth filter set")
    end_date_5: Optional[str] = Field(None, description="Optional end date for fifth filter set")
    
    description: Optional[str] = Field(None, description="Overall description for all filter sets")
    
    # Criteria settings
    criteria: Optional[CriteriaSettings] = Field(None, description="Criteria settings for filtering combinations")

    
    
class FilterSetResult(BaseModel):
    """Results for individual filter set with optional dates"""
    set_name: str
    identifier_filters: Dict[str, List[str]]
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    combination_files: List[CombinationFileInfo]
    filtered_records_count: int


class MultiFilterScopeResponse(BaseModel):
    """Response model for multiple filter sets"""
    success: bool
    scope_id: str
    scope_name: str
    filter_set_results: List[FilterSetResult]
    total_filter_sets: int
    overall_filtered_records: int
    original_records_count: int
    created_at: str