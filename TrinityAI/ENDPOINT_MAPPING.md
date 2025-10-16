# Trinity AI Endpoint Mapping

## 🎯 **Verified Endpoints for Each Agent**

This document maps each agent to its correct endpoint, verified from the actual codebase.

## 📋 **Agent Endpoints:**

### **1. Merge Agent**
- **Endpoint**: `/trinityai/merge`
- **Method**: `POST`
- **File**: `Agent_Merge/main_app.py`
- **Router Definition**: `@router.post("/merge")`
- **Request Model**: `MergeRequest`
- **Purpose**: Combines datasets by joining on common columns

### **2. Concat Agent**
- **Endpoint**: `/trinityai/concat`
- **Method**: `POST`
- **File**: `Agent_concat/main_app.py`
- **Router Definition**: `@router.post("/concat")`
- **Request Model**: `ConcatRequest`
- **Purpose**: Combines datasets vertically (row-wise) or horizontally (column-wise)

### **3. Chart Maker Agent**
- **Primary Endpoint**: `/trinityai/chart`
- **Alias 1**: `/trinityai/chart-maker`
- **Alias 2**: `/trinityai/generate`
- **Method**: `POST`
- **File**: `Agent_chartmaker/main_app.py`
- **Router Definitions**: 
  - `@router.post("/chart")`
  - `@router.post("/chart-maker")`
  - `@router.post("/generate")`
- **Request Model**: `ChartRequest`
- **Purpose**: Creates interactive charts and visualizations

### **4. GroupBy Agent**
- **Endpoint**: `/trinityai/groupby`
- **Method**: `POST`
- **File**: `Agent_groupby/main_app.py`
- **Router Definition**: `@router.post("/groupby")`
- **Request Model**: `GroupByRequest`
- **Purpose**: Groups data and applies aggregation functions

### **5. Explore Agent**
- **Primary Endpoint**: `/trinityai/explore`
- **Alias**: `/trinityai/explore-data`
- **Method**: `POST`
- **File**: `Agent_explore/main_app.py`
- **Router Definitions**:
  - `@router.post("/explore")`
  - `@router.post("/explore-data")`
- **Request Model**: `ExploreRequest`
- **Purpose**: Explores and analyzes datasets

### **6. DataFrame Operations Agent**
- **Primary Endpoint**: `/trinityai/dataframe-operations`
- **Alias**: `/trinityai/dataframe-operations-data`
- **Method**: `POST`
- **File**: `Agent_dataframe_operations/main_app.py`
- **Router Definitions**:
  - `@router.post("/dataframe-operations")`
  - `@router.post("/dataframe-operations-data")`
- **Request Model**: `DataFrameOperationsRequest`
- **Purpose**: Performs various DataFrame operations

### **7. Create Transform Agent**
- **Endpoint**: `/trinityai/create-transform`
- **Method**: `POST`
- **File**: `Agent_create_transform/main_app.py`
- **Router Definition**: `@router.post("/create-transform")`
- **Request Model**: `CreateTransformRequest`
- **Purpose**: Creates new columns or transforms existing data

### **8. Fetch Atom (Chat)**
- **Endpoint**: `/trinityai/chat`
- **Method**: `POST`
- **File**: `main_api.py`
- **Router Definition**: `@api_router.post("/chat")`
- **Request Model**: `QueryRequest`
- **Purpose**: AI-powered query processor that determines the most suitable atom/tool
- **Note**: This is NOT a separate agent router - it's defined in main_api.py

### **9. SuperAgent**
- **Chat Endpoint**: `/trinityai/superagent/chat`
- **Enhanced Chat**: `/trinityai/superagent/enhanced-chat`
- **Generate Workflow**: `/trinityai/superagent/generate-workflow`
- **Orchestrate**: `/trinityai/superagent/orchestrate`
- **Method**: `POST`
- **File**: `SUPERAGENT/main_app.py`
- **Router Prefix**: `prefix="/superagent"`

### **10. Insight Agent**
- **Endpoint**: `/trinityai/insight/generate`
- **Method**: `POST`
- **File**: `insight.py`
- **Router Definition**: `@router.post("/generate")`
- **Purpose**: Generates insights from data

## 🔧 **Laboratory Card Generation API:**

- **Endpoint**: `/api/laboratory/cards`
- **Method**: `POST`
- **Service**: FastAPI Backend (not TrinityAI)
- **Base URL**: `http://localhost:8001` (FASTAPI_BASE_URL)
- **Purpose**: Creates a new laboratory card scaffold with an atom

## 🎯 **Correct Workflow Endpoint Structure:**

### **Example: Merge Workflow**
```json
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
      "prompt": "Original user prompt: merge files. Task: Merge uk mayo and uk beans"
    }
  ]
}
```

### **Example: Chart Maker Workflow**
```json
{
  "workflow": [
    {
      "step": 1,
      "action": "CARD_CREATION",
      "agent": "chartmaker",
      "endpoint": "/api/laboratory/cards",
      "payload": {"atomId": "chartmaker", "source": "ai"}
    },
    {
      "step": 2,
      "action": "FETCH_ATOM",
      "agent": "fetch_atom",
      "endpoint": "/trinityai/chat",
      "prompt": "fetch chartmaker atom"
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "chartmaker",
      "endpoint": "/trinityai/chart",
      "prompt": "Original user prompt: create chart. Task: Create interactive chart from sales data"
    }
  ]
}
```

### **Example: Explore Workflow**
```json
{
  "workflow": [
    {
      "step": 1,
      "action": "CARD_CREATION",
      "agent": "explore",
      "endpoint": "/api/laboratory/cards",
      "payload": {"atomId": "explore", "source": "ai"}
    },
    {
      "step": 2,
      "action": "FETCH_ATOM",
      "agent": "fetch_atom",
      "endpoint": "/trinityai/chat",
      "prompt": "fetch explore atom"
    },
    {
      "step": 3,
      "action": "AGENT_EXECUTION",
      "agent": "explore",
      "endpoint": "/trinityai/explore",
      "prompt": "Original user prompt: explore data. Task: Explore and analyze customer dataset"
    }
  ]
}
```

## 🚦 **Service Base URLs:**

### **TrinityAI Service (Port 8002)**
- **Base URL**: `http://localhost:8002`
- **Environment Variable**: `AI_SERVICE_URL`
- **Agents**: All TrinityAI agents (merge, concat, chartmaker, etc.)
- **Endpoints**: `/trinityai/*`

### **FastAPI Backend (Port 8001)**
- **Base URL**: `http://localhost:8001`
- **Environment Variable**: `FASTAPI_BASE_URL`
- **Services**: Laboratory Card Generation API
- **Endpoints**: `/api/laboratory/cards`

## ✅ **Verification Checklist:**

When generating workflow JSON, ensure:

1. ✅ **Card Creation** uses `/api/laboratory/cards` (FastAPI)
2. ✅ **Fetch Atom** uses `/trinityai/chat` (NOT /trinityai/fetch_atom)
3. ✅ **Merge** uses `/trinityai/merge`
4. ✅ **Concat** uses `/trinityai/concat`
5. ✅ **Chart** uses `/trinityai/chart` (NOT /trinityai/chartmaker)
6. ✅ **GroupBy** uses `/trinityai/groupby`
7. ✅ **Explore** uses `/trinityai/explore`
8. ✅ **DataFrame Operations** uses `/trinityai/dataframe-operations`
9. ✅ **Create Transform** uses `/trinityai/create-transform`

## 🔍 **How Routers are Mounted:**

In `main_api.py`, all agent routers are included under the `/trinityai` prefix:

```python
# Router with a global prefix for all Trinity AI endpoints
api_router = APIRouter(prefix="/trinityai")

# Include agent routers
api_router.include_router(merge_router)           # /trinityai/merge
api_router.include_router(concat_router)          # /trinityai/concat
api_router.include_router(create_transform_router) # /trinityai/create-transform
api_router.include_router(groupby_router)         # /trinityai/groupby
api_router.include_router(chartmaker_router)      # /trinityai/chart
api_router.include_router(explore_router)         # /trinityai/explore
api_router.include_router(dataframe_operations_router) # /trinityai/dataframe-operations
api_router.include_router(superagent_router)      # /trinityai/superagent/*
api_router.include_router(insight_router)         # /trinityai/insight/*

# Main chat endpoint for fetch_atom
@api_router.post("/chat")  # /trinityai/chat
async def chat_endpoint(request: QueryRequest):
    ...
```

## 🎉 **Result:**

All endpoints have been verified from the actual codebase and are now correctly documented for workflow generation! 🚀
