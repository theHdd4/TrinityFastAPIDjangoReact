import os
import sys
import json
import logging
import requests
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from pathlib import Path

# Add the parent directory to sys.path to import from main_api
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from main_api import get_llm_config
from text_cleaner import clean_ai_response
from agent_orchestrator import orchestrate_workflow

# Add SUPERAGENT directory to sys.path for local imports
SUPERAGENT_DIR = Path(__file__).resolve().parent
if str(SUPERAGENT_DIR) not in sys.path:
    sys.path.append(str(SUPERAGENT_DIR))

from atom_mapping import detect_atom_from_prompt, get_atom_info, ATOM_MAPPING

# Set up logger first (before any logging calls)
logger = logging.getLogger("trinity.superagent")

# Import file loader for file awareness (like old SuperAgent)
try:
    from file_loader import FileLoader
    FILE_LOADER_AVAILABLE = True
except ImportError:
    FILE_LOADER_AVAILABLE = False

# Import FileHandler for @filename mention support
try:
    from File_handler.available_minio_files import FileHandler, get_file_handler
    FILE_HANDLER_AVAILABLE = True
    logger.info("✅ FileHandler imported successfully")
except ImportError as e:
    FILE_HANDLER_AVAILABLE = False
    logger.warning(f"⚠️ FileHandler not available: {e}")

# Import the smart workflow agent (like other agents)
try:
    from SUPERAGENT.llm_workflow import SmartWorkflowAgent
    SMART_WORKFLOW_AVAILABLE = True
    logger.info("✅ SmartWorkflowAgent imported successfully")
except ImportError as e:
    try:
        # Try without SUPERAGENT prefix (for direct import)
        from llm_workflow import SmartWorkflowAgent
        SMART_WORKFLOW_AVAILABLE = True
        logger.info("✅ SmartWorkflowAgent imported successfully (direct)")
    except ImportError as e2:
        SMART_WORKFLOW_AVAILABLE = False
        logger.warning(f"⚠️ SmartWorkflowAgent not available: {e} | {e2}")

# Create router for SuperAgent endpoints
router = APIRouter(prefix="/superagent", tags=["SuperAgent"])

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    client_name: Optional[str] = ""
    app_name: Optional[str] = ""
    project_name: Optional[str] = ""
    mode: Optional[str] = "laboratory"  # "laboratory" or "workflow"
    workflow_context: Optional[Dict[str, Any]] = None  # Workflow-specific context

class OrchestrateRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    workflow_json: Optional[Dict[str, Any]] = None  # Pre-generated workflow JSON
    client_name: Optional[str] = ""
    app_name: Optional[str] = ""
    project_name: Optional[str] = ""
    mode: Optional[str] = "laboratory"  # "laboratory" or "workflow"
    workflow_context: Optional[Dict[str, Any]] = None  # Workflow-specific context

class ChatResponse(BaseModel):
    response: str

class SuperAgentLLMClient:
    """Enhanced SuperAgent with intelligent routing, file awareness, and workflow generation."""
    
    def __init__(self):
        self.config = get_llm_config()
        self.api_url = self.config["api_url"]
        self.model_name = self.config["model_name"]
        self.bearer_token = self.config["bearer_token"]
        self.is_connected = False
        
        # Initialize file loader for file awareness (like old SuperAgent)
        self.file_loader = None
        if FILE_LOADER_AVAILABLE:
            try:
                self.file_loader = FileLoader(
                    minio_endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
                    minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
                    minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
                    minio_bucket=os.getenv("MINIO_BUCKET", "trinity"),
                    object_prefix=""
                )
                logger.info("FileLoader initialized for file awareness")
            except Exception as e:
                logger.warning(f"Failed to initialize FileLoader: {e}")
                self.file_loader = None
        
        # Initialize FileHandler for @filename mention support
        self.file_handler = None
        if FILE_HANDLER_AVAILABLE:
            try:
                self.file_handler = get_file_handler(
                    minio_endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
                    minio_access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
                    minio_secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
                    minio_bucket=os.getenv("MINIO_BUCKET", "trinity"),
                    object_prefix=""
                )
                logger.info("✅ FileHandler initialized for @filename mention support")
            except Exception as e:
                logger.warning(f"⚠️ Failed to initialize FileHandler: {e}")
                self.file_handler = None
        
        # FastAPI base URL for Laboratory Card Generation API
        self.fastapi_base_url = os.getenv("FASTAPI_BASE_URL", "http://localhost:8001")
        logger.info(f"FastAPI Base URL: {self.fastapi_base_url}")
        
        # Note: Workflow generator is now handled by SmartWorkflowAgent (initialized separately at module level)
        # No need to initialize here anymore
        
        # Agent capabilities mapping (from enhanced SuperAgent)
        # Note: These are internal names for routing logic
        # Actual atomIds use kebab-case (handled by atom_mapping.py)
        self.agent_capabilities = {
            "Agent_chart-maker": {
                "keywords": ["chart", "graph", "visualization", "plot", "dashboard", "chart maker", "bar chart", "line chart", "pie chart", "histogram", "heatmap", "interactive chart", "business dashboard", "analytics chart"],
                "description": "Creates interactive charts and visualizations using FastAPI, pandas, and Plotly. Supports bar, line, area, pie, histogram, heatmap, waterfall charts with data filtering and business dashboards.",
                "atomId": "chart-maker"
            },
            "Agent_concat": {
                "keywords": ["concat", "concatenate", "combine", "merge", "join", "stack", "append", "vertical merge", "horizontal merge", "row-wise", "column-wise", "combine datasets"],
                "description": "Combines datasets vertically (row-wise) or horizontally (column-wise) for data stacking and extending operations.",
                "atomId": "concat"
            },
            "Agent_create-and-transform-features": {
                "keywords": ["transform", "create", "feature engineering", "new columns", "calculated fields", "add", "subtract", "multiply", "divide", "dummy variable", "residual", "trend", "RPI", "column operations"],
                "description": "Generates new columns through various operations and transformations including mathematical operations, dummy conversion, trend detection, and feature engineering.",
                "atomId": "create-and-transform-features"
            },
            "Agent_dataframe-operations": {
                "keywords": ["dataframe", "data operations", "pandas", "data manipulation", "data processing", "data analysis", "data cleaning", "data transformation", "data filtering"],
                "description": "Performs comprehensive DataFrame operations and data manipulation including cleaning, transformation, filtering, and analysis tasks.",
                "atomId": "dataframe-operations"
            },
            "Agent_explore": {
                "keywords": ["explore", "exploration", "EDA", "data browsing", "summary statistics", "missing values", "data distribution", "column profiling", "interactive browsing", "data overview"],
                "description": "Interactive data browsing and exploratory data analysis including missing value analysis, column profiling, and data distribution analysis.",
                "atomId": "explore"
            },
            "Agent_fetch_atom": {
                "keywords": ["fetch", "atom", "tool selection", "routing", "recommendation", "AI routing", "intelligent routing", "atom detection", "tool matching"],
                "description": "AI-powered query processor that analyzes user requests and determines the most suitable atom/tool for data analytics tasks with intelligent recommendations.",
                "atomId": "fetch_atom"
            },
            "Agent_groupby-wtg-avg": {
                "keywords": ["groupby", "aggregate", "group", "summarize", "aggregation", "pivot", "weighted average", "dimension analysis", "KPIs", "business intelligence", "segment analysis"],
                "description": "Performs data aggregation and grouping operations across dimensions using statistical functions like sum, mean, weighted average, and rank percentile for business KPIs.",
                "atomId": "groupby-wtg-avg"
            },
            "Agent_merge": {
                "keywords": ["merge", "join", "combine", "VLOOKUP", "SQL join", "data integration", "inner join", "left join", "outer join", "right join", "link data", "match files"],
                "description": "Joins datasets on common columns with various join types (inner, left, right, outer) similar to VLOOKUP or SQL JOIN for data integration.",
                "atomId": "merge"
            }
        }
        
        # Test connection on initialization
        self.test_connection()
        
        logger.info(f"Enhanced SuperAgent initialized with {self.model_name} at {self.api_url}")
    
    def test_connection(self):
        """Test if Ollama is accessible."""
        try:
            # Try a simple health check
            health_url = self.api_url.replace('/api/chat', '/api/tags')
            response = requests.get(health_url, timeout=5)
            self.is_connected = response.status_code == 200
            logger.info(f"Ollama connection test: {'✅ Connected' if self.is_connected else '❌ Failed'}")
        except Exception as e:
            self.is_connected = False
            logger.warning(f"Ollama connection test failed: {e}")
    
    def get_available_files(self) -> List[str]:
        """Get list of available files from MinIO (like old SuperAgent)."""
        if not self.file_loader:
            return []
        
        try:
            # Get files from MinIO
            files = self.file_loader.list_files()
            if files:
                logger.info(f"Found {len(files)} available files")
                return files
            else:
                logger.info("No files found in MinIO")
                return []
        except Exception as e:
            logger.warning(f"Failed to get files from MinIO: {e}")
            return []

    def check_file_mention(self, message: str, client_name: str = "", app_name: str = "", project_name: str = "") -> Dict[str, Any]:
        """Check if user mentions files from loaded files and get file details with columns."""
        try:
            # Set context for file loader (same as dataframe operations agent)
            if client_name or app_name or project_name:
                self.file_loader.set_context(client_name, app_name, project_name)
                # Also set environment variables for dynamic path resolution
                if client_name:
                    os.environ["CLIENT_NAME"] = client_name
                if app_name:
                    os.environ["APP_NAME"] = app_name
                if project_name:
                    os.environ["PROJECT_NAME"] = project_name
                logger.info(f"Environment context set: {client_name}/{app_name}/{project_name}")
            else:
                # Use existing environment variables if no parameters provided
                existing_client = os.getenv("CLIENT_NAME", "")
                existing_app = os.getenv("APP_NAME", "")
                existing_project = os.getenv("PROJECT_NAME", "")
                logger.info(f"Using existing environment context: {existing_client}/{existing_app}/{existing_project}")
            
            logger.info("Loading files from MinIO...")
            
            # Load available files with columns (same method as dataframe operations)
            files_with_columns = self.file_loader.load_files()
            
            if not files_with_columns:
                logger.warning("No files found in MinIO")
                return {
                    "file_mentioned": False, 
                    "available_files": [], 
                    "files_with_columns": {},
                    "total_files": 0,
                    "message": "No files found"
                }
            
            logger.info(f"Loaded {len(files_with_columns)} files with column information")
            
            # Build file information structure
            file_info_map = {}
            file_names_list = []
            
            for file_path, file_data in files_with_columns.items():
                file_name = os.path.basename(file_path)
                file_name_without_ext = os.path.splitext(file_name)[0]
                
                columns = file_data.get('columns', []) if isinstance(file_data, dict) else file_data
                
                file_info_map[file_name] = {
                    "full_path": file_path,
                    "file_name": file_name,
                    "columns": columns,
                    "column_count": len(columns)
                }
                
                file_names_list.append(file_name.lower())
                file_names_list.append(file_name_without_ext.lower())
            
            # No file matching needed - LLM will understand from prompt
            mentioned_files = []
            mentioned_file_details = []
            
            return {
                "file_mentioned": len(mentioned_files) > 0,
                "mentioned_files": mentioned_files,
                "mentioned_file_details": mentioned_file_details,
                "available_files": list(files_with_columns.keys()),
                "files_with_columns": file_info_map,
                "total_files": len(files_with_columns)
            }
            
        except Exception as e:
            logger.error(f"Error checking file mentions: {e}")
            return {
                "file_mentioned": False, 
                "available_files": [], 
                "files_with_columns": {},
                "total_files": 0,
                "error": str(e)
            }

    def determine_domain_relevance(self, message: str, file_check_result: Dict[str, Any]) -> Dict[str, Any]:
        """Use LLM to determine if the prompt is domain-related and generate routing decision."""
        
        if not self.is_connected:
            return self._get_fallback_domain_assessment(message, file_check_result)
        
        # Build context about available files - just send all files to LLM
        file_context = ""
        if file_check_result.get("files_with_columns"):
            files_with_columns = file_check_result.get("files_with_columns", {})
            total_files = file_check_result.get("total_files", 0)
            
            file_context = f"\n\nAvailable Files ({total_files} total):\n"
            
            # Show all files with columns
            for i, (file_name, info) in enumerate(list(files_with_columns.items())):
                file_context += f"\n{i+1}. {file_name} ({info['column_count']} columns)\n"
                file_context += f"   Columns: {', '.join(info['columns'])}\n"
            
            file_context += "\nThe LLM will automatically understand which files the user is referring to from their prompt."
        
        # Build agent capabilities context
        agent_context = "\n\nAvailable agents and their capabilities:\n"
        for agent, capabilities in self.agent_capabilities.items():
            keywords_str = ", ".join(capabilities["keywords"][:10])  # Limit keywords for prompt size
            agent_context += f"- {agent}: {capabilities['description']} (Keywords: {keywords_str})\n"
        
        prompt = f"""You are an expert data science and analytics consultant. Analyze the user's message and determine:

1. Is this message related to data science, analytics, visualization, or business intelligence?
2. If yes, which agents should handle this request?
3. Should a workflow be generated for this data science problem?

User Message: "{message}"
{file_context}
{agent_context}

IMPORTANT AGENT SELECTION RULES:
- DO NOT recommend "Agent_fetch_atom" as it's handled automatically
- Only recommend actual operation agents (Agent_Merge, Agent_concat, Agent_explore, etc.)
- Each atom will automatically fetch itself when needed

Instructions:
- The LLM will automatically understand which files the user is referring to from their prompt
- Consider data science keywords: data, analysis, chart, graph, visualization, statistics, machine learning, modeling, etc.
- For domain-related queries, recommend specific agents from the available list (EXCLUDE Agent_fetch_atom)
- ALWAYS set workflow_needed: true for domain-related requests (to trigger card calling and drawing)
- Generate workflows for complex data science problems that require multiple steps

Respond with ONLY valid JSON in this exact format:

{{
  "is_domain_related": true/false,
  "domain_reason": "Brief explanation of why it is/isn't domain-related",
  "recommended_agents": ["Agent_name1", "Agent_name2"] or [],
  "workflow_needed": true/false,
  "workflow_steps": ["step1", "step2"] or [],
  "confidence": 0.0-1.0
}}"""

        try:
            messages = [
                {
                    "role": "system", 
                    "content": "You are a data science expert. You MUST respond with ONLY valid JSON. Do NOT include any explanatory text, markdown formatting, code blocks, or any other content. Return ONLY the raw JSON object starting with { and ending with }. No text before or after the JSON."
                },
                {
                    "role": "user", 
                    "content": prompt
                }
            ]
            
            payload = {
                "model": self.model_name,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 800
                }
            }
            
            logger.info(f"LLM Domain Assessment Request for: {message[:100]}...")
            
            response = requests.post(
                self.api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            response.raise_for_status()
            result = response.json()
            
            if "message" in result and "content" in result["message"]:
                raw_response = result["message"]["content"]
                logger.info(f"Raw domain assessment response: {raw_response[:200]}...")
                
                # Check if response is empty or too short
                if not raw_response or len(raw_response.strip()) < 10:
                    logger.error("LLM returned empty or very short response")
                    return self._get_fallback_domain_assessment(message, file_check_result)
                
                # Simple JSON extraction - just remove markdown code blocks
                try:
                    # Clean markdown code blocks if present
                    cleaned = raw_response.strip()
                    
                    # Remove <think> tags if present (DeepSeek R1 format)
                    if "<think>" in cleaned:
                        start_think = cleaned.find("<think>")
                        end_think = cleaned.find("</think>")
                        if end_think != -1:
                            # Remove everything before </think> including the tag
                            cleaned = cleaned[end_think + 8:].strip()
                    
                    # Extract JSON from markdown code blocks
                    if "```json" in cleaned:
                        # Extract content between ```json and ```
                        start = cleaned.find("```json") + 7
                        end = cleaned.find("```", start)
                        if end != -1:
                            cleaned = cleaned[start:end].strip()
                    elif "```" in cleaned:
                        # Extract content between ``` and ```
                        start = cleaned.find("```") + 3
                        end = cleaned.find("```", start)
                        if end != -1:
                            cleaned = cleaned[start:end].strip()
                    
                    # Find JSON object boundaries
                    if cleaned.startswith('{') and cleaned.endswith('}'):
                        # Already clean JSON
                        pass
                    elif '{' in cleaned and '}' in cleaned:
                        # Extract JSON object
                        start_brace = cleaned.find('{')
                        end_brace = cleaned.rfind('}')
                        if start_brace != -1 and end_brace != -1:
                            cleaned = cleaned[start_brace:end_brace + 1]
                    
                    # Parse the cleaned JSON
                    domain_result = json.loads(cleaned)
                    logger.info(f"Successfully parsed domain assessment: {domain_result}")
                    
                    return self._format_domain_assessment(domain_result, message, file_check_result)
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                
            else:
                logger.error(f"LLM response structure unexpected: {result}")
                
            return self._get_fallback_domain_assessment(message, file_check_result)
                
        except Exception as e:
            logger.error(f"Error in domain assessment: {e}")
            return self._get_fallback_domain_assessment(message, file_check_result)

    def _format_domain_assessment(self, domain_result: Dict[str, Any], message: str, file_check_result: Dict[str, Any]) -> Dict[str, Any]:
        """Format domain assessment result."""
        # Ensure file mention overrides domain assessment if files are mentioned
        if file_check_result.get("file_mentioned", False):
            domain_result["is_domain_related"] = True
            domain_result["domain_reason"] = "User mentioned data files - this is definitely a data science problem"
        
        return domain_result

    def _get_fallback_domain_assessment(self, message: str, file_check_result: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback domain assessment when LLM is not available."""
        message_lower = message.lower()
        
        # Extended data science keywords including file operations and fetch requests
        ds_keywords = [
            "data", "analysis", "chart", "graph", "visualization", "statistics", 
            "model", "machine learning", "analytics", "dashboard", "plot",
            "dataframe", "pandas", "numpy", "excel", "csv", "dataset",
            "file", "merge", "join", "concat", "combine", "group", "filter",
            "uk", "beans", "mayo", "workflow", "task", "operation", "arrow",
            "fetch", "get", "load", "import", "read"
        ]
        
        is_domain_related = any(keyword in message_lower for keyword in ds_keywords)
        
        # Override if files are mentioned
        if file_check_result.get("file_mentioned", False):
            is_domain_related = True
        
        # Check if specific file names are mentioned
        available_files = file_check_result.get("available_files", [])
        specific_files_mentioned = any(file_name.lower() in message_lower for file_name in available_files)
        if specific_files_mentioned:
            is_domain_related = True
        
        recommended_agents = []
        if is_domain_related:
            # Special handling for fetch requests
            if any(word in message_lower for word in ["fetch", "get", "load"]):
                # Extract agent name from fetch request (e.g., "fetch merge" -> "Agent_Merge")
                fetch_agents = []
                if "merge" in message_lower:
                    fetch_agents.append("Agent_Merge")
                if "concat" in message_lower:
                    fetch_agents.append("Agent_concat")
                if "explore" in message_lower:
                    fetch_agents.append("Agent_explore")
                if "chart" in message_lower or "visualization" in message_lower:
                    fetch_agents.append("Agent_chartmaker")
                if "group" in message_lower:
                    fetch_agents.append("Agent_groupby")
                
                # If specific fetch agent found, use it; otherwise default to merge
                if fetch_agents:
                    recommended_agents = fetch_agents
                else:
                    recommended_agents.append("Agent_Merge")  # Default for generic fetch
            else:
                # Regular keyword-based agent recommendation
                if any(word in message_lower for word in ["chart", "graph", "visualization", "plot", "dashboard"]):
                    recommended_agents.append("Agent_chartmaker")
                if any(word in message_lower for word in ["explore", "exploration", "eda", "summary"]):
                    recommended_agents.append("Agent_explore")
                if any(word in message_lower for word in ["merge", "join", "combine"]):
                    recommended_agents.append("Agent_Merge")
                if any(word in message_lower for word in ["concat", "concatenate", "stack"]):
                    recommended_agents.append("Agent_concat")
                
                # Default to merge agent if no specific agent detected but domain-related
                if not recommended_agents:
                    recommended_agents.append("Agent_Merge")
        
        return {
            "is_domain_related": is_domain_related,
            "domain_reason": "File mentioned" if file_check_result.get("file_mentioned") else "Keywords suggest data science work",
            "recommended_agents": recommended_agents,
            "workflow_needed": is_domain_related,  # Always generate workflow for domain-related requests
            "confidence": 0.8 if is_domain_related else 0.3
        }

    def process_message_enhanced(self, message: str, client_name: str = "", app_name: str = "", project_name: str = "") -> Dict[str, Any]:
        """Enhanced message processing with intelligent routing and workflow generation."""
        
        logger.info(f"Enhanced SuperAgent processing: {message[:100]}...")
        
        # Step 1: Check for file mentions and load file details
        logger.info("Step 1: Loading files and checking for mentions...")
        file_check_result = self.check_file_mention(message, client_name, app_name, project_name)
        
        # Step 2: Determine domain relevance
        logger.info("Step 2: Determining domain relevance...")
        domain_assessment = self.determine_domain_relevance(message, file_check_result)
        
        # Step 3: Generate workflow if domain-related
        workflow = None
        if domain_assessment.get("is_domain_related", False):
            logger.info("Step 3: Generating workflow (domain-related request)...")
            # Use the enhanced workflow generation from generate_workflow_json
            workflow_json = self.generate_workflow_json(
                user_prompt=message,
                available_files=list(file_check_result.get("files_with_columns", {}).keys())
            )
            
            if workflow_json and not workflow_json.get("error"):
                workflow = {
                    "workflow_generated": True,
                    "workflow_steps": workflow_json.get("workflow", []),
                    "total_steps": workflow_json.get("total_steps", 0),
                    "is_data_science": workflow_json.get("is_data_science", True)
                }
        
        # Step 4: Generate response
        response = self._generate_enhanced_response(message, domain_assessment, file_check_result, workflow)
        
        # Build comprehensive result
        result = {
            "response": response,
            "is_domain_related": domain_assessment.get("is_domain_related", False),
            "workflow_generated": workflow.get("workflow_generated", False) if workflow else False,
            "recommended_agents": domain_assessment.get("recommended_agents", []),
            "file_mentioned": file_check_result.get("file_mentioned", False),
            "processing_details": {
                "domain_reason": domain_assessment.get("domain_reason", ""),
                "confidence": domain_assessment.get("confidence", 0.0),
                "mentioned_files": file_check_result.get("mentioned_files", []),
                "available_files_count": file_check_result.get("total_files", 0),
                "workflow": workflow,
                "enhanced_processing": True
            }
        }
        
        logger.info(f"Enhanced processing complete. Domain related: {result['is_domain_related']}")
        return result

    def _generate_enhanced_response(self, message: str, domain_assessment: Dict[str, Any], file_check_result: Dict[str, Any], workflow: Dict[str, Any] = None) -> str:
        """Generate enhanced response based on domain assessment and workflow."""
        
        if not self.is_connected:
            return self._get_fallback_response(message, domain_assessment, file_check_result, workflow)
        
        # Build context for response generation
        context_parts = []
        
        if domain_assessment.get("is_domain_related", False):
            context_parts.append("DOMAIN: Data science/analytics related")
            if domain_assessment.get("recommended_agents"):
                agents_str = ", ".join(domain_assessment["recommended_agents"])
                context_parts.append(f"RECOMMENDED AGENTS: {agents_str}")
        else:
            context_parts.append("DOMAIN: Not data science/analytics related")
        
        if file_check_result.get("file_mentioned", False):
            mentioned_files = file_check_result.get("mentioned_files", [])
            context_parts.append(f"FILES MENTIONED: {', '.join(mentioned_files)}")
        elif file_check_result.get("total_files", 0) > 0:
            context_parts.append(f"AVAILABLE FILES: {file_check_result.get('total_files', 0)} files in system")
        
        if workflow and workflow.get("workflow_generated", False):
            context_parts.append("WORKFLOW: Available")
        
        context = " | ".join(context_parts)
        
        # Include file information in prompt
        file_context = ""
        if file_check_result.get("files_with_columns"):
            file_context = "\n\nACTUAL FILE INFORMATION (DO NOT INVENT OTHER FILES):\n"
            files_with_columns = file_check_result.get("files_with_columns", {})
            for i, (file_name, info) in enumerate(list(files_with_columns.items())[:3], 1):
                file_context += f"- {file_name}: {info['column_count']} columns\n"
                file_context += f"  Columns: {', '.join(info['columns'][:10])}\n"
        
        prompt = f"""You are a helpful AI assistant for Trinity data science platform. Generate a helpful response.

User Message: "{message}"

Context: {context}{file_context}

CRITICAL RULES:
- DO NOT create, invent, or mention any file names, column names, or data that is NOT explicitly provided above
- ONLY reference the exact files and columns shown in the ACTUAL FILE INFORMATION section above
- If no specific files are mentioned, simply acknowledge that files are available without listing examples

Instructions:
- If this is a data science problem with files mentioned, be enthusiastic and helpful
- If agents are recommended, mention them and explain how they help
- If a workflow is available, reference it and mention it will be executed automatically
- If not domain-related, politely explain your expertise area
- Keep response concise but informative (2-4 sentences)
- Be encouraging and actionable
- If workflow generated, mention that the workflow will be displayed and executed

Response:"""

        try:
            messages = [
                {
                    "role": "system",
                    "content": "You are a helpful data science AI assistant. Be concise, encouraging, and actionable. CRITICAL: Never invent or hallucinate file names, column names, or data that is not explicitly provided to you. Only reference information that is given in the context. Respond with natural language text (not JSON) for this response."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            payload = {
                "model": self.model_name,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.3,
                    "num_predict": 300
                }
            }
            
            response = requests.post(
                self.api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=20
            )
            
            response.raise_for_status()
            result = response.json()
            
            if "message" in result and "content" in result["message"]:
                raw_response = result["message"]["content"]
                cleaned_response = clean_ai_response(raw_response)
                return cleaned_response
            
            return self._get_fallback_response(message, domain_assessment, file_check_result, workflow)
            
        except Exception as e:
            logger.error(f"Error generating enhanced response: {e}")
            return self._get_fallback_response(message, domain_assessment, file_check_result, workflow)

    def _get_fallback_response(self, message: str, domain_assessment: Dict[str, Any], file_check_result: Dict[str, Any], workflow: Dict[str, Any] = None) -> str:
        """Fallback response when LLM is not available."""
        response = ""
        
        if domain_assessment.get("is_domain_related", False):
            agents = domain_assessment.get("recommended_agents", [])
            if agents:
                agents_str = ", ".join(agents)
                response = f"I can help you with this data science task! I recommend using these agents: {agents_str}. These tools will help you accomplish your data analysis goals effectively."
            else:
                response = "This looks like a data science question! I can help you with data analysis, visualization, and processing tasks. Please provide more specific details about what you'd like to accomplish."
            
            # Add workflow if available
            if workflow and workflow.get("workflow_generated", False):
                response += f"\n\n📋 **Workflow Generated** ({len(workflow.get('workflow_steps', []))} steps)"
        else:
            response = "I specialize in data science, analytics, and business intelligence tasks. I can help you with data visualization, statistical analysis, machine learning, data processing, and creating workflows. Please ask about specific data analytics operations you need help with."
        
        return response

    def get_ai_response(self, message: str) -> str:
        """Get direct AI response with detailed terminal logging."""
        
        print("\n" + "="*80)
        print("🤖 SUPERAGENT CHAT REQUEST")
        print("="*80)
        print(f"📝 User Message: {message}")
        print("="*80)
        
        if not self.is_connected:
            print("⚠️ LLM not connected - using fallback response")
            print("="*80 + "\n")
            return self.get_fallback_response(message)
        
        try:
            # Simple prompt - just send the message
            messages = [
                {"role": "user", "content": message}
            ]
            
            # Prepare API request payload for Ollama
            payload = {
                "model": self.model_name,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.7,
                    "num_predict": 1000
                }
            }
            
            # Print complete request payload
            print("\n📤 SENDING TO LLM:")
            print("-"*80)
            print(f"🌐 Endpoint: {self.api_url}")
            print(f"🤖 Model: {self.model_name}")
            print(f"\n📦 COMPLETE REQUEST PAYLOAD:")
            print("-"*80)
            import json as json_module
            print(json_module.dumps(payload, indent=2))
            print("="*80)
            
            # Make API request - Ollama doesn't need authorization header
            headers = {
                "Content-Type": "application/json"
            }
            
            logger.info(f"Making request to {self.api_url} with model {self.model_name}")
            
            response = requests.post(
                self.api_url,
                json=payload,
                headers=headers,
                timeout=30
            )
            
            print(f"\n📥 RESPONSE RECEIVED: HTTP {response.status_code}")
            print("="*80)
            
            logger.info(f"Response status: {response.status_code}")
            
            response.raise_for_status()
            result = response.json()
            
            # Print complete API response
            print(f"\n📄 COMPLETE API RESPONSE:")
            print("-"*80)
            print(json_module.dumps(result, indent=2))
            print("="*80)
            
            # Extract and clean response content
            if "message" in result and "content" in result["message"]:
                raw_response = result["message"]["content"]
                cleaned_response = clean_ai_response(raw_response)
                
                print(f"\n🎯 EXTRACTED CONTENT (message.content):")
                print("-"*80)
                print(raw_response)
                print("="*80)
                
                print(f"\n✨ CLEANED RESPONSE (after processing):")
                print("-"*80)
                print(cleaned_response)
                print("="*80 + "\n")
                
                logger.info(f"Raw response: {raw_response[:100]}...")
                logger.info(f"Cleaned response: {cleaned_response[:100]}...")
                return cleaned_response
            else:
                print(f"\n❌ Unexpected response format")
                print(f"Response keys: {list(result.keys())}")
                print("="*80 + "\n")
                logger.error(f"Unexpected response format: {result}")
                return self.get_fallback_response(message)
                
        except requests.exceptions.Timeout:
            logger.error("LLM API request timed out")
            return "I'm experiencing a delay in processing your request. Please try again in a moment."
        except requests.exceptions.ConnectionError:
            logger.error("Failed to connect to LLM API")
            self.is_connected = False
            return self.get_fallback_response(message)
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP error from LLM API: {e}")
            return self.get_fallback_response(message)
        except Exception as e:
            logger.error(f"Unexpected error in get_ai_response: {e}")
            return self.get_fallback_response(message)

    def generate_workflow_json(self, user_prompt: str, available_files: list = None) -> dict:
        """Generate structured JSON workflow from user prompt (like old SuperAgent)."""
        
        logger.info("⚠️ Using built-in workflow generation")
        
        # Since LLM is not reliably generating JSON, use fallback directly
        logger.info("🔄 Generating workflow using keyword-based fallback (reliable)")
        
        print("\n" + "🔄 "*40)
        print("GENERATING WORKFLOW JSON")
        print("🔄 "*40)
        print(f"📝 User Prompt: {user_prompt}")
        
        workflow = self._generate_fallback_workflow(user_prompt)
        
        print(f"\n✅ WORKFLOW GENERATED:")
        print("="*80)
        import json as json_module
        print(json_module.dumps(workflow, indent=2))
        print("="*80 + "\n")
        
        return workflow
    
    def _old_llm_based_generation(self, user_prompt: str, available_files: list = None) -> dict:
        """Old LLM-based generation (currently not used as LLM doesn't generate proper JSON)"""
        
        try:
            # Build file context
            file_context = ""
            if available_files:
                file_context = f"\n\nAvailable Files ({len(available_files)} total):\n"
                for i, file_name in enumerate(available_files[:10], 1):
                    file_context += f"\n{i}. {file_name}"
                if len(available_files) > 10:
                    file_context += f"\n... and {len(available_files) - 10} more files"
            
            # Build tool context (available agents)
            tool_context = """
Available Workflow Steps:
1. CARD_CREATION: Creates a new laboratory card with an atom (always first step)
2. FETCH_ATOM: Fetches relevant atom based on user query (uses /trinityai/chat endpoint)
3. AGENT_EXECUTION: Executes the specific agent (merge, chartmaker, etc.)

Available Agents and Their Endpoints:
• merge: /trinityai/merge - Combines datasets by joining on common columns
• concat: /trinityai/concat - Combines datasets vertically (row-wise) or horizontally (column-wise)  
• chartmaker: /trinityai/chart - Creates interactive charts and visualizations
• groupby: /trinityai/groupby - Groups data and applies aggregation functions
• explore: /trinityai/explore - Explores and analyzes datasets
• dataframe_operations: /trinityai/dataframe-operations - Performs various DataFrame operations
• create_transform: /trinityai/create-transform - Creates new columns or transforms existing data
• fetch_atom: /trinityai/chat - Fetches relevant atoms based on user queries
"""
            
            # Create structured prompt for JSON generation
            planning_prompt = f"""You are a workflow planning agent. Convert the user's request into a structured JSON workflow.

USER REQUEST: "{user_prompt}"
{file_context}

AVAILABLE AGENTS:
- merge: Combines datasets by joining on common columns (endpoint: /trinityai/merge)
- concat: Combines datasets vertically or horizontally (endpoint: /trinityai/concat)
- chartmaker: Creates charts and visualizations (endpoint: /trinityai/chart)
- groupby: Groups and aggregates data (endpoint: /trinityai/groupby)
- explore: Explores and analyzes datasets (endpoint: /trinityai/explore)
- dataframe_operations: DataFrame operations (endpoint: /trinityai/dataframe-operations)
- create_transform: Creates new columns or transforms data (endpoint: /trinityai/create-transform)

WORKFLOW STRUCTURE (ALWAYS 3 STEPS):

Step 1 - CARD_CREATION:
- Create laboratory card for the agent
- endpoint: /api/laboratory/cards
- payload with atomId matching the agent name

Step 2 - FETCH_ATOM:
- Fetch the atom using chat endpoint
- endpoint: /trinityai/chat
- prompt: "fetch <agent_name> atom"

Step 3 - AGENT_EXECUTION:
- Execute the agent with the user's task
- endpoint: /trinityai/<agent_endpoint>
- prompt: "Original user prompt: <original>. Task: <specific_task>"

INSTRUCTIONS:
1. Determine which agent to use based on the user's request
2. Generate exactly 3 steps following the structure above
3. Use the correct endpoint for each agent
4. Return ONLY valid JSON, no extra text

EXAMPLE (for "merge files uk mayo and uk beans"):
{{
  "workflow": [
    {{
      "step": 1,
      "action": "CARD_CREATION",
      "agent": "merge",
      "prompt": "Create laboratory card with merge atom",
      "endpoint": "/api/laboratory/cards",
      "depends_on": null,
      "payload": {{
        "atomId": "merge",
        "source": "ai",
        "llm": "deepseek-r1:32b"
      }}
    }},
    {{
      "step": 2,
      "action": "FETCH_ATOM",
      "agent": "fetch_atom",
      "prompt": "fetch merge atom",
      "endpoint": "/trinityai/chat",
      "depends_on": 1
    }},
    {{
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "merge",
      "prompt": "Original user prompt: merge files uk mayo and uk beans. Task: Merge uk mayo and uk beans files by common columns",
      "endpoint": "/trinityai/merge",
      "depends_on": 2
    }}
  ],
  "is_data_science": true,
  "total_steps": 3,
  "original_prompt": "merge files uk mayo and uk beans"
}}

NOW GENERATE JSON FOR: "{user_prompt}"

CRITICAL: Return ONLY the JSON object. No explanations, no markdown, no code blocks. Just the raw JSON starting with {{ and ending with }}."""

            # Use system message to enforce JSON-only output
            messages = [
                {
                    "role": "system",
                    "content": """You are a JSON workflow generator. You MUST return ONLY valid JSON.

STRICT RULES:
1. Output ONLY the JSON object
2. NO markdown code blocks (no ```)
3. NO explanatory text before or after
4. NO reasoning or thinking tags
5. Start with { and end with }
6. Use double quotes for strings
7. Follow the exact format provided in the example

Your response MUST be parseable by json.loads() in Python."""
                },
                {
                    "role": "user", 
                    "content": planning_prompt
                }
            ]
            
            payload = {
                "model": self.model_name,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.1,  # Very low temperature for consistent JSON
                    "num_predict": 2000,  # More tokens for complete workflow
                    "top_p": 0.9,
                    "top_k": 40
                },
                "format": "json"  # Request JSON format from model
            }
            
            logger.info(f"Generating workflow JSON for: {user_prompt[:100]}...")
            
            response = requests.post(
                self.api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=120  # Increased timeout for complex planning
            )
            
            response.raise_for_status()
            result = response.json()
            
            if "message" in result and "content" in result["message"]:
                raw_response = result["message"]["content"].strip()
                logger.info(f"Raw LLM response: {raw_response[:500]}...")
                
                # Clean thinking tags and markdown
                import re
                import json
                
                # Remove thinking tags
                raw_response = re.sub(r"<think>.*?</think>", "", raw_response, flags=re.DOTALL)
                raw_response = re.sub(r"<reasoning>.*?</reasoning>", "", raw_response, flags=re.DOTALL)
                
                # Remove markdown code blocks
                raw_response = re.sub(r"```json\s*", "", raw_response)
                raw_response = re.sub(r"```\s*", "", raw_response)
                
                # Remove any text before first { and after last }
                first_brace = raw_response.find('{')
                last_brace = raw_response.rfind('}')
                
                if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                    raw_response = raw_response[first_brace:last_brace+1]
                
                raw_response = raw_response.strip()
                
                # Try to parse JSON
                try:
                    workflow_json = json.loads(raw_response)
                    logger.info(f"Successfully parsed workflow JSON with {len(workflow_json.get('workflow', []))} steps")
                    return workflow_json
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON: {e}")
                    logger.error(f"Cleaned response: {raw_response[:500]}")
                    
                    # Try to fix common JSON issues
                    try:
                        # Replace single quotes with double quotes
                        fixed_response = raw_response.replace("'", '"')
                        workflow_json = json.loads(fixed_response)
                        logger.info(f"Successfully parsed after fixing quotes")
                        return workflow_json
                    except:
                        logger.error(f"Could not fix JSON")
                        return {"error": "Failed to parse JSON", "workflow": [], "raw_response": raw_response[:500]}
            
            return {"error": "No response content", "workflow": []}
            
        except Exception as e:
            logger.error(f"Error generating workflow JSON: {e}")
            # Return fallback workflow
            return self._generate_fallback_workflow(user_prompt)
    
    def _generate_fallback_workflow(self, user_prompt: str) -> dict:
        """Generate a fallback workflow when LLM fails"""
        
        logger.info("Generating fallback workflow based on keywords...")
        print("\n🔍 Analyzing prompt for agent detection...")
        
        # Use the atom_mapping module to detect the correct atom
        atom_info = detect_atom_from_prompt(user_prompt)
        
        agent = atom_info["atomId"]
        endpoint = atom_info["endpoint"]
        task_desc = atom_info["task_desc"]
        
        print(f"\n🎯 Selected Agent: {agent}")
        print(f"🌐 Endpoint: {endpoint}")
        print(f"📋 Task: {task_desc}")
        
        # Generate fallback workflow
        workflow = {
            "workflow": [
                {
                    "step": 1,
                    "action": "CARD_CREATION",
                    "prompt": "Create empty laboratory card",
                    "endpoint": "/api/laboratory/cards",
                    "depends_on": None,
                    "payload": {
                        "source": "ai",
                        "llm": "deepseek-r1:32b"
                    }
                },
                {
                    "step": 2,
                    "action": "FETCH_ATOM",
                    "agent": "fetch_atom",
                    "prompt": user_prompt,  # Use original prompt to detect atom
                    "endpoint": "/trinityai/chat",
                    "depends_on": 1
                },
                {
                    "step": 3,
                    "action": "AGENT_EXECUTION",
                    "agent": agent,
                    "prompt": user_prompt,  # Clean prompt - agent will load files
                    "endpoint": endpoint,
                    "depends_on": 2
                }
            ],
            "is_data_science": True,
            "total_steps": 3,
            "original_prompt": user_prompt,
            "fallback": True
        }
        
        logger.info(f"Generated fallback workflow with agent: {agent}")
        return workflow
    
    def get_fallback_response(self, message: str) -> str:
        """Provide fallback responses when LLM is not available."""
        
        # Simple keyword-based responses for common queries
        message_lower = message.lower()
        
        if any(word in message_lower for word in ['hello', 'hi', 'hey', 'good morning', 'good afternoon']):
            return "Hello! I'm Super Agent AI, your intelligent assistant. I'm here to help you with data analysis, atom configuration, and laboratory operations. However, I'm currently unable to connect to the AI service. Please check if Ollama is running on your server."
        
        elif any(word in message_lower for word in ['help', 'assist', 'support']):
            return "I'm here to help you with:\n• Data analysis and visualization\n• Atom configuration and setup\n• Laboratory operations and workflows\n• DataFrame operations and transformations\n• Machine learning and analytics tasks\n\nUnfortunately, I can't provide detailed assistance right now as I'm unable to connect to the AI service. Please ensure Ollama is running on your server."
        
        elif any(word in message_lower for word in ['data', 'analysis', 'atom', 'laboratory']):
            return "I can help you with data analysis and laboratory operations! I can assist with:\n• Configuring atoms for data processing\n• Setting up laboratory workflows\n• Analyzing DataFrames\n• Creating visualizations\n\nHowever, I'm currently unable to access the AI service. Please check your Ollama server connection."
        
        elif any(word in message_lower for word in ['error', 'problem', 'issue', 'trouble']):
            return "I understand you're experiencing an issue. I'm here to help troubleshoot problems with:\n• Data processing workflows\n• Atom configurations\n• Laboratory operations\n• Analysis tasks\n\nCurrently, I can't provide detailed assistance as I'm unable to connect to the AI service. Please verify that Ollama is running on your server."
        
        else:
            return f"I understand you're asking: '{message}'. I'm Super Agent AI, your intelligent assistant for Trinity Laboratory Mode. I can help with data analysis, atom configuration, and laboratory operations. However, I'm currently unable to connect to the AI service. Please ensure Ollama is running on your server with the DeepSeek model available."

# Initialize the LLM client
llm_client = SuperAgentLLMClient()

# Initialize Smart Workflow Agent (like other agents - merge, concat, explore)
workflow_agent = None
if SMART_WORKFLOW_AVAILABLE:
    try:
        cfg_llm = get_llm_config()
        workflow_agent = SmartWorkflowAgent(
            api_url=cfg_llm["api_url"],
            model_name=cfg_llm["model_name"],
            bearer_token=cfg_llm["bearer_token"],
            minio_endpoint=os.getenv("MINIO_ENDPOINT", "minio:9000"),
            access_key=os.getenv("MINIO_ACCESS_KEY", "minio"),
            secret_key=os.getenv("MINIO_SECRET_KEY", "minio123"),
            bucket=os.getenv("MINIO_BUCKET", "trinity"),
            prefix=""
        )
        logger.info("✅ SmartWorkflowAgent initialized with file loading and memory")
    except Exception as e:
        logger.warning(f"Failed to initialize SmartWorkflowAgent: {e}")
        workflow_agent = None

@router.post("/chat", response_model=ChatResponse)
async def chat_with_superagent(request: ChatRequest):
    """
    Smart chat with Super Agent AI
    - Detects workflow requests and generates JSON workflow
    - Returns smart_response for display + workflow JSON for backend processing
    - Supports @filename mentions for file-aware context
    """
    try:
        logger.info(f"SuperAgent chat request: {request.message[:100]}...")
        
        # Parse for @filename mentions and enrich context
        file_context = {}
        enriched_message = request.message
        if llm_client.file_handler:
            try:
                original_prompt, file_context = llm_client.file_handler.enrich_prompt_with_file_context(request.message)
                if file_context:
                    # Add file context to message for LLM
                    file_context_str = llm_client.file_handler.format_file_context_for_llm(file_context)
                    enriched_message = original_prompt + file_context_str
                    logger.info(f"✅ Enriched prompt with {len(file_context)} file(s) context")
            except Exception as e:
                logger.warning(f"⚠️ Failed to enrich with file context: {e}")
        
        # Check if this is a workflow request (data science operation)
        message_lower = request.message.lower()
        is_workflow_request = any(keyword in message_lower for keyword in [
            'workflow', 'merge', 'concat', 'chart', 'graph', 'visualiz', 'plot',
            'group', 'aggregate', 'explore', 'analyze', 'transform', 'dataframe',
            'file', 'data', 'dataset', 'join', 'combine', 'uk mayo', 'uk beans'
        ])
        
        if is_workflow_request:
            logger.info("🎯 Detected workflow request - generating workflow JSON")
            
            # Generate workflow using SmartWorkflowAgent
            if workflow_agent:
                # Pass ORIGINAL message (not enriched) - agent will use file_context for planning
                # but keep Step 3 prompt clean
                result = workflow_agent.process_request(
                    prompt=request.message,  # Use original message for Step 3
                    session_id=request.session_id or "chat_session",
                    client_name=request.client_name or "",
                    app_name=request.app_name or "",
                    project_name=request.project_name or "",
                    file_context=file_context  # Pass file context separately for planning
                )
                
                workflow_json = result.get("workflow_json", {})
                smart_response = result.get("smart_response", "")
                
                # Print in terminal
                print("\n" + "="*80)
                print("📋 WORKFLOW GENERATED IN CHAT")
                print("="*80)
                print(f"\n💬 SMART RESPONSE (shown in chat):")
                print("-"*80)
                print(smart_response)
                print("\n📦 JSON WORKFLOW (sent to backend):")
                print("-"*80)
                import json as json_module
                print(json_module.dumps(workflow_json, indent=2))
                print("="*80 + "\n")
                
                # Return smart_response with workflow embedded
                response_text = smart_response + "\n\n" + json_module.dumps(workflow_json, indent=2)
                return ChatResponse(response=response_text)
            else:
                # Fallback to built-in
                workflow_json = llm_client.generate_workflow_json(
                    user_prompt=request.message,
                    available_files=[]
                )
                
                smart_response = workflow_json.get("smart_response", "I've generated a workflow for your request.")
                
                import json as json_module
                response_text = smart_response + "\n\n" + json_module.dumps(workflow_json, indent=2)
                return ChatResponse(response=response_text)
        else:
            # Regular conversational request
            logger.info("💬 Regular chat request")
            # Use enriched message for regular chat too
            ai_response = llm_client.get_ai_response(enriched_message)
            return ChatResponse(response=ai_response)
        
    except Exception as e:
        logger.error(f"Error in SuperAgent chat endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to process chat request"
        )

@router.post("/generate-workflow")
async def generate_workflow(request: ChatRequest):
    """
    Generate structured JSON workflow from user prompt
    Uses Smart Workflow Agent with file loading, memory, and proper AI logic (like merge/concat/explore agents)
    Supports @filename mentions for file-aware context
    """
    try:
        logger.info(f"SuperAgent workflow generation request: {request.message[:100]}...")
        
        # Parse for @filename mentions and enrich context
        file_context = {}
        enriched_message = request.message
        if llm_client.file_handler:
            try:
                original_prompt, file_context = llm_client.file_handler.enrich_prompt_with_file_context(request.message)
                if file_context:
                    # Add file context to message for LLM
                    file_context_str = llm_client.file_handler.format_file_context_for_llm(file_context)
                    enriched_message = original_prompt + file_context_str
                    logger.info(f"✅ Enriched workflow prompt with {len(file_context)} file(s) context")
            except Exception as e:
                logger.warning(f"⚠️ Failed to enrich with file context: {e}")
        
        # Use Smart Workflow Agent (follows same pattern as merge, concat, explore agents)
        if workflow_agent:
            logger.info("✅ Using SmartWorkflowAgent (with file loading, memory, and AI logic)")
            result = workflow_agent.process_request(
                prompt=request.message,  # Use original message for Step 3
                session_id=request.session_id or "default_session",
                client_name=request.client_name or "",
                app_name=request.app_name or "",
                project_name=request.project_name or "",
                file_context=file_context  # Pass file context separately for planning
            )
            
            # Extract workflow JSON from result
            workflow_json = result.get("workflow_json", {})
            workflow_json["success"] = result.get("success", False)
            workflow_json["smart_response"] = result.get("smart_response", "")
            workflow_json["file_analysis"] = result.get("file_analysis", {})
            
            # Print workflow in terminal and chat
            print("\n" + "="*80)
            print("📋 WORKFLOW RESPONSE (Sent to Frontend)")
            print("="*80)
            print(f"\n💬 SMART RESPONSE (shown in chat):")
            print("-"*80)
            print(workflow_json.get("smart_response", ""))
            print("\n📦 JSON WORKFLOW (sent to backend for processing):")
            print("-"*80)
            import json as json_module
            print(json_module.dumps(workflow_json.get("workflow", []), indent=2))
            print("="*80 + "\n")
            
            logger.info(f"✅ Workflow generated: {workflow_json.get('total_steps', 0)} steps")
            logger.info(f"📝 Smart Response: {workflow_json.get('smart_response', '')}")
            
            return workflow_json
        else:
            # Fallback to old method if Smart Workflow Agent not available
            logger.warning("⚠️ SmartWorkflowAgent not available, using fallback")
            
            # Get available files from MinIO (file awareness like old SuperAgent)
            available_files = llm_client.get_available_files()
            
            # Also extract file names from the prompt as backup
            message_lower = request.message.lower()
            import re
            # Look for patterns like "file1", "file2", "uk mayo", "sales data", etc.
            file_patterns = re.findall(r'\b(?:file\d+|uk\s+\w+|\w+\s+(?:data|csv|xlsx|arrow))\b', message_lower)
            if file_patterns:
                available_files.extend(list(set(file_patterns)))
            
            # Remove duplicates
            available_files = list(set(available_files))
            
            logger.info(f"Available files for workflow: {available_files}")
            
            # Generate workflow JSON using proper LLM prompting
            workflow_json = llm_client.generate_workflow_json(
                user_prompt=request.message,
                available_files=available_files
            )
            
            # Add smart_response if not present
            if "smart_response" not in workflow_json:
                agent = workflow_json.get("workflow", [{}])[0].get("agent", "unknown")
                total_steps = workflow_json.get("total_steps", 0)
                workflow_json["smart_response"] = f"I've generated a workflow for your request. The workflow has {total_steps} steps and will use the {agent} agent to process your data."
            
            # Print workflow in terminal
            print("\n" + "="*80)
            print("📋 WORKFLOW RESPONSE (Sent to Frontend)")
            print("="*80)
            print(f"\n💬 SMART RESPONSE (shown in chat):")
            print("-"*80)
            print(workflow_json.get("smart_response", ""))
            print("\n📦 JSON WORKFLOW (sent to backend for processing):")
            print("-"*80)
            import json as json_module
            print(json_module.dumps(workflow_json.get("workflow", []), indent=2))
            print("="*80 + "\n")
        
        logger.info(f"Workflow generated: {workflow_json}")
        logger.info(f"📝 Smart Response: {workflow_json.get('smart_response', '')}")
        
        return workflow_json
        
    except Exception as e:
        logger.error(f"Error in workflow generation: {e}")
        return {
            "error": f"Failed to generate workflow: {str(e)}",
            "workflow": [],
            "is_data_science": False,
            "total_steps": 0,
            "original_prompt": request.message
        }

@router.post("/enhanced-chat")
async def enhanced_chat(request: ChatRequest):
    """
    Enhanced chat with intelligent routing, file awareness, and workflow generation.
    Uses sophisticated logic from the old enhanced_superagent.py implementation.
    """
    try:
        logger.info(f"Enhanced SuperAgent chat request: {request.message[:100]}...")
        
        # Use enhanced processing with all sophisticated logic
        result = llm_client.process_message_enhanced(
            message=request.message,
            client_name="",  # Could be extended to support context
            app_name="",
            project_name=""
        )
        
        # Return enhanced response with all metadata
        return {
            "response": result["response"],
            "is_domain_related": result["is_domain_related"],
            "workflow_generated": result["workflow_generated"],
            "recommended_agents": result["recommended_agents"],
            "file_mentioned": result["file_mentioned"],
            "processing_details": result["processing_details"]
        }
        
    except Exception as e:
        logger.error(f"Error in enhanced chat: {e}")
        return {
            "response": f"I encountered an error processing your request: {str(e)}",
            "is_domain_related": False,
            "workflow_generated": False,
            "recommended_agents": [],
            "file_mentioned": False,
            "processing_details": {
                "error": str(e),
                "enhanced_processing": False
            }
        }

@router.get("/health")
async def health_check():
    """Health check endpoint for SuperAgent."""
    return {
        "status": "healthy" if llm_client.is_connected else "limited",
        "service": "SuperAgent AI",
        "model": llm_client.model_name,
        "api_url": llm_client.api_url,
        "llm_connected": llm_client.is_connected,
        "message": "Connected to Ollama" if llm_client.is_connected else "Ollama not accessible - using fallback responses"
    }

@router.get("/test-connection")
async def test_connection():
    """Test LLM connection endpoint."""
    llm_client.test_connection()
    return {
        "connected": llm_client.is_connected,
        "api_url": llm_client.api_url,
        "model": llm_client.model_name,
        "message": "Connection test completed"
    }

@router.post("/orchestrate")
async def orchestrate_agents(request: OrchestrateRequest):
    """
    Orchestrate multiple agents based on user prompt
    Step 1: Use pre-generated workflow JSON (if provided) or generate it
    Step 2: Execute the workflow using orchestrator
    """
    try:
        logger.info(f"SuperAgent orchestration request: {request.message}")
        logger.info(f"Mode: {request.mode}")
        if request.workflow_context:
            logger.info(f"Workflow context: {request.workflow_context}")
        
        print("\n" + "🚀 "*40)
        print("STARTING COMPLETE ORCHESTRATION")
        print(f"Mode: {request.mode}")
        print("🚀 "*40)
        print(f"📝 User Request: {request.message}")
        
        # Step 1: Use pre-generated workflow JSON if provided, otherwise generate it
        print("\n" + "-"*80)
        print("STEP 1: Processing Workflow")
        print("-"*80)
        
        # Check if workflow_json is already provided (from /chat endpoint)
        if request.workflow_json and request.workflow_json.get("workflow"):
            logger.info("✅ Using pre-generated workflow JSON from /chat endpoint")
            print("✅ Using pre-generated workflow JSON from /chat endpoint")
            workflow_json = request.workflow_json
        else:
            logger.info("⚠️ No pre-generated workflow JSON - generating now")
            print("⚠️ Generating workflow JSON (no pre-generated workflow provided)")
            
            # Generate workflow using SuperAgent (reliable keyword-based generation)
            if workflow_agent:
                logger.info("Using SmartWorkflowAgent to generate workflow")
                workflow_result = workflow_agent.process_request(
                    prompt=request.message,
                    session_id=request.session_id or "orchestration_session",
                    client_name=request.client_name or "",
                    app_name=request.app_name or "",
                    project_name=request.project_name or ""
                )
                
                if not workflow_result.get("success"):
                    return {
                        "success": False,
                        "workflow_completed": False,
                        "steps_executed": 0,
                        "results": {},
                        "final_response": f"Failed to generate workflow: {workflow_result.get('error', 'Unknown error')}"
                    }
                
                workflow_json = workflow_result.get("workflow_json", {})
            else:
                # Fallback to built-in generation
                logger.info("Using built-in workflow generation")
                workflow_json = llm_client.generate_workflow_json(
                    user_prompt=request.message,
                    available_files=[]
                )
        
        print("\n✅ Workflow Generated:")
        print(f"  Total Steps: {workflow_json.get('total_steps', 0)}")
        print(f"  Agent: {workflow_json.get('workflow', [{}])[0].get('agent', 'unknown')}")
        
        # Convert to WorkflowPlan for orchestrator
        from agent_orchestrator import WorkflowPlan, WorkflowStep
        
        workflow_steps = []
        for step_data in workflow_json.get("workflow", []):
            workflow_steps.append(WorkflowStep(
                step=step_data.get("step"),
                action=step_data.get("action"),
                agent=step_data.get("agent"),
                prompt=step_data.get("prompt", ""),
                endpoint=step_data.get("endpoint"),
                depends_on=step_data.get("depends_on"),
                payload=step_data.get("payload")
            ))
        
        workflow_plan = WorkflowPlan(
            workflow=workflow_steps,
            total_steps=workflow_json.get("total_steps", 0),
            is_data_science=workflow_json.get("is_data_science", True),
            original_prompt=request.message
        )
        
        # Step 2: Execute workflow
        print("\n" + "-"*80)
        print("STEP 2: Executing Workflow")
        print("-"*80)
        
        from agent_orchestrator import WorkflowOrchestrator
        orchestrator = WorkflowOrchestrator()
        result = await orchestrator.execute_workflow(
            workflow_plan=workflow_plan,
            session_id=request.session_id or "orchestration_session"
        )
        
        print("\n" + "🎉 "*40)
        print("ORCHESTRATION COMPLETE")
        print("🎉 "*40)
        print(f"✅ Success: {result.success}")
        print(f"📊 Steps Executed: {result.steps_executed}")
        print(f"⏱️ Execution Time: {result.execution_time:.2f}s")
        print("="*80 + "\n")
        
        logger.info(f"Orchestration completed: {result.success}")
        
        return result.dict()
        
    except Exception as e:
        logger.error(f"Orchestration failed: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "workflow_completed": False,
            "steps_executed": 0,
            "results": {},
            "final_response": f"Orchestration failed: {str(e)}"
        }

@router.websocket("/orchestrate-ws")
async def orchestrate_agents_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time workflow orchestration with streaming updates
    """
    await websocket.accept()
    logger.info("WebSocket connection established for orchestration")
    
    try:
        # Receive message from client
        data = await websocket.receive_text()
        request_data = json.loads(data)
        
        message = request_data.get("message", "")
        session_id = request_data.get("session_id", "orchestration_session")
        workflow_json = request_data.get("workflow_json", None)
        client_name = request_data.get("client_name", "")
        app_name = request_data.get("app_name", "")
        project_name = request_data.get("project_name", "")
        mode = request_data.get("mode", "laboratory")
        workflow_context = request_data.get("workflow_context", None)
        
        logger.info(f"WebSocket orchestration request: {message}")
        
        # Send initial connection message
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connection established"
        })
        
        # Use pre-generated workflow JSON if provided, otherwise generate it
        if workflow_json and workflow_json.get("workflow"):
            logger.info("✅ Using pre-generated workflow JSON from /chat endpoint")
        else:
            logger.info("⚠️ Generating workflow JSON")
            
            if workflow_agent:
                workflow_result = workflow_agent.process_request(
                    prompt=message,
                    session_id=session_id,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                
                if not workflow_result.get("success"):
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Failed to generate workflow: {workflow_result.get('error', 'Unknown error')}"
                    })
                    await websocket.close()
                    return
                
                workflow_json = workflow_result.get("workflow_json", {})
            else:
                # Fallback to built-in generation
                workflow_json = llm_client.generate_workflow_json(
                    user_prompt=message,
                    available_files=[]
                )
        
        # Convert to WorkflowPlan
        from agent_orchestrator import WorkflowPlan, WorkflowStep
        
        workflow_steps = []
        for step_data in workflow_json.get("workflow", []):
            workflow_steps.append(WorkflowStep(
                step=step_data.get("step"),
                action=step_data.get("action"),
                agent=step_data.get("agent"),
                prompt=step_data.get("prompt", ""),
                endpoint=step_data.get("endpoint"),
                depends_on=step_data.get("depends_on"),
                payload=step_data.get("payload")
            ))
        
        # Calculate total_steps from workflow array if not provided or is 0
        total_steps = workflow_json.get("total_steps", len(workflow_steps))
        if total_steps == 0:
            total_steps = len(workflow_steps)
        
        workflow_plan = WorkflowPlan(
            workflow=workflow_steps,
            total_steps=total_steps,
            is_data_science=workflow_json.get("is_data_science", True),
            original_prompt=message
        )
        
        # Build project context
        project_context = {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name
        }
        
        logger.info(f"🔧 Project context for workflow: {project_context}")
        
        # Execute workflow with WebSocket streaming
        await _execute_workflow_with_websocket(websocket, workflow_plan, session_id, project_context)
        
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
    except Exception as e:
        logger.error(f"WebSocket orchestration error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Orchestration failed: {str(e)}"
            })
        except:
            pass
        await websocket.close()

async def _execute_workflow_with_websocket(
    websocket: WebSocket,
    workflow_plan: "WorkflowPlan",
    session_id: str,
    project_context: dict = None
):
    """Execute workflow and stream updates via WebSocket"""
    
    import time
    from agent_orchestrator import AgentExecutor, WorkflowOrchestrator
    
    start_time = time.time()
    agent_executor = AgentExecutor()
    
    # Store project context in agent executor for use by all agents
    if project_context:
        agent_executor.session_context = project_context
        logger.info(f"✅ Project context stored in agent executor: {project_context}")
    
    logger.info(f"Starting WebSocket workflow orchestration: {workflow_plan.total_steps} steps")
    
    await websocket.send_json({
        "type": "workflow_started",
        "total_steps": workflow_plan.total_steps,
        "workflow": [
            {
                "step": step.step,
                "agent": step.agent or getattr(step, 'action', 'unknown'),
                "action": getattr(step, 'action', None)
            }
            for step in workflow_plan.workflow
        ]
    })
    
    results = {}
    context = {}
    errors = []
    steps_completed = 0
    
    # Sort workflow by step number
    sorted_workflow = sorted(workflow_plan.workflow, key=lambda x: x.step)
    
    for step in sorted_workflow:
        step_action = getattr(step, 'action', 'UNKNOWN')
        step_agent = step.agent or step_action or "unknown"
        step_id = f"step_{step.step}_{step_agent}"
        
        # ============================================================================
        # TERMINAL: Print step details
        # ============================================================================
        print("\n" + "="*100)
        print(f"🚀 STEP {step.step}/{workflow_plan.total_steps}: {step_action}")
        print("="*100)
        print(f"📌 Action:    {step_action}")
        print(f"🤖 Agent:     {step.agent or 'N/A'}")
        print(f"🌐 Endpoint:  {step.endpoint}")
        print(f"💬 Prompt:    {step.prompt[:100] if step.prompt else 'N/A'}{'...' if step.prompt and len(step.prompt) > 100 else ''}")
        if step.depends_on:
            print(f"🔗 Depends:   Step {step.depends_on}")
        if step.payload:
            import json as json_module
            print(f"📦 Payload:   {json_module.dumps(step.payload, indent=2)}")
        print("-"*100)
        
        # Send step started event
        await websocket.send_json({
            "type": "step_started",
            "step": step.step,
            "agent": step.agent or "card_creation",
            "action": step_action,
            "total_steps": workflow_plan.total_steps
        })
        
        # Build context from dependencies
        step_context = {}
        if step.depends_on:
            # Find the dependent step to get its agent name
            dep_step = None
            for s in sorted_workflow:
                if s.step == step.depends_on:
                    dep_step = s
                    break
            
            if dep_step:
                dep_agent = dep_step.agent or getattr(dep_step, 'action', 'unknown') or "unknown"
                dep_key = f"step_{step.depends_on}_{dep_agent}"
                if dep_key in results and results[dep_key]["success"]:
                    step_context["previous_result"] = results[dep_key]["result"]
                    logger.info(f"   ✅ Found dependency result from step {step.depends_on}")
                else:
                    logger.warning(f"   ⚠️ Dependency step {step.depends_on} not found in results or failed")
        
        # Execute agent
        print(f"⏳ Executing endpoint: {step.endpoint}")
        print(f"📨 Sending request...")
        
        result = await agent_executor.execute_agent(
            endpoint=step.endpoint,
            prompt=step.prompt or "",
            session_id=f"{session_id}_{step_id}",
            context=step_context,
            action=getattr(step, 'action', None),
            payload_data=getattr(step, 'payload', None)
        )
        
        print(f"📥 Response received")
        print(f"✅ Success: {result.get('success', False)}")
        
        results[step_id] = result
        
        if result["success"]:
            steps_completed += 1
            context[f"step_{step.step}"] = result["result"]
            
            # Print success details
            print(f"🎉 Step {step.step} completed successfully!")
            
            # Print result summary based on action type
            result_data = result.get("result", {})
            if step_action == "CARD_CREATION":
                card_id = result_data.get("id", "N/A")
                print(f"   📋 Card ID: {card_id}")
                print(f"   🔢 Atoms: {len(result_data.get('atoms', []))}")
            elif step_action == "FETCH_ATOM":
                atom_name = result_data.get("atom_name", "N/A")
                atom_status = result_data.get("atom_status", False)
                match_type = result_data.get("match_type", "N/A")
                print(f"   🎯 Detected Atom: {atom_name}")
                print(f"   ✅ Status: {atom_status}")
                print(f"   🔍 Match Type: {match_type}")
            elif step_action == "AGENT_EXECUTION":
                if isinstance(result_data, dict):
                    print(f"   📊 Configuration Keys: {list(result_data.keys())[:5]}")
                    if 'concat_json' in result_data:
                        print(f"   🔗 Concat configured")
                    elif 'merge_json' in result_data:
                        print(f"   🔗 Merge configured")
            
            print("-"*100)
            
            # If this was Step 2 (FETCH_ATOM), update Step 3's endpoint based on detection
            if step_action == "FETCH_ATOM":
                result_data = result.get("result", {})
                detected_atom_name = result_data.get("atom_name", "")
                
                if detected_atom_name:
                    try:
                        from atom_mapping import fetch_atom_name_to_atomid, get_atom_info
                        
                        # Convert to correct atomId
                        correct_atomid = fetch_atom_name_to_atomid(detected_atom_name)
                        atom_info = get_atom_info(correct_atomid)
                        
                        # Find Step 3 and update its endpoint
                        for next_step in sorted_workflow:
                            if getattr(next_step, 'action', None) == "AGENT_EXECUTION":
                                original_endpoint = next_step.endpoint
                                next_step.endpoint = atom_info["endpoint"]
                                next_step.agent = correct_atomid
                                
                                print("\n" + "🔄 "*50)
                                print("🔄 UPDATING STEP 3 BASED ON FETCH_ATOM DETECTION")
                                print("🔄 "*50)
                                print(f"   🎯 Detected: {detected_atom_name}")
                                print(f"   ✅ Corrected to: {correct_atomid}")
                                print(f"   🌐 Old endpoint: {original_endpoint}")
                                print(f"   🌐 New endpoint: {atom_info['endpoint']}")
                                print("🔄 "*50 + "\n")
                                
                                logger.info(f"🔄 Updated Step 3 based on fetch_atom detection:")
                                logger.info(f"   Detected: {detected_atom_name} → {correct_atomid}")
                                logger.info(f"   Old endpoint: {original_endpoint}")
                                logger.info(f"   New endpoint: {atom_info['endpoint']}")
                                break
                    except Exception as e:
                        print(f"⚠️ Could not update Step 3 from fetch results: {e}")
                        logger.warning(f"⚠️ Could not update Step 3 from fetch results: {e}")
            
            # Send step completed event
            step_result_data = {
                "type": "step_completed",
                "step": step.step,
                "agent": step.agent or "card_creation",
                "action": step_action,
                "success": True,
                "result": result.get("result", {}),
                "summary": _summarize_step_result(result)
            }
            
            await websocket.send_json(step_result_data)
            
            # Send specific events based on action type
            result_data = result.get("result", {})
            
            # Step 1: Card Creation - send card_created event
            if (step_action == "CARD_CREATION" and result_data.get("id")):
                card_id = result_data["id"]
                await websocket.send_json({
                    "type": "card_created",
                    "card_id": card_id,
                    "card_data": result_data,  # Include full card data for frontend
                    "step": step.step
                })
            
            # Step 2: Fetch Atom - send atom_fetched event with fetch results
            elif (step_action == "FETCH_ATOM" and result_data):
                # Find the created card ID from previous steps
                created_card_id = None
                for prev_step in sorted_workflow[:step.step]:
                    if getattr(prev_step, 'action', None) == "CARD_CREATION":
                        prev_agent = prev_step.agent or getattr(prev_step, 'action', 'card_creation') or "card_creation"
                        prev_step_id = f"step_{prev_step.step}_{prev_agent}"
                        if prev_step_id in results and results[prev_step_id]["success"]:
                            prev_result = results[prev_step_id]["result"]
                            created_card_id = prev_result.get("id")
                            break
                
                # Get the detected atom name from fetch results
                detected_atom_name = result_data.get("atom_name", "")
                correct_atomid = None
                
                if detected_atom_name:
                    try:
                        from atom_mapping import fetch_atom_name_to_atomid
                        correct_atomid = fetch_atom_name_to_atomid(detected_atom_name)
                        logger.info(f"🔍 Fetch atom detected: {detected_atom_name} → {correct_atomid}")
                    except Exception as e:
                        logger.warning(f"⚠️ Could not convert atom name: {e}")
                
                atom_fetched_event = {
                    "type": "atom_fetched",
                    "step": step.step,
                    "card_id": created_card_id,
                    "fetch_results": result_data,  # Atom detection results
                    "atom_status": result_data.get("atom_status", False),
                    "match_type": result_data.get("match_type", "none"),
                    "detected_atom_name": detected_atom_name,
                    "correct_atomid": correct_atomid  # Corrected atomId for Step 3
                }
                logger.info(f"📤 Sending atom_fetched event: card_id={created_card_id}, atom={correct_atomid}")
                await websocket.send_json(atom_fetched_event)
                logger.info(f"✅ atom_fetched event sent successfully")
            
            # Step 3: Agent Execution - send atom_configured event with agent results
            elif (step_action == "AGENT_EXECUTION" and result_data):
                # Find the created card ID from previous steps
                created_card_id = None
                for prev_step in sorted_workflow[:step.step]:
                    if getattr(prev_step, 'action', None) == "CARD_CREATION":
                        prev_agent = prev_step.agent or "card_creation"
                        prev_step_id = f"step_{prev_step.step}_{prev_agent}"
                        if prev_step_id in results and results[prev_step_id]["success"]:
                            prev_result = results[prev_step_id]["result"]
                            created_card_id = prev_result.get("id")
                            break
                
                atom_configured_event = {
                    "type": "atom_configured",
                    "step": step.step,
                    "card_id": created_card_id,
                    "agent": step.agent or "unknown",
                    "configuration": result_data  # Full agent configuration
                }
                logger.info(f"📤 Sending atom_configured event: card_id={created_card_id}, agent={step.agent}")
                await websocket.send_json(atom_configured_event)
                logger.info(f"✅ atom_configured event sent successfully")
        else:
            errors.append(f"Step {step.step} ({step.agent or 'unknown'}) failed: {result.get('error')}")
            
            # Print failure details
            print(f"❌ Step {step.step} FAILED!")
            print(f"   Error: {result.get('error', 'Unknown error')}")
            print("-"*100)
            
            # Send step failed event
            await websocket.send_json({
                "type": "step_failed",
                "step": step.step,
                "agent": step.agent or "unknown",
                "action": step_action,
                "error": result.get("error"),
                "success": False
            })
    
    # Workflow completed
    workflow_completed = steps_completed == workflow_plan.total_steps
    execution_time = time.time() - start_time
    
    # Print final summary
    print("\n" + "🎉 "*50)
    print("WORKFLOW EXECUTION COMPLETE")
    print("🎉 "*50)
    print(f"✅ Completed: {workflow_completed}")
    print(f"📊 Steps executed: {steps_completed}/{workflow_plan.total_steps}")
    print(f"⏱️  Execution time: {execution_time:.2f}s")
    if errors:
        print(f"❌ Errors: {len(errors)}")
        for error in errors:
            print(f"   - {error}")
    print("="*100 + "\n")
    
    # Build final response
    from agent_orchestrator import WorkflowOrchestrator
    orchestrator = WorkflowOrchestrator()
    final_response = orchestrator._build_final_response(
        workflow_plan=workflow_plan,
        results=results,
        workflow_completed=workflow_completed,
        steps_completed=steps_completed
    )
    
    # Convert results to steps_results format
    steps_results = []
    for step in sorted_workflow:
        step_action_temp = getattr(step, 'action', 'UNKNOWN')
        step_agent = step.agent or step_action_temp or "unknown"
        step_id = f"step_{step.step}_{step_agent}"
        if step_id in results:
            step_result = results[step_id]
            steps_results.append({
                "step": step.step,
                "agent": step.agent or "card_creation",
                "action": getattr(step, 'action', None),
                "success": step_result["success"],
                "result": step_result.get("result", {}),
                "error": step_result.get("error", None)
            })
    
    # Check if any card creation steps succeeded
    created_cards = []
    for step_result in steps_results:
        if (step_result.get("action") == "CARD_CREATION" and 
            step_result.get("success") and 
            step_result.get("result", {}).get("id")):
            created_cards.append(step_result["result"]["id"])
    
    # Send workflow completed event
    has_successful_steps = steps_completed > 0
    success = workflow_completed or has_successful_steps
    
    await websocket.send_json({
        "type": "workflow_completed",
        "success": success,
        "workflow_completed": workflow_completed,
        "steps_executed": steps_completed,
        "total_steps": workflow_plan.total_steps,
        "execution_time": execution_time,
        "created_cards": created_cards,
        "final_response": final_response,
        "errors": errors if errors else None
    })
    
    logger.info(f"WebSocket workflow orchestration completed: {success}")

def _summarize_step_result(result: Dict[str, Any]) -> str:
    """Create a concise summary of step result"""
    if not result.get("success"):
        return f"Failed: {result.get('error', 'Unknown error')}"
    
    result_data = result.get("result", {})
    action = result.get("action", "")
    
    if action == "CARD_CREATION":
        card_id = result_data.get("id", "unknown")
        atom_count = len(result_data.get("atoms", []))
        return f"Card created: {card_id} with {atom_count} atom(s)"
    elif action == "FETCH_ATOM":
        atom_status = result_data.get("atom_status", False)
        match_type = result_data.get("match_type", "none")
        return f"Atom detection: status={atom_status}, match={match_type}"
    elif action == "AGENT_EXECUTION":
        if isinstance(result_data, dict):
            agent_success = result_data.get("success", False)
            if agent_success:
                # Try to get a meaningful response in order of preference
                smart_response = (
                    result_data.get("smart_response") or 
                    result_data.get("message") or 
                    result_data.get("reasoning")
                )
                
                # Check for concat_json (what agents actually return)
                if result_data.get("concat_json"):
                    concat_cfg = result_data["concat_json"]
                    file1 = concat_cfg.get("file1", "")
                    file2 = concat_cfg.get("file2", "")
                    if isinstance(file1, list):
                        file1 = file1[0] if file1 else ""
                    if isinstance(file2, list):
                        file2 = file2[0] if file2 else ""
                    direction = concat_cfg.get("concat_direction", "vertical")
                    return f"Concat configured: {file1} + {file2} ({direction})"
                
                # Check for concat_config (alternate format)
                elif result_data.get("concat_config"):
                    concat_cfg = result_data["concat_config"]
                    file1 = concat_cfg.get("file1", "")
                    file2 = concat_cfg.get("file2", "")
                    direction = concat_cfg.get("concat_direction", "vertical")
                    return f"Concat configured: {file1} + {file2} ({direction})"
                
                # Check for merge_json
                elif result_data.get("merge_json"):
                    merge_cfg = result_data["merge_json"]
                    left = merge_cfg.get("left_file", "")
                    right = merge_cfg.get("right_file", "")
                    if isinstance(left, list):
                        left = left[0] if left else ""
                    if isinstance(right, list):
                        right = right[0] if right else ""
                    merge_type = merge_cfg.get("merge_type", "inner")
                    return f"Merge configured: {left} + {right} ({merge_type})"
                
                # Check for merge_config (alternate format)
                elif result_data.get("merge_config"):
                    merge_cfg = result_data["merge_config"]
                    left = merge_cfg.get("left_file", "")
                    right = merge_cfg.get("right_file", "")
                    merge_type = merge_cfg.get("merge_type", "inner")
                    return f"Merge configured: {left} + {right} ({merge_type})"
                
                # Check for chart_json
                elif result_data.get("chart_json"):
                    return f"Chart configured successfully"
                
                # Check for chart_config
                elif result_data.get("chart_config"):
                    return f"Chart configured successfully"
                
                # Use message/smart_response if available
                elif smart_response:
                    if len(smart_response) > 100:
                        smart_response = smart_response[:100] + "..."
                    return f"Agent executed: {smart_response}"
                else:
                    return f"Agent executed successfully"
            else:
                error = result_data.get("error", result_data.get("message", "Unknown error"))
                return f"Agent execution failed: {error}"
        return f"Agent executed successfully"
    else:
        return "Completed"