"""
Result Analyzer for Stream AI
==============================

LLM-based analysis comparing atom execution results against user intent and subtask goals.
"""

import json
import logging
import re
import sys
import aiohttp
from typing import Dict, Any, Optional, List
from pathlib import Path

logger = logging.getLogger("trinity.trinityai.analyzer")

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

# Import centralized settings
try:
    from BaseAgent.config import settings
except ImportError:
    try:
        from TrinityAgent.BaseAgent.config import settings
    except ImportError:
        # Fallback: import from main_api if BaseAgent not available
        from main_api import get_llm_config
        # Create minimal settings wrapper for backward compatibility
        class SettingsWrapper:
            def get_llm_config(self):
                return get_llm_config()
        settings = SettingsWrapper()

from STREAMAI.result_extractor import get_result_extractor


class ResultAnalyzer:
    """
    Analyzes atom execution results against intent and subtask goals.
    """
    
    def __init__(self):
        """Initialize the result analyzer"""
        # Use centralized settings
        self.config = settings.get_llm_config()
        self.api_url = self.config["api_url"]
        self.model_name = self.config["model_name"]
        self.bearer_token = self.config["bearer_token"]
        self.extractor = get_result_extractor()
        logger.info(f"✅ ResultAnalyzer initialized with model: {self.model_name}")
    
    async def analyze_result(
        self,
        atom_result: Dict[str, Any],
        original_intent: str,
        subtask_goal: str,
        atom_id: str
    ) -> Dict[str, Any]:
        """
        Analyze atom execution result against intent and subtask goal.
        
        Args:
            atom_result: Atom execution result (with reasoning, smart_response, raw_response)
            original_intent: Original user intent/prompt
            subtask_goal: Specific goal for this subtask
            atom_id: ID of the atom that was executed
            
        Returns:
            Analysis result with sufficient flag, quality_score, issues, and suggested_refinement
        """
        logger.info(f"🔍 Analyzing result for atom: {atom_id}")
        
        # Extract structured fields from result
        extracted = self.extractor.extract(atom_result)
        
        # Build analysis prompt
        prompt = self._build_analysis_prompt(
            extracted=extracted,
            original_intent=original_intent,
            subtask_goal=subtask_goal,
            atom_id=atom_id
        )
        
        try:
            response = await self._call_llm(prompt, temperature=0.3)
            
            if not response:
                logger.warning("⚠️ Empty LLM response, defaulting to insufficient")
                return {
                    "sufficient": False,
                    "quality_score": 0.3,
                    "issues": ["Could not analyze result - LLM response was empty"],
                    "suggested_refinement": "Retry with clearer prompt"
                }
            
            # Extract JSON from response
            analysis_result = self._extract_json_from_response(response)
            
            if not analysis_result:
                logger.warning("⚠️ Could not parse analysis JSON, defaulting to insufficient")
                return {
                    "sufficient": False,
                    "quality_score": 0.3,
                    "issues": ["Could not parse analysis result"],
                    "suggested_refinement": "Retry with clearer prompt"
                }
            
            # Validate and normalize result
            result = {
                "sufficient": bool(analysis_result.get("sufficient", False)),
                "quality_score": float(analysis_result.get("quality_score", 0.5)),
                "issues": analysis_result.get("issues", []) if isinstance(analysis_result.get("issues"), list) else [],
                "suggested_refinement": analysis_result.get("suggested_refinement", "") or analysis_result.get("refinement", "")
            }
            
            logger.info(f"✅ Analysis complete - sufficient: {result['sufficient']}, "
                       f"quality: {result['quality_score']:.2f}, issues: {len(result['issues'])}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Error analyzing result: {e}")
            return {
                "sufficient": False,
                "quality_score": 0.3,
                "issues": [f"Error during analysis: {str(e)}"],
                "suggested_refinement": "Retry execution with original prompt"
            }
    
    def _build_analysis_prompt(
        self,
        extracted: Dict[str, Any],
        original_intent: str,
        subtask_goal: str,
        atom_id: str
    ) -> str:
        """
        Build the LLM prompt for result analysis.
        
        Args:
            extracted: Extracted result fields
            original_intent: Original user intent
            subtask_goal: Specific subtask goal
            atom_id: Atom ID
            
        Returns:
            Formatted prompt
        """
        reasoning = extracted.get("reasoning", "")[:1000]  # Limit length
        smart_response = extracted.get("smart_response", "")[:1000]
        raw_response_str = json.dumps(extracted.get("raw_response", {}), indent=2)[:2000]  # Limit length
        success = extracted.get("success", False)
        
        prompt = f"""You are an intelligent result analyzer for Trinity AI data processing workflows.

**ORIGINAL USER INTENT**: "{original_intent}"

**SUBTASK GOAL**: "{subtask_goal}"

**ATOM EXECUTED**: {atom_id}

**EXECUTION RESULT**:
- Success: {success}
- Reasoning: {reasoning if reasoning else "No reasoning provided"}
- Smart Response: {smart_response if smart_response else "No smart response provided"}
- Raw Response (first 2000 chars): 
```json
{raw_response_str}
```

## Your Task:

Analyze whether the atom execution result is SUFFICIENT to meet both:
1. The original user intent
2. The specific subtask goal

## Analysis Criteria:

**Check if the result:**
- ✅ Addresses the subtask goal completely
- ✅ Produces the expected output/data
- ✅ Contains relevant information for the original intent
- ✅ Has no critical errors or missing data
- ✅ Provides usable output for next steps (if any)

**Common Issues to Identify:**
- Missing or incomplete data
- Wrong data format or structure
- Errors in processing
- Incomplete execution
- Output doesn't match requirements
- Missing required fields or columns
- Incorrect calculations or transformations

## Output Format:

Return ONLY a valid JSON object (no other text):

```json
{{
  "sufficient": true or false,
  "quality_score": 0.0 to 1.0,
  "issues": ["list", "of", "identified", "issues"],
  "suggested_refinement": "Specific suggestion for improving the prompt or execution"
}}
```

**Scoring Guidelines:**
- 0.9-1.0: Excellent - result fully meets requirements
- 0.7-0.9: Good - result meets most requirements, minor issues
- 0.5-0.7: Acceptable - result partially meets requirements, some issues
- 0.3-0.5: Poor - result has significant issues
- 0.0-0.3: Very Poor - result doesn't meet requirements

**Refinement Suggestions:**
- Be specific about what needs to be improved
- Suggest concrete changes to the prompt
- Identify missing information or parameters
- Recommend alternative approaches if needed

Now analyze the result:"""
        
        return prompt
    
    async def _call_llm(self, prompt: str, temperature: float = 0.3) -> str:
        """
        Call the LLM with a prompt.
        
        Args:
            prompt: The prompt to send
            temperature: Temperature for generation
            
        Returns:
            LLM response text
        """
        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.bearer_token}"
            }
            
            payload = {
                "model": self.model_name,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": 1000
                }
            }
            
            logger.debug(f"📤 Calling LLM for result analysis: {self.api_url}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=90)
                ) as response:
                    response.raise_for_status()
                    result = await response.json()
                    message_content = result.get("message", {}).get("content", "")
                    
                    if not message_content:
                        logger.error("❌ Empty response from LLM")
                        return ""
                    
                    logger.debug(f"✅ LLM response received ({len(message_content)} chars)")
                    return message_content
            
        except Exception as e:
            logger.error(f"❌ Error calling LLM: {e}")
            return ""
    
    def _extract_json_from_response(self, response: str) -> Optional[Dict[str, Any]]:
        """
        Extract JSON from LLM response.
        
        Args:
            response: LLM response text
            
        Returns:
            Parsed JSON dict or None
        """
        try:
            # Try to find JSON block
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                json_str = json_match.group(0)
                return json.loads(json_str)
            
            # Try parsing entire response
            return json.loads(response)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Failed to parse JSON: {e}")
            logger.debug(f"Response was: {response[:500]}...")
            return None


# Global instance
_result_analyzer: Optional[ResultAnalyzer] = None


def get_result_analyzer() -> ResultAnalyzer:
    """
    Get singleton result analyzer instance.
    
    Returns:
        ResultAnalyzer instance
    """
    global _result_analyzer
    if _result_analyzer is None:
        _result_analyzer = ResultAnalyzer()
        logger.info("✅ Global ResultAnalyzer instance created")
    return _result_analyzer

