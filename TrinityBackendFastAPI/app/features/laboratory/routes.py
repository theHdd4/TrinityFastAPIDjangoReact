from __future__ import annotations

from datetime import datetime
from uuid import uuid4
import logging

from fastapi import APIRouter, HTTPException, Query

from .models import (
    LaboratoryAtomResponse,
    LaboratoryCardRequest,
    LaboratoryCardResponse,
    LaboratoryVariableDefinition,
    LaboratoryVariableResponse,
    LaboratoryVariableListResponse,
    LaboratoryVariableRecord,
    VariableComputeRequest,
    VariableComputeResponse,
    VariableAssignRequest,
    VariableAssignResponse,
)
from .mongodb_saver import save_variable_definition, save_variable_to_project, get_config_variable_collection
from fastapi import APIRouter, HTTPException, WebSocket

from .models import LaboratoryAtomResponse, LaboratoryCardRequest, LaboratoryCardResponse
from .websocket import handle_laboratory_sync

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/cards", response_model=LaboratoryCardResponse)
async def create_laboratory_card(payload: LaboratoryCardRequest) -> LaboratoryCardResponse:
    """Create a laboratory card scaffold for the frontend workspace."""

    card_id = f"card-{uuid4().hex}"
    atoms = []
    
    # Create atom only if atomId is provided
    if payload.atom_id and payload.atom_id.strip():
        atom_id = payload.atom_id.strip()
        atom_instance_id = f"{atom_id}-{uuid4().hex}"

        atom_response = LaboratoryAtomResponse(
            id=atom_instance_id,
            atomId=atom_id,
            source=payload.source,
            llm=payload.llm,
            settings=payload.settings,
        )
        atoms = [atom_response]

    return LaboratoryCardResponse(
        id=card_id,
        atoms=atoms,  # Empty list if no atomId provided
        molecule_id=payload.molecule_id,
        molecule_title=None,
    )


@router.post("/variables/compute", response_model=VariableComputeResponse)
async def compute_variables(payload: VariableComputeRequest) -> VariableComputeResponse:
    """Compute variables based on operations for whole dataframe or within groups and save to MongoDB."""
    import pandas as pd
    import pyarrow as pa
    import pyarrow.ipc as ipc
    import io
    from urllib.parse import unquote
    from app.features.createcolumn.deps import minio_client, MINIO_BUCKET
    from .mongodb_saver import save_variable_definition
    from datetime import datetime
    import json
    
    logger.info(f"🔍 Variable compute request received: dataSource={payload.dataSource}, computeMode={payload.computeMode}, operations={len(payload.operations)}")
    
    try:
        # Check if we need to load dataframe (only if operations involve columns)
        df = None
        object_name = None
        
        if payload.dataSource:
            # Load dataframe from MinIO
            object_name = unquote(payload.dataSource)
            
            # Try to get from MinIO
            try:
                response = minio_client.get_object(MINIO_BUCKET, object_name)
                content = response.read()
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")
            
            # Load dataframe
            if object_name.endswith(".arrow"):
                reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
                df = reader.read_all().to_pandas()
            else:
                df = pd.read_csv(io.BytesIO(content))
            
            # Convert column names to lowercase for case-insensitive matching
            df.columns = df.columns.str.lower()
        
        # Validate operations
        if not payload.operations:
            raise HTTPException(status_code=422, detail="At least one operation is required")
        
        # Extract client/app/project from payload or object_name
        client_id = payload.client_name or ""
        app_id = payload.app_name or ""
        project_id = payload.project_name or ""
        
        if not client_id or not app_id or not project_id:
            # Try to extract from object_name path
            path_parts = object_name.split('/')
            if len(path_parts) >= 3:
                client_id = client_id or path_parts[0]
                app_id = app_id or path_parts[1]
                project_id = project_id or path_parts[2]
        
        if not client_id or not app_id or not project_id:
            raise HTTPException(status_code=422, detail="client_name, app_name, and project_name are required")
        
        # Helper function to get variable value from MongoDB
        async def get_variable_value(var_name: str) -> tuple[bool, float | None]:
            """Check if var_name is a variable and return its value. Returns (is_variable, value)."""
            try:
                doc_id = f"{client_id}/{app_id}/{project_id}"
                collection = get_config_variable_collection()
                document = await collection.find_one({"_id": doc_id})
                if document:
                    variables = document.get("variables", {})
                    if var_name in variables:
                        var_data = variables[var_name]
                        value_str = var_data.get("value", "")
                        try:
                            return True, float(value_str)
                        except (ValueError, TypeError):
                            return True, None
                return False, None
            except Exception:
                return False, None
        
        valid_methods = ['sum', 'mean', 'median', 'max', 'min', 'count', 'nunique', 'rank_pct', 'add', 'subtract', 'multiply', 'divide']
        created_variables = []
        
        for op in payload.operations:
            logger.info(f"🔍 Validating operation: numericalColumn={op.numericalColumn}, method={op.method}, secondColumn={op.secondColumn}, secondValue={op.secondValue}")
            
            if op.method not in valid_methods:
                logger.error(f"❌ Invalid method: {op.method}")
                raise HTTPException(status_code=422, detail=f"Invalid method '{op.method}'. Must be one of: {valid_methods}")
            
            # Check if numericalColumn is a variable or a column
            is_var_col1, var_value_col1 = await get_variable_value(op.numericalColumn)
            in_df_columns = df is not None and op.numericalColumn in df.columns
            logger.info(f"🔍 First operand '{op.numericalColumn}': is_variable={is_var_col1}, value={var_value_col1}, in_df_columns={in_df_columns}")
            
            if not is_var_col1 and not in_df_columns:
                logger.error(f"❌ Column or variable '{op.numericalColumn}' not found")
                raise HTTPException(status_code=422, detail=f"Column or variable '{op.numericalColumn}' not found")
            
            # If using a column, ensure dataframe is loaded
            if not is_var_col1 and df is None:
                raise HTTPException(status_code=422, detail="Data source is required when using columns")
            
            # For arithmetic operations, validate second column or value
            is_var_col2 = False
            var_value_col2 = None
            if op.method in ['add', 'subtract', 'multiply', 'divide']:
                if not op.secondColumn and op.secondValue is None:
                    logger.error(f"❌ Arithmetic operation requires secondColumn or secondValue")
                    raise HTTPException(status_code=422, detail=f"secondColumn or secondValue is required for method '{op.method}'")
                if op.secondColumn:
                    is_var_col2, var_value_col2 = await get_variable_value(op.secondColumn)
                    in_df_columns_col2 = df is not None and op.secondColumn in df.columns
                    logger.info(f"🔍 Second operand '{op.secondColumn}': is_variable={is_var_col2}, value={var_value_col2}, in_df_columns={in_df_columns_col2}")
                    if not is_var_col2 and not in_df_columns_col2:
                        logger.error(f"❌ Second column or variable '{op.secondColumn}' not found")
                        raise HTTPException(status_code=422, detail=f"Second column or variable '{op.secondColumn}' not found")
        
        # Check for existing variables before computing (only for whole-dataframe mode)
        existing_variable_names = []
        if payload.computeMode == "whole-dataframe":
            doc_id = f"{client_id}/{app_id}/{project_id}"
            collection = get_config_variable_collection()
            existing_doc = await collection.find_one({"_id": doc_id})
            if existing_doc:
                existing_variables = existing_doc.get("variables", {})
                
                # Check which variables would be created/updated
                for op in payload.operations:
                    # Generate variable name
                    if op.customName and op.customName.strip():
                        var_name = op.customName.strip()
                    else:
                        if op.method in ['add', 'subtract', 'multiply', 'divide']:
                            if op.secondColumn:
                                var_name = f"{op.numericalColumn}_{op.method}_{op.secondColumn}"
                            elif op.secondValue is not None:
                                var_name = f"{op.numericalColumn}_{op.method}_{op.secondValue}"
                            else:
                                var_name = f"{op.numericalColumn}_{op.method}"
                        else:
                            var_name = f"{op.numericalColumn}_{op.method}"
                    
                    if var_name in existing_variables:
                        existing_variable_names.append(var_name)
            
            # If variables exist and not confirmed, return conflict
            if existing_variable_names and not payload.confirmOverwrite:
                return VariableComputeResponse(
                    success=False,
                    error=f"Variables already exist: {', '.join(existing_variable_names)}. Confirm to overwrite.",
                    existingVariables=existing_variable_names,
                )
        
        # Perform operations based on compute mode
        if payload.computeMode == "whole-dataframe":
            # Create one variable per operation with scalar value
            for op in payload.operations:
                # Get variable values if they are variables
                is_var_col1, var_value_col1 = await get_variable_value(op.numericalColumn)
                is_var_col2, var_value_col2 = await get_variable_value(op.secondColumn) if op.secondColumn else (False, None)
                
                # Use custom name if provided, otherwise generate default name
                if op.customName and op.customName.strip():
                    variable_name = op.customName.strip()
                else:
                    # Include both columns in variable name for arithmetic operations
                    if op.method in ['add', 'subtract', 'multiply', 'divide']:
                        if op.secondColumn:
                            variable_name = f"{op.numericalColumn}_{op.method}_{op.secondColumn}"
                        elif op.secondValue is not None:
                            variable_name = f"{op.numericalColumn}_{op.method}_{op.secondValue}"
                        else:
                            variable_name = f"{op.numericalColumn}_{op.method}"
                    else:
                        variable_name = f"{op.numericalColumn}_{op.method}"
                value = None
                
                # Handle operations with variables or columns
                if is_var_col1:
                    # First operand is a variable (constant value)
                    col1_value = var_value_col1
                    if col1_value is None:
                        raise HTTPException(status_code=422, detail=f"Variable '{op.numericalColumn}' has no valid numeric value")
                    
                    if op.method == 'sum':
                        value = float(col1_value)
                    elif op.method == 'mean':
                        value = float(col1_value)
                    elif op.method == 'median':
                        value = float(col1_value)
                    elif op.method == 'max':
                        value = float(col1_value)
                    elif op.method == 'min':
                        value = float(col1_value)
                    elif op.method == 'count':
                        value = 1.0  # Constant has count of 1
                    elif op.method == 'nunique':
                        value = 1.0  # Constant has 1 unique value
                    elif op.method == 'rank_pct':
                        value = 0.5  # Constant rank percentile
                    elif op.method == 'add':
                        if op.secondValue is not None:
                            value = float(col1_value + op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            value = float(col1_value + var_value_col2)
                        else:
                            value = float(col1_value + df[op.secondColumn].sum())
                    elif op.method == 'subtract':
                        if op.secondValue is not None:
                            value = float(col1_value - op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            value = float(col1_value - var_value_col2)
                        else:
                            value = float(col1_value - df[op.secondColumn].sum())
                    elif op.method == 'multiply':
                        if op.secondValue is not None:
                            value = float(col1_value * op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            value = float(col1_value * var_value_col2)
                        else:
                            value = float(col1_value * df[op.secondColumn].sum())
                    elif op.method == 'divide':
                        if op.secondValue is not None:
                            if op.secondValue == 0:
                                raise HTTPException(status_code=422, detail="Division by zero")
                            value = float(col1_value / op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            if var_value_col2 == 0:
                                raise HTTPException(status_code=422, detail="Division by zero")
                            value = float(col1_value / var_value_col2)
                        else:
                            if df is None:
                                raise HTTPException(status_code=422, detail="Data source is required when using columns")
                            col2_sum = df[op.secondColumn].sum()
                            if col2_sum == 0:
                                raise HTTPException(status_code=422, detail="Division by zero")
                            value = float(col1_value / col2_sum)
                else:
                    # First operand is a column
                    if op.method == 'sum':
                        value = float(df[op.numericalColumn].sum())
                    elif op.method == 'mean':
                        value = float(df[op.numericalColumn].mean())
                    elif op.method == 'median':
                        value = float(df[op.numericalColumn].median())
                    elif op.method == 'max':
                        value = float(df[op.numericalColumn].max())
                    elif op.method == 'min':
                        value = float(df[op.numericalColumn].min())
                    elif op.method == 'count':
                        value = float(len(df))
                    elif op.method == 'nunique':
                        value = float(df[op.numericalColumn].nunique())
                    elif op.method == 'rank_pct':
                        # For rank_pct in whole-dataframe, use mean rank percentile
                        value = float(df[op.numericalColumn].rank(pct=True).mean())
                    elif op.method == 'add':
                        if op.secondValue is not None:
                            value = float(df[op.numericalColumn].sum() + op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            value = float(df[op.numericalColumn].sum() + var_value_col2)
                        else:
                            value = float(df[op.numericalColumn].sum() + df[op.secondColumn].sum())
                    elif op.method == 'subtract':
                        if op.secondValue is not None:
                            value = float(df[op.numericalColumn].sum() - op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            value = float(df[op.numericalColumn].sum() - var_value_col2)
                        else:
                            value = float(df[op.numericalColumn].sum() - df[op.secondColumn].sum())
                    elif op.method == 'multiply':
                        if op.secondValue is not None:
                            value = float(df[op.numericalColumn].sum() * op.secondValue)
                        elif is_var_col2 and var_value_col2 is not None:
                            value = float(df[op.numericalColumn].sum() * var_value_col2)
                        else:
                            value = float(df[op.numericalColumn].sum() * df[op.secondColumn].sum())
                    elif op.method == 'divide':
                        if op.secondValue is not None:
                            value = float((df[op.numericalColumn] / op.secondValue).sum())
                        elif is_var_col2 and var_value_col2 is not None:
                            if var_value_col2 == 0:
                                raise HTTPException(status_code=422, detail="Division by zero")
                            value = float((df[op.numericalColumn] / var_value_col2).sum())
                        else:
                            value = float((df[op.numericalColumn] / df[op.secondColumn].replace(0, pd.NA)).sum())
                
                # Create variable document
                second_operand_desc = ""
                if op.method in ['add', 'subtract', 'multiply', 'divide']:
                    if op.secondColumn:
                        second_operand_desc = f" and {op.secondColumn}"
                    elif op.secondValue is not None:
                        second_operand_desc = f" and {op.secondValue}"
                
                variable_doc = {
                    "variable_name": variable_name,
                    "description": f"Computed {op.method} of {op.numericalColumn}" + second_operand_desc,
                    "usage_summary": f"Whole dataframe {op.method} operation",
                    "value": str(value),
                    "client_id": client_id,
                    "app_id": app_id,
                    "project_id": project_id,
                    "project_name": project_id,
                    "metadata": {
                        "data_source": object_name,
                        "compute_mode": payload.computeMode,
                        "operation": {
                            "numericalColumn": op.numericalColumn,
                            "method": op.method,
                            "secondColumn": op.secondColumn,
                            "secondValue": op.secondValue,
                        },
                    },
                }
                
                save_result = await save_variable_to_project(variable_doc)
                if save_result.get("status") == "success":
                    created_variables.append(variable_name)
        
        elif payload.computeMode == "within-group":
            # Validate identifiers
            if not payload.identifiers:
                raise HTTPException(status_code=422, detail="identifiers are required for within-group mode")
            
            # Validate all identifiers exist
            missing_ids = [id_col for id_col in payload.identifiers if id_col not in df.columns]
            if missing_ids:
                raise HTTPException(status_code=422, detail=f"Identifier columns not found: {missing_ids}")
            
            # Reset index if any identifier is in the index
            df = df.reset_index() if any(x in df.index.names for x in payload.identifiers) else df
            
            # Group by identifiers and perform operations
            for op in payload.operations:
                # Get variable values if they are variables
                is_var_col1, var_value_col1 = await get_variable_value(op.numericalColumn)
                is_var_col2, var_value_col2 = await get_variable_value(op.secondColumn) if op.secondColumn else (False, None)
                
                # Compute grouped values
                if is_var_col1:
                    # First operand is a variable - create constant column
                    col1_value = var_value_col1
                    if col1_value is None:
                        raise HTTPException(status_code=422, detail=f"Variable '{op.numericalColumn}' has no valid numeric value")
                    df_temp = df.copy()
                    df_temp[op.numericalColumn] = col1_value
                else:
                    df_temp = df
                
                if op.method == 'sum':
                    grouped = df_temp.groupby(payload.identifiers)[op.numericalColumn].sum().reset_index()
                elif op.method == 'mean':
                    grouped = df_temp.groupby(payload.identifiers)[op.numericalColumn].mean().reset_index()
                elif op.method == 'median':
                    grouped = df_temp.groupby(payload.identifiers)[op.numericalColumn].median().reset_index()
                elif op.method == 'max':
                    grouped = df_temp.groupby(payload.identifiers)[op.numericalColumn].max().reset_index()
                elif op.method == 'min':
                    grouped = df_temp.groupby(payload.identifiers)[op.numericalColumn].min().reset_index()
                elif op.method == 'count':
                    grouped = df_temp.groupby(payload.identifiers).size().reset_index(name=op.numericalColumn)
                elif op.method == 'nunique':
                    grouped = df_temp.groupby(payload.identifiers)[op.numericalColumn].nunique().reset_index()
                elif op.method == 'rank_pct':
                    # For rank_pct, first aggregate with 'first', then apply rank
                    grouped_first = df_temp.groupby(payload.identifiers)[op.numericalColumn].first().reset_index(name=f"temp_rank_col")
                    grouped_first[op.numericalColumn] = grouped_first['temp_rank_col'].rank(pct=True)
                    grouped = grouped_first.drop(columns=['temp_rank_col'])
                elif op.method == 'add':
                    # Group first, then add the grouped sums
                    grouped_col1 = df_temp.groupby(payload.identifiers)[op.numericalColumn].sum().reset_index(name="col1_sum")
                    if op.secondValue is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] + op.secondValue
                    elif is_var_col2 and var_value_col2 is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] + var_value_col2
                    else:
                        if is_var_col2:
                            # Second operand is a variable - create constant column
                            df_temp2 = df_temp.copy()
                            df_temp2[op.secondColumn] = var_value_col2
                        else:
                            df_temp2 = df_temp
                        grouped_col2 = df_temp2.groupby(payload.identifiers)[op.secondColumn].sum().reset_index(name="col2_sum")
                        grouped = grouped_col1.merge(grouped_col2, on=payload.identifiers)
                        grouped[op.numericalColumn] = grouped["col1_sum"] + grouped["col2_sum"]
                    grouped = grouped.drop(columns=["col1_sum"])
                elif op.method == 'subtract':
                    # Group first, then subtract the grouped sums
                    grouped_col1 = df_temp.groupby(payload.identifiers)[op.numericalColumn].sum().reset_index(name="col1_sum")
                    if op.secondValue is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] - op.secondValue
                    elif is_var_col2 and var_value_col2 is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] - var_value_col2
                    else:
                        if is_var_col2:
                            # Second operand is a variable - create constant column
                            df_temp2 = df_temp.copy()
                            df_temp2[op.secondColumn] = var_value_col2
                        else:
                            df_temp2 = df_temp
                        grouped_col2 = df_temp2.groupby(payload.identifiers)[op.secondColumn].sum().reset_index(name="col2_sum")
                        grouped = grouped_col1.merge(grouped_col2, on=payload.identifiers)
                        grouped[op.numericalColumn] = grouped["col1_sum"] - grouped["col2_sum"]
                    grouped = grouped.drop(columns=["col1_sum"])
                elif op.method == 'multiply':
                    # Group first, then multiply the grouped sums
                    grouped_col1 = df_temp.groupby(payload.identifiers)[op.numericalColumn].sum().reset_index(name="col1_sum")
                    if op.secondValue is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] * op.secondValue
                    elif is_var_col2 and var_value_col2 is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] * var_value_col2
                    else:
                        if is_var_col2:
                            # Second operand is a variable - create constant column
                            df_temp2 = df_temp.copy()
                            df_temp2[op.secondColumn] = var_value_col2
                        else:
                            df_temp2 = df_temp
                        grouped_col2 = df_temp2.groupby(payload.identifiers)[op.secondColumn].sum().reset_index(name="col2_sum")
                        grouped = grouped_col1.merge(grouped_col2, on=payload.identifiers)
                        grouped[op.numericalColumn] = grouped["col1_sum"] * grouped["col2_sum"]
                    grouped = grouped.drop(columns=["col1_sum"])
                elif op.method == 'divide':
                    # Group first, then divide the grouped sums
                    grouped_col1 = df_temp.groupby(payload.identifiers)[op.numericalColumn].sum().reset_index(name="col1_sum")
                    if op.secondValue is not None:
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] / op.secondValue if op.secondValue != 0 else pd.NA
                    elif is_var_col2 and var_value_col2 is not None:
                        if var_value_col2 == 0:
                            raise HTTPException(status_code=422, detail="Division by zero")
                        grouped = grouped_col1.copy()
                        grouped[op.numericalColumn] = grouped["col1_sum"] / var_value_col2
                    else:
                        if is_var_col2:
                            # Second operand is a variable - create constant column
                            df_temp2 = df_temp.copy()
                            df_temp2[op.secondColumn] = var_value_col2
                        else:
                            df_temp2 = df_temp
                        grouped_col2 = df_temp2.groupby(payload.identifiers)[op.secondColumn].sum().reset_index(name="col2_sum")
                        grouped = grouped_col1.merge(grouped_col2, on=payload.identifiers)
                        grouped[op.numericalColumn] = grouped["col1_sum"] / grouped["col2_sum"].replace(0, pd.NA)
                    grouped = grouped.drop(columns=["col1_sum"])
                
                # Create a variable for each identifier combination
                for _, row in grouped.iterrows():
                    # Build variable name with identifier values
                    identifier_values = [str(row[id_col]) for id_col in payload.identifiers]
                    identifier_suffix = "_".join([f"{id_col}_{val}" for id_col, val in zip(payload.identifiers, identifier_values)])
                    # Include both columns in variable name for arithmetic operations
                    if op.method in ['add', 'subtract', 'multiply', 'divide']:
                        if op.secondColumn:
                            variable_name = f"{op.numericalColumn}_{op.method}_{op.secondColumn}_{identifier_suffix}"
                        elif op.secondValue is not None:
                            variable_name = f"{op.numericalColumn}_{op.method}_{op.secondValue}_{identifier_suffix}"
                        else:
                            variable_name = f"{op.numericalColumn}_{op.method}_{identifier_suffix}"
                    else:
                        variable_name = f"{op.numericalColumn}_{op.method}_{identifier_suffix}"
                    
                    # Get value and handle NaN/None
                    raw_value = row[op.numericalColumn]
                    if pd.isna(raw_value) or raw_value is None:
                        continue
                    
                    # Convert to appropriate type
                    if isinstance(raw_value, (int, float)):
                        value = float(raw_value)
                    else:
                        value = str(raw_value)
                    
                    # Build identifier combination string
                    identifier_combination = "_".join([f"{id_col}_{val}" for id_col, val in zip(payload.identifiers, identifier_values)])
                    
                    # Create variable document
                    second_operand_desc = ""
                    if op.method in ['add', 'subtract', 'multiply', 'divide']:
                        if op.secondColumn:
                            second_operand_desc = f" and {op.secondColumn}"
                        elif op.secondValue is not None:
                            second_operand_desc = f" and {op.secondValue}"
                    
                    variable_doc = {
                        "variable_name": variable_name,
                        "description": f"Computed {op.method} of {op.numericalColumn}" + second_operand_desc + f" for {identifier_suffix}",
                        "usage_summary": f"Within-group {op.method} operation",
                        "value": str(value) if not isinstance(value, str) else value,
                        "client_id": client_id,
                        "app_id": app_id,
                        "project_id": project_id,
                        "project_name": project_id,
                        "metadata": {
                            "data_source": object_name,
                            "compute_mode": payload.computeMode,
                            "identifier_combination": identifier_combination,
                            "identifiers": {id_col.lower(): str(row[id_col]) for id_col in payload.identifiers},
                            "operation": {
                                "numericalColumn": op.numericalColumn,
                                "method": op.method,
                                "secondColumn": op.secondColumn,
                                "secondValue": op.secondValue,
                            },
                        },
                    }
                    
                    save_result = await save_variable_to_project(variable_doc)
                    if save_result.get("status") == "success":
                        created_variables.append(variable_name)
        
        return VariableComputeResponse(
            success=True,
            newColumns=created_variables,
        )
    
    except HTTPException as he:
        logger.error(f"❌ HTTP Exception in compute_variables: {he.status_code} - {he.detail}")
        raise
    except Exception as e:
        logger.exception(f"❌ Unexpected error in compute_variables: {str(e)}")
        return VariableComputeResponse(
            success=False,
            error=str(e),
        )


@router.post("/variables/assign", response_model=VariableAssignResponse)
async def assign_constant_variables(payload: VariableAssignRequest) -> VariableAssignResponse:
    """Assign constant values to variables and save to MongoDB."""
    try:
        client_id = payload.client_name or ""
        app_id = payload.app_name or ""
        project_id = payload.project_name or ""
        
        if not client_id or not app_id or not project_id:
            raise HTTPException(status_code=422, detail="client_name, app_name, and project_name are required")
        
        # Check for existing variables before assigning
        existing_variable_names = []
        doc_id = f"{client_id}/{app_id}/{project_id}"
        collection = get_config_variable_collection()
        existing_doc = await collection.find_one({"_id": doc_id})
        if existing_doc:
            existing_variables = existing_doc.get("variables", {})
            
            # Check which variables would be created/updated
            for assignment in payload.assignments:
                var_name = assignment.variableName.strip()
                if var_name and var_name in existing_variables:
                    existing_variable_names.append(var_name)
        
        # If variables exist and not confirmed, return conflict
        if existing_variable_names and not payload.confirmOverwrite:
            return VariableAssignResponse(
                success=False,
                error=f"Variables already exist: {', '.join(existing_variable_names)}. Confirm to overwrite.",
                existingVariables=existing_variable_names,
            )
        
        created_variables = []
        
        for assignment in payload.assignments:
            variable_name = assignment.variableName.strip()
            constant_value = assignment.value.strip()
            
            if not variable_name:
                continue
            
            # Create variable document
            variable_doc = {
                "variable_name": variable_name,
                "description": f"Constant value: {constant_value}",
                "usage_summary": "Constant assignment",
                "value": constant_value,
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "project_name": project_id,
                "metadata": {
                    "data_source": payload.dataSource,
                    "compute_mode": "constant",
                    "operation": {
                        "type": "constant_assignment",
                        "value": constant_value,
                    },
                },
            }
            
            save_result = await save_variable_to_project(variable_doc)
            if save_result.get("status") == "success":
                created_variables.append(variable_name)
        
        return VariableAssignResponse(
            success=True,
            new_variables=created_variables,
        )
    except HTTPException:
        raise
    except Exception as e:
        return VariableAssignResponse(
            success=False,
            error=str(e),
    )


@router.post("/variables", response_model=LaboratoryVariableResponse)
async def upsert_variable_definition(payload: LaboratoryVariableDefinition) -> LaboratoryVariableResponse:
    """Persist a card variable definition to MongoDB."""

    variable_name = payload.variable_name.strip()
    if not variable_name:
        raise HTTPException(status_code=422, detail="variableName is required")

    client_id = (payload.client_id or "").strip()
    app_id = (payload.app_id or "").strip()
    project_id = (payload.project_id or "").strip()

    if not client_id or not app_id or not project_id:
        raise HTTPException(status_code=422, detail="clientId, appId and projectId are required")

    variable_id = payload.id or f"variable-{uuid4().hex}"
    now = datetime.utcnow()

    document = {
        "_id": variable_id,
        "variable_name": variable_name,
        # Old calculation logic - commented out
        # "formula": payload.formula,
        # "value": payload.value,
        "description": payload.description,
        "usage_summary": payload.usage_summary,
        # Card-related fields - commented out
        # "card_id": payload.card_id,
        # "atom_id": payload.atom_id,
        # "origin_card_id": payload.origin_card_id,
        # "origin_variable_id": payload.origin_variable_id,
        "client_id": client_id,
        "app_id": app_id,
        "project_id": project_id,
        "project_name": payload.project_name,
        "created_at": payload.created_at or now,
        "updated_at": now,
    }

    save_result = await save_variable_definition(document)
    if save_result.get("status") == "conflict":
        raise HTTPException(status_code=409, detail=save_result.get("error", "Variable name already exists"))

    if save_result.get("status") != "success":
        raise HTTPException(status_code=500, detail=save_result.get("error", "Failed to persist variable definition"))

    return LaboratoryVariableResponse(
        id=variable_id,
        variableName=variable_name,
        # Old calculation logic - commented out
        # formula=payload.formula,
        # value=payload.value,
        description=payload.description,
        usageSummary=payload.usage_summary,
        # Card-related fields - commented out
        # cardId=payload.card_id,
        # atomId=payload.atom_id,
        # originCardId=payload.origin_card_id,
        # originVariableId=payload.origin_variable_id,
        clientId=client_id,
        appId=app_id,
        projectId=project_id,
        projectName=payload.project_name,
        createdAt=document["created_at"],
        updatedAt=now,
        status=save_result["status"],
        operation=save_result["operation"],
    )


@router.get("/variables", response_model=LaboratoryVariableListResponse)
async def list_variable_definitions(
    client_id: str = Query(..., alias="clientId"),
    app_id: str = Query(..., alias="appId"),
    project_id: str = Query(..., alias="projectId"),
) -> LaboratoryVariableListResponse:
    """Fetch variable definitions scoped to a specific client/app/project."""

    collection = get_config_variable_collection()

    # Document ID is client/app/project
    doc_id = f"{client_id}/{app_id}/{project_id}"
    
    document = await collection.find_one({"_id": doc_id})

    records = []
    if document:
        variables = document.get("variables", {})
        for variable_name, variable_data in variables.items():
            records.append(
                LaboratoryVariableRecord(
                    id=doc_id,
                    variableName=variable_name,
                    value=variable_data.get("value"),
                    description=variable_data.get("description"),
                    usageSummary=variable_data.get("usage_summary"),
                    metadata=variable_data.get("metadata", {}),
                    clientId=document.get("client_id"),
                    appId=document.get("app_id"),
                    projectId=document.get("project_id"),
                    projectName=document.get("project_name"),
                    createdAt=variable_data.get("created_at"),
                    updatedAt=variable_data.get("updated_at"),
                )
            )
    
    # Sort by updated_at descending
    records.sort(key=lambda x: x.updated_at if x.updated_at else datetime(1970, 1, 1), reverse=True)

    return LaboratoryVariableListResponse(variables=records)
@router.websocket("/sync/{client_name}/{app_name}/{project_name}")
async def laboratory_sync_websocket(
    websocket: WebSocket,
    client_name: str,
    app_name: str,
    project_name: str
):
    """
    WebSocket endpoint for real-time collaborative Laboratory Mode synchronization.
    
    Handles:
    - Real-time state broadcasting to all connected clients
    - Debounced persistence to MongoDB
    - Version tracking and conflict detection
    
    Path parameters:
    - client_name: Client identifier
    - app_name: Application identifier
    - project_name: Project identifier
    """
    await handle_laboratory_sync(websocket, client_name, app_name, project_name)
