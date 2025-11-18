# Pydantic Models
from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional


# ✅ ADD THESE - New enhanced validation schemas
class ConditionFailure(BaseModel):
    column: str = Field(..., description="Column name")
    operator: str = Field(..., description="Validation operator")
    expected_value: Any = Field(..., description="Expected value")
    error_message: str = Field(..., description="Custom error message")
    severity: str = Field(..., description="Severity level")
    failed_rows: List[int] = Field(..., description="List of failed row indices")
    failed_count: int = Field(..., description="Number of rows that failed")
    failed_percentage: float = Field(..., description="Percentage of rows that failed")

# Your existing classes below...
class FileValidationResult(BaseModel):
    status: str = Field(..., description="File validation status")
    errors: List[str] = Field(default_factory=list, description="Validation errors")
    warnings: List[str] = Field(default_factory=list, description="Validation warnings")
    auto_corrections: List[str] = Field(default_factory=list, description="Auto-corrections applied")
    condition_failures: List[ConditionFailure] = Field(default_factory=list, description="Custom condition failures")  
    columns_checked: int = Field(..., description="Number of columns checked")
    mandatory_columns_missing: int = Field(..., description="Number of missing mandatory columns")
    extra_columns_found: int = Field(..., description="Number of extra columns found")
    data_corrections_applied: int = Field(..., description="Number of auto-corrections applied")
    custom_conditions_failed: int = Field(..., description="Number of custom conditions that failed") 

class ValidationSummary(BaseModel):
    total_files: int = Field(..., description="Total files validated")
    passed_files: int = Field(..., description="Number of files that passed")
    failed_files: int = Field(..., description="Number of files that failed")
    files_with_warnings: int = Field(..., description="Number of files with warnings")
    total_auto_corrections: int = Field(..., description="Total auto-corrections across all files")
    total_condition_failures: int = Field(..., description="Total custom condition failures")  # ✅ ADD THIS


class MinIOUploadResult(BaseModel):
    file_key: str = Field(..., description="File key")
    filename: str = Field(..., description="Original filename")
    minio_upload: Dict[str, Any] = Field(..., description="MinIO upload result")

class ValidateResponse(BaseModel):
    overall_status: str = Field(..., description="Overall validation status")
    validator_atom_id: str = Field(..., description="Validator atom ID")
    file_validation_results: Dict[str, FileValidationResult] = Field(..., description="Per-file validation results")
    summary: ValidationSummary = Field(..., description="Validation summary")
    minio_uploads: List[MinIOUploadResult] = Field(default_factory=list, description="MinIO upload results")
    validation_log_saved: bool = Field(..., description="Whether validation log was saved to MongoDB")
    validation_log_id: str = Field(..., description="MongoDB validation log document ID")
    total_auto_corrections: int = Field(..., description="Total corrections applied across all files")
    total_condition_failures: int = Field(..., description="Total custom condition failures")  # ✅ ADD THIS
    task_id: Optional[str] = Field(default=None, description="Celery task identifier")
    task_status: Optional[str] = Field(default=None, description="Celery task status")

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


# Add to your schemas.py
class CreateValidatorResponse(BaseModel):
    status: str = Field(..., description="Operation status") 
    message: str = Field(..., description="Success or error message")
    validator_atom_id: str = Field(..., description="Validator atom identifier")
    config_saved: bool = Field(..., description="Configuration saved successfully")




class MongoDBUpdateStatus(BaseModel):
    status: str = Field(..., description="MongoDB update status (success/error)")
    modified: bool = Field(..., description="Whether any documents were actually modified")
    details: str = Field(..., description="Additional details about the update")

class UpdateColumnTypesResponse(BaseModel):
    status: str = Field(..., description="Operation status")
    message: str = Field(..., description="Success message")
    validator_atom_id: str = Field(..., description="Validator atom ID")
    file_key: str = Field(..., description="File key")
    updated_column_types: Dict[str, str] = Field(..., description="Column types that were updated")
    current_all_column_types: Dict[str, str] = Field(..., description="All column types after update")
    updated_columns_count: int = Field(..., description="Number of columns updated")
    mongodb_update: MongoDBUpdateStatus = Field(..., description="MongoDB update status")  # ✅ ADD THIS


class BusinessDimensionItem(BaseModel):
    id: str = Field(..., description="Dimension ID")
    name: str = Field(..., description="Dimension name")
    description: Optional[str] = Field(None, description="Dimension description")

class DefineDimensionsResponse(BaseModel):
    status: str = Field(..., description="Operation status")
    message: str = Field(..., description="Success message")
    validator_atom_id: str = Field(..., description="Validator atom ID")
    file_key: str = Field(..., description="File key")
    dimensions: Dict[str, BusinessDimensionItem] = Field(..., description="Defined dimensions")
    dimensions_count: int = Field(..., description="Number of dimensions defined")
    max_allowed: int = Field(..., description="Maximum dimensions allowed")
    mongodb_saved: bool = Field(..., description="Whether saved to MongoDB successfully")





##################for config

# Add these schemas to app/schemas.py

class ValidationCondition(BaseModel):
    operator: str = Field(..., description="Validation operator (greater_than, contains, etc.)")
    value: Any = Field(..., description="Value to compare against")
    error_message: str = Field(..., description="Custom error message")
    severity: str = Field(default="error", description="Severity level (error, warning)")

# ✅ UPDATE: ConfigureValidationConfigResponse in app/schemas.py
class ConfigureValidationConfigResponse(BaseModel):
    status: str = Field(..., description="Operation status")
    message: str = Field(..., description="Success message")
    validator_atom_id: str = Field(..., description="Validator atom ID")
    file_key: str = Field(..., description="File key")
    mongo_id: str = Field(..., description="MongoDB document ID")
    operation: str = Field(..., description="MongoDB operation (inserted/updated)")
    total_conditions: int = Field(..., description="Total number of conditions configured")
    columns_configured: List[str] = Field(..., description="Columns that have conditions")
    columns_with_frequencies: List[str] = Field(default_factory=list, description="Columns that have frequency validation")  # ✅ ADD THIS
    mongodb_saved: bool = Field(..., description="Whether saved to MongoDB successfully")





###################












class AssignmentSummary(BaseModel):
    total_identifiers: int = Field(..., description="Total available identifiers")
    assigned_identifiers: int = Field(..., description="Number of assigned identifiers")
    unassigned_identifiers: int = Field(..., description="Number of unassigned identifiers")

class AssignIdentifiersResponse(BaseModel):
    status: str = Field(..., description="Operation status")
    message: str = Field(..., description="Success message")
    validator_atom_id: str = Field(..., description="Validator atom ID")
    file_key: str = Field(..., description="File key")
    updated_business_dimensions: Dict[str, Any] = Field(..., description="Updated business dimensions with assignments")
    assignment_summary: AssignmentSummary = Field(..., description="Assignment summary statistics")
    unassigned_identifiers: List[str] = Field(..., description="List of unassigned identifiers")
    dimension_breakdown: Dict[str, int] = Field(..., description="Number of identifiers per dimension")
    mongodb_updated: bool = Field(..., description="Whether MongoDB was successfully updated")