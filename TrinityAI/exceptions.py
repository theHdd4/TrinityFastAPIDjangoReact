"""
Custom exception hierarchy for Trinity AI.
Provides consistent error handling across all agents.
"""


class TrinityException(Exception):
    """Base exception for Trinity AI."""
    
    def __init__(self, message: str, code: str = "INTERNAL_ERROR"):
        self.message = message
        self.code = code
        super().__init__(self.message)
    
    def to_dict(self) -> dict:
        """Convert exception to dictionary for JSON responses."""
        return {
            "success": False,
            "error": self.message,
            "code": self.code
        }


class AgentExecutionError(TrinityException):
    """Raised when an agent fails during execution."""
    
    def __init__(self, message: str, agent_name: str = "unknown"):
        super().__init__(message, code="AGENT_EXECUTION_ERROR")
        self.agent_name = agent_name
    
    def to_dict(self) -> dict:
        result = super().to_dict()
        result["agent"] = self.agent_name
        return result


class ConfigurationError(TrinityException):
    """Raised when configuration is missing or invalid."""
    
    def __init__(self, message: str, config_key: str = "unknown"):
        super().__init__(message, code="CONFIGURATION_ERROR")
        self.config_key = config_key
    
    def to_dict(self) -> dict:
        result = super().to_dict()
        result["config_key"] = self.config_key
        return result


class FileLoadError(TrinityException):
    """Raised when file loading fails."""
    
    def __init__(self, message: str, file_path: str = "unknown"):
        super().__init__(message, code="FILE_LOAD_ERROR")
        self.file_path = file_path
    
    def to_dict(self) -> dict:
        result = super().to_dict()
        result["file_path"] = self.file_path
        return result


class JSONExtractionError(TrinityException):
    """Raised when JSON extraction from LLM response fails."""
    
    def __init__(self, message: str, raw_response: str = ""):
        super().__init__(message, code="JSON_EXTRACTION_ERROR")
        self.raw_response = raw_response[:500] if raw_response else ""  # Limit size
    
    def to_dict(self) -> dict:
        result = super().to_dict()
        if self.raw_response:
            result["raw_response_preview"] = self.raw_response
        return result


class ValidationError(TrinityException):
    """Raised when validation fails."""
    
    def __init__(self, message: str, validation_errors: list = None):
        super().__init__(message, code="VALIDATION_ERROR")
        self.validation_errors = validation_errors or []
    
    def to_dict(self) -> dict:
        result = super().to_dict()
        if self.validation_errors:
            result["validation_errors"] = self.validation_errors
        return result


