"""
Result Extractor for Stream AI
===============================

Extracts reasoning, smart_response, and raw_response from atom execution results.
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("trinity.trinityai.extractor")


class ResultExtractor:
    """
    Extracts structured fields from atom execution results.
    """
    
    def extract(self, atom_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract reasoning, smart_response, and raw_response from atom result.
        
        Args:
            atom_result: Raw atom execution result
            
        Returns:
            Dict with reasoning, smart_response, raw_response, and other fields
        """
        try:
            # Handle different possible structures
            # Structure 1: Direct fields in result
            reasoning = atom_result.get("reasoning") or atom_result.get("reasoning_text") or ""
            smart_response = atom_result.get("smart_response") or atom_result.get("smartResponse") or atom_result.get("message") or ""
            raw_response = atom_result.get("raw_response") or atom_result.get("rawResponse") or atom_result.get("data") or atom_result
            
            # Structure 2: Nested in response field
            if not reasoning and not smart_response:
                response_data = atom_result.get("response") or atom_result.get("result") or {}
                if isinstance(response_data, dict):
                    reasoning = response_data.get("reasoning") or reasoning
                    smart_response = response_data.get("smart_response") or response_data.get("smartResponse") or smart_response
                    raw_response = response_data.get("raw_response") or response_data.get("rawResponse") or response_data.get("data") or raw_response
            
            # Structure 3: Nested in data field
            if not reasoning and not smart_response:
                data = atom_result.get("data") or {}
                if isinstance(data, dict):
                    reasoning = data.get("reasoning") or reasoning
                    smart_response = data.get("smart_response") or data.get("smartResponse") or data.get("message") or smart_response
                    raw_response = data.get("raw_response") or data.get("rawResponse") or data
            
            # Fallback: Try to extract from message or any text field
            if not smart_response:
                smart_response = atom_result.get("message") or atom_result.get("summary") or atom_result.get("description") or ""
            
            # Ensure raw_response is a dict
            if not isinstance(raw_response, dict):
                raw_response = {"value": raw_response} if raw_response else {}
            
            # If we still don't have reasoning, try to extract from any text field
            if not reasoning:
                # Look for reasoning-like fields
                for key in ["explanation", "analysis", "thoughts", "thinking"]:
                    if key in atom_result:
                        reasoning = atom_result[key]
                        break
            
            result = {
                "reasoning": str(reasoning) if reasoning else "",
                "smart_response": str(smart_response) if smart_response else "",
                "raw_response": raw_response if isinstance(raw_response, dict) else {"value": raw_response},
                "success": atom_result.get("success", False),
                "data": atom_result.get("data", {}),
                "error": atom_result.get("error"),
                "original_result": atom_result  # Keep original for debugging
            }
            
            logger.debug(f"✅ Extracted result fields - reasoning: {len(result['reasoning'])} chars, "
                        f"smart_response: {len(result['smart_response'])} chars")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Error extracting result fields: {e}")
            # Return safe defaults
            return {
                "reasoning": "",
                "smart_response": str(atom_result.get("message", "")),
                "raw_response": atom_result.get("data", {}),
                "success": atom_result.get("success", False),
                "data": atom_result.get("data", {}),
                "error": str(e),
                "original_result": atom_result
            }
    
    def extract_from_execution_result(self, execution_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract from orchestrator execution result format.
        
        Args:
            execution_result: Result from stream_orchestrator execution
            
        Returns:
            Extracted fields
        """
        # The execution_result might have the atom result nested
        atom_data = execution_result.get("data") or execution_result.get("response") or execution_result
        
        return self.extract(atom_data)
    
    def format_for_display(self, extracted: Dict[str, Any]) -> str:
        """
        Format extracted result for display in chat.
        
        Args:
            extracted: Extracted result dict
            
        Returns:
            Formatted string
        """
        lines = []
        
        if extracted.get("reasoning"):
            lines.append("**Reasoning:**")
            lines.append(extracted["reasoning"])
            lines.append("")
        
        if extracted.get("smart_response"):
            lines.append("**Response:**")
            lines.append(extracted["smart_response"])
            lines.append("")
        
        if extracted.get("raw_response") and isinstance(extracted["raw_response"], dict):
            if len(extracted["raw_response"]) > 0:
                lines.append("**Raw Data:**")
                import json
                lines.append(f"```json\n{json.dumps(extracted['raw_response'], indent=2)}\n```")
        
        return "\n".join(lines) if lines else "No data available"


# Global instance
_result_extractor: Optional[ResultExtractor] = None


def get_result_extractor() -> ResultExtractor:
    """
    Get singleton result extractor instance.
    
    Returns:
        ResultExtractor instance
    """
    global _result_extractor
    if _result_extractor is None:
        _result_extractor = ResultExtractor()
        logger.info("✅ Global ResultExtractor instance created")
    return _result_extractor

