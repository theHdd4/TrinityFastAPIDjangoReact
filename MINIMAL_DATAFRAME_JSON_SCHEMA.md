# Minimal DataFrame Operations JSON Schema

## Core Minimal Structure

### Essential Keys (Always Required)
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "parameters": {
          "object_name": "filename.arrow"
        }
      }
    ]
  }
}
```

## Complete Minimal Schema

### 1. Basic File Loading Only
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "parameters": {
          "object_name": "uk_beans.arrow"
        }
      }
    ]
  },
  "smart_response": "Loading UK beans data..."
}
```

### 2. File + Single Operation (e.g., Sort)
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "parameters": {
          "object_name": "uk_beans.arrow"
        }
      },
      {
        "operation_id": "2",
        "api_endpoint": "/sort",
        "parameters": {
          "df_id": "auto_from_previous",
          "column": "volume",
          "direction": "asc"
        }
      }
    ]
  },
  "smart_response": "Loading UK beans data and sorting by volume..."
}
```

### 3. File + Multiple Operations
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "parameters": {
          "object_name": "sales_data.arrow"
        }
      },
      {
        "operation_id": "2",
        "api_endpoint": "/filter_rows",
        "parameters": {
          "df_id": "auto_from_previous",
          "column": "country",
          "value": "USA"
        }
      },
      {
        "operation_id": "3",
        "api_endpoint": "/sort",
        "parameters": {
          "df_id": "auto_from_previous",
          "column": "revenue",
          "direction": "desc"
        }
      }
    ]
  },
  "smart_response": "Loading sales data, filtering for USA, and sorting by revenue..."
}
```

## Required vs Optional Keys

### ✅ ALWAYS REQUIRED
```json
{
  "success": boolean,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": string,
        "api_endpoint": string,
        "parameters": object
      }
    ]
  },
  "smart_response": string
}
```

### 🔧 OPTIONAL (Add when needed)
```json
{
  "execution_plan": {
    "auto_execute": boolean
  },
  "session_id": string,
  "reasoning": string,
  "used_memory": boolean,
  "file_name": string
}
```

## Operation-Specific Parameters

### Load Operations
```json
// Load cached file
{
  "api_endpoint": "/load_cached",
  "parameters": {
    "object_name": "filename.arrow"  // REQUIRED
  }
}

// Load uploaded file
{
  "api_endpoint": "/load",
  "parameters": {
    "file": "FormData_file_field"  // REQUIRED
  }
}
```

### Data Operations
```json
// Sort
{
  "api_endpoint": "/sort",
  "parameters": {
    "df_id": "auto_from_previous",  // REQUIRED
    "column": "column_name",        // REQUIRED
    "direction": "asc"              // REQUIRED: "asc" or "desc"
  }
}

// Filter
{
  "api_endpoint": "/filter_rows",
  "parameters": {
    "df_id": "auto_from_previous",  // REQUIRED
    "column": "column_name",        // REQUIRED
    "value": "filter_value"         // REQUIRED: string, number, array, or object
  }
}

// Add Column
{
  "api_endpoint": "/insert_column",
  "parameters": {
    "df_id": "auto_from_previous",  // REQUIRED
    "index": 2,                     // REQUIRED
    "name": "new_column",           // REQUIRED
    "default": ""                   // OPTIONAL: default value
  }
}
```

## Filter Value Types

### Simple Filter
```json
{
  "column": "status",
  "value": "active"
}
```

### Range Filter
```json
{
  "column": "age",
  "value": {"min": 18, "max": 65}
}
```

### Multiple Values Filter
```json
{
  "column": "country",
  "value": ["USA", "UK", "Canada"]
}
```

## Context-Based Examples

### User: "Load UK beans data"
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "parameters": {
          "object_name": "uk_beans.arrow"
        }
      }
    ]
  },
  "smart_response": "Loading UK beans data for you."
}
```

### User: "Sort by volume"
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/sort",
        "parameters": {
          "df_id": "current_dataframe",
          "column": "volume",
          "direction": "asc"
        }
      }
    ]
  },
  "smart_response": "Sorting the data by volume in ascending order."
}
```

### User: "Filter for high volume beans"
```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      {
        "operation_id": "1",
        "api_endpoint": "/filter_rows",
        "parameters": {
          "df_id": "current_dataframe",
          "column": "volume",
          "value": {"min": 1000}
        }
      }
    ]
  },
  "smart_response": "Filtering to show only high volume beans (volume > 1000)."
}
```

## Dynamic Filename Resolution

### Pattern for Filename Detection
```javascript
// AI should detect filename from user input
const userInput = "use uk beans and apply sorting";
const detectedFile = extractFilename(userInput); // "uk_beans"
const fullPath = `${client}/${app}/${project}/${detectedFile}.arrow`;

// Result in JSON
{
  "parameters": {
    "object_name": "client1/app1/project1/uk_beans.arrow"
  }
}
```

### Filename Variations
```json
// User says: "uk beans" → "uk_beans.arrow"
// User says: "sales data" → "sales_data.arrow"  
// User says: "customer info" → "customer_info.arrow"
// User says: "load myfile.csv" → "myfile.arrow"
```

## Error Response (Minimal)
```json
{
  "success": false,
  "smart_response": "I need more information. Which file would you like to work with?",
  "suggestions": [
    "Specify the filename you want to load",
    "Tell me what operations you want to perform"
  ]
}
```

## Template for AI to Follow

```json
{
  "success": true,
  "dataframe_config": {
    "operations": [
      // Always start with file loading if filename detected
      {
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "parameters": {
          "object_name": "DETECTED_FILENAME.arrow"
        }
      }
      // Add more operations based on user context
      // Each operation uses "auto_from_previous" for df_id
    ]
  },
  "smart_response": "DESCRIBE_WHAT_WILL_HAPPEN"
}
```

This minimal schema ensures:
1. ✅ Always has required keys
2. ✅ Detects filename from user input
3. ✅ Adds operations based on context
4. ✅ Uses minimal necessary parameters
5. ✅ Handles all backend requirements
