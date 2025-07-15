from pydantic import BaseModel, Field
from typing import Dict, List, Any, Optional


# =============================================================================
# RESPONSE MODELS
# =============================================================================
class ClassificationSummary(BaseModel):
    total_columns: int
    user_specified: int
    auto_classified: int
    identifiers_count: int
    measures_count: int
    unclassified_count: int

class AutoClassification(BaseModel):
    identifiers: List[str]
    measures: List[str]
    unclassified: List[str]
    confidence_scores: Dict[str, float]

class UserClassification(BaseModel):
    identifiers: List[str]
    measures: List[str]
    unclassified: List[str]

class FinalClassification(BaseModel):
    identifiers: List[str]
    measures: List[str]
    unclassified: List[str]

class ClassifyColumnsResponse(BaseModel):
    status: str
    message: str
    dataframe: str
    auto_classification: AutoClassification
    user_classification: UserClassification
    final_classification: FinalClassification
    user_modified: bool
    summary: ClassificationSummary
    
    
# Add this to your schemas.py file

class DimensionDetails(BaseModel):
    dimension_ids: List[str]
    dimension_names: List[str]
    created_at: str

class NextSteps(BaseModel):
    assign_identifiers: str
    view_assignments: str

class DefineDimensionsResponse(BaseModel):
    status: str
    message: str
    validator_atom_id: str
    file_key: str
    validator_type: str
    dimensions: Dict[str, Any]
    dimensions_count: int
    max_allowed: int
    dimension_details: DimensionDetails
    mongodb_saved: bool
    in_memory_saved: str
    next_steps: NextSteps



# Add these to your schemas.py file

class AssignmentSummary(BaseModel):
    total_identifiers: int
    assigned_identifiers: int
    unassigned_identifiers: int
    dimensions_with_assignments: int
    assignment_timestamp: str

class NextStepsAssignment(BaseModel):
    view_complete_setup: str
    export_configuration: str

class AssignIdentifiersResponse(BaseModel):
    status: str
    message: str
    validator_atom_id: str
    file_key: str
    validator_type: str
    updated_business_dimensions: Dict[str, Any]
    assignment_summary: AssignmentSummary
    unassigned_identifiers: List[str]
    dimension_breakdown: Dict[str, int]
    mongodb_updated: bool
    in_memory_updated: str
    next_steps: NextStepsAssignment