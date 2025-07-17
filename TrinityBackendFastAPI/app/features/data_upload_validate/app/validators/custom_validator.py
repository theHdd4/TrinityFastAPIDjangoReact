# app/validation_utils.py - Enhanced validation function

import pandas as pd
import re
from typing import List, Dict, Any
from app.features.data_upload_validate.app.database import get_validation_config_from_mongo


def _infer_column_type(series: pd.Series) -> str:
    """Return simplified type name for a pandas Series."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_integer_dtype(series) and not pd.api.types.is_bool_dtype(series):
        return "integer"
    if pd.api.types.is_float_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "date"
    return "string"


def perform_enhanced_validation(files_data: List[tuple], validator_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enhanced validation: Check mandatory columns, auto-correct types, and provide detailed messages
    """
    file_results = {}
    overall_errors = []
    overall_warnings = []
    
    for file_key, df in files_data:
        file_errors = []
        file_warnings = []
        auto_corrections = []
        condition_failures = []  # ✅ ADD: Initialize condition_failures
        
        # Get expected schema
        expected_schema = validator_data.get("schemas", {}).get(file_key, {})
        if not expected_schema:
            file_errors.append(f"No schema found for file key '{file_key}'")
            file_results[file_key] = {
                "status": "failed",
                "errors": file_errors,
                "warnings": file_warnings,
                "auto_corrections": auto_corrections,
                "condition_failures": condition_failures  # ✅ ADD
            }
            continue
        
        expected_columns = [col["column"] for col in expected_schema.get("columns", [])]
        expected_types = expected_schema.get("column_types", {})
        
        # ✅ CHECK 1: Mandatory columns
        uploaded_columns = list(df.columns)
        missing_columns = [col for col in expected_columns if col not in uploaded_columns]
        extra_columns = [col for col in uploaded_columns if col not in expected_columns]
        
        if missing_columns:
            file_errors.append(f"Missing mandatory columns: {missing_columns}")
        
        if extra_columns:
            file_warnings.append(f"Extra columns found (allowed): {extra_columns}")
        
        # ✅ CHECK 2: Strict data type validation and optional conversion
        for col in uploaded_columns:
            if col in expected_types:
                expected_type = expected_types[col]
                actual_type = _infer_column_type(df[col])
                mismatch = False

                if expected_type == "numeric":
                    if actual_type not in ["numeric", "integer"]:
                        mismatch = True
                elif expected_type == "integer":
                    if actual_type != "integer":
                        mismatch = True
                else:
                    if actual_type != expected_type:
                        mismatch = True

                if mismatch:
                    file_errors.append(
                        f"Column '{col}' expected {expected_type} but got {actual_type}"
                    )

                try:
                    if expected_type == "numeric":
                        original_dtype = str(df[col].dtype)
                        if not ("int" in original_dtype or "float" in original_dtype):
                            df[col] = pd.to_numeric(df[col], errors='coerce')
                            if df[col].isna().any():
                                failed_rows = df[df[col].isna()].index.tolist()[:5]
                                file_errors.append(
                                    f"Column '{col}' contains non-numeric data that cannot be converted (rows: {failed_rows})"
                                )
                            else:
                                auto_corrections.append(
                                    f"Column '{col}' converted from {original_dtype} to numeric"
                                )

                    elif expected_type == "integer":
                        original_dtype = str(df[col].dtype)
                        if "int" not in original_dtype:
                            numeric_col = pd.to_numeric(df[col], errors='coerce')
                            if numeric_col.isna().any():
                                failed_rows = df[numeric_col.isna()].index.tolist()[:5]
                                file_errors.append(
                                    f"Column '{col}' contains non-integer data that cannot be converted (rows: {failed_rows})"
                                )
                            else:
                                df[col] = numeric_col.astype(int)
                                auto_corrections.append(
                                    f"Column '{col}' converted from {original_dtype} to integer"
                                )

                    elif expected_type == "string":
                        original_dtype = str(df[col].dtype)
                        if "object" not in original_dtype:
                            df[col] = df[col].astype(str)
                            auto_corrections.append(
                                f"Column '{col}' converted from {original_dtype} to string"
                            )

                    elif expected_type == "date":
                        original_dtype = str(df[col].dtype)
                        if not pd.api.types.is_datetime64_any_dtype(df[col]):
                            converted = pd.to_datetime(df[col], errors='coerce')
                            if converted.isna().any():
                                failed_rows = converted[converted.isna()].index.tolist()[:5]
                                file_errors.append(
                                    f"Column '{col}' contains invalid date formats that cannot be converted (rows: {failed_rows})"
                                )
                            else:
                                auto_corrections.append(
                                    f"Column '{col}' converted from {original_dtype} to datetime"
                                )
                            df[col] = converted

                except Exception as e:
                    file_errors.append(
                        f"Failed to convert column '{col}' to {expected_type}: {str(e)}"
                    )
        
        # ✅ MOVE OUTSIDE LOOP: CUSTOM CONDITIONS VALIDATION
        validator_atom_id = validator_data.get("validator_atom_id", "unknown")
        validation_config = get_validation_config_from_mongo(validator_atom_id, file_key)
        
        if validation_config:
            column_conditions = validation_config.get('column_conditions', {})
            print(f"🔍 Found validation config with {len(column_conditions)} column conditions")
            
            for col, conditions in column_conditions.items():
                if col in df.columns:
                    for condition in conditions:
                        operator = condition['operator']
                        value = condition['value']
                        error_message = condition['error_message']
                        severity = condition.get('severity', 'error')
                        
                        # Apply condition and get failed rows
                        failed_rows = apply_validation_condition(df[col], operator, value, col)
                        
                        if failed_rows:
                            condition_failure = {
                                "column": col,
                                "operator": operator,
                                "expected_value": value,
                                "error_message": error_message,
                                "severity": severity,
                                "failed_rows": failed_rows[:10],
                                "failed_count": len(failed_rows),
                                "failed_percentage": round((len(failed_rows) / len(df)) * 100, 2)
                            }
                            
                            condition_failures.append(condition_failure)
                            
                            # Add to errors or warnings based on severity
                            if severity == "error":
                                file_errors.append(f"Column '{col}': {error_message} ({len(failed_rows)} rows failed)")
                            else:
                                file_warnings.append(f"Column '{col}': {error_message} ({len(failed_rows)} rows failed)")
            
            # ✅ FIX: Move this INSIDE the if validation_config block (same indentation as the custom conditions loop above)
            column_frequencies = validation_config.get('column_frequencies', {})
            if column_frequencies:
                print(f"📅 Applying frequency validation to {len(column_frequencies)} columns")
                for col, frequency in column_frequencies.items():
                    if col in df.columns:
                        date_frequency_issues = validate_date_frequency_for_column(df[col], frequency, col)
                        
                        if date_frequency_issues:
                            condition_failures.extend(date_frequency_issues)
                            for issue in date_frequency_issues:
                                if issue["severity"] == "error":
                                    file_errors.append(f"Date frequency issue: {issue['error_message']}")
                                else:
                                    file_warnings.append(f"Date frequency warning: {issue['error_message']}")


        

        
        # ✅ UPDATED: Determine file status (include condition failures)
        if file_errors:
            status = "failed"
        elif file_warnings or auto_corrections or condition_failures:
            status = "passed_with_warnings"
        else:
            status = "passed"
        
        file_results[file_key] = {
            "status": status,
            "errors": file_errors,
            "warnings": file_warnings,
            "auto_corrections": auto_corrections,
            "condition_failures": condition_failures,  # ✅ ADD
            "columns_checked": len(uploaded_columns),
            "mandatory_columns_missing": len(missing_columns),
            "extra_columns_found": len(extra_columns),
            "data_corrections_applied": len(auto_corrections),
            "custom_conditions_failed": len(condition_failures)  # ✅ ADD
        }
        
        overall_errors.extend(file_errors)
        overall_warnings.extend(file_warnings)
    
    # Overall status
    if overall_errors:
        overall_status = "failed"
    elif overall_warnings:
        overall_status = "passed_with_warnings"
    else:
        overall_status = "passed"
    
    return {
        "overall_status": overall_status,
        "file_results": file_results,
        "summary": {
            "total_files": len(files_data),
            "passed_files": len([r for r in file_results.values() if r["status"] == "passed"]),
            "failed_files": len([r for r in file_results.values() if r["status"] == "failed"]),
            "files_with_warnings": len([r for r in file_results.values() if r["status"] == "passed_with_warnings"]),
            "total_auto_corrections": sum(len(r.get("auto_corrections", [])) for r in file_results.values()),
            "total_condition_failures": sum(len(r.get("condition_failures", [])) for r in file_results.values())  # ✅ ADD
        }
    }

# ✅ ADD: Missing helper function
def apply_validation_condition(column_data, operator, value, col_name):
    """Apply a single validation condition and return list of failed row indices"""
    failed_rows = []

    def convert(v):
        if pd.api.types.is_numeric_dtype(column_data):
            try:
                return float(v)
            except Exception:
                return pd.NA
        if pd.api.types.is_datetime64_any_dtype(column_data):
            try:
                return pd.to_datetime(v, errors="coerce")
            except Exception:
                return pd.NaT
        return v

    try:
        conv_value = None
        if isinstance(value, list):
            conv_value = [convert(v) for v in value]
        else:
            conv_value = convert(value)

        if operator == "greater_than":
            failed_mask = ~(column_data > conv_value)
        elif operator == "greater_than_or_equal":
            failed_mask = ~(column_data >= conv_value)
        elif operator == "less_than":
            failed_mask = ~(column_data < conv_value)
        elif operator == "less_than_or_equal":
            failed_mask = ~(column_data <= conv_value)
        elif operator == "equal_to":
            failed_mask = ~(column_data == conv_value)
        elif operator == "not_equal_to":
            failed_mask = ~(column_data != conv_value)
        elif operator == "between":
            if isinstance(conv_value, list) and len(conv_value) == 2:
                failed_mask = ~((column_data >= conv_value[0]) & (column_data <= conv_value[1]))
            else:
                return []
        elif operator == "contains":
            failed_mask = ~column_data.astype(str).str.contains(str(conv_value), na=False)
        elif operator == "starts_with":
            failed_mask = ~column_data.astype(str).str.startswith(str(conv_value), na=False)
        elif operator == "regex_match":
            try:
                pattern = re.compile(str(conv_value))
            except re.error:
                return list(range(len(column_data)))
            failed_mask = ~column_data.astype(str).str.match(pattern)
        elif operator == "null_percentage":
            threshold = float(conv_value)
            null_mask = column_data.isna()
            if null_mask.mean() * 100 > threshold:
                failed_mask = null_mask
            else:
                failed_mask = pd.Series([False] * len(column_data), index=column_data.index)
        elif operator == "in_list":
            allowed = set(conv_value if isinstance(conv_value, list) else [conv_value])
            failed_mask = ~column_data.isin(allowed)
        else:
            return []

        failed_rows = column_data[failed_mask].index.tolist()

    except Exception as e:
        print(f"Error applying condition {operator} to column {col_name}: {str(e)}")
        return []

    return failed_rows


# ✅ ADD: This function to your existing validation_utils.py file
def validate_date_frequency_for_column(df_column, frequency, col_name):
    """
    Validate date frequency patterns for a specific column
    """
    frequency_issues = []
    
    try:
        # Convert to datetime
        dates = pd.to_datetime(df_column, errors='coerce')
        dates = dates.dropna().sort_values()
        
        if len(dates) < 2:
            return frequency_issues
            
        # Calculate differences between consecutive dates
        date_diffs = dates.diff().dropna()
        
        # Set expected difference and tolerance based on frequency
        if frequency.lower() == "daily":
            expected_diff = pd.Timedelta(days=1)
            tolerance = pd.Timedelta(hours=12)
        elif frequency.lower() == "weekly":
            expected_diff = pd.Timedelta(weeks=1)
            tolerance = pd.Timedelta(days=1)
        elif frequency.lower() == "monthly":
            expected_diff = pd.Timedelta(days=30)  # Approximate
            tolerance = pd.Timedelta(days=5)
        else:
            return frequency_issues
        
        # Check for irregular intervals and missing dates
        irregular_intervals = []
        missing_dates = []
        
        for i, diff in enumerate(date_diffs):
            if abs(diff - expected_diff) > tolerance:
                irregular_intervals.append({
                    "index": i,
                    "expected": str(expected_diff),
                    "actual": str(diff),
                    "date": str(dates.iloc[i])
                })
            
            # Check for missing dates (gaps larger than expected)
            if diff > expected_diff + tolerance:
                gap_days = diff.days
                expected_days = expected_diff.days
                missing_count = (gap_days // expected_days) - 1
                if missing_count > 0:
                    missing_dates.append({
                        "start_date": str(dates.iloc[i-1]),
                        "end_date": str(dates.iloc[i]),
                        "missing_count": missing_count
                    })
        
        # Create frequency validation issues
        if irregular_intervals:
            frequency_issues.append({
                "column": col_name,
                "operator": "date_frequency",
                "expected_value": frequency,
                "error_message": f"Irregular {frequency} intervals found in {col_name} ({len(irregular_intervals)} occurrences)",
                "severity": "warning",
                "failed_rows": [item["index"] for item in irregular_intervals[:10]],
                "failed_count": len(irregular_intervals),
                "failed_percentage": round((len(irregular_intervals) / len(dates)) * 100, 2),
                "details": {
                    "type": "irregular_intervals",
                    "irregular_intervals": irregular_intervals[:5]
                }
            })
        
        if missing_dates:
            total_missing = sum(item["missing_count"] for item in missing_dates)
            frequency_issues.append({
                "column": col_name,
                "operator": "date_frequency",
                "expected_value": frequency,
                "error_message": f"Missing {frequency} dates in {col_name} ({total_missing} missing dates)",
                "severity": "error",
                "failed_rows": [],
                "failed_count": total_missing,
                "failed_percentage": round((total_missing / (len(dates) + total_missing)) * 100, 2),
                "details": {
                    "type": "missing_dates",
                    "missing_periods": missing_dates[:5]
                }
            })
    
    except Exception as e:
        frequency_issues.append({
            "column": col_name,
            "operator": "date_frequency",
            "expected_value": frequency,
            "error_message": f"Error validating date frequency in {col_name}: {str(e)}",
            "severity": "warning",
            "failed_rows": [],
            "failed_count": 0,
            "failed_percentage": 0
        })
    
    return frequency_issues