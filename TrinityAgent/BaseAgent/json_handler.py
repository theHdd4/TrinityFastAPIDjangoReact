"""
Standard JSON Handler for Trinity AI Base Agent
Provides consistent JSON extraction, validation, and normalization.
"""

import json
import re
import logging
from typing import Dict, Any, Optional

from .exceptions import JSONExtractionError

logger = logging.getLogger("trinity.json_handler")


class JSONHandler:
    """Standardized JSON extraction and handling utilities."""
    
    @staticmethod
    def extract_json(response: str) -> Optional[Dict[str, Any]]:
        """
        Extract JSON from LLM response using multiple fallback strategies.
        
        Args:
            response: The raw LLM response string
        
        Returns:
            Extracted JSON as dictionary, or None if extraction fails
        
        Raises:
            JSONExtractionError: If all extraction methods fail
        """
        logger.info(f"🔍 Extracting JSON (response length: {len(response)})")
        
        if not response:
            logger.error("❌ Empty response")
            raise JSONExtractionError("Empty response from LLM", raw_response="")
        
        # Step 1: Clean response - remove thinking tags and code blocks
        cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
        cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
        cleaned = re.sub(r"```json\s*", "", cleaned)
        cleaned = re.sub(r"```\s*", "", cleaned)
        cleaned = cleaned.strip()
        
        logger.info(f"📋 Cleaned response length: {len(cleaned)}")
        
        # Method 1: Try regex patterns first
        json_patterns = [
            r'```json\s*(\{.*?\})\s*```',
            r'```\s*(\{.*?\})\s*```',
        ]
        
        for pattern in json_patterns:
            matches = re.findall(pattern, cleaned, re.DOTALL | re.IGNORECASE)
            for match in matches:
                try:
                    result = json.loads(match)
                    logger.info("✅ Successfully extracted JSON using pattern matching")
                    return result
                except json.JSONDecodeError:
                    continue
        
        # Method 2: Try brace counting
        try:
            start_idx = cleaned.find("{")
            if start_idx == -1:
                logger.error("❌ No opening brace found")
                raise JSONExtractionError("No JSON object found in response", raw_response=cleaned[:500])
            
            # Count braces (respecting strings to avoid counting braces inside strings)
            brace_count = 0
            in_string = False
            escape_next = False
            end_idx = start_idx
            
            for i in range(start_idx, len(cleaned)):
                char = cleaned[i]
                
                # Handle escape sequences
                if escape_next:
                    escape_next = False
                    continue
                if char == '\\':
                    escape_next = True
                    continue
                
                # Track if we're inside a string
                if char == '"':
                    in_string = not in_string
                    continue
                
                # Only count braces outside of strings
                if not in_string:
                    if char == "{":
                        brace_count += 1
                    elif char == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            end_idx = i + 1
                            break
            
            if brace_count != 0:
                logger.error(f"❌ Unbalanced braces (remaining count: {brace_count})")
                raise JSONExtractionError(
                    f"Unbalanced JSON braces (count: {brace_count})",
                    raw_response=cleaned[:500]
                )
            
            # Extract and parse JSON
            json_str = cleaned[start_idx:end_idx]
            logger.info(f"📦 Extracted JSON string (length: {len(json_str)})")
            
            result = json.loads(json_str)
            logger.info("✅ Successfully extracted JSON using brace counting")
            return result
            
        except json.JSONDecodeError as e:
            logger.debug(f"Brace counting failed: {e}")
        except JSONExtractionError:
            raise
        except Exception as e:
            logger.debug(f"Brace counting failed: {e}")
        
        # Method 3: Try simple bracket matching (fallback)
        try:
            start = cleaned.find('{')
            end = cleaned.rfind('}')
            if start != -1 and end != -1 and end > start:
                json_str = cleaned[start:end+1]
                result = json.loads(json_str)
                logger.info("✅ Successfully extracted JSON using bracket matching")
                return result
        except json.JSONDecodeError:
            pass
        
        # If all methods fail, raise exception
        logger.warning("❌ All JSON extraction methods failed")
        logger.warning(f"Response preview for debugging: {cleaned[:500]}")
        raise JSONExtractionError(
            "Failed to extract valid JSON from LLM response",
            raw_response=cleaned[:500]
        )
    
    @staticmethod
    def validate_json_structure(data: Dict[str, Any], required_fields: list = None) -> bool:
        """
        Validate that JSON has required structure.
        
        Args:
            data: The JSON data to validate
            required_fields: List of required field names
        
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(data, dict):
            logger.error("❌ Data is not a dictionary")
            return False
        
        if required_fields:
            missing = [field for field in required_fields if field not in data]
            if missing:
                logger.error(f"❌ Missing required fields: {missing}")
                return False
        
        return True
    
    @staticmethod
    def normalize_json(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize JSON structure to ensure consistency.
        
        Args:
            data: The JSON data to normalize
        
        Returns:
            Normalized JSON dictionary
        """
        normalized = {}
        
        # Ensure standard fields exist
        if "success" not in data:
            normalized["success"] = True
        
        # Copy all fields
        normalized.update(data)
        
        return normalized
    
    @staticmethod
    def clean_json_string(json_str: str) -> str:
        """
        Clean JSON string by removing common issues.
        
        Args:
            json_str: Raw JSON string
        
        Returns:
            Cleaned JSON string
        """
        # Remove BOM if present
        if json_str.startswith('\ufeff'):
            json_str = json_str[1:]
        
        # Remove trailing commas (simple case)
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        return json_str.strip()

