"""
Django management command to sync agent registry to PostgreSQL.
This command ensures all registered agents are saved to the trinity_v1_agents table.
"""

import asyncio
import sys
import os
from pathlib import Path
from django.core.management.base import BaseCommand

# Calculate paths more robustly
# File is at: TrinityBackendDjango/apps/trinity_v1_agents/management/commands/sync_agents_to_postgres.py
# Strategy: Try multiple methods to find TrinityAgent
current_path = Path(__file__).resolve()
project_root = None
trinity_agent_path = None

# Method 1: Find project root by looking for TrinityBackendDjango directory
for parent in current_path.parents:
    if parent.name == "TrinityBackendDjango":
        project_root = parent.parent  # Parent of TrinityBackendDjango
        trinity_agent_path = project_root / "TrinityAgent"
        if trinity_agent_path.exists():
            break
        else:
            project_root = None
            trinity_agent_path = None

# Method 2: Check common locations relative to current working directory and Docker paths
if project_root is None or not trinity_agent_path or not trinity_agent_path.exists():
    cwd = Path.cwd()
    # Try common Docker paths and local paths
    possible_paths = [
        Path("/code/TrinityAgent"),  # Docker: /code is common working directory
        Path("/app/TrinityAgent"),  # Another Docker common path
        cwd / "TrinityAgent",  # If running from project root
        cwd.parent / "TrinityAgent",  # If running from TrinityBackendDjango
        cwd.parent.parent / "TrinityAgent",  # If running from subdirectory
        # Also check if we're in /code and look for sibling directories
        Path("/code") / "TrinityAgent" if str(cwd).startswith("/code") else None,
    ]
    
    # Filter out None values
    possible_paths = [p for p in possible_paths if p is not None]
    
    for path in possible_paths:
        if path.exists() and path.is_dir():
            trinity_agent_path = path
            project_root = path.parent
            break

# Method 3: Fallback - use calculated path (6 levels up from this file)
if project_root is None or not trinity_agent_path or not trinity_agent_path.exists():
    calculated_root = current_path.parent.parent.parent.parent.parent.parent
    calculated_agent_path = calculated_root / "TrinityAgent"
    if calculated_agent_path.exists():
        project_root = calculated_root
        trinity_agent_path = calculated_agent_path
    else:
        # Last resort: use calculated path even if it doesn't exist (will fail with better error)
        project_root = calculated_root
        trinity_agent_path = calculated_agent_path

# Add project root to path (so we can import TrinityAgent as a package)
if project_root and str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Also add TrinityAgent directory to path (as fallback for direct imports)
if trinity_agent_path and trinity_agent_path.exists() and str(trinity_agent_path) not in sys.path:
    sys.path.insert(0, str(trinity_agent_path))

AGENT_REGISTRY_AVAILABLE = False
_import_error_msg = None

# Initialize functions as None - will be set if import succeeds
get_all_routers = None
sync_agents_to_postgres_sync = None
initialize_all_agents = None
set_agent_metadata = None
verify_registry_sync_sync = None
get_sync_status = None
create_trinity_v1_agents_table = None

# Try importing as package first (TrinityAgent.agent_registry)
try:
    from TrinityAgent.agent_registry import (
        get_all_routers,
        sync_agents_to_postgres_sync,
        initialize_all_agents,
        set_agent_metadata,
        verify_registry_sync_sync,
        get_sync_status,
    )
    from TrinityAgent.BaseAgent.agent_registry_db import create_trinity_v1_agents_table
    AGENT_REGISTRY_AVAILABLE = True
except ImportError as e1:
    _import_error_msg = str(e1)
    # Try alternative: import from agent_registry directly (if path is set correctly)
    # This works if TrinityAgent directory is in sys.path
    try:
        # Make sure we're importing from the right place
        if trinity_agent_path.exists():
            # Try direct import (agent_registry should be importable if path is correct)
            import importlib
            import sys as sys_module
            
            # Temporarily add to path if not already there
            was_in_path = str(trinity_agent_path) in sys_module.path
            if not was_in_path:
                sys_module.path.insert(0, str(trinity_agent_path))
            
            try:
                from agent_registry import (
                    get_all_routers as _get_all_routers,
                    sync_agents_to_postgres_sync as _sync_agents_to_postgres_sync,
                    initialize_all_agents as _initialize_all_agents,
                    set_agent_metadata as _set_agent_metadata,
                    verify_registry_sync_sync as _verify_registry_sync_sync,
                    get_sync_status as _get_sync_status,
                )
                from BaseAgent.agent_registry_db import create_trinity_v1_agents_table as _create_trinity_v1_agents_table
                # Assign to module-level variables
                get_all_routers = _get_all_routers
                sync_agents_to_postgres_sync = _sync_agents_to_postgres_sync
                initialize_all_agents = _initialize_all_agents
                set_agent_metadata = _set_agent_metadata
                verify_registry_sync_sync = _verify_registry_sync_sync
                get_sync_status = _get_sync_status
                create_trinity_v1_agents_table = _create_trinity_v1_agents_table
                AGENT_REGISTRY_AVAILABLE = True
            finally:
                # Restore path if we added it
                if not was_in_path and str(trinity_agent_path) in sys_module.path:
                    sys_module.path.remove(str(trinity_agent_path))
        else:
            raise ImportError(f"TrinityAgent path does not exist: {trinity_agent_path}")
    except Exception as e2:
        AGENT_REGISTRY_AVAILABLE = False
        _import_error_msg = f"Package import ({e1}) and direct import ({e2}) both failed"

# If initial import failed, try to find TrinityAgent at runtime
def _retry_import_with_path_search():
    """Try to find and import TrinityAgent by searching common paths"""
    global AGENT_REGISTRY_AVAILABLE, _import_error_msg
    global get_all_routers, sync_agents_to_postgres_sync, initialize_all_agents
    global set_agent_metadata, verify_registry_sync_sync, get_sync_status
    global create_trinity_v1_agents_table
    
    if AGENT_REGISTRY_AVAILABLE:
        return True
    
    cwd = Path.cwd()
    # In Docker, /code is TrinityBackendDjango
    # Try multiple possible locations for TrinityAgent
    search_paths = [
        Path("/app/TrinityAgent"),  # Docker: TrinityAgent mounted here (primary location)
        Path("/code/../TrinityAgent"),  # Docker: go up from /code to find TrinityAgent (if parent is accessible)
        Path("/code/TrinityAgent"),  # If TrinityAgent is mounted directly under /code
        cwd / "TrinityAgent",  # If running from project root
        cwd.parent / "TrinityAgent",  # If running from TrinityBackendDjango
        cwd.parent.parent / "TrinityAgent",  # If running from subdirectory
    ]
    
    # Try to resolve paths that might work
    resolved_paths = []
    for path in search_paths:
        try:
            resolved = path.resolve()
            if resolved.exists():
                resolved_paths.append(resolved)
            else:
                resolved_paths.append(path)  # Keep original for checking
        except (OSError, RuntimeError):
            # Can't resolve (e.g., parent not accessible), keep original
            resolved_paths.append(path)
    
    search_paths = resolved_paths
    
    # Also try going up from /code if it exists (might work if parent directory is accessible)
    if Path("/code").exists():
        try:
            # Try to resolve parent (might fail if parent not accessible)
            code_parent = Path("/code").parent
            if code_parent.exists() and code_parent != Path("/"):
                code_parent_agent = code_parent / "TrinityAgent"
                # Avoid duplicates
                if not any(p.resolve() == code_parent_agent.resolve() for p in search_paths if p.exists()):
                    search_paths.append(code_parent_agent)
        except (OSError, PermissionError):
            # Parent directory not accessible, skip
            pass
    
    # Filter out None values
    search_paths = [p for p in search_paths if p is not None]
    
    for search_path in search_paths:
        if search_path.exists() and search_path.is_dir():
            # Add to sys.path
            parent_path = search_path.parent
            if str(parent_path) not in sys.path:
                sys.path.insert(0, str(parent_path))
            if str(search_path) not in sys.path:
                sys.path.insert(0, str(search_path))
            
            # Try import
            try:
                from TrinityAgent.agent_registry import (
                    get_all_routers as _get_all_routers,
                    sync_agents_to_postgres_sync as _sync_agents_to_postgres_sync,
                    initialize_all_agents as _initialize_all_agents,
                    set_agent_metadata as _set_agent_metadata,
                    verify_registry_sync_sync as _verify_registry_sync_sync,
                    get_sync_status as _get_sync_status,
                )
                from TrinityAgent.BaseAgent.agent_registry_db import create_trinity_v1_agents_table as _create_trinity_v1_agents_table
                # Assign to module-level variables
                get_all_routers = _get_all_routers
                sync_agents_to_postgres_sync = _sync_agents_to_postgres_sync
                initialize_all_agents = _initialize_all_agents
                set_agent_metadata = _set_agent_metadata
                verify_registry_sync_sync = _verify_registry_sync_sync
                get_sync_status = _get_sync_status
                create_trinity_v1_agents_table = _create_trinity_v1_agents_table
                AGENT_REGISTRY_AVAILABLE = True
                _import_error_msg = None
                return True
            except ImportError as e:
                continue
    
    return False

# Try one more time with path search at module load
_retry_import_with_path_search()


class Command(BaseCommand):
    help = 'Sync all registered agents to PostgreSQL trinity_v1_agents table'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force re-registration of all agents before syncing',
        )

    def handle(self, *args, **options):
        global AGENT_REGISTRY_AVAILABLE
        # Try one more time to import (in case paths changed)
        if not AGENT_REGISTRY_AVAILABLE:
            self.stdout.write("→ Attempting to locate TrinityAgent...")
            
            # Enhanced path search with better debugging
            cwd = Path.cwd()
            search_paths = [
                Path("/app/TrinityAgent"),  # Docker: TrinityAgent mounted here (primary location)
                Path("/code/../TrinityAgent"),  # Docker: go up from /code
                Path("/code/TrinityAgent"),  # If mounted under /code
                cwd / "TrinityAgent",
                cwd.parent / "TrinityAgent",
            ]
            
            self.stdout.write(f"   Checking paths:")
            found_path = None
            for search_path in search_paths:
                try:
                    resolved = search_path.resolve()
                    exists = resolved.exists() and resolved.is_dir()
                    status = "✅" if exists else "❌"
                    self.stdout.write(f"     {status} {search_path} -> {resolved}")
                    
                    if exists and not found_path:
                        found_path = resolved
                        # Try to add to sys.path and import
                        parent_path = resolved.parent
                        if str(parent_path) not in sys.path:
                            sys.path.insert(0, str(parent_path))
                        if str(resolved) not in sys.path:
                            sys.path.insert(0, str(resolved))
                        
                        # Try import
                        try:
                            from TrinityAgent.agent_registry import (
                                get_all_routers as _get_all_routers,
                                sync_agents_to_postgres_sync as _sync_agents_to_postgres_sync,
                                initialize_all_agents as _initialize_all_agents,
                                set_agent_metadata as _set_agent_metadata,
                                verify_registry_sync_sync as _verify_registry_sync_sync,
                                get_sync_status as _get_sync_status,
                            )
                            from TrinityAgent.BaseAgent.agent_registry_db import create_trinity_v1_agents_table as _create_trinity_v1_agents_table
                            # Assign to module-level variables
                            global get_all_routers, sync_agents_to_postgres_sync, initialize_all_agents
                            global set_agent_metadata, verify_registry_sync_sync, get_sync_status
                            global create_trinity_v1_agents_table
                            get_all_routers = _get_all_routers
                            sync_agents_to_postgres_sync = _sync_agents_to_postgres_sync
                            initialize_all_agents = _initialize_all_agents
                            set_agent_metadata = _set_agent_metadata
                            verify_registry_sync_sync = _verify_registry_sync_sync
                            get_sync_status = _get_sync_status
                            create_trinity_v1_agents_table = _create_trinity_v1_agents_table
                            AGENT_REGISTRY_AVAILABLE = True
                            self.stdout.write(self.style.SUCCESS(f"   ✅ Found and imported TrinityAgent from {resolved}!"))
                            break
                        except ImportError as e:
                            self.stdout.write(f"     ⚠️  Path exists but import failed: {e}")
                except (OSError, RuntimeError) as e:
                    self.stdout.write(f"     ❌ {search_path} (cannot resolve: {e})")
            
            if not AGENT_REGISTRY_AVAILABLE:
                self.stdout.write(self.style.ERROR("❌ Agent registry not available. Check imports."))
                if _import_error_msg:
                    self.stdout.write(self.style.ERROR(f"   Import Error: {_import_error_msg}"))
                self.stdout.write(f"\n   Debug Information:")
                self.stdout.write(f"   - Current file: {Path(__file__).resolve()}")
                self.stdout.write(f"   - Current working directory: {os.getcwd()}")
                self.stdout.write(f"   - Python path (Trinity-related): {[p for p in sys.path if 'Trinity' in p]}")
                self.stdout.write(f"\n   💡 Solution: Ensure TrinityAgent volume is mounted in docker-compose.yml:")
                self.stdout.write(f"      volumes:")
                self.stdout.write(f"        - ./TrinityAgent:/app/TrinityAgent:ro")
                return
        
        self.stdout.write("=" * 80)
        self.stdout.write("SYNCING AGENTS TO POSTGRESQL")
        self.stdout.write("=" * 80)
        
        # Ensure agents are initialized
        if initialize_all_agents is None:
            self.stdout.write(self.style.ERROR("   ❌ initialize_all_agents is not available. Agent registry import failed."))
            return
            
        if options['force']:
            self.stdout.write("→ Re-initializing all agents...")
            try:
                initialize_all_agents()
                self.stdout.write(self.style.SUCCESS("   ✅ Agents re-initialized"))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"   ⚠️  Error re-initializing: {e}"))
                import traceback
                self.stdout.write(traceback.format_exc())
        else:
            self.stdout.write("→ Using existing agent registry...")
        
        # Get all registered agents
        if get_all_routers is None:
            self.stdout.write(self.style.ERROR("   ❌ get_all_routers is not available. Agent registry import failed."))
            return
        
        try:
            routers = get_all_routers()
            self.stdout.write(f"→ Found {len(routers)} registered agents: {list(routers.keys())}")
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"   ❌ Error getting routers: {e}"))
            import traceback
            self.stdout.write(traceback.format_exc())
            return
        
        if not routers:
            self.stdout.write(self.style.WARNING("   ⚠️  No agents found in registry. Try running with --force flag."))
            return
        
        # Set metadata for known agents if not already set
        agent_metadata = {
            "concat": {
                "name": "Concat",
                "description": "Concatenate multiple datasets together",
                "category": "Data Operations",
                "tags": ["concat", "merge", "data", "dataset"]
            },
            "merge": {
                "name": "Merge",
                "description": "Merge datasets based on common columns",
                "category": "Data Operations",
                "tags": ["merge", "join", "data", "dataset"]
            },
            "create_transform": {
                "name": "Create Transform",
                "description": "Create and apply data transformations",
                "category": "Transformations",
                "tags": ["transform", "data", "transformation", "create"]
            },
            "group_by": {
                "name": "Group By",
                "description": "Group data by specific columns and apply aggregation functions",
                "category": "Data Operations",
                "tags": ["group_by", "aggregation", "data", "group", "aggregate"]
            },
            "chart_maker": {
                "name": "Chart Maker",
                "description": "Create charts and visualizations (bar, line, area, pie, scatter) from data files",
                "category": "Visualization",
                "tags": ["chart", "visualization", "graph", "plot", "bar", "line", "pie", "scatter"]
            },
            "dataframe_operations": {
                "name": "DataFrame Operations",
                "description": "Perform DataFrame operations (load, filter, sort, column operations, formulas, save) on data files",
                "category": "Data Operations",
                "tags": ["dataframe", "operations", "filter", "sort", "columns", "formulas", "data", "manipulation"]
            }
        }
        
        if set_agent_metadata is not None:
            for agent_id, metadata in agent_metadata.items():
                if agent_id in routers:
                    try:
                        set_agent_metadata(agent_id, metadata)
                        self.stdout.write(f"   ✅ Set metadata for {agent_id}")
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f"   ⚠️  Error setting metadata for {agent_id}: {e}"))
        
        # Use Django ORM directly instead of asyncpg (more reliable in Django context)
        self.stdout.write("→ Syncing agents to PostgreSQL using Django ORM...")
        try:
            from apps.trinity_v1_agents.models import TrinityV1Agent
            
            # Helper function to extract route metadata
            def extract_routes(router):
                """Extract route metadata from router"""
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
            
            results = {}
            success_count = 0
            total_count = len(routers)
            
            self.stdout.write("=" * 80)
            for agent_id, router in routers.items():
                try:
                    # Get metadata
                    metadata = agent_metadata.get(agent_id, {})
                    name = metadata.get('name', agent_id.replace('_', ' ').title())
                    description = metadata.get('description', f"Agent: {agent_id}")
                    category = metadata.get('category')
                    tags = metadata.get('tags', [])
                    
                    # Extract routes
                    routes_metadata = extract_routes(router)
                    route_count = len(routes_metadata)
                    
                    # Create or update using Django ORM
                    agent, created = TrinityV1Agent.objects.update_or_create(
                        agent_id=agent_id,
                        defaults={
                            'name': name,
                            'description': description,
                            'category': category or '',
                            'tags': tags,
                            'route_count': route_count,
                            'routes': routes_metadata,
                            'is_active': True,
                        }
                    )
                    
                    results[agent_id] = True
                    success_count += 1
                    action = "Created" if created else "Updated"
                    self.stdout.write(self.style.SUCCESS(f"   ✅ {action}: {agent_id} ({route_count} routes)"))
                    
                except Exception as e:
                    results[agent_id] = False
                    self.stdout.write(self.style.ERROR(f"   ❌ Failed: {agent_id} - {e}"))
            
            self.stdout.write("=" * 80)
            
            if success_count == total_count:
                self.stdout.write(
                    self.style.SUCCESS(
                        f"\n✅✅✅ Successfully synced all {success_count} agents to PostgreSQL ✅✅✅"
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"\n⚠️  Synced {success_count}/{total_count} agents to PostgreSQL"
                    )
                )
            
            # Verify sync
            self.stdout.write("\n→ Verifying sync status...")
            try:
                db_agents = set(TrinityV1Agent.objects.values_list('agent_id', flat=True))
                memory_agents = set(routers.keys())
                
                memory_only = memory_agents - db_agents
                db_only = db_agents - memory_agents
                both = memory_agents & db_agents
                
                if len(memory_only) == 0 and len(db_only) == 0:
                    self.stdout.write(self.style.SUCCESS(f"   ✅ Registry is in sync ({len(both)} agents)"))
                else:
                    self.stdout.write(self.style.WARNING("   ⚠️  Registry sync mismatch detected:"))
                    if memory_only:
                        self.stdout.write(f"      Memory only: {list(memory_only)}")
                    if db_only:
                        self.stdout.write(f"      DB only: {list(db_only)}")
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"   ⚠️  Could not verify sync: {e}"))
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\n❌ Error syncing agents: {e}"))
            import traceback
            self.stdout.write(traceback.format_exc())

