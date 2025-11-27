"""
Database functions for storing agent registry in PostgreSQL trinity_v1_agents table.
Follows the pattern from trinity_v1_atoms table structure.
"""

import logging
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
        logger.warning("asyncpg not available, cannot create trinity_v1_agents table")
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
                    agent_id VARCHAR(100) UNIQUE NOT NULL,
                    name VARCHAR(150) NOT NULL,
                    description TEXT,
                    category VARCHAR(100),
                    tags JSONB DEFAULT '[]'::jsonb,
                    route_count INTEGER DEFAULT 0,
                    routes JSONB DEFAULT '[]'::jsonb,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            # Create index on agent_id for faster lookups
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_trinity_v1_agents_agent_id 
                ON public.trinity_v1_agents(agent_id)
            """)
            
            logger.info("✅ Created trinity_v1_agents table (or it already exists)")
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
    tags: Optional[List[str]] = None
) -> bool:
    """
    Save or update an agent in the trinity_v1_agents table.
    Uses UPSERT pattern (ON CONFLICT UPDATE) to handle re-registrations.
    
    Args:
        agent_id: Agent identifier (e.g., "concat", "merge")
        name: Agent display name
        description: Agent description
        router: FastAPI router instance to extract route metadata
        category: Optional agent category
        tags: Optional list of tags
        
    Returns:
        True if saved successfully, False otherwise
    """
    if asyncpg is None:
        logger.debug("asyncpg not available, skipping PostgreSQL save")
        return False
    
    try:
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
                    route_count, routes, is_active, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                ON CONFLICT (agent_id) DO UPDATE SET
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
                True,  # is_active
            )
            logger.info(f"✅ Saved agent '{agent_id}' to PostgreSQL")
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
    agent_metadata: Optional[Dict[str, Dict[str, Any]]] = None
) -> Dict[str, bool]:
    """
    Sync all in-memory agents to PostgreSQL.
    
    Args:
        agents: Dictionary of agent_id -> router
        agent_metadata: Optional dictionary of agent_id -> metadata (name, description, category, tags)
        
    Returns:
        Dictionary of agent_id -> sync success status
    """
    results = {}
    
    if asyncpg is None:
        logger.warning("asyncpg not available, cannot sync agents to PostgreSQL")
        return {agent_id: False for agent_id in agents.keys()}
    
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
            tags=tags
        )
        results[agent_id] = success
    
    return results

