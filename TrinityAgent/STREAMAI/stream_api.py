"""
Trinity AI API - WebSocket Endpoint
===================================

Provides WebSocket endpoint for Trinity AI sequential execution.
Follows the Trinity AI streaming pattern for proper card and result handling.
"""

import asyncio
import contextlib
import logging
import json
import re
import uuid
from dataclasses import asdict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("trinity.trinityai.api")

# Create router
router = APIRouter(prefix="/streamai", tags=["TrinityAI"])


async def _safe_close_websocket(websocket: WebSocket, code: int = 1000, reason: str = "") -> None:
    """Close websocket with a status code while swallowing close errors."""
    try:
        # Skip if already closing/closed
        if getattr(websocket, "close_code", None):
            return
        if hasattr(websocket, "client_state") and websocket.client_state.name == "DISCONNECTED":
            return
        if hasattr(websocket, "application_state") and websocket.application_state.name == "DISCONNECTED":
            return

        await websocket.close(code=code, reason=reason[:120])
    except Exception as close_error:  # pragma: no cover - defensive
        logger.debug(f"WebSocket close failed (code={code}, reason={reason}): {close_error}")


def _is_websocket_connected(websocket: WebSocket) -> bool:
    """Return True if the websocket is still open from the server perspective."""
    if getattr(websocket, "close_code", None):
        return False
    if hasattr(websocket, "client_state") and websocket.client_state.name == "DISCONNECTED":
        return False
    if hasattr(websocket, "application_state") and websocket.application_state.name == "DISCONNECTED":
        return False
    return True


def _get_ws_send_cache(websocket: WebSocket) -> dict:
    """Return (and attach) a cache used to dedupe websocket messages."""

    cache = getattr(websocket, "_trinity_sent_messages", None)
    if cache is not None:
        return cache

    # If a websocket_session_id is already attached, reuse any shared cache to
    # avoid duplicate sends when the browser reconnects mid-flow.
    shared_key = getattr(websocket, "_trinity_ws_key", None)
    if shared_key:
        cache = _SHARED_WS_CACHES.get(shared_key)
        if cache is None:
            cache = {}
            _SHARED_WS_CACHES[shared_key] = cache
    else:
        cache = {}

    setattr(websocket, "_trinity_sent_messages", cache)
    return cache


def _normalized_message_signature(payload: dict | None) -> str | None:
    """Return a normalized message-based signature for cross-module dedupe."""

    if not isinstance(payload, dict):
        return None

    message = payload.get("message")
    if not isinstance(message, str):
        return None

    normalized = re.sub(r"\s+", " ", message).strip().lower()
    return f"msg::{normalized}" if normalized else None


async def _safe_send_json(websocket: WebSocket, payload: dict, *, dedupe_signature: str | None = None) -> bool:
    """Send a JSON message if the websocket is still open.

    Returns False when the connection is no longer available so callers can
    gracefully stop sending additional messages.
    """
    cache = _get_ws_send_cache(websocket)

    signatures: list[str] = []
    if dedupe_signature:
        signatures.append(dedupe_signature)
    else:
        auto_signature = _build_dedupe_signature(payload)
        if auto_signature:
            signatures.append(auto_signature)

    message_signature = _normalized_message_signature(payload)
    if message_signature:
        signatures.append(message_signature)

    if any(cache.get(sig) for sig in signatures):
        return True

    if not _is_websocket_connected(websocket):
        return False

    try:
        await websocket.send_text(json.dumps(payload))
        for sig in signatures:
            cache[sig] = True
        return True
    except WebSocketDisconnect:
        return False
    except RuntimeError as runtime_error:
        logger.debug(f"WebSocket send failed after close: {runtime_error}")
        return False
    except Exception as send_error:  # pragma: no cover - defensive
        logger.warning(f"WebSocket send failed: {send_error}")
        return False


def _build_dedupe_signature(payload: dict) -> str | None:
    """Return a lightweight signature to avoid sending duplicate payloads."""

    message = payload.get("message") if isinstance(payload, dict) else None
    payload_type = payload.get("type") if isinstance(payload, dict) else None
    if payload_type and message:
        return f"{payload_type}::{message}"
    return None


async def _wait_for_clarification_response(websocket: WebSocket) -> dict | None:
    """Block until a clarification response arrives or the socket closes."""

    while True:
        try:
            incoming = await websocket.receive_text()
            parsed = json.loads(incoming)
        except WebSocketDisconnect:
            return None
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.debug("Clarification wait aborted: %s", exc)
            return None

        if parsed.get("type") == "clarification_response":
            return parsed

        logger.debug("Ignoring non-clarification message while waiting: %s", parsed)


def _compute_vagueness_score(prompt: str) -> float:
    """Compute a lightweight vagueness score between 0 and 1.

    Heuristic factors:
    - Longer prompts increase the score
    - Presence of concrete signals (numbers, dates, file-like tokens)
    - Penalize vague starter phrases and excessive interrogatives
    """

    if not prompt:
        return 0.0

    normalized = prompt.strip().lower()
    word_count = len(re.findall(r"\b\w+\b", normalized))
    sentence_count = max(1, normalized.count(".") + normalized.count("!") + normalized.count("?"))

    # Base score from length (cap at ~25 words)
    length_score = min(1.0, word_count / 25)

    # Specificity indicators
    has_numbers = bool(re.search(r"\d", normalized))
    has_dates = bool(re.search(r"\b(\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b", normalized))
    has_paths = bool(re.search(r"\w+/\w+", normalized))
    specificity_bonus = 0.15 * sum([has_numbers, has_dates, has_paths])

    # Penalize vague openers
    vague_prefixes = (
        "can you help",
        "please assist",
        "i need help",
        "can you do",
    )
    vague_penalty = 0.2 if normalized.startswith(vague_prefixes) else 0.0

    # Penalize question-only statements with few words
    interrogative_penalty = 0.0
    if normalized.endswith("?") and word_count < 8:
        interrogative_penalty = 0.1

    score = max(0.0, min(1.0, length_score + specificity_bonus - vague_penalty - interrogative_penalty))

    # Smooth by sentence count to reward structured inputs
    score = min(1.0, score * (1 + min(0.2, sentence_count * 0.05)))
    return score


def _compute_prerequisite_scores(prompt: str) -> dict:
    """Return prerequisite readiness scores for laboratory atom execution.

    The heuristic mirrors the lightweight vagueness detector while adding
    signals for scope detectability so Trinity AI can decide
    whether to execute a laboratory atom or keep the human in the loop.
    """

    if not prompt:
        return {
            "intent_clarity_score": 0.0,
            "scope_detectability_score": 0.0,
            "card_prerequisite_score": 0.0,
        }

    normalized = prompt.strip().lower()
    vagueness_score = _compute_vagueness_score(prompt)
    scope_detectability_threshold = 0.6

    # Intent clarity mirrors vagueness score but rewards explicit objectives
    intent_signals = len(re.findall(r"\b(analyze|build|create|train|summarize|compare)\b", normalized))
    intent_clarity_score = min(1.0, vagueness_score * 0.7 + min(0.3, intent_signals * 0.1))

    # Scope detectability favors dataset/file mentions and structural hints
    scope_keywords = (
        "dataset",
        "dataframe",
        "table",
        "column",
        "file",
        "csv",
        "json",
        "parquet",
        "chart",
        "plot",
        "model",
        "merge",
        "join",
        "filter",
    )
    scope_hits = sum(1 for kw in scope_keywords if kw in normalized)
    scope_detectability_score = min(1.0, vagueness_score * 0.5 + min(0.5, scope_hits * 0.08))

    data_references = _extract_data_references(prompt)
    insistence_patterns = (
        r"\b(use|using|only|must|specifically|required|exactly)\b[^.]{0,80}\b(dataset|file|table|columns?)\b",
        r"\b(in this|for this)\s+(dataset|file|table)\b",
    )
    insisted_scope = any(re.search(pattern, normalized) for pattern in insistence_patterns)
    if data_references and re.search(r"\b(use|using|only|must|specifically|required|exactly)\b", normalized):
        insisted_scope = True

    if insisted_scope:
        scope_detectability_score = max(scope_detectability_score, scope_detectability_threshold + 0.05)

    card_prerequisite_score = round(
        (intent_clarity_score + scope_detectability_score) / 2, 4
    )

    return {
        "intent_clarity_score": round(intent_clarity_score, 4),
        "scope_detectability_score": round(scope_detectability_score, 4),
        "card_prerequisite_score": card_prerequisite_score,
    }


def _format_scorecard(
    prerequisite_scores: dict,
    vagueness_score: float | None = None,
    vagueness_threshold: float | None = None,
    card_threshold: float | None = None,
    scope_threshold: float | None = None,
) -> str:
    """Build a concise, user-facing summary of scoring signals."""

    pieces: list[str] = []

    if vagueness_score is not None and vagueness_threshold is not None:
        pieces.append(f"vagueness {vagueness_score:.2f}/{vagueness_threshold:.2f}")

    if "intent_clarity_score" in prerequisite_scores:
        pieces.append(
            f"intent clarity {prerequisite_scores.get('intent_clarity_score', 0.0):.2f}"
        )

    scope_score = prerequisite_scores.get("scope_detectability_score")
    if scope_score is not None:
        if scope_threshold is not None:
            pieces.append(f"scope detectability {scope_score:.2f}/{scope_threshold:.2f}")
        else:
            pieces.append(f"scope detectability {scope_score:.2f}")

    card_score = prerequisite_scores.get("card_prerequisite_score")
    if card_score is not None:
        if card_threshold is not None:
            pieces.append(f"card readiness {card_score:.2f}/{card_threshold:.2f}")
        else:
            pieces.append(f"card readiness {card_score:.2f}")

    return "Scores → " + ", ".join(pieces) if pieces else "Scores pending"


def _build_contextual_prompt(
    latest_prompt: str,
    atom_ai_context: dict | None = None,
    history_summary: str | None = None,
) -> str:
    """Merge the latest prompt with previously captured context for scoring.

    The contextual prompt pulls from Trinity AI context clarifications and any
    available history summary so prerequisite and vagueness scores account for
    the full conversation, not only the most recent user turn.
    """

    atom_ai_context = atom_ai_context or {}
    clarifications = atom_ai_context.get("clarifications") or []

    segments: list[str] = []
    if history_summary:
        segments.append(f"Conversation summary: {history_summary}")

    initial_prompt = atom_ai_context.get("initial_prompt")
    if initial_prompt and initial_prompt != latest_prompt:
        segments.append(f"Initial request: {initial_prompt}")

    if clarifications:
        recent = clarifications[-3:]
        formatted = []
        for clarification in recent:
            focus = clarification.get("focus") or clarification.get("type") or "context"
            response = clarification.get("response") or clarification.get("message") or ""
            values = clarification.get("values") or {}
            if values:
                response = f"{response} | " + " | ".join(
                    f"{key}: {value}" for key, value in values.items()
                )
            formatted.append(f"{focus.title()} clarification: {response}".strip())

        segments.append("; ".join(formatted))

    segments.append(f"Latest prompt: {latest_prompt}")
    return "\n\n".join(segment for segment in segments if segment).strip()


def _extract_data_references(text: str) -> list[str]:
    """Extract likely dataset or file references from free text."""

    if not text:
        return []

    dataset_tokens = re.findall(r"\b[\w.-]+\.(?:csv|json|parquet|xlsx)\b", text, re.I)
    named_sets = re.findall(r"dataset\s+([\w-]+)", text, re.I)
    return list(dict.fromkeys(dataset_tokens + named_sets))


def _collect_known_scope_details(
    atom_ai_context: dict, available_files: list[str] | None, contextual_prompt: str
) -> dict:
    """Aggregate known scope details like datasets, columns, and filters."""

    clarifications = atom_ai_context.get("clarifications") or []

    datasets: list[str] = []
    if available_files:
        datasets.extend(available_files[:3])

    for clarification in clarifications:
        response = clarification.get("response", "")
        values = clarification.get("values") or {}
        datasets.extend(_extract_data_references(response))
        datasets.extend(_extract_data_references(" ".join(map(str, values.values()))))

    datasets.extend(_extract_data_references(contextual_prompt))
    datasets = list(dict.fromkeys(datasets))

    return {
        "datasets": datasets,
    }


def _summarize_known_data(
    atom_ai_context: dict,
    available_files: list[str] | None,
    initial_prompt: str,
    contextual_prompt: str,
) -> str:
    """Generate a short summary of what is already known from the user."""

    summaries: list[str] = []

    if initial_prompt:
        summaries.append(f"Initial intent: {initial_prompt.strip()[:120]}")

    clarification_notes = atom_ai_context.get("clarifications") or []
    if clarification_notes:
        last_focus = clarification_notes[-1].get("focus") or clarification_notes[-1].get(
            "type"
        )
        summaries.append(
            f"Recent clarification ({last_focus}): {clarification_notes[-1].get('response', '')}".strip()
        )

    known_scope = _collect_known_scope_details(
        atom_ai_context, available_files, contextual_prompt
    )
    datasets = known_scope.get("datasets") or []
    if datasets:
        dataset_list = ", ".join(datasets)
        summaries.append(f"I’ll use: {dataset_list}")
    elif available_files:
        file_list = ", ".join(available_files[:3])
        remaining = len(available_files) - min(3, len(available_files))
        if remaining > 0:
            file_list = f"{file_list} (+{remaining} more)"
        summaries.append(f"Files shared: {file_list}")

    return "; ".join(summaries) if summaries else "your latest request"


def _build_conversational_clarification(
    weakest_dimension: str,
    card_score: float,
    threshold: float,
    atom_ai_context: dict,
    available_files: list[str] | None,
    initial_prompt: str,
    scope_detectability_threshold: float,
    contextual_prompt: str,
    vagueness_score: float | None = None,
    vagueness_threshold: float | None = None,
    prerequisite_scores: dict | None = None,
) -> str:
    """Craft a conversational clarification prompt that cites known context."""

    prerequisite_scores = prerequisite_scores or {}

    known_summary = _summarize_known_data(
        atom_ai_context, available_files, initial_prompt, contextual_prompt
    )

    known_scope = _collect_known_scope_details(
        atom_ai_context, available_files, contextual_prompt
    )
    datasets = known_scope.get("datasets") or []

    scope_detail_default = (
        "which file or dataset to use, plus the columns and any filters or joins"
    )
    required_details = {
        "intent clarity": (
            "what success looks like, the exact deliverable (chart, table, cleaned file), and any must-have fields or metrics"
        ),
        "scope detectability": scope_detail_default,
    }

    if weakest_dimension == "scope detectability" and datasets:
        dataset_hint = datasets[0] if len(datasets) == 1 else ", ".join(datasets[:2])
        required_details["scope detectability"] = (
            f"how to use {dataset_hint} — list the columns to focus on and any filters or joins"
        )

    request_detail = required_details.get(
        weakest_dimension,
        "the specific goal and the data or filters you want me to focus on",
    )

    scope_note = (
        f" Scope detectability should be at least {scope_detectability_threshold:.2f} "
        "so I can operate safely."
        if weakest_dimension == "scope detectability"
        else ""
    )

    scorecard = _format_scorecard(
        prerequisite_scores,
        vagueness_score=vagueness_score,
        vagueness_threshold=vagueness_threshold,
        card_threshold=threshold,
        scope_threshold=scope_detectability_threshold,
    )

    guidance = (
        "Quick reply template → 1) File or dataset name, 2) Columns plus any filters/joins, "
        "3) Desired output (chart/table/summary)."
    )

    return (
        "I want to make sure I’m working with the right portion of your data. "
        f"Here’s what I have so far: {known_summary}. "
        f"Could you share {request_detail}? Once I have that, I’ll take care of the rest. "
        f"{scorecard}. (card_prerequisite_score={card_score:.2f}, threshold={threshold:.2f})."
        f"{scope_note} {guidance}"
    )

# Initialize components (will be set by main_api.py)
rag_engine = None
parameter_generator = None

# Intent routing service (laboratory mode)
try:
    from STREAMAI.intent_service import intent_service
except ImportError:
    try:
        from .intent_service import intent_service
    except Exception:
        intent_service = None  # type: ignore

# Track prior workflow sessions to allow resumption when intent stays on workflows
_previous_workflow_sessions: dict[str, str] = {}

# Reusable websocket caches keyed by websocket_session_id so reconnects do not re-send
_SHARED_WS_CACHES: dict[str, dict[str, bool]] = {}


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Trinity AI WebSocket"
    }


@router.websocket("/execute-ws")
async def execute_workflow_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time workflow execution.
    Implements the Trinity AI streaming pattern with events for card creation and result handling.
    
    Events sent to frontend:
    - status: Status updates (Analyzing, Processing, Thinking)
    - text_reply: Direct text answer for general questions
    - complete: Request completed
    - plan_generated: Workflow plan created
    - workflow_started: Execution began
    - step_started: Step execution started
    - card_created: Card created (frontend adds to Laboratory)
    - agent_executed: Atom executed with results (frontend calls atom handler)
    - step_completed: Step finished
    - workflow_completed: All steps done
    - error: Error occurred
    """
    await websocket.accept()
    logger.info("=" * 80)
    logger.info("🔌 NEW WebSocket connection accepted")
    logger.info("=" * 80)

    close_code = 1000
    close_reason = "workflow_complete"
    clarification_task = None
    clarification_history: list[dict] = []
    vagueness_score: float | None = None
    vagueness_threshold: float | None = None

    try:
        # Import components
        from STREAMAI.websocket_orchestrator import StreamWebSocketOrchestrator
        from STREAMAI.result_storage import get_result_storage
        from STREAMAI.stream_rag_engine import get_stream_rag_engine
        
        # Get instances
        result_storage = get_result_storage()
        rag_engine_inst = get_stream_rag_engine()
        
        # Initialize orchestrator
        ws_orchestrator = StreamWebSocketOrchestrator(
            workflow_planner=None,  # Orchestrator has its own planner
            parameter_generator=parameter_generator,
            result_storage=result_storage,
            rag_engine=rag_engine_inst
        )
        
        # Wait for initial message from client
        logger.info("⏳ Waiting for message from client...")
        message_data = await websocket.receive_text()
        logger.info(f"📥 Raw message received (length: {len(message_data)} chars)")

        message = json.loads(message_data)
        logger.info(f"📦 Parsed message keys: {list(message.keys())}")
        vagueness_threshold = float(message.get("vagueness_threshold", 0.45))

        # Extract session identifiers early for intent caching and websocket scoping
        session_id = message.get("session_id", None)  # Frontend chat session ID
        websocket_session_id = message.get("websocket_session_id") or message.get("websocketSessionId")
        chat_id = message.get("chat_id", None)  # Frontend chat ID
        if not session_id:
            session_id = f"ws_{uuid.uuid4().hex[:8]}"
        if not websocket_session_id:
            websocket_session_id = session_id or f"ws_conn_{uuid.uuid4().hex[:12]}"

        # Attach websocket key and cache immediately so downstream senders share dedupe across modules
        setattr(websocket, "_trinity_ws_key", websocket_session_id)
        setattr(websocket, "_trinity_sent_messages", _SHARED_WS_CACHES.setdefault(websocket_session_id, {}))

        # Start clarification response listener (non-blocking) so lab-mode clients can resume pauses
        orchestrator = ws_orchestrator

        async def handle_clarification_response(incoming: dict) -> bool:
            if incoming.get("type") != "clarification_response":
                return False
            accepted = await orchestrator.resume_clarification(
                session_id=incoming.get("session_id"),
                request_id=incoming.get("requestId"),
                message=incoming.get("message", ""),
                values=incoming.get("values") or {},
            )
            if accepted:
                await _safe_send_json(websocket, {
                    "type": "clarification_status",
                    "status": "resumed",
                    "requestId": incoming.get("requestId"),
                    "session_id": incoming.get("session_id"),
                })
            return True

        clarification_stop = asyncio.Event()

        async def clarification_router():
            while not clarification_stop.is_set():
                try:
                    router_message = await asyncio.wait_for(
                        websocket.receive_text(), timeout=5.0
                    )
                    parsed_router = json.loads(router_message)
                    handled = await handle_clarification_response(parsed_router)
                    if not handled:
                        logger.debug("Received non-clarification message during stream: %s", parsed_router)
                except asyncio.TimeoutError:
                    continue
                except asyncio.CancelledError:
                    break
                except WebSocketDisconnect:
                    break
                except Exception as exc:  # pragma: no cover - defensive logging
                    logger.debug("Clarification router stopped: %s", exc)
                    break

        clarification_task = asyncio.create_task(clarification_router())
        
        # Extract user prompt first
        user_prompt = message.get("message", "")
        logger.info("=" * 80)
        logger.info(f"📨 NEW REQUEST RECEIVED: {user_prompt}")
        logger.info(f"📨 Full message: {json.dumps(message, indent=2)}")
        logger.info("=" * 80)

        # Step 1: Send "Analyzing the query..." message immediately
        if not await _safe_send_json(websocket, {
            "type": "status",
            "message": "Analyzing the query...",
            "status": "analyzing"
        }):
            close_code = 1001
            close_reason = "client_disconnected"
            return
        
        # Step 2: Intent Detection (BEFORE any workflow processing)
        try:
            from STREAMAI.main_app import _detect_intent_simple, _generate_text_reply_direct
        except ImportError:
            try:
                from .main_app import _detect_intent_simple, _generate_text_reply_direct
            except ImportError:
                # Fallback: define simple functions
                async def _detect_intent_simple(prompt):
                    return {"intent": "workflow", "confidence": 0.5}

                async def _generate_text_reply_direct(prompt):
                    return "I apologize, but I couldn't process your request."

        available_files = message.get("available_files", [])
        prior_workflow_session = _previous_workflow_sessions.get(session_id) or _previous_workflow_sessions.get(chat_id or "")

        # Laboratory intent routing
        intent_record = None
        decision = None
        policy_flip = False
        routing_payload = None
        if intent_service:
            while True:
                previous_record = intent_service._intent_cache.get(session_id)
                intent_record = intent_service.infer_intent(
                    user_prompt,
                    session_id=session_id,
                    available_files=available_files,
                    mode="laboratory",
                )
                decision = intent_service.build_atom_binding(
                    session_id,
                    intent_record,
                    available_files=available_files,
                )
                policy_flip = intent_service.detect_policy_flip(
                    session_id, decision, previous_record=previous_record, available_files=available_files
                )

                routing_snapshot = {
                    "path": decision.path,
                    "rationale": decision.rationale,
                    "goal_type": intent_record.goal_type,
                    "required_tools": sorted(intent_record.required_tools),
                    "output_format": intent_record.output_format,
                }
                logger.info("🧭 Intent routing snapshot: %s", routing_snapshot)

                routing_payload = asdict(decision)
                routing_payload["intent_record"] = intent_record.to_dict()
                routing_payload["session_id"] = session_id
                routing_payload["routing_snapshot"] = routing_snapshot
                await _safe_send_json(
                    websocket,
                    {
                        "type": "intent_debug",
                        "path": decision.path,
                        "intent_record": intent_record.to_dict(),
                        "rationale": decision.rationale,
                    },
                )

                if decision.clarifications:
                    clarification_payload = {
                        "type": "clarification_required",
                        "message": "Please confirm: " + "; ".join(decision.clarifications),
                        "intent_record": intent_record.to_dict(),
                    }
                    await _safe_send_json(
                        websocket,
                        clarification_payload,
                        dedupe_signature=_build_dedupe_signature(clarification_payload),
                    )
                    await _safe_send_json(websocket, {
                        "type": "status",
                        "status": "awaiting_clarification",
                        "message": "Awaiting user confirmation before continuing.",
                    })

                    clarification_response = await _wait_for_clarification_response(websocket)
                    if not clarification_response:
                        close_code = 1001
                        close_reason = "clarification_aborted"
                        return

                    clarification_parts = []
                    if clarification_response.get("message"):
                        clarification_parts.append(clarification_response["message"])
                    values = clarification_response.get("values") or {}
                    if values:
                        clarification_parts.append(
                            " | ".join(f"{k}: {v}" for k, v in values.items())
                        )

                    if clarification_parts:
                        user_prompt = f"{user_prompt}\n\nUser clarification: {'; '.join(clarification_parts)}"

                    await _safe_send_json(websocket, {
                        "type": "status",
                        "status": "clarification_received",
                        "message": "Thanks for the clarification. Continuing analysis.",
                    })

                    # Restart intent inference with the clarified prompt
                    continue

                if policy_flip:
                    await _safe_send_json(
                        websocket,
                        {
                            "type": "policy_shift",
                            "message": "Detected a change in execution path; proceeding with the updated plan.",
                        },
                    )
                    # Continue execution without requesting user confirmation

                if decision.requires_files and not available_files:
                    clarification_payload = {
                        "type": "clarification_required",
                        "message": "I need a dataset or file to run Atom Agents. Upload a file and try again.",
                        "intent_record": intent_record.to_dict(),
                    }
                    await _safe_send_json(
                        websocket,
                        clarification_payload,
                        dedupe_signature=_build_dedupe_signature(clarification_payload),
                    )
                    close_code = 1000
                    close_reason = "missing_files"
                    return

                # Exit loop if no additional clarifications are required
                break

        # Step 2: Intent Detection (per prompt)
        # Always re-run intent detection for each incoming prompt so laboratory mode
        # correctly routes between workflow vs. direct LLM responses. Caching the
        # result caused stale paths after websocket_orchestrator.py restructuring.
        logger.info("=" * 80)
        logger.info(f"🔍 STARTING INTENT DETECTION (per prompt)")
        logger.info(f"   User prompt: {user_prompt}")
        logger.info(f"   Session ID: {session_id} (no cache)")
        logger.info("=" * 80)

        intent_result = await _detect_intent_simple(user_prompt, session_id=session_id, use_cache=False)
        intent = intent_result.get("intent", "workflow")
        decision_path = decision.path if decision else None

        # When the classifier explicitly says this is a text reply, honor it and do not
        # force a workflow path based on any cached routing decision. This prevents
        # previously paused workflows from being resumed for generic LLM Q&A turns.
        if decision:
            if intent == "text_reply":
                decision_path = "llm_only"
            intent = "text_reply" if decision_path == "llm_only" else "workflow"
            if routing_payload is not None:
                routing_payload["path"] = decision_path

        if intent_service and decision:
            path_for_log = decision_path or decision.path
            intent_service.update_scratchpad(session_id, f"Routing via {path_for_log}: {decision.rationale}")

        logger.info("=" * 80)
        logger.info(f"✅ INTENT DETECTION RESULT (fresh run)")
        logger.info(f"   Intent: {intent}")
        logger.info(f"   Confidence: {intent_result.get('confidence', 0.5):.2f}")
        logger.info(f"   Reasoning: {intent_result.get('reasoning', 'N/A')}")
        if intent_record:
            logger.info(
                "📘 Intent record: goal=%s tools=%s output=%s", intent_record.goal_type, intent_record.required_tools, intent_record.output_format
            )
        logger.info("=" * 80)
        
        # Step 3: Route based on intent
        # If text_reply -> return immediately (no workflow execution)
        if intent == "text_reply":
            # Handle as text reply - direct LLM response
            logger.info("📝 Routing to text reply handler")

            # Send "Generating answer..." message
            if not await _safe_send_json(websocket, {
                "type": "status",
                "message": "Generating answer...",
                "status": "thinking"
            }):
                close_code = 1001
                close_reason = "client_disconnected"
                return
            
            # Generate text reply
            text_response = await _generate_text_reply_direct(user_prompt)
            logger.info(f"✅ Generated text reply: {text_response[:100]}...")

            if intent_service:
                intent_service.update_scratchpad(session_id, "Answered via LLM-only path (websocket)")

            # Send the answer
            await _safe_send_json(websocket, {
                "type": "text_reply",
                "message": text_response,
                "intent": "text_reply",
                "session_id": message.get("session_id", "unknown")
            })

            # Send completion
            await _safe_send_json(websocket, {
                "type": "complete",
                "status": "completed",
                "intent": "text_reply"
            })

            logger.info("✅ Text reply sent, closing connection")
            await _safe_close_websocket(websocket, code=1000, reason="text_reply_complete")
            return

        # Determine whether we should resume an existing workflow sequence
        resume_candidates = [
            websocket_session_id,
            session_id,
            chat_id,
            prior_workflow_session,
        ]
        resumable_session_id = ws_orchestrator.find_resumable_sequence(*resume_candidates)
        if resumable_session_id and resumable_session_id != websocket_session_id:
            logger.info(
                "⏯️ Resuming existing workflow session: incoming=%s -> resumable=%s",
                websocket_session_id,
                resumable_session_id,
            )
            websocket_session_id = resumable_session_id
        elif not resumable_session_id and prior_workflow_session and websocket_session_id != prior_workflow_session:
            # Prefer continuing with the previously used workflow session ID to keep context aligned
            logger.info(
                "🔁 Continuing workflow context using previous session id %s (incoming=%s)",
                prior_workflow_session,
                websocket_session_id,
            )
            websocket_session_id = prior_workflow_session

        project_context = message.get("project_context", {}) or {}
        atom_ai_context = project_context.get("ATOM_AI_Context") or {}
        if not isinstance(atom_ai_context, dict):
            atom_ai_context = {}
        atom_ai_context.setdefault("clarifications", [])
        prompt_history = atom_ai_context.setdefault("prompt_history", [])
        if user_prompt and (not prompt_history or prompt_history[-1] != user_prompt):
            prompt_history.append(user_prompt)
            atom_ai_context["prompt_history"] = prompt_history[-10:]
        atom_ai_context.setdefault("initial_prompt", user_prompt)
        history_summary = message.get("history_summary")
        if history_summary:
            atom_ai_context["history_summary"] = history_summary
        atom_ai_context["available_files"] = available_files

        contextual_prompt = _build_contextual_prompt(
            user_prompt, atom_ai_context, history_summary
        )
        user_id = message.get("user_id", "default_user")
        mentioned_files = message.get("mentioned_files") or []

        # Step 3b: Vagueness scoring only for workflow execution paths (after routing is fixed)
        vagueness_score = _compute_vagueness_score(contextual_prompt)
        current_vagueness_threshold = max(0.35, vagueness_threshold)
        logger.info(
            "🧭 Vagueness check -> score=%.2f threshold=%.2f (workflow path)",
            vagueness_score,
            current_vagueness_threshold,
        )
        await _safe_send_json(
            websocket,
            {
                "type": "status",
                "status": "vagueness_check",
                "message": (
                    "Calculating vagueness score for workflow routing: "
                    f"score={vagueness_score:.2f}, threshold={current_vagueness_threshold:.2f}"
                ),
                "vagueness_score": vagueness_score,
                "vagueness_threshold": current_vagueness_threshold,
            },
        )

        while vagueness_score < current_vagueness_threshold:
            clarification_payload = {
                "type": "clarification_required",
                "message": (
                    "I need more details to proceed. Please provide additional context or specifics. "
                    f"(vagueness_score={vagueness_score:.2f}, threshold={current_vagueness_threshold:.2f})"
                    " Tip: mention the dataset/file, key columns, and the exact output you want."
                ),
                "vagueness_score": vagueness_score,
                "vagueness_threshold": current_vagueness_threshold,
            }
            await _safe_send_json(
                websocket,
                clarification_payload,
                dedupe_signature=_build_dedupe_signature(clarification_payload),
            )
            await _safe_send_json(
                websocket,
                {
                    "type": "status",
                    "status": "awaiting_clarification",
                    "message": "Awaiting more details to reduce vagueness.",
                },
            )

            clarification_response = await _wait_for_clarification_response(websocket)
            if not clarification_response:
                close_code = 1001
                close_reason = "clarification_aborted"
                return

            clarification_history.append(
                {
                    "message": clarification_response.get("message", ""),
                    "values": clarification_response.get("values") or {},
                }
            )

            clarification_parts = []
            if clarification_response.get("message"):
                clarification_parts.append(clarification_response["message"])
            values = clarification_response.get("values") or {}
            if values:
                clarification_parts.append(" | ".join(f"{k}: {v}" for k, v in values.items()))

            if clarification_parts:
                user_prompt = f"{user_prompt}\n\nUser clarification: {'; '.join(clarification_parts)}"

            atom_ai_context["clarifications"].append(
                {
                    "prompt": "initial_vagueness_clarification",
                    "response": clarification_response.get("message", ""),
                    "values": values,
                    "focus": "vagueness",
                }
            )
            prompt_history = atom_ai_context.setdefault("prompt_history", [])
            prompt_history.append(user_prompt)
            atom_ai_context["prompt_history"] = prompt_history[-10:]

            contextual_prompt = _build_contextual_prompt(
                user_prompt, atom_ai_context, history_summary
            )

            vagueness_score = _compute_vagueness_score(contextual_prompt)
            logger.info(
                "🧭 Recomputed vagueness score after clarification -> %.2f (threshold=%.2f)",
                vagueness_score,
                current_vagueness_threshold,
            )
            await _safe_send_json(
                websocket,
                {
                    "type": "status",
                    "status": "vagueness_check",
                    "message": (
                        "Recomputed vagueness score after clarification: "
                        f"score={vagueness_score:.2f}, threshold={current_vagueness_threshold:.2f}"
                    ),
                    "vagueness_score": vagueness_score,
                    "vagueness_threshold": current_vagueness_threshold,
                },
            )

            current_vagueness_threshold = max(
                0.35, current_vagueness_threshold - 0.05
            )

        await _safe_send_json(
            websocket,
            {
                "type": "status",
                "status": "clarification_complete",
                "message": "Received enough details. Proceeding with execution.",
                "vagueness_score": vagueness_score,
                "vagueness_threshold": current_vagueness_threshold,
            },
        )

        vagueness_threshold = current_vagueness_threshold

        # Extract remaining parameters for workflow
        # Note: session_id and chat_id already extracted above for intent caching

        # Laboratory prerequisite scoring for atom execution
        card_prerequisite_threshold = float(message.get("card_prerequisite_threshold", 0.5))
        scope_detectability_threshold = float(message.get("scope_detectability_threshold", 0.5))
        contextual_prompt = _build_contextual_prompt(
            user_prompt, atom_ai_context, history_summary
        )
        atom_ai_context["contextual_prompt"] = contextual_prompt
        prerequisite_scores = _compute_prerequisite_scores(contextual_prompt)
        card_prerequisite_score = prerequisite_scores.get("card_prerequisite_score", 0.0)
        current_card_threshold = max(0.35, card_prerequisite_threshold)
        current_scope_threshold = max(0.35, scope_detectability_threshold)
        scorecard_summary = _format_scorecard(
            prerequisite_scores,
            vagueness_score=vagueness_score,
            vagueness_threshold=vagueness_threshold,
            card_threshold=current_card_threshold,
            scope_threshold=current_scope_threshold,
        )

        await _safe_send_json(
            websocket,
            {
                "type": "status",
                "status": "prerequisite_check",
                "message": (
                    "Evaluating laboratory readiness for atom execution. "
                    f"{scorecard_summary}. If anything is low, I'll ask for a tiny follow-up."
                ),
                "prerequisite_scores": prerequisite_scores,
                "card_prerequisite_threshold": current_card_threshold,
                "scope_detectability_threshold": current_scope_threshold,
                "scorecard_summary": scorecard_summary,
            },
        )

        clarification_vagueness = vagueness_score
        max_prerequisite_iterations = 6
        iterations = 0
        while (
            card_prerequisite_score < current_card_threshold
            or clarification_vagueness < vagueness_threshold
            or prerequisite_scores.get("scope_detectability_score", 0.0)
            < current_scope_threshold
        ):
            iterations += 1
            weakest_dimension = min(
                (
                    ("intent clarity", prerequisite_scores.get("intent_clarity_score", 0.0)),
                    ("scope detectability", prerequisite_scores.get("scope_detectability_score", 0.0)),
                ),
                key=lambda item: item[1],
            )[0]

            current_known_summary = _summarize_known_data(
                atom_ai_context, available_files, user_prompt, contextual_prompt
            )
            atom_ai_context["latest_known_summary"] = current_known_summary

            clarification_message = _build_conversational_clarification(
                weakest_dimension,
                card_prerequisite_score,
                current_card_threshold,
                atom_ai_context,
                available_files,
                user_prompt,
                current_scope_threshold,
                contextual_prompt,
                vagueness_score=clarification_vagueness,
                vagueness_threshold=vagueness_threshold,
                prerequisite_scores=prerequisite_scores,
            )

            scorecard_summary = _format_scorecard(
                prerequisite_scores,
                vagueness_score=clarification_vagueness,
                vagueness_threshold=vagueness_threshold,
                card_threshold=current_card_threshold,
                scope_threshold=current_scope_threshold,
            )
            clarification_payload = {
                "type": "clarification_required",
                "message": clarification_message,
                "focus": weakest_dimension,
                "prerequisite_scores": prerequisite_scores,
                "card_prerequisite_threshold": current_card_threshold,
                "scope_detectability_threshold": current_scope_threshold,
                "vagueness_threshold": vagueness_threshold,
                "scorecard_summary": scorecard_summary,
            }
            await _safe_send_json(
                websocket,
                clarification_payload,
                dedupe_signature=_build_dedupe_signature(clarification_payload),
            )
            await _safe_send_json(
                websocket,
                {
                    "type": "status",
                    "status": "awaiting_clarification",
                    "message": clarification_message,
                    "focus": weakest_dimension,
                },
            )

            clarification_response = await _wait_for_clarification_response(websocket)
            if not clarification_response:
                close_code = 1001
                close_reason = "clarification_aborted"
                return

            response_message = clarification_response.get("message", "")
            response_values = clarification_response.get("values") or {}
            clarification_history.append(
                {
                    "message": response_message,
                    "values": response_values,
                    "focus": weakest_dimension,
                    "type": "card_prerequisite",
                }
            )
            atom_ai_context["clarifications"].append(
                {
                    "prompt": clarification_message,
                    "response": response_message,
                    "values": response_values,
                    "focus": weakest_dimension,
                }
            )

            clarification_parts = []
            if response_message:
                clarification_parts.append(response_message)
            if response_values:
                clarification_parts.append(" | ".join(f"{k}: {v}" for k, v in response_values.items()))

            clarified_text = "; ".join(clarification_parts)
            if clarified_text:
                user_prompt = f"{user_prompt}\n\n{weakest_dimension.title()} clarification: {clarified_text}"

            prompt_history = atom_ai_context.setdefault("prompt_history", [])
            prompt_history.append(user_prompt)
            atom_ai_context["prompt_history"] = prompt_history[-10:]
            contextual_prompt = _build_contextual_prompt(
                user_prompt, atom_ai_context, history_summary
            )
            atom_ai_context["contextual_prompt"] = contextual_prompt

            clarification_vagueness = _compute_vagueness_score(clarified_text or response_message)
            await _safe_send_json(
                websocket,
                {
                    "type": "status",
                    "status": "vagueness_check",
                    "message": (
                        "Evaluating clarification quality: "
                        f"score={clarification_vagueness:.2f}, threshold={vagueness_threshold:.2f}"
                    ),
                    "vagueness_score": clarification_vagueness,
                    "vagueness_threshold": vagueness_threshold,
                },
            )

            prerequisite_scores = _compute_prerequisite_scores(contextual_prompt)
            card_prerequisite_score = prerequisite_scores.get("card_prerequisite_score", 0.0)
            scorecard_summary = _format_scorecard(
                prerequisite_scores,
                vagueness_score=clarification_vagueness,
                vagueness_threshold=vagueness_threshold,
                card_threshold=current_card_threshold,
                scope_threshold=current_scope_threshold,
            )
            await _safe_send_json(
                websocket,
                {
                    "type": "status",
                    "status": "prerequisite_check",
                    "message": (
                        "Re-evaluated laboratory readiness. "
                        f"{scorecard_summary}."
                    ),
                    "prerequisite_scores": prerequisite_scores,
                    "card_prerequisite_threshold": current_card_threshold,
                    "scope_detectability_threshold": current_scope_threshold,
                    "scorecard_summary": scorecard_summary,
                },
            )

            current_card_threshold = max(0.35, current_card_threshold - 0.05)
            current_scope_threshold = max(0.35, current_scope_threshold - 0.05)
            vagueness_threshold = max(0.35, vagueness_threshold - 0.03)

            if iterations >= max_prerequisite_iterations and (
                card_prerequisite_score < current_card_threshold
                or clarification_vagueness < vagueness_threshold
                or prerequisite_scores.get("scope_detectability_score", 0.0)
                < current_scope_threshold
            ):
                clarification_payload = {
                    "type": "clarification_required",
                    "message": (
                        "I'm still missing enough detail to execute atoms reliably after multiple attempts. "
                        "Please provide a concise, specific description so we can continue."
                    ),
                    "prerequisite_scores": prerequisite_scores,
                    "card_prerequisite_threshold": current_card_threshold,
                    "scope_detectability_threshold": current_scope_threshold,
                }
                await _safe_send_json(
                    websocket,
                    clarification_payload,
                    dedupe_signature=_build_dedupe_signature(clarification_payload),
                )
                close_code = 1001
                close_reason = "prerequisite_threshold_not_met"
                return

        vagueness_score = max(vagueness_score or 0.0, clarification_vagueness or 0.0)

        await _safe_send_json(
            websocket,
            {
                "type": "status",
                "status": "prerequisite_complete",
                "message": "Card prerequisites satisfied. Proceeding to atom execution.",
                "prerequisite_scores": prerequisite_scores,
                "card_prerequisite_threshold": current_card_threshold,
                "scope_detectability_threshold": current_scope_threshold,
            },
        )

        atom_ai_context["latest_prerequisite_scores"] = prerequisite_scores
        atom_ai_context["card_prerequisite_score"] = card_prerequisite_score

        # Step 4: Handle as workflow (intent already detected above - no need to detect again)
        logger.info("🔄 Routing to workflow handler")
        logger.info("ℹ️ Intent detection already done - proceeding with workflow execution (will NOT detect intent again)")

        # Send "Processing workflow..." message
        if not await _safe_send_json(websocket, {
            "type": "status",
            "message": "Processing workflow...",
            "status": "processing"
        }):
            close_code = 1001
            close_reason = "client_disconnected"
            return

        # Persist vagueness metadata for downstream execution
        prerequisite_metadata = {
            "vagueness_score": vagueness_score,
            "vagueness_threshold": vagueness_threshold,
            "clarification_history": clarification_history,
            "card_prerequisite_score": card_prerequisite_score,
            "card_prerequisite_threshold": current_card_threshold,
            "scope_detectability_threshold": current_scope_threshold,
            "prerequisite_scores": prerequisite_scores,
            "ATOM_AI_Context": atom_ai_context,
        }
        project_context.update(prerequisite_metadata)
        
        # 🔧 CRITICAL FIX: Extract project context from file paths if not provided or contains 'default' values
        # Check if project_context is missing, empty, or contains 'default' values
        has_valid_context = (
            project_context and 
            isinstance(project_context, dict) and
            project_context.get("client_name") and 
            project_context.get("client_name") != "default" and
            project_context.get("app_name") and 
            project_context.get("app_name") != "default" and
            project_context.get("project_name") and 
            project_context.get("project_name") != "default"
        )
        
        if not has_valid_context:
            logger.warning("⚠️ No valid project_context provided (missing or contains 'default' values). Attempting to extract from file paths...")
            logger.info(f"📦 Current project_context: {project_context}")
            logger.info(f"📦 Available files: {available_files}")
            
            # Try to extract from available_files
            extracted_context = None
            for file_path in available_files:
                if isinstance(file_path, str) and "/" in file_path:
                    # Handle both forward and backslash paths
                    normalized_path = file_path.replace("\\", "/")
                    parts = normalized_path.split("/")
                    logger.info(f"🔍 Parsing file path: {file_path} -> {parts}")
                    
                    if len(parts) >= 3:
                        extracted_client = parts[0]
                        extracted_app = parts[1]
                        extracted_project = parts[2]
                        extracted_context = {
                            "client_name": extracted_client,
                            "app_name": extracted_app,
                            "project_name": extracted_project,
                            "available_files": available_files  # Preserve available_files
                        }
                        logger.info(f"✅ Extracted project context from file path '{file_path}':")
                        logger.info(f"   client_name: {extracted_client}")
                        logger.info(f"   app_name: {extracted_app}")
                        logger.info(f"   project_name: {extracted_project}")
                        break
            
            if extracted_context:
                project_context = {**extracted_context, **prerequisite_metadata}
            else:
                # If still empty or contains 'default', try environment variables
                import os
                env_client = os.getenv("CLIENT_NAME", "")
                env_app = os.getenv("APP_NAME", "")
                env_project = os.getenv("PROJECT_NAME", "")
                if env_client or env_app or env_project:
                    project_context = {
                        "client_name": env_client,
                        "app_name": env_app,
                        "project_name": env_project,
                        "available_files": available_files,
                        **prerequisite_metadata,
                    }
                    logger.info(f"✅ Using project context from environment variables: client={env_client}, app={env_app}, project={env_project}")
                else:
                    logger.error("❌ Could not determine project context from message, files, or environment variables!")
                    logger.error(f"📦 Available files: {available_files}")
                    logger.error(f"📦 Message keys: {list(message.keys())}")
                    # Set empty context but preserve available_files
                    project_context = {
                        "client_name": "",
                        "app_name": "",
                        "project_name": "",
                        "available_files": available_files,
                        **prerequisite_metadata,
                    }
        
        # Ensure available_files is included in project_context
        if "available_files" not in project_context:
            project_context["available_files"] = available_files
        
        logger.info(f"🔧 Final project_context: client={project_context.get('client_name', 'N/A')}, app={project_context.get('app_name', 'N/A')}, project={project_context.get('project_name', 'N/A')}")
        logger.info(f"📦 Final available_files count: {len(project_context.get('available_files', []))}")
        if isinstance(mentioned_files, str):
            mentioned_files = [mentioned_files]
        elif isinstance(mentioned_files, list):
            cleaned_files = []
            for entry in mentioned_files:
                if isinstance(entry, str):
                    cleaned_files.append(entry)
                elif isinstance(entry, bytes):
                    cleaned_files.append(entry.decode("utf-8", "ignore"))
            mentioned_files = cleaned_files
        else:
            mentioned_files = []
        
        if routing_payload is not None:
            project_context["intent_routing"] = routing_payload

        # Attach websocket session id for downstream components that need strict scoping
        project_context["websocket_session_id"] = websocket_session_id

        logger.info(f"🔑 Session ID: {session_id}, WebSocket Session: {websocket_session_id}, Chat ID: {chat_id}")

        # Remember the workflow session ids so future prompts can resume if intent stays on workflows
        if session_id:
            _previous_workflow_sessions[session_id] = websocket_session_id
        if chat_id:
            _previous_workflow_sessions[chat_id] = websocket_session_id

        # Execute workflow with real-time events (intent detection already done above - NOT called again)
        try:
            workflow_prompt = atom_ai_context.get("contextual_prompt", user_prompt)
            await ws_orchestrator.execute_workflow_with_websocket(
                websocket=websocket,
                user_prompt=workflow_prompt,
                available_files=available_files,
                project_context=project_context,
                user_id=user_id,
                frontend_session_id=session_id,
                frontend_chat_id=chat_id,
                websocket_session_id=websocket_session_id,
                history_override=history_summary,
                chat_file_names=mentioned_files,
                intent_route=routing_payload,
            )
        except Exception as workflow_error:
            error_msg = str(workflow_error)
            logger.warning(f"⚠️ Workflow execution failed: {error_msg}")
            close_code = 1011
            close_reason = error_msg[:120] or "workflow_error"

            # Check if it's because the request can't be handled as a workflow
            if ("atom_id" in error_msg.lower() and "null" in error_msg.lower()) or \
               "outside the scope" in error_msg.lower() or \
               "cannot be fulfilled" in error_msg.lower() or \
               "cannot infer atom_id" in error_msg.lower():
                # Fallback to text reply
                logger.info("⚠️ Workflow cannot handle request, falling back to text reply")

                await _safe_send_json(websocket, {
                    "type": "status",
                    "message": "Generating answer...",
                    "status": "thinking"
                })

                text_response = await _generate_text_reply_direct(user_prompt)

                await _safe_send_json(websocket, {
                    "type": "text_reply",
                    "message": text_response,
                    "intent": "text_reply",
                    "session_id": session_id
                })

                await _safe_send_json(websocket, {
                    "type": "complete",
                    "status": "completed",
                    "intent": "text_reply"
                })
                close_code = 1000
                close_reason = "fallback_text_reply"
            else:
                # Real error - send error message
                await _safe_send_json(websocket, {
                    "type": "error",
                    "message": f"I encountered an error: {error_msg}",
                    "error": error_msg
                })
                close_code = 1011
                close_reason = "workflow_error"

    except WebSocketDisconnect as ws_exc:
        logger.info("🔌 WebSocket disconnected")
        close_code = ws_exc.code or close_code
        close_reason = ws_exc.reason or "client_disconnected"
    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        close_code = 1011
        close_reason = str(e)[:120] or "websocket_error"
        try:
            await _safe_send_json(websocket, {
                "type": "error",
                "error": str(e),
                "message": "Workflow execution failed"
            })
        except:
            pass
    finally:
        if 'clarification_stop' in locals():
            clarification_stop.set()
        if clarification_task:
            clarification_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await asyncio.wait_for(clarification_task, timeout=0.5)
        await _safe_close_websocket(websocket, code=close_code, reason=close_reason)


def initialize_stream_ai_components(param_gen, rag):
    """Initialize Stream AI components for API endpoints"""
    global parameter_generator, rag_engine
    parameter_generator = param_gen
    rag_engine = rag
    logger.info("✅ Stream AI WebSocket components initialized")


# Export router
__all__ = ["router", "initialize_stream_ai_components"]
