"""
Standard Validator for Trinity AI Base Agent
Provides consistent data validation across all agents.
"""

import logging
from typing import Dict, Any, List, Optional, Callable
from pydantic import BaseModel, ValidationError as PydanticValidationError

from .exceptions import ValidationError

logger = logging.getLogger("trinity.validator")


class Validator:
    """Standardized validation utilities."""
    
    @staticmethod
    def validate_required_fields(data: Dict[str, Any], required_fields: List[str]) -> None:
        """
        Validate that all required fields are present.
        
        Args:
            data: The data dictionary to validate
            required_fields: List of required field names
        
        Raises:
            ValidationError: If any required fields are missing
        """
        missing = [field for field in required_fields if field not in data or data[field] is None]
        if missing:
            raise ValidationError(
                f"Missing required fields: {', '.join(missing)}",
                validation_errors=[f"Field '{field}' is required" for field in missing]
            )
    
    @staticmethod
    def validate_field_types(data: Dict[str, Any], field_types: Dict[str, type]) -> None:
        """
        Validate that fields have correct types.
        
        Args:
            data: The data dictionary to validate
            field_types: Dictionary mapping field names to expected types
        
        Raises:
            ValidationError: If any fields have incorrect types
        """
        errors = []
        for field, expected_type in field_types.items():
            if field in data:
                if not isinstance(data[field], expected_type):
                    errors.append(
                        f"Field '{field}' must be of type {expected_type.__name__}, "
                        f"got {type(data[field]).__name__}"
                    )
        
        if errors:
            raise ValidationError(
                "Type validation failed",
                validation_errors=errors
            )
    
    @staticmethod
    def validate_with_schema(data: Dict[str, Any], schema: BaseModel) -> BaseModel:
        """
        Validate data against a Pydantic schema.
        
        Args:
            data: The data dictionary to validate
            schema: Pydantic BaseModel class (not instance)
        
        Returns:
            Validated Pydantic model instance
        
        Raises:
            ValidationError: If validation fails
        """
        try:
            return schema(**data)
        except PydanticValidationError as e:
            errors = [f"{err['loc'][0]}: {err['msg']}" for err in e.errors()]
            raise ValidationError(
                "Schema validation failed",
                validation_errors=errors
            )
    
    @staticmethod
    def validate_with_custom_validator(
        data: Dict[str, Any],
        validator_func: Callable[[Dict[str, Any]], bool],
        error_message: str = "Custom validation failed"
    ) -> None:
        """
        Validate data using a custom validator function.
        
        Args:
            data: The data dictionary to validate
            validator_func: Function that takes data and returns True if valid
            error_message: Error message if validation fails
        
        Raises:
            ValidationError: If validation fails
        """
        if not validator_func(data):
            raise ValidationError(error_message)
    
    @staticmethod
    def validate_file_path(file_path: str) -> None:
        """
        Validate that a file path is valid.
        
        Args:
            file_path: The file path to validate
        
        Raises:
            ValidationError: If file path is invalid
        """
        if not file_path or not isinstance(file_path, str):
            raise ValidationError("File path must be a non-empty string")
        
        # Check for common invalid characters
        invalid_chars = ['<', '>', '|', ':', '"', '?', '*']
        for char in invalid_chars:
            if char in file_path:
                raise ValidationError(f"File path contains invalid character: {char}")
    
    @staticmethod
    def validate_session_id(session_id: str) -> None:
        """
        Validate that a session ID is valid.
        
        Args:
            session_id: The session ID to validate
        
        Raises:
            ValidationError: If session ID is invalid
        """
        if not session_id or not isinstance(session_id, str):
            raise ValidationError("Session ID must be a non-empty string")
        
        if len(session_id) < 1:
            raise ValidationError("Session ID cannot be empty")
    
    @staticmethod
    def validate_agent_result(result: Dict[str, Any]) -> None:
        """
        Validate that an agent result has the correct structure.
        
        Args:
            result: The agent result dictionary
        
        Raises:
            ValidationError: If result structure is invalid
        """
        required_fields = ["success"]
        Validator.validate_required_fields(result, required_fields)
        
        if not isinstance(result.get("success"), bool):
            raise ValidationError("Field 'success' must be a boolean")
        
        if "data" in result and not isinstance(result["data"], dict):
            raise ValidationError("Field 'data' must be a dictionary")
        
        if "artifacts" in result and not isinstance(result["artifacts"], list):
            raise ValidationError("Field 'artifacts' must be a list")

