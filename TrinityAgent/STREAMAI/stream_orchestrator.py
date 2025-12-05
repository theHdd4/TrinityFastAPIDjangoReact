"""
Trinity AI Orchestrator
=======================

Orchestrates the execution of atom sequences with the Trinity AI 3-step pattern for each atom:
1. Add Card - Create laboratory card
2. Fetch Atom - Load atom into laboratory
3. Execute Atom - Run atom with prompt and previous results
"""

import asyncio
import hashlib
import logging
import aiohttp  # Changed from requests to aiohttp for async
import json
import time
import os
import sys
import uuid
from typing import Dict, Any, List, Optional, Callable, Set, Tuple
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

# Workstream DAG planner and runtime safety layers
try:
    from .workstream_planner import WorkstreamPlanner, WorkstreamValidationError
    from .workstream_runtime import (
        AtomExecutionPolicy,
        AtomIdentity,
        AtomMemoizer,
        DedupeBudgetExceeded,
        LoopSignal,
        WorkstreamContextStore,
        WorkstreamLoopDetector,
        WorkstreamTelemetry,
        WorkstreamValidator,
        normalize_input,
        normalize_output,
    )
except ImportError:
    from STREAMAI.workstream_planner import WorkstreamPlanner, WorkstreamValidationError
    from STREAMAI.workstream_runtime import (
        AtomExecutionPolicy,
        AtomIdentity,
        AtomMemoizer,
        DedupeBudgetExceeded,
        LoopSignal,
        WorkstreamContextStore,
        WorkstreamLoopDetector,
        WorkstreamTelemetry,
        WorkstreamValidator,
        normalize_input,
        normalize_output,
    )


class StreamOrchestrator:
    """
    Orchestrates sequential atom execution with data flow management.
    """
    
    def __init__(self):
        """Initialize the orchestrator"""
        # Use centralized settings
        self.config = settings.get_llm_config() if hasattr(settings, 'get_llm_config') else {}
        self.clarification_enabled = (os.getenv("ENABLE_STREAM_AI_CLARIFICATION", "true") or "true").lower() != "false"
        
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

        # Workstream planning/runtime controls
        self.planner = WorkstreamPlanner()
        self.memoizer = AtomMemoizer()
        self.execution_policy = AtomExecutionPolicy()

        # In-memory clarification tracking for human-in-the-loop pauses
        self._clarification_waiters: Dict[str, asyncio.Future] = {}
        self._clarification_metadata: Dict[str, Dict[str, Any]] = {}

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

    async def _emit_progress(self, progress_callback: Optional[Callable], payload: Dict[str, Any]) -> None:
        """Safely invoke the progress callback, awaiting coroutines when needed."""

        if not progress_callback:
            return

        try:
            result = progress_callback(payload)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:
            logger.debug("Progress callback raised an exception: %s", exc)
    
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

        # Instantiate workstream planner if an intent is provided
        atoms: List[Dict[str, Any]] = []
        if sequence.get("intent"):
            try:
                planned = self.planner.plan(sequence["intent"], sequence.get("request_context", {}))
                atoms = planned.get("sequence", [])
                sequence["total_atoms"] = planned.get("total_atoms", len(atoms))
            except WorkstreamValidationError as exc:
                logger.error("Workstream planning failed: %s", exc)
                return {
                    "session_id": session_id,
                    "total_atoms": 0,
                    "completed_atoms": 0,
                    "failed_atoms": 1,
                    "errors": [str(exc)],
                }

        if not atoms:
            atoms = sequence.get("sequence", [])

        # Validate DAG and reorder to topological order
        try:
            topo_order = WorkstreamValidator.validate_dag(atoms)
            atom_lookup = {atom.get("atom_id"): atom for atom in atoms}
            atoms = [atom_lookup[node_id] for node_id in topo_order]
        except WorkstreamValidationError as exc:
            logger.error("Invalid workstream DAG: %s", exc)
            return {
                "session_id": session_id,
                "total_atoms": len(atoms),
                "completed_atoms": 0,
                "failed_atoms": 1,
                "errors": [str(exc)],
            }

        atom_index_lookup = {atom.get("atom_id"): idx for idx, atom in enumerate(atoms)}
        
        # Create session in storage
        if self.storage:
            self.storage.create_session(session_id)

        # Refresh file context for this run with context (gets maximum file info)
        self._refresh_file_context(client_name, app_name, project_name)

        total_atoms = len(atoms)
        sequence["sequence"] = atoms
        sequence["total_atoms"] = total_atoms

        # Workstream runtime context
        mode = (sequence.get("mode") or "laboratory").lower()
        dedupe_budget = int(sequence.get("dedupe_budget", 5))
        telemetry = WorkstreamTelemetry(session_id=session_id, mode=mode)
        context_store = WorkstreamContextStore(dedupe_budget=dedupe_budget, telemetry=telemetry)
        self.execution_policy.telemetry = telemetry
        loop_detector = WorkstreamLoopDetector(telemetry=telemetry)
        completed_nodes = set()
        last_inputs = context_store.last_inputs
        
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
        last_stable_index = -1
        atom_index = 0
        while atom_index < len(atoms):
            i = atom_index + 1
            atom = atoms[atom_index]
            atom_id = atom.get("atom_id", "unknown")
            logger.info(f"\n{'='*80}")
            logger.info(f"📍 Executing Atom {i}/{total_atoms}: {atom_id}")
            logger.info(f"{'='*80}")

            context_store.register_attempt(atom_id)
            last_exec = context_store.last_executed_at.get(atom_id)
            if last_exec and context_store.cooldown_due(atom_id):
                remaining = max(0.0, context_store.cooldown_seconds - (time.time() - last_exec))
                await self._emit_progress(
                    progress_callback,
                    {
                        "type": "atom_cooldown_enforced",
                        "atom_id": atom_id,
                        "cooldown_seconds": context_store.cooldown_seconds,
                        "remaining": remaining,
                    },
                )
                await asyncio.sleep(remaining)

            # Update progress
            await self._emit_progress(progress_callback, {
                "type": "atom_start",
                "atom_index": i,
                "total_atoms": total_atoms,
                "atom_id": atom_id,
                "purpose": atom.get("purpose", "")
            })

            try:
                idempotency = atom.get("idempotency", "pure")
                atom_version = atom.get("version", "v1")
                normalized_input = normalize_input({"atom": atom, "context": self._current_context})
                upstream_snapshot = context_store.upstream_snapshot_id(atom.get("depends_on", []))
                input_hash = hashlib.sha256(f"{atom_id}|{normalized_input}|{upstream_snapshot}".encode("utf-8")).hexdigest()
                atom_identity = AtomIdentity(atom_id, normalized_input, atom_version)
                force_execution = bool(atom.get("force"))

                loop_signal = loop_detector.note_attempt(
                    atom_id=atom_id,
                    input_hash=input_hash,
                    completed_nodes=completed_nodes,
                    stable_index=last_stable_index,
                )
                if loop_signal.detected:
                    handled, rewind_to, atoms, atom_index_lookup = await self._handle_loop_detection(
                        atom=atom,
                        atom_index=i,
                        input_hash=input_hash,
                        upstream_snapshot=upstream_snapshot,
                        loop_signal=loop_signal,
                        context_store=context_store,
                        results=results,
                        completed_nodes=completed_nodes,
                        progress_callback=progress_callback,
                        atoms=atoms,
                        atom_index_lookup=atom_index_lookup,
                        loop_detector=loop_detector,
                    )
                    total_atoms = len(atoms)
                    if handled:
                        target_index = atom_index if rewind_to is None else max(rewind_to, 0)
                        last_stable_index = max(last_stable_index, target_index)
                        loop_detector.mark_stable(target_index)
                        atom_index = target_index
                        continue
                    break

                input_changed = WorkstreamValidator.runtime_validate(
                    atom,
                    completed_nodes,
                    normalized_input=input_hash,
                    previous_inputs=last_inputs,
                    force_execution=force_execution,
                )

                cached_output = None if force_execution else context_store.should_short_circuit(atom_id, input_hash)
                memoized_result = None if force_execution or idempotency == "effectful" else self.memoizer.get(atom_identity)

                if cached_output is not None:
                    logger.info("🔁 Reusing cached snapshot for atom %s (input unchanged)", atom_id)
                    results["completed_atoms"] += 1
                    results["atoms_executed"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "success": True,
                        "output_name": atom.get("output_name"),
                        "duration": 0,
                        "insight": cached_output.get("insight"),
                        "skipped": True,
                        "skip_reason": "input_unchanged",
                    })
                    completed_nodes.add(atom_id)
                    context_store.record_input_seen(atom_id, input_hash)
                    loop_detector.mark_stable(atom_index)
                    atom_index += 1
                    continue

                if memoized_result is not None:
                    logger.info("🧠 Memoization hit for atom %s; skipping execution", atom_id)
                    results["completed_atoms"] += 1
                    results["atoms_executed"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "success": True,
                        "output_name": atom.get("output_name"),
                        "duration": memoized_result.get("duration", 0),
                        "insight": memoized_result.get("insight"),
                        "skipped": True,
                        "skip_reason": "memoized",
                    })
                    completed_nodes.add(atom_id)
                    context_store.record_input_seen(atom_id, input_hash)
                    loop_detector.mark_stable(atom_index)
                    atom_index += 1
                    continue

                if not input_changed and cached_output is None and memoized_result is None:
                    logger.info("⚠️ Input hash unchanged for atom %s; skipping to avoid duplicate execution", atom_id)
                    results["completed_atoms"] += 1
                    results["atoms_executed"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "success": True,
                        "output_name": atom.get("output_name"),
                        "duration": 0,
                        "insight": None,
                        "skipped": True,
                        "skip_reason": "unchanged_input",
                    })
                    context_store.record_input_seen(atom_id, input_hash)
                    completed_nodes.add(atom_id)
                    loop_detector.mark_stable(atom_index)
                    atom_index += 1
                    continue

                # Execute 3-step pattern
                if mode != "workflow" and self.clarification_enabled and progress_callback:
                    clarification = self._detect_clarification_need(atom, atom_index=i)
                    if clarification:
                        request_id = clarification.get("requestId") or f"clarify-{uuid.uuid4().hex}"
                        clarification["requestId"] = request_id
                        clarification.update({
                            "session_id": session_id,
                            "atom_id": atom_id,
                        })

                        await self._emit_progress(progress_callback, {
                            "type": "clarification_request",
                            "status": "paused_for_clarification",
                            **clarification
                        })

                        response_payload = await self._pause_for_clarification(
                            session_id=session_id,
                            request_id=request_id,
                            atom=atom,
                            clarification=clarification,
                            progress_callback=progress_callback,
                        )

                        if response_payload:
                            await self._emit_progress(progress_callback, {
                                "type": "clarification_update",
                                "status": "resumed",
                                "requestId": request_id,
                                "session_id": session_id,
                                "atom_id": atom_id,
                                "message": response_payload.get("message", "")
                            })
                            atom = self._apply_clarification_response(atom, response_payload)

                atom_result = await self._execute_atom_3_steps(
                    atom=atom,
                    session_id=session_id,
                    atom_index=i,
                    total_atoms=total_atoms,
                    progress_callback=progress_callback,
                    atom_identity=atom_identity,
                    idempotency=idempotency,
                    force_execution=force_execution,
                )

                if atom_result.get("success"):
                    output_hash = normalize_output(atom_result)
                    results["completed_atoms"] += 1
                    results["atoms_executed"].append({
                        "atom_id": atom_id,
                        "step": i,
                        "success": True,
                        "output_name": atom.get("output_name"),
                        "duration": atom_result.get("duration", 0),
                        "insight": atom_result.get("insight")
                    })

                    try:
                        snapshot_metadata = self._build_snapshot_metadata(
                            atom=atom,
                            atom_result=atom_result,
                            upstream_snapshot=upstream_snapshot,
                            output_hash=output_hash,
                        )
                        context_store.register_execution(
                            atom_id,
                            input_hash,
                            atom_result,
                            metadata=snapshot_metadata,
                            upstream=upstream_snapshot,
                        )
                    except DedupeBudgetExceeded as exc:
                        logger.error(str(exc))
                        results["failed_atoms"] += 1
                        results["errors"].append({
                            "atom_id": atom_id,
                            "step": i,
                            "error": str(exc)
                        })
                        break

                    if idempotency != "effectful" and not force_execution:
                        self.memoizer.set(atom_identity, atom_result)
                    completed_nodes.add(atom_id)
                    last_stable_index = atom_index
                    loop_detector.mark_stable(atom_index)
                    loop_detector.note_result(
                        atom_id=atom_id,
                        input_hash=input_hash,
                        output_hash=output_hash,
                        success=True,
                        error=None,
                        completed_nodes=completed_nodes,
                        stable_index=atom_index,
                    )

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
                    signal = loop_detector.note_result(
                        atom_id=atom_id,
                        input_hash=input_hash,
                        output_hash=None,
                        success=False,
                        error=error_msg,
                        completed_nodes=completed_nodes,
                        stable_index=last_stable_index,
                    )
                    if signal.detected:
                        _, _, atoms, atom_index_lookup = await self._handle_loop_detection(
                            atom=atom,
                            atom_index=i,
                            input_hash=input_hash,
                            upstream_snapshot=upstream_snapshot,
                            loop_signal=signal,
                            context_store=context_store,
                            results=results,
                            completed_nodes=completed_nodes,
                            progress_callback=progress_callback,
                            atoms=atoms,
                            atom_index_lookup=atom_index_lookup,
                            loop_detector=loop_detector,
                        )
                        total_atoms = len(atoms)
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

            atom_index += 1
        
        results["end_time"] = datetime.now().isoformat()
        
        # Final progress update
        await self._emit_progress(progress_callback, {
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

        results["telemetry"] = {
            "retries": telemetry.retries,
            "duplicates": telemetry.duplicates,
            "circuit_trips": telemetry.circuit_trips,
            "loops": telemetry.loops,
            "dedupe_budget": dedupe_budget,
        }

        await self._append_workflow_insight(sequence, results)
        return results

    async def _handle_loop_detection(
        self,
        *,
        atom: Dict[str, Any],
        atom_index: int,
        input_hash: str,
        upstream_snapshot: str,
        loop_signal: LoopSignal,
        context_store: WorkstreamContextStore,
        results: Dict[str, Any],
        completed_nodes: Set[str],
        progress_callback: Optional[Callable],
        atoms: List[Dict[str, Any]],
        atom_index_lookup: Dict[str, int],
        loop_detector: WorkstreamLoopDetector,
    ) -> Tuple[bool, Optional[int], List[Dict[str, Any]], Dict[str, int]]:
        atom_id = atom.get("atom_id", "unknown")
        logger.warning(
            "🌀 Loop detected on atom %s (step %s): %s | details=%s",
            atom_id,
            atom_index,
            loop_signal.reason,
            loop_signal.details,
        )

        paused_payload = {
            "type": "atom_loop_paused",
            "atom_id": atom_id,
            "step": atom_index,
            "reason": loop_signal.reason,
            "details": loop_signal.details,
            "context": context_store.summarize_context(atom_id, input_hash, upstream_snapshot),
            "executions": loop_detector.executed_atoms_count,
            "unique_nodes": len(loop_detector.unique_nodes_visited) or len(completed_nodes),
        }

        await self._emit_progress(progress_callback, paused_payload)

        context_store.flag_snapshot(atom_id, input_hash)
        if not context_store.record_backtrack() or context_store.backtrack_time_exhausted():
            results["failed_atoms"] += 1
            exhaustion_reason = (
                "loop_backtrack_time_budget" if context_store.backtrack_time_exhausted() else "loop_backtrack_cap_reached"
            )
            failure_details = {
                "max_backtracks": context_store.max_backtracks,
                "time_budget": context_store.backtrack_time_budget,
            }
            results["errors"].append(
                {
                    "atom_id": atom_id,
                    "step": atom_index,
                    "error": exhaustion_reason,
                    "details": failure_details,
                }
            )
            await self._emit_progress(
                progress_callback,
                {
                    "type": "loop_backtrack_exhausted",
                    "atom_id": atom_id,
                    "step": atom_index,
                    "reason": exhaustion_reason,
                    "action": "human_override",
                    "trace": context_store.global_snapshots,
                    "details": failure_details,
                },
            )
            return False, None, atoms, atom_index_lookup

        ancestors = atom.get("depends_on", [])
        candidate_snapshot = context_store.find_divergent_snapshot(atom_id, input_hash, ancestors)
        target_atom_id = atom_id

        if candidate_snapshot is None:
            for parent in ancestors:
                parent_snapshot = context_store.latest_snapshot(parent)
                if parent_snapshot:
                    candidate_snapshot = parent_snapshot
                    target_atom_id = parent
                    break

        metadata_hops = 0
        max_metadata_hops = 3
        if candidate_snapshot is None:
            target_index = 0
            refreshed_metadata, _, _ = self._recalculate_metadata(atoms[target_index], None, upstream_snapshot)
            atoms[target_index]["metadata"] = refreshed_metadata
        else:
            target_index = atom_index_lookup.get(target_atom_id, max(atom_index - 1, 0))
            metadata_target = atoms[target_index]
            refreshed_metadata, metadata_hash, changed = self._recalculate_metadata(
                metadata_target, candidate_snapshot, upstream_snapshot
            )
            metadata_target["metadata"] = refreshed_metadata
            probe = candidate_snapshot
            while not changed and probe and metadata_hops < max_metadata_hops:
                metadata_hops += 1
                probe = context_store.previous_snapshot(target_atom_id, probe["id"])
                if not probe:
                    break
                refreshed_metadata, metadata_hash, changed = self._recalculate_metadata(
                    metadata_target, probe, upstream_snapshot
                )
                metadata_target["metadata"] = refreshed_metadata

            if not changed and target_index > 0:
                target_index = 0
                metadata_target = atoms[target_index]
                refreshed_metadata, _, _ = self._recalculate_metadata(metadata_target, None, upstream_snapshot)
                metadata_target["metadata"] = refreshed_metadata

            if candidate_snapshot:
                candidate_snapshot["loop_flag"] = True

        allowed_atoms = {atoms[idx].get("atom_id") for idx in range(target_index)}
        completed_nodes.intersection_update(allowed_atoms)
        context_store.trim_completed_nodes(allowed_atoms)

        atoms, atom_index_lookup = self._replan_downstream(
            atoms=atoms,
            completed_nodes=completed_nodes,
            start_index=target_index,
        )

        await self._emit_progress(
            progress_callback,
            {
                "type": "loop_backtrack",
                "atom_id": atom_id,
                "step": atom_index,
                "target_atom": atoms[target_index].get("atom_id"),
                "target_index": target_index + 1,
            },
        )

        return True, target_index, atoms, atom_index_lookup

    def _replan_downstream(
        self,
        *,
        atoms: List[Dict[str, Any]],
        completed_nodes: Set[str],
        start_index: int,
    ) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
        prefix = atoms[:start_index]
        remaining = atoms[start_index:]
        if not remaining:
            return atoms, {atom.get("atom_id"): idx for idx, atom in enumerate(atoms)}

        id_to_atom = {atom.get("atom_id"): atom for atom in remaining}
        indegree: Dict[str, int] = {}
        dependents: Dict[str, Set[str]] = {}

        for atom in remaining:
            atom_id = atom.get("atom_id")
            deps = set(atom.get("depends_on", [])) - completed_nodes
            indegree[atom_id] = 0
            for dep in deps:
                if dep in id_to_atom:
                    indegree[atom_id] += 1
                    dependents.setdefault(dep, set()).add(atom_id)
                elif dep not in completed_nodes:
                    raise WorkstreamValidationError(
                        f"Dependency {dep} for atom {atom_id} is not satisfied after backtrack"
                    )

        queue = [node for node, deg in indegree.items() if deg == 0]
        topo: List[str] = []

        while queue:
            current = queue.pop(0)
            topo.append(current)
            for child in dependents.get(current, set()):
                indegree[child] -= 1
                if indegree[child] == 0:
                    queue.append(child)

        if len(topo) != len(remaining):
            raise WorkstreamValidationError("Cycle or unsatisfied dependency detected during replanning")

        reordered = prefix + [id_to_atom[node] for node in topo]
        return reordered, {atom.get("atom_id"): idx for idx, atom in enumerate(reordered)}

    def _recalculate_metadata(
        self,
        atom: Dict[str, Any],
        snapshot: Optional[Dict[str, Any]],
        upstream_snapshot: Optional[str],
    ) -> Tuple[Dict[str, Any], str, bool]:
        base_context = getattr(self, "_current_context", {}) or {}
        refreshed_context = {**base_context, "upstream_snapshot": upstream_snapshot}
        metadata = {
            "entities": refreshed_context.get("entities") or refreshed_context,
            "goal_constraints": atom.get("constraints") or atom.get("goals") or {},
            "routing_hints": atom.get("routing_hints") or atom.get("purpose"),
            "normalized_input": normalize_input({"atom": atom, "context": refreshed_context}),
            "refreshed_at": datetime.now().isoformat(),
            "upstream": upstream_snapshot or (snapshot.get("upstream") if snapshot else None),
        }
        metadata_hash = normalize_input({k: v for k, v in metadata.items() if k != "refreshed_at"})
        changed = metadata_hash != (snapshot.get("metadata_hash") if snapshot else None)
        return metadata, metadata_hash, changed

    def _build_snapshot_metadata(
        self,
        *,
        atom: Dict[str, Any],
        atom_result: Dict[str, Any],
        upstream_snapshot: Optional[str],
        output_hash: str,
    ) -> Dict[str, Any]:
        metadata, metadata_hash, _ = self._recalculate_metadata(atom, None, upstream_snapshot)
        metadata.update(
            {
                "output_hash": output_hash,
                "metadata_hash": metadata_hash,
                "duration": atom_result.get("duration"),
            }
        )
        return metadata
    
    async def _execute_atom_3_steps(
        self,
        atom: Dict[str, Any],
        session_id: str,
        atom_index: int,
        total_atoms: int,
        progress_callback: Optional[Callable] = None,
        atom_identity: Optional[AtomIdentity] = None,
        idempotency: str = "pure",
        force_execution: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute the 3-step pattern for a single atom.

        Args:
            atom: Atom configuration
            session_id: Session identifier
            atom_index: Index of atom in sequence
            total_atoms: Total number of atoms
            progress_callback: Optional callback for progress updates
            atom_identity: Identity tuple used for memoization/telemetry
            idempotency: Declared idempotency profile
            force_execution: When True, bypass memoization and cache reuse

        Returns:
            Execution result dict
        """
        start_time = time.time()
        atom_id = atom.get("atom_id", "unknown")
        
        # Step 1: Add Card
        logger.info(f"  📝 Step 1/3: Creating laboratory card...")
        await self._emit_progress(progress_callback, {
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
        await self._emit_progress(progress_callback, {
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
        await self._emit_progress(progress_callback, {
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
        
        atom_identity = atom_identity or AtomIdentity(atom.get("atom_id", "unknown"), "", atom.get("version", "v1"))

        async def _execute_payload():
            return await self._step3_execute_atom(atom, prompt)

        execute_result = await self.execution_policy.run(
            _execute_payload,
            atom_identity=atom_identity,
            idempotency=idempotency,
            force=force_execution,
        )
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

    def _detect_clarification_need(self, atom: Dict[str, Any], atom_index: int = 0) -> Optional[Dict[str, Any]]:
        """Check for low-confidence or incomplete inputs before executing an atom."""

        required_inputs = atom.get("required_inputs") or atom.get("requiredParameters") or []
        if isinstance(required_inputs, str):
            required_inputs = [required_inputs]
        provided_inputs = atom.get("inputs") or atom.get("parameters") or {}
        missing_inputs = [field for field in required_inputs if not provided_inputs.get(field)]

        if missing_inputs:
            message = "I need a bit more info before running this atom."
            return {
                "type": "clarification_request",
                "message": message,
                "expected_fields": missing_inputs,
                "payload": {
                    "reason": "missing_inputs",
                    "atom_index": atom_index,
                    "missing": missing_inputs,
                },
            }

        low_confidence = None
        for key in ("llm_confidence", "confidence", "prompt_confidence"):
            if atom.get(key) is not None:
                low_confidence = atom.get(key)
                break

        if low_confidence is not None and isinstance(low_confidence, (int, float)) and low_confidence < 0.45:
            return {
                "type": "clarification_request",
                "message": "My earlier reasoning felt uncertain. Can you confirm the details below?",
                "expected_fields": list((atom.get("inputs") or {}).keys()),
                "payload": {
                    "reason": "low_confidence",
                    "confidence": low_confidence,
                    "atom_index": atom_index,
                },
            }

        if self._last_context_selection:
            selection = self._last_context_selection
            total_relevant = len(selection.relevant_files or {})
            if total_relevant != 1:
                message = "Which file or column should I use before I run this step?"
                expected = list(selection.relevant_files.keys()) or list(selection.other_files)
                return {
                    "type": "clarification_request",
                    "message": message,
                    "expected_fields": expected,
                    "payload": {
                        "reason": "ambiguous_context",
                        "atom_index": atom_index,
                        "relevant_files": selection.relevant_files,
                        "other_files": selection.other_files,
                        "matched_columns": selection.matched_columns,
                    },
                }

        return None

    async def _pause_for_clarification(
        self,
        session_id: str,
        request_id: str,
        atom: Dict[str, Any],
        clarification: Dict[str, Any],
        progress_callback: Optional[Callable],
    ) -> Optional[Dict[str, Any]]:
        """Pause execution until a clarification response is supplied."""

        key = f"{session_id}:{request_id}"
        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        resume_event = asyncio.Event()
        self._clarification_waiters[key] = future
        self._clarification_metadata[key] = {
            "atom": atom,
            "clarification": clarification,
            "created_at": datetime.utcnow().isoformat(),
            "session_id": session_id,
            "atom_id": atom.get("atom_id"),
            "resume_event": resume_event,
            "progress_callback": progress_callback,
        }

        if self.storage:
            try:
                self.storage.store_result(
                    session_id,
                    f"clarification_{request_id}",
                    clarification,
                    "clarification_request",
                    {"atom": atom.get("atom_id"), "request_id": request_id},
                )
            except Exception as exc:
                logger.debug("Could not persist clarification to storage: %s", exc)

        await self._emit_progress(progress_callback, {
            "type": "clarification_status",
            "status": "paused_for_clarification",
            "requestId": request_id,
            "session_id": session_id,
            "atom_id": atom.get("atom_id"),
        })

        try:
            response_payload = await future
        except asyncio.CancelledError:
            logger.warning("Clarification wait was cancelled for %s", key)
            return None
        finally:
            self._clarification_waiters.pop(key, None)
            self._clarification_metadata.pop(key, None)

        return response_payload

    def _apply_clarification_response(self, atom: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
        """Merge clarified values back into the atom definition."""

        values = response.get("values") or {}
        if values:
            inputs = atom.get("inputs") or {}
            inputs.update(values)
            atom["inputs"] = inputs

            params = atom.get("parameters")
            if isinstance(params, dict):
                params.update(values)
                atom["parameters"] = params

        return atom

    async def resume_clarification(self, session_id: str, request_id: str, message: str, values: Optional[Dict[str, Any]] = None) -> bool:
        """Resume a paused sequence using the user's clarification response."""

        key = f"{session_id}:{request_id}"
        waiter = self._clarification_waiters.get(key)
        metadata = self._clarification_metadata.get(key, {})
        resume_event: Optional[asyncio.Event] = metadata.get("resume_event")
        if resume_event and resume_event.is_set():
            return True

        payload = {
            "type": "clarification_response",
            "requestId": request_id,
            "session_id": session_id,
            "message": message,
            "values": values or {},
        }

        if resume_event:
            resume_event.set()

        if waiter and not waiter.done():
            waiter.set_result(payload)
        elif not waiter:
            return False

        progress_callback = metadata.get("progress_callback")
        if progress_callback:
            try:
                await self._emit_progress(progress_callback, {
                    "type": "clarification_status",
                    "status": "resumed",
                    "requestId": request_id,
                    "session_id": session_id,
                    "atom_id": metadata.get("atom_id"),
                })
            except Exception as exc:
                logger.debug("Could not emit resumed status: %s", exc)

        return True
    
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
        guardrail_note = (
            "Context guardrails: Treat only entries under 'columns', 'sample_columns', "
            "'highlighted_columns', 'numeric_columns', or 'categorical_columns' as valid column names. "
            "Any lists under 'unique_values' or 'value_samples' are sample data values, not columns."
        )
        context_sections.append(guardrail_note)
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

