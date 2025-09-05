from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any, Union
from datetime import datetime


#########POST /autoreg/train-autoregressive-models-direct

class AutoregressiveModelConfig(BaseModel):
    """Configuration for autoregressive models."""
    forecast_horizon: int = Field(12, ge=1, le=60, description="Number of periods to forecast")
    fiscal_start_month: int = Field(1, ge=1, le=12, description="Fiscal year start month (1-12)")
    frequency: str = Field("M", description="Data frequency: 'D' (daily), 'W' (weekly), 'M' (monthly), 'Q' (quarterly), 'Y' (yearly)")
    models_to_run: Optional[List[str]] = Field(None, description="List of model names to run. If None, runs all models")

class AutoregressiveTrainingResponse(BaseModel):
    """Response for autoregressive model training endpoint."""
    run_id: str
    status: str
    message: str
    scope_id: str
    set_name: str
    total_combinations: int
    processed_combinations: int
    results: List[Dict[str, Any]]


#########Legacy schemas for backward compatibility

