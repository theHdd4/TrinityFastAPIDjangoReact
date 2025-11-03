# LLM Response Keys Documentation

This document lists all keys that are sent to the frontend from LLM responses for both **success=true** and **success=false** cases.

## 1. WORKFLOW MODE (WebSocket: `/trinityai/workflow/compose-ws`)

### Response Type: `"response"` (Final Response Message)

#### When `success: true`:
```json
{
  "type": "response",
  "success": true,
  "session_id": "workflow_session_123",
  "workflow_composition": {
    "workflow_name": "MMM Workflow",
    "total_molecules": 5,
    "business_value": "Complete MMM pipeline for marketing mix analysis",
    "molecules": [
      {
        "molecule_number": 1,
        "molecule_name": "Data Ingestion",
        "purpose": "Start with data upload and validation...",
        "atoms": [
          {
            "id": "csv-import",
            "title": "CSV Import",
            "order": 1,
            "purpose": "Import data",
            "required": true
          }
        ]
      }
    ]
  },
  "smart_response": "I've created a comprehensive MMM workflow with 5 molecules covering data ingestion, integration, analysis, modeling, and visualization...",
  "reasoning": "Based on your request for MMM workflow...",
  "suggestions": [],
  "message": "Workflow composition successful",
  "auto_create": true,
  "execution_plan": [
    {
      "step": 1,
      "action": "create_molecule",
      "molecule_number": 1,
      "molecule_name": "Data Ingestion",
      "purpose": "Start with data upload..."
    },
    {
      "step": 2,
      "action": "add_atom",
      "molecule_number": 1,
      "atom_id": "csv-import",
      "atom_title": "CSV Import",
      "order": 1,
      "purpose": "Import data",
      "required": true
    }
  ],
  "mode": "workflow_composition"
}
```

**Keys Available:**
- `type`: Always `"response"` for final response
- `success`: `true`
- `session_id`: Session identifier
- `workflow_composition`: Object containing:
  - `workflow_name`: Name of the workflow
  - `total_molecules`: Number of molecules
  - `business_value`: Description of business value
  - `molecules`: Array of molecule objects
- `smart_response`: Main chat message to display
- `reasoning`: (Optional) LLM reasoning
- `suggestions`: Array of suggestion strings (usually empty for success)
- `message`: Status message
- `auto_create`: `true` - triggers automatic molecule creation
- `execution_plan`: Step-by-step execution plan for UI
- `mode`: Always `"workflow_composition"`

#### When `success: false`:
```json
{
  "type": "response",
  "success": false,
  "session_id": "workflow_session_123",
  "workflow_composition": null,
  "smart_response": "I couldn't process your request. Please try asking for a specific workflow like 'create MMM workflow' or 'build a churn prediction model'.",
  "reasoning": null,
  "suggestions": [
    "Try asking for a specific workflow: 'create MMM workflow'",
    "Or describe your goal: 'I want to forecast sales'",
    "Or ask: 'what workflows can you help me create?'",
    "Or be specific: 'build a customer churn prediction model'"
  ],
  "message": "Unable to process workflow request",
  "auto_create": false,
  "execution_plan": [],
  "mode": "workflow_composition",
  "error": "LLM processing error"  // Only in fallback responses
}
```

**Keys Available:**
- `type`: Always `"response"` for final response
- `success`: `false`
- `session_id`: Session identifier
- `workflow_composition`: `null` or missing
- `smart_response`: Guidance message for user
- `reasoning`: Usually `null` or missing
- `suggestions`: Array of helpful suggestion strings
- `message`: Error or status message
- `auto_create`: `false`
- `execution_plan`: Empty array `[]`
- `mode`: Always `"workflow_composition"`
- `error`: Error message (only in fallback responses)

**Note:** The frontend also checks for an `answer` key when `success: false`, which contains direct answers to user questions. If present, it's displayed first, followed by `smart_response`.

### Other WebSocket Message Types:

#### `"molecules_suggested"` (Only sent when `success: true`):
```json
{
  "type": "molecules_suggested",
  "molecules": [...],
  "workflow_name": "MMM Workflow",
  "total_molecules": 5,
  "business_value": "Complete MMM pipeline..."
}
```

#### `"message"` (Interim message):
```json
{
  "type": "message",
  "role": "assistant",
  "content": "I've created a workflow...",
  "timestamp": "2025-01-01T12:00:00"
}
```

#### `"complete"`:
```json
{
  "type": "complete",
  "message": "Workflow composition complete"
}
```

#### `"error"`:
```json
{
  "type": "error",
  "error": "Error message",
  "message": "Error description"
}
```

---

## 2. SUPERAGENT CHAT (HTTP POST: `/trinityai/superagent/chat`)

### Response Structure:

#### When Workflow Request Detected (`success: true` implicit):
```json
{
  "response": "I've generated a workflow for your request. The workflow has 3 steps and will use the merge agent.\n\n{\n  \"workflow\": [\n    {\n      \"step\": 1,\n      \"action\": \"CARD_CREATION\",\n      \"agent\": \"merge\",\n      \"endpoint\": \"/api/laboratory/cards\",\n      \"payload\": {...}\n    },\n    ...\n  ],\n  \"is_data_science\": true,\n  \"total_steps\": 3\n}"
}
```

**Keys Available:**
- `response`: String containing `smart_response` + JSON workflow embedded as text

The response is a single string that combines:
- The smart response message
- A newline
- The workflow JSON as a formatted string

#### When Regular Chat (No Workflow):
```json
{
  "response": "This is a regular conversational response from the AI."
}
```

**Keys Available:**
- `response`: Plain text response from LLM

---

## 3. SUPERAGENT WORKFLOW GENERATION (HTTP POST: `/trinityai/superagent/generate-workflow`)

### Response Structure:

#### Success Case:
```json
{
  "success": true,
  "workflow_json": {
    "workflow": [
      {
        "step": 1,
        "action": "CARD_CREATION",
        "agent": "merge",
        "endpoint": "/api/laboratory/cards",
        "payload": {...}
      }
    ],
    "is_data_science": true,
    "total_steps": 3,
    "original_prompt": "merge files uk mayo and uk beans"
  },
  "smart_response": "I've generated a workflow for your request. The workflow has 3 steps and will use the merge agent to process your data.",
  "message": "",
  "session_id": "chat_session",
  "file_analysis": {
    "total_files": 5,
    "files_used": ["uk_mayo.csv", "uk_beans.csv"],
    "agent_detected": "merge"
  }
}
```

**Keys Available:**
- `success`: `true`
- `workflow_json`: Complete workflow structure
- `smart_response`: User-friendly message
- `message`: Status message (may be empty)
- `session_id`: Session identifier
- `file_analysis`: Analysis of files used

#### Error Case:
```json
{
  "error": "Failed to generate workflow: ...",
  "workflow": [],
  "is_data_science": false,
  "total_steps": 0,
  "original_prompt": "merge files uk mayo and uk beans"
}
```

**Keys Available:**
- `error`: Error message
- `workflow`: Empty array
- `is_data_science`: `false`
- `total_steps`: `0`
- `original_prompt`: Original user prompt

---

## Frontend Usage

### WorkflowAIPanel.tsx
The frontend checks the following keys in the `"response"` message:

**For `success: false`:**
- `data.answer` (optional) - Direct answer to question
- `data.smart_response` - Guidance message
- `data.suggestions` - Array of suggestions
- `data.message` - Fallback message

**For `success: true`:**
- `data.smart_response` - Main chat message
- `data.workflow_composition.molecules` - Molecules to display
- `data.message` - Fallback message

### SuperagentAIPanel.tsx
The frontend receives:
- `data.response` - Contains the complete response string (may include embedded JSON)

---

## Summary Table

| Mode | Endpoint | Success | Key Fields |
|------|----------|---------|------------|
| **Workflow** | WebSocket `/compose-ws` | `true` | `type`, `success`, `workflow_composition`, `smart_response`, `auto_create`, `execution_plan`, `session_id` |
| **Workflow** | WebSocket `/compose-ws` | `false` | `type`, `success`, `smart_response`, `suggestions`, `message`, `error`, `session_id` |
| **Superagent Chat** | POST `/chat` | N/A | `response` (string with embedded JSON if workflow) |
| **Superagent Workflow** | POST `/generate-workflow` | `true` | `success`, `workflow_json`, `smart_response`, `session_id`, `file_analysis` |
| **Superagent Workflow** | POST `/generate-workflow` | `false` | `error`, `workflow`, `total_steps`, `original_prompt` |

---

## Notes

1. **Workflow Mode** uses WebSocket and sends multiple message types (`connected`, `thinking`, `molecules_suggested`, `message`, `response`, `complete`, `error`).

2. **Superagent Chat** uses HTTP POST and returns a single `ChatResponse` with a `response` string field.

3. The `smart_response` field is **always present** in workflow mode responses (both success and failure) and should be used for displaying the main chat message.

4. When `success: false` in workflow mode, the frontend should show:
   - `answer` (if present) - direct answer to question
   - `smart_response` - guidance message
   - `suggestions` - helpful suggestions

5. When `success: true` in workflow mode, the frontend should:
   - Display `smart_response` in chat
   - Use `workflow_composition.molecules` to create molecules on canvas
   - Use `execution_plan` for step-by-step execution animation
   - Set `auto_create: true` triggers automatic creation

