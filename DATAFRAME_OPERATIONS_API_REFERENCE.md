# DataFrame Operations - Complete API Reference

## Overview

The DataFrame Operations system provides a comprehensive set of APIs for manipulating tabular data through both AI-powered configuration generation and direct API calls. This document covers all available operations and their JSON requirements.

## Architecture Flow

```
Frontend → AI Chat → AI Agent → Backend APIs → MinIO Storage
    ↓           ↓         ↓           ↓            ↓
  User Input → JSON Config → Operations → Results → Saved Files
```

## Base URL
```
Backend API: /api/dataframe-operations/
AI Chat API: /trinityai/dataframe-operations-chat
```

---

## 1. DATA LOADING OPERATIONS

### 1.1 Load File (Upload)
**Endpoint:** `POST /load`  
**Content-Type:** `multipart/form-data`

```javascript
// Frontend Usage
const formData = new FormData();
formData.append('file', fileObject);

fetch('/api/dataframe-operations/load', {
  method: 'POST',
  body: formData
});
```

**Response:**
```json
{
  "df_id": "uuid-string",
  "headers": ["col1", "col2", "col3"],
  "rows": [{"col1": "value1", "col2": "value2"}],
  "types": {"col1": "String", "col2": "Int64"},
  "row_count": 100,
  "column_count": 3
}
```

### 1.2 Load Cached File
**Endpoint:** `POST /load_cached`  
**Content-Type:** `application/json`

```json
{
  "object_name": "client/app/project/filename.arrow"
}
```

**Response:** Same as load file response

---

## 2. ROW OPERATIONS

### 2.1 Insert Row
**Endpoint:** `POST /insert_row`

```json
{
  "df_id": "uuid-string",
  "index": 5,
  "direction": "below"  // "above" or "below"
}
```

### 2.2 Delete Row
**Endpoint:** `POST /delete_row`

```json
{
  "df_id": "uuid-string",
  "index": 5
}
```

### 2.3 Duplicate Row
**Endpoint:** `POST /duplicate_row`

```json
{
  "df_id": "uuid-string",
  "index": 5
}
```

---

## 3. COLUMN OPERATIONS

### 3.1 Insert Column
**Endpoint:** `POST /insert_column`

```json
{
  "df_id": "uuid-string",
  "index": 2,
  "name": "NewColumn",
  "default": ""  // Default value for all cells
}
```

### 3.2 Delete Column
**Endpoint:** `POST /delete_column`

```json
{
  "df_id": "uuid-string",
  "name": "ColumnToDelete"
}
```

### 3.3 Duplicate Column
**Endpoint:** `POST /duplicate_column`

```json
{
  "df_id": "uuid-string",
  "name": "SourceColumn",
  "new_name": "CopiedColumn"
}
```

### 3.4 Move Column
**Endpoint:** `POST /move_column`

```json
{
  "df_id": "uuid-string",
  "from": "ColumnName",
  "to_index": 3
}
```

### 3.5 Rename Column
**Endpoint:** `POST /rename_column`

```json
{
  "df_id": "uuid-string",
  "old_name": "OldName",
  "new_name": "NewName"
}
```

### 3.6 Retype Column
**Endpoint:** `POST /retype_column`

```json
{
  "df_id": "uuid-string",
  "name": "ColumnName",
  "new_type": "number"  // "number", "string", "text"
}
```

---

## 4. DATA MANIPULATION

### 4.1 Edit Cell
**Endpoint:** `POST /edit_cell`

```json
{
  "df_id": "uuid-string",
  "row": 0,
  "column": "ColumnName",
  "value": "NewValue"
}
```

### 4.2 Sort DataFrame
**Endpoint:** `POST /sort`

```json
{
  "df_id": "uuid-string",
  "column": "ColumnName",
  "direction": "asc"  // "asc" or "desc"
}
```

### 4.3 Filter Rows
**Endpoint:** `POST /filter_rows`

```json
// Simple filter
{
  "df_id": "uuid-string",
  "column": "Country",
  "value": "USA"
}

// Range filter
{
  "df_id": "uuid-string",
  "column": "Age",
  "value": {"min": 18, "max": 65}
}

// List filter (multiple values)
{
  "df_id": "uuid-string",
  "column": "Status",
  "value": ["Active", "Pending", "Complete"]
}
```

---

## 5. ADVANCED OPERATIONS

### 5.1 Apply Formula
**Endpoint:** `POST /apply_formula`

```json
{
  "df_id": "uuid-string",
  "target_column": "Total",
  "formula": "=SUM(Price,Tax)"  // Excel-like or Python expressions
}
```

### 5.2 Apply User Defined Function (UDF)
**Endpoint:** `POST /apply_udf`

```json
{
  "df_id": "uuid-string",
  "column": "Price",
  "udf_code": "x * 1.1",  // Python expression
  "new_column": "PriceWithTax"  // Optional: create new column
}
```

### 5.3 AI Execute Batch Operations
**Endpoint:** `POST /ai/execute_operations`

```json
{
  "df_id": "uuid-string",
  "operations": [
    {
      "op": "filter_rows",
      "params": {
        "column": "Country",
        "value": "USA"
      }
    },
    {
      "op": "sort",
      "params": {
        "column": "Revenue",
        "direction": "desc"
      }
    }
  ]
}
```

---

## 6. UTILITY OPERATIONS

### 6.1 Save DataFrame
**Endpoint:** `POST /save`

```json
{
  "csv_data": "col1,col2\nval1,val2",  // CSV string
  "filename": "processed_data.arrow"
}
```

### 6.2 Preview DataFrame
**Endpoint:** `GET /preview`  
**Query Parameters:** `?df_id=uuid-string&n=100`

### 6.3 DataFrame Info
**Endpoint:** `GET /info`  
**Query Parameters:** `?df_id=uuid-string`

---

## 7. AI-POWERED CONFIGURATION

### 7.1 Chat Interface
**Endpoint:** `POST /trinityai/dataframe-operations-chat`

```json
{
  "query": "Load UK beans data and sort by volume",
  "session_id": "12345",
  "client_name": "client1",
  "app_name": "app1",
  "project_name": "project1",
  "current_df_id": "existing-df-id"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "smart_response": "I've configured operations to load UK beans data and sort by volume.",
  "dataframe_config": {
    "operation_type": "comprehensive",
    "source_data": {
      "type": "cached_load",
      "object_name": "client1/app1/project1/uk_beans.arrow"
    },
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "method": "POST",
        "operation_name": "load_cached",
        "parameters": {
          "object_name": "client1/app1/project1/uk_beans.arrow"
        },
        "execute_order": 1,
        "depends_on": []
      },
      {
        "operation_id": "2",
        "api_endpoint": "/sort",
        "method": "POST",
        "operation_name": "sort_dataframe",
        "parameters": {
          "df_id": "auto_from_previous",
          "column": "volume",
          "direction": "asc"
        },
        "execute_order": 2,
        "depends_on": ["1"]
      }
    ]
  },
  "execution_plan": {
    "auto_execute": true,
    "execution_mode": "sequential",
    "error_handling": "stop_on_error"
  },
  "session_id": "12345",
  "processing_time": 1.23
}
```

---

## 8. EXECUTION MODES

### Auto Execute Settings
- **`auto_execute: true`** - Execute immediately after configuration
- **`auto_execute: false`** - Generate configuration only, wait for confirmation

### Execution Modes
- **`sequential`** - Execute operations one by one (default)
- **`parallel`** - Execute independent operations simultaneously
- **`conditional`** - Execute based on conditions

### Error Handling
- **`stop_on_error`** - Stop execution if any operation fails (default)
- **`continue_on_error`** - Continue with remaining operations
- **`rollback_on_error`** - Undo all operations if any fails

---

## 9. FRONTEND INTEGRATION

### TypeScript Interfaces

```typescript
interface DataFrameResponse {
  df_id: string;
  headers: string[];
  rows: any[];
  types: Record<string, string>;
  row_count: number;
  column_count: number;
}

interface DataFrameConfig {
  operation_type: "single" | "comprehensive" | "batch";
  source_data: {
    type: "file_upload" | "cached_load" | "existing_session";
    file_path?: string;
    object_name?: string;
    df_id?: string;
  };
  operations: Operation[];
}

interface Operation {
  operation_id: string;
  api_endpoint: string;
  method: "POST" | "GET";
  operation_name: string;
  description: string;
  parameters: Record<string, any>;
  execute_order: number;
  depends_on: string[];
}
```

### Usage Examples

```javascript
// Direct API calls
import * as dfApi from './dataframeOperationsApi';

// Load and sort data
const df = await dfApi.loadDataframeByKey('path/to/data.arrow');
const sorted = await dfApi.sortDataframe(df.df_id, 'volume', 'desc');

// AI-powered operations
const response = await fetch('/trinityai/dataframe-operations-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'Load UK beans and sort by volume',
    session_id: 'session123'
  })
});
```

---

## 10. ERROR HANDLING

### Common Error Responses

```json
{
  "success": false,
  "error": "DataFrame not found",
  "smart_response": "The specified DataFrame could not be found. Please check the df_id.",
  "suggestions": [
    "Verify the DataFrame ID is correct",
    "Load the data first before performing operations"
  ]
}
```

### AI Service Errors

```json
{
  "success": false,
  "error": "Could not reach AI service",
  "smart_response": "❌ Could not reach AI service. Please check if the LLM service is running.",
  "suggestions": [
    "Check if the AI/LLM service is running",
    "Verify network connectivity",
    "Try again in a few moments"
  ]
}
```

---

## 11. HEALTH CHECK

### Service Health
**Endpoint:** `GET /trinityai/dataframe-operations/health`

```json
{
  "status": "healthy",
  "service": "smart_dataframe_operations_agent",
  "agent_status": "initialized",
  "ai_service_status": "reachable",
  "ai_service_url": "http://localhost:11434/api/chat",
  "active_sessions": 5,
  "loaded_files": 10
}
```

This comprehensive reference covers all DataFrame operations available through the system, including both direct API calls and AI-powered configuration generation.
