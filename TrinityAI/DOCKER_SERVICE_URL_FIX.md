# Docker Service URL Fix - Orchestration

## Problem
The agent orchestrator was using `localhost` URLs to call other services, which fails inside Docker containers because:
- Each container has its own `localhost`
- Containers can't reach other containers via `localhost`
- Need to use Docker service names for inter-container communication

## Root Cause
```python
# ❌ OLD CODE (agent_orchestrator.py lines 57-59)
self.base_url = base_url or "http://localhost:8002"
self.fastapi_url = fastapi_url or os.getenv("FASTAPI_BASE_URL", "http://localhost:8001")
```

This caused errors like:
- `Connection refused` when calling `/api/laboratory/cards`
- `Timeout` when calling `/trinityai/chat` or `/trinityai/merge`

## Solution

### 1. Updated agent_orchestrator.py
Changed AgentExecutor to use Docker service names:

```python
# ✅ NEW CODE
self.base_url = base_url or os.getenv("AI_SERVICE_URL", "http://trinity-ai:8002")
self.fastapi_url = fastapi_url or os.getenv("FASTAPI_BASE_URL", "http://fastapi:8001")
```

**Why this works:**
- `trinity-ai:8002` - Docker service name resolves to the trinity-ai container IP
- `fastapi:8001` - Docker service name resolves to the fastapi container IP
- Docker's internal DNS handles service name resolution within the `trinity-net` network

### 2. Updated docker-compose.yml
Added explicit environment variables to trinity-ai service:

```yaml
environment:
  AI_SERVICE_URL: http://trinity-ai:8002
  FASTAPI_BASE_URL: http://fastapi:8001
```

## Architecture Overview

### Frontend (Browser) → Backend
```
Browser → http://HOST_IP:8002/trinityai/... ✅ Works
Browser → http://HOST_IP:8001/api/... ✅ Works
```

### Backend Container → Backend Container (NEW)
```
trinity-ai → http://trinity-ai:8002/trinityai/... ✅ Works now
trinity-ai → http://fastapi:8001/api/... ✅ Works now
```

## Workflow Orchestration Flow

When SuperAgent generates a workflow like:
```json
{
  "workflow": [
    {
      "step": 1,
      "action": "CARD_CREATION",
      "endpoint": "/api/laboratory/cards",
      "agent": "merge"
    },
    {
      "step": 2,
      "action": "FETCH_ATOM",
      "endpoint": "/trinityai/chat",
      "agent": "fetch_atom"
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "endpoint": "/trinityai/merge",
      "agent": "merge"
    }
  ]
}
```

The orchestrator now correctly calls:
1. `http://fastapi:8001/api/laboratory/cards` → Creates card
2. `http://trinity-ai:8002/trinityai/chat` → Fetches atom
3. `http://trinity-ai:8002/trinityai/merge` → Executes merge agent

## Testing

### After rebuilding container:
```bash
cd TrinityFastAPIDjangoReact
docker-compose build trinity-ai
docker-compose up -d trinity-ai
```

### Test orchestration:
1. Open SuperAgent UI
2. Send prompt: "merge the files uk mayo and uk beans using the workflow"
3. Check logs: `docker logs trinity-prod-trinity-ai-1 --tail=100`

### Expected output:
```
🚀 ORCHESTRATING WORKFLOW: 3 steps
📋 Step 1: CARD_CREATION (merge)
   → POST http://fastapi:8001/api/laboratory/cards
   ✅ Step 1 completed successfully
📋 Step 2: FETCH_ATOM (fetch_atom)
   → POST http://trinity-ai:8002/trinityai/chat
   ✅ Step 2 completed successfully
📋 Step 3: AGENT_EXECUTION (merge)
   → POST http://trinity-ai:8002/trinityai/merge
   ✅ Step 3 completed successfully
```

## Files Modified

1. **TrinityFastAPIDjangoReact/TrinityAI/agent_orchestrator.py**
   - Line 54-60: Updated `AgentExecutor.__init__` to use Docker service names

2. **TrinityFastAPIDjangoReact/docker-compose.yml**
   - Line 194-196: Added `AI_SERVICE_URL` and `FASTAPI_BASE_URL` environment variables

## Notes

- Environment variables allow easy override if needed
- Docker service names only work inside the Docker network
- External calls from browser still use `HOST_IP:port` (unchanged)
- All agent endpoints remain unchanged
- Frontend code remains unchanged

