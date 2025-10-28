"""
AI Logic for Workflow Mode Agent
Builds prompts and handles LLM communication for workflow composition
Following the same pattern as merge/concat agents
"""

import json
import re
import requests
import logging

logger = logging.getLogger("smart.workflow.ai_logic")


def build_workflow_prompt(user_prompt: str, available_atoms: dict, workflow_context: dict, rag_knowledge: str, conversation_context: str) -> str:
    """
    Build the LLM prompt for the workflow composition assistant.
    Similar to merge/concat agents but focused on molecule creation
    """
    
    workflow_name = workflow_context.get('workflowName', 'Untitled Workflow') if workflow_context else 'Untitled Workflow'
    existing_molecules = workflow_context.get('canvasMolecules', []) if workflow_context else []
    
    prompt = f"""You are an intelligent Workflow Composition Assistant for Trinity Workflow Mode.

**IMPORTANT**: You are in WORKFLOW MODE, not Laboratory Mode.
- DO NOT execute agents or create cards
- DO suggest molecule compositions (grouping atoms together)
- DO explain how molecules should be connected sequentially

USER INPUT: "{user_prompt}"

CURRENT WORKFLOW CONTEXT:
- Workflow Name: {workflow_name}
- Existing Molecules: {len(existing_molecules)}
{json.dumps({"existing_molecules": [{"name": m.get("title", ""), "atoms": m.get("atoms", [])} for m in existing_molecules]}, indent=2) if existing_molecules else "No molecules created yet"}

AVAILABLE ATOMS (by category):
{json.dumps(available_atoms, indent=2)}

{rag_knowledge}

CONVERSATION HISTORY:
{conversation_context}

TASK: Analyze the user input and suggest molecule compositions for their workflow goal.

SUCCESS RESPONSE (when you can suggest a workflow):
{{
  "success": true,
  "workflow_composition": {{
    "workflow_name": "{workflow_name}",
    "molecules": [
      {{
        "molecule_number": 1,
        "molecule_name": "Descriptive Name",
        "purpose": "What this molecule accomplishes",
        "atoms": [
          {{
            "id": "atom-id-from-available-atoms",
            "title": "Atom Title",
            "order": 1,
            "purpose": "Why this atom is needed",
            "required": true
          }}
        ],
        "expected_outputs": ["Output 1", "Output 2"],
        "connections_to": [2]
      }}
    ],
    "total_molecules": 3,
    "business_value": "What this workflow achieves"
  }},
  "message": "Workflow composition completed",
  "smart_response": "I'll help you create a workflow for [goal].\\n\\n**Molecule 1: [Name]**\\nPurpose: [What it does]\\nAtoms:\\n  1. [Atom Title] - [purpose]\\n  2. [Atom Title] - [purpose]\\n\\n**Molecule 2: [Name]**...",
  "reasoning": "Matched use case pattern / Created custom composition",
  "use_case_matched": "mmm_marketing_mix_modeling"
}}

GENERAL RESPONSE (for questions, clarifications, or showing available options):
{{
  "success": false,
  "suggestions": [
    "Here are the available atoms for workflow creation:",
    "For [your goal], I recommend these molecules:",
    "Would you like me to create a workflow for: MMM, Churn Prediction, Forecasting, etc.?"
  ],
  "message": "Providing workflow guidance",
  "smart_response": "I can help you create workflows for various business use cases:\\n\\n**Available Workflows:**\\n- **MMM (Marketing Mix Modeling)** - Measure marketing effectiveness\\n- **Churn Prediction** - Identify at-risk customers\\n- **Demand Forecasting** - Forecast sales and inventory\\n- **Price Optimization** - Optimize pricing strategy\\n\\nWhat type of workflow would you like to create?",
  "reasoning": "Providing available options",
  "available_use_cases": ["mmm", "churn", "forecast", "pricing", "dashboard"]
}}

INTELLIGENCE RULES:

1. **CRITICAL: ALWAYS include "smart_response" field** - This is displayed to the user in the chat
2. **MOLECULE COMPOSITION FOCUS**: Suggest how to GROUP atoms into molecules (2-4 atoms per molecule)
3. **SEQUENTIAL FLOW**: Explain how molecules connect: Molecule 1 → Molecule 2 → Molecule 3
4. **USE CASE MATCHING**: Use the RAG knowledge to match predefined workflows (MMM, churn, forecasting, etc.)
5. **ATOM VALIDATION**: Only suggest atoms that exist in the AVAILABLE ATOMS section
6. **CLEAR GROUPING**: Each molecule should have a clear sub-goal (e.g., "Data Preparation", "Model Building")
7. **TYPICAL STRUCTURE**: 
   - Molecule 1: Data loading & preparation (2-3 atoms)
   - Molecule 2: Analysis/Modeling (2-3 atoms)
   - Molecule 3: Visualization/Reporting (1-2 atoms)

MOLECULE COMPOSITION GUIDELINES:
- **Molecule 1** typically contains: data-upload-validate OR csv-import + column-classifier OR feature-overview
- **Molecule 2** typically contains: Main analysis atoms (groupby, merge, regression, clustering, etc.)
- **Molecule 3** typically contains: chart-maker + text-box (optional)

CONVERSATIONAL HANDLING:
- "create MMM workflow" → Return MMM molecule composition
- "build churn model" → Return churn prediction molecule composition
- "show available workflows" → List predefined use cases
- "what atoms do I need for [task]" → List relevant atoms with grouping suggestions
- "yes, create it" → Return complete workflow_composition JSON

EXAMPLES OF MOLECULE GROUPINGS:

**MMM Example:**
Molecule 1: Data Prep (data-upload-validate + column-classifier + scope-selector)
Molecule 2: Modeling (build-model-feature-based + select-models-feature)
Molecule 3: Evaluation (evaluate-models-feature)

**Dashboard Example:**
Molecule 1: Data Load (database-connect + dataframe-operations)
Molecule 2: KPI Calc (groupby-wtg-avg + create-column)
Molecule 3: Visualization (chart-maker + text-box)

**CRITICAL RULES**:
1. Always include "smart_response" - it's required!
2. Suggest molecule groupings, do NOT execute
3. Explain connections between molecules
4. Use atoms from AVAILABLE ATOMS only
5. Follow the pattern: Load → Process/Analyze → Visualize

Return ONLY the JSON response:"""

    logger.info(f"BUILDING WORKFLOW PROMPT:")
    logger.info(f"User Prompt: {user_prompt}")
    logger.info(f"Workflow Name: {workflow_name}")
    logger.info(f"Existing Molecules: {len(existing_molecules)}")
    logger.info(f"Context Length: {len(conversation_context)}")
    logger.info(f"Generated Prompt Length: {len(prompt)}")
    logger.info(f"🔍 FULL PROMPT TO AI:")
    logger.info(f"{'='*80}")
    logger.info(f"{prompt}")
    logger.info(f"{'='*80}")
    
    return prompt


def call_workflow_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """
    Call the LLM API for workflow composition.
    Same pattern as merge/concat agents
    """
    logger.info(f"CALLING WORKFLOW LLM:")
    logger.info(f"API URL: {api_url}")
    logger.info(f"Model: {model_name}")
    logger.info(f"Prompt Length: {len(prompt)}")
    
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 4000,
            "top_p": 0.9,
            "repeat_penalty": 1.1
        }
    }
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    
    logger.info(f"🔍 API REQUEST PAYLOAD:")
    logger.info(f"{'='*80}")
    logger.info(f"URL: {api_url}")
    logger.info(f"Headers: {headers}")
    logger.info(f"Payload: {json.dumps(payload, indent=2)}")
    logger.info(f"{'='*80}")
    
    try:
        logger.info(f"Sending request to LLM...")
        response = requests.post(api_url, json=payload, headers=headers, timeout=300)
        response.raise_for_status()
        
        response_data = response.json()
        logger.info(f"LLM Response Status: {response.status_code}")
        logger.info(f"LLM Response Data Keys: {list(response_data.keys()) if isinstance(response_data, dict) else 'Not a dict'}")
        logger.info(f"🔍 FULL LLM RESPONSE DATA: {json.dumps(response_data, indent=2)}")
        
        content = response_data.get('message', {}).get('content', '')
        logger.info(f"LLM Content Length: {len(content)}")
        logger.info(f"LLM Content Preview: {content[:200]}...")
        logger.info(f"🔍 FULL LLM CONTENT: {content}")
        
        return content
        
    except Exception as e:
        logger.error(f"Error calling LLM: {e}")
        raise


def extract_json(response: str):
    """
    Extract JSON from LLM response.
    Same pattern as merge/concat agents
    """
    logger.info(f"🔍 Extracting JSON (response length: {len(response)})")
    
    if not response:
        logger.error("❌ Empty response")
        return None

    # Step 1: Clean response - remove thinking tags and code blocks
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    cleaned = cleaned.strip()
    
    logger.info(f"📋 Cleaned response length: {len(cleaned)}")
    
    # Method 1: Try regex patterns first
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, cleaned, re.DOTALL | re.IGNORECASE)
        for match in matches:
            try:
                result = json.loads(match)
                logger.info("✅ Successfully extracted JSON using pattern matching")
                return result
            except json.JSONDecodeError as e:
                logger.debug(f"JSON decode error with pattern {pattern}: {e}")
                continue

    # Method 2: Try brace counting
    try:
        start_idx = cleaned.find("{")
        if start_idx == -1:
            logger.error("❌ No opening brace found")
            return None
        
        # Count braces (respecting strings)
        brace_count = 0
        in_string = False
        escape_next = False
        end_idx = start_idx
        
        for i in range(start_idx, len(cleaned)):
            char = cleaned[i]
            
            if escape_next:
                escape_next = False
                continue
            if char == '\\':
                escape_next = True
                continue
            
            if char == '"':
                in_string = not in_string
                continue
            
            if not in_string:
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i + 1
                        break
        
        if brace_count != 0:
            logger.error(f"❌ Unbalanced braces (remaining count: {brace_count})")
            return None
        
        json_str = cleaned[start_idx:end_idx]
        logger.info(f"📦 Extracted JSON string (length: {len(json_str)})")
        
        result = json.loads(json_str)
        logger.info("✅ Successfully extracted JSON using brace counting")
        return result
        
    except json.JSONDecodeError as e:
        logger.debug(f"Brace counting JSON decode failed: {e}")
    except Exception as e:
        logger.debug(f"Brace counting failed: {e}")

    # Method 3: Try simple bracket matching (fallback)
    try:
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = cleaned[start:end+1]
            result = json.loads(json_str)
            logger.info("✅ Successfully extracted JSON using bracket matching")
            return result
    except json.JSONDecodeError as e:
        logger.debug(f"Bracket matching JSON decode failed: {e}")

    logger.warning("❌ All JSON extraction methods failed")
    logger.warning(f"Response preview for debugging: {cleaned[:500]}")
    return None
