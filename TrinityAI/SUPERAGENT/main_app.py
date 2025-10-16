import os
import sys
import json
import logging
import requests
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path

# Add the parent directory to sys.path to import from main_api
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

from main_api import get_llm_config
from text_cleaner import clean_ai_response
from agent_orchestrator import orchestrate_workflow

# Set up logger first (before any logging calls)
logger = logging.getLogger("trinity.superagent")

# Import file loader for file awareness (like old SuperAgent)
try:
    from file_loader import FileLoader
    FILE_LOADER_AVAILABLE = True
except ImportError:
    FILE_LOADER_AVAILABLE = False

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
        
        # FastAPI base URL for Laboratory Card Generation API
        self.fastapi_base_url = os.getenv("FASTAPI_BASE_URL", "http://localhost:8001")
        logger.info(f"FastAPI Base URL: {self.fastapi_base_url}")
        
        # Note: Workflow generator is now handled by SmartWorkflowAgent (initialized separately at module level)
        # No need to initialize here anymore
        
        # Agent capabilities mapping (from enhanced SuperAgent)
        self.agent_capabilities = {
            "Agent_chartmaker": {
                "keywords": ["chart", "graph", "visualization", "plot", "dashboard", "chart maker", "bar chart", "line chart", "pie chart", "histogram", "heatmap", "interactive chart", "business dashboard", "analytics chart"],
                "description": "Creates interactive charts and visualizations using FastAPI, pandas, and Plotly. Supports bar, line, area, pie, histogram, heatmap, waterfall charts with data filtering and business dashboards."
            },
            "Agent_concat": {
                "keywords": ["concat", "concatenate", "combine", "merge", "join", "stack", "append", "vertical merge", "horizontal merge", "row-wise", "column-wise", "combine datasets"],
                "description": "Combines datasets vertically (row-wise) or horizontally (column-wise) for data stacking and extending operations."
            },
            "Agent_create_transform": {
                "keywords": ["transform", "create", "feature engineering", "new columns", "calculated fields", "add", "subtract", "multiply", "divide", "dummy variable", "residual", "trend", "RPI", "column operations"],
                "description": "Generates new columns through various operations and transformations including mathematical operations, dummy conversion, trend detection, and feature engineering."
            },
            "Agent_dataframe_operations": {
                "keywords": ["dataframe", "data operations", "pandas", "data manipulation", "data processing", "data analysis", "data cleaning", "data transformation", "data filtering"],
                "description": "Performs comprehensive DataFrame operations and data manipulation including cleaning, transformation, filtering, and analysis tasks."
            },
            "Agent_explore": {
                "keywords": ["explore", "exploration", "EDA", "data browsing", "summary statistics", "missing values", "data distribution", "column profiling", "interactive browsing", "data overview"],
                "description": "Interactive data browsing and exploratory data analysis including missing value analysis, column profiling, and data distribution analysis."
            },
            "Agent_fetch_atom": {
                "keywords": ["fetch", "atom", "tool selection", "routing", "recommendation", "AI routing", "intelligent routing", "atom detection", "tool matching"],
                "description": "AI-powered query processor that analyzes user requests and determines the most suitable atom/tool for data analytics tasks with intelligent recommendations."
            },
            "Agent_groupby": {
                "keywords": ["groupby", "aggregate", "group", "summarize", "aggregation", "pivot", "weighted average", "dimension analysis", "KPIs", "business intelligence", "segment analysis"],
                "description": "Performs data aggregation and grouping operations across dimensions using statistical functions like sum, mean, weighted average, and rank percentile for business KPIs."
            },
            "Agent_Merge": {
                "keywords": ["merge", "join", "combine", "VLOOKUP", "SQL join", "data integration", "inner join", "left join", "outer join", "right join", "link data", "match files"],
                "description": "Joins datasets on common columns with various join types (inner, left, right, outer) similar to VLOOKUP or SQL JOIN for data integration."
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
        
        prompt_lower = user_prompt.lower()
        
        # Determine agent based on keywords
        agent = "merge"  # default
        endpoint = "/trinityai/merge"
        task_desc = "Process the data"
        
        print(f"📝 Prompt (lowercase): {prompt_lower}")
        
        if any(word in prompt_lower for word in ["merge", "join", "combine", "vlookup"]):
            agent = "merge"
            endpoint = "/trinityai/merge"
            task_desc = "Merge the datasets by common columns"
            print("✅ Detected keywords: merge, join, combine, or vlookup")
        elif any(word in prompt_lower for word in ["concat", "concatenate", "stack", "append"]):
            agent = "concat"
            endpoint = "/trinityai/concat"
            task_desc = "Concatenate the datasets"
            print("✅ Detected keywords: concat, concatenate, stack, or append")
        elif any(word in prompt_lower for word in ["chart", "graph", "visualiz", "plot"]):
            agent = "chartmaker"
            endpoint = "/trinityai/chart"
            task_desc = "Create a chart or visualization"
            print("✅ Detected keywords: chart, graph, visualiz, or plot")
        elif any(word in prompt_lower for word in ["group", "aggregate", "pivot"]):
            agent = "groupby"
            endpoint = "/trinityai/groupby"
            task_desc = "Group and aggregate the data"
            print("✅ Detected keywords: group, aggregate, or pivot")
        elif any(word in prompt_lower for word in ["explore", "analyze", "eda"]):
            agent = "explore"
            endpoint = "/trinityai/explore"
            task_desc = "Explore and analyze the dataset"
            print("✅ Detected keywords: explore, analyze, or eda")
        elif any(word in prompt_lower for word in ["transform", "create column", "feature"]):
            agent = "create_transform"
            endpoint = "/trinityai/create-transform"
            task_desc = "Create or transform columns"
            print("✅ Detected keywords: transform, create column, or feature")
        else:
            print("⚠️ No specific keywords detected, using default agent")
        
        print(f"\n🎯 Selected Agent: {agent}")
        print(f"🌐 Endpoint: {endpoint}")
        print(f"📋 Task: {task_desc}")
        
        # Generate fallback workflow
        workflow = {
            "workflow": [
                {
                    "step": 1,
                    "action": "CARD_CREATION",
                    "agent": agent,
                    "prompt": f"Create laboratory card with {agent} atom",
                    "endpoint": "/api/laboratory/cards",
                    "depends_on": None,
                    "payload": {
                        "atomId": agent,
                        "source": "ai",
                        "llm": "deepseek-r1:32b"
                    }
                },
                {
                    "step": 2,
                    "action": "FETCH_ATOM",
                    "agent": "fetch_atom",
                    "prompt": f"fetch {agent} atom",
                    "endpoint": "/trinityai/chat",
                    "depends_on": 1
                },
                {
                    "step": 3,
                    "action": "AGENT_EXECUTION",
                    "agent": agent,
                    "prompt": f"Original user prompt: {user_prompt}. Task: {task_desc}",
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
    """
    try:
        logger.info(f"SuperAgent chat request: {request.message[:100]}...")
        
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
                result = workflow_agent.process_request(
                    prompt=request.message,
                    session_id=request.session_id or "chat_session",
                    client_name=request.client_name or "",
                    app_name=request.app_name or "",
                    project_name=request.project_name or ""
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
            ai_response = llm_client.get_ai_response(request.message)
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
    """
    try:
        logger.info(f"SuperAgent workflow generation request: {request.message[:100]}...")
        
        # Use Smart Workflow Agent (follows same pattern as merge, concat, explore agents)
        if workflow_agent:
            logger.info("✅ Using SmartWorkflowAgent (with file loading, memory, and AI logic)")
            result = workflow_agent.process_request(
                prompt=request.message,
                session_id=request.session_id or "default_session",
                client_name=request.client_name or "",
                app_name=request.app_name or "",
                project_name=request.project_name or ""
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
async def orchestrate_agents(request: ChatRequest):
    """
    Orchestrate multiple agents based on user prompt
    Step 1: Generate workflow using SuperAgent's reliable workflow generation
    Step 2: Execute the workflow using orchestrator
    """
    try:
        logger.info(f"SuperAgent orchestration request: {request.message}")
        
        print("\n" + "🚀 "*40)
        print("STARTING COMPLETE ORCHESTRATION")
        print("🚀 "*40)
        print(f"📝 User Request: {request.message}")
        
        # Step 1: Generate workflow using SuperAgent (reliable keyword-based generation)
        print("\n" + "-"*80)
        print("STEP 1: Generating Workflow")
        print("-"*80)
        
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