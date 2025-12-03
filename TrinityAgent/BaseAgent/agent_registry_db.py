"""
Database functions for storing agent registry in PostgreSQL trinity_v1_agents table.
Follows the pattern from trinity_v1_atoms table structure.
"""

import logging
import socket
import os
from typing import Optional, Dict, List, Any
from datetime import datetime
from fastapi import APIRouter

from .db_connection import (
    asyncpg,
    POSTGRES_HOST,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_PORT,
)

logger = logging.getLogger("trinity.agent_registry_db")


def get_host_ip_address() -> str:
    """
    Get the host IP address that can be accessed from other machines.
    Uses multiple strategies to detect the correct IP address.
    PRIORITY: Environment variable HOST_IP > Settings HOST_IP > Socket detection > Hostname resolution
    
    Returns:
        IP address string (defaults to "127.0.0.1" if detection fails)
    """
    # Strategy 1: Use HOST_IP from environment variable (HIGHEST PRIORITY)
    # This is set by docker-compose.yml env_file or directly in environment
    env_ip = os.getenv("HOST_IP")
    if env_ip and env_ip.strip() and env_ip != "127.0.0.1" and env_ip != "localhost":
        logger.info(f"✅ Using HOST_IP from environment variable: {env_ip.strip()}")
        return env_ip.strip()
    
    # Strategy 2: Use HOST_IP from settings (loaded from .env file by Pydantic)
    try:
        from .config import settings
        host_ip = settings.HOST_IP
        if host_ip and host_ip != "127.0.0.1" and host_ip != "localhost":
            logger.info(f"✅ Using HOST_IP from settings: {host_ip}")
            return host_ip
    except Exception as e:
        logger.debug(f"Could not load HOST_IP from settings: {e}")
    
    # Strategy 3: Socket detection (connects to 8.8.8.8 to find local IP)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and ip != "127.0.0.1":
                logger.warning(f"⚠️ Detected IP via socket connection: {ip} (HOST_IP env var not set)")
                return ip
        except Exception:
            s.close()
    except Exception:
        pass
    
    # Strategy 4: Hostname resolution
    try:
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
        if ip and ip != "127.0.0.1":
            logger.warning(f"⚠️ Detected IP via hostname resolution: {ip} (HOST_IP env var not set)")
            return ip
    except Exception:
        pass
    
    # Fallback
    logger.warning("⚠️ Could not detect host IP address, using default 127.0.0.1. "
                  "Set HOST_IP environment variable to specify your IP address.")
    return "127.0.0.1"


def _extract_route_metadata(router: APIRouter) -> List[Dict[str, Any]]:
    """
    Extract route metadata from a FastAPI router.
    
    Args:
        router: FastAPI APIRouter instance
        
    Returns:
        List of route metadata dictionaries
    """
    routes_metadata = []
    if router and hasattr(router, 'routes'):
        for route in router.routes:
            route_info = {}
            if hasattr(route, 'path'):
                route_info['path'] = route.path
            if hasattr(route, 'methods'):
                route_info['methods'] = list(route.methods) if route.methods else []
            if hasattr(route, 'name'):
                route_info['name'] = route.name
            if hasattr(route, 'summary'):
                route_info['summary'] = route.summary
            if route_info:
                routes_metadata.append(route_info)
    return routes_metadata


async def create_trinity_v1_agents_table() -> bool:
    """
    Create the trinity_v1_agents table if it doesn't exist.
    Table structure mirrors trinity_v1_atoms for consistency.
    
    Returns:
        True if table was created or already exists, False on error
    """
    if asyncpg is None:
        logger.debug("asyncpg not available, cannot create trinity_v1_agents table (Django ORM will handle this)")
        return False
    
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            port=int(POSTGRES_PORT),
        )
        try:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS public.trinity_v1_agents (
                    id BIGSERIAL PRIMARY KEY,
                    agent_id VARCHAR(100) NOT NULL,
                    name VARCHAR(150) NOT NULL,
                    description TEXT,
                    category VARCHAR(100),
                    tags JSONB DEFAULT '[]'::jsonb,
                    route_count INTEGER DEFAULT 0,
                    routes JSONB DEFAULT '[]'::jsonb,
                    host_ip VARCHAR(45) NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(agent_id, host_ip)
                )
            """)
            
            # Migrate existing table: add host_ip column if it doesn't exist
            try:
                await conn.execute("""
                    ALTER TABLE public.trinity_v1_agents 
                    ADD COLUMN IF NOT EXISTS host_ip VARCHAR(45) DEFAULT '127.0.0.1' NOT NULL
                """)
            except Exception:
                pass  # Column might already exist or table structure is different
            
            # Migrate: drop old unique constraint on agent_id if it exists, add new one on (agent_id, host_ip)
            try:
                # Check if old unique constraint exists and drop it
                await conn.execute("""
                    DO $$ 
                    BEGIN
                        IF EXISTS (
                            SELECT 1 FROM pg_constraint 
                            WHERE conname = 'trinity_v1_agents_agent_id_key'
                        ) THEN
                            ALTER TABLE public.trinity_v1_agents 
                            DROP CONSTRAINT trinity_v1_agents_agent_id_key;
                        END IF;
                    END $$;
                """)
            except Exception:
                pass  # Constraint might not exist
            
            # Add new unique constraint on (agent_id, host_ip) if it doesn't exist
            try:
                await conn.execute("""
                    DO $$ 
                    BEGIN
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint 
                            WHERE conname = 'trinity_v1_agents_agent_id_host_ip_key'
                        ) THEN
                            ALTER TABLE public.trinity_v1_agents 
                            ADD CONSTRAINT trinity_v1_agents_agent_id_host_ip_key 
                            UNIQUE (agent_id, host_ip);
                        END IF;
                    END $$;
                """)
            except Exception:
                pass  # Constraint might already exist
            
            # Create indexes for faster lookups
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trinity_v1_agents_agent_id 
                ON public.trinity_v1_agents(agent_id)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trinity_v1_agents_host_ip 
                ON public.trinity_v1_agents(host_ip)
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trinity_v1_agents_agent_host 
                ON public.trinity_v1_agents(agent_id, host_ip)
            """)
            
            logger.info("✅ Created/updated trinity_v1_agents table (or it already exists)")
            return True
        finally:
            await conn.close()
    except Exception as e:
        logger.error(f"❌ Failed to create trinity_v1_agents table: {e}", exc_info=True)
        return False


async def save_agent_to_postgres(
    agent_id: str,
    name: str,
    description: str,
    router: APIRouter,
    category: Optional[str] = None,
    tags: Optional[List[str]] = None,
    host_ip: Optional[str] = None
) -> bool:
    """
    Save or update an agent in the trinity_v1_agents table.
    Uses UPSERT pattern (ON CONFLICT UPDATE) to handle re-registrations.
    Now includes host_ip to support multiple machines/dev environments.
    
    Args:
        agent_id: Agent identifier (e.g., "concat", "merge")
        name: Agent display name
        description: Agent description
        router: FastAPI router instance to extract route metadata
        category: Optional agent category
        tags: Optional list of tags
        host_ip: Optional host IP address (auto-detected if not provided)
        
    Returns:
        True if saved successfully, False otherwise
    """
    if asyncpg is None:
        logger.debug("asyncpg not available, skipping PostgreSQL save")
        return False
    
    try:
        # Auto-detect IP if not provided
        if host_ip is None:
            host_ip = get_host_ip_address()
        
        # Extract route metadata
        routes_metadata = _extract_route_metadata(router)
        route_count = len(routes_metadata)
        
        # Ensure table exists
        await create_trinity_v1_agents_table()
        
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            port=int(POSTGRES_PORT),
        )
        try:
            await conn.execute("""
                INSERT INTO public.trinity_v1_agents (
                    agent_id, name, description, category, tags, 
                    route_count, routes, host_ip, is_active, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                ON CONFLICT (agent_id, host_ip) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    category = EXCLUDED.category,
                    tags = EXCLUDED.tags,
                    route_count = EXCLUDED.route_count,
                    routes = EXCLUDED.routes,
                    is_active = EXCLUDED.is_active,
                    updated_at = NOW()
            """,
                agent_id,
                name,
                description,
                category,
                asyncpg.Json(tags or []),
                route_count,
                asyncpg.Json(routes_metadata),
                host_ip,
                True,  # is_active
            )
            logger.info(f"✅ Saved agent '{agent_id}' to PostgreSQL (host_ip: {host_ip})")
            return True
        finally:
            await conn.close()
    except Exception as e:
        logger.warning(f"⚠️ Failed to save agent '{agent_id}' to PostgreSQL: {e}")
        return False


async def get_agent_from_postgres(agent_id: str) -> Optional[Dict[str, Any]]:
    """
    Get agent metadata from PostgreSQL.
    
    Args:
        agent_id: Agent identifier
        
    Returns:
        Agent metadata dictionary or None if not found
    """
    if asyncpg is None:
        return None
    
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            port=int(POSTGRES_PORT),
        )
        try:
            row = await conn.fetchrow("""
                SELECT 
                    id, agent_id, name, description, category, tags,
                    route_count, routes, is_active, created_at, updated_at
                FROM public.trinity_v1_agents
                WHERE agent_id = $1
            """, agent_id)
            
            if row:
                return dict(row)
            return None
        finally:
            await conn.close()
    except Exception as e:
        logger.warning(f"⚠️ Failed to get agent '{agent_id}' from PostgreSQL: {e}")
        return None


async def get_all_agents_from_postgres() -> List[Dict[str, Any]]:
    """
    Get all agents from PostgreSQL.
    
    Returns:
        List of agent metadata dictionaries
    """
    if asyncpg is None:
        return []
    
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            port=int(POSTGRES_PORT),
        )
        try:
            rows = await conn.fetch("""
                SELECT 
                    id, agent_id, name, description, category, tags,
                    route_count, routes, is_active, created_at, updated_at
                FROM public.trinity_v1_agents
                ORDER BY name
            """)
            
            return [dict(row) for row in rows]
        finally:
            await conn.close()
    except Exception as e:
        logger.warning(f"⚠️ Failed to get all agents from PostgreSQL: {e}")
        return []


async def update_agent_status(agent_id: str, is_active: bool) -> bool:
    """
    Update agent availability status in PostgreSQL.
    
    Args:
        agent_id: Agent identifier
        is_active: Whether agent is active
        
    Returns:
        True if updated successfully, False otherwise
    """
    if asyncpg is None:
        return False
    
    try:
        conn = await asyncpg.connect(
            host=POSTGRES_HOST,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            database=POSTGRES_DB,
            port=int(POSTGRES_PORT),
        )
        try:
            result = await conn.execute("""
                UPDATE public.trinity_v1_agents
                SET is_active = $1, updated_at = NOW()
                WHERE agent_id = $2
            """, is_active, agent_id)
            
            if result == "UPDATE 1":
                logger.info(f"✅ Updated agent '{agent_id}' status to is_active={is_active}")
                return True
            else:
                logger.warning(f"⚠️ Agent '{agent_id}' not found for status update")
                return False
        finally:
            await conn.close()
    except Exception as e:
        logger.warning(f"⚠️ Failed to update agent '{agent_id}' status: {e}")
        return False


async def sync_all_agents_to_postgres(
    agents: Dict[str, APIRouter],
    agent_metadata: Optional[Dict[str, Dict[str, Any]]] = None,
    host_ip: Optional[str] = None
) -> Dict[str, bool]:
    """
    Sync all in-memory agents to PostgreSQL.
    Now includes host_ip to support multiple machines/dev environments.
    
    Args:
        agents: Dictionary of agent_id -> router
        agent_metadata: Optional dictionary of agent_id -> metadata (name, description, category, tags)
        host_ip: Optional host IP address (auto-detected if not provided)
        
    Returns:
        Dictionary of agent_id -> sync success status
    """
    results = {}
    
    if asyncpg is None:
        logger.debug("asyncpg not available, cannot sync agents to PostgreSQL (Django ORM will handle this)")
        return {agent_id: False for agent_id in agents.keys()}
    
    # Auto-detect IP if not provided
    if host_ip is None:
        host_ip = get_host_ip_address()
    
    logger.info(f"🔄 Syncing {len(agents)} agents to PostgreSQL (host_ip: {host_ip})")
    
    # Ensure table exists
    await create_trinity_v1_agents_table()
    
    for agent_id, router in agents.items():
        # Get metadata if provided, otherwise use defaults
        metadata = agent_metadata.get(agent_id, {}) if agent_metadata else {}
        name = metadata.get('name', agent_id.replace('_', ' ').title())
        description = metadata.get('description', f"Agent: {agent_id}")
        category = metadata.get('category')
        tags = metadata.get('tags', [])
        
        success = await save_agent_to_postgres(
            agent_id=agent_id,
            name=name,
            description=description,
            router=router,
            category=category,
            tags=tags,
            host_ip=host_ip
        )
        results[agent_id] = success
    
    success_count = sum(1 for v in results.values() if v)
    logger.info(f"✅ Synced {success_count}/{len(results)} agents to PostgreSQL (host_ip: {host_ip})")
    
    return results

