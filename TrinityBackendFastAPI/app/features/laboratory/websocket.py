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
        message_json = json.dumps(message)
        for connection in connections_snapshot:
            if connection != exclude and connection.client_state == WebSocketState.CONNECTED:
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
        
        current_state["cards"] = cards
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
                # Update connection with user info
                user_email = message.get("user_email")
                user_name = message.get("user_name")
                client_id = message.get("client_id")
                
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
                # Handle incremental state update
                await manager.handle_state_update(
                    websocket, client_name, app_name, project_name, message
                )
            
            elif message_type == "full_sync":
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

