# Updated SuperAgent Workflow Logic

## 🎯 **New Workflow Logic Implementation**

The SuperAgent workflow has been updated to follow a specific 3-step pattern for better orchestration and context management.

## 📋 **Workflow Steps:**

### **Step 1: Check for agent_name → Add Card API**
- **Purpose**: Register or prepare the card for the identified agent
- **Action**: `CARD_CREATION`
- **Endpoint**: `/api/laboratory/cards`
- **Payload**: `{"atomId": "agent_name", "source": "ai", "llm": "deepseek-r1:32b"}`

### **Step 2: Fetch Atom API**
- **Purpose**: Retrieve the specific Atom required for execution
- **Action**: `FETCH_ATOM`
- **Endpoint**: `/trinityai/chat` (**CORRECT - verified from codebase**)
- **Prompt**: `"fetch <agent_name> atom"` (exact format)
- **Note**: fetch_atom uses the main chat endpoint, NOT /trinityai/fetch_atom

### **Step 3: Run the Atom**
- **Purpose**: Execute the agent with full context
- **Action**: `AGENT_EXECUTION`
- **Endpoint**: `/trinityai/<agent_endpoint>`
- **Prompt**: `"Original user prompt: {original_prompt}. Task: {specific_task_description}"`

## 🔧 **Implementation Details:**

### **Updated Prompt Structure:**
```json
{
  "workflow": [
    {
      "step": 1,
      "action": "CARD_CREATION",
      "agent": "merge",
      "prompt": "Create laboratory card with merge atom",
      "endpoint": "/api/laboratory/cards",
      "depends_on": null,
      "payload": {
        "atomId": "merge",
        "source": "ai",
        "llm": "deepseek-r1:32b"
      }
    },
    {
      "step": 2,
      "action": "FETCH_ATOM",
      "agent": "fetch_atom",
      "prompt": "fetch merge atom",
      "endpoint": "/trinityai/chat",
      "depends_on": 1
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "merge",
      "prompt": "Original user prompt: merge files uk mayo and uk beans. Task: Merge uk mayo and uk beans files by common columns",
      "endpoint": "/trinityai/merge",
      "depends_on": 2
    }
  ],
  "is_data_science": true,
  "total_steps": 3,
  "original_prompt": "merge files uk mayo and uk beans"
}
```

### **Key Changes:**

1. **Step 2 Prompt Format**: Now uses exact format `"fetch <agent_name> atom"`
2. **Step 3 Prompt Format**: Combines original user prompt + specific task description
3. **Context Preservation**: Original user prompt is preserved throughout the workflow
4. **Clear Dependencies**: Each step depends on the previous step completion

## 🧪 **Testing the Updated Logic:**

### **1. Test Workflow Generation:**
```bash
curl -X POST http://localhost:8002/trinityai/superagent/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{"message": "merge the files uk mayo and uk beans"}'
```

**Expected Response:**
```json
{
  "workflow": [
    {
      "step": 1,
      "action": "CARD_CREATION",
      "agent": "merge",
      "prompt": "Create laboratory card with merge atom",
      "endpoint": "/api/laboratory/cards",
      "payload": {"atomId": "merge", "source": "ai"}
    },
    {
      "step": 2,
      "action": "FETCH_ATOM",
      "agent": "fetch_atom",
      "prompt": "fetch merge atom",
      "endpoint": "/trinityai/chat"
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "merge",
      "prompt": "Original user prompt: merge the files uk mayo and uk beans. Task: Merge uk mayo and uk beans files by common columns",
      "endpoint": "/trinityai/merge"
    }
  ]
}
```

### **2. Test Enhanced Chat:**
```bash
curl -X POST http://localhost:8002/trinityai/superagent/enhanced-chat \
  -H "Content-Type: application/json" \
  -d '{"message": "merge files uk mayo and uk beans using the workflow"}'
```

### **3. Test Complete Orchestration:**
```bash
curl -X POST http://localhost:8002/trinityai/superagent/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"message": "merge file1 and file2, then create a chart"}'
```

## 🔍 **Validation Criteria:**

### **Step 1 Validation:**
- ✅ Action is `CARD_CREATION`
- ✅ Endpoint is `/api/laboratory/cards`
- ✅ Payload contains `atomId`, `source`, and `llm`
- ✅ No dependencies (depends_on: null)

### **Step 2 Validation:**
- ✅ Action is `FETCH_ATOM`
- ✅ Agent is `fetch_atom`
- ✅ Endpoint is `/trinityai/chat` (**CORRECT - verified**)
- ✅ Prompt format: `"fetch <agent_name> atom"`
- ✅ Depends on step 1

### **Step 3 Validation:**
- ✅ Action is `AGENT_EXECUTION`
- ✅ Agent matches the identified agent_name
- ✅ Endpoint follows pattern `/trinityai/<agent>`
- ✅ Prompt combines original user prompt + task description
- ✅ Depends on step 2

## 🎯 **Benefits of New Logic:**

1. **Clear Context Flow**: Original user prompt is preserved and combined with task details
2. **Standardized Fetch**: Consistent "fetch <agent_name> atom" format
3. **Proper Card Creation**: Laboratory cards are created before atom execution
4. **Sequential Dependencies**: Each step builds on the previous step
5. **Full Context**: Agents receive both original intent and specific task instructions

## 🚀 **Usage Examples:**

### **Merge Operation:**
```
User: "merge files uk mayo and uk beans"
↓
Step 1: Create card for merge agent
Step 2: Fetch merge atom  
Step 3: Execute merge with "Original user prompt: merge files uk mayo and uk beans. Task: Merge uk mayo and uk beans files by common columns"
```

### **Chart Creation:**
```
User: "create a chart from sales data"
↓
Step 1: Create card for chartmaker agent
Step 2: Fetch chartmaker atom
Step 3: Execute chartmaker with "Original user prompt: create a chart from sales data. Task: Create interactive chart from sales data"
```

### **Complex Workflow:**
```
User: "merge file1 and file2, then create a chart"
↓
Step 1: Create card for merge agent
Step 2: Fetch merge atom
Step 3: Execute merge with combined prompt
Step 4: Create card for chartmaker agent  
Step 5: Fetch chartmaker atom
Step 6: Execute chartmaker with combined prompt
```

## 🔧 **Environment Requirements:**

```bash
# Service URLs
FASTAPI_BASE_URL=http://localhost:8001  # For card creation
AI_SERVICE_URL=http://localhost:8002    # For agent execution

# LLM Configuration
LLM_API_URL=http://ollama:11434/api/chat
LLM_MODEL_NAME=deepseek-r1:32b
```

## 📊 **Monitoring and Debugging:**

### **Log Messages to Watch:**
```
INFO: Generating workflow JSON for: merge files uk mayo and uk beans...
INFO: Successfully parsed workflow JSON: {...}
INFO: Executing TrinityAI endpoint: /trinityai/chat
INFO: Prompt: fetch merge atom
INFO: Executing TrinityAI endpoint: /trinityai/merge  
INFO: Prompt: Original user prompt: merge files uk mayo and uk beans. Task: Merge uk mayo and uk beans files by common columns
```

### **Validation Script:**
Use the provided `test_workflow_logic.py` script to validate the workflow logic:

```bash
python TrinityFastAPIDjangoReact/TrinityAI/test_workflow_logic.py
```

## 🎉 **Result:**

The SuperAgent now follows a **standardized 3-step workflow** that:

1. ✅ **Creates laboratory cards** before execution
2. ✅ **Fetches atoms** with consistent prompt format
3. ✅ **Executes agents** with full context (original + task)
4. ✅ **Preserves user intent** throughout the workflow
5. ✅ **Provides clear dependencies** between steps

**The workflow logic is now implemented and ready for testing!** 🚀
