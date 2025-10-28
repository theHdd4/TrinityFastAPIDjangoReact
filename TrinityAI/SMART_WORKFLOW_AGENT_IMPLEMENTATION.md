# ✅ Smart Workflow Agent Implementation

## 🎯 **What You Requested:**

> "create ai logic and llm logic as we have in other agents like merge, concat, explore, groupby, etc so that we have file data (load_file function) and also memory uses and then final generate the json that have steps and endpoints and names"

## ✅ **What Was Implemented:**

I've created a **complete Smart Workflow Agent** that follows the exact same architecture as other agents (merge, concat, explore, groupby) with:

1. **File Loading** - Loads files from MinIO with column information
2. **Session Memory** - Maintains conversation history across interactions
3. **AI Logic** - Prompt building and LLM calling
4. **LLM Logic** - Main agent class with file awareness
5. **JSON Generation** - Generates structured workflow JSON

## 📁 **Files Created:**

### **1. llm_workflow.py**
- **Purpose**: Main agent class (like `llm_merge.py` in merge agent)
- **Features**:
  - FileLoader integration for file awareness
  - Session memory for conversation history
  - Context management (client/app/project)
  - Dynamic path resolution from environment
  - Complete logging with all steps

### **2. ai_logic_workflow.py**
- **Purpose**: AI logic layer (like `ai_logic.py` in merge agent)
- **Features**:
  - `build_workflow_prompt()` - Builds prompt with file context
  - `call_workflow_llm()` - Calls LLM API with proper payload
  - `extract_workflow_json()` - Extracts and validates JSON
  - Fallback workflow generation using keywords
  - File extraction from prompts

### **3. Updated main_app.py**
- **Integration**: Smart Workflow Agent is now initialized and used
- **Pattern**: Follows same pattern as merge/concat/explore agents
- **Fallback**: Still has fallback if agent fails to initialize

## 🔧 **Architecture (Same as Other Agents):**

```
User Request
    ↓
main_app.py (endpoint)
    ↓
SmartWorkflowAgent.process_request()
    ├→ Load files from MinIO (FileLoader)
    ├→ Get/create session (memory)
    ├→ Build prompt with file context (ai_logic_workflow)
    ├→ Call LLM (ai_logic_workflow)
    ├→ Extract JSON (ai_logic_workflow)
    ├→ Update session memory
    └→ Return result with workflow JSON
```

## 📊 **What You'll See in Terminal:**

```
================================================================================
🔄 WORKFLOW GENERATION REQUEST
================================================================================
📝 Prompt: merge the files uk mayo and uk beans
🆔 Session: session_123
🏢 Context: client/app/project
📚 Session has 2 previous messages
📁 Available files: 45

--------------------------------------------------------------------------------
STEP 1: Building Prompt with File Context
--------------------------------------------------------------------------------
✅ Prompt built (2345 characters)

📝 EXACT PROMPT:
================================================================================
Generate a workflow JSON for this data science request.

USER REQUEST: "merge the files uk mayo and uk beans"

AVAILABLE FILES (45 total):
1. uk_mayo.arrow (15 columns: product_id, name, price, stock, ...)
2. uk_beans.arrow (12 columns: product_id, category, quantity, ...)
...
================================================================================

--------------------------------------------------------------------------------
STEP 2: Calling LLM
--------------------------------------------------------------------------------
📤 Calling LLM: https://ollama.quantmatrixai.com/api/chat
🤖 Model: deepseek-r1:32b

📦 REQUEST PAYLOAD:
{
  "model": "deepseek-r1:32b",
  "messages": [...],
  "options": {
    "temperature": 0.1,
    "num_predict": 2000
  },
  "format": "json"
}

📥 Response: HTTP 200

📄 COMPLETE API RESPONSE:
{
  "model": "deepseek-r1:32b",
  "message": {
    "content": "{\"workflow\": [{...}]}"
  }
}

🎯 EXTRACTED CONTENT:
{"workflow": [{"step": 1, "action": "CARD_CREATION", ...}]}

--------------------------------------------------------------------------------
STEP 3: Extracting Workflow JSON
--------------------------------------------------------------------------------
✅ Workflow extracted

🎯 FINAL WORKFLOW:
{
  "workflow": [
    {
      "step": 1,
      "action": "CARD_CREATION",
      "agent": "merge",
      "endpoint": "/api/laboratory/cards",
      "payload": {"atomId": "merge", "source": "ai"}
    },
    {
      "step": 2,
      "action": "FETCH_ATOM",
      "agent": "fetch_atom",
      "endpoint": "/trinityai/chat",
      "prompt": "fetch merge atom"
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "merge",
      "endpoint": "/trinityai/merge",
      "prompt": "Original user prompt: merge uk mayo and uk beans. Task: Merge datasets"
    }
  ],
  "is_data_science": true,
  "total_steps": 3
}

================================================================================
✅ WORKFLOW GENERATION COMPLETE
================================================================================
Success: True
Agent: merge
Files used: ['uk_mayo', 'uk_beans']
```

## 🎯 **Key Features:**

### **1. File Awareness (Like Other Agents)**
```python
# Loads files with column information from MinIO
self.file_loader = FileLoader(
    minio_endpoint="minio:9000",
    minio_access_key="minio",
    minio_secret_key="minio123",
    minio_bucket="trinity",
    object_prefix=""
)

files_info = self.file_loader.load_files_with_columns()
# Returns: {'uk_mayo.arrow': {'columns': ['product_id', 'name', ...]}, ...}
```

### **2. Session Memory (Like Other Agents)**
```python
# Maintains conversation history
session = {
    "id": "session_123",
    "conversation": [
        {"role": "user", "content": "merge files...", "timestamp": "..."},
        {"role": "assistant", "content": "...", "workflow": {...}}
    ],
    "generated_workflows": [...]
}
```

### **3. Context Management (Like Other Agents)**
```python
# Dynamic path resolution based on context
workflow_agent.set_context(
    client_name="acme",
    app_name="retail",
    project_name="sales_analysis"
)
# Updates MinIO prefix: acme/retail/sales_analysis/
```

### **4. Proper AI Logic (Like Other Agents)**
```python
# ai_logic_workflow.py
def build_workflow_prompt(user_prompt, files_with_columns, conversation_history):
    # Builds prompt with:
    # - User request
    # - Available files with columns
    # - Conversation history
    # - Few-shot examples
    return complete_prompt
```

### **5. LLM Logic (Like Other Agents)**
```python
# llm_workflow.py
class SmartWorkflowAgent:
    def process_request(self, prompt, session_id, client_name, app_name, project_name):
        # 1. Load files
        # 2. Get session
        # 3. Build prompt
        # 4. Call LLM
        # 5. Extract JSON
        # 6. Update memory
        # 7. Return result
```

## 🚀 **How to Use:**

### **Via API:**
```bash
curl -X POST http://localhost:8002/trinityai/superagent/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "message": "merge files uk mayo and uk beans",
    "session_id": "session_123",
    "client_name": "acme",
    "app_name": "retail",
    "project_name": "sales"
  }'
```

### **Response:**
```json
{
  "success": true,
  "workflow_json": {
    "workflow": [
      {"step": 1, "action": "CARD_CREATION", ...},
      {"step": 2, "action": "FETCH_ATOM", ...},
      {"step": 3, "action": "AGENT_EXECUTION", ...}
    ],
    "is_data_science": true,
    "total_steps": 3
  },
  "smart_response": "I've generated a workflow for your request. The workflow has 3 steps and will use the merge agent.",
  "file_analysis": {
    "total_files": 45,
    "files_used": ["uk_mayo", "uk_beans"],
    "agent_detected": "merge"
  }
}
```

## ✅ **Result:**

The workflow generator now works **exactly like other agents** with:

1. ✅ **File Loading** - Knows what files are available and their columns
2. ✅ **Session Memory** - Remembers conversation history
3. ✅ **AI Logic** - Proper prompt building with context
4. ✅ **LLM Logic** - Structured agent class
5. ✅ **JSON Generation** - Reliable workflow creation
6. ✅ **Detailed Logging** - See every step in terminal
7. ✅ **Fallback** - Always returns valid workflow

**The Smart Workflow Agent follows the exact same architecture as merge, concat, explore, and groupby agents!** 🎉
