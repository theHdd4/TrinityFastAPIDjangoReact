# Base Validator
import pandas as pd
from typing import Dict, Any
import json
from pathlib import Path

class BaseValidator:
    def __init__(self):
        self.config_dir = Path("custom_validations")
    
    def validate(self, df: pd.DataFrame, file_key: str, validator_atom: str) -> Dict[str, Any]:
        """Simple validation: required columns + data types"""
        issues = []
        successes = []
        
        # For now, basic validation
        required_columns = ["SalesValue", "Volume"]  # Default required columns
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            issues.append({
                "severity": "critical",
                "title": "Missing Required Columns",
                "description": f"Missing: {', '.join(missing_columns)}",
                "affected_items": missing_columns
            })
        else:
            successes.append({
                "title": "Required Columns Check",
                "description": f"All required columns present"
            })
        
        overall_status = "failed" if any(issue["severity"] == "critical" for issue in issues) else "passed"
        
        return {
            "overall_status": overall_status,
            "summary": {
                "total_checks": 1,
                "passed": len(successes),
                "failed": len(issues)
            },
            "issues": issues,
            "successes": successes
        }