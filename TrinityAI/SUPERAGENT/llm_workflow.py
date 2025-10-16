"""
llm_workflow.py - Workflow Generator Agent with File Loading and Memory

This follows the same pattern as other agents (merge, concat, explore, etc.)
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional

import sys
from pathlib import Path

# Add parent directory to path for file_loader
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

# Add current directory to path for ai_logic_workflow
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from file_loader import FileLoader

# Import from same directory
try:
    from ai_logic_workflow import build_workflow_prompt, call_workflow_llm, extract_workflow_json
except ImportError:
    # Try with SUPERAGENT prefix
    from SUPERAGENT.ai_logic_workflow import build_workflow_prompt, call_workflow_llm, extract_workflow_json

logger = logging.getLogger("smart.workflow")


class SmartWorkflowAgent:
    """
    Intelligent workflow generator that uses LLM to create structured workflows
    with file awareness and session memory
    """
    
    def __init__(self, api_url: str, model_name: str, bearer_token: str, 
                 minio_endpoint: str, access_key: str, secret_key: str, bucket: str, prefix: str):
        logger.info("🤖 Initializing SmartWorkflowAgent...")
        
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.bucket = bucket
        self.prefix = prefix
        self.sessions = {}
        
        # Initialize FileLoader for file awareness
        self.file_loader = FileLoader(
            minio_endpoint=minio_endpoint,
            minio_access_key=access_key,
            minio_secret_key=secret_key,
            minio_bucket=bucket,
            object_prefix=prefix
        )
        
        # Files with columns info
        self.files_with_columns = {}
        self._files_loaded = False
        
        logger.info("✅ SmartWorkflowAgent initialized")
    
    def set_context(self, client_name: str = "", app_name: str = "", project_name: str = "") -> None:
        """Set environment context for dynamic path resolution"""
        if client_name or app_name or project_name:
            if client_name:
                os.environ["CLIENT_NAME"] = client_name
            if app_name:
                os.environ["APP_NAME"] = app_name
            if project_name:
                os.environ["PROJECT_NAME"] = project_name
            logger.info(f"🔧 Context set: {client_name}/{app_name}/{project_name}")
    
    def _ensure_files_loaded(self) -> None:
        """Ensure files are loaded before processing"""
        if not self._files_loaded:
            self._load_files()
            self._files_loaded = True
    
    def _load_files(self) -> None:
        """Load available files from MinIO with their columns"""
        try:
            logger.info("📁 Loading files from MinIO...")
            
            # Use FileLoader to get files with column information
            files_info = self.file_loader.load_files_with_columns()
            
            self.files_with_columns = files_info
            logger.info(f"✅ Loaded {len(files_info)} files with column information")
            
            # Print summary
            for filename, info in list(files_info.items())[:5]:
                columns = info.get('columns', [])
                logger.info(f"  📄 {filename}: {len(columns)} columns")
                
            if len(files_info) > 5:
                logger.info(f"  ... and {len(files_info) - 5} more files")
                
        except Exception as e:
            logger.error(f"❌ Failed to load files: {e}")
            self.files_with_columns = {}
    
    def _get_or_create_session(self, session_id: Optional[str]) -> Dict[str, Any]:
        """Get or create session for memory"""
        if not session_id:
            session_id = str(uuid.uuid4())
        
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "id": session_id,
                "created_at": datetime.now().isoformat(),
                "conversation": [],
                "generated_workflows": []
            }
            logger.info(f"📝 Created new session: {session_id}")
        
        return self.sessions[session_id]
    
    def process_request(self, prompt: str, session_id: Optional[str] = None,
                       client_name: str = "", app_name: str = "", project_name: str = "") -> Dict[str, Any]:
        """
        Process workflow generation request with file awareness and memory
        
        Args:
            prompt: User's request
            session_id: Session ID for memory
            client_name: Client context
            app_name: App context
            project_name: Project context
            
        Returns:
            Dict with workflow JSON and response
        """
        
        logger.info("="*80)
        logger.info("🔄 WORKFLOW GENERATION REQUEST")
        logger.info("="*80)
        logger.info(f"📝 Prompt: {prompt}")
        logger.info(f"🆔 Session: {session_id}")
        logger.info(f"🏢 Context: {client_name}/{app_name}/{project_name}")
        
        try:
            # Set context
            self.set_context(client_name, app_name, project_name)
            
            # Ensure files are loaded
            self._ensure_files_loaded()
            
            # Get or create session
            session = self._get_or_create_session(session_id)
            
            # Get conversation history
            conversation_history = session.get("conversation", [])
            
            logger.info(f"📚 Session has {len(conversation_history)} previous messages")
            logger.info(f"📁 Available files: {len(self.files_with_columns)}")
            
            # Build prompt with file context and history
            logger.info("-"*80)
            logger.info("STEP 1: Building Prompt with File Context")
            logger.info("-"*80)
            
            llm_prompt = build_workflow_prompt(
                user_prompt=prompt,
                files_with_columns=self.files_with_columns,
                conversation_history=conversation_history
            )
            
            logger.info(f"✅ Prompt built ({len(llm_prompt)} characters)")
            logger.info(f"\n📝 EXACT PROMPT:")
            logger.info("="*80)
            logger.info(llm_prompt)
            logger.info("="*80)
            
            # Call LLM
            logger.info("-"*80)
            logger.info("STEP 2: Calling LLM")
            logger.info("-"*80)
            
            llm_response = call_workflow_llm(
                api_url=self.api_url,
                model_name=self.model_name,
                prompt=llm_prompt,
                bearer_token=self.bearer_token
            )
            
            logger.info(f"✅ LLM Response received")
            logger.info(f"\n📄 RAW LLM RESPONSE:")
            logger.info("="*80)
            logger.info(llm_response)
            logger.info("="*80)
            
            # Extract workflow JSON
            logger.info("-"*80)
            logger.info("STEP 3: Extracting Workflow JSON")
            logger.info("-"*80)
            
            workflow_result = extract_workflow_json(llm_response, prompt)
            
            logger.info(f"✅ Workflow extracted")
            logger.info(f"\n🎯 FINAL WORKFLOW:")
            logger.info("="*80)
            logger.info(json.dumps(workflow_result.get('workflow_json', {}), indent=2))
            logger.info("="*80)
            
            # Update session memory
            session["conversation"].append({
                "role": "user",
                "content": prompt,
                "timestamp": datetime.now().isoformat()
            })
            
            session["conversation"].append({
                "role": "assistant",
                "content": workflow_result.get('smart_response', ''),
                "workflow": workflow_result.get('workflow_json', {}),
                "timestamp": datetime.now().isoformat()
            })
            
            if workflow_result.get('success'):
                session["generated_workflows"].append({
                    "prompt": prompt,
                    "workflow": workflow_result.get('workflow_json', {}),
                    "timestamp": datetime.now().isoformat()
                })
            
            # Build result
            result = {
                "success": workflow_result.get('success', False),
                "workflow_json": workflow_result.get('workflow_json', {}),
                "smart_response": workflow_result.get('smart_response', ''),
                "message": workflow_result.get('message', ''),
                "session_id": session_id or session['id'],
                "file_analysis": {
                    "total_files": len(self.files_with_columns),
                    "files_used": workflow_result.get('files_used', []),
                    "agent_detected": workflow_result.get('agent_detected', '')
                }
            }
            
            logger.info("="*80)
            logger.info("✅ WORKFLOW GENERATION COMPLETE")
            logger.info("="*80)
            logger.info(f"Success: {result['success']}")
            logger.info(f"Agent: {result['file_analysis']['agent_detected']}")
            logger.info(f"Files used: {result['file_analysis']['files_used']}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Workflow generation failed: {e}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "error": str(e),
                "smart_response": f"I encountered an error while generating the workflow: {str(e)}. Please try rephrasing your request.",
                "workflow_json": {},
                "session_id": session_id
            }
    
    def get_session_history(self, session_id: str) -> Dict[str, Any]:
        """Get complete session history"""
        session = self.sessions.get(session_id, {})
        return {
            "session_id": session_id,
            "conversation": session.get("conversation", []),
            "generated_workflows": session.get("generated_workflows", []),
            "created_at": session.get("created_at", "")
        }

