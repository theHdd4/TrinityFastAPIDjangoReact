from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime


# ----------  Warm-cache response ----------
class CacheWarmResponse(BaseModel):
    models_cached: int = Field(..., description="Number of models cached")
    d0_rows: int = Field(..., description="Number of rows in the dataset")
    d0_cols: int = Field(..., description="Number of columns in the dataset")
    message: str = Field(..., description="Response message")


# ----------  Run scenario ----------
class ScenarioDefinition(BaseModel):
    """Schema for scenario definition changes to variables"""
    type: str = Field(
        ..., 
        description="Type of scenario change: 'pct' for percentage change or 'abs' for absolute value replacement"
    )
    value: float = Field(
        ..., 
        description="Value for the scenario change. For 'pct': percentage change (e.g., 5.0 = +5%). For 'abs': absolute value to replace reference."
    )
    
    class Config:
        schema_extra = {
            "examples": [
                {
                    "type": "pct",
                    "value": 5.0,
                    "description": "Increase by 5% from reference value"
                },
                {
                    "type": "pct", 
                    "value": -2.0,
                    "description": "Decrease by 2% from reference value"
                },
                {
                    "type": "abs",
                    "value": 1000000.0,
                    "description": "Replace reference value with absolute value 1,000,000"
                }
            ]
        }


class ClusterConfig(BaseModel):
    """Schema for cluster-specific configuration"""
    combination_id: str = Field(
        ..., 
        description="Combination ID that identifies the specific model combination (e.g., 'iceland_gb_small_multi_branston')"
    )
    scenario_defs: Optional[Dict[str, ScenarioDefinition]] = Field(
        default={}, 
        description="Cluster-specific scenario definitions"
    )


class IdentifierFilter(BaseModel):
    """Schema for identifier filtering in the request"""
    column: str = Field(..., description="Column name to filter on")
    values: List[str] = Field(..., description="List of values to include")


class ViewConfig(BaseModel):
    """Schema for view configuration with selected identifiers"""
    selected_identifiers: Dict[str, Dict[str, List[str]]] = Field(
        ..., 
        description="Selected identifiers for this view. Format: {'id1': {'column_name': ['value1', 'value2']}, 'id2': {...}}"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "selected_identifiers": {
                    "id1": {"Brand": ["heinz", "pl std", "daddies"]},
                    "id2": {"Channel": ["supermarkets"]},
                    "id3": {"PPG": ["large", "medium", "small", "xl"]}
                }
            }
        }


class RunRequest(BaseModel):
    """Request schema for POST /run endpoint"""
    model_id: str = Field(..., description="Model _id to fetch and process")
    scenario_id: str = Field(..., description="Scenario ID (e.g., 'scenario1', 'scenario2', etc.)")
    start_date: str = Field(..., description="Start date for the scenario period (YYYY-MM-DD format)")
    end_date: str = Field(..., description="End date for the scenario period (YYYY-MM-DD format)")
    stat: str = Field(..., description="Statistical measure to use: 'period-mean', 'period-median', etc.")
    clusters: Optional[List[ClusterConfig]] = Field(default=[], description="List of cluster-specific configurations")
    views: Dict[str, ViewConfig] = Field(..., description="Multiple view configurations for result processing")
    
    class Config:
        schema_extra = {
            "example": {
                "model_id": "default_client/default_app/default_project",
                "scenario_id": "scenario1",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "stat": "period-mean",
                "clusters": [
                    {
                        "combination_id": "supermarkets_small_multi_heinz_standard_",
                        "scenario_defs": {
                            "Price": {"type": "pct", "value": 10},
                            "Marketing_Spend": {"type": "pct", "value": -5}
                        }
                    },
                    {
                        "combination_id": "supermarkets_small_single_branston",
                        "scenario_defs": {
                            "Price": {"type": "pct", "value": 15}
                        }
                    }
                ],
                "views": {
                    "view_1": {
                        "selected_identifiers": {
                            "id1": {"Brand": ["heinz", "pl std", "daddies"]},
                            "id2": {"Channel": ["supermarkets"]},
                            "id3": {"PPG": ["large", "medium", "small", "xl"]}
                        }
                    },
                    "view_2": {
                        "selected_identifiers": {
                            "id1": {"Channel": ["supermarkets"]},
                            "id2": {"Brand": ["heinz", "pl std", "daddies"]}
                        }
                    },
                    "view_3": {
                        "selected_identifiers": {
                            "id1": {"PPG": ["xl", "large"]},
                            "id2": {"Brand": ["pl std", "heinz"]},
                            "id3": {"Channel": ["supermarkets"]}
                        }
                    }
                }
            }
        }


class RunResponse(BaseModel):
    """Response schema for POST /run endpoint"""
    run_id: str = Field(..., description="Unique identifier for this scenario run")
    dataset_used: str = Field(..., description="Dataset key used for this run")
    created_at: str = Field(..., description="ISO timestamp when the run was created")
    models_processed: int = Field(..., description="Number of models processed")
    y_variable: str = Field(..., description="The target variable being analyzed/predicted")
    view_results: Dict[str, Dict[str, Any]] = Field(..., description="Results organized by view ID")




# ----------  Status ----------
class StatusResponse(BaseModel):
    run_id: str = Field(..., description="Unique identifier for the scenario run")
    status: str = Field(..., description="Current status of the run")
    missing_clusters: Optional[List[Dict]] = Field(None, description="List of missing clusters")
    output_keys: Optional[Dict[str, str]] = Field(None, description="Output file keys")


# ----------  Identifiers endpoint ----------
class IdentifiersResponse(BaseModel):
    """Response schema for GET /identifiers endpoint"""
    identifier_columns: List[str] = Field(..., description="List of column names that can be used as identifiers")
    identifier_values: Dict[str, List[str]] = Field(..., description="Mapping of each column to its unique values")
    total_combinations: int = Field(..., description="Total number of model combinations")
    message: str = Field(..., description="Response message")


# ----------  Features endpoint ----------
class FeaturesResponse(BaseModel):
    """Response schema for GET /features endpoint"""
    features_by_model: Dict[str, Dict[str, Any]] = Field(..., description="Features grouped by model training ID")
    all_unique_features: List[str] = Field(..., description="Combined list of all unique features across models")


# ----------  Cache clear endpoint ----------
class CacheClearResponse(BaseModel):
    """Response schema for DELETE /cache/all endpoint"""
    message: str = Field(..., description="Cache operation result message")


# ────────────────────────────────────────────────────────────────────────────
#  Single Combination Reference Endpoint Request/Response
# ────────────────────────────────────────────────────────────────────────────
class SingleCombinationReferenceRequest(BaseModel):
    """Request schema for POST /api/scenario/single-combination-reference endpoint"""
    model_id: str = Field(
        ...,
        description="Model _id to fetch and process"
    )
    stat: str = Field(
        ...,
        description="Statistic to calculate: mean, median, sum, min, max, period-mean, period-median, period-sum, period-min, period-max, rolling-mean"
    )
    start_date: str = Field(
        ...,
        description="Start date for period-based calculations (YYYY-MM-DD)"
    )
    end_date: str = Field(
        ...,
        description="End date for period-based calculations (YYYY-MM-DD)"
    )
    combination: Dict[str, str] = Field(
        ...,
        description="Single combination identifiers (e.g., {'Category': 'Beverages', 'SubCategory': 'Soft Drinks'})"
    )
    features: List[str] = Field(
        ...,
        description="List of selected feature names to calculate reference values for"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "stat": "period-mean",
                "start_date": "2023-01-01",
                "end_date": "2023-12-31",
                "combination": {
                    "Category": "Beverages",
                    "SubCategory": "Soft Drinks"
                },
                "features": ["PFCE", "IIP", "Sales"]
            }
        }

class SingleCombinationReferenceResponse(BaseModel):
    """Response schema for POST /api/scenario/single-combination-reference endpoint"""
    combination: Dict[str, str] = Field(
        ...,
        description="The combination identifiers that were processed"
    )
    features: List[str] = Field(
        ...,
        description="List of features that were processed"
    )
    reference_values: Dict[str, float] = Field(
        ...,
        description="Dictionary mapping feature names to their reference values"
    )
    statistic_used: str = Field(
        ...,
        description="The statistic that was applied (e.g., period-mean, median)"
    )
    date_range: Dict[str, str] = Field(
        ...,
        description="The date range used for calculation"
    )
    data_info: Dict[str, Any] = Field(
        ...,
        description="Information about the dataset used for calculation"
    )
    message: str = Field(
        ...,
        description="Human-readable message about the calculation"
    )

class AutoPopulateReferenceRequest(BaseModel):
    """Request schema for POST /api/scenario/auto-populate-reference endpoint"""
    model_id: str = Field(
        ...,
        description="Model _id to fetch and process"
    )
    stat: str = Field(
        ...,
        description="Statistic to calculate: mean, median, sum, min, max, period-mean, period-median, period-sum, period-min, period-max, rolling-mean"
    )
    start_date: str = Field(
        ...,
        description="Start date for period-based calculations (YYYY-MM-DD)"
    )
    end_date: str = Field(
        ...,
        description="End date for period-based calculations (YYYY-MM-DD)"
    )
    combination_ids: List[str] = Field(
        ...,
        description="List of combination IDs to fetch reference values for"
    )
    features: List[str] = Field(
        ...,
        description="List of selected feature names to calculate reference values for"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "model_id": "default_client/default_app/default_project",
                "stat": "period-mean",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "combination_ids": ["cat1_supermarkets_allppg", "cat1_convenience_allppg"],
                "features": ["PFCE", "IIP", "Sales"]
            }
        }

class AutoPopulateReferenceResponse(BaseModel):
    """Response schema for POST /api/scenario/auto-populate-reference endpoint"""
    reference_values_by_combination: Dict[str, Dict[str, float]] = Field(
        ...,
        description="Dictionary mapping combination_id to feature reference values"
    )
    statistic_used: str = Field(
        ...,
        description="The statistic that was applied (e.g., period-mean, median)"
    )
    date_range: Dict[str, str] = Field(
        ...,
        description="The date range used for calculation"
    )
    data_info: Dict[str, Any] = Field(
        ...,
        description="Information about the dataset used for calculation"
    )
    processed_combinations: List[str] = Field(
        ...,
        description="List of combination IDs that were successfully processed"
    )
    failed_combinations: List[str] = Field(
        ...,
        description="List of combination IDs that failed to process"
    )

# ────────────────────────────────────────────────────────────────────────────
#  Reference Endpoint Request/Response
# ────────────────────────────────────────────────────────────────────────────
class ReferenceRequest(BaseModel):
    """Request schema for POST /api/scenario/reference endpoint"""
    model_id: str = Field(
        ...,
        description="Model _id to fetch and process"
    )
    stat: str = Field(
        ...,
        description="Statistic to calculate: mean, median, sum, min, max, period-mean, period-median, period-sum, period-min, period-max, rolling-mean"
    )
    start_date: str = Field(
        ...,
        description="Start date for period-based calculations (YYYY-MM-DD)"
    )
    end_date: str = Field(
        ...,
        description="End date for period-based calculations (YYYY-MM-DD)"
    )
    
    class Config:
        schema_extra = {
            "example": {
                "model_id": "default_client/default_app/default_project",
                "stat": "period-mean",
                "start_date": "2023-01-01",
                "end_date": "2023-12-31"
            }
        }

class ReferenceResponse(BaseModel):
    """Response schema for POST /api/scenario/reference endpoint"""
    reference_values_by_combination: Dict[str, Dict[str, Any]] = Field(
        ...,
        description="Dictionary mapping combination IDs to their reference data including identifiers, features, and reference values"
    )
    statistic_used: str = Field(
        ...,
        description="The statistic that was applied (e.g., period-mean, median)"
    )
    date_range: Dict[str, str] = Field(
        ...,
        description="The date range used for calculation"
    )
    data_info: Dict[str, Any] = Field(
        ...,
        description="Information about the dataset used for calculation"
    )
    message: str = Field(
        ...,
        description="Human-readable message about the calculation"
    )

# ────────────────────────────────────────────────────────────────────────────
#  Scenario Values Endpoint Request/Response
# ────────────────────────────────────────────────────────────────────────────
class ScenarioValuesRequest(BaseModel):
    """Request schema for POST /api/scenario/scenario-values endpoint"""
    start_date: str = Field(..., description="Start date for the scenario period (YYYY-MM-DD format)")
    end_date: str = Field(..., description="End date for the scenario period (YYYY-MM-DD format)")
    stat: str = Field(..., description="Statistical measure to use: 'period-mean', 'period-median', etc.")
    clusters: Optional[List[ClusterConfig]] = Field(default=[], description="List of cluster-specific configurations")
    
    class Config:
        schema_extra = {
            "example": {
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "stat": "period-mean",
                "clusters": [
                    {
                        "combination_id": "iceland_gb_small_multi_branston",
                        "scenario_defs": {
                            "PFCE": {"type": "pct", "value": 2},
                            "IIP": {"type": "pct", "value": 1}
                        }
                    }
                ]
            }
        }

class ScenarioValuesResponse(BaseModel):
    """Response schema for POST /api/scenario/scenario-values endpoint"""
    scenario_values_by_model: Dict[str, Dict[str, Any]] = Field(
        ...,
        description="Dictionary mapping model IDs to their scenario data including identifiers, features, scenario values, and percentage changes"
    )
    reference_values_by_model: Dict[str, Dict[str, Any]] = Field(
        ...,
        description="Dictionary mapping model IDs to their reference data including identifiers, features, and reference values"
    )
    applied_changes: Dict[str, Dict[str, Any]] = Field(
        ...,
        description="Summary of what changes were applied to each model including percentage changes summary"
    )
    scenario_config: Dict[str, Any] = Field(
        ...,
        description="Configuration used for scenario calculation including statistic and date range"
    )
    data_info: Dict[str, Any] = Field(
        ...,
        description="Information about the dataset used for calculation"
    )
    message: str = Field(
        ...,
        description="Human-readable message about the calculation"
    )
    scenario_id: Optional[str] = Field(
        None,
        description="Unique MongoDB ID for this scenario values calculation"
    )
    saved_at: Optional[str] = Field(
        None,
        description="ISO timestamp when the scenario values were saved to MongoDB"
    )

# ────────────────────────────────────────────────────────────────────────────
#  Cache Management Responses
# ────────────────────────────────────────────────────────────────────────────
