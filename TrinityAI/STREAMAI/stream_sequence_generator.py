"""
Stream Sequence Generator
=========================

Generates atom sequences from user queries using LLM + RAG.
Creates structured sequences with prompts, dependencies, and data flow.
"""

import json
import logging
import re
import os
import sys
import aiohttp  # Changed from requests to aiohttp for async
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger("trinity.streamai.generator")

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from main_api import get_llm_config

# Import Stream RAG Engine
try:
    from STREAMAI.stream_rag_engine import get_stream_rag_engine
    STREAM_RAG_AVAILABLE = True
    logger.info("✅ StreamRAGEngine imported successfully")
except ImportError as e:
    try:
        from stream_rag_engine import get_stream_rag_engine
        STREAM_RAG_AVAILABLE = True
        logger.info("✅ StreamRAGEngine imported successfully (direct)")
    except ImportError as e2:
        STREAM_RAG_AVAILABLE = False
        logger.warning(f"⚠️ StreamRAGEngine not available: {e} | {e2}")

# Import atom mapping for endpoint resolution
try:
    from SUPERAGENT.atom_mapping import ATOM_MAPPING
    ATOM_MAPPING_AVAILABLE = True
    logger.info("✅ ATOM_MAPPING imported successfully")
except ImportError as e:
    try:
        sys.path.append(str(PARENT_DIR / "SUPERAGENT"))
        from atom_mapping import ATOM_MAPPING
        ATOM_MAPPING_AVAILABLE = True
        logger.info("✅ ATOM_MAPPING imported successfully (direct)")
    except ImportError as e2:
        ATOM_MAPPING_AVAILABLE = False
        logger.warning(f"⚠️ ATOM_MAPPING not available: {e} | {e2}")
        ATOM_MAPPING = {}


class StreamSequenceGenerator:
    """
    Generates atom sequences from user queries using LLM + RAG.
    """
    
    def __init__(self):
        """Initialize the sequence generator"""
        self.config = get_llm_config()
        self.api_url = self.config["api_url"]
        self.model_name = self.config["model_name"]
        self.bearer_token = self.config["bearer_token"]
        
        # Initialize RAG engine
        self.rag_engine = None
        if STREAM_RAG_AVAILABLE:
            try:
                self.rag_engine = get_stream_rag_engine()
                logger.info("✅ Stream RAG engine initialized")
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize RAG engine: {e}")
        
        logger.info(f"✅ StreamSequenceGenerator initialized with model: {self.model_name}")
    
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
                    "num_predict": 2000
                }
            }
            
            logger.info(f"📤 Calling LLM: {self.api_url}")
            
            # Use async aiohttp instead of blocking requests
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.api_url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    response.raise_for_status()
                    result = await response.json()
                    message_content = result.get("message", {}).get("content", "")
                    
                    if not message_content:
                        logger.error("❌ Empty response from LLM")
                        return ""
                    
                    logger.info(f"✅ LLM response received ({len(message_content)} chars)")
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
    
    def _build_sequence_prompt(self, user_query: str, file_context: Optional[Dict[str, Any]] = None) -> str:
        """
        Build the LLM prompt for sequence generation.
        
        Args:
            user_query: User's query
            file_context: Optional context about available files
            
        Returns:
            Formatted prompt
        """
        # Get RAG context
        rag_context = ""
        if self.rag_engine:
            try:
                rag_context = self.rag_engine.generate_rag_context_for_sequence(user_query)
            except Exception as e:
                logger.warning(f"⚠️ Could not generate RAG context: {e}")
        
        # Build file context section
        file_context_section = ""
        has_existing_files = False
        if file_context and file_context.get("files"):
            has_existing_files = True
            file_context_section = "\n## Available Saved Files (Already in MinIO):\n\n"
            files_list = file_context.get("files", [])
            for file_info in files_list[:10]:
                file_name = file_info.get("displayName") or file_info.get("name", "unknown")
                file_context_section += f"- **{file_name}** (already loaded)\n"
            
            if len(files_list) > 10:
                file_context_section += f"\n... and {len(files_list) - 10} more files\n"
            
            file_context_section += "\n**IMPORTANT**: These files are already loaded in the system. "
            file_context_section += "If the user mentions any of these files, **DO NOT** include `data-upload-validate` in the sequence. "
            file_context_section += "Instead, start directly with the operation atoms (merge, concat, groupby, etc.) that use these existing files.\n"
        
        prompt = f"""You are Stream AI, an intelligent atom sequencing system for data analysis.

**USER QUERY**: "{user_query}"

{file_context_section}

{rag_context}

## Your Task:

Analyze the user's query and generate a sequence of atoms that will complete the task.
Each atom is a data processing step that can be executed in sequence.

**IMPORTANT RULES**:
1. **Check if files exist in "Available Saved Files" section above**:
   - If files mentioned in query exist in saved files → **SKIP** `data-upload-validate` and start directly with operations
   - If files are NOT in saved files or query mentions "load" or "upload" → Include `data-upload-validate` as first step
2. Atoms execute sequentially - each atom can use results from previous atoms
3. Keep sequences concise (2-6 atoms typically)
4. Each atom needs a clear purpose and prompt
5. Use result references like `{{{{result_name}}}}` in prompts to refer to previous outputs
6. **chart-maker** should typically be last if visualization is needed
7. When files exist, reference them by name in the first atom's prompt (e.g., "merge uk_beans.arrow and uk_mayo.arrow")

## Output Format:

Return ONLY a valid JSON object (no other text):

**Example 1 - Files already exist** (user says "merge uk beans and uk mayo" and both files are in Available Saved Files):
```json
{{
  "sequence": [
    {{
      "step": 1,
      "atom_id": "merge",
      "purpose": "Merge the existing files",
      "prompt": "Merge uk_beans.arrow and uk_mayo.arrow on common columns",
      "parameters": {{
        "file1": "D0_KHC_UK_Beans.arrow",
        "file2": "D0_KHC_UK_Mayo.arrow",
        "join_type": "inner"
      }},
      "inputs": [],
      "output_name": "merged_data"
    }},
    {{
      "step": 2,
      "atom_id": "feature-overview",
      "purpose": "Explore merged data",
      "prompt": "Generate overview of {{{{merged_data}}}}",
      "parameters": {{
        "data_source": "{{{{merged_data}}}}"
      }},
      "inputs": ["merged_data"],
      "output_name": "overview"
    }}
  ],
  "total_atoms": 2,
  "estimated_duration": "20-30 seconds",
  "reasoning": "Files exist, skip upload and start with merge"
}}
```

**Example 2 - Files need to be uploaded**:
```json
{{
  "sequence": [
    {{
      "step": 1,
      "atom_id": "data-upload-validate",
      "purpose": "Load the data file",
      "prompt": "Upload and validate sales.csv",
      "inputs": [],
      "output_name": "sales_data"
    }},
    {{
      "step": 2,
      "atom_id": "chart-maker",
      "purpose": "Create visualization",
      "prompt": "Create a bar chart from {{{{sales_data}}}}",
      "inputs": ["sales_data"],
      "output_name": "chart"
    }}
  ],
  "total_atoms": 2,
  "estimated_duration": "25-35 seconds",
  "reasoning": "Files not found, need to upload first"
}}
```

**Available Atom IDs with Required Parameters**:

- `merge` - **Required**: file1, file2 | **Optional**: join_type (inner/outer/left/right), join_columns
- `concat` - **Required**: file1, file2 | **Optional**: concat_direction (vertical/horizontal)
- `groupby-wtg-avg` - **Required**: data_source, group_columns (array) | **Optional**: aggregations, weight_column
- `dataframe-operations` - **Required**: data_source, operation (filter/sort/select) | **Optional**: filter_condition, sort_columns, select_columns
- `create-column` - **Required**: data_source, new_column_name, formula
- `chart-maker` - **Required**: data_source, chart_type (bar/line/scatter/pie) | **Optional**: x_column, y_column, title
- `feature-overview` - **Required**: data_source
- `correlation` - **Required**: data_source | **Optional**: columns, method (pearson/spearman)
- `explore` - **Required**: data_source
- `data-upload-validate` - **Required**: file_path | **Optional**: file_type

**CRITICAL**: Each atom in the sequence MUST include a "parameters" object with all required parameters filled in. Extract parameter values from the user query.

Example parameter extraction:
- "merge uk beans and uk mayo" → {{"file1": "D0_KHC_UK_Beans.arrow", "file2": "D0_KHC_UK_Mayo.arrow"}}
- "filter revenue > 1000" → {{"operation": "filter", "filter_condition": "revenue > 1000"}}
- "group by region" → {{"group_columns": ["region"]}}

Generate the sequence now:"""
        
        return prompt
    
    async def generate_sequence(
        self,
        user_query: str,
        file_context: Optional[Dict[str, Any]] = None,
        max_retries: int = 2
    ) -> Dict[str, Any]:
        """
        Generate an atom sequence from user query.
        
        Args:
            user_query: User's query
            file_context: Optional context about available files
            max_retries: Maximum number of retry attempts
            
        Returns:
            Dict with sequence or error
        """
        logger.info(f"🔄 Generating sequence for query: {user_query[:100]}...")
        
        # Build prompt
        prompt = self._build_sequence_prompt(user_query, file_context)
        
        # Try to generate sequence with retries
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    logger.info(f"🔄 Retry attempt {attempt + 1}/{max_retries}")
                
                # Call LLM (now async)
                response = await self._call_llm(prompt)
                
                if not response:
                    continue
                
                # Extract JSON
                sequence_json = self._extract_json_from_response(response)
                
                if not sequence_json:
                    logger.warning(f"⚠️ Could not extract JSON from response (attempt {attempt + 1})")
                    continue
                
                # Validate sequence
                if not self._validate_sequence_json(sequence_json):
                    logger.warning(f"⚠️ Invalid sequence JSON (attempt {attempt + 1})")
                    continue
                
                # Enhance with endpoints
                sequence_json = self._enhance_sequence_with_endpoints(sequence_json)
                
                logger.info(f"✅ Sequence generated successfully ({len(sequence_json.get('sequence', []))} atoms)")
                return {
                    "success": True,
                    "sequence": sequence_json,
                    "user_query": user_query
                }
                
            except Exception as e:
                logger.error(f"❌ Error generating sequence (attempt {attempt + 1}): {e}")
                continue
        
        # Fallback: generate simple sequence from RAG
        logger.warning("⚠️ LLM generation failed, using RAG fallback")
        return self._generate_fallback_sequence(user_query)
    
    def _validate_sequence_json(self, sequence_json: Dict[str, Any]) -> bool:
        """
        Validate the generated sequence JSON.
        
        Args:
            sequence_json: Sequence JSON to validate
            
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(sequence_json, dict):
            return False
        
        if "sequence" not in sequence_json:
            return False
        
        sequence = sequence_json["sequence"]
        if not isinstance(sequence, list) or len(sequence) == 0:
            return False
        
        # Check each atom in sequence
        for atom in sequence:
            if not isinstance(atom, dict):
                return False
            
            required_fields = ["step", "atom_id", "purpose", "prompt", "inputs", "output_name"]
            for field in required_fields:
                if field not in atom:
                    logger.warning(f"⚠️ Missing field '{field}' in atom")
                    return False
            
            # Check if parameters exist (not strictly required, but recommended)
            if "parameters" not in atom:
                logger.warning(f"⚠️ Atom {atom['atom_id']} missing 'parameters' field - may cause execution issues")
        
        return True
    
    def _enhance_sequence_with_endpoints(self, sequence_json: Dict[str, Any]) -> Dict[str, Any]:
        """
        Add endpoint information to each atom in sequence.
        
        Args:
            sequence_json: Sequence JSON
            
        Returns:
            Enhanced sequence JSON
        """
        if not ATOM_MAPPING_AVAILABLE:
            return sequence_json
        
        for atom in sequence_json.get("sequence", []):
            atom_id = atom.get("atom_id", "")
            
            # Get endpoint from mapping
            if atom_id in ATOM_MAPPING:
                atom["endpoint"] = ATOM_MAPPING[atom_id]["endpoint"]
            else:
                # Try to construct endpoint
                atom["endpoint"] = f"/trinityai/{atom_id}"
            
            logger.debug(f"  {atom_id} → {atom.get('endpoint')}")
        
        return sequence_json
    
    def _generate_fallback_sequence(self, user_query: str) -> Dict[str, Any]:
        """
        Generate a simple fallback sequence using RAG.
        
        Args:
            user_query: User's query
            
        Returns:
            Dict with fallback sequence
        """
        logger.info("🔄 Generating fallback sequence from RAG...")
        
        if not self.rag_engine:
            # Ultra-basic fallback
            return {
                "success": False,
                "error": "Could not generate sequence - LLM and RAG unavailable",
                "sequence": {
                    "sequence": [
                        {
                            "step": 1,
                            "atom_id": "data-upload-validate",
                            "purpose": "Load data",
                            "prompt": user_query,
                            "inputs": [],
                            "output_name": "data",
                            "endpoint": "/trinityai/upload"
                        }
                    ],
                    "total_atoms": 1,
                    "estimated_duration": "10-20 seconds",
                    "reasoning": "Fallback sequence - basic data upload"
                }
            }
        
        # Use RAG to recommend sequence
        recommended = self.rag_engine.recommend_atom_sequence(user_query)
        
        sequence = []
        for i, atom_rec in enumerate(recommended, 1):
            atom_id = atom_rec["atom_id"]
            
            # Get endpoint
            endpoint = "/trinityai/upload"
            if atom_id in ATOM_MAPPING:
                endpoint = ATOM_MAPPING[atom_id]["endpoint"]
            
            # Build atom step
            sequence.append({
                "step": i,
                "atom_id": atom_id,
                "purpose": atom_rec.get("reason", f"Execute {atom_id}"),
                "prompt": user_query if i == 1 else f"Process data from previous step for {atom_id}",
                "inputs": [] if i == 1 else [f"step_{i-1}_output"],
                "output_name": f"step_{i}_output",
                "endpoint": endpoint
            })
        
        logger.info(f"✅ Fallback sequence generated ({len(sequence)} atoms)")
        
        return {
            "success": True,
            "fallback": True,
            "sequence": {
                "sequence": sequence,
                "total_atoms": len(sequence),
                "estimated_duration": f"{len(sequence) * 15}-{len(sequence) * 20} seconds",
                "reasoning": "RAG-based sequence recommendation"
            },
            "user_query": user_query
        }


# Global instance
_sequence_generator: Optional[StreamSequenceGenerator] = None


def get_sequence_generator() -> StreamSequenceGenerator:
    """
    Get singleton sequence generator instance.
    
    Returns:
        StreamSequenceGenerator instance
    """
    global _sequence_generator
    if _sequence_generator is None:
        _sequence_generator = StreamSequenceGenerator()
        logger.info("✅ Global StreamSequenceGenerator instance created")
    return _sequence_generator


# For testing
if __name__ == "__main__":
    # Test the generator
    generator = StreamSequenceGenerator()
    
    # Test query
    query = "Load sales.csv, filter revenue > 1000, group by region, and create a chart"
    
    print(f"\n{'='*80}")
    print(f"Query: {query}")
    print(f"{'='*80}\n")
    
    result = generator.generate_sequence(query)
    
    if result.get("success"):
        sequence = result["sequence"]
        print(f"✅ Sequence generated successfully")
        print(f"Total atoms: {sequence.get('total_atoms')}")
        print(f"Estimated duration: {sequence.get('estimated_duration')}")
        print(f"\nSequence:")
        for atom in sequence.get("sequence", []):
            print(f"{atom['step']}. {atom['atom_id']}")
            print(f"   Purpose: {atom['purpose']}")
            print(f"   Prompt: {atom['prompt'][:80]}...")
            print(f"   Endpoint: {atom.get('endpoint', 'N/A')}")
    else:
        print(f"❌ Failed: {result.get('error')}")

