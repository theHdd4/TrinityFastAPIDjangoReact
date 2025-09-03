# app/schemas.py
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime

# ---------- Health / Files ----------

class HealthCheck(BaseModel):
    status: str
    timestamp: datetime
    services: Dict[str, Dict[str, Any]]
    version: str
    database_details: Dict[str, str]
    minio_details: Dict[str, str]

class FileDownloadResponse(BaseModel):
    file_key: str
    filename: str
    download_url: str
    file_size: Optional[int] = None
    last_modified: Optional[datetime] = None

class FileListResponse(BaseModel):
    total_files: int
    files: List[Dict[str, Any]]
    bucket: str
    prefix: str

# ---------- Combinations (generic) ----------

class UniqueCombination(BaseModel):
    combination_id: str
    combination: Dict[str, str]                    # generic, e.g. {"Channel":"MT","Brand":"X","PPG":"Y"}
    scope_names: List[str]
    set_names: List[str]
    total_records: int
    file_keys: List[str]
    date_ranges: List[Dict[str, str]]
    available_scopes: List[str]
    file_locations: List[str]

class CombinationSelectionOptions(BaseModel):
    total_combinations: int
    unique_combinations: List[UniqueCombination]
    filter_options: Dict[str, List[str]]
    summary: Dict[str, Any]

class SelectedCombinationDetails(BaseModel):
    combination: Dict[str, Any]                    # returns the filter map you asked for
    related_scopes: List[Dict[str, Any]]
    total_records: int
    file_details: List[Dict[str, Any]]
    data_availability: Dict[str, Any]
    minio_files: List[Dict[str, Any]]

# ---------- Variable listing ----------

class ModelVariablesResponse(BaseModel):
    file_key: str
    variables: List[str]
    total_variables: int

# ---------- Model filter (by metrics / variable) ----------

class ModelFilterRequest(BaseModel):
    file_key: str = Field(..., description="MinIO key for the results file (CSV/Arrow)")
    variable: str = Field(..., description="Column to analyze (e.g., SelfElasticity col)")
    method: Optional[str] = Field("elasticity", description="Method type: elasticity, beta, or average")
    combination_id: Optional[str] = Field(None, description="Filter by specific combination ID")
    min_mape: Optional[float] = None
    max_mape: Optional[float] = None
    min_r2: Optional[float] = None
    max_r2: Optional[float] = None
    min_self_elasticity: Optional[float] = None
    max_self_elasticity: Optional[float] = None
    min_mape_train: Optional[float] = None
    max_mape_train: Optional[float] = None
    min_mape_test: Optional[float] = None
    max_mape_test: Optional[float] = None
    min_r2_train: Optional[float] = None
    max_r2_train: Optional[float] = None
    min_r2_test: Optional[float] = None
    max_r2_test: Optional[float] = None
    min_aic: Optional[float] = None
    max_aic: Optional[float] = None
    min_bic: Optional[float] = None
    max_bic: Optional[float] = None
    # Per-variable filters for multiple variables
    variable_filters: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Filters for each variable: {'variable_name': {'min': value, 'max': value}}")

class FilteredModel(BaseModel):
    model_name: str
    self_elasticity: float
    # Add dynamic fields for different methods
    self_beta: Optional[float] = None
    self_avg: Optional[float] = None

# ---------- Weighted ensemble (blend) ----------

class WeightedEnsembleRequest(BaseModel):
    file_key: str
    grouping_keys: List[str]                       # e.g. ["Channel","Brand","PPG"]
    include_numeric: Optional[List[str]] = None
    exclude_numeric: Optional[List[str]] = None
    filter_criteria: Optional[Dict[str, Any]] = None
    filtered_models: Optional[List[str]] = None    # List of model names to include in ensemble

class ComboResult(BaseModel):
    combo: Dict[str, Any]
    models_used: int
    best_model: Optional[str] = None               # lowest test MAPE model within the combo (for reference)
    best_mape: Optional[float] = None
    weight_concentration: Optional[float] = None   # max model weight share
    model_composition: Dict[str, float] = Field(default_factory=dict)
    weighted: Dict[str, Optional[float]] = Field(default_factory=dict)
    aliases: Dict[str, Optional[float]] = Field(default_factory=dict)  # convenience (elasticity, r2_test, etc.)
    y_pred_at_mean: Optional[float] = None

class WeightedEnsembleResponse(BaseModel):
    grouping_keys: List[str]
    total_combos: int
    results: List[ComboResult]

# ---------- Contributions (schema-free endpoint modeled here for docs) ----------

class TopContributor(BaseModel):
    variable: str
    percentage: float

class PerformanceFlags(BaseModel):
    has_mape_train: bool
    has_mape_test: bool
    has_r2_train: bool
    has_r2_test: bool
    has_actual_vs_predicted: bool

class ActualVsPredicted(BaseModel):
    mean_actual: float
    mean_predicted: float
    rmse: float
    mae: float
    r_squared: float
    residual_stats: Dict[str, float]
    sample_size: int
    plot_data: Dict[str, List[float]] = Field(default_factory=dict)
    data_table: List[Dict[str, float]] = Field(default_factory=list)

class VariableContribution(BaseModel):
    variable_name: str
    beta_coefficient: float
    average_value: float
    contribution_value: float
    relative_contribution: float
    percentage_contribution: float

class ModelPerformanceMetrics(BaseModel):
    mape_train: Optional[float] = None
    mape_test: Optional[float] = None
    r2_train: Optional[float] = None
    r2_test: Optional[float] = None

class ModelSelector(BaseModel):
    row_index: Optional[int] = None
    model_name: Optional[str] = None
    filter_criteria: Optional[Dict[str, Any]] = None

class ContributionsSummary(BaseModel):
    total_variables: int
    sum_of_contributions: float
    top_5_contributors: List[TopContributor]
    positive_contributors: int
    negative_contributors: int
    performance_summary: PerformanceFlags
    y_variable_detected: Optional[str] = None
    x_variables_used: Optional[List[str]] = None

class ContributionsGenericRequest(BaseModel):
    file_key: str
    row_index: Optional[int] = None
    model_name: Optional[str] = None
    filter_criteria: Optional[Dict[str, Any]] = None
    source_data_file_key: Optional[str] = None
    source_data_filters: Optional[Dict[str, Any]] = None
    y_column_hint: Optional[str] = None

class ContributionsGenericResponse(BaseModel):
    model_selector: ModelSelector
    file_key: str
    model_performance: ModelPerformanceMetrics
    total_contribution: float
    contributions: List[VariableContribution]
    actual_vs_predicted: Optional[ActualVsPredicted] = None
    summary: ContributionsSummary

# ---------- Demand / revenue curves ----------

class DemandRevenueSelection(BaseModel):
    method: str                               # row_index | model_name | filter_criteria_json | single_row_file
    row_index: Optional[int] = None
    model_name: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None

class DemandRevenueQuality(BaseModel):
    mape_test: Optional[float] = None
    r2_test: Optional[float] = None
    best_model: Optional[str] = None

class CurvePoint(BaseModel):
    price: float
    demand: float
    revenue: float
    elasticity: Optional[float] = None

class OptimalRevenue(BaseModel):
    price: float
    demand: float
    revenue: float
    elasticity: Optional[float] = None

class DemandRevenueCurvesResponse(BaseModel):
    selection: DemandRevenueSelection
    price_variable: str
    intercept: float
    base_price: float
    base_volume: float
    base_revenue: float
    elasticity_at_base: Optional[float] = None
    rpi_competitor_prices: Dict[str, float]
    quality: DemandRevenueQuality
    curve_data: List[CurvePoint]
    optimal_revenue: OptimalRevenue

# ---------- Save / retrieve model rows (generic) ----------

class GenericModelSelectionRequest(BaseModel):
    file_key: str
    row_index: Optional[int] = None
    filter_criteria: Optional[Dict[str, Any]] = None
    model_name: Optional[str] = None
    tags: Optional[List[str]] = Field(default_factory=list)
    description: Optional[str] = None

class SavedModelResponse(BaseModel):
    model_id: str
    saved_at: datetime
    status: str
    row_data: Dict[str, Any]

class SavedModelPreview(BaseModel):
    model_id: str
    model_name: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    created_at: datetime
    source_file: Optional[str] = None
    selection_criteria: Dict[str, Any]
    data_preview: Dict[str, Any]

class SavedModelListResponse(BaseModel):
    total: int
    models: List[SavedModelPreview]
    pagination: Dict[str, Any]

class SavedCombinationsStatusResponse(BaseModel):
    file_key: str
    atom_id: str
    total_combinations: int
    saved_combinations: List[str]
    pending_combinations: List[str]
    saved_count: int
    pending_count: int
    completion_percentage: float
    note: Optional[str] = None

# ---------- Scopes list (light) ----------

class ScopeSummary(BaseModel):
    id: str
    scope_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    scope_type: Optional[str] = None
    validator_id: Optional[str] = None
    total_filter_sets: Optional[int] = None
    overall_filtered_records: Optional[int] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

class ScopeListResponse(BaseModel):
    total_scopes: int
    scopes: List[ScopeSummary]
    pagination: Dict[str, int]