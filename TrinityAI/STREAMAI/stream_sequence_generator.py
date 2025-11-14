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

logger = logging.getLogger("trinity.trinityai.generator")

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

# Import atom capabilities JSON
ATOM_CAPABILITIES = None
try:
    capabilities_path = Path(__file__).parent / "rag" / "atom_capabilities.json"
    if capabilities_path.exists():
        with open(capabilities_path, 'r', encoding='utf-8') as f:
            ATOM_CAPABILITIES = json.load(f)
        logger.info(f"✅ Loaded atom capabilities from {capabilities_path}")
    else:
        logger.warning(f"⚠️ Atom capabilities file not found: {capabilities_path}")
except Exception as e:
    logger.warning(f"⚠️ Could not load atom capabilities: {e}")

# Common synonym mapping for frequent column intents (helps abbreviations)
COMMON_COLUMN_SYNONYMS: Dict[str, List[str]] = {
    "sales": ["sales", "sale", "revenue", "rev", "gmv", "amount", "amt", "value"],
    "revenue": ["revenue", "rev", "sales", "sale", "gmv"],
    "region": ["region", "reg", "geo", "geography", "territory", "area", "location"],
    "market": ["market", "mkt", "channel", "chnl", "trade"],
    "channel": ["channel", "chn", "market", "trade"],
    "brand": ["brand", "brd", "label"],
    "product": ["product", "prod", "sku", "item"],
    "customer": ["customer", "cust", "client"],
    "country": ["country", "cntry", "nation"],
    "date": ["date", "dt", "day"],
    "month": ["month", "mnth", "mo"],
    "year": ["year", "yr", "fiscal"],
    "quantity": ["quantity", "qty", "volume", "vol", "units", "unit"],
    "volume": ["volume", "vol", "qty", "quantity"],
    "profit": ["profit", "margin", "mgn"],
}

# Import atom mapping for endpoint resolution
try:
    from STREAMAI.atom_mapping import ATOM_MAPPING
    ATOM_MAPPING_AVAILABLE = True
    logger.info("✅ ATOM_MAPPING imported successfully")
except ImportError as e:
    ATOM_MAPPING_AVAILABLE = False
    ATOM_MAPPING = {}
    logger.warning(f"⚠️ ATOM_MAPPING not available: {e}")


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
    
    def _build_basic_file_list(self, files_list: List[Dict[str, Any]]) -> str:
        """Build basic file list when comprehensive details unavailable"""
        file_context_section = "\n## Available Saved Files (Already in MinIO):\n\n"
        for file_info in files_list[:10]:
            file_name = file_info.get("displayName") or file_info.get("name", "unknown")
            file_context_section += f"- **{file_name}** (already loaded)\n"
        
        if len(files_list) > 10:
            file_context_section += f"\n... and {len(files_list) - 10} more files\n"
        
        file_context_section += "\n**IMPORTANT**: These files are already loaded in the system. "
        file_context_section += "If the user mentions any of these files, **DO NOT** include `data-upload-validate` in the sequence. "
        file_context_section += "Instead, start directly with the operation atoms (merge, concat, groupby, etc.) that use these existing files.\n"
        return file_context_section
    
    def _build_sequence_prompt(self, user_query: str, file_context: Optional[Dict[str, Any]] = None) -> str:
        """
        Build the LLM prompt for sequence generation with comprehensive file details.
        Now uses FileHandler to get detailed file information (same as dataframe operations).
        
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
        
        # 🔧 NEW: Get comprehensive file details using FileHandler (same as dataframe operations)
        comprehensive_file_details = ""
        file_details_loaded: Optional[Dict[str, Any]] = None
        file_details_for_aliases: Dict[str, Any] = {}
        has_existing_files = False
        mentioned_files = []
        
        if file_context and file_context.get("files"):
            has_existing_files = True
            files_list = file_context.get("files", [])
            
            # Try to get comprehensive file details using FileHandler
            try:
                from File_handler.available_minio_files import FileHandler, get_file_handler
                import os
                
                # Initialize FileHandler
                file_handler = get_file_handler(
                    minio_endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
                    minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
                    minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
                    minio_bucket=os.getenv("MINIO_BUCKET", "trinity"),
                    object_prefix=""
                )
                
                # Extract file names/paths from file_context
                file_names = []
                for file_info in files_list:
                    file_path = file_info.get("name") or file_info.get("displayName", "")
                    if file_path:
                        # Extract filename from path
                        filename = file_path.split('/')[-1] if '/' in file_path else file_path
                        file_names.append(filename)
                        mentioned_files.append(file_path)
                
                # Get comprehensive file details for mentioned files
                if file_names:
                    logger.info(f"📥 Loading comprehensive file details for {len(file_names)} file(s)")
                    file_details_dict = file_handler.get_file_context(file_names, use_backend_endpoint=True)
                    
                    if file_details_dict:
                        # Format comprehensive file details for prompt
                        comprehensive_file_details = file_handler.format_file_context_for_llm(file_details_dict)
                        file_details_for_aliases = file_details_dict
                        file_details_loaded = file_details_dict
                        logger.info(f"✅ Loaded comprehensive file details for {len(file_details_dict)} file(s)")
                    else:
                        logger.warning("⚠️ Could not load comprehensive file details, using basic file list")
                        comprehensive_file_details = self._build_basic_file_list(files_list)
                else:
                    comprehensive_file_details = self._build_basic_file_list(files_list)
                    
            except Exception as e:
                logger.warning(f"⚠️ Could not load comprehensive file details: {e}")
                comprehensive_file_details = self._build_basic_file_list(files_list)
        else:
            comprehensive_file_details = ""
        
        # Build file context section with comprehensive details
        file_context_section = ""
        if comprehensive_file_details:
            file_context_section = comprehensive_file_details
            file_context_section += "\n**CRITICAL INSTRUCTIONS FOR FILE USAGE:**\n"
            file_context_section += "1. **Use EXACT column names** from the file details above (case-sensitive, including spaces)\n"
            file_context_section += "2. **Reference actual data types** when selecting operations (numeric vs categorical)\n"
            file_context_section += "3. **Use unique values** from categorical columns for filters and groupby operations\n"
            file_context_section += "4. **Check row counts** to understand data size before operations\n"
            file_context_section += "5. **If files exist above, DO NOT include `data-upload-validate`** - start directly with operations\n"
            file_context_section += "6. **Reference files by their exact names** shown in the file details\n"
            # Add column alias map so LLM can resolve abbreviations/synonyms
            alias_section = self._build_column_alias_map(file_details_for_aliases or file_details_loaded)
            if alias_section:
                file_context_section += alias_section
                file_context_section += "Always convert user abbreviations/synonyms to the exact column/value names listed above.\n"
            file_context_section += "\n**COLUMN VALIDATION RULES:**\n"
            file_context_section += "- BEFORE referencing any column/value, locate it in the file details above and copy the exact spelling (case-sensitive, spaces preserved).\n"
            file_context_section += "- If the user uses an abbreviation (e.g., 'reg', 'rev', 'qty'), map it to the closest matching column from the alias map above BEFORE building steps.\n"
            file_context_section += "- If a requested column/value is not found in the metadata, pick the closest match that exists or ask the user to clarify. NEVER invent new columns.\n"
        
        prompt = f"""You are Trinity AI, an intelligent atom sequencing system for data analysis.

**USER QUERY**: "{user_query}"

{file_context_section}

{rag_context}

## Your Task:

Analyze the user's query CAREFULLY and generate a logical sequence of atoms that will complete the task.
Each atom is a data processing step that can be executed in sequence.

**CRITICAL RULES FOR TOOL SELECTION**:

1. **FILE HANDLING**:
   - ✅ If files exist in file details above → **SKIP** `data-upload-validate`, start with operations
   - ✅ If files NOT in saved files OR query mentions "load"/"upload" → Include `data-upload-validate` first
   - ✅ Use EXACT file names from file details (case-sensitive, with extensions)

2. **TOOL SELECTION LOGIC** (Choose the RIGHT tool for each task):
   - **`merge`**: When user says "merge", "join", "combine by key", "inner join", "outer join" → Use when combining datasets on common columns
   - **`concat`**: When user says "concatenate", "append", "stack", "combine vertically/horizontally" → Use when combining datasets without key matching
   - **`groupby-wtg-avg`**: When user says "group by", "aggregate", "summarize", "average by", "count by" → Use for grouping and aggregation
   - **`dataframe-operations`**: When user says "filter", "sort", "select columns", "remove rows", "edit cells" → Use for row/column operations
   - **`create-column`**: When user says "add column", "create column", "calculate", "formula" → Use for new calculated columns
   - **`chart-maker`**: When user says "chart", "graph", "visualize", "plot", "bar chart", "line chart" → Use for visualizations (usually LAST)
   - **`feature-overview`**: When user says "overview", "summary", "describe", "explore data" → Use for data exploration
   - **`correlation`**: When user says "correlation", "relationship", "correlate" → Use for correlation analysis
   - **`explore`**: When user says "explore", "analyze", "investigate" → Use for detailed exploration

3. **SEQUENCE LOGIC**:
   - ✅ Atoms execute sequentially - each atom can use results from previous atoms
   - ✅ Keep sequences concise (2-6 atoms typically)
   - ✅ Each atom needs a clear purpose and detailed prompt
   - ✅ Use result references like `{{{{result_name}}}}` in prompts to refer to previous outputs
   - ✅ **chart-maker** should typically be LAST if visualization is needed
   - ✅ When files exist, reference them by EXACT name in the first atom's prompt

4. **PROMPT QUALITY** (CRITICAL for next steps):
   - ✅ Include EXACT column names from file details (case-sensitive, with spaces)
   - ✅ Reference actual data types (numeric vs categorical) from file details
   - ✅ Use unique values from categorical columns for filters/groupby
   - ✅ Include specific values/conditions from user query
   - ✅ Example: "Filter rows where Region = 'North' AND Revenue > 1000" (not "filter data")
   - ✅ Example: "Group by Product Category and calculate average Sales" (not "group data")

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

**Available Atoms and Their Capabilities**:

{self._format_atom_capabilities_for_prompt()}

**CRITICAL**: Each atom in the sequence MUST include a "parameters" object with all required parameters filled in. Extract parameter values from the user query AND file details.

Example parameter extraction (USE EXACT VALUES FROM FILE DETAILS):
- "merge uk beans and uk mayo" → {{"file1": "D0_KHC_UK_Beans.arrow", "file2": "D0_KHC_UK_Mayo.arrow"}}
- "filter revenue > 1000" → {{"operation": "filter", "filter_condition": "Revenue > 1000"}} (use EXACT column name from file details)
- "group by region" → {{"group_columns": ["Region"]}} (use EXACT column name, check unique values from file details)
- "filter where Product = 'Widget'" → {{"operation": "filter", "filter_condition": "Product = 'Widget'"}} (use EXACT value from unique_values in file details)

**REMEMBER**: 
- Use EXACT column names from file details (case-sensitive)
- Use actual unique values from categorical columns
- Reference actual data types when choosing operations
- Include specific conditions/values from user query
- Make prompts DETAILED and SPECIFIC (not generic)

Generate the sequence now:"""
        
        return prompt
    
    def _format_atom_capabilities_for_prompt(self) -> str:
        """Format atom capabilities JSON for inclusion in prompt"""
        if not ATOM_CAPABILITIES:
            return "Atom capabilities not available. Use basic atom IDs: merge, concat, groupby-wtg-avg, dataframe-operations, chart-maker, etc."
        
        formatted = ""
        for atom in ATOM_CAPABILITIES.get("atoms", []):
            atom_id = atom.get("atom_id", "")
            name = atom.get("name", "")
            description = atom.get("description", "")
            capabilities = atom.get("capabilities", [])
            use_cases = atom.get("use_cases", [])
            required_params = atom.get("required_parameters", {})
            prompt_reqs = atom.get("prompt_requirements", [])
            
            formatted += f"\n**{atom_id}** - {name}\n"
            formatted += f"   Description: {description}\n"
            formatted += f"   Capabilities: {', '.join(capabilities[:3])}\n"
            formatted += f"   Use when: {', '.join(use_cases[:2])}\n"
            formatted += f"   Required Parameters:\n"
            for param, desc in required_params.items():
                formatted += f"     - {param}: {desc}\n"
            if prompt_reqs:
                formatted += f"   Prompt Requirements:\n"
                for req in prompt_reqs[:3]:
                    formatted += f"     - {req}\n"
            formatted += "\n"
        
        # Add workflow rules
        if ATOM_CAPABILITIES.get("workflow_rules"):
            formatted += "\n**WORKFLOW RULES:**\n"
            for rule in ATOM_CAPABILITIES.get("workflow_rules", []):
                formatted += f"- {rule}\n"
        
        return formatted

    def _build_column_alias_map(self, file_details: Optional[Dict[str, Any]]) -> str:
        """
        Build a section that maps user abbreviations/synonyms to actual column names.
        Ensures prompts only use valid column/value names from the files.
        """
        if not file_details:
            return ""

        entries = self._iter_file_detail_entries(file_details)
        if not entries:
            return ""

        lines: List[str] = [
            "\n## Column Alias Map (Use this to match user terms to actual column names):\n",
            "Always convert user abbreviations to the exact column/value names listed here.\n"
        ]

        max_files = 2
        for file_index, (file_name, info) in enumerate(entries):
            if file_index >= max_files:
                lines.append("- (Additional files omitted for brevity)\n")
                break

            columns = info.get("columns") or []
            if not columns:
                continue
            unique_values = info.get("unique_values") or {}

            lines.append(f"**File:** {file_name}")
            max_columns = min(len(columns), 8)
            for column_name in columns[:max_columns]:
                alias_candidates = self._generate_column_aliases(column_name)
                if not alias_candidates:
                    continue
                alias_preview = ", ".join(alias_candidates[:6])
                lines.append(f"- Column `{column_name}` → Recognize user terms: {alias_preview}")

                value_list = unique_values.get(column_name) or []
                if value_list:
                    preview_values = value_list[:3]
                    for value in preview_values:
                        value_aliases = self._generate_value_aliases(value)
                        if value_aliases:
                            lines.append(f"    • Value `{value}` aliases: {', '.join(value_aliases[:4])}")

            if len(columns) > max_columns:
                lines.append(f"- ... {len(columns) - max_columns} more columns in {file_name}")

            lines.append("")  # spacing

        return "\n".join(lines)

    def _iter_file_detail_entries(self, details: Dict[str, Any]) -> List[tuple]:
        """Return iterable list of (file_name, info) pairs containing column metadata."""
        if not isinstance(details, dict):
            return []

        if "columns" in details:
            name = details.get("object_name") or details.get("file_id") or "selected_file"
            return [(name, details)]

        entries: List[tuple] = []
        for key, value in details.items():
            if isinstance(value, dict) and "columns" in value:
                entries.append((key, value))
        return entries

    def _generate_column_aliases(self, column_name: str) -> List[str]:
        """Generate alias candidates for column names (synonyms + abbreviations)."""
        if not column_name:
            return []

        normalized = column_name.strip().lower()
        tokens = [token for token in re.split(r"[\\s_\\-]+", normalized) if token]
        alias_set = set()

        alias_set.add(normalized)
        alias_set.add(normalized.replace(" ", ""))
        alias_set.add(normalized.replace(" ", "_"))
        alias_set.add(normalized.replace(" ", "").rstrip("s"))

        if tokens:
            acronym = "".join(token[0] for token in tokens if token)
            if len(acronym) >= 2:
                alias_set.add(acronym)
        if len(normalized) > 3:
            alias_set.add(normalized[:3])
            alias_set.add(normalized[:4])

        # Add common synonyms
        for token in tokens:
            if token in COMMON_COLUMN_SYNONYMS:
                alias_set.update(COMMON_COLUMN_SYNONYMS[token])

        for keyword, synonyms in COMMON_COLUMN_SYNONYMS.items():
            if keyword in normalized:
                alias_set.update(synonyms)

        alias_set.discard(column_name.lower())
        alias_set.add(column_name)  # ensure actual name present for clarity

        return [alias for alias in alias_set if alias]

    def _generate_value_aliases(self, value: Any) -> List[str]:
        """Generate alias candidates for categorical values (handles abbreviations)."""
        if value is None:
            return []
        value_str = str(value).strip()
        if not value_str:
            return []

        normalized = value_str.lower()
        alias_set = {
            value_str,
            normalized,
            normalized.replace(" ", ""),
            normalized.replace(" ", "_"),
            normalized[:3] if len(normalized) > 3 else normalized,
        }

        tokens = [token for token in re.split(r"[\\s_\\-]+", normalized) if token]
        if tokens:
            acronym = "".join(token[0] for token in tokens if token)
            if len(acronym) >= 2:
                alias_set.add(acronym)

        alias_set.discard("")
        return [alias for alias in alias_set if alias]
    
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

