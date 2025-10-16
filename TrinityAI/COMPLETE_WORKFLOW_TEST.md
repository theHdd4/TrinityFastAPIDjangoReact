# Complete SuperAgent Workflow Test

## 🎯 **Complete Workflow: Card Creation → Fetch Atom → Execute Agent**

The SuperAgent now supports the complete workflow:

1. **CARD_CREATION** → Creates laboratory card via FastAPI
2. **FETCH_ATOM** → Fetches relevant atom via TrinityAI  
3. **AGENT_EXECUTION** → Executes specific agent via TrinityAI

## 🔧 **Updated Architecture**

```
User Prompt: "merge files uk mayo and uk beans"
     ↓
SuperAgent LLM (JSON Generation)
     ↓
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
      "endpoint": "/trinityai/fetch_atom"
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION", 
      "agent": "merge",
      "endpoint": "/trinityai/merge"
    }
  ]
}
     ↓
AgentExecutor (Handles both FastAPI & TrinityAI calls)
     ↓
Complete Workflow Execution
```

## 🧪 **Test Commands**

### **1. Test JSON Generation**
```bash
curl -X POST http://localhost:8002/trinityai/superagent/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{"message": "merge the files uk mayo and uk beans using the workflow"}'
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
      "prompt": "Fetch merge atom for uk mayo and uk beans files",
      "endpoint": "/trinityai/fetch_atom",
      "depends_on": 1
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "merge",
      "prompt": "Merge uk mayo and uk beans files by common columns",
      "endpoint": "/trinityai/merge", 
      "depends_on": 2
    }
  ],
  "is_data_science": true,
  "total_steps": 3,
  "original_prompt": "merge the files uk mayo and uk beans using the workflow"
}
```

### **2. Test Complete Orchestration**
```bash
curl -X POST http://localhost:8002/trinityai/superagent/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"message": "merge the files uk mayo and uk beans using the workflow"}'
```

**Expected Response:**
```json
{
  "success": true,
  "workflow_completed": true,
  "steps_executed": 3,
  "results": {
    "step_1_merge": {
      "success": true,
      "result": {
        "id": "card-uuid",
        "atoms": [{"id": "merge-uuid", "atomId": "merge"}]
      },
      "action": "CARD_CREATION",
      "base": "FastAPI"
    },
    "step_2_fetch_atom": {
      "success": true,
      "result": {"atom_fetched": true},
      "action": "FETCH_ATOM", 
      "base": "TrinityAI"
    },
    "step_3_merge": {
      "success": true,
      "result": {"files_merged": true},
      "action": "AGENT_EXECUTION",
      "base": "TrinityAI"
    }
  },
  "final_response": "Successfully merged uk mayo and uk beans files"
}
```

## 📋 **Environment Configuration**

### **Required Environment Variables:**
```bash
# LLM Configuration
LLM_API_URL=http://ollama:11434/api/chat
LLM_MODEL_NAME=deepseek-r1:32b

# TrinityAI Service (Port 8002)
AI_SERVICE_URL=http://localhost:8002

# FastAPI Service (Port 8001) - for Laboratory Card Generation API
FASTAPI_BASE_URL=http://localhost:8001

# MinIO Configuration
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
MINIO_BUCKET=trinity
```

### **Docker Compose Services:**
```yaml
services:
  trinity-ai:     # Port 8002 - TrinityAI agents
    environment:
      - FASTAPI_BASE_URL=http://fastapi:8001
      
  fastapi:        # Port 8001 - Laboratory Card Generation API
    environment:
      - DATABASE_URL=...
      
  ollama:         # Port 11434 - LLM service
    environment:
      - OLLAMA_MODELS=deepseek-r1:32b
```

## 🔍 **Verification Steps**

### **1. Check Service Status**
```bash
# Check all services running
docker-compose ps

# Should show:
# - trinity-ai (port 8002) ✅
# - fastapi (port 8001) ✅  
# - ollama (port 11434) ✅
```

### **2. Test Individual Endpoints**
```bash
# Test TrinityAI health
curl http://localhost:8002/trinityai/superagent/health

# Test FastAPI health (if available)
curl http://localhost:8001/health

# Test Ollama
curl http://localhost:11434/api/tags
```

### **3. Test Workflow Generation**
```bash
# Should return JSON workflow (not conversational response)
curl -X POST http://localhost:8002/trinityai/superagent/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{"message": "create a chart from sales data"}'
```

### **4. Test Complete Orchestration**
```bash
# Should execute full workflow: Card → Fetch → Execute
curl -X POST http://localhost:8002/trinityai/superagent/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"message": "merge file1 and file2, then create a chart"}'
```

## 📊 **Expected Workflow Patterns**

### **Single Agent Workflow:**
```
User: "merge files A and B"
↓
1. CARD_CREATION (merge atom)
2. FETCH_ATOM (merge atom)
3. AGENT_EXECUTION (merge operation)
```

### **Multi-Agent Workflow:**
```
User: "merge files A and B, then create chart"
↓
1. CARD_CREATION (merge atom)
2. FETCH_ATOM (merge atom)  
3. AGENT_EXECUTION (merge operation)
4. CARD_CREATION (chartmaker atom)
5. FETCH_ATOM (chartmaker atom)
6. AGENT_EXECUTION (create chart)
```

## 🎉 **Success Criteria**

### **✅ JSON Generation Works:**
- SuperAgent returns structured JSON workflows
- Workflows include CARD_CREATION as step 1
- Workflows include proper dependencies

### **✅ Orchestration Works:**
- Card creation calls FastAPI successfully
- Fetch atom calls TrinityAI successfully  
- Agent execution calls TrinityAI successfully
- All steps complete in sequence

### **✅ Integration Works:**
- No more conversational responses for workflow requests
- Complete end-to-end automation
- Proper error handling and logging

## 🚨 **Troubleshooting**

### **Card Creation Fails:**
- Check FastAPI service is running (port 8001)
- Verify FASTAPI_BASE_URL environment variable
- Check Laboratory Card Generation API endpoint

### **Fetch Atom Fails:**
- Check TrinityAI service is running (port 8002)
- Verify fetch_atom agent is available
- Check LLM_API_URL configuration

### **Agent Execution Fails:**
- Check specific agent (merge, chartmaker, etc.) is available
- Verify agent endpoints are mounted correctly
- Check agent-specific configuration

### **JSON Generation Fails:**
- Check Ollama/DeepSeek is running and accessible
- Verify LLM_API_URL points to correct Ollama endpoint
- Check LLM_MODEL_NAME is available
- Increase timeout if LLM is slow

## 📈 **Performance Notes**

- **First request**: May take 60-90 seconds (model loading + planning)
- **Subsequent requests**: Should be faster (30-60 seconds)
- **Card creation**: Fast (< 1 second)
- **Fetch atom**: Medium (5-10 seconds)
- **Agent execution**: Depends on operation complexity

## 🎯 **Result**

The SuperAgent now provides **complete end-to-end workflow automation**:

1. ✅ **Generates JSON workflows** (not conversational responses)
2. ✅ **Creates laboratory cards** via FastAPI
3. ✅ **Fetches relevant atoms** via TrinityAI
4. ✅ **Executes agents** via TrinityAI
5. ✅ **Handles dependencies** between steps
6. ✅ **Provides file awareness** from MinIO

**The complete workflow is now automated!** 🚀
