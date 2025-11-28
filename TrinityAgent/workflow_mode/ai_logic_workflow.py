"""
AI Logic for Workflow Mode Agent
Builds prompts and handles LLM communication for workflow composition
Following the same pattern as merge/concat agents
"""

import json
import re
import requests
import logging
from typing import Dict, Any

logger = logging.getLogger("smart.workflow.ai_logic")


def build_workflow_prompt(user_prompt: str, available_atoms: dict, workflow_context: dict, rag_knowledge: str, conversation_context: str, file_context: Dict[str, Any] = None) -> str:
    """
    Build the LLM prompt for the workflow composition assistant.
    Similar to merge/concat agents but focused on molecule creation
    
    Args:
        file_context: Optional dictionary containing file details from @filename mentions
    """
    
    workflow_name = workflow_context.get('workflowName', 'Untitled Workflow') if workflow_context else 'Untitled Workflow'
    existing_molecules = workflow_context.get('canvasMolecules', []) if workflow_context else []
    
    # Build file context section if files are mentioned
    file_context_section = ""
    if file_context:
        try:
            # Use BaseAgent.FileReader (standardized file handler)
            try:
                from BaseAgent.file_reader import FileReader
            except ImportError:
                from TrinityAgent.BaseAgent.file_reader import FileReader
            
            # Format file context for LLM (basic format)
            file_context_lines = []
            for file_path, file_data in file_context.items():
                columns = file_data.get("columns", [])
                file_name = file_data.get("file_name", file_path.split('/')[-1])
                file_context_lines.append(f"File: {file_name}")
                if columns:
                    file_context_lines.append(f"  Columns: {', '.join(columns)}")
            
            if file_context_lines:
                file_context_section = "\n" + "\n".join(file_context_lines)
            
            # Print the file details that LLM will see
            print("\n" + "="*80)
            print("📄 FILE DETAILS THAT LLM WILL SEE:")
            print("="*80)
            print(file_context_section)
            print("="*80 + "\n")
            
            logger.info("="*80)
            logger.info("📄 FILE DETAILS THAT LLM WILL SEE:")
            logger.info("="*80)
            logger.info(file_context_section)
            logger.info("="*80)
            logger.info(f"✅ Added file context for {len(file_context)} file(s) to prompt")
        except Exception as e:
            logger.warning(f"⚠️ Could not format file context: {e}")
            file_context_section = ""
    
    prompt = f"""You are an intelligent Workflow Composition Assistant for Trinity Workflow Mode.

**IMPORTANT**: You are in WORKFLOW MODE, not Laboratory Mode.
- DO NOT execute agents or create cards
- DO suggest molecule compositions (grouping atoms together)
- DO explain how molecules should be connected sequentially

USER INPUT: "{user_prompt}"
{file_context_section}

**IMPORTANT: IF FILES ARE MENTIONED (@filename) - USE THE FILE DETAILS ABOVE:**
When the user mentions files using @filename syntax, you have access to comprehensive file information including:
- Complete column lists and data types
- Statistical summaries (mean, std, min, max, percentiles) for ALL numeric columns
- Missing value counts and percentages for ALL columns
- Sample values for categorical columns
- Row counts and file sizes

**YOU MUST USE THIS INFORMATION TO:**
1. **Answer Questions Accurately**: Use actual column names, data types, and statistics from the files
   - Example: "What columns are in @sales.csv?" → List the ACTUAL columns shown above
   - Example: "What's the average revenue?" → Use the ACTUAL mean value from statistical summary

2. **Create Data-Aware Workflows**: Design workflows based on the actual data structure
   - If file has datetime columns → Include time-series analysis atoms
   - If file has many categorical columns → Include groupby/aggregation atoms
   - If file has missing values → Include data cleaning atoms
   - If file has numeric columns with wide ranges → Consider normalization atoms

3. **Provide Intelligent Recommendations**: Use statistical insights to suggest appropriate operations
   - High std deviation → Suggest outlier detection
   - Many missing values → Suggest imputation strategies
   - Specific data types → Suggest appropriate visualizations
   - Column relationships → Suggest correlation analysis

4. **Be Specific and Accurate**: Reference actual values, not generic placeholders
   - DON'T say: "You have several numeric columns..."
   - DO say: "Your file has 8 numeric columns (sales, revenue, cost, profit, quantity, price, discount, margin) with revenue averaging $12,345.67"

5. **Design Custom Workflows**: Use file characteristics to create tailored molecule compositions
   - Sales data with regions → Create molecules for regional analysis and comparison
   - Time-series data → Create molecules for trend analysis, forecasting, seasonality
   - Customer data with churn → Create molecules for segmentation, prediction, risk scoring
   - Financial data → Create molecules for ratio analysis, profitability, cost optimization

**EXAMPLES OF USING FILE DETAILS:**

Example 1 - Question about file:
User: "what columns are in @sales.csv?"
You should: Look at the file details above and list the ACTUAL column names
Response: {{"success": false, "answer": "The sales.csv file contains 15 columns: date, region, product, sales, revenue, cost, profit, quantity, price, discount, margin, customer_id, order_id, category, and status.", "smart_response": "..."}}

Example 2 - Statistical question:
User: "what's the average revenue in @sales.csv?"
You should: Look at the statistical summary and provide the ACTUAL mean value
Response: {{"success": false, "answer": "The average revenue in sales.csv is $12,345.67 (based on 1,234 records).", "smart_response": "..."}}

Example 3 - Workflow creation with file awareness:
User: "create analysis workflow for @sales.csv"
You should: Examine the file structure (columns, types, missing values) and design appropriate molecules
Response: {{"success": true, "workflow_composition": {{
  "molecules": [
    {{
      "molecule_name": "Data Quality Check",
      "purpose": "Handle 7 rows with missing cost values (0.6%) and validate data integrity. Ensure clean data for analysis.",
      "atoms": [
        {{"id": "dataframe-operations", "title": "DataFrame Operations", ...}},
        {{"id": "create-column", "title": "Create Column", ...}}
      ]
    }},
    {{
      "molecule_name": "Regional Sales Analysis",
      "purpose": "Analyze sales across 4 regions (North, South, East, West) using groupby. Compare revenue performance by region.",
      "atoms": [
        {{"id": "groupby-wtg-avg", "title": "GroupBy with Weighted Average", ...}},
        {{"id": "descriptive-stats", "title": "Descriptive Statistics", ...}}
      ]
    }},
    {{
      "molecule_name": "Revenue Visualization",
      "purpose": "Create interactive charts for revenue trends (range: $100 - $15,000). Visualize patterns and outliers.",
      "atoms": [
        {{"id": "chart-maker", "title": "Chart Maker", ...}}
      ]
    }}
  ]
}}, "smart_response": "I've created a 3-molecule workflow tailored for your sales.csv file...\\n\\n**Key Insights from Your Data:**\\n- 1,234 records with 8 numeric and 5 categorical columns\\n- Average revenue: $12,345.67 (range: $100 - $15,000)\\n- 4 regions with data, 0.6% missing cost values\\n\\n**Molecule 1: Data Quality**\\nHandles the 7 rows with missing costs and validates data integrity..."}}

Example 4 - Comparison workflow:
User: "compare @sales_2023.csv and @sales_2024.csv"
You should: Use both files' statistics to create comparative analysis molecules
Response: Design molecules that:
- Load both files
- Align columns and merge by date/region
- Calculate year-over-year growth using actual column names
- Visualize trends comparing actual numeric ranges from both files

**KEY PRINCIPLE**: Treat file details as a knowledge base - use actual values, column names, statistics, and data characteristics to provide accurate, personalized, data-aware responses and workflows.

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
- CREATE a workflow (if intent is to create/workflow-related) → Use success: true
- ANSWER the question helpfully (if intent is general/guidance) → Use success: false

SUCCESS RESPONSE (when you can suggest a workflow):
{{
  "success": true,
  "workflow_composition": {{
    "workflow_name": "{workflow_name}",
    "molecules": [
      {{
        "molecule_number": 1,
        "molecule_name": "Descriptive Name",
        "purpose": "Concise 2-line description (MAX 40 words). Line 1: action verb + brief operations. Line 2: brief outcome/value.",
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
  "reasoning": "Matched use case pattern / Created custom composition"
}}

SMART RESPONSE (for questions, clarifications, or when you cannot create a workflow):
{{
  "success": false,
  "answer": "Direct, simple answer to the question without extra context.",
  "suggestions": [
    "Try asking for a specific workflow: 'create MMM workflow'",
    "Or describe your goal: 'I want to forecast sales'"
  ],
  "message": "Providing workflow guidance",
  "smart_response": "I can help you create workflows for various business use cases:\\n\\n**Available Workflows:**\\n- **MMM** - Marketing Mix Modeling\\n- **Churn Prediction** - Identify at-risk customers\\n- **Forecasting** - Predict demand\\n\\nWhat would you like to create?",
  "reasoning": "General question / Cannot understand query"
}}

**WHEN TO USE success: false (NOT WORKFLOW GENERATION):**
- Greetings: "hello", "hi", "hey"
- Questions: "what can you do?", "what is MMM?"
- Help requests: "help me", "I need assistance"
- Unclear queries: vague requests without specific workflow intent

**WHEN TO USE success: true (WORKFLOW GENERATION):**
- Explicit creation: "create MMM workflow", "build dashboard"
- Action words: "create", "build", "design", "make"
- Clear workflow intent: "I want to build a churn model"

INTELLIGENCE RULES:
1. **ALWAYS determine user intent FIRST**
2. **USE FILE DETAILS when files are mentioned** - Reference actual columns, statistics, and data characteristics
3. **DO NOT force workflow creation** for general questions
4. **ALWAYS include "smart_response" field** (never empty)
5. **Use success: false** for greetings, questions, help requests
6. **Use success: true** ONLY for explicit workflow creation
7. **BE CREATIVE** when creating workflows - design 4-8 molecules for complex tasks
8. **DATA-AWARE WORKFLOWS** - When files mentioned, tailor molecules to actual data structure
9. **INTELLIGENT GROUPING** - group 2-5 atoms per molecule based on purpose and data characteristics
10. **CONCISE DESCRIPTIONS** - 2-line purpose (MAX 40 words) with specific references to data when available

**FILE-AWARE WORKFLOW DESIGN:**
When creating workflows with mentioned files:
- Mention actual column names in molecule purposes: "Analyze revenue (avg: $12,345) across 4 regions"
- Reference data quality: "Clean 0.6% missing values in cost column"
- Use actual statistics: "Forecast sales trends (range: $100-$15,000) for next quarter"
- Suggest appropriate atoms based on data types: datetime → time-series, categorical → groupby, high variance → outlier detection

**CRITICAL OUTPUT REQUIREMENTS**:
1. Return ONLY valid JSON - no text before or after
2. Start with {{ and end with }}
3. Must be parseable by json.loads()

YOU MUST RETURN ONLY THE JSON OBJECT. START YOUR RESPONSE WITH {{ AND END WITH }}"""

    logger.info(f"Building workflow prompt (length: {len(prompt)})")
    if file_context:
        logger.info(f"Including file context for {len(file_context)} file(s)")
    
    return prompt


def call_workflow_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """
    Call the LLM API for workflow composition.
    Same pattern as merge/concat agents
    """
    # Print full prompt to terminal
    print("\n" + "="*80)
    print("🚀 WORKFLOW MODE LLM CALL - FULL PROMPT")
    print("="*80)
    print(f"API URL: {api_url}")
    print(f"Model: {model_name}")
    print(f"Temperature: 0.3, Num Predict: 6000")
    print(f"Prompt Length: {len(prompt)} characters")
    print("-"*80)
    print("FULL PROMPT:")
    print("-"*80)
    print(prompt)
    print("="*80 + "\n")
    
    logger.info(f"Calling LLM: {model_name}")
    
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "system", 
                "content": "You are a JSON-only API. You MUST return valid JSON objects only. Never return plain text explanations. Always start responses with { and end with }."
            },
            {
                "role": "user", 
                "content": prompt
            }
        ],
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.3,
            "num_predict": 6000,
            "top_p": 0.9,
            "repeat_penalty": 1.15
        }
    }
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(api_url, json=payload, headers=headers, timeout=300)
        response.raise_for_status()
        
        # Get raw response
        raw_response_text = response.text
        response_data = response.json()
        content = response_data.get('message', {}).get('content', '')
        
        # Print raw API response to terminal
        print("\n" + "="*80)
        print("📥 WORKFLOW MODE LLM - RAW RESPONSE")
        print("="*80)
        print(f"Status Code: {response.status_code}")
        print("-"*80)
        print("RAW JSON RESPONSE:")
        print("-"*80)
        print(raw_response_text)
        print("="*80 + "\n")
        
        # Print processed content
        print("\n" + "="*80)
        print("✨ WORKFLOW MODE LLM - PROCESSED CONTENT")
        print("="*80)
        print(f"Content Length: {len(content)} characters")
        print("-"*80)
        print("EXTRACTED CONTENT:")
        print("-"*80)
        print(content)
        print("="*80 + "\n")
        
        logger.info(f"LLM response received (length: {len(content)})")
        return content
        
    except Exception as e:
        logger.error(f"Error calling LLM: {e}")
        print(f"\n❌ WORKFLOW MODE LLM ERROR: {e}\n")
        raise


def extract_json(response: str):
    """
    Extract JSON from LLM response.
    Same pattern as merge/concat agents
    """
    logger.info(f"Extracting JSON from response (length: {len(response)})")
    
    if not response:
        logger.error("Empty response")
        return None

    # Clean response
    cleaned = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL)
    cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"```json\s*", "", cleaned)
    cleaned = re.sub(r"```\s*", "", cleaned)
    
    # Find JSON start
    json_start_pattern = r'\{\s*"success"'
    match = re.search(json_start_pattern, cleaned)
    
    if match:
        json_start = match.start()
        cleaned = cleaned[json_start:]
    else:
        brace_pos = cleaned.find('{')
        if brace_pos > 0:
            cleaned = cleaned[brace_pos:]
    
    cleaned = cleaned.strip()
    
    # Try brace counting
    try:
        start_idx = cleaned.find("{")
        if start_idx == -1:
            return None
        
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
            logger.error(f"Unbalanced braces")
            return None
        
        json_str = cleaned[start_idx:end_idx]
        result = json.loads(json_str)
        logger.info("✅ Successfully extracted JSON")
        return result
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode failed: {e}")
    except Exception as e:
        logger.error(f"Extraction failed: {e}")

    # Fallback: simple bracket matching
    try:
        start = cleaned.find('{')
        end = cleaned.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = cleaned[start:end+1]
            result = json.loads(json_str)
            logger.info("✅ Extracted JSON using bracket matching")
            return result
    except:
        pass

    logger.warning("All JSON extraction methods failed")
    return None
