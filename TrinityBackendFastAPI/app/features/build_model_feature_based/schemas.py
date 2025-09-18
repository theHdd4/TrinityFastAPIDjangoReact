from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any, Union
from datetime import datetime


###GET /api/v1/health


class Health(BaseModel):
    """Health check response for Build Atom API."""
    status: str
    timestamp: datetime
    services: Dict[str, Dict[str, str]]
    version: str
    api: str


####GET /api/v1/scopes/{scope_id} and GET /api/v1/scopes

class ScopeCombination(BaseModel):
    """Schema for individual combination within a scope."""
    combination_id: str
    channel: str
    brand: str
    ppg: str
    file_key: str
    filename: str
    set_name: str
    record_count: int

class ScopeDetail(BaseModel):
    """Detailed scope information with combinations."""
    scope_id: str
    scope_name: str
    scope_type: str
    validator_id: str
    status: str
    total_combinations: int
    combinations: List[ScopeCombination]

class ScopeSetColumns(BaseModel):
    """Response model for scope set with columns."""
    scope_id: str
    scope_name: str
    set_name: str
    total_combinations: int
    combinations: List[ScopeCombination]
    columns: List[str]
    columns_source: str = Field(..., description="File used to extract columns")



class ScopeSetRequest(BaseModel):
    """Request parameters for scope set selection."""
    scope_id: str
    set_name: str


#########GET /api/v1/combinations

class Combination(BaseModel):
    """Basic combination information."""
    combination_id: str
    channel: str
    brand: str
    ppg: str
    file_key: str

class CombinationList(BaseModel):
    """Response for combination list endpoint."""
    total: int
    combinations: List[Combination]


#########OST /api/v1/train-models

class ModelConstraint(BaseModel):
    """Constraint configuration for custom models."""
    variable: str
    constraint_type: str = Field(..., description="'positive' or 'negative'")
    
class CustomModelConfig(BaseModel):
    """Configuration for custom constrained models."""
    learning_rate: Optional[float] = 0.001
    iterations: Optional[int] = 10000
    l2_penalty: Optional[float] = 0.1  # For Ridge
    adam: Optional[bool] = False
    constraints: Optional[List[ModelConstraint]] = []

class ModelTrainingRequest(BaseModel):
    """Request for model training endpoint."""
    scope_id: str
    set_name: str
    x_variables: List[str] = Field(..., description="List of feature columns")
    y_variable: str = Field(..., description="Target variable column")
    price_column: Optional[str] = Field(None, description="Price column for elasticity calculation (e.g., 'PPU')")  # ← Add this
    standardization: str = Field("none", description="Options: 'none', 'standard', 'minmax'")
    k_folds: int = Field(5, ge=2, le=10, description="Number of folds for cross-validation")
    models_to_run: Optional[List[str]] = Field(None, description="List of model names to run. If None, runs all models")
    custom_model_configs: Optional[Dict[str, CustomModelConfig]] = Field(None, description="Custom configurations for constrained models")



class ModelResult(BaseModel):
    """Result for a single model."""
    model_name: str
    mape_train: float
    mape_test: float
    r2_train: float
    r2_test: float
    coefficients: Dict[str, float] = Field(..., description="Unstandardized coefficients")
    standardized_coefficients: Optional[Dict[str, float]] = Field(None, description="Standardized coefficients for reference")
    intercept: float = Field(..., description="Unstandardized intercept")
    
    # AIC and BIC
    aic: float = Field(..., description="Akaike Information Criterion")
    bic: float = Field(..., description="Bayesian Information Criterion")
    n_parameters: int = Field(..., description="Number of model parameters including intercept")
    
    # Price Elasticity fields
    price_elasticity: Optional[float] = Field(None, description="Price elasticity value")
    price_elasticity_std: Optional[float] = Field(None, description="Standard deviation of price elasticity across folds")
    elasticity_calculated: bool = Field(False, description="Whether elasticity was calculated")
    fold_elasticities: Optional[List[float]] = Field(None, description="Elasticity values for each fold")
    
    # ADD THESE NEW FIELDS
    csf: Optional[float] = Field(None, description="Consumer Surplus Fraction")
    mcv: Optional[float] = Field(None, description="Marginal Consumer Value")
    ppu_at_elasticity: Optional[float] = Field(None, description="Average PPU used for elasticity calculation")
    
    # Elasticity and Contribution fields
    elasticities: Optional[Dict[str, float]] = Field(None, description="Elasticity values for each variable")
    contributions: Optional[Dict[str, float]] = Field(None, description="Contribution values for each variable")
    elasticity_details: Optional[Dict[str, Any]] = Field(None, description="Details about elasticity calculation")
    contribution_details: Optional[Dict[str, Any]] = Field(None, description="Details about contribution calculation")


class StackModelResult(BaseModel):
    """Simplified result for a single model in stack modeling (beta coefficients only)."""
    model_name: str
    mape_train: float
    mape_test: float
    r2_train: float
    r2_test: float
    coefficients: Dict[str, float] = Field(..., description="Beta coefficients")
    standardized_coefficients: Optional[Dict[str, float]] = Field(None, description="Standardized coefficients for reference")
    intercept: float = Field(..., description="Model intercept")
    aic: float = Field(..., description="Akaike Information Criterion")
    bic: float = Field(..., description="Bayesian Information Criterion")
    n_parameters: int = Field(..., description="Number of model parameters including intercept")


class CombinationModelResults(BaseModel):
    """Results for all models on a single combination."""
    combination_id: str
    channel: str
    brand: str
    ppg: str
    file_key: str
    total_records: int
    model_results: List[ModelResult]

class StackModelResults(BaseModel):
    """Results for all models on a single split cluster."""
    split_clustered_data_id: str
    file_key: str
    total_records: int
    model_results: List[StackModelResult]

class ModelTrainingResponse(BaseModel):
    """Response from model training endpoint."""
    scope_id: str
    set_name: str
    x_variables: List[str]
    y_variable: str
    standardization: str
    k_folds: int
    total_combinations: int
    combination_results: List[CombinationModelResults]
    summary: Dict[str, Any]

class StackModelTrainingResponse(BaseModel):
    """Response from stack model training endpoint."""
    scope_id: str
    set_name: str
    x_variables: List[str]
    y_variable: str
    standardization: str
    k_folds: int
    total_split_clusters: int
    stack_model_results: List[StackModelResults]
    summary: Dict[str, Any]


class CombinationBetaResult(BaseModel):
    """Beta coefficients for a single combination."""
    combination: str
    model_name: str
    intercept: float
    coefficients: Dict[str, float] = Field(..., description="Final beta coefficients for each variable")


class CombinationBetasResponse(BaseModel):
    """Response from combination betas endpoint."""
    scope_id: str
    set_name: str
    x_variables: List[str]
    y_variable: str
    standardization: str
    k_folds: int
    total_combinations: int
    combination_betas: List[CombinationBetaResult]
    summary: Dict[str, Any]




class ModelResultDocument(BaseModel):
    """MongoDB document schema for enhanced model results."""
    _id: Optional[str] = None
    scope_id: str
    scope_name: str
    set_name: str
    combination_id: str
    channel: str
    brand: str
    ppg: str
    file_key: str
    model_name: str
    model_type: str = "regression"
    
    # Training configuration
    x_variables: List[str]
    y_variable: str
    standardization: str
    k_folds: int
    
    # Model performance metrics (aggregated)
    mape_train: float
    mape_test: float
    r2_train: float
    r2_test: float
    
    # Standard deviations
    mape_train_std: float = Field(0.0, description="Standard deviation of MAPE train across folds")
    mape_test_std: float = Field(0.0, description="Standard deviation of MAPE test across folds")
    r2_train_std: float = Field(0.0, description="Standard deviation of R2 train across folds")
    r2_test_std: float = Field(0.0, description="Standard deviation of R2 test across folds")
    
    # AIC and BIC
    aic: float = Field(..., description="Akaike Information Criterion")
    bic: float = Field(..., description="Bayesian Information Criterion")
    n_parameters: int = Field(..., description="Number of model parameters including intercept")
    
    # Coefficients
    coefficients: Dict[str, float]
    standardized_coefficients: Dict[str, float]
    intercept: float
    
    # Price Elasticity fields
    price_column: Optional[str] = Field(None, description="Price column used for elasticity calculation")
    price_elasticity: Optional[float] = Field(None, description="Price elasticity (only if price in x_variables)")
    price_elasticity_std: Optional[float] = Field(None, description="Standard deviation of price elasticity across folds")
    elasticity_calculated: bool = Field(False, description="Whether elasticity was calculated")
    fold_elasticities: Optional[List[float]] = Field(None, description="Elasticity values for each fold")
    
    # ADD THESE NEW FIELDS
    csf: Optional[float] = Field(None, description="Consumer Surplus Fraction")
    mcv: Optional[float] = Field(None, description="Marginal Consumer Value")
    ppu_at_elasticity: Optional[float] = Field(None, description="Average PPU used for elasticity calculation")
    
    # Variable statistics
    variable_statistics: List[Dict[str, Any]] = Field(default_factory=list, description="Detailed statistics for each variable")
    variable_averages: Dict[str, float] = Field(default_factory=dict, description="Simple averages for quick access")
    
    # Fold results
    fold_results: List[Dict[str, Any]] = Field(default_factory=list, description="Detailed results for each fold")
    is_fold_result: bool = Field(False, description="False for aggregated, True for individual fold")
    fold_index: Optional[int] = Field(None, description="Only set if is_fold_result is True")
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    training_date: datetime = Field(default_factory=datetime.now)
    total_records: int
    custom_model_config: Optional[Dict[str, Any]] = None
    
    # Additional tracking
    run_id: str = Field(..., description="Unique identifier for this training run")
    status: str = "completed"









##############mmm


from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Union  # Added Union import
from datetime import datetime
from enum import Enum

# Marketing-specific enums
class TransformationType(str, Enum):
    """Transformation types for media variables."""
    LOGISTIC = "logistic"
    POWER = "power"

class StandardizationMethod(str, Enum):
    """Standardization methods for variables."""
    MINMAX = "minmax"
    ZSCORE = "zscore"
    NONE = "none"

class MarketingModelType(str, Enum):
    """Model types for marketing mix modeling."""
    RIDGE = "Ridge"
    LASSO = "Lasso"
    LINEAR = "Linear Regression"
    ELASTIC_NET = "Elastic Net"
    CONSTRAINED_RIDGE = "Generalized Constrained Ridge"


class MarketingDataPreparationRequest(BaseModel):
    """Request for marketing data preparation using scope system."""
    scope_id: str = Field(..., description="Scope ID from MongoDB")
    set_name: str = Field(..., description="Set name (e.g., Scope_1)")
    fiscal_years: List[Union[int, str]] = Field(..., description="Fiscal years to filter")
    remove_zero_columns: bool = Field(True, description="Remove columns with all zeros")

    class Config:
        schema_extra = {
            "example": {
                "scope_id": "mmm_multifilter_20250713_004626",
                "set_name": "Scope_1",
                "fiscal_years": ["FY23", "FY24"],
                "remove_zero_columns": True
            }
        }


class MarketingTransformationRequest(BaseModel):
    """Request for marketing variable transformation."""
    run_id: str = Field(..., description="Run ID from data preparation")
    media_variables: List[str] = Field(..., description="Media variables to transform")
    other_variables: List[str] = Field(..., description="Other variables to standardize")
    non_scaled_variables: List[str] = Field(default=[], description="Variables to keep unscaled")
    transformation_type: TransformationType
    standardization_method: StandardizationMethod
    transformation_params: Dict[str, List[float]] = Field(..., description="Parameters per media variable")

    class Config:
        schema_extra = {
            "example": {
                "run_id": "abc-123-def-456",
                "media_variables": ["TV_Cricket_All_Adults_Reach", "TV_Movies_All_Reach"],
                "other_variables": ["Price", "D1"],
                "non_scaled_variables": [],
                "transformation_type": "logistic",
                "standardization_method": "minmax",
                "transformation_params": {
                    "TV_Cricket_All_Adults_Reach": [3.5, 0.8, 0.5],
                    "TV_Movies_All_Reach": [4.0, 0.7, 0.6]
                }
            }
        }


class MarketingModelTrainingRequest(BaseModel):
    """Request for marketing mix model training."""
    run_id: str = Field(..., description="Run ID from transformation")
    y_variables: List[str] = Field(..., description="Dependent variables")
    model_types: List[MarketingModelType] = Field(..., description="Model types to train")
    apply_same_params: bool = Field(True, description="Apply same parameters to all media")
    same_carryover: bool = Field(True, description="Apply same carryover to all media")
    train_test_split: float = Field(0.8, ge=0.5, le=0.95, description="Training data proportion")

    class Config:
        schema_extra = {
            "example": {
                "run_id": "xyz-789-uvw-012",
                "y_variables": ["Volume"],
                "model_types": ["Ridge", "Linear Regression"],
                "apply_same_params": True,
                "same_carryover": True,
                "train_test_split": 0.9
            }
        }


class MarketingElasticityRequest(BaseModel):
    """Request for marketing elasticity calculation."""
    run_id: str = Field(..., description="Training run ID")
    model_ids: Optional[List[int]] = Field(None, description="Specific model IDs to calculate for")
    include_contributions: bool = Field(True, description="Also calculate variable contributions")
    
    class Config:
        schema_extra = {
            "example": {
                "run_id": "training-789-abc-123",
                "model_ids": [0, 1, 2, 3],
                "include_contributions": True
            }
        }


class MarketingDataPreparationResponse(BaseModel):
    """Response for data preparation endpoint."""
    run_id: str
    status: str
    rows: int
    columns: int
    prepared_data_key: str
    fiscal_years_included: List[Union[int, str]]
    columns_removed: Optional[List[str]] = None
    
    class Config:
        schema_extra = {
            "example": {
                "run_id": "abc-123-def-456",
                "status": "success",
                "rows": 24,
                "columns": 45,
                "prepared_data_key": "marketing-prepared/abc-123-def-456/",
                "fiscal_years_included": ["FY23", "FY24"],
                "columns_removed": ["Zero_Column_1", "Zero_Column_2"]
            }
        }


class MarketingTransformationResponse(BaseModel):
    """Response for transformation endpoint."""
    transform_id: str
    status: str
    transformed_data_key: str
    variable_statistics: Dict[str, Any]
    regions_processed: List[str]
    media_variables_transformed: List[str]
    
    class Config:
        schema_extra = {
            "example": {
                "transform_id": "xyz-789-uvw-012",
                "status": "success",
                "transformed_data_key": "marketing-transformed/xyz-789-uvw-012/",
                "variable_statistics": {
                    "TV_Cricket_All_Adults_Reach_transformed": {
                        "Assam": {"mean": 0.264, "std": 0.374, "min": 0.0, "max": 1.0}
                    },
                    "TV_Movies_All_Reach_transformed": {
                        "Assam": {"mean": 0.269, "std": 0.395, "min": 0.0, "max": 1.0}
                    }
                },
                "regions_processed": ["Assam"],
                "media_variables_transformed": ["TV_Cricket_All_Adults_Reach", "TV_Movies_All_Reach"]
            }
        }
        

# In schemas.py, add these to your marketing schemas section

class ConstraintType(str, Enum):
    """Types of constraints for marketing variables."""
    POSITIVE = "positive"      # Coefficient must be >= 0
    NEGATIVE = "negative"      # Coefficient must be <= 0
    NONE = "none"             # No constraint

class VariableConstraint(BaseModel):
    """Constraint specification for a variable."""
    variable_name: str = Field(..., description="Variable name to constrain")
    constraint_type: ConstraintType = Field(..., description="Type of constraint to apply")
    
    class Config:
        schema_extra = {
            "example": {
                "variable_name": "scaled_Price",
                "constraint_type": "negative"
            }
        }




# Update MarketingModelTrainingRequest
class MarketingModelTrainingRequest(BaseModel):
    """Request for marketing mix model training."""
    run_id: str = Field(..., description="Run ID from transformation")
    y_variables: List[str] = Field(..., description="Dependent variables")
    model_types: List[MarketingModelType] = Field(..., description="Model types to train")
    apply_same_params: bool = Field(True)
    same_carryover: bool = Field(True)
    train_test_split: float = Field(0.8, ge=0.5, le=0.95)
    
    # ADD THESE NEW FIELDS
    variable_constraints: List[VariableConstraint] = Field(
        default=[],
        description="Variable constraints for custom models"
    )
    use_constraints: bool = Field(
        False,
        description="Whether to apply constraints (forces use of custom models)"
    )
    constraint_learning_rate: float = Field(0.001, description="Learning rate for constrained models")
    constraint_iterations: int = Field(10000, description="Iterations for constrained models")
    
    class Config:
        schema_extra = {
            "example": {
                "run_id": "xyz-789-uvw-012",
                "y_variables": ["Volume"],
                "model_types": ["Ridge", "Linear Regression"],
                "train_test_split": 0.9,
                "use_constraints": True,
                "variable_constraints": [
                    {"variable_name": "scaled_Price", "constraint_type": "negative"},
                    {"variable_name": "scaled_D1", "constraint_type": "positive"},
                    {"variable_name": "TV_Cricket_All_Adults_Reach_transformed", "constraint_type": "positive"}
                ],
                "constraint_learning_rate": 0.001,
                "constraint_iterations": 10000
            }
        }


class MarketingModelTrainingResponse(BaseModel):
    """Response for model training endpoint."""
    training_id: str
    status: str
    models_trained: int
    summary: Dict[str, Any]
    best_models: Dict[str, int]
    execution_time_seconds: float
    
    class Config:
        schema_extra = {
            "example": {
                "training_id": "training-789-abc-123",
                "status": "success",
                "models_trained": 2,
                "summary": {
                    "combinations_processed": 1,
                    "model_types": ["Ridge", "Linear Regression"],
                    "y_variables": ["Volume"],
                    "constraints_applied": False,
                    "total_constraints": 0
                },
                "best_models": {
                    "by_mape": 0,
                    "by_r2": 1,
                    "by_aic": 0
                },
                "execution_time_seconds": 2.34
            }
        }

class MarketingModelResult(BaseModel):
    """Individual marketing mix model result."""
    model_id: int
    model_type: str
    brand: str
    market: List[str]
    region: List[str]
    y_variable: str
    
    # Performance metrics
    mape: float = Field(..., description="Mean Absolute Percentage Error")
    r_squared: float = Field(..., description="R-squared value")
    adjusted_r_squared: float = Field(..., description="Adjusted R-squared")
    aic: float = Field(..., description="Akaike Information Criterion")
    bic: float = Field(..., description="Bayesian Information Criterion")
    
    # Model outputs
    coefficients: Dict[str, float] = Field(..., description="Model coefficients")
    contributions: Optional[Dict[str, float]] = Field(None, description="Variable contributions")
    elasticities: Optional[Dict[str, float]] = Field(None, description="Media elasticities")
    
    # Transformation details
    transformation_params: Dict[str, Any]
    standardization_method: str
    
    # Metadata
    created_at: datetime
    training_id: str


class MarketingElasticityResponse(BaseModel):
    """Response for elasticity calculation endpoint."""
    status: str
    models_updated: int
    elasticity_summary: Dict[int, Dict[str, float]]
    contribution_summary: Optional[Dict[int, Dict[str, float]]] = None
    
    class Config:
        schema_extra = {
            "example": {
                "status": "success",
                "models_updated": 2,
                "elasticity_summary": {
                    0: {"TV_Cricket_All_Adults_Reach": 0.25, "TV_Movies_All_Reach": 0.18},
                    1: {"TV_Cricket_All_Adults_Reach": 0.23, "TV_Movies_All_Reach": 0.20}
                },
                "contribution_summary": {
                    0: {"TV_Cricket_All_Adults_Reach": 15.5, "TV_Movies_All_Reach": 12.3, "Price": -8.7},
                    1: {"TV_Cricket_All_Adults_Reach": 14.8, "TV_Movies_All_Reach": 13.1, "Price": -9.2}
                }
            }
        }


class MarketingExportResponse(BaseModel):
    """Response for results export endpoint."""
    status: str
    export_file_key: str
    download_url: str
    total_models_exported: int
    file_size_bytes: int
    
    class Config:
        schema_extra = {
            "example": {
                "status": "success",
                "export_file_key": "marketing-exports/training-789-abc-123/results_20250710_170200.xlsx",
                "download_url": "/api/v1/marketing/download/marketing-exports/training-789-abc-123/results_20250710_170200.xlsx",
                "total_models_exported": 2,
                "file_size_bytes": 45678
            }
        }


class VariableStatistics(BaseModel):
    """Statistics for a transformed variable."""
    variable_name: str
    region: str
    mean: float
    std: float
    min: float
    max: float
    q25: float
    median: float
    q75: float
    count: int


class TransformationMetadata(BaseModel):
    """Metadata for transformation process."""
    transform_id: str
    run_id: str
    created_at: datetime
    transformation_type: str
    standardization_method: str
    transformation_params: Dict[str, List[float]]
    media_variables: List[str]
    other_variables: List[str]
    non_scaled_variables: List[str]
    regions: List[str]
    variable_statistics: Dict[str, Any]