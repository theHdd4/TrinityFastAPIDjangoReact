"""
ai_logic_workflow.py - AI Logic for Workflow Generation

Handles prompt building, LLM calling, and JSON extraction
"""

import json
import logging
import requests
import re
from typing import Dict, Any, List
from atom_mapping import detect_atom_from_prompt, get_atom_info, ATOM_MAPPING

logger = logging.getLogger("smart.workflow.ai")


def build_workflow_prompt(user_prompt: str, files_with_columns: Dict[str, Any], 
                          conversation_history: List[Dict] = None, file_context: Dict[str, Any] = None) -> str:
    """
    Build prompt for workflow generation with file context
    
    Args:
        user_prompt: User's request
        files_with_columns: Dict of files with their columns
        conversation_history: Previous conversation for context
        file_context: Dict of mentioned files with detailed context (from @filename parsing)
        
    Returns:
        Complete prompt string
    """
    
    # Build mentioned files context (from @filename parsing)
    # Use FileHandler's enhanced formatting for rich statistical context
    mentioned_files_context = ""
    if file_context:
        try:
            from File_handler.available_minio_files import get_file_handler
            file_handler = get_file_handler(
                minio_endpoint=None,  # Will use existing instance
                minio_access_key=None,
                minio_secret_key=None,
                minio_bucket=None
            )
            logger.info(f"🔍 Using FileHandler's enhanced formatting for {len(file_context)} files")
            mentioned_files_context = file_handler.format_file_context_for_llm(file_context)
            logger.info(f"✅ Enhanced file context formatted ({len(mentioned_files_context)} chars)")
        except Exception as e:
            # Fallback to basic formatting if FileHandler not available
            logger.warning(f"⚠️ FileHandler formatting failed, using basic format: {e}")
            mentioned_files_context = "\n\n--- MENTIONED FILES CONTEXT (@filename) ---\n"
            for filename, context in file_context.items():
                if "error" in context:
                    mentioned_files_context += f"\n❌ {filename}: {context['error']}\n"
                    continue
                
                mentioned_files_context += f"\n📄 {filename}:\n"
                columns = context.get('columns', [])
                mentioned_files_context += f"   Columns ({len(columns)}): {', '.join(columns)}\n"
                
                if context.get('data_types'):
                    mentioned_files_context += "   Data Types:\n"
                    for col, dtype in context['data_types'].items():
                        mentioned_files_context += f"      - {col}: {dtype}\n"
                
                if context.get('row_count'):
                    mentioned_files_context += f"   Rows: {context['row_count']:,}\n"
    
    # Build available files context
    available_files_context = ""
    if files_with_columns:
        available_files_context = f"\n\nAVAILABLE FILES ({len(files_with_columns)} total):\n"
        for i, (filename, info) in enumerate(list(files_with_columns.items())[:15], 1):
            columns = info.get('columns', [])
            # Clean filename (remove path prefix)
            clean_name = filename.split('/')[-1]
            available_files_context += f"\n{i}. {clean_name}"
            if columns:
                available_files_context += f" ({len(columns)} columns: {', '.join(columns[:5])}"
                if len(columns) > 5:
                    available_files_context += f" + {len(columns)-5} more"
                available_files_context += ")"
        
        if len(files_with_columns) > 15:
            available_files_context += f"\n... and {len(files_with_columns) - 15} more files"
    
    # Build conversation context
    history_context = ""
    if conversation_history and len(conversation_history) > 0:
        history_context = "\n\nPREVIOUS CONVERSATION:\n"
        for msg in conversation_history[-4:]:  # Last 4 messages
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            history_context += f"{role.upper()}: {content[:100]}\n"
    
    # Build the prompt using few-shot learning
    prompt = f"""Generate a workflow JSON for this data science request.

USER REQUEST: "{user_prompt}"{mentioned_files_context}{available_files_context}{history_context}

WORKFLOW STRUCTURE (exactly 3 steps):

Step 1 - CARD_CREATION:
- Create EMPTY laboratory card (no atom yet - will be added in Step 2)
- endpoint: /api/laboratory/cards
- payload: {{"source": "ai", "llm": "deepseek-r1:32b"}}
- NOTE: Do NOT include atomId - card should be empty

Step 2 - FETCH_ATOM:
- Fetch the atom using chat endpoint
- endpoint: /trinityai/chat (MUST BE /trinityai/chat, NOT /api/chat)
- prompt: "Original user prompt here"
- agent: "fetch_atom"

Step 3 - AGENT_EXECUTION:
- Execute the specific agent
- endpoint: /trinityai/<agent_endpoint>
- prompt: ONLY "Original user prompt: {user_prompt}. Task: <specific_task>"
- IMPORTANT: Do NOT include file details, column names, or available files list in this prompt
- The agent will load files automatically, keep the prompt clean and concise

AVAILABLE AGENTS:
• merge → /trinityai/merge (join datasets on common columns)
• concat → /trinityai/concat (stack datasets vertically/horizontally)
• chart-maker → /trinityai/chart-maker (create charts and visualizations)
• groupby-wtg-avg → /trinityai/groupby (group and aggregate data)
• explore → /trinityai/explore (explore and analyze datasets)
• dataframe-operations → /trinityai/dataframe-operations (DataFrame operations)
• create-and-transform-features → /trinityai/create-transform (transform data columns)

EXAMPLES:

USER: "merge files uk_mayo and uk_beans"
WORKFLOW: {{"workflow": [{{"step": 1, "action": "CARD_CREATION", "prompt": "Create empty laboratory card", "endpoint": "/api/laboratory/cards", "depends_on": null, "payload": {{"source": "ai", "llm": "deepseek-r1:32b"}}}}, {{"step": 2, "action": "FETCH_ATOM", "agent": "fetch_atom", "prompt": "merge files uk_mayo and uk_beans", "endpoint": "/trinityai/chat", "depends_on": 1}}, {{"step": 3, "action": "AGENT_EXECUTION", "agent": "merge", "prompt": "merge files uk_mayo and uk_beans", "endpoint": "/trinityai/merge", "depends_on": 2}}], "is_data_science": true, "total_steps": 3, "original_prompt": "merge files uk_mayo and uk_beans"}}

USER: "create a chart from sales data"
WORKFLOW: {{"workflow": [{{"step": 1, "action": "CARD_CREATION", "prompt": "Create empty laboratory card", "endpoint": "/api/laboratory/cards", "depends_on": null, "payload": {{"source": "ai", "llm": "deepseek-r1:32b"}}}}, {{"step": 2, "action": "FETCH_ATOM", "agent": "fetch_atom", "prompt": "create a chart from sales data", "endpoint": "/trinityai/chat", "depends_on": 1}}, {{"step": 3, "action": "AGENT_EXECUTION", "agent": "chart-maker", "prompt": "create a chart from sales data", "endpoint": "/trinityai/chart-maker", "depends_on": 2}}], "is_data_science": true, "total_steps": 3, "original_prompt": "create a chart from sales data"}}

Now generate ONLY the JSON for: "{user_prompt}"

Return ONLY valid JSON. No explanations."""
    
    return prompt


def call_workflow_llm(api_url: str, model_name: str, prompt: str, bearer_token: str) -> str:
    """
    Call LLM API to generate workflow
    
    Args:
        api_url: LLM API URL
        model_name: Model name
        prompt: Complete prompt
        bearer_token: Bearer token for auth
        
    Returns:
        Raw LLM response string
    """
    
    messages = [
        {
            "role": "system",
            "content": "You are a workflow JSON generator. You respond with ONLY valid JSON objects. No explanations, no markdown, no thinking tags. Just pure JSON."
        },
        {
            "role": "user",
            "content": prompt
        }
    ]
    
    payload = {
        "model": model_name,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 2000,
            "top_p": 0.9,
            "top_k": 40
        },
        "format": "json"
    }
    
    logger.info(f"📤 Calling LLM: {api_url}")
    logger.info(f"🤖 Model: {model_name}")
    logger.info(f"\n📦 REQUEST PAYLOAD:")
    logger.info("="*80)
    logger.info(json.dumps(payload, indent=2))
    logger.info("="*80)
    
    try:
        response = requests.post(
            api_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=120
        )
        
        logger.info(f"📥 Response: HTTP {response.status_code}")
        
        if response.status_code != 200:
            logger.error(f"❌ HTTP Error: {response.status_code}")
            logger.error(f"Response: {response.text}")
            return ""
        
        result = response.json()
        
        logger.info(f"\n📄 COMPLETE API RESPONSE:")
        logger.info("="*80)
        logger.info(json.dumps(result, indent=2))
        logger.info("="*80)
        
        if "message" in result and "content" in result["message"]:
            content = result["message"]["content"].strip()
            logger.info(f"\n🎯 EXTRACTED CONTENT:")
            logger.info("="*80)
            logger.info(content)
            logger.info("="*80)
            return content
        
        logger.error("❌ Invalid response format - missing 'message.content'")
        return ""
        
    except Exception as e:
        logger.error(f"❌ LLM call failed: {e}")
        import traceback
        traceback.print_exc()
        return ""


def extract_workflow_json(llm_response: str, original_prompt: str) -> Dict[str, Any]:
    """
    Extract workflow JSON from LLM response
    
    Args:
        llm_response: Raw LLM response
        original_prompt: Original user prompt
        
    Returns:
        Dict with extracted workflow and metadata
    """
    
    logger.info("🔍 Extracting workflow JSON...")
    
    # Check if response starts with JSON
    if not llm_response.strip().startswith('{'):
        logger.warning("❌ LLM response doesn't start with '{' - using fallback")
        return _generate_fallback_workflow(original_prompt)
    
    # Clean the response
    cleaned = llm_response.strip()
    
    # Remove thinking tags
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    
    # Remove markdown
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    
    # Extract JSON
    first_brace = cleaned.find('{')
    last_brace = cleaned.rfind('}')
    
    if first_brace != -1 and last_brace != -1:
        cleaned = cleaned[first_brace:last_brace+1]
    
    # Try to parse
    try:
        workflow_json = json.loads(cleaned)
        logger.info("✅ Successfully parsed workflow JSON")
        
        # Validate structure
        if "workflow" not in workflow_json:
            logger.warning("⚠️ Missing 'workflow' key - using fallback")
            return _generate_fallback_workflow(original_prompt)
        
        workflow_steps = workflow_json["workflow"]
        if not isinstance(workflow_steps, list) or len(workflow_steps) != 3:
            logger.warning(f"⚠️ Invalid workflow structure (expected 3 steps, got {len(workflow_steps)}) - using fallback")
            return _generate_fallback_workflow(original_prompt)
        
        # Extract agent and files
        agent_detected = workflow_steps[0].get("agent", "unknown") if workflow_steps else "unknown"
        files_used = _extract_files_from_prompt(original_prompt)
        
        return {
            "success": True,
            "workflow_json": workflow_json,
            "smart_response": f"I've generated a workflow for your request. The workflow has {len(workflow_steps)} steps and will use the {agent_detected} agent.",
            "message": "Workflow generated successfully",
            "agent_detected": agent_detected,
            "files_used": files_used
        }
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ JSON parsing failed: {e}")
        logger.error(f"Cleaned response: {cleaned[:500]}")
        return _generate_fallback_workflow(original_prompt)


def _generate_fallback_workflow(user_prompt: str) -> Dict[str, Any]:
    """
    Generate fallback workflow using keyword matching
    
    Args:
        user_prompt: User's request
        
    Returns:
        Dict with fallback workflow
    """
    
    logger.info("🔄 Generating fallback workflow...")
    
    # Use the atom_mapping module to detect the correct atom
    atom_info = detect_atom_from_prompt(user_prompt)
    
    agent = atom_info["atomId"]
    endpoint = atom_info["endpoint"]
    task_desc = atom_info["task_desc"]
    
    logger.info(f"📊 Detected agent: {agent}")
    logger.info(f"🌐 Endpoint: {endpoint}")
    logger.info(f"📝 Task: {task_desc}")
    
    workflow_json = {
        "workflow": [
            {
                "step": 1,
                "action": "CARD_CREATION",
                "prompt": "Create empty laboratory card",
                "endpoint": "/api/laboratory/cards",
                "depends_on": None,
                "payload": {
                    "source": "ai",
                    "llm": "deepseek-r1:32b"
                }
            },
            {
                "step": 2,
                "action": "FETCH_ATOM",
                "agent": "fetch_atom",
                "prompt": user_prompt,  # Use original prompt to detect atom
                "endpoint": "/trinityai/chat",
                "depends_on": 1
            },
                {
                    "step": 3,
                    "action": "AGENT_EXECUTION",
                    "agent": agent,
                    "prompt": user_prompt,  # Clean prompt without file details
                    "endpoint": endpoint,
                    "depends_on": 2
                }
        ],
        "is_data_science": True,
        "total_steps": 3,
        "original_prompt": user_prompt,
        "fallback": True
    }
    
    files_used = _extract_files_from_prompt(user_prompt)
    
    logger.info("✅ Fallback workflow generated")
    
    return {
        "success": True,
        "workflow_json": workflow_json,
        "smart_response": f"I've generated a workflow for your request using the {agent} agent. This workflow has 3 steps: card creation, atom fetching, and execution.",
        "message": "Workflow generated using fallback (keyword detection)",
        "agent_detected": agent,
        "files_used": files_used
    }


def _extract_files_from_prompt(prompt: str) -> List[str]:
    """Extract potential file names from prompt"""
    # Simple extraction - look for words that might be file names
    words = prompt.split()
    files = []
    
    for word in words:
        # Remove common punctuation
        clean_word = word.strip('.,!?;:"\'\n')
        # If it looks like a file name (has underscore or contains common file indicators)
        if '_' in clean_word or any(ext in clean_word.lower() for ext in ['.csv', '.xlsx', '.arrow']):
            files.append(clean_word)
    
    return files

