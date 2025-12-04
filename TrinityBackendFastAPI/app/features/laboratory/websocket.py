"""
WebSocket handler for real-time collaborative Laboratory Mode synchronization.

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
from datetime import datetime
from typing import Dict, Set
from collections import defaultdict

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.features.project_state.routes import save_atom_list_configuration, get_atom_list_configuration

logger = logging.getLogger(__name__)
logger.disabled = True  # Disable all logs from laboratory websocket


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
        # Map of project_key -> mode -> last state for debounced persistence
        # CRITICAL FIX: Make pending_states mode-specific to prevent cross-mode contamination
        self.pending_states: Dict[str, Dict[str, dict]] = {}  # project_key -> mode -> state
        # Map of (project_key:mode) -> asyncio Task for debounced save
        # CRITICAL FIX: Make save_tasks mode-specific to prevent cross-mode save conflicts
        self.save_tasks: Dict[str, asyncio.Task] = {}  # Key format: "project_key:mode"
        # Map of WebSocket -> user info (email, name, client_id)
        self.user_info: Dict[WebSocket, dict] = {}
        # Map of WebSocket -> mode (laboratory or laboratory-dashboard)
        self.client_mode: Dict[WebSocket, str] = {}
        # Map of project_key -> list of active users
        self.active_users: Dict[str, list] = defaultdict(list)
        # Map of project_key -> card_id -> editor info (for card focus tracking)
        self.card_editors: Dict[str, Dict[str, dict]] = defaultdict(dict)
        # Debounce delay in seconds (reduced to 1s to prevent race conditions with frontend)
        self.debounce_delay = 1.0
        
    def _get_project_key(self, client_name: str, app_name: str, project_name: str) -> str:
        """Generate unique key for project room."""
        return f"{client_name}:{app_name}:{project_name}"
    
    async def connect(self, websocket: WebSocket, client_name: str, app_name: str, project_name: str, user_email: str = None, user_name: str = None, client_id: str = None):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        project_key = self._get_project_key(client_name, app_name, project_name)
        self.active_connections[project_key].add(websocket)
        
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
        
        # Remove user info and mode
        user_data = self.user_info.pop(websocket, None)
        self.client_mode.pop(websocket, None)
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
        exclude: WebSocket | None = None,
        mode: str | None = None
    ):
        """
        Broadcast message to all clients in a project room except the sender.
        If mode is provided, only broadcast to clients in the same mode.
        """
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

        # Broadcast to active connections (filtered by mode if provided)
        message_json = json.dumps(message)
        for connection in connections_snapshot:
            if connection == exclude:
                continue
                
            if connection.client_state != WebSocketState.CONNECTED:
                continue
            
            # CRITICAL FIX: Filter by mode to prevent cross-mode contamination
            if mode:
                connection_mode = self.client_mode.get(connection)
                if connection_mode != mode:
                    # Skip clients in different mode
                    continue
            
            try:
                await connection.send_text(message_json)
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
            
            # CRITICAL FIX: Get state for the specific mode from state_data
            state_mode = state_data.get("mode", "laboratory") if isinstance(state_data, dict) else "laboratory"
            if state_mode not in ["laboratory", "laboratory-dashboard"]:
                state_mode = "laboratory"  # Fallback
            
            # Check if we still have the latest state for this mode
            if project_key in self.pending_states and state_mode in self.pending_states[project_key]:
                latest_state = self.pending_states[project_key][state_mode]
                
                logger.info(
                    f"💾 Persisting state for project {project_key} mode {state_mode} "
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
                        "mode": state_mode,
                    }
                )
                
                if result.get("status") == "success":
                    logger.info(
                        f"✅ Successfully persisted state for project {project_key} mode {state_mode} "
                        f"({result.get('documents_inserted', 0)} documents)"
                    )
                else:
                    logger.error(
                        f"❌ Failed to persist state for project {project_key} mode {state_mode}: "
                        f"{result.get('error', 'Unknown error')}"
                    )
                
                # Clear pending state for this mode after successful save
                if project_key in self.pending_states and state_mode in self.pending_states[project_key]:
                    del self.pending_states[project_key][state_mode]
                    # Clean up empty mode dict
                    if not self.pending_states[project_key]:
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

        # Store pending state (mode-specific)
        if message.get("payload"):
            payload = message["payload"]
            if isinstance(payload, dict) and "cards" in payload:
                payload["cards"] = _dedupe_cards(payload.get("cards", []))
                message["payload"] = payload
            
            # CRITICAL FIX: Store state per mode to prevent cross-mode contamination
            state_mode = payload.get("mode", "laboratory") if isinstance(payload, dict) else "laboratory"
            if state_mode not in ["laboratory", "laboratory-dashboard"]:
                state_mode = "laboratory"  # Fallback
            
            if project_key not in self.pending_states:
                self.pending_states[project_key] = {}
            self.pending_states[project_key][state_mode] = payload
        
        # Cancel existing save task (mode-specific)
        save_task_key = f"{project_key}:{state_mode}" if 'state_mode' in locals() else project_key
        if save_task_key in self.save_tasks:
            self.save_tasks[save_task_key].cancel()
        
        # Schedule new debounced save
        payload = message.get("payload", {})
        state_mode = payload.get("mode", "laboratory") if isinstance(payload, dict) else "laboratory"
        if state_mode not in ["laboratory", "laboratory-dashboard"]:
            state_mode = "laboratory"
        save_task_key = f"{project_key}:{state_mode}"
        self.save_tasks[save_task_key] = asyncio.create_task(
            self._debounced_save(client_name, app_name, project_name, payload)
        )
        
        # Extract mode from payload for mode-specific broadcasting
        payload_mode = state_mode if 'state_mode' in locals() else None
        
        # Broadcast to other clients immediately (only to same mode)
        await self.broadcast(message, client_name, app_name, project_name, exclude=websocket, mode=payload_mode)
        
        # Send acknowledgment
        ack_message = {
            "type": "ack",
            "timestamp": datetime.utcnow().isoformat(),
        }
        await websocket.send_json(ack_message)
    
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
        
        # CRITICAL FIX: Get client mode for mode-specific state handling
        client_mode_value = self.client_mode.get(websocket, "laboratory")
        
        # Hydrate pending_states from MongoDB if empty for this mode (first card update after connection)
        if project_key not in self.pending_states or client_mode_value not in self.pending_states[project_key] or not self.pending_states[project_key][client_mode_value].get("cards"):
            logger.info(f"🔄 Hydrating backend cache for project {project_key} mode {client_mode_value} from MongoDB")
            try:
                existing_config = await get_atom_list_configuration(
                    client_name=client_name,
                    app_name=app_name,
                    project_name=project_name,
                    mode=client_mode_value
                )
                
                if existing_config and existing_config.get("status") == "success":
                    # Cards are at the top level, not nested under "data"
                    existing_cards = existing_config.get("cards", [])
                    if project_key not in self.pending_states:
                        self.pending_states[project_key] = {}
                    self.pending_states[project_key][client_mode_value] = {"cards": existing_cards, "mode": client_mode_value}
                    logger.info(f"✅ Hydrated {len(existing_cards)} cards from MongoDB for project {project_key} mode {client_mode_value}")
                else:
                    if project_key not in self.pending_states:
                        self.pending_states[project_key] = {}
                    self.pending_states[project_key][client_mode_value] = {"cards": [], "mode": client_mode_value}
                    logger.info(f"⚠️ No existing config found, starting with empty state for project {project_key} mode {client_mode_value}")
            except Exception as e:
                logger.error(f"❌ Error hydrating cache for project {project_key} mode {client_mode_value}: {e}")
                if project_key not in self.pending_states:
                    self.pending_states[project_key] = {}
                self.pending_states[project_key][client_mode_value] = {"cards": [], "mode": client_mode_value}
        
        # Get state for this specific mode
        if project_key not in self.pending_states or client_mode_value not in self.pending_states[project_key]:
            if project_key not in self.pending_states:
                self.pending_states[project_key] = {}
            self.pending_states[project_key][client_mode_value] = {"cards": [], "mode": client_mode_value}
        
        current_state = self.pending_states[project_key][client_mode_value]
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
        # Ensure mode is set in state
        if "mode" not in current_state:
            current_state["mode"] = client_mode_value
        
        # Store in mode-specific pending states
        if project_key not in self.pending_states:
            self.pending_states[project_key] = {}
        self.pending_states[project_key][client_mode_value] = current_state

        # Cancel existing save task
        if project_key in self.save_tasks:
            self.save_tasks[project_key].cancel()
        
        # Schedule new debounced save
        self.save_tasks[project_key] = asyncio.create_task(
            self._debounced_save(client_name, app_name, project_name, current_state)
        )
        
        # Get mode from current state for mode-specific broadcasting
        broadcast_mode = None
        if isinstance(current_state, dict):
            broadcast_mode = current_state.get("mode")
        # If not in state, get from sender's mode
        if not broadcast_mode:
            broadcast_mode = self.client_mode.get(websocket)
        
        # Broadcast card update to other clients immediately (only to same mode)
        await self.broadcast(message, client_name, app_name, project_name, exclude=websocket, mode=broadcast_mode)
        
        # Send acknowledgment
        ack_message = {
            "type": "ack",
            "timestamp": datetime.utcnow().isoformat(),
        }
        await websocket.send_json(ack_message)
    
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

        # Store pending state (mode-specific)
        payload = message.get("payload", {})
        state_mode = "laboratory"  # Default
        
        if payload:
            # CRITICAL FIX: Extract mode and store state per mode
            state_mode = payload.get("mode", "laboratory") if isinstance(payload, dict) else "laboratory"
            if state_mode not in ["laboratory", "laboratory-dashboard"]:
                state_mode = "laboratory"  # Fallback
            
            if project_key not in self.pending_states:
                self.pending_states[project_key] = {}
            self.pending_states[project_key][state_mode] = payload
        
        # Cancel existing save task (mode-specific key)
        save_task_key = f"{project_key}:{state_mode}"
        if save_task_key in self.save_tasks:
            self.save_tasks[save_task_key].cancel()
        
        # Schedule new debounced save with mode-specific key
        self.save_tasks[save_task_key] = asyncio.create_task(
            self._debounced_save(client_name, app_name, project_name, payload)
        )
        
        # Broadcast to other clients (only to same mode)
        await self.broadcast(message, client_name, app_name, project_name, exclude=websocket, mode=state_mode)
        
        # Send acknowledgment
        ack_message = {
            "type": "ack",
            "timestamp": datetime.utcnow().isoformat(),
        }
        await websocket.send_json(ack_message)


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
    # Initial connection without user info
    await manager.connect(websocket, client_name, app_name, project_name)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            
            if message_type == "connect":
                # Update connection with user info and mode
                user_email = message.get("user_email")
                user_name = message.get("user_name")
                client_id = message.get("client_id")
                project_context = message.get("project_context", {})
                
                # CRITICAL FIX: Extract mode from project context or payload
                # Mode can be in payload.mode or we need to infer from subMode in frontend
                # For now, we'll track it when state updates come in, but set default here
                payload = message.get("payload", {})
                mode = payload.get("mode") if isinstance(payload, dict) else None
                if not mode:
                    # Default to laboratory (analytics) mode
                    mode = "laboratory"
                
                # Update user info
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
                # CRITICAL FIX: Track client mode for filtering broadcasts
                manager.client_mode[websocket] = mode
                
                # Update active users list
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
                
                # Send acknowledgment
                await websocket.send_json({
                    "type": "ack",
                    "timestamp": datetime.utcnow().isoformat(),
                })
                
                # Broadcast updated user list
                await manager._broadcast_user_list(client_name, app_name, project_name)
            
            elif message_type == "card_update":
                # CRITICAL FIX: Update client mode from pending state if available
                project_key = manager._get_project_key(client_name, app_name, project_name)
                if project_key in manager.pending_states:
                    state_mode = manager.pending_states[project_key].get("mode")
                    if state_mode:
                        manager.client_mode[websocket] = state_mode
                
                # Handle granular card-level update
                await manager.handle_card_update(
                    websocket, client_name, app_name, project_name, message
                )
            
            elif message_type == "card_focus":
                # Handle user focusing on a card
                project_key = manager._get_project_key(client_name, app_name, project_name)
                card_id = message.get("card_id")
                if card_id:
                    manager.card_editors[project_key][card_id] = {
                        "user_email": message.get("user_email", "Anonymous"),
                        "user_name": message.get("user_name", "Anonymous User"),
                        "client_id": message.get("client_id"),
                    }
                    # Broadcast focus event to other clients
                    await manager.broadcast(message, client_name, app_name, project_name, exclude=websocket)
            
            elif message_type == "card_blur":
                # Handle user unfocusing from a card
                project_key = manager._get_project_key(client_name, app_name, project_name)
                card_id = message.get("card_id")
                if card_id and card_id in manager.card_editors[project_key]:
                    del manager.card_editors[project_key][card_id]
                    # Broadcast blur event to other clients
                    await manager.broadcast(message, client_name, app_name, project_name, exclude=websocket)
            
            elif message_type == "state_update":
                # CRITICAL FIX: Update client mode from payload if present
                payload = message.get("payload", {})
                if isinstance(payload, dict) and "mode" in payload:
                    manager.client_mode[websocket] = payload["mode"]
                
                # Handle incremental state update
                await manager.handle_state_update(
                    websocket, client_name, app_name, project_name, message
                )
            
            elif message_type == "full_sync":
                # CRITICAL FIX: Update client mode from payload if present
                payload = message.get("payload", {})
                if isinstance(payload, dict) and "mode" in payload:
                    manager.client_mode[websocket] = payload["mode"]
                
                # Handle full state synchronization
                await manager.handle_full_sync(
                    websocket, client_name, app_name, project_name, message
                )
            
            elif message_type == "heartbeat":
                # Respond to heartbeat
                await websocket.send_json({
                    "type": "heartbeat",
                    "timestamp": datetime.utcnow().isoformat(),
                })
            
            else:
                logger.warning(f"Unknown message type: {message_type}")
    
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from {client_name}/{app_name}/{project_name}")
    except Exception as e:
        logger.error(f"Error in WebSocket handler: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "payload": {"message": str(e)},
                "timestamp": datetime.utcnow().isoformat(),
            })
        except:
            pass
    finally:
        await manager.disconnect(websocket, client_name, app_name, project_name)

