"""
Agent Orchestrator using LangChain
Chains multiple agent calls based on SuperAgent workflow JSON
"""

import os
import logging
import requests
import json
import re
from typing import Dict, List, Any, Optional
from pydantic import BaseModel

logger = logging.getLogger("trinity.orchestrator")

# ============================================================================
# Models
# ============================================================================

class WorkflowStep(BaseModel):
    """Single step in agent workflow"""
    step: int
    action: Optional[str] = None  # CARD_CREATION, FETCH_ATOM, AGENT_EXECUTION
    agent: str
    prompt: str
    endpoint: str
    depends_on: Optional[int] = None
    context_keys: Optional[List[str]] = None
    payload: Optional[Dict[str, Any]] = None  # For CARD_CREATION payload

class WorkflowPlan(BaseModel):
    """Complete workflow plan from SuperAgent"""
    workflow: List[WorkflowStep]
    is_data_science: bool
    total_steps: int
    original_prompt: str

class OrchestrationResult(BaseModel):
    """Final orchestration result"""
    success: bool
    workflow_completed: bool
    steps_executed: int
    results: Dict[str, Any]
    steps_results: List[Dict[str, Any]] = []  # Add this for frontend
    final_response: str
    execution_time: Optional[float] = None  # Add execution time
    errors: Optional[List[str]] = None
    refresh_triggered: bool = False  # Trigger frontend refresh
    created_cards: List[str] = []  # List of created card IDs

# ============================================================================
# Agent Executor
# ============================================================================

class AgentExecutor:
    """Executes individual agent endpoints within the same Trinity AI service"""
    
    def __init__(self, base_url: str = None, fastapi_url: str = None):
        # Use Docker service names for container-to-container communication
        # trinity-ai:8002 for internal agent calls
        # fastapi:8001 for Laboratory Card Generation API
        self.base_url = base_url or os.getenv("AI_SERVICE_URL", "http://trinity-ai:8002")
        self.fastapi_url = fastapi_url or os.getenv("FASTAPI_BASE_URL", "http://fastapi:8001")
        self.session_context = {}
    
    async def execute_agent(
        self, 
        endpoint: str, 
        prompt: str, 
        session_id: str,
        context: Dict[str, Any] = None,
        action: str = None,
        payload_data: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Execute single agent endpoint"""
        
        try:
            # For TrinityAI endpoints, use internal function calls to avoid self-calling deadlock
            if endpoint.startswith("/trinityai/"):
                return await self._execute_internal_agent(
                    endpoint=endpoint,
                    prompt=prompt,
                    session_id=session_id,
                    context=context,
                    action=action
                )
            
            # For external endpoints (FastAPI), use HTTP calls
            if endpoint.startswith("/api/laboratory"):
                # FastAPI endpoints (Laboratory Card Generation API)
                url = f"{self.fastapi_url}{endpoint}"
                base_name = "FastAPI"
                payload = payload_data
                logger.info(f"Creating laboratory card with atomId: {payload.get('atomId')}")
            else:
                logger.error(f"Unknown endpoint type: {endpoint}")
                return {
                    "success": False,
                    "error": f"Unknown endpoint type: {endpoint}",
                    "agent": endpoint,
                    "action": action
                }
            
            logger.info(f"Executing {base_name} endpoint: {endpoint}")
            logger.info(f"Full URL: {url}")
            logger.info(f"Payload: {payload}")
            
            # HTTP call for external services only
            response = requests.post(url, json=payload, timeout=300)
            response.raise_for_status()
            
            result = response.json()
            logger.info(f"✅ {base_name} endpoint {endpoint} completed successfully")
            logger.info(f"📦 Result: {result}")
            
            return {
                "success": True,
                "result": result,
                "agent": endpoint,
                "action": action,
                "base": base_name
            }
            
        except Exception as e:
            logger.error(f"Endpoint {endpoint} failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "agent": endpoint,
                "action": action
            }
    
    async def _execute_internal_agent(
        self,
        endpoint: str,
        prompt: str,
        session_id: str,
        context: Dict[str, Any] = None,
        action: str = None
    ) -> Dict[str, Any]:
        """Execute TrinityAI agents internally without HTTP to avoid deadlock"""
        
        try:
            logger.info(f"Executing INTERNAL TrinityAI endpoint: {endpoint}")
            logger.info(f"Prompt: {prompt}")
            logger.info(f"Action: {action}")
            logger.info(f"Session ID: {session_id}")
            
            # Import necessary modules for internal calls
            from pydantic import BaseModel
            from typing import Optional
            
            # Handle /trinityai/chat endpoint (fetch_atom)
            if endpoint == "/trinityai/chat":
                # Import processor from Agent_fetch_atom
                import sys
                from pathlib import Path
                
                # Try Agent_fetch_atom first
                try:
                    parent_dir = Path(__file__).parent
                    fetch_atom_dir = parent_dir / "Agent_fetch_atom"
                    if str(fetch_atom_dir) not in sys.path:
                        sys.path.append(str(fetch_atom_dir))
                    
                    from single_llm_processor import SingleLLMProcessor
                    
                    logger.info("📞 Calling /chat processor from Agent_fetch_atom internally")
                    logger.info(f"🔍 Processing query: '{prompt}'")
                    
                    # Create processor instance if not exists (with LLM config)
                    if not hasattr(self, 'chat_processor'):
                        # Get LLM config from environment
                        import os
                        ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
                        llm_port = os.getenv("OLLAMA_PORT", "11434")
                        api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
                        model_name = os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b")
                        bearer_token = os.getenv("LLM_BEARER_TOKEN", "aakash_api_key")
                        
                        self.chat_processor = SingleLLMProcessor(
                            api_url=api_url,
                            model_name=model_name,
                            bearer_token=bearer_token
                        )
                    
                    # Call processor directly with the prompt
                    result = self.chat_processor.process_query(prompt)
                    logger.info(f"✅ INTERNAL /chat completed successfully")
                    logger.info(f"📦 Result keys: {list(result.keys()) if isinstance(result, dict) else 'non-dict'}")
                    
                    return {
                        "success": True,
                        "result": result,
                        "agent": endpoint,
                        "action": action,
                        "base": "TrinityAI-Internal"
                    }
                except Exception as e:
                    logger.error(f"Failed to call Agent_fetch_atom processor: {e}")
                    # Fallback to main_api processor
                    pass
                
                # Fallback: Import from main_api
                parent_dir = Path(__file__).parent
                if str(parent_dir) not in sys.path:
                    sys.path.append(str(parent_dir))
                
                from main_api import processor, get_llm_config
                
                logger.info("📞 Calling /chat processor from main_api internally (fallback)")
                
                if not processor:
                    logger.error("Processor not available")
                    return {
                        "success": False,
                        "error": "Processor not initialized",
                        "agent": endpoint,
                        "action": action
                    }
                
                # Call processor directly
                result = processor.process_query(prompt)
                logger.info(f"✅ INTERNAL /chat completed successfully (fallback)")
                logger.info(f"📦 Result: {result}")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle /trinityai/merge endpoint
            elif endpoint == "/trinityai/merge":
                from Agent_Merge.main_app import agent as merge_agent
                from Agent_Merge.main_app import MergeRequest
                
                logger.info("📞 Calling /merge agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                # Extract client context from session_context (set by workflow orchestrator)
                client_name = context.get("client_name", "") if context else self.session_context.get("client_name", "")
                app_name = context.get("app_name", "") if context else self.session_context.get("app_name", "")
                project_name = context.get("project_name", "") if context else self.session_context.get("project_name", "")
                
                logger.info(f"🔧 Using project context: client={client_name}, app={app_name}, project={project_name}")
                
                # Call merge agent directly (like individual atom execution)
                # Note: process_request is synchronous, so no await needed
                result = merge_agent.process_request(
                    user_prompt=prompt, 
                    session_id=session_id,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                logger.info(f"📊 Merge agent result: success={result.get('success')}, keys={list(result.keys()) if isinstance(result, dict) else 'non-dict'}")
                logger.info(f"✅ INTERNAL /merge completed successfully")
                logger.info(f"📦 Result keys: {list(result.keys()) if isinstance(result, dict) else 'non-dict'}")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle other agents
            elif endpoint == "/trinityai/concat":
                from Agent_concat.main_app import agent as concat_agent
                
                logger.info("📞 Calling /concat agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                # Extract client context from session_context (set by workflow orchestrator)
                client_name = context.get("client_name", "") if context else self.session_context.get("client_name", "")
                app_name = context.get("app_name", "") if context else self.session_context.get("app_name", "")
                project_name = context.get("project_name", "") if context else self.session_context.get("project_name", "")
                
                logger.info(f"🔧 Using project context: client={client_name}, app={app_name}, project={project_name}")
                
                # Use existing agent instance from main_app
                result = concat_agent.process_request(
                    user_prompt=prompt,
                    session_id=session_id,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                logger.info(f"📊 Concat agent result: success={result.get('success')}, keys={list(result.keys()) if isinstance(result, dict) else 'non-dict'}")
                logger.info(f"✅ INTERNAL /concat completed successfully")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle /trinityai/chart endpoint
            elif endpoint == "/trinityai/chart":
                from Agent_chartmaker.main_app import agent as chartmaker_agent
                
                logger.info("📞 Calling /chart agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                result = chartmaker_agent.process_request(
                    user_prompt=prompt,
                    session_id=session_id
                )
                logger.info(f"✅ INTERNAL /chart completed successfully")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle /trinityai/explore endpoint
            elif endpoint == "/trinityai/explore":
                from Agent_explore.main_app import agent as explore_agent
                
                logger.info("📞 Calling /explore agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                # Extract client context
                client_name = context.get("client_name", "") if context else ""
                app_name = context.get("app_name", "") if context else ""
                project_name = context.get("project_name", "") if context else ""
                
                result = explore_agent.process_request(
                    user_prompt=prompt,
                    session_id=session_id,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                logger.info(f"✅ INTERNAL /explore completed successfully")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle /trinityai/create endpoint
            elif endpoint == "/trinityai/create":
                from Agent_create_transform.main_app import agent as create_agent
                
                logger.info("📞 Calling /create agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                # Extract client context
                client_name = context.get("client_name", "") if context else ""
                app_name = context.get("app_name", "") if context else ""
                project_name = context.get("project_name", "") if context else ""
                
                result = create_agent.process_request(
                    user_prompt=prompt,
                    session_id=session_id,
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                logger.info(f"✅ INTERNAL /create completed successfully")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle /trinityai/groupby endpoint
            elif endpoint == "/trinityai/groupby":
                from Agent_groupby.main_app import agent as groupby_agent
                
                logger.info("📞 Calling /groupby agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                result = groupby_agent.process_request(
                    user_prompt=prompt,
                    session_id=session_id
                )
                logger.info(f"✅ INTERNAL /groupby completed successfully")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Handle /trinityai/dataframe-operations endpoint
            elif endpoint == "/trinityai/dataframe-operations":
                from Agent_dataframe_operations.main_app import agent as df_ops_agent
                
                logger.info("📞 Calling /dataframe-operations agent internally")
                logger.info(f"🔍 Processing prompt: '{prompt}'")
                
                result = df_ops_agent.process_request(
                    user_prompt=prompt,
                    session_id=session_id
                )
                logger.info(f"✅ INTERNAL /dataframe-operations completed successfully")
                
                return {
                    "success": True,
                    "result": result,
                    "agent": endpoint,
                    "action": action,
                    "base": "TrinityAI-Internal"
                }
            
            # Add more agents as needed
            else:
                logger.error(f"Internal execution not implemented for: {endpoint}")
                logger.info(f"Available endpoints: /trinityai/chat, /trinityai/merge, /trinityai/concat, /trinityai/chart, /trinityai/explore, /trinityai/create, /trinityai/groupby, /trinityai/dataframe-operations")
                return {
                    "success": False,
                    "error": f"Internal execution not implemented for: {endpoint}",
                    "agent": endpoint,
                    "action": action
                }
                
        except Exception as e:
            logger.error(f"Internal endpoint {endpoint} failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "agent": endpoint,
                "action": action
            }

# ============================================================================
# LangChain Orchestrator
# ============================================================================

class WorkflowOrchestrator:
    """Orchestrates multi-agent workflows using LangChain-style sequential logic"""
    
    def __init__(self):
        self.agent_executor = AgentExecutor()
        self.workflow_history = []
    
    async def execute_workflow(
        self, 
        workflow_plan: WorkflowPlan,
        session_id: str
    ) -> OrchestrationResult:
        """Execute complete workflow using LangChain sequential logic"""
        
        import time
        start_time = time.time()
        
        logger.info(f"Starting workflow orchestration: {workflow_plan.total_steps} steps")
        
        results = {}
        context = {}
        errors = []
        steps_completed = 0
        
        # Sort workflow by step number
        sorted_workflow = sorted(workflow_plan.workflow, key=lambda x: x.step)
        
        for step in sorted_workflow:
            step_id = f"step_{step.step}_{step.agent}"
            step_action = getattr(step, 'action', 'UNKNOWN')
            
            logger.info("="*80)
            logger.info(f"📍 Executing Step {step.step}/{workflow_plan.total_steps}: {step.agent}")
            logger.info(f"   Action: {step_action}")
            logger.info(f"   Endpoint: {step.endpoint}")
            logger.info(f"   Prompt: {step.prompt[:100]}..." if len(step.prompt) > 100 else f"   Prompt: {step.prompt}")
            
            # Build context from dependencies
            step_context = {}
            if step.depends_on:
                dep_key = f"step_{step.depends_on}_{self._find_agent_name(sorted_workflow, step.depends_on)}"
                if dep_key in results and results[dep_key]["success"]:
                    step_context["previous_result"] = results[dep_key]["result"]
                    logger.info(f"   Dependency: Using result from step {step.depends_on}")
            
            # Execute agent
            print(f"\n📍 Executing Step {step.step}/{workflow_plan.total_steps}: {step.agent}")
            print(f"   Action: {step_action}")
            if step.prompt:
                print(f"   Prompt: {step.prompt[:80]}..." if len(step.prompt) > 80 else f"   Prompt: {step.prompt}")
            
            result = await self.agent_executor.execute_agent(
                endpoint=step.endpoint,
                prompt=step.prompt,
                session_id=f"{session_id}_{step_id}",
                context=step_context,
                action=getattr(step, 'action', None),
                payload_data=getattr(step, 'payload', None)
            )
            
            results[step_id] = result
            
            if result["success"]:
                steps_completed += 1
                context[f"step_{step.step}"] = result["result"]
                logger.info(f"✅ Step {step.step} completed successfully")
                logger.info(f"📋 Step {step.step} result summary: {self._summarize_result(result)}")
                
                # Log detailed result info
                result_data = result.get("result", {})
                logger.info(f"📊 Step {step.step} result data: {list(result_data.keys()) if isinstance(result_data, dict) else result_data}")
                
                print(f"   ✅ Step {step.step} complete")
                
                # Log agent execution result for debugging
                if step_action == "AGENT_EXECUTION":
                    if isinstance(result_data, dict):
                        success = result_data.get("success", False)
                        agent_response = result_data.get("smart_response", result_data.get("message", "No message"))
                        logger.info(f"🔍 Agent execution result - success: {success}, response: {agent_response[:100]}")
                        print(f"   📊 Agent result: success={success}")
                
                # If this is a successful card creation step, trigger frontend refresh
                if (step_action == "CARD_CREATION" and 
                    result_data.get("id")):
                    card_id = result_data["id"]
                    logger.info(f"🎉 Card created successfully: {card_id}")
                    logger.info(f"🔄 Triggering frontend refresh for card: {card_id}")
                    print(f"   🎉 Card created: {card_id}")
                    
                    # Add refresh trigger to result
                    result["_trigger_refresh"] = True
                    result["_card_id"] = card_id
            else:
                errors.append(f"Step {step.step} ({step.agent}) failed: {result.get('error')}")
                logger.error(f"❌ Step {step.step} failed: {result.get('error')}")
                print(f"   ❌ Step {step.step} failed: {result.get('error')}")
                # Continue or break based on criticality
                # For now, continue to next step
        
        # Build final response
        workflow_completed = steps_completed == workflow_plan.total_steps
        
        final_response = self._build_final_response(
            workflow_plan=workflow_plan,
            results=results,
            workflow_completed=workflow_completed,
            steps_completed=steps_completed
        )
        
        # Convert results to steps_results format for frontend
        steps_results = []
        for step in sorted_workflow:
            step_id = f"step_{step.step}_{step.agent}"
            if step_id in results:
                step_result = results[step_id]
                steps_results.append({
                    "step": step.step,
                    "agent": step.agent,
                    "action": getattr(step, 'action', None),
                    "success": step_result["success"],
                    "result": step_result.get("result", {}),
                    "error": step_result.get("error", None)
                })
        
        execution_time = time.time() - start_time
        
        # Check if any card creation steps succeeded and trigger refresh
        refresh_triggered = False
        created_cards = []
        for step_result in steps_results:
            if (step_result.get("action") == "CARD_CREATION" and 
                step_result.get("success") and 
                step_result.get("result", {}).get("id")):
                refresh_triggered = True
                created_cards.append(step_result["result"]["id"])
        
        if refresh_triggered:
            logger.info(f"🎉 Triggering frontend refresh for {len(created_cards)} created cards: {created_cards}")
        
        # Consider workflow successful if at least one step succeeded (especially card creation)
        has_successful_steps = steps_completed > 0
        success = workflow_completed or has_successful_steps
        
        return OrchestrationResult(
            success=success,
            workflow_completed=workflow_completed,
            steps_executed=steps_completed,
            results=results,
            steps_results=steps_results,  # Add this for frontend
            final_response=final_response,
            execution_time=execution_time,
            errors=errors if errors else None,
            refresh_triggered=refresh_triggered,
            created_cards=created_cards
        )
    
    def _find_agent_name(self, workflow: List[WorkflowStep], step_num: int) -> str:
        """Find agent name for given step number"""
        for step in workflow:
            if step.step == step_num:
                return step.agent
        return "unknown"
    
    def _summarize_result(self, result: Dict[str, Any]) -> str:
        """Create a concise summary of step result for logging"""
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
            # For agent execution, show detailed summary
            if isinstance(result_data, dict):
                agent_success = result_data.get("success", False)
                if agent_success:
                    # Show what the agent did
                    smart_response = result_data.get("smart_response", "No response")
                    # Truncate if too long
                    if len(smart_response) > 100:
                        smart_response = smart_response[:100] + "..."
                    return f"Agent executed: {smart_response}"
                else:
                    error = result_data.get("error", result_data.get("message", "Unknown error"))
                    return f"Agent execution failed: {error}"
            return f"Agent executed successfully"
        else:
            return "Completed"
    
    def _build_final_response(
        self,
        workflow_plan: WorkflowPlan,
        results: Dict[str, Any],
        workflow_completed: bool,
        steps_completed: int
    ) -> str:
        """Build user-friendly final response"""
        
        if workflow_completed:
            response = f"✅ Workflow completed successfully!\n\n"
            response += f"Executed {steps_completed} steps:\n"
            
            for step in sorted(workflow_plan.workflow, key=lambda x: x.step):
                step_id = f"step_{step.step}_{step.agent}"
                if step_id in results and results[step_id]["success"]:
                    response += f"  {step.step}. {step.agent.upper()}: ✓\n"
            
            return response
        else:
            return f"⚠️ Workflow partially completed: {steps_completed}/{workflow_plan.total_steps} steps"

# ============================================================================
# SuperAgent Workflow Analyzer (LLM-based)
# ============================================================================

class WorkflowAnalyzer:
    """Uses LLM to analyze user prompt and generate workflow plan"""
    
    def __init__(self, llm_config: Dict[str, str]):
        self.api_url = llm_config["api_url"]
        self.model_name = llm_config["model_name"]
        self.bearer_token = llm_config["bearer_token"]
    
    async def analyze_prompt(self, user_prompt: str) -> WorkflowPlan:
        """Analyze user prompt and generate workflow JSON"""
        
        prompt = f"""You are an AI workflow planner for data science operations.

User Request: "{user_prompt}"

Available Agents:
- merge: Merge/join datasets
- concat: Concatenate datasets vertically or horizontally
- chartmaker: Create data visualizations
- create: Create new columns/features
- groupby: Aggregate data by groups
- explore: Explore and analyze data
- dataframeoperations: General dataframe operations

Analyze the user request and generate a workflow plan in JSON format:

{{
  "workflow": [
    {{
      "step": 1,
      "agent": "merge",
      "prompt": "Clear prompt for the agent",
      "endpoint": "/trinityai/merge",
      "depends_on": null
    }},
    {{
      "step": 2,
      "agent": "chartmaker",
      "prompt": "Clear prompt for the agent",
      "endpoint": "/trinityai/chart",
      "depends_on": 1
    }}
  ],
  "is_data_science": true,
  "total_steps": 2,
  "original_prompt": "{user_prompt}"
}}

Rules:
1. Break complex requests into sequential steps
2. Each step should have clear dependencies (depends_on)
3. Use appropriate agent for each operation
4. Generate clear prompts for each agent
5. If not data science related, set is_data_science to false and return empty workflow

Return ONLY the JSON:"""

        try:
            logger.info(f"Calling LLM API: {self.api_url}")
            logger.info(f"Model: {self.model_name}")
            
            response = requests.post(
                self.api_url,
                json={{
                    "model": self.model_name,
                    "messages": [{{"role": "user", "content": prompt}}],
                    "stream": False,
                    "options": {{"temperature": 0.1, "num_predict": 1000}}
                }},
                timeout=120  # Increased to 120 seconds for DeepSeek
            )
            
            response.raise_for_status()
            content = response.json().get("message", {{}}).get("content", "")
            
            # Extract JSON from response
            logger.info(f"LLM Response received (length: {len(content)})")
            logger.debug(f"LLM Response content: {content[:500]}...")
            
            # Clean thinking tags
            content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
            content = re.sub(r"<reasoning>.*?</reasoning>", "", content, flags=re.DOTALL)
            content = content.strip()
            
            # Try to find JSON in response
            json_match = re.search(r'\{{.*\}}', content, re.DOTALL)
            if json_match:
                workflow_data = json.loads(json_match.group())
                logger.info(f"Successfully parsed workflow: {workflow_data}")
                return WorkflowPlan(**workflow_data)
            
            logger.error("No valid JSON found in LLM response")
            raise ValueError("Failed to parse workflow JSON")
            
        except requests.exceptions.Timeout:
            logger.error(f"LLM request timed out after 120 seconds")
            return WorkflowPlan(
                workflow=[],
                is_data_science=False,
                total_steps=0,
                original_prompt=user_prompt
            )
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error to LLM: {e}")
            return WorkflowPlan(
                workflow=[],
                is_data_science=False,
                total_steps=0,
                original_prompt=user_prompt
            )
        except Exception as e:
            logger.error(f"Workflow analysis failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Return empty workflow
            return WorkflowPlan(
                workflow=[],
                is_data_science=False,
                total_steps=0,
                original_prompt=user_prompt
            )

# ============================================================================
# Main Orchestration Function
# ============================================================================

async def orchestrate_workflow(
    user_prompt: str,
    session_id: str,
    llm_config: Dict[str, str]
) -> OrchestrationResult:
    """Main entry point for workflow orchestration"""
    
    logger.info(f"Orchestrating workflow for prompt: {user_prompt}")
    
    try:
        # Step 1: Analyze prompt and generate workflow plan
        analyzer = WorkflowAnalyzer(llm_config)
        workflow_plan = await analyzer.analyze_prompt(user_prompt)
        
        if not workflow_plan.is_data_science or workflow_plan.total_steps == 0:
            logger.warning(f"No workflow generated for prompt: {user_prompt}")
            return OrchestrationResult(
                success=False,
                workflow_completed=False,
                steps_executed=0,
                results={},
                final_response="I couldn't create a workflow for this request. This might be because:\n1. The request is not data science related\n2. The LLM is experiencing delays\n3. Please try rephrasing your request\n\nExample: 'merge file1.arrow and file2.arrow' or 'create a bar chart from sales data'"
            )
        
        logger.info(f"Workflow plan generated: {workflow_plan.total_steps} steps")
        
        # Step 2: Execute workflow using orchestrator
        orchestrator = WorkflowOrchestrator()
        result = await orchestrator.execute_workflow(workflow_plan, session_id)
        
        logger.info(f"Workflow orchestration completed: {result.success}")
        
        return result
        
    except Exception as e:
        logger.error(f"Orchestration error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        return OrchestrationResult(
            success=False,
            workflow_completed=False,
            steps_executed=0,
            results={},
            final_response=f"An error occurred during orchestration: {str(e)}\n\nPlease check:\n1. Ollama/DeepSeek is running\n2. LLM_API_URL is configured correctly\n3. The request is clear and data science related",
            errors=[str(e)]
        )

