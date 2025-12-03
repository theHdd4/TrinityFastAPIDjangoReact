"""
Trinity AI Orchestrator
=======================

Orchestrates the execution of atom sequences with the Trinity AI 3-step pattern for each atom:
1. Add Card - Create laboratory card
2. Fetch Atom - Load atom into laboratory
3. Execute Atom - Run atom with prompt and previous results
"""

import asyncio
import logging
import aiohttp  # Changed from requests to aiohttp for async
import json
import time
import os
import sys
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from datetime import datetime

# Set up logger FIRST - before any code that might use it
logger = logging.getLogger("trinity.trinityai.orchestrator")

# Import STREAMAI modules - try relative imports first (Docker), then absolute (local dev)
# These modules now exist in STREAMAI folder (copied from 28_NOV working version)
try:
    from .file_loader import FileLoader
    from .file_analyzer import FileAnalyzer
    from .file_context_resolver import FileContextResolver, FileContextResult
    logger.info("✅ File handling modules imported from STREAMAI folder")
except ImportError:
    try:
        from STREAMAI.file_loader import FileLoader
        from STREAMAI.file_analyzer import FileAnalyzer
        from STREAMAI.file_context_resolver import FileContextResolver, FileContextResult
        logger.info("✅ File handling modules imported from STREAMAI (absolute)")
    except ImportError:
        # Fallback: try direct imports (if in same directory)
        try:
            from file_loader import FileLoader
            from file_analyzer import FileAnalyzer
            from file_context_resolver import FileContextResolver, FileContextResult
            logger.info("✅ File handling modules imported directly")
        except ImportError:
            logger.error("❌ File handling modules not found - STREAMAI will not work properly")
            raise ImportError("File handling modules (file_loader, file_analyzer, file_context_resolver) are required for STREAMAI")
# Import workflow_insight_agent - try both paths for Docker and local development
try:
    from Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
except ImportError:
    try:
        from TrinityAgent.Agent_Insight.workflow_insight_agent import get_workflow_insight_agent
    except ImportError:
        # Fallback: define a no-op function
        def get_workflow_insight_agent():
            return None

# Add parent directory to path
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
        # Create a minimal settings-like object for backward compatibility
        class SettingsWrapper:
            def get_llm_config(self):
                return get_llm_config()
        settings = SettingsWrapper()

# Import result storage
try:
    from STREAMAI.result_storage import get_result_storage
    RESULT_STORAGE_AVAILABLE = True
    logger.info("✅ ResultStorage imported successfully")
except ImportError as e:
    try:
        from result_storage import get_result_storage
        RESULT_STORAGE_AVAILABLE = True
        logger.info("✅ ResultStorage imported successfully (direct)")
    except ImportError as e2:
        RESULT_STORAGE_AVAILABLE = False
        logger.warning(f"⚠️ ResultStorage not available: {e} | {e2}")


class StreamOrchestrator:
    """
    Orchestrates sequential atom execution with data flow management.
    """
    
    def __init__(self):
        """Initialize the orchestrator"""
        # Use centralized settings
        self.config = settings.get_llm_config() if hasattr(settings, 'get_llm_config') else {}
        
        # Base URLs for different services (use centralized settings)
        # For atom execution, we need to call the Trinity AI service itself (where we're running)
        # Use AI_SERVICE_URL if available, otherwise construct from host/port
        ai_service_url = getattr(settings, 'AI_SERVICE_URL', None)
        if not ai_service_url:
            # Fallback: construct from host and port
            host_ip = getattr(settings, 'HOST_IP', '127.0.0.1')
            api_port = getattr(settings, 'API_PORT', 8002)
            # In Docker, use service name; locally use localhost
            if os.getenv("RUNNING_IN_DOCKER") or os.getenv("DOCKER_ENV"):
                ai_service_url = f"http://trinity-ai:{api_port}"
            else:
                ai_service_url = f"http://{host_ip}:{api_port}"
        
        # fastapi_base is used for atom execution (calls Trinity AI service)
        self.fastapi_base = ai_service_url
        # fastapi_backend is for backend API calls (laboratory cards, etc.)
        self.fastapi_backend = getattr(settings, 'FASTAPI_BASE_URL', 'http://fastapi:8001')
        self.django_base = getattr(settings, 'DJANGO_BASE_URL', 'http://web:8000')
        
        # Initialize result storage
        self.storage = None
        if RESULT_STORAGE_AVAILABLE:
            try:
                self.storage = get_result_storage()
                logger.info("✅ Result storage initialized")
            except Exception as e:
                logger.warning(f"⚠️ Could not initialize result storage: {e}")

        # Shared file context utilities
        self.file_loader: Optional[FileLoader] = None
        self.file_analyzer: Optional[FileAnalyzer] = None
        self.file_context_resolver: Optional[FileContextResolver] = None
        self._raw_files_with_columns: Dict[str, Any] = {}
        self._last_context_selection: Optional[FileContextResult] = None

        try:
            # Use centralized settings for MinIO configuration (same as 28_NOV working version)
            minio_config = settings.get_minio_config() if hasattr(settings, 'get_minio_config') else {}
            minio_endpoint = minio_config.get("endpoint", getattr(settings, 'MINIO_ENDPOINT', "minio:9000"))
            minio_access_key = minio_config.get("access_key", getattr(settings, 'MINIO_ACCESS_KEY', "minio"))
            minio_secret_key = minio_config.get("secret_key", getattr(settings, 'MINIO_SECRET_KEY', "minio123"))
            minio_bucket = minio_config.get("bucket", getattr(settings, 'MINIO_BUCKET', "trinity"))
            minio_prefix = minio_config.get("prefix", getattr(settings, 'MINIO_PREFIX', ""))
            minio_secure = (getattr(settings, 'MINIO_SECURE', 'false') or 'false').lower() == "true"
            
            # Initialize FileLoader (same as 28_NOV working version)
            self.file_loader = FileLoader(
                minio_endpoint=minio_endpoint,
                minio_access_key=minio_access_key,
                minio_secret_key=minio_secret_key,
                minio_bucket=minio_bucket,
                object_prefix=minio_prefix
            )
            logger.info("✅ FileLoader initialized (from STREAMAI/file_loader.py)")
            
            # Initialize FileAnalyzer (same as 28_NOV working version)
            self.file_analyzer = FileAnalyzer(
                minio_endpoint=minio_endpoint,
                access_key=minio_access_key,
                secret_key=minio_secret_key,
                bucket=minio_bucket,
                prefix=minio_prefix,
                secure=minio_secure
            )
            logger.info("✅ FileAnalyzer initialized (from STREAMAI/file_analyzer.py)")
            
            # Initialize FileContextResolver (same as 28_NOV working version)
            self.file_context_resolver = FileContextResolver(
                file_loader=self.file_loader,
                file_analyzer=self.file_analyzer
            )
            logger.info("✅ FileContextResolver initialized (from STREAMAI/file_context_resolver.py)")
        except Exception as e:
            logger.error(f"❌ File context utilities initialization failed: {e}")
            self.file_loader = None
            self.file_analyzer = None
            self.file_context_resolver = FileContextResolver()

        logger.info("✅ StreamOrchestrator initialized")
    
    async def execute_sequence(
        self,
        sequence: Dict[str, Any],
        session_id: str,
        progress_callback: Optional[Callable] = None,
        client_name: str = "",
        app_name: str = "",
        project_name: str = ""
    ) -> Dict[str, Any]:
        """
        Execute an atom sequence with the 3-step pattern for each atom.
        
        Args:
            sequence: Sequence JSON with atoms
            session_id: Session identifier
            progress_callback: Optional callback for progress updates
            client_name: Client name for file context
            app_name: App name for file context
            project_name: Project name for file context
            
        Returns:
            Execution result dict
        """
        logger.info(f"🚀 Starting sequence execution for session {session_id}")
        logger.info(f"📊 Total atoms: {sequence.get('total_atoms', 0)}")
        
        # Extract context from sequence if not provided
        if not client_name and sequence.get("file_context"):
            file_ctx = sequence.get("file_context", {})
            client_name = file_ctx.get("client_name", "")
            app_name = file_ctx.get("app_name", "")
            project_name = file_ctx.get("project_name", "")
        
        # Store context for use in other methods
        self._current_context = {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name
        }
        
        # Create session in storage
        if self.storage:
            self.storage.create_session(session_id)

        # Refresh file context for this run with context (gets maximum file info)
        self._refresh_file_context(client_name, app_name, project_name)
        
        atoms = sequence.get("sequence", [])
        total_atoms = len(atoms)
        
        results = {
            "session_id": session_id,
            "total_atoms": total_atoms,
            "completed_atoms": 0,
            "failed_atoms": 0,
            "atoms_executed": [],
            "errors": [],
            "start_time": datetime.now().isoformat(),
            "end_time": None
        }
        
        # Execute each atom
        for i, atom in enumerate(atoms, 1):
            atom_id = atom.get("atom_id", "unknown")
            logger.info(f"\n{'='*80}")
            logger.info(f"📍 Executing Atom {i}/{total_atoms}: {atom_id}")
            logger.info(f"{'='*80}")
            
            # Update progress
            if progress_callback:
                progress_callback({
                    "type": "atom_start",
                    "atom_index": i,
                    "total_atoms": total_atoms,
                    "atom_id": atom_id,
                    "purpose": atom.get("purpose", "")
                })
            
            try:
                # Execute 3-step pattern
                atom_result = await self._execute_atom_3_steps(
                    atom=atom,
                    session_id=session_id,
                    atom_index=i,
                    total_atoms=total_atoms,
                    progress_callback=progress_callback
                )
                
                if atom_result.get("success"):
                    results["completed_atoms"] += 1
                    results["atoms_executed"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "success": True,
                        "output_name": atom.get("output_name"),
                        "duration": atom_result.get("duration", 0),
                        "insight": atom_result.get("insight")
                    })
                    
                    # Store result
                    if self.storage:
                        self.storage.store_result(
                            session_id,
                            atom.get("output_name", f"atom_{i}_output"),
                            atom_result.get("data", {}),
                            atom_result.get("type", "unknown"),
                            {
                                "atom_id": atom_id,
                                "step": i,
                                "timestamp": datetime.now().isoformat(),
                                "insight": atom_result.get("insight")
                            }
                        )
                    
                    logger.info(f"✅ Atom {i}/{total_atoms} completed successfully")
                else:
                    results["failed_atoms"] += 1
                    error_msg = atom_result.get("error", "Unknown error")
                    results["errors"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "error": error_msg
                    })
                    results["atoms_executed"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "success": False,
                        "error": error_msg,
                        "insight": atom_result.get("insight")
                    })
                    
                    logger.error(f"❌ Atom {i}/{total_atoms} failed: {error_msg}")
                    
                    # Decide whether to continue or stop
                    # For now, stop on first error
                    logger.error("⚠️ Stopping sequence execution due to error")
                    break
                
            except Exception as e:
                logger.error(f"❌ Exception executing atom {i}: {e}")
                results["failed_atoms"] += 1
                results["errors"].append({
                    "atom_id": atom_id,
                    "step": i,
                    "error": str(e)
                })
                break
        
        results["end_time"] = datetime.now().isoformat()
        
        # Final progress update
        if progress_callback:
            progress_callback({
                "type": "sequence_complete",
                "completed_atoms": results["completed_atoms"],
                "failed_atoms": results["failed_atoms"],
                "total_atoms": total_atoms
            })
        
        logger.info(f"\n{'='*80}")
        logger.info(f"🎉 Sequence execution complete")
        logger.info(f"✅ Completed: {results['completed_atoms']}/{total_atoms}")
        logger.info(f"❌ Failed: {results['failed_atoms']}/{total_atoms}")
        logger.info(f"{'='*80}\n")
        
        await self._append_workflow_insight(sequence, results)
        return results
    
    async def _execute_atom_3_steps(
        self,
        atom: Dict[str, Any],
        session_id: str,
        atom_index: int,
        total_atoms: int,
        progress_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Execute the 3-step pattern for a single atom.
        
        Args:
            atom: Atom configuration
            session_id: Session identifier
            atom_index: Index of atom in sequence
            total_atoms: Total number of atoms
            progress_callback: Optional callback for progress updates
            
        Returns:
            Execution result dict
        """
        start_time = time.time()
        atom_id = atom.get("atom_id", "unknown")
        
        # Step 1: Add Card
        logger.info(f"  📝 Step 1/3: Creating laboratory card...")
        if progress_callback:
            progress_callback({
                "type": "step_update",
                "atom_index": atom_index,
                "step": 1,
                "total_steps": 3,
                "description": "Creating card"
            })
        
        card_result = await self._step1_add_card(atom_id, session_id)
        if not card_result.get("success"):
            return {
                "success": False,
                "error": f"Step 1 failed: {card_result.get('error')}",
                "duration": time.time() - start_time
            }
        
        card_id = card_result.get("card_id")
        logger.info(f"  ✅ Card created: {card_id}")
        
        # Step 2: Fetch Atom
        logger.info(f"  🔍 Step 2/3: Fetching atom...")
        if progress_callback:
            progress_callback({
                "type": "step_update",
                "atom_index": atom_index,
                "step": 2,
                "total_steps": 3,
                "description": "Fetching atom"
            })
        
        fetch_result = await self._step2_fetch_atom(atom_id)
        if not fetch_result.get("success"):
            return {
                "success": False,
                "error": f"Step 2 failed: {fetch_result.get('error')}",
                "duration": time.time() - start_time
            }
        
        logger.info(f"  ✅ Atom fetched")
        
        # Step 3: Execute Atom
        logger.info(f"  🚀 Step 3/3: Executing atom...")
        if progress_callback:
            progress_callback({
                "type": "step_update",
                "atom_index": atom_index,
                "step": 3,
                "total_steps": 3,
                "description": "Executing atom"
            })
        
        # Inject previous results into prompt
        prompt = atom.get("prompt", "")
        if self.storage and "{{" in prompt:
            prompt = self.storage.inject_results_into_prompt(session_id, prompt)
            logger.info(f"  📝 Injected results into prompt")

        # Get context from sequence if available
        client_name = ""
        app_name = ""
        project_name = ""
        if hasattr(self, '_current_context'):
            ctx = getattr(self, '_current_context', {})
            client_name = ctx.get("client_name", "")
            app_name = ctx.get("app_name", "")
            project_name = ctx.get("project_name", "")
        
        prompt = self._augment_prompt_with_context(prompt, atom, client_name, app_name, project_name)

        logger.info("🔍 ===== STREAM AI PROMPT (BEGIN) =====")
        logger.info(f"Atom: {atom.get('atom_id', 'unknown')} | Endpoint: {atom.get('endpoint')}")
        logger.info(prompt)
        logger.info("🔍 ===== STREAM AI PROMPT (END) =====")
        
        execute_result = await self._step3_execute_atom(atom, prompt)
        insight_text = await self._generate_step_insight(
            atom=atom,
            atom_index=atom_index,
            total_atoms=total_atoms,
            prompt=prompt,
            execute_result=execute_result,
            execution_success=execute_result.get("success", False)
        )

        if not execute_result.get("success"):
            return {
                "success": False,
                "error": f"Step 3 failed: {execute_result.get('error')}",
                "duration": time.time() - start_time,
                "insight": insight_text
            }
        
        logger.info(f"  ✅ Atom executed successfully")

        # Refresh file context so subsequent atoms see newly generated files/columns
        # Use same context as sequence execution (stored in instance or passed)
        # If context not available, use empty strings (will use default prefix)
        self._refresh_file_context(client_name, app_name, project_name)
        
        duration = time.time() - start_time
        
        return {
            "success": True,
            "card_id": card_id,
            "data": execute_result.get("data", {}),
            "type": execute_result.get("type", "unknown"),
            "duration": duration,
            "insight": insight_text
        }
    
    async def _step1_add_card(self, atom_id: str, session_id: str) -> Dict[str, Any]:
        """
        Step 1: Create a laboratory card.
        
        Args:
            atom_id: Atom identifier
            session_id: Session identifier
            
        Returns:
            Result dict with card_id
        """
        try:
            url = f"{self.fastapi_backend}/api/laboratory/cards"
            
            payload = {
                "atomId": atom_id,
                "source": "ai",
                "llm": f"stream-ai-{self.config.get('model_name', 'deepseek-r1:32b')}"
            }
            
            logger.debug(f"    POST {url}")
            
            # Use async aiohttp instead of blocking requests
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if response.status in [200, 201]:
                        data = await response.json()
                        card_id = data.get("id") or data.get("card_id") or "card_created"
                        return {
                            "success": True,
                            "card_id": card_id
                        }
                    else:
                        error_text = await response.text()
                        logger.error(f"    ❌ Card creation failed: {response.status}")
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text[:200]}"
                        }
        
        except Exception as e:
            logger.error(f"    ❌ Exception creating card: {e}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _step2_fetch_atom(self, atom_id: str) -> Dict[str, Any]:
        """
        Step 2: Fetch atom directly using SingleLLMProcessor (no HTTP call - faster).
        
        Args:
            atom_id: Atom identifier
            
        Returns:
            Result dict
        """
        try:
            logger.info(f"    🔍 Fetching atom directly (no API call): {atom_id}")
            
            # Import SingleLLMProcessor directly (same process - faster than HTTP)
            try:
                from Agent_FetchAtom.single_llm_processor import SingleLLMProcessor
            except ImportError:
                try:
                    from TrinityAgent.Agent_FetchAtom.single_llm_processor import SingleLLMProcessor
                except ImportError:
                    logger.error("    ❌ SingleLLMProcessor not available - cannot fetch atom directly")
                    return {
                        "success": False,
                        "error": "SingleLLMProcessor not available"
                    }
            
            # Get LLM config for SingleLLMProcessor initialization
            try:
                from BaseAgent.config import settings
                llm_config = settings.get_llm_config()
            except ImportError:
                try:
                    from TrinityAgent.BaseAgent.config import settings
                    llm_config = settings.get_llm_config()
                except ImportError:
                    logger.error("    ❌ Could not get LLM config for SingleLLMProcessor")
                    return {
                        "success": False,
                        "error": "LLM config not available"
                    }
            
            # Create processor instance with LLM config
            processor = SingleLLMProcessor(
                api_url=llm_config["api_url"],
                model_name=llm_config["model_name"],
                bearer_token=llm_config["bearer_token"]
            )
            
            # Process query directly (no HTTP overhead)
            query = f"fetch {atom_id} atom"
            result = processor.process_query(query)
            
            logger.info(f"    ✅ Atom fetched directly: {result.get('status', 'unknown')}")
            
            return {
                "success": True,
                "response": result
            }
        
        except Exception as e:
            logger.error(f"    ❌ Exception fetching atom directly: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    async def _step3_execute_atom(self, atom: Dict[str, Any], prompt: str) -> Dict[str, Any]:
        """
        Step 3: Execute the atom with the prompt.
        
        Phase 1 Update: Now uses unified agent executor endpoint via registry.
        
        Args:
            atom: Atom configuration
            prompt: Prompt with injected results
            
        Returns:
            Execution result dict
        """
        try:
            # Phase 1: Try to use registry directly first (same process, no HTTP overhead)
            try:
                from BaseAgent.registry import registry
                from BaseAgent.interfaces import AgentContext
                
                atom_id = atom.get("atom_id", "")
                # Map atom_id to agent_name
                from .atom_mapping import ATOM_TO_AGENT_MAPPING
                agent_name = ATOM_TO_AGENT_MAPPING.get(atom_id, atom_id)
                
                agent = registry.get(agent_name)
                if agent is not None:
                    logger.info(f"    ✅ Using registry directly for agent: {agent_name}")
                    
                    # Get context
                    ctx = getattr(self, '_current_context', {})
                    context = AgentContext(
                        session_id=f"streamai_{int(time.time())}",
                        user_prompt=prompt,
                        client_name=ctx.get("client_name", ""),
                        app_name=ctx.get("app_name", ""),
                        project_name=ctx.get("project_name", "")
                    )
                    
                    # Execute agent directly
                    result = agent.execute(context)
                    
                    return {
                        "success": result.success,
                        "data": result.data,
                        "message": result.message,
                        "error": result.error,
                        "type": "response"
                    }
            except Exception as registry_err:
                logger.debug(f"    Registry not available, using HTTP: {registry_err}")
            
            # Fallback: Use unified executor endpoint via HTTP
            endpoint = "/trinityai/agent/execute"
            atom_id = atom.get("atom_id", "")
            
            # Map atom_id to agent_name
            try:
                from .atom_mapping import ATOM_TO_AGENT_MAPPING
                agent_name = ATOM_TO_AGENT_MAPPING.get(atom_id, atom_id)
            except ImportError:
                # Fallback: use atom_id as agent_name
                agent_name = atom_id
            
            url = f"{self.fastapi_base}{endpoint}"
            
            # Base payload for unified executor
            payload = {
                "agent_name": agent_name,
                "prompt": prompt,
                "session_id": f"streamai_{int(time.time())}"
            }
            
            # Add context if available
            if hasattr(self, '_current_context'):
                ctx = getattr(self, '_current_context', {})
                if ctx.get("client_name"):
                    payload["client_name"] = ctx["client_name"]
                if ctx.get("app_name"):
                    payload["app_name"] = ctx["app_name"]
                if ctx.get("project_name"):
                    payload["project_name"] = ctx["project_name"]
            
            # Add atom-specific parameters if provided
            if "parameters" in atom and atom["parameters"]:
                params = atom["parameters"]
                logger.info(f"    📝 Adding parameters: {params}")
                payload.update(params)
            
            logger.debug(f"    POST {url} (agent: {agent_name})")
            logger.debug(f"    Prompt: {prompt[:100]}...")
            
            # Use async aiohttp instead of blocking requests
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        return {
                            "success": data.get("success", True),
                            "data": data.get("data", data),
                            "message": data.get("message", ""),
                            "error": data.get("error"),
                            "type": "response"
                        }
                    else:
                        error_text = await response.text()
                        logger.error(f"    ❌ Atom execution failed: {response.status}")
                        return {
                            "success": False,
                            "error": f"HTTP {response.status}: {error_text[:200]}"
                        }
        
        except Exception as e:
            logger.error(f"    ❌ Exception executing atom: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """
        Get execution status for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Status dict
        """
        if not self.storage:
            return {
                "success": False,
                "error": "Result storage not available"
            }
        
        session_info = self.storage.get_session_info(session_id)
        if not session_info:
            return {
                "success": False,
                "error": "Session not found"
            }
        
        return {
            "success": True,
            "session_info": session_info
        }
    
    def get_session_results(self, session_id: str) -> Dict[str, Any]:
        """
        Get all results for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Results dict
        """
        if not self.storage:
            return {
                "success": False,
                "error": "Result storage not available"
            }
        
        results = self.storage.get_all_results(session_id)
        
        return {
            "success": True,
            "session_id": session_id,
            "results": results,
            "result_count": len(results)
        }

    async def _append_workflow_insight(self, sequence: Dict[str, Any], results: Dict[str, Any]) -> None:
        """Attach workflow-level insight to the sequence results."""
        try:
            step_records: List[Dict[str, Any]] = []
            atoms = sequence.get("sequence", [])
            executed = results.get("atoms_executed", [])

            for index, atom in enumerate(atoms, start=1):
                exec_info = next((item for item in executed if item.get("step") == index), None)
                record = {
                    "step_number": index,
                    "agent": atom.get("atom_id", f"atom_{index}"),
                    "description": atom.get("purpose") or atom.get("description") or "",
                    "insight": (exec_info or {}).get("insight"),
                    "result_preview": atom.get("prompt", ""),
                    "output_files": [atom.get("output_name")] if atom.get("output_name") else [],
                }
                step_records.append(record)

            if not step_records:
                return

            user_prompt = sequence.get("user_prompt") or sequence.get("description") or ""
            agent = get_workflow_insight_agent()
            payload = {
                "user_prompt": user_prompt,
                "step_records": step_records,
                "session_id": results.get("session_id"),
                "workflow_id": sequence.get("workflow_id"),
                "available_files": list(self._raw_files_with_columns.keys()),
                "generated_files": [],
                "additional_context": "",
                "client_name": sequence.get("client_name", getattr(settings, 'CLIENT_NAME', None) or os.getenv("CLIENT_NAME", "")),
                "app_name": sequence.get("app_name", getattr(settings, 'APP_NAME', None) or os.getenv("APP_NAME", "")),
                "project_name": sequence.get("project_name", getattr(settings, 'PROJECT_NAME', None) or os.getenv("PROJECT_NAME", "")),
                "metadata": {"total_steps": len(step_records)},
            }

            loop = asyncio.get_running_loop()
            insight = await loop.run_in_executor(None, lambda: agent.generate_workflow_insight(payload))
            results["workflow_insight"] = insight
        except Exception as exc:
            logger.warning("⚠️ Failed to append workflow insight: %s", exc)

    def _refresh_file_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """
        Reload available files and update the shared resolver cache.
        Same as 28_NOV working version, but with context parameter support.
        
        Args:
            client_name: Client name for context (optional)
            app_name: App name for context (optional)
            project_name: Project name for context (optional)
        """
        if not self.file_loader or not self.file_context_resolver:
            return

        # Prefer existing sequence context when no explicit context is passed so we don't
        # accidentally drop back to the root prefix between atom executions.
        if not (client_name or app_name or project_name):
            ctx = getattr(self, "_current_context", {}) or {}
            client_name = ctx.get("client_name", "")
            app_name = ctx.get("app_name", "")
            project_name = ctx.get("project_name", "")
        try:
            # Set context if provided (FileLoader supports this)
            if client_name or app_name or project_name:
                self.file_loader.set_context(client_name, app_name, project_name)
            
            # Load files (FileLoader will use context from set_context or env vars)
            files = self.file_loader.load_files(client_name, app_name, project_name)
            self._raw_files_with_columns = files or {}
            self.file_context_resolver.update_files(self._raw_files_with_columns)
            self._last_context_selection = None
            logger.info(f"📂 File context refreshed with {len(self._raw_files_with_columns)} entries")
        except Exception as e:
            logger.warning(f"⚠️ Failed to refresh file context: {e}")

    def _ensure_file_context_loaded(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """Ensure file context is loaded with maximum file info (columns) in minimum context.
        
        Args:
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        """
        if not self.file_loader:
            logger.warning("⚠️ FileLoader not available - cannot load file context")
            return
            
        if not self._raw_files_with_columns:
            self._refresh_file_context(client_name, app_name, project_name)

    def _augment_prompt_with_context(self, prompt: str, atom: Dict[str, Any], client_name: str = "", app_name: str = "", project_name: str = "") -> str:
        """Append condensed file context to the prompt when relevant.
        
        Args:
            prompt: Original prompt
            atom: Atom configuration
            client_name: Client name for context
            app_name: App name for context
            project_name: Project name for context
        """
        if not self.file_context_resolver or not prompt or "--- STREAM FILE CONTEXT ---" in prompt:
            return prompt

        self._ensure_file_context_loaded(client_name, app_name, project_name)
        if not self._raw_files_with_columns:
            return prompt

        search_text = prompt
        params = atom.get("parameters") or {}
        if params:
            try:
                search_text += " " + json.dumps(params)
            except (TypeError, ValueError):
                logger.debug("Unable to encode atom parameters for context matching")

        try:
            selection = self.file_context_resolver.resolve(
                prompt=search_text,
                top_k=3,
                include_metadata=True,
                fallback_limit=10
            )
        except Exception as e:
            logger.warning(f"⚠️ File context resolution failed: {e}")
            return prompt

        if not selection or not selection.relevant_files:
            return prompt

        self._last_context_selection = selection
        mapping = selection.to_object_column_mapping(self._raw_files_with_columns)

        context_sections: List[str] = []
        if mapping:
            context_sections.append("Available files:\n" + json.dumps(mapping, indent=2))
        if selection.file_details:
            context_sections.append("File details:\n" + json.dumps(selection.file_details, indent=2))
        if selection.matched_columns:
            context_sections.append("Matched columns:\n" + json.dumps(selection.matched_columns, indent=2))
        if selection.other_files:
            others_preview = ", ".join(selection.other_files[:10])
            context_sections.append(f"Other files: {others_preview}")

        if not context_sections:
            return prompt

        context_block = "\n\n--- STREAM FILE CONTEXT ---\n" + "\n\n".join(context_sections)
        logger.debug("Appending STREAM file context to prompt")
        return f"{prompt}{context_block}"

    async def _generate_step_insight(
        self,
        atom: Dict[str, Any],
        atom_index: int,
        total_atoms: int,
        prompt: str,
        execute_result: Dict[str, Any],
        execution_success: bool
    ) -> Optional[str]:
        """Call LLM to summarize what happened in this Workstream step."""
        try:
            insight_prompt = self._build_step_insight_prompt(
                atom=atom,
                atom_index=atom_index,
                total_atoms=total_atoms,
                prompt=prompt,
                execute_result=execute_result,
                execution_success=execution_success
            )
            if not insight_prompt:
                return None
            return await self._call_insight_llm(insight_prompt)
        except Exception as e:
            logger.warning(f"⚠️ Failed to generate step insight: {e}")
            return None

    def _build_step_insight_prompt(
        self,
        atom: Dict[str, Any],
        atom_index: int,
        total_atoms: int,
        prompt: str,
        execute_result: Dict[str, Any],
        execution_success: bool
    ) -> str:
        """Create a condensed insight prompt from the atom metadata and results."""
        if not prompt and not execute_result:
            return ""

        params_str = self._safe_json_dumps(atom.get("parameters") or {}, "{}")
        result_preview = ""
        if execution_success:
            result_preview = self._extract_result_preview(
                execute_result.get("data")
            )
        else:
            result_preview = execute_result.get("error") or "Unknown error"

        status_text = "SUCCESS" if execution_success else "FAILED"
        output_name = atom.get("output_name", "not_specified")

        return (
            f"You are Workstream AI Insights, responsible for narrating each step of a data workstream.\n"
            f"Summarize the following step so the user instantly understands what happened, "
            f"why it matters, and what artifacts were produced.\n\n"
            f"STEP CONTEXT\n"
            f"- Step: {atom_index} of {total_atoms}\n"
            f"- Atom ID: {atom.get('atom_id')}\n"
            f"- Purpose: {atom.get('purpose', 'N/A')}\n"
            f"- Output Handle: {output_name}\n"
            f"- Execution Status: {status_text}\n"
            f"- Endpoint: {atom.get('endpoint')}\n\n"
            f"USER PROMPT\n{prompt}\n\n"
            f"PARAMETERS\n{params_str}\n\n"
            f"RESULT SNAPSHOT\n{result_preview}\n\n"
            f"RESPONSE REQUIREMENTS\n"
            f"- Keep the total response under 120 words.\n"
            f"- Use Markdown with three sections exactly in this order:\n"
            f"  1. Step Summary: 1-2 sentences describing what was attempted and outcome.\n"
            f"  2. What We Obtained: bullet list (max 3) covering tangible outputs/insights, "
            f"referencing `{output_name}` when relevant.\n"
            f"  3. Ready For Next Step: single sentence guiding how this output can be used next.\n"
            f"- Highlight blockers if the step failed.\n"
            f"- Do not invent data; rely only on the supplied prompt/result snapshot.\n"
        )

    async def _call_insight_llm(self, prompt: str) -> Optional[str]:
        """Invoke the configured LLM to obtain an insight summary."""
        api_url = self.config.get("api_url")
        model_name = self.config.get("model_name")
        bearer_token = self.config.get("bearer_token")

        if not api_url or not model_name:
            logger.warning("⚠️ Insight LLM configuration incomplete")
            return None

        headers = {
            "Content-Type": "application/json",
        }
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"

        payload = {
            "model": model_name,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are Workstream AI Insights, a precise narrator that explains each data-processing "
                        "step clearly and concisely."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 800,
            },
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    api_url,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=90),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        logger.warning(f"⚠️ Insight LLM call failed: {response.status} {error_text[:200]}")
                        return None
                    result = await response.json()
        except Exception as e:
            logger.warning(f"⚠️ Insight LLM request error: {e}")
            return None

        message_content = ""
        if isinstance(result, dict):
            message_content = result.get("message", {}).get("content", "")
            if not message_content and result.get("choices"):
                first_choice = result["choices"][0]
                message_content = first_choice.get("message", {}).get("content", "")

        return message_content.strip() if message_content else None

    def _extract_result_preview(self, data: Any, max_chars: int = 1800) -> str:
        """Serialize result payload into a bounded-length string."""
        if data is None:
            return "No structured result payload returned."
        try:
            if isinstance(data, (dict, list)):
                serialized = json.dumps(data, indent=2, default=str)
            else:
                serialized = str(data)
        except (TypeError, ValueError):
            serialized = str(data)

        if len(serialized) > max_chars:
            return f"{serialized[:max_chars]}... (truncated)"
        return serialized

    def _safe_json_dumps(self, payload: Any, fallback: str = "{}") -> str:
        """Safely serialize parameters or return a fallback string."""
        if payload is None:
            return fallback
        try:
            return json.dumps(payload, indent=2, default=str)
        except (TypeError, ValueError):
            return str(payload)


# Global instance
_orchestrator: Optional[StreamOrchestrator] = None


def get_orchestrator() -> StreamOrchestrator:
    """
    Get singleton orchestrator instance.
    
    Returns:
        StreamOrchestrator instance
    """
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = StreamOrchestrator()
        logger.info("✅ Global StreamOrchestrator instance created")
    return _orchestrator


# For testing
if __name__ == "__main__":
    # Test the orchestrator
    orchestrator = StreamOrchestrator()
    
    # Test sequence
    test_sequence = {
        "sequence": [
            {
                "step": 1,
                "atom_id": "data-upload-validate",
                "purpose": "Load data",
                "prompt": "Upload sales.csv",
                "inputs": [],
                "output_name": "sales_data",
                "endpoint": "/trinityai/data-upload-validate"
            }
        ],
        "total_atoms": 1
    }
    
    session_id = f"test_{int(time.time())}"
    
    print(f"\n{'='*80}")
    print(f"Testing orchestrator with session: {session_id}")
    print(f"{'='*80}\n")
    
    result = orchestrator.execute_sequence(test_sequence, session_id)
    
    print(f"\n{'='*80}")
    print("Execution Result:")
    print(json.dumps(result, indent=2, default=str))
    print(f"{'='*80}\n")

