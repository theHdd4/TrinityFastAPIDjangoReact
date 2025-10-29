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

RAG KNOWLEDGE (use as inspiration ONLY, not fixed templates):
{rag_knowledge}

CONVERSATION HISTORY:
{conversation_context}

**FIRST: DETERMINE THE USER'S INTENT**
Before doing anything else, analyze what the user is actually asking for:

1. **Is this a request to CREATE a workflow?** 
   - Look for action words: "create", "build", "design", "make", "generate"
   - Look for specific workflow mentions: "MMM", "churn", "forecast", "dashboard"
   - Look for detailed business goals: "I want to analyze sales", "help me predict churn"
   - ✅ These should get workflow compositions (success: true)

2. **Is this a GENERAL QUESTION or GUIDANCE REQUEST?**
   - Look for question words: "what", "how", "can you", "what are", "explain"
   - Look for greetings: "hello", "hi", "hey"
   - Look for help requests: "help", "what can you do", "what options"
   - Look for explanation requests: "tell me about", "what is"
   - ✅ These should get smart responses WITHOUT workflows (success: false)

3. **Is this UNCLEAR or TOO VAGUE?**
   - Very short queries: "analyze", "do something", "help me"
   - Ambiguous requests without context
   - ✅ These should get clarifying responses (success: false)

**CRITICAL RULE**: DO NOT force workflow creation. If the user is asking a general question or needs guidance, provide a helpful answer with success: false. Only create workflows when explicitly requested or when the query clearly indicates a workflow need.

TASK: Based on the intent analysis above, either:
- CREATE a workflow (if intent is to create/workflow-related)
- ANSWER the question helpfully (if intent is general/guidance)

SUCCESS RESPONSE (when you can suggest a workflow):
{{
  "success": true,
  "workflow_composition": {{
    "workflow_name": "{workflow_name}",
    "molecules": [
      {{
        "molecule_number": 1,
        "molecule_name": "Descriptive Name",
        "purpose": "Concise 2-line description (MAX 50 words). Line 1: action verb + brief operations. Line 2: brief outcome/value. Keep it short - detailed info goes in smart_response.",
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
          "use_case_matched": "mmm_marketing_mix_modeling",
          "auto_create": true,
          "execution_plan": [
            {{
              "step": 1,
              "action": "create_molecule",
              "molecule_number": 1,
              "molecule_name": "Descriptive Name",
              "purpose": "What this molecule accomplishes"
            }},
            {{
              "step": 2,
              "action": "add_atom",
              "molecule_number": 1,
              "atom_id": "atom-id-1",
              "atom_title": "Atom Title 1",
              "order": 1,
              "required": true
            }},
            {{
              "step": 3,
              "action": "add_atom",
              "molecule_number": 1,
              "atom_id": "atom-id-2",
              "atom_title": "Atom Title 2",
              "order": 2,
              "required": true
            }},
            {{
              "step": 4,
              "action": "create_molecule",
              "molecule_number": 2,
              "molecule_name": "Next Molecule Name",
              "purpose": "Purpose of second molecule"
            }},
            {{
              "step": 5,
              "action": "add_atom",
              "molecule_number": 2,
              "atom_id": "atom-id-3",
              "atom_title": "Atom Title 3",
              "order": 1,
              "required": true
            }}
          ]
}}

SMART RESPONSE (for questions, clarifications, or when you cannot create a workflow):
{{
  "success": false,
  "answer": "Direct, simple answer to the question without extra context. Just answer what they asked naturally and conversationally.",
  "suggestions": [
    "Here are the available atoms for workflow creation:",
    "For [your goal], I recommend these molecules:",
    "Would you like me to create a workflow for: MMM, Churn Prediction, Forecasting, etc.?"
  ],
  "message": "Providing workflow guidance",
  "smart_response": "I can help you create workflows for various business use cases:\\n\\n**Available Workflows:**\\n- **MMM (Marketing Mix Modeling)** - Measure marketing effectiveness\\n- **Churn Prediction** - Identify at-risk customers\\n- **Demand Forecasting** - Forecast sales and inventory\\n- **Price Optimization** - Optimize pricing strategy\\n- **Customer Segmentation** - Group customers by behavior\\n- **Sales Dashboard** - Create KPI dashboards\\n- **Sentiment Analysis** - Analyze customer feedback\\n\\nWhat type of workflow would you like to create? Or describe your business goal and I'll design a custom workflow for you.",
  "reasoning": "Providing available options / Cannot understand query / General question",
  "available_use_cases": ["mmm", "churn", "forecast", "pricing", "dashboard", "segmentation", "sentiment"]
}}

**CRITICAL: WHEN TO USE SMART RESPONSE (success: false)**

Use success: false and provide helpful guidance for:

1. **Greetings**: "hello", "hi", "hey", "good morning"
2. **General questions**: "what can you do?", "what workflows are available?", "what are the options?"
3. **Help requests**: "help", "what can you help me with?", "I need guidance"
4. **Explanation requests**: "what is MMM?", "explain churn prediction", "tell me about workflows"
5. **Capability questions**: "what workflows can you create?", "show me available options"
6. **Unclear/ambiguous requests**: "analyze", "do something", "help me", without specific context
7. **How-to questions**: "how does this work?", "how do I create a workflow?"
8. **Too vague to create a workflow**: Need more information to proceed

**USE SUCCESS: TRUE ONLY WHEN:**
- User explicitly asks to "create", "build", "design", "make" a workflow
- User mentions specific workflows: "create MMM", "build churn model"
- User describes a clear business goal: "I want to analyze sales data", "help me forecast demand"
- Query indicates a need for data pipeline/workflow creation

**DO NOT** try to force workflow creation on general questions, greetings, or unclear requests.

**SMART RESPONSE GUIDELINES**:

For the "answer" field (NEW - for direct answers):
- Provide a simple, direct answer to what the user asked
- Don't reference RAG knowledge, available atoms, or workflow details
- Just answer their question naturally and conversationally
- Keep it brief and to the point
- Use friendly, helpful tone

For the "smart_response" field (for workflow guidance):
- Always provide helpful, actionable information
- List available workflow types with brief descriptions
- Encourage the user to be more specific
- Offer examples of what they can ask for
- Be conversational and friendly
- Include business context to help users understand options
- Use markdown formatting for better readability
- Provide clear next steps

**EXAMPLE SMART RESPONSES FOR COMMON QUERIES**:

Query: "hello" or "hi"
Answer: "Hello! I'm your Workflow Composition Assistant. How can I help you today?"
Response: {{
  "success": false,
  "answer": "Hello! I'm here to help you create data workflows. What would you like to do?",
  "smart_response": "Hello! I'm your Workflow Composition Assistant. I help you design data workflows by suggesting how to group atoms into molecules.\\n\\n**Popular Workflows:**\\n- MMM (Marketing Mix Modeling)\\n- Churn Prediction\\n- Demand Forecasting\\n\\nWhat would you like to create today?"
}}

Query: "what can you do?"
Answer: "I help you create data workflows by grouping atoms into molecules. I can design custom workflows or suggest pre-built ones."
Response: {{
  "success": false,
  "answer": "I help you design data workflows by grouping atoms into molecules. You can ask me to create workflows for analysis, predictions, or reporting.",
  "smart_response": "I can help you create custom data workflows! Here's what I do:\\n\\n**Design Workflows:** I suggest how to group atoms into molecules\\n**Pre-built Templates:** MMM, Churn, Forecasting, Dashboards\\n**Custom Solutions:** Tell me your goal and I'll design a workflow\\n\\nWhat would you like to create?"
}}

Query: "help"
Answer: "I can help you create workflows! Just tell me what you want to achieve, like 'create an MMM workflow' or 'build a dashboard'."
Response: {{
  "success": false,
  "answer": "I can help you create workflows! Just tell me what you want to achieve, like 'create an MMM workflow' or 'build a dashboard'.",
  "smart_response": "I'm here to help! Tell me what you want to achieve:\\n\\n**Examples:**\\n- 'Create an MMM workflow'\\n- 'I want to predict customer churn'\\n- 'Build a sales dashboard'\\n\\nOr ask: 'What workflows can you create?'"
}}

Query: "show me options" or "list workflows"
Answer: "I can create workflows for MMM, churn prediction, forecasting, dashboards, sentiment analysis, and more."
Response: {{
  "success": false,
  "answer": "I can create workflows like MMM, churn prediction, forecasting, dashboards, customer segmentation, and sentiment analysis.",
  "smart_response": "Here are the workflows I can create:\\n\\n**Marketing:** MMM, Price Optimization\\n**Predictive:** Churn Prediction, Demand Forecasting\\n**Analytics:** Customer Segmentation, Sentiment Analysis\\n**Reporting:** Sales Dashboard, KPI Tracking\\n\\nWhich one interests you?"
}}

INTELLIGENCE RULES:

**BEFORE CREATING WORKFLOWS - CHECK INTENT:**
1. **DETERMINE USER INTENT FIRST**: Is this a general question or a workflow request?
2. **DON'T FORCE WORKFLOWS**: If user asks "what", "how", "can you", "explain" → Answer with success: false
3. **ONLY CREATE WHEN EXPLICIT**: Only create workflows when user explicitly asks or clearly needs one

**WHEN CREATING WORKFLOWS (success: true):**
4. **BE CREATIVE AND ANALYTICAL**: Don't just use RAG templates - analyze the user's specific needs and create custom workflows
5. **DEEP ANALYSIS**: Analyze the user's request thoroughly and think about the complete data pipeline they need
6. **ATOM-DRIVEN COMPOSITION**: Look at ALL available atoms in the AVAILABLE ATOMS section and intelligently combine them
7. **LONG, SOPHISTICATED WORKFLOWS**: Create 4-8 molecules for complex tasks - don't limit to basic 3-molecule workflows
8. **INTELLIGENT GROUPING**: Group 2-5 related atoms per molecule based on their purpose and data flow
9. **SEQUENTIAL LOGIC**: Design molecules that flow logically: Load → Clean → Transform → Analyze → Model → Evaluate → Visualize → Report
10. **ATOM VALIDATION**: Only suggest atoms that exist in the AVAILABLE ATOMS section
11. **BUSINESS VALUE**: Explain what business outcome this workflow achieves

**FOR ALL RESPONSES (both success: true and false):**
12. **CRITICAL: ALWAYS include "smart_response" field** - Provide helpful information
13. **USE RAG AS INSPIRATION**: RAG examples are starting points, not constraints
14. **BE HELPFUL**: Even for general questions, provide valuable guidance and next steps

ADVANCED MOLECULE COMPOSITION STRATEGY:
- **Phase 1 - Ingestion**: Multiple data sources (database-connect, csv-import, api-connector)
- **Phase 2 - Integration**: Concatenation and merging (concat, merge, join)
- **Phase 3 - Cleaning**: Data quality (dataframe-operations, create-column, filter)
- **Phase 4 - Analysis**: Statistical and exploratory (feature-overview, descriptive-stats, trend-analysis)
- **Phase 5 - Modeling**: Machine learning (build-model-feature-based, regression-feature-based, clustering)
- **Phase 6 - Evaluation**: Model assessment (evaluate-models-feature, select-models-feature)
- **Phase 7 - Visualization**: Insights (chart-maker, chart types)
- **Phase 8 - Reporting**: Summarization (text-box, export)

**EXAMPLE OF COMPLEX WORKFLOW (8 molecules):**
Molecule 1: Data Ingestion (database-connect + csv-import + api-connector)
Molecule 2: Data Integration (concat + merge + join)
Molecule 3: Data Cleaning (dataframe-operations + create-column + filter)
Molecule 4: Exploratory Analysis (feature-overview + descriptive-stats + trend-analysis)
Molecule 5: Feature Engineering (create-column + groupby-wtg-avg)
Molecule 6: Model Building (build-model-feature-based + select-models-feature)
Molecule 7: Model Evaluation (evaluate-models-feature + scenario-planner)
Molecule 8: Visualization & Reporting (chart-maker + text-box)

CONVERSATIONAL HANDLING EXAMPLES:

**General Questions (success: false) - ANSWER DON'T CREATE:**
- "hello" or "hi" → Greet back, explain what you can do, ask what they'd like to create
- "what can you do?" → Explain your capabilities, list available workflows, encourage specific requests
- "what workflows are available?" → List all available workflow types with brief descriptions
- "help me understand workflows" → Explain the concept, show examples, encourage specific requests
- "what is MMM?" → Explain the concept, offer to create one if interested

**Workflow Creation Requests (success: true) - CREATE WORKFLOWS:**
- "create MMM workflow" → Analyze needs deeply, check available atoms, create custom 5-8 molecule workflow
- "build churn model" → Design comprehensive data pipeline with ingestion, cleaning, analysis, modeling, evaluation
- "I want to analyze sales data" → Create complete workflow from data ingestion to insights visualization
- "help me forecast demand" → Design forecasting pipeline with trend analysis, seasonality, modeling, evaluation

**Key Distinction:**
- Questions starting with "what", "how", "can you", "tell me" → Answer helpfully (success: false)
- Action words like "create", "build", "design", "make" → Create workflows (success: true)
- Business goals without action word → Ask clarifying question OR create workflow if clear enough

**KEY DIFFERENCE**: DON'T just copy RAG templates. CREATE intelligent workflows by:
1. Understanding the complete business problem
2. Selecting BEST atoms from ALL available atoms
3. Designing 5-8 molecule sequences for complex workflows
4. Ensuring logical data flow between molecules
5. Covering complete pipeline: data → analysis → modeling → evaluation → insights

EXAMPLES OF INTELLIGENT MOLECULE GROUPINGS WITH RICH DESCRIPTIONS:

**MMM Example (Concise - Max 50 words each):**
Molecule 1: Data Preparation
Purpose: "Start with data upload and validation, followed by feature analysis. Understand your dataset to prepare for modeling."

Molecule 2: Modeling & Evaluation
Purpose: "Use auto-regressive models for price forecasting. Evaluate model performance to ensure accuracy."

Molecule 3: Scenario Planning & Visualization
Purpose: "Create multiple pricing scenarios using the scenario planner. Visualize outcomes with interactive charts."

**Dashboard Example (Concise - Max 50 words each):**
Molecule 1: Data Integration
Purpose: "Connect to your database and perform data operations. Combine multiple sources for unified metrics."

Molecule 2: KPI Calculation
Purpose: "Calculate weighted averages and create custom columns. Transform data into actionable business metrics."

Molecule 3: Visualization & Reporting
Purpose: "Create interactive charts to visualize trends. Add insights to provide context for stakeholders."

**MOLECULE DESCRIPTION FORMULA (STRICT):**
Each molecule "purpose" must be EXACTLY 2 lines and MAXIMUM 50 words total:
- Line 1: Start with action verbs (e.g., "Start with...", "Use...", "Create...") and briefly explain WHAT operations happen (20-25 words)
- Line 2: Briefly explain WHY it matters - the business outcome or next step (20-25 words)
- Keep it concise and actionable - NOT verbose or lengthy
- The richness and detailed knowledge should be in the "smart_response" chat message, NOT in molecule descriptions
- Example format: "Start with data upload and validation, followed by feature analysis. Understand your dataset characteristics to prepare for modeling."

**CRITICAL RULES - READ THESE FIRST:**

**INTENT DETECTION (MOST IMPORTANT):**
1. **ALWAYS determine user intent FIRST** - Is this a question/guidance request or a workflow creation request?
2. **DO NOT force workflow creation** - If user asks a general question, answer it with success: false
3. **Only create workflows when explicitly requested** - Look for action words ("create", "build", "design") or clear business goals

**RESPONSE FORMAT:**
4. **ALWAYS include "smart_response" field** - NEVER leave it empty, even for general questions
5. **Use success: false** for greetings, questions, help requests, explanations
6. **Use success: true** ONLY when user wants to create/build a workflow
7. Always include "auto_create": true when success=true - this triggers automatic molecule creation on the frontend
8. **NO EMPTY RESPONSES**: Never return empty or null smart_response - always provide value to the user

**WHEN CREATING WORKFLOWS (success: true):**
9. **BE CREATIVE**: Don't just copy RAG templates - CREATE custom, intelligent workflows tailored to the user's needs
10. **ANALYZE DEEPLY**: Look at ALL available atoms in the AVAILABLE ATOMS section and think about which combinations solve the user's problem
11. **BUILD COMPLETE PIPELINES**: Design 5-8 molecule workflows for complex tasks - cover the entire data journey
12. **INTELLIGENT GROUPING**: Group 2-5 atoms per molecule based on their purpose and data dependencies
13. **LOGICAL SEQUENCING**: Ensure each molecule flows into the next with proper data transformations
14. **BUSINESS VALUE**: Think about what business outcome this workflow achieves
15. **CONCISE MOLECULE DESCRIPTIONS**: Write EXACTLY 2-line purpose descriptions (MAX 50 words total) that briefly explain operations and value. Use action verbs like "Start with...", "Use...", "Create..." but keep it short. The detailed richness goes in the "smart_response" chat message above, NOT in molecule descriptions.

**WORKFLOW DESIGN PHILOSOPHY**:
- Simple tasks (basic dashboards): 3-4 molecules
- Moderate tasks (analysis, forecasting): 4-6 molecules  
- Complex tasks (ML pipelines, multi-source analysis): 6-8 molecules
- Enterprise tasks (complete data pipelines with modeling): 8+ molecules

**AVOID**: Short, generic 3-molecule workflows that just match templates
**CREATE**: Sophisticated, multi-phase workflows that cover the complete data pipeline

**AUTO-CREATION BEHAVIOR**:
- When "auto_create": true is set, the frontend will automatically create molecules on the canvas
- Each molecule will be created with its atoms in the specified order
- Molecules will be positioned sequentially on the canvas
- The user sees the workflow appear automatically without manual clicking

**EXECUTION PLAN STRUCTURE**:
The "execution_plan" is a JSON array that provides step-by-step instructions for the UI to execute:
- Each step is an object with:
  - "step": sequential step number
  - "action": either "create_molecule" or "add_atom"
  - For "create_molecule": includes molecule_number, molecule_name, purpose
  - For "add_atom": includes molecule_number, atom_id, atom_title, order, purpose, required
- The plan executes sequentially to create molecules one at a time, then adds atoms to each molecule
- This creates a visual animation as the workflow builds step by step

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
            "temperature": 0.4,  # Increased for more creativity and less rigid template matching
            "num_predict": 6000,  # Increased for longer, more detailed workflows
            "top_p": 0.95,  # Higher for more diverse atom selection
            "repeat_penalty": 1.15  # Slightly higher to avoid repetition in long workflows
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

    # Step 1: Clean response - remove thinking tags, code blocks, and markdown bold
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    
    # Remove markdown bold markers that might interfere with JSON parsing
    # First, try to find where the JSON starts (after any introductory text)
    # Look for the pattern: text followed by { "success"
    json_start_pattern = r'\{\s*"success"'
    match = re.search(json_start_pattern, cleaned)
    
    if match:
        # Found JSON start, extract everything from that point
        json_start = match.start()
        logger.info(f"📍 Found JSON at position {json_start}")
        cleaned = cleaned[json_start:]
    else:
        # Fallback: remove introductory text that contains markdown
        # Remove text before the first {
        brace_pos = cleaned.find('{')
        if brace_pos > 0:
            logger.info(f"📍 Removing {brace_pos} characters before JSON")
            cleaned = cleaned[brace_pos:]
    
    cleaned = cleaned.strip()
    
    logger.info(f"📋 Cleaned response length: {len(cleaned)}")
    logger.info(f"📋 Cleaned response preview: {cleaned[:200]}")
    
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
