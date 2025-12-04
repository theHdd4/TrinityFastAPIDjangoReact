"""
WebSocket handler for real-time collaborative Laboratory Mode synchronization.

Ensure ASGI and proxy idle timeouts (e.g., uvicorn --timeout-keep-alive,
nginx proxy_read_timeout, AWS ALB idle timeout) are configured above expected
lab session lengths so connections are not closed prematurely.

Handles:
- Per-project WebSocket rooms
- Broadcasting state updates to all connected clients
- Debounced persistence to MongoDB and MinIO
- Version tracking and conflict detection
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Set
from collections import defaultdict
from uuid import uuid4

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.features.project_state.routes import save_atom_list_configuration, get_atom_list_configuration

logger = logging.getLogger(__name__)
logger.disabled = True  # Disable all logs from laboratory websocket


@dataclass
class SessionEntry:
    session_id: str
    created_at: datetime
    last_activity_at: datetime
    websocket: WebSocket | None = None
    user_id: str | None = None
    status: str = "active"
    last_acked_sequence: int = 0
    next_sequence: int = 1
    message_buffer: List[dict] = field(default_factory=list)
    closed_reason: str | None = None

    def record_activity(self) -> None:
        self.last_activity_at = datetime.utcnow()

    def buffer_message(self, message: dict, max_length: int = 100) -> None:
        self.message_buffer.append(message)
        if len(self.message_buffer) > max_length:
            self.message_buffer = self.message_buffer[-max_length:]


def _dedupe_cards(cards: list[dict]) -> list[dict]:
    """Ensure cards list only contains a single entry per card id.

    We keep the last-seen version of each id while preserving the overall
    ordering so that broadcasts and persistence do not introduce duplicates
    when multiple clients send overlapping payloads.
    """

    if not isinstance(cards, list):
        return []

    seen_ids = set()
    deduped_reversed = []

    for card in reversed(cards):
        card_id = card.get("id") if isinstance(card, dict) else None
        if card_id is None or card_id in seen_ids:
            continue
        seen_ids.add(card_id)
        deduped_reversed.append(card)

    return list(reversed(deduped_reversed))


class ConnectionManager:
    """Manages WebSocket connections for collaborative editing."""

    def __init__(self):
        # Map of project_key -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        # Map of project_key -> last state for debounced persistence
        self.pending_states: Dict[str, dict] = {}
        # Map of project_key -> asyncio Task for debounced save
        self.save_tasks: Dict[str, asyncio.Task] = {}
        # Map of WebSocket -> user info (email, name, client_id)
        self.user_info: Dict[WebSocket, dict] = {}
        # Map of project_key -> list of active users
        self.active_users: Dict[str, list] = defaultdict(list)
        # Map of project_key -> card_id -> editor info (for card focus tracking)
        self.card_editors: Dict[str, Dict[str, dict]] = defaultdict(dict)
        # Debounce delay in seconds (reduced to 1s to prevent race conditions with frontend)
        self.debounce_delay = 1.0
        # Session registry keyed by session_id
        self.sessions: Dict[str, SessionEntry] = {}
        self.websocket_sessions: Dict[WebSocket, str] = {}
        self.heartbeat_interval = 20  # seconds
        self.heartbeat_timeout = 30  # seconds
        self.session_sweep_interval = 30  # seconds
        self._sweeper_task: asyncio.Task | None = None
        
    def _get_project_key(self, client_name: str, app_name: str, project_name: str) -> str:
        """Generate unique key for project room."""
        return f"{client_name}:{app_name}:{project_name}"

    def _get_or_create_session(self, session_id: str, websocket: WebSocket) -> SessionEntry:
        """Return an existing session or create a new one."""
        existing = self.sessions.get(session_id)
        if existing:
            return existing

        new_entry = SessionEntry(
            session_id=session_id,
            created_at=datetime.utcnow(),
            last_activity_at=datetime.utcnow(),
            websocket=websocket,
        )
        self.sessions[session_id] = new_entry
        return new_entry

    async def attach_websocket_to_session(
        self, session_id: str, websocket: WebSocket, allow_replace: bool = False
    ) -> SessionEntry:
        """Attach a websocket to a session, optionally replacing an existing socket."""
        session = self._get_or_create_session(session_id, websocket)

        # Reject duplicate connections unless explicitly resuming
        if (
            session.websocket
            and session.websocket.client_state == WebSocketState.CONNECTED
            and session.websocket is not websocket
            and not allow_replace
        ):
            try:
                await websocket.close(code=4002, reason="duplicate session")
            finally:
                raise WebSocketDisconnect(code=4002)

        if (
            session.websocket
            and session.websocket is not websocket
            and allow_replace
            and session.websocket.client_state == WebSocketState.CONNECTED
        ):
            try:
                await session.websocket.close(code=4002, reason="session transferred")
            except Exception:
                pass

        session.websocket = websocket
        session.status = "active"
        session.record_activity()
        self.websocket_sessions[websocket] = session_id
        return session

    def _start_sweeper(self) -> None:
        """Ensure the background sweeper is running."""
        if self._sweeper_task and not self._sweeper_task.done():
            return

        self._sweeper_task = asyncio.create_task(self._session_sweeper())

    async def _session_sweeper(self) -> None:
        """Close stale sessions proactively with explicit codes."""
        try:
            while True:
                await asyncio.sleep(self.session_sweep_interval)

                now = datetime.utcnow()
                for session in list(self.sessions.values()):
                    # Skip explicitly closed sessions
                    if session.status == "closed":
                        continue

                    websocket = session.websocket
                    last_active = session.last_activity_at

                    if (
                        websocket
                        and websocket.client_state == WebSocketState.CONNECTED
                        and now - last_active > timedelta(seconds=self.heartbeat_timeout)
                    ):
                        try:
                            await websocket.close(code=4000, reason="heartbeat timeout")
                        finally:
                            session.status = "stale"
                            session.websocket = None
                            session.closed_reason = "heartbeat timeout"

                    if (
                        (not websocket or websocket.client_state != WebSocketState.CONNECTED)
                        and now - last_active > timedelta(seconds=self.heartbeat_timeout * 2)
                    ):
                        session.status = "stale"
                        session.closed_reason = session.closed_reason or "idle timeout"
        except asyncio.CancelledError:
            # Task was cancelled because the server is shutting down
            pass
        except Exception:
            # Keep the sweeper alive even if an unexpected error occurs
            logger.exception("Session sweeper failed; restarting")
            asyncio.create_task(self._session_sweeper())
        finally:
            self._sweeper_task = None

    def detach_session(self, websocket: WebSocket) -> None:
        """Detach a websocket from its session without closing the session."""
        session_id = self.websocket_sessions.pop(websocket, None)
        if not session_id:
            return

        session = self.sessions.get(session_id)
        if not session:
            return

        session.websocket = None
        session.status = "detached"

    async def close_session(self, session_id: str, code: int = 1000, reason: str = "session ended") -> None:
        """Mark a session as closed and close its websocket."""
        session = self.sessions.get(session_id)
        if not session:
            return

        session.status = "closed"
        session.closed_reason = reason
        websocket = session.websocket
        if websocket and websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close(code=code, reason=reason)
            except Exception:
                pass
        session.websocket = None

    async def send_to_websocket(self, websocket: WebSocket, message: dict, buffer: bool = True) -> None:
        """Send a JSON message with sequencing and buffering for resumption."""
        session_id = self.websocket_sessions.get(websocket)
        if not session_id:
            await websocket.send_json(message)
            return

        session = self.sessions.get(session_id)
        if not session:
            await websocket.send_json(message)
            return

        seq = session.next_sequence
        session.next_sequence += 1
        message_with_meta = {
            **message,
            "sequence": seq,
            "session_id": session_id,
        }

        if buffer:
            session.buffer_message(message_with_meta)

        await websocket.send_json(message_with_meta)

    async def replay_missed_messages(self, session: SessionEntry, last_acked: int) -> None:
        """Replay buffered messages newer than the last acked sequence."""
        websocket = session.websocket
        if not websocket or websocket.client_state != WebSocketState.CONNECTED:
            return

        for buffered in session.message_buffer:
            if buffered.get("sequence", 0) > last_acked:
                try:
                    await websocket.send_json(buffered)
                except Exception:
                    break

    async def heartbeat_loop(self, session: SessionEntry) -> None:
        """Periodic heartbeat pings and stale detection."""
        while True:
            await asyncio.sleep(self.heartbeat_interval)

            websocket = session.websocket
            if not websocket or websocket.client_state != WebSocketState.CONNECTED:
                return

            now = datetime.utcnow()
            if now - session.last_activity_at > timedelta(seconds=self.heartbeat_timeout):
                try:
                    await websocket.close(code=4000, reason="heartbeat timeout")
                finally:
                    session.status = "stale"
                    return

            try:
                await self.send_to_websocket(
                    websocket,
                    {
                        "type": "heartbeat",
                        "op": "ping",
                        "timestamp": now.isoformat(),
                    },
                    buffer=False,
                )
            except Exception:
                session.status = "error"
                return
    
    async def connect(
        self,
        websocket: WebSocket,
        client_name: str,
        app_name: str,
        project_name: str,
        user_email: str = None,
        user_name: str = None,
        client_id: str = None,
        session_id: str | None = None,
        allow_replace: bool = False,
    ):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        project_key = self._get_project_key(client_name, app_name, project_name)
        self.active_connections[project_key].add(websocket)
        self._start_sweeper()

        if session_id:
            await self.attach_websocket_to_session(session_id, websocket, allow_replace=allow_replace)

        # Store user info
        user_data = {
            "email": user_email or "Anonymous",
            "name": user_name or "Anonymous User",
            "client_id": client_id or f"client_{id(websocket)}",
            "connected_at": datetime.utcnow().isoformat(),
        }
        self.user_info[websocket] = user_data
        self.active_users[project_key].append(user_data)

        logger.info(
            f"Client {user_email or 'Anonymous'} connected to project {project_key}. "
            f"Total connections: {len(self.active_connections[project_key])}"
        )

        # Broadcast updated user list to all clients
        await self._broadcast_user_list(client_name, app_name, project_name)
    
    async def disconnect(self, websocket: WebSocket, client_name: str, app_name: str, project_name: str):
        """Remove a WebSocket connection."""
        project_key = self._get_project_key(client_name, app_name, project_name)
        self.active_connections[project_key].discard(websocket)

        # Detach from session registry but keep session alive for potential resumption
        self.detach_session(websocket)

        # Remove user info
        user_data = self.user_info.pop(websocket, None)
        if user_data and project_key in self.active_users:
            # Remove user from active users list
            self.active_users[project_key] = [
                u for u in self.active_users[project_key]
                if u.get("client_id") != user_data.get("client_id")
            ]
        
        # Clean up empty project rooms
        if not self.active_connections[project_key]:
            del self.active_connections[project_key]
            
            # Cancel pending save task if no more connections
            if project_key in self.save_tasks:
                self.save_tasks[project_key].cancel()
                del self.save_tasks[project_key]
            
            # Clear pending state
            if project_key in self.pending_states:
                del self.pending_states[project_key]
            
            # Clear active users
            if project_key in self.active_users:
                del self.active_users[project_key]
        else:
            # Broadcast updated user list to remaining clients
            await self._broadcast_user_list(client_name, app_name, project_name)
        
        logger.info(
            f"Client {user_data.get('email', 'Unknown') if user_data else 'Unknown'} disconnected from project {project_key}. "
            f"Remaining connections: {len(self.active_connections.get(project_key, set()))}"
        )
    
    async def _broadcast_user_list(self, client_name: str, app_name: str, project_name: str):
        """Broadcast updated user list to all clients in a project."""
        project_key = self._get_project_key(client_name, app_name, project_name)
        users = self.active_users.get(project_key, [])
        
        message = {
            "type": "user_list_update",
            "payload": {
                "users": users,
                "count": len(users),
            },
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        await self.broadcast(message, client_name, app_name, project_name)
    
    async def broadcast(
        self,
        message: dict,
        client_name: str,
        app_name: str,
        project_name: str,
        exclude: WebSocket | None = None
    ):
        """Broadcast message to all clients in a project room except the sender."""
        project_key = self._get_project_key(client_name, app_name, project_name)
        connections = self.active_connections.get(project_key, set())
        if not connections:
            return

        # Work on a snapshot to avoid RuntimeError when the set mutates during iteration
        connections_snapshot = list(connections)

        # Remove disconnected clients
        disconnected = set()
        for connection in connections_snapshot:
            if connection.client_state == WebSocketState.DISCONNECTED:
                disconnected.add(connection)

        for connection in disconnected:
            connections.discard(connection)

        # Broadcast to active connections
        for connection in connections_snapshot:
            if connection != exclude and connection.client_state == WebSocketState.CONNECTED:
                try:
                    await self.send_to_websocket(connection, message)
                except Exception as e:
                    logger.error(f"Error broadcasting to client: {e}")
                    disconnected.add(connection)

        # Clean up disconnected clients
        for connection in disconnected:
            connections.discard(connection)
    
    async def _debounced_save(
        self,
        client_name: str,
        app_name: str,
        project_name: str,
        state_data: dict
    ):
        """Save state to MongoDB after debounce delay."""
        project_key = self._get_project_key(client_name, app_name, project_name)
        
        try:
            # Wait for debounce delay
            await asyncio.sleep(self.debounce_delay)
            
            # Check if we still have the latest state
            if project_key in self.pending_states:
                latest_state = self.pending_states[project_key]
                
                logger.info(
                    f"💾 Persisting state for project {project_key} "
                    f"(cards: {len(latest_state.get('cards', []))})"
                )
                
                # Save to MongoDB
                result = await save_atom_list_configuration(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    atom_config_data={
                        "cards": latest_state.get("cards", []),
                        "workflow_molecules": latest_state.get("workflow_molecules", []),
                        "auxiliaryMenuLeftOpen": latest_state.get("auxiliaryMenuLeftOpen", True),
                        "mode": "laboratory",
                    }
                )
                
                if result.get("status") == "success":
                    logger.info(
                        f"✅ Successfully persisted state for project {project_key} "
                        f"({result.get('documents_inserted', 0)} documents)"
                    )
                else:
                    logger.error(
                        f"❌ Failed to persist state for project {project_key}: "
                        f"{result.get('error', 'Unknown error')}"
                    )
                
                # Clear pending state after successful save
                if project_key in self.pending_states:
                    del self.pending_states[project_key]
        
        except asyncio.CancelledError:
            logger.info(f"Save task cancelled for project {project_key}")
        except Exception as e:
            logger.error(f"Error saving state for project {project_key}: {e}")
        finally:
            # Clean up task reference
            if project_key in self.save_tasks:
                del self.save_tasks[project_key]
    
    async def handle_state_update(
        self,
        websocket: WebSocket,
        client_name: str,
        app_name: str,
        project_name: str,
        message: dict
    ):
        """Handle state update from a client."""
        project_key = self._get_project_key(client_name, app_name, project_name)

        # Store pending state
        if message.get("payload"):
            payload = message["payload"]
            if isinstance(payload, dict) and "cards" in payload:
                payload["cards"] = _dedupe_cards(payload.get("cards", []))
                message["payload"] = payload
            self.pending_states[project_key] = message["payload"]
        
        # Cancel existing save task
        if project_key in self.save_tasks:
            self.save_tasks[project_key].cancel()
        
        # Schedule new debounced save
        self.save_tasks[project_key] = asyncio.create_task(
            self._debounced_save(client_name, app_name, project_name, message.get("payload", {}))
        )
        
        # Broadcast to other clients immediately
        await self.broadcast(message, client_name, app_name, project_name, exclude=websocket)
        
        # Send acknowledgment
        ack_message = {
            "type": "ack",
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.send_to_websocket(websocket, ack_message)
    
    async def handle_card_update(
        self,
        websocket: WebSocket,
        client_name: str,
        app_name: str,
        project_name: str,
        message: dict
    ):
        """Handle granular card-level update from a client."""
        project_key = self._get_project_key(client_name, app_name, project_name)
        card_id = message.get("card_id")
        card_payload = message.get("payload")
        
        if not card_id or not card_payload:
            logger.warning(f"Invalid card_update message for project {project_key}")
            return
        
        # Hydrate pending_states from MongoDB if empty (first card update after connection)
        if project_key not in self.pending_states or not self.pending_states[project_key].get("cards"):
            logger.info(f"🔄 Hydrating backend cache for project {project_key} from MongoDB")
            try:
                existing_config = await get_atom_list_configuration(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name
                )
                
                if existing_config and existing_config.get("status") == "success":
                    # Cards are at the top level, not nested under "data"
                    existing_cards = existing_config.get("cards", [])
                    self.pending_states[project_key] = {"cards": existing_cards}
                    logger.info(f"✅ Hydrated {len(existing_cards)} cards from MongoDB for project {project_key}")
                else:
                    self.pending_states[project_key] = {"cards": []}
                    logger.info(f"⚠️ No existing config found, starting with empty state for project {project_key}")
            except Exception as e:
                logger.error(f"❌ Error hydrating cache for project {project_key}: {e}")
                self.pending_states[project_key] = {"cards": []}
        
        current_state = self.pending_states[project_key]
        cards = current_state.get("cards", [])
        
        # Find and update the card, or append if new
        card_found = False
        for i, card in enumerate(cards):
            if card.get("id") == card_id:
                cards[i] = card_payload
                card_found = True
                break
        
        if not card_found:
            cards.append(card_payload)

        current_state["cards"] = _dedupe_cards(cards)
        self.pending_states[project_key] = current_state

        # Cancel existing save task
        if project_key in self.save_tasks:
            self.save_tasks[project_key].cancel()
        
        # Schedule new debounced save
        self.save_tasks[project_key] = asyncio.create_task(
            self._debounced_save(client_name, app_name, project_name, current_state)
        )
        
        # Broadcast card update to other clients immediately
        await self.broadcast(message, client_name, app_name, project_name, exclude=websocket)
        
        # Send acknowledgment
        ack_message = {
            "type": "ack",
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.send_to_websocket(websocket, ack_message)
    
    async def handle_full_sync(
        self,
        websocket: WebSocket,
        client_name: str,
        app_name: str,
        project_name: str,
        message: dict
    ):
        """Handle full sync from a client."""
        project_key = self._get_project_key(client_name, app_name, project_name)

        logger.info(f"📡 Full sync received for project {project_key}")

        payload = message.get("payload") or {}
        if isinstance(payload, dict) and "cards" in payload:
            payload["cards"] = _dedupe_cards(payload.get("cards", []))
            message["payload"] = payload

        # Store pending state
        if message.get("payload"):
            self.pending_states[project_key] = message["payload"]
        
        # Cancel existing save task
        if project_key in self.save_tasks:
            self.save_tasks[project_key].cancel()
        
        # Schedule new debounced save
        self.save_tasks[project_key] = asyncio.create_task(
            self._debounced_save(client_name, app_name, project_name, message.get("payload", {}))
        )
        
        # Broadcast to other clients
        await self.broadcast(message, client_name, app_name, project_name, exclude=websocket)
        
        # Send acknowledgment
        ack_message = {
            "type": "ack",
            "timestamp": datetime.utcnow().isoformat(),
        }
        await self.send_to_websocket(websocket, ack_message)


# Global connection manager instance
manager = ConnectionManager()


async def handle_laboratory_sync(
    websocket: WebSocket,
    client_name: str,
    app_name: str,
    project_name: str
):
    """
    WebSocket endpoint handler for laboratory synchronization.

    Manages real-time collaborative editing for a specific project.
    """
    requested_session_id = websocket.query_params.get("session_id") or str(uuid4())
    resume_requested = websocket.query_params.get("resume", "false").lower() in {"1", "true", "yes"}

    existing_session = manager.sessions.get(requested_session_id)
    if existing_session and existing_session.status == "closed":
        await websocket.close(code=4001, reason="invalid session")
        return

    try:
        await manager.connect(
            websocket,
            client_name,
            app_name,
            project_name,
            session_id=requested_session_id,
            allow_replace=resume_requested,
        )
    except WebSocketDisconnect:
        return

    session = manager.sessions.get(requested_session_id)
    heartbeat_task = asyncio.create_task(manager.heartbeat_loop(session)) if session else None

    await manager.send_to_websocket(
        websocket,
        {
            "type": "session_ack",
            "session_id": requested_session_id,
            "status": "ready",
            "created_at": session.created_at.isoformat() if session else datetime.utcnow().isoformat(),
        },
        buffer=False,
    )

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            message_type = message.get("type")

            if session:
                session.record_activity()

            if message_type == "connect":
                user_email = message.get("user_email")
                user_name = message.get("user_name")
                client_id = message.get("client_id")

                if session and user_email:
                    session.user_id = user_email

                project_key = manager._get_project_key(client_name, app_name, project_name)
                previous_user_data = manager.user_info.get(websocket)
                previous_client_id = previous_user_data.get("client_id") if previous_user_data else None
                connected_at = previous_user_data.get("connected_at") if previous_user_data else datetime.utcnow().isoformat()

                user_data = {
                    "email": user_email or "Anonymous",
                    "name": user_name or "Anonymous User",
                    "client_id": client_id or f"client_{id(websocket)}",
                    "connected_at": connected_at,
                }
                manager.user_info[websocket] = user_data

                manager.active_users[project_key] = [
                    u for u in manager.active_users[project_key]
                    if u.get("client_id") not in {
                        user_data.get("client_id"),
                        previous_client_id,
                    }
                ]
                manager.active_users[project_key].append(user_data)

                logger.info(
                    f"Client {user_email or 'Anonymous'} ({client_id}) connected to "
                    f"{client_name}/{app_name}/{project_name}"
                )

                await manager.send_to_websocket(
                    websocket,
                    {
                        "type": "ack",
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )

                await manager._broadcast_user_list(client_name, app_name, project_name)

            elif message_type == "card_update":
                await manager.handle_card_update(
                    websocket, client_name, app_name, project_name, message
                )

            elif message_type == "card_focus":
                project_key = manager._get_project_key(client_name, app_name, project_name)
                card_id = message.get("card_id")
                if card_id:
                    manager.card_editors[project_key][card_id] = {
                        "user_email": message.get("user_email", "Anonymous"),
                        "user_name": message.get("user_name", "Anonymous User"),
                        "client_id": message.get("client_id"),
                    }
                    await manager.broadcast(message, client_name, app_name, project_name, exclude=websocket)

            elif message_type == "card_blur":
                project_key = manager._get_project_key(client_name, app_name, project_name)
                card_id = message.get("card_id")
                if card_id and card_id in manager.card_editors[project_key]:
                    del manager.card_editors[project_key][card_id]
                    await manager.broadcast(message, client_name, app_name, project_name, exclude=websocket)

            elif message_type == "state_update":
                await manager.handle_state_update(
                    websocket, client_name, app_name, project_name, message
                )

            elif message_type == "full_sync":
                await manager.handle_full_sync(
                    websocket, client_name, app_name, project_name, message
                )

            elif message_type == "heartbeat":
                await manager.send_to_websocket(
                    websocket,
                    {
                        "type": "heartbeat",
                        "op": "pong",
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                    buffer=False,
                )
            elif message_type == "resume":
                if not session:
                    continue
                last_acked = int(message.get("last_acked_sequence") or 0)
                session.last_acked_sequence = last_acked
                session.status = "resumed"
                await manager.send_to_websocket(
                    websocket,
                    {
                        "type": "resume_ack",
                        "last_acked_sequence": last_acked,
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                    buffer=False,
                )
                await manager.replay_missed_messages(session, last_acked)
            elif message_type == "close_session":
                await manager.close_session(
                    requested_session_id,
                    code=1000,
                    reason=message.get("reason") or "session ended",
                )
                break
            else:
                logger.warning(f"Unknown message type: {message_type}")

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from {client_name}/{app_name}/{project_name}")
    except Exception as e:
        logger.error(f"Error in WebSocket handler: {e}")
        try:
            await manager.send_to_websocket(
                websocket,
                {
                    "type": "error",
                    "payload": {"message": str(e)},
                    "timestamp": datetime.utcnow().isoformat(),
                },
                buffer=False,
            )
        except:
            pass
    finally:
        await manager.disconnect(websocket, client_name, app_name, project_name)
        if heartbeat_task:
            heartbeat_task.cancel()

