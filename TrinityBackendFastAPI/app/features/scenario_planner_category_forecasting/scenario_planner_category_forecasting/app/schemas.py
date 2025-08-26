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
    identifiers: Dict[str, str] = Field(
        ..., 
        description="Cluster identifiers (e.g., {'Category': 'Beverages', 'SubCategory': 'Soft Drinks'})"
    )
    scenario_defs: Optional[Dict[str, ScenarioDefinition]] = Field(
        default={}, 
        description="Cluster-specific scenario definitions"
    )


class IdentifierFilter(BaseModel):
    """Schema for identifier filtering in the request"""
    column: str = Field(..., description="Column name to filter on")
    values: List[str] = Field(..., description="List of values to include")


class RunRequest(BaseModel):
    """Request schema for POST /run endpoint"""
    start_date: str = Field(..., description="Start date for the scenario period (YYYY-MM-DD format)")
    end_date: str = Field(..., description="End date for the scenario period (YYYY-MM-DD format)")
    stat: str = Field(..., description="Statistical measure to use: 'period-mean', 'period-median', etc.")
    clusters: Optional[List[ClusterConfig]] = Field(default=[], description="List of cluster-specific configurations")
    identifiers: Dict[str, IdentifierFilter] = Field(None, description="Identifier filters to apply to the results")
    
    class Config:
        schema_extra = {
            "example": {
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "stat": "period-mean",
                "clusters": [
                    {
                        "identifiers": {"SubCategory": "SPBIO+"},
                        "scenario_defs": {
                            "PFCE": {"type": "pct", "value": 2},
                            "IIP": {"type": "pct", "value": 1}
                        }
                    },
                    {
                        "identifiers": {"SubCategory": "Deluxe"},
                        "scenario_defs": {
                            "GDP": {"type": "pct", "value": -1}
                        }
                    }
                ],
                "identifiers": {
                    "Id_1": {
                        "column": "SubCategory",
                        "values": ["SPBIO+", "Deluxe"]
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
    flat: Optional[Dict] = Field(None, description="Flat aggregation results")
    hierarchy: Optional[List] = Field(None, description="Hierarchical aggregation results")
    individuals: Optional[List] = Field(None, description="Individual model results")


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
#  Reference Endpoint Request/Response
# ────────────────────────────────────────────────────────────────────────────
class ReferenceRequest(BaseModel):
    """Request schema for POST /api/scenario/reference endpoint"""
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
                "stat": "period-mean",
                "start_date": "2023-01-01",
                "end_date": "2023-12-31"
            }
        }

class ReferenceResponse(BaseModel):
    """Response schema for POST /api/scenario/reference endpoint"""
    reference_values_by_model: Dict[str, Dict[str, Any]] = Field(
        ...,
        description="Dictionary mapping model IDs to their reference data including identifiers, features, and reference values"
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
                        "identifiers": {"SubCategory": "SPBIO+"},
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
