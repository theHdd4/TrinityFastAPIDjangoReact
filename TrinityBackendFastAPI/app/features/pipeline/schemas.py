from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Literal

from pydantic import BaseModel, Field, ConfigDict


class FileMetadata(BaseModel):
    """File metadata structure."""
    file_key: str = Field(..., description="File key/path")
    file_path: str = Field(..., description="File path")
    flight_path: str = Field(..., description="Arrow Flight path")
    original_name: Optional[str] = Field(None, description="Original file name")
    save_as_name: Optional[str] = Field(None, description="Save as name if saved")
    is_default_name: bool = Field(False, description="Whether using default name")
    columns: List[str] = Field(default_factory=list, description="Column names")
    dtypes: Dict[str, str] = Field(default_factory=dict, description="Column data types")
    row_count: int = Field(0, description="Number of rows")
    uploaded_at: Optional[datetime] = Field(None, description="Upload timestamp")


class InputFile(BaseModel):
    """Input file structure for atom execution."""
    file_key: str = Field(..., description="File key/path")
    file_path: str = Field(..., description="File path")
    flight_path: str = Field(..., description="Arrow Flight path")
    role: str = Field("primary", description="Role of input (primary, secondary, etc.)")
    parent_atom_id: Optional[str] = Field(None, description="Parent atom that produced this file")


class OutputFile(BaseModel):
    """Output file structure for atom execution."""
    file_key: str = Field(..., description="File key/path")
    file_path: str = Field(..., description="File path")
    flight_path: str = Field(..., description="Arrow Flight path")
    save_as_name: Optional[str] = Field(None, description="Save as name")
    is_default_name: bool = Field(False, description="Whether using default name")
    columns: List[str] = Field(default_factory=list, description="Column names")
    dtypes: Dict[str, str] = Field(default_factory=dict, description="Column data types")
    row_count: int = Field(0, description="Number of rows")


class ApiCall(BaseModel):
    """API call record."""
    endpoint: str = Field(..., description="API endpoint")
    method: str = Field(..., description="HTTP method")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Call timestamp")
    params: Dict[str, Any] = Field(default_factory=dict, description="Request parameters")
    response_status: int = Field(0, description="Response status code")
    response_data: Optional[Dict[str, Any]] = Field(None, description="Response data")


class ExecutionInfo(BaseModel):
    """Execution timing and status."""
    started_at: datetime = Field(..., description="Execution start time")
    completed_at: Optional[datetime] = Field(None, description="Execution completion time")
    duration_ms: int = Field(0, description="Duration in milliseconds")
    status: Literal["success", "failed", "pending"] = Field("pending", description="Execution status")
    error: Optional[str] = Field(None, description="Error message if failed")


class ExecutionGraphStep(BaseModel):
    """Single step in execution graph."""
    step_index: int = Field(..., description="Step index in execution order")
    atom_instance_id: str = Field(..., description="Atom instance identifier")
    card_id: str = Field(..., description="Card ID containing this atom")
    atom_type: str = Field(..., description="Atom type (e.g., groupby-wtg-avg)")
    atom_title: str = Field(..., description="Atom title/name")
    inputs: List[InputFile] = Field(default_factory=list, description="Input files")
    configuration: Dict[str, Any] = Field(default_factory=dict, description="Atom configuration")
    api_calls: List[ApiCall] = Field(default_factory=list, description="API calls made")
    outputs: List[OutputFile] = Field(default_factory=list, description="Output files")
    execution: ExecutionInfo = Field(..., description="Execution timing and status")


class LineageNode(BaseModel):
    """Lineage graph node."""
    id: str = Field(..., description="Node identifier")
    type: Literal["file", "atom"] = Field(..., description="Node type")
    label: str = Field(..., description="Node label")


class LineageEdge(BaseModel):
    """Lineage graph edge."""
    # Use "from" and "to" as field names (Python allows this with Field aliases)
    from_node: str = Field(..., alias="from", description="Source node ID")
    to_node: str = Field(..., alias="to", description="Target node ID")
    
    model_config = ConfigDict(populate_by_name=True)  # Allow both "from"/"to" and "from_node"/"to_node"


class Lineage(BaseModel):
    """Data lineage graph."""
    nodes: List[LineageNode] = Field(default_factory=list, description="Lineage nodes")
    edges: List[LineageEdge] = Field(default_factory=list, description="Lineage edges")


class ColumnOperation(BaseModel):
    """Column operation configuration."""
    id: str = Field(..., description="Unique operation identifier")
    type: str = Field(..., description="Operation type (e.g., 'add', 'subtract', 'log')")
    name: str = Field(..., description="Operation name")
    columns: List[str] = Field(default_factory=list, description="Input columns")
    rename: Optional[str] = Field(None, description="Rename/new column name")
    param: Optional[Any] = Field(None, description="Operation parameters")
    created_column_name: Optional[str] = Field(None, description="Final created column name")


class ColumnOperationsConfig(BaseModel):
    """Column operations configuration for a file."""
    input_file: str = Field(..., description="Input file path")
    output_file: Optional[str] = Field(None, description="Output file path (if new file created)")
    overwrite_original: bool = Field(False, description="Whether to overwrite original file")
    operations: List[ColumnOperation] = Field(default_factory=list, description="Column operations")
    created_columns: List[str] = Field(default_factory=list, description="List of created column names")
    identifiers: Optional[List[str]] = Field(None, description="Global identifiers for grouping operations")
    saved_at: Optional[datetime] = Field(None, description="When operations were saved")
    execution_order: Optional[int] = Field(None, description="Order in which to execute (for derived files)")


class DataSummaryEntry(BaseModel):
    """Data summary entry for a file (original columns and dtypes)."""
    file_key: str = Field(..., description="File key/path")
    columns: List[str] = Field(default_factory=list, description="Original column names")
    dtypes: Dict[str, str] = Field(default_factory=dict, description="Column data types")
    saved_at: Optional[datetime] = Field(None, description="When data summary was saved")


class PipelineData(BaseModel):
    """Pipeline execution data."""
    root_files: List[FileMetadata] = Field(default_factory=list, description="Root input files")
    execution_graph: List[ExecutionGraphStep] = Field(default_factory=list, description="Execution graph")
    lineage: Lineage = Field(default_factory=Lineage, description="Data lineage")
    column_operations: List[ColumnOperationsConfig] = Field(
        default_factory=list, 
        description="Global column operations from metrics tab"
    )
    data_summary: List[DataSummaryEntry] = Field(
        default_factory=list,
        description="Original file column names and dtypes (for validation)"
    )


class PipelineSummary(BaseModel):
    """Pipeline execution summary."""
    total_atoms: int = Field(0, description="Total number of atoms executed")
    total_files: int = Field(0, description="Total number of files")
    root_files_count: int = Field(0, description="Number of root files")
    derived_files_count: int = Field(0, description="Number of derived files")
    total_duration_ms: int = Field(0, description="Total execution duration")
    status: Literal["success", "failed", "partial"] = Field("success", description="Overall status")


class PipelineExecutionDocument(BaseModel):
    """Complete pipeline execution document."""
    id: str = Field(..., alias="_id", description="Composite ID: client_id/app_id/project_id")
    execution_id: str = Field(..., description="Unique execution identifier")
    
    model_config = ConfigDict(populate_by_name=True)  # Allow both "id" and "_id"
    client_id: str = Field(..., description="Client identifier")
    app_id: str = Field(..., description="App identifier")
    project_id: str = Field(..., description="Project identifier")
    execution_timestamp: datetime = Field(default_factory=datetime.utcnow, description="Execution timestamp")
    user_id: str = Field("unknown", description="User identifier")
    pipeline: PipelineData = Field(..., description="Pipeline execution data")
    summary: PipelineSummary = Field(..., description="Execution summary")


class PipelineGetResponse(BaseModel):
    """Response for getting pipeline data."""
    status: Literal["success", "error"] = Field(..., description="Response status")
    data: Optional[PipelineExecutionDocument] = Field(None, description="Pipeline execution data")
    message: Optional[str] = Field(None, description="Error message if status is error")


class RootFileReplacement(BaseModel):
    """Root file replacement configuration."""
    original_file: str = Field(..., description="Original root file path")
    replacement_file: Optional[str] = Field(None, description="Replacement file path (None to keep original)")
    keep_original: bool = Field(True, description="Whether to keep original file")


class RunPipelineRequest(BaseModel):
    """Request to run pipeline with optional file replacements."""
    client_name: str = Field(..., description="Client name")
    app_name: str = Field(..., description="App name")
    project_name: str = Field(..., description="Project name")
    mode: str = Field("laboratory", description="Mode")
    file_replacements: List[RootFileReplacement] = Field(
        default_factory=list,
        description="Root file replacements (empty to keep all originals)"
    )


class RunPipelineResponse(BaseModel):
    """Response from running pipeline."""
    status: Literal["success", "error"] = Field(..., description="Execution status")
    message: str = Field(..., description="Status message")
    executed_atoms: int = Field(0, description="Number of atoms executed")
    successful_atoms: int = Field(0, description="Number of successful executions")
    failed_atoms: int = Field(0, description="Number of failed executions")
    execution_log: List[Dict[str, Any]] = Field(default_factory=list, description="Detailed execution log")
