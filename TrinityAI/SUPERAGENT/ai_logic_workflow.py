"""
ai_logic_workflow.py - AI Logic for Workflow Generation

Handles prompt building, LLM calling, and JSON extraction
"""

import json
import logging
import requests
import re
from typing import Dict, Any, List

logger = logging.getLogger("smart.workflow.ai")


def build_workflow_prompt(user_prompt: str, files_with_columns: Dict[str, Any], 
                          conversation_history: List[Dict] = None) -> str:
    """
    Build prompt for workflow generation with file context
    
    Args:
        user_prompt: User's request
        files_with_columns: Dict of files with their columns
        conversation_history: Previous conversation for context
        
    Returns:
        Complete prompt string
    """
    
    # Build file context
    file_context = ""
    if files_with_columns:
        file_context = f"\n\nAVAILABLE FILES ({len(files_with_columns)} total):\n"
        for i, (filename, info) in enumerate(list(files_with_columns.items())[:15], 1):
            columns = info.get('columns', [])
            # Clean filename (remove path prefix)
            clean_name = filename.split('/')[-1]
            file_context += f"\n{i}. {clean_name}"
            if columns:
                file_context += f" ({len(columns)} columns: {', '.join(columns[:5])}"
                if len(columns) > 5:
                    file_context += f" + {len(columns)-5} more"
                file_context += ")"
        
        if len(files_with_columns) > 15:
            file_context += f"\n... and {len(files_with_columns) - 15} more files"
    
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

USER REQUEST: "{user_prompt}"{file_context}{history_context}

WORKFLOW STRUCTURE (exactly 3 steps):

Step 1 - CARD_CREATION:
- Create laboratory card for the agent
- endpoint: /api/laboratory/cards
- payload: {{"atomId": "<agent>", "source": "ai", "llm": "deepseek-r1:32b"}}

Step 2 - FETCH_ATOM:
- Fetch the atom using chat endpoint
- endpoint: /trinityai/chat
- prompt: "fetch <agent> atom"

Step 3 - AGENT_EXECUTION:
- Execute the specific agent
- endpoint: /trinityai/<agent_endpoint>
- prompt: "Original user prompt: {user_prompt}. Task: <specific_task>"

AVAILABLE AGENTS:
• merge → /trinityai/merge (join datasets on common columns)
• concat → /trinityai/concat (stack datasets vertically/horizontally)
• chartmaker → /trinityai/chart (create charts and visualizations)
• groupby → /trinityai/groupby (group and aggregate data)
• explore → /trinityai/explore (explore and analyze datasets)
• dataframe_operations → /trinityai/dataframe-operations (DataFrame operations)
• create_transform → /trinityai/create-transform (transform data columns)

EXAMPLES:

USER: "merge files uk_mayo and uk_beans"
WORKFLOW: {{"workflow": [{{"step": 1, "action": "CARD_CREATION", "agent": "merge", "prompt": "Create laboratory card with merge atom", "endpoint": "/api/laboratory/cards", "depends_on": null, "payload": {{"atomId": "merge", "source": "ai", "llm": "deepseek-r1:32b"}}}}, {{"step": 2, "action": "FETCH_ATOM", "agent": "fetch_atom", "prompt": "fetch merge atom", "endpoint": "/trinityai/chat", "depends_on": 1}}, {{"step": 3, "action": "AGENT_EXECUTION", "agent": "merge", "prompt": "Original user prompt: merge files uk_mayo and uk_beans. Task: Merge uk_mayo and uk_beans files by common columns", "endpoint": "/trinityai/merge", "depends_on": 2}}], "is_data_science": true, "total_steps": 3, "original_prompt": "merge files uk_mayo and uk_beans"}}

USER: "create a chart from sales data"
WORKFLOW: {{"workflow": [{{"step": 1, "action": "CARD_CREATION", "agent": "chartmaker", "prompt": "Create laboratory card with chartmaker atom", "endpoint": "/api/laboratory/cards", "depends_on": null, "payload": {{"atomId": "chartmaker", "source": "ai", "llm": "deepseek-r1:32b"}}}}, {{"step": 2, "action": "FETCH_ATOM", "agent": "fetch_atom", "prompt": "fetch chartmaker atom", "endpoint": "/trinityai/chat", "depends_on": 1}}, {{"step": 3, "action": "AGENT_EXECUTION", "agent": "chartmaker", "prompt": "Original user prompt: create a chart from sales data. Task: Create interactive chart from sales data", "endpoint": "/trinityai/chart", "depends_on": 2}}], "is_data_science": true, "total_steps": 3, "original_prompt": "create a chart from sales data"}}

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
    
    prompt_lower = user_prompt.lower()
    
    # Determine agent from keywords
    agent = "merge"
    endpoint = "/trinityai/merge"
    task_desc = "Process the data"
    
    if any(word in prompt_lower for word in ["merge", "join", "combine", "vlookup"]):
        agent = "merge"
        endpoint = "/trinityai/merge"
        task_desc = "Merge datasets by common columns"
    elif any(word in prompt_lower for word in ["concat", "concatenate", "stack", "append"]):
        agent = "concat"
        endpoint = "/trinityai/concat"
        task_desc = "Concatenate datasets"
    elif any(word in prompt_lower for word in ["chart", "graph", "visualiz", "plot"]):
        agent = "chartmaker"
        endpoint = "/trinityai/chart"
        task_desc = "Create chart visualization"
    elif any(word in prompt_lower for word in ["group", "aggregate", "pivot"]):
        agent = "groupby"
        endpoint = "/trinityai/groupby"
        task_desc = "Group and aggregate data"
    elif any(word in prompt_lower for word in ["explore", "analyze", "eda"]):
        agent = "explore"
        endpoint = "/trinityai/explore"
        task_desc = "Explore and analyze dataset"
    elif any(word in prompt_lower for word in ["transform", "create column", "feature"]):
        agent = "create_transform"
        endpoint = "/trinityai/create-transform"
        task_desc = "Transform data columns"
    
    logger.info(f"📊 Detected agent: {agent}")
    
    workflow_json = {
        "workflow": [
            {
                "step": 1,
                "action": "CARD_CREATION",
                "agent": agent,
                "prompt": f"Create laboratory card with {agent} atom",
                "endpoint": "/api/laboratory/cards",
                "depends_on": None,
                "payload": {
                    "atomId": agent,
                    "source": "ai",
                    "llm": "deepseek-r1:32b"
                }
            },
            {
                "step": 2,
                "action": "FETCH_ATOM",
                "agent": "fetch_atom",
                "prompt": f"fetch {agent} atom",
                "endpoint": "/trinityai/chat",
                "depends_on": 1
            },
            {
                "step": 3,
                "action": "AGENT_EXECUTION",
                "agent": agent,
                "prompt": f"Original user prompt: {user_prompt}. Task: {task_desc}",
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

