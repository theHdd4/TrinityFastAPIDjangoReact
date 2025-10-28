# ai_logic.py - DataFrame Operations Agent AI Logic

import re
import json
import logging
from typing import Dict, Any, Optional, List, Union

logger = logging.getLogger("smart.dataframe_operations.ai")

# Minimal JSON schema that covers essential DataFrame Operations
EXAMPLE_MINIMAL_DATAFRAME_JSON = {
    "success": True,
    "dataframe_config": {
        "operations": [
            {
                "operation_id": "1",
                "api_endpoint": "/load_cached",
                "parameters": {
                    "object_name": "user_filename_available_files.arrow"  # Use exact filename from user request
                }
            }
        ]
    },
    "smart_response": "Loading your data file for processing."
}

# Comprehensive JSON schema for complex operations
EXAMPLE_COMPREHENSIVE_DATAFRAME_JSON = {
    "success": True,
    "dataframe_config": {
        "operations": [
            {
                "operation_id": "1",
                "api_endpoint": "/load_cached",  # Use load_cached for existing files
                "operation_name": "load_cached",
                "description": "Load cached Arrow file into session",
                "parameters": {
                    "object_name": "client/app/project/filename.arrow"
                },
                "execute_order": 1,
                "depends_on": []
            },
            {
                "operation_id": "2", 
                "api_endpoint": "/filter_rows",
                "method": "POST",
                "operation_name": "filter_rows",
                "description": "Filter rows based on column values",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "column": "Country",
                    "value": "India"  # Can be string, number, {"min": 100, "max": 1000}, or ["val1", "val2"]
                },
                "execute_order": 2,
                "depends_on": ["1"]
            },
            {
                "operation_id": "3",
                "api_endpoint": "/sort", 
                "method": "POST",
                "operation_name": "sort_dataframe",
                "description": "Sort dataframe by column",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "column": "Date",
                    "direction": "asc"  # asc or desc
                },
                "execute_order": 3,
                "depends_on": ["2"]
            },
            {
                "operation_id": "4",
                "api_endpoint": "/insert_row",
                "method": "POST", 
                "operation_name": "insert_row",
                "description": "Insert new row at specified position",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "index": 4,
                    "direction": "below"  # above or below
                },
                "execute_order": 4,
                "depends_on": ["3"]
            },
            {
                "operation_id": "5",
                "api_endpoint": "/delete_row",
                "method": "POST",
                "operation_name": "delete_row", 
                "description": "Delete row at specified index",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "index": 10
                },
                "execute_order": 5,
                "depends_on": ["4"]
            },
            {
                "operation_id": "6",
                "api_endpoint": "/duplicate_row",
                "method": "POST",
                "operation_name": "duplicate_row",
                "description": "Duplicate row at specified index", 
                "parameters": {
                    "df_id": "auto_from_previous",
                    "index": 7
                },
                "execute_order": 6,
                "depends_on": ["5"]
            },
            {
                "operation_id": "7",
                "api_endpoint": "/insert_column",
                "method": "POST",
                "operation_name": "insert_column",
                "description": "Insert new column at specified position",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "index": 3,
                    "name": "New_Column",
                    "default": ""  # Default value for all cells
                },
                "execute_order": 7,
                "depends_on": ["6"]
            },
            {
                "operation_id": "8",
                "api_endpoint": "/delete_column",
                "method": "POST",
                "operation_name": "delete_column",
                "description": "Delete specified column",
                "parameters": {
                    "df_id": "auto_from_previous", 
                    "name": "OldColumn"
                },
                "execute_order": 8,
                "depends_on": ["7"]
            },
            {
                "operation_id": "9",
                "api_endpoint": "/duplicate_column",
                "method": "POST",
                "operation_name": "duplicate_column",
                "description": "Duplicate column with new name",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "name": "Revenue",
                    "new_name": "Revenue_copy"
                },
                "execute_order": 9,
                "depends_on": ["8"]
            },
            {
                "operation_id": "10",
                "api_endpoint": "/move_column",
                "method": "POST",
                "operation_name": "move_column",
                "description": "Move column to different position",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "from": "Date",  # Note: API uses "from" but it's a reserved word
                    "to_index": 1
                },
                "execute_order": 10,
                "depends_on": ["9"]
            },
            {
                "operation_id": "11",
                "api_endpoint": "/retype_column",
                "method": "POST",
                "operation_name": "retype_column",
                "description": "Change column data type",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "name": "Amount", 
                    "new_type": "number"  # number, string, text
                },
                "execute_order": 11,
                "depends_on": ["10"]
            },
            {
                "operation_id": "12",
                "api_endpoint": "/rename_column",
                "method": "POST",
                "operation_name": "rename_column",
                "description": "Rename column",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "old_name": "Revenue",
                    "new_name": "Sales"
                },
                "execute_order": 12,
                "depends_on": ["11"]
            },
            {
                "operation_id": "13",
                "api_endpoint": "/edit_cell",
                "method": "POST",
                "operation_name": "edit_cell",
                "description": "Edit individual cell value",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "row": 0,
                    "column": "Sales",
                    "value": 1000
                },
                "execute_order": 13,
                "depends_on": ["12"]
            },
            {
                "operation_id": "14",
                "api_endpoint": "/apply_formula",
                "method": "POST",
                "operation_name": "apply_formula",
                "description": "Apply formula to create/update column",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "target_column": "Total",
                    "formula": "=SUM(Revenue,Cost)"  # Excel-like formulas or Python expressions
                },
                "execute_order": 14,
                "depends_on": ["13"]
            },
            {
                "operation_id": "15",
                "api_endpoint": "/ai/execute_operations",
                "method": "POST",
                "operation_name": "ai_execute_batch",
                "description": "Execute multiple operations via AI",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "operations": [
                        {
                            "op": "filter_rows",
                            "params": {
                                "column": "Country",
                                "value": "India"
                            }
                        },
                        {
                            "op": "sort",
                            "params": {
                                "column": "Date", 
                                "direction": "asc"
                            }
                        }
                    ]
                },
                "execute_order": 15,
                "depends_on": ["14"]
            },
            {
                "operation_id": "16",
                "api_endpoint": "/save",
                "method": "POST",
                "operation_name": "save_dataframe",
                "description": "Save dataframe to storage",
                "parameters": {
                    "csv_data": "auto_generated_csv",  # Will be generated from current df state
                    "filename": "user_specified_filename.arrow"  # Use exact filename from user request
                },
                "execute_order": 16,
                "depends_on": ["15"]
            }
        ]
    },
    "execution_plan": {
        "auto_execute": True,  # Set to True when user wants immediate execution, False for review-first
        "execution_mode": "sequential",  # sequential, parallel, conditional
        "error_handling": "stop_on_error",  # stop_on_error, continue_on_error, rollback_on_error
        "save_intermediate": False,  # Save after each operation
        "final_save": True  # Save final result
    },
    "file_name": "user_specified_filename.csv",
    "message": "DataFrame operations configuration completed successfully",
    "smart_response": "I've configured a comprehensive DataFrame processing pipeline that will load your file, apply the specified transformations, and save the final result. The operations will be executed automatically in the correct sequence.",
    "reasoning": "User requested DataFrame operations and transformations",
    "used_memory": True
}

# Simplified single operation examples
EXAMPLE_SINGLE_OPERATION_JSON = {
    "success": True,
    "dataframe_config": {
        "operation_type": "single",
        "source_data": {
            "type": "existing_session",
            "df_id": "existing_df_id"
        },
        "operations": [
            {
                "operation_id": "1",
                "api_endpoint": "/filter_rows",
                "method": "POST",
                "operation_name": "filter_rows",
                "description": "Filter data based on user criteria",
                "parameters": {
                    "df_id": "existing_df_id",
                    "column": "Status",
                    "value": ["Active", "Pending"]
                },
                "execute_order": 1,
                "depends_on": []
            }
        ]
    },
    "execution_plan": {
        "auto_execute": True,
        "execution_mode": "sequential",
        "error_handling": "stop_on_error"
    },
    "message": "Single operation configured successfully",
    "smart_response": "I've configured a filter operation to show only Active and Pending records. This will be executed automatically.",
    "reasoning": "User requested specific data filtering",
    "used_memory": True
}

# Batch operations example
EXAMPLE_BATCH_OPERATIONS_JSON = {
    "success": True,
    "dataframe_config": {
        "operation_type": "batch",
        "source_data": {
            "type": "cached_load",
            "object_name": "path/to/dataframe.arrow"
        },
        "operations": [
            {
                "operation_id": "1",
                "api_endpoint": "/load_cached",
                "method": "POST",
                "operation_name": "load_cached",
                "description": "Load cached dataframe",
                "parameters": {
                    "object_name": "path/to/dataframe.arrow"
                },
                "execute_order": 1,
                "depends_on": []
            },
            {
                "operation_id": "2",
                "api_endpoint": "/ai/execute_operations",
                "method": "POST",
                "operation_name": "batch_operations",
                "description": "Execute multiple operations in batch",
                "parameters": {
                    "df_id": "auto_from_previous",
                    "operations": [
                        {"op": "filter_rows", "params": {"column": "Year", "value": 2023}},
                        {"op": "sort", "params": {"column": "Revenue", "direction": "desc"}},
                        {"op": "insert_column", "params": {"index": 5, "name": "Processed", "default": "Yes"}}
                    ]
                },
                "execute_order": 2,
                "depends_on": ["1"]
            }
        ]
    },
    "execution_plan": {
        "auto_execute": True,
        "execution_mode": "sequential",
        "error_handling": "stop_on_error"
    },
    "message": "Batch operations configured successfully", 
    "smart_response": "I've configured a batch processing pipeline that will load your cached data, filter for 2023 records, sort by revenue, and add a processing status column.",
    "reasoning": "User requested multiple DataFrame transformations",
    "used_memory": True
}

# 🔧 RAG SYSTEM: Exact Parameter Patterns for Each API Endpoint
# This ensures the AI always generates parameters in the exact format the backend expects
API_ENDPOINT_PARAMETER_PATTERNS = {
    "/load_cached": {
        "description": "Load a cached Arrow file into DataFrame session",
        "required_parameters": {
            "object_name": "string - EXACT filename from available_files list (e.g., 'D0_KHC_UK_Beans.arrow')"
        },
        "optional_parameters": {}
    },
    
    "/filter_rows": {
        "description": "Filter DataFrame rows based on column values",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "column": "string - Column name to filter on",
            "value": "any - Value to filter by"
        },
        "optional_parameters": {}
    },
    
    "/sort": {
        "description": "Sort DataFrame by specified column",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "column": "string - Column name to sort by"
        },
        "optional_parameters": {
            "direction": "string - Sort direction: 'asc' (default) or 'desc'"
        }
    },
    
    "/insert_row": {
        "description": "Insert a new empty row at specified position",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "index": "integer - Row index where to insert"
        },
        "optional_parameters": {
            "direction": "string - Insert direction: 'below' (default) or 'above'"
        }
    },
    
    "/delete_row": {
        "description": "Delete row at specified index",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "index": "integer - Row index to delete"
        },
        "optional_parameters": {}
    },
    
    "/duplicate_row": {
        "description": "Duplicate row at specified index",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "index": "integer - Row index to duplicate"
        },
        "optional_parameters": {}
    },
    
    "/insert_column": {
        "description": "Insert new column at specified position",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "index": "integer - Column position where to insert",
            "name": "string - Name of the new column"
        },
        "optional_parameters": {
            "default": "any - Default value for all cells (default: null)"
        }
    },
    
    "/delete_column": {
        "description": "Delete specified column",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "name": "string - Name of column to delete"
        },
        "optional_parameters": {}
    },
    
    "/duplicate_column": {
        "description": "Duplicate column with new name",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "name": "string - Name of column to duplicate",
            "new_name": "string - Name for the duplicated column"
        },
        "optional_parameters": {}
    },
    
    "/move_column": {
        "description": "Move column to new position",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "from": "string - Name of column to move (API uses 'from' alias)",
            "to_index": "integer - New position index"
        },
        "optional_parameters": {}
    },
    
    "/rename_column": {
        "description": "Rename existing column",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "old_name": "string - Current column name",
            "new_name": "string - New column name"
        },
        "optional_parameters": {}
    },
    
    "/retype_column": {
        "description": "Change column data type",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "name": "string - Column name to retype",
            "new_type": "string - New data type: 'string', 'number', 'date'"
        },
        "optional_parameters": {}
    },
    
    "/edit_cell": {
        "description": "Edit individual cell value",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "row": "integer - Row index",
            "column": "string - Column name",
            "value": "any - New cell value"
        },
        "optional_parameters": {}
    },
    
    "/apply_formula": {
        "description": "Apply Excel-like formula to create new column with comprehensive function support",
        "required_parameters": {
            "df_id": "string - DataFrame session ID (use 'auto_from_previous' for chained operations)",
            "target_column": "string - Name of column to create/update",
            "formula": "string - Formula expression with extensive function support"
        },
        "formula_capabilities": {
            "evaluation_modes": {
                "row_by_row": "Formulas starting with '=' are evaluated row-by-row with column substitution",
                "constants": "Values without '=' fill entire column with literal value"
            },
            "mathematical_functions": {
                "basic_arithmetic": ["SUM(a,b,c)", "AVG(a,b)/MEAN(a,b)", "PROD(a,b,c)", "DIV(a,b)", "MAX(a,b,c)", "MIN(a,b,c)"],
                "advanced_math": ["ABS(x)", "ROUND(x)", "FLOOR(x)", "CEIL(x)", "EXP(x)", "LOG(x)", "SQRT(x)"],
                "statistics": ["ZSCORE(column)/NORM(column) - Z-score normalization", "CORR(a,b) - Correlation"]
            },
            "string_functions": {
                "case_conversion": ["LOWER(text)", "UPPER(text)"],
                "text_manipulation": ["LEN(value)", "SUBSTR(value,start,end?)", "STR_REPLACE(value,old,new)"]
            },
            "date_functions": {
                "extraction": ["YEAR(date)", "MONTH(date)", "DAY(date)", "WEEKDAY(date)"],
                "calculations": ["DATE_DIFF(date1,date2)"]
            },
            "data_manipulation": {
                "binning": ["BIN(value,[edges...]) - Bucket numeric values into labeled bins"],
                "mapping": ["MAP(value,{from:to}) - Lookup replacement values"],
                "null_handling": ["ISNULL(value)", "FILLNA(value,replacement)"]
            },
            "conditional_logic": {
                "if_statements": ["IF(condition,true_value,false_value) - Works for numeric and string branches"]
            }
        },
        "formula_examples": {
            "mathematical": ["=SUM(Revenue,Cost)", "=DIV(Revenue,Volume)", "=SQRT(ABS(Variance))", "=ROUND(AVG(Price1,Price2),2)"],
            "statistical": ["=ZSCORE(Sales)", "=CORR(Price,Volume)", "=NORM(Revenue)"],
            "string_operations": ["=UPPER(ProductName)", "=SUBSTR(Code,1,3)", "=STR_REPLACE(Category,'Old','New')"],
            "date_operations": ["=YEAR(OrderDate)", "=DATE_DIFF(EndDate,StartDate)", "=WEEKDAY(TransactionDate)"],
            "conditional": ["=IF(Volume>100,'High','Low')", "=IF(ISNULL(Price),0,Price)", "=IF(Year>=2023,Revenue*1.1,Revenue)"],
            "binning": ["=BIN(Age,[0,18,35,65,100])", "=BIN(Score,[0,50,75,90,100])"],
            "mapping": ["=MAP(Grade,{'A':4,'B':3,'C':2,'D':1})", "=MAP(Status,{'Active':'Y','Inactive':'N'})"],
            "complex": ["=IF(Volume>0,DIV(Revenue,Volume),0)", "=FILLNA(ZSCORE(Sales),0)", "=ROUND(SUM(Q1,Q2,Q3,Q4)/4,2)"]
        },
        "optional_parameters": {}
    }
    
 
}

def build_dataframe_operations_prompt(user_prompt: str, available_files_with_columns: dict, context: str, current_df_state: dict = None) -> str:
    """
    Build a comprehensive prompt for the LLM to generate DataFrame operations configurations.
    Enhanced with complete API coverage and intelligent operation planning.
    """
    logger.info(f"Building DataFrame operations prompt for: {user_prompt[:100]}...")
    logger.info(f"📚 Conversation context length: {len(context)} characters")
    
    # Build file information string with detailed formatting
    file_info = ""
    if available_files_with_columns:
        file_info_parts = []
        for file_name, file_data in available_files_with_columns.items():
            if isinstance(file_data, dict):
                columns = file_data.get('columns', [])
            elif isinstance(file_data, list):
                columns = file_data
            else:
                columns = []
            display_name = file_name.split('/')[-1] if '/' in file_name else file_name
            # Format each file with its columns in a detailed way for the prompt
            column_list = ', '.join(columns[:8])  # Show first 8 columns
            if len(columns) > 8:
                column_list += f" ... (+{len(columns) - 8} more)"
            file_info_parts.append(f"• **{display_name}** ({len(columns)} columns): {column_list}")
        file_info = '\n'.join(file_info_parts)
    
    # Build current dataframe state info
    df_state_info = ""
    if current_df_state:
        df_state_info = f"""
📊 CURRENT DATAFRAME STATE:
{json.dumps(current_df_state, indent=2)}
"""
    
    prompt = f"""You are an intelligent DataFrame operations assistant with perfect memory and complete API knowledge. You understand all DataFrame manipulation operations and can generate comprehensive JSON configurations that automatically execute the required operations.

USER INPUT: "{user_prompt}"

📁 AVAILABLE FILES AND THEIR COLUMNS:
{json.dumps(available_files_with_columns, indent=2)}

📝 CONVERSATION CONTEXT:
{context}

{df_state_info}

🧠 CONVERSATIONAL INTELLIGENCE RULES:
1. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
2. CONTEXT AWARENESS: Understand "yes", "no", "apply that", "execute it" based on conversation
3. MEMORY UTILIZATION: Remember DataFrames user has successfully worked with before
4. PATTERN RECOGNITION: Identify user's preferred operation patterns and sequences
5. SMART RESPONSES: Build upon previous suggestions and maintain conversation flow
6. CONFIGURATION PRESERVATION: When user says "yes" or modifies previous suggestion, use the Previous Configuration JSON as base and only change what user requested
7. OPERATION CONTEXT: When user mentions operations like "filter", "sort", "add column", understand these in context of DataFrame manipulation
8. FILENAME CONTEXT: When user provides a filename, use it EXACTLY as provided without modifications

🚨 CRITICAL FILENAME RULES:

- **ALWAYS** use the EXACT filename as it appears in available_files

🔧 DATAFRAME OPERATIONS API COVERAGE:
All operations map directly to backend APIs at `/api/dataframe-operations/`:

**Data Loading Operations:**
- `/load` - Upload CSV/Excel file (FormData) - for file uploads only
- `/load_cached` - Load cached Arrow file (JSON: {{"object_name": "path"}}) - USE THIS for existing files

**Row Operations:**
- `/insert_row` - JSON: {{"df_id": "id", "index": 4, "direction": "below"}}
- `/delete_row` - JSON: {{"df_id": "id", "index": 10}}
- `/duplicate_row` - JSON: {{"df_id": "id", "index": 7}}

**Column Operations:**
- `/insert_column` - JSON: {{"df_id": "id", "index": 3, "name": "NewCol", "default": ""}}
- `/delete_column` - JSON: {{"df_id": "id", "name": "OldCol"}}
- `/duplicate_column` - JSON: {{"df_id": "id", "name": "Revenue", "new_name": "Revenue_copy"}}
- `/move_column` - JSON: {{"df_id": "id", "from": "Date", "to_index": 1}}
- `/retype_column` - JSON: {{"df_id": "id", "name": "Amount", "new_type": "number"}}
- `/rename_column` - JSON: {{"df_id": "id", "old_name": "Revenue", "new_name": "Sales"}}

**Data Manipulation:**
- `/edit_cell` - JSON: {{"df_id": "id", "row": 0, "column": "Sales", "value": 1000}}
- `/sort` - JSON: {{"df_id": "id", "column": "Date", "direction": "asc"}}
- `/filter_rows` - JSON: {{"df_id": "id", "column": "Country", "value": "India"}}
  - Simple filter: "value": "India"
  - Range filter: "value": {{"min": 100, "max": 1000}}
  - List filter: "value": ["Active", "Pending", "Complete"]

**Advanced Operations:**
- `/apply_formula` - JSON: {{"df_id": "id", "target_column": "Total", "formula": "=SUM(Col1,Col2)"}}
  **COMPREHENSIVE FORMULA SUPPORT:**
  • Mathematical: SUM, AVG/MEAN, PROD, DIV, MAX, MIN, ABS, ROUND, FLOOR, CEIL, EXP, LOG, SQRT
  • Statistical: ZSCORE/NORM (Z-score), CORR (correlation)
  • String: LOWER, UPPER, LEN, SUBSTR, STR_REPLACE
  • Date: YEAR, MONTH, DAY, WEEKDAY, DATE_DIFF
  • Data: BIN (binning), MAP (lookup), ISNULL, FILLNA
  • Conditional: IF(condition,true_value,false_value)
  **EXAMPLES:**
  • Price calculation: "=DIV(Sales,Volume)"
  • Z-score normalization: "=ZSCORE(Sales)"
  • Conditional logic: "=IF(Volume>100,'High','Low')"
  • Complex: "=IF(Volume>0,DIV(Revenue,Volume),0)"
  • Date extraction: "=YEAR(OrderDate)"
  • String manipulation: "=UPPER(ProductName)"
  • Binning: "=BIN(Age,[0,18,35,65,100])"
  • Mapping: "=MAP(Grade,{{'A':4,'B':3,'C':2,'D':1}})"
- `/ai/execute_operations` - JSON: {{"df_id": "id", "operations": [...]}}

**Utility Operations:**
- `/save` - JSON: {{"csv_data": "generated", "filename": "user_specified_name.arrow"}}
- `/preview` - GET: ?df_id=id&n=5
- `/info` - GET: ?df_id=id

🔍 OPERATION PLANNING INTELLIGENCE:
1. **Single Operation**: When user asks for one specific action
2. **Sequential Operations**: When user asks for multiple related actions
3. **Batch Operations**: When user asks for complex transformations
4. **Conditional Operations**: When operations depend on data conditions

🔧 SMART OPERATION SEQUENCING:
- **ALWAYS start with data loading** (file upload or cached load) - REQUIRED for all operations
- Apply filters before sorts for efficiency
- Do column operations (insert, rename, retype) before row operations when possible
- Apply formulas/UDFs after data structure is finalized
- Move columns AFTER they are created/inserted (ensure column exists first)
- Save as final step

🚨 CRITICAL SEQUENCING RULES:
- **NEVER generate operations without a load operation first**
- **move_column operations must come AFTER the column exists in the DataFrame**
- **All operations require a valid df_id from a previous load operation**

🧮 FORMULA INTELLIGENCE FOR APPLY_FORMULA:
**BUSINESS CALCULATIONS:**
- Price = Revenue / Volume: "=DIV(Revenue,Volume)"
- Profit Margin = (Revenue - Cost) / Revenue: "=DIV(SUM(Revenue,-Cost),Revenue)"
- Growth Rate = (New - Old) / Old: "=DIV(SUM(NewValue,-OldValue),OldValue)"


**DATA QUALITY & NORMALIZATION:**
- Handle missing values: "=FILLNA(Price,0)" or "=IF(ISNULL(Price),0,Price)"
- Normalize data: "=ZSCORE(Sales)" for standardization
- Clean text: "=UPPER(ProductName)" for consistency

**CATEGORIZATION & BINNING:**
- Size categories: "=IF(Volume>1000,'Large',IF(Volume>100,'Medium','Small'))"
- Performance tiers: "=BIN(Score,[0,50,75,90,100])"
- Status mapping: "=MAP(Code,{{'A':'Active','I':'Inactive','P':'Pending'}})"

**TIME SERIES & DATES:**
- Extract periods: "=YEAR(Date)", "=MONTH(Date)", "=WEEKDAY(Date)"
- Calculate durations: "=DATE_DIFF(EndDate,StartDate)"
- Seasonal adjustments: "=IF(MONTH(Date)>=6,Sales*1.2,Sales)"

**COMPLEX COMBINATIONS:**
- Safe division: "=IF(Volume>0,DIV(Revenue,Volume),0)"
- Normalized with fallback: "=FILLNA(ZSCORE(Sales),0)"
- Quarterly average: "=ROUND(SUM(Q1,Q2,Q3,Q4)/4,2)"

🔧 PARAMETER INTELLIGENCE:
- **df_id**: Use "auto_from_previous" for sequential operations
- **column names**: Must match actual column names from available files (case-sensitive)
- **indices**: Use realistic indices based on data size (0-based indexing, must be within bounds)
- **move_column to_index**: CRITICAL - Must be less than total number of columns (0 to column_count-1)
- **formulas**: ONLY use these supported operations: =SUM(), =AVG(), =CORR(), =PROD(), =DIV(), =MIN(), =MAX()
- **filters**: Smart detection of filter types (simple, range, list)
- **filenames**: ALWAYS use the EXACT filename provided by the user, do NOT add prefixes like "ai_" or "processed_"

🔧 ERROR HANDLING & VALIDATION:
- Validate column names exist in selected file (case-sensitive matching)
- Ensure operation sequence makes logical sense
- Check for dependencies between operations
- For move_column: Ensure to_index is within valid range (0 to column_count-1)
- For all column operations: Use exact column names from file schema
- Provide fallback options for ambiguous requests

🔧 EXECUTION MODES:
- **auto_execute: true** - Execute immediately after configuration (use when user says "do it", "execute", "apply", "run")
- **auto_execute: false** - Generate configuration only, wait for user confirmation (use when user says "show me", "prepare", "configure", "plan")
- **execution_mode**: "sequential" (default), "parallel", "conditional"
- **error_handling**: "stop_on_error" (default), "continue_on_error", "rollback_on_error"

🔧 UNDERSTANDING USER REQUESTS:

🎯 FOCUS ON: Understanding what the user wants to do with their data

✅ WHEN TO USE success: true:
- User mentions ANY file name → success: true, load that file FIRST, then do operations
- User mentions ANY operation (filter, sort, move, etc.) → success: true, BUT ALWAYS include load operation first
- User asks to "load", "use", "open", "filter", "sort", "add", "delete", "rename", "move" → success: true with proper sequencing

🚨 CRITICAL: EVERY successful operation must include a load_cached operation as the FIRST step

🔍 FILE MATCHING - CRITICAL RULES:
- **ALWAYS** use files from the available_files list - NEVER create new filenames
- Look for file names in the user's request
- Match them against available files (case-insensitive)
- If user says "uk beans" and you see "D0_KHC_UK_Beans.arrow" → use that exact file
- If user says "sales" and you see files with "sales" in the name → use that exact file
- **NEVER** generate filenames like "AI_Step_2_1758030915146.csv" - use the EXACT filename from available_files
- **NEVER** add prefixes like "ai_", "processed_", or timestamps to filenames

💡 EXAMPLES:
- "Load uk beans" → Find file with "uk" or "beans" in name → success: true, load operation
- "Filter for USA" → success: true, load + filter operations
- "Sort by revenue" → success: true, load + sort operations  
- "Load sales data and filter for 2023" → success: true, load + filter operations
- "Move price column next to sales" → success: true, load + move_column operations
- "Create new column and move it" → success: true, load + insert_column + move_column operations

🔧 SMART RESPONSE:
- Keep it simple and friendly
- Mention the file you're using
- Explain what you're doing
- Example: "I'll load your UK beans data file and process it."

🔧 FORMULA OPERATIONS - COMPREHENSIVE FUNCTION LIST:
**Mathematical:**
- SUM(colA,colB) - Add columns together
- AVG(colA,colB) / MEAN(colA,colB) - Calculate average
- PROD(colA,colB) - Multiply columns together
- DIV(colA,colB) - Divide first column by second
- MIN(colA,colB) - Find minimum value between columns
- MAX(colA,colB) - Find maximum value between columns
- ABS(x), ROUND(x,digits), FLOOR(x), CEIL(x), EXP(x), LOG(x), SQRT(x)

**Statistical:**
- CORR(colA,colB) - Calculate correlation between columns
- ZSCORE(column) / NORM(column) - Z-score normalization

**Text:**
- UPPER(text), LOWER(text), LEN(text), SUBSTR(text,start,end), STR_REPLACE(text,"old","new")
- **STR_REPLACE with blanks:** STR_REPLACE(column,"","new") - Replace blank cells when old=""

**Date:**
- YEAR(date), MONTH(date), DAY(date), WEEKDAY(date), DATE_DIFF(end,start)

**Logical:**
- IF(condition,true_value,false_value) - Conditional logic
- ISNULL(value) - Check if null

**Data Handling:**
- FILLNA(column,replacement) - Fill NULL values only
- **FILLBLANK(column,"value")** - Fill ALL blanks (NULL, empty strings, whitespace)
- BIN(value,[edges]) - Bucket values into bins
- MAP(value,{from:to}) - Map/lookup values

🔧 RESPONSE FORMAT REQUIREMENTS:
- **ALWAYS** include "smart_response" field - this is what the user sees
- **ALWAYS** validate file names and column names against available data
- **ALWAYS** provide logical operation sequences with proper dependencies
- **ALWAYS** include execution plan with appropriate settings

📊 MINIMAL SUCCESS RESPONSE FORMAT (Use this for simple requests):
{{
  "success": true,
  "dataframe_config": {{
    "operations": [
      {{
        "operation_id": "1",
        "api_endpoint": "/load_cached",
        "operation_name": "load_cached",
        "description": "Load data file into DataFrame session",
        "parameters": {{
          "object_name": "user_filename_from_available_files.arrow"
        }},
        "execute_order": 1,
        "depends_on": []
      }},
      {{
        "operation_id": "2",
        "api_endpoint": "/move_column",
        "operation_name": "move_column",
        "description": "Move column to new position",
        "parameters": {{
          "df_id": "auto_from_previous",
          "from": "ExistingColumnName",
          "to_index": 5
        }},
        "execute_order": 2,
        "depends_on": ["1"]
      }}
    ]
  }},
  "execution_plan": {{
    "auto_execute": true,
    "execution_mode": "sequential",
    "error_handling": "stop_on_error"
  }},
  "smart_response": "I'll load your data file and then move the specified column to the new position."
}}

📊 COMPREHENSIVE RESPONSE FORMAT (Use this for complex multi-step requests):
{json.dumps(EXAMPLE_COMPREHENSIVE_DATAFRAME_JSON, indent=2)}

📊 SINGLE OPERATION FORMAT:
{json.dumps(EXAMPLE_SINGLE_OPERATION_JSON, indent=2)}

🔧 ESSENTIAL PARAMETER RULES:
- Use "object_name" for loading files (never "file_path" or "filename")
- Use "df_id": "auto_from_previous" for chained operations
- Use "column" for filter/sort operations
- Use "name" for column operations
- Use "target_column" for formulas

🔧 FAILURE RESPONSE FORMAT:
{{
  "success": false,
  "suggestions": [
    "Load a CSV file first: 'Load sales.csv'",
    "Apply specific filters: 'Filter for Country = USA'", 
    "Sort data: 'Sort by Revenue descending'",
    "Transform data: 'Add calculated column for Total = Price * Quantity'",
    "Save results: 'Save as processed_data.arrow'"
  ],
  "message": "I need more specific information about what DataFrame operations you'd like me to perform.",
  "smart_response": "I'd be happy to help you with DataFrame operations! Here are your available files and their columns:\n\n📁 **Available Files:**\n{file_info}\n\nI can help you with:\n• **Data Loading**: Load any of these files for processing\n• **Filtering**: Filter rows based on column values (e.g., 'Filter Country column for USA')\n• **Sorting**: Sort data by any column (e.g., 'Sort by Revenue descending')\n• **Column Operations**: Add, delete, rename, or transform columns\n• **Formulas**: Apply calculations using =SUM(), =AVG(), =DIV(), etc.\n• **Data Transformations**: Clean, normalize, or restructure your data\n• **Saving**: Save processed results to new files\n\n💡 **How to use your data:**\nFor example, with your files you could ask:\n- 'Load [filename] and show me the first 10 rows'\n- 'Filter [filename] where [column] equals [value]'\n- 'Sort [filename] by [column] in descending order'\n- 'Add a new column to [filename] calculating [formula]'\n\nWhat specific operations would you like me to perform and which file should I use?",
  "available_files": {json.dumps(available_files_with_columns, indent=2)},
  "next_steps": [
    "Tell me which file you want to work with",
    "Specify what operations you need (filter, sort, transform, etc.)",
    "Describe your desired outcome",
    "Ask about specific DataFrame manipulations"
  ]
}}

🔧 CRITICAL INSTRUCTIONS:
- ALWAYS return valid JSON
- ALWAYS include smart_response field (REQUIRED) - this is what the user sees
- ALWAYS include execution_plan with auto_execute: true (REQUIRED for operations to run)
- USE MINIMAL JSON: Include essential keys - success, dataframe_config.operations, execution_plan, smart_response- DETECT FILENAME: Extract filename from user input and convert to .arrow format
- USE CORRECT ENDPOINTS: ALWAYS use "/load_cached" for existing files, NEVER use "/load_file"
- **MANDATORY SEQUENCING**: EVERY operation sequence MUST start with "/load_cached" as operation_id "1"
- ADD OPERATIONS: Based on user context (sort, filter, move, etc.), add operations AFTER file loading
- If user asks vague questions → Return suggestions with success: false
- If user asks for specific operations → Generate dataframe_config with load_cached FIRST, then the requested operation
- VALIDATE: Ensure all column names and file names exist in available data
- SEQUENCE: Always start with file loading using "/load_cached", then add operations in logical order with proper dependencies
- **MOVE COLUMN RULE**: Only generate move_column operations for columns that exist or were created in previous operations
- **COLUMN TRACKING**: When generating sequences with insert_column + move_column, ensure move_column references the newly created column name
- **DEPENDENCY VALIDATION**: Ensure move_column operations depend on insert_column/apply_formula operations that create the target column
- EXECUTE: Set auto_execute based on user intent:
  * auto_execute: true - When user wants immediate action (DEFAULT for most requests)
  * auto_execute: false - Only when user explicitly wants to review first ("show me", "prepare", "configure", "plan")
- FILENAME PRESERVATION: Use EXACT filenames provided by user - NEVER add prefixes like "ai_", "processed_", etc.

🔧 SMART_RESPONSE EXAMPLES:
- Success: "I've configured a data processing pipeline that will load your file, apply the filters you requested, and save the cleaned results. The operations will execute automatically in the correct sequence."
- Clarification: "I can help you with DataFrame operations! I can see you have these files available: {file_info}. What specific operations would you like me to perform - filtering, sorting, transforming, or something else?"

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. Return the JSON object directly.

🔧 FINAL VALIDATION:
- All operation parameters must match actual API requirements
- All column names must exist in the selected file
- All file names must exist in available files
- Operation sequence must be logically sound
- Dependencies must be correctly specified
- Execution plan must be appropriate for the requested operations

RESPOND WITH VALID JSON ONLY."""

    return prompt

def call_dataframe_operations_llm(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call the LLM API with the DataFrame operations prompt"""
    import requests
    
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": model_name,
        "messages": [
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 3000,  # Increased for complex configurations
        "stream": False
    }
    
    try:
        logger.info(f"🔍 DataFrame Operations LLM API Request - URL: {api_url}")
        logger.info(f"🔍 DataFrame Operations LLM API Request - Model: {model_name}")
        
        response = requests.post(api_url, headers=headers, json=data, timeout=300)
        response.raise_for_status()
        
        response_text = response.text.strip()
        logger.info(f"🔍 DataFrame Operations LLM API Response - Status: {response.status_code}")
        logger.info(f"🔍 DataFrame Operations LLM API Response - Length: {len(response_text)} characters")
        
        # Handle streaming response format (same as explore agent)
        if response_text.count('{') > 1:
            logger.info("Detected streaming response format, extracting final content...")
            
            lines = response_text.split('\n')
            final_content = ""
            
            for line in lines:
                line = line.strip()
                if line and line.startswith('{') and line.endswith('}'):
                    try:
                        chunk = json.loads(line)
                        if "message" in chunk and "content" in chunk["message"]:
                            content = chunk["message"]["content"]
                            if content and content not in ["<think>", "\n", "Okay"]:
                                final_content += content
                    except json.JSONDecodeError:
                        continue
            
            if final_content:
                logger.info(f"Extracted content from streaming response: {len(final_content)} characters")
                return final_content
            else:
                logger.warning("No valid content found in streaming response")
                return response_text
        
        # Handle single JSON response
        try:
            result = response.json()
            
            if "choices" in result and len(result["choices"]) > 0:
                return result["choices"][0]["message"]["content"]
            elif "message" in result and "content" in result["message"]:
                return result["message"]["content"]
            else:
                logger.error(f"Unexpected response structure: {result}")
                return str(result)
                
        except requests.exceptions.JSONDecodeError as json_error:
            logger.error(f"JSON decode error: {json_error}")
            logger.error(f"Response content: {response_text[:500]}...")
            
            # Try to extract content from the raw response
            if '"content":' in response_text:
                start = response_text.find('"content":"') + 11
                end = response_text.find('"', start)
                if start > 10 and end > start:
                    extracted_content = response_text[start:end]
                    extracted_content = extracted_content.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
                    return extracted_content
            
            return response_text
            
    except requests.exceptions.ConnectionError as e:
        logger.error(f"Could not reach AI service at {api_url}: {e}")
        raise Exception(f"Could not reach AI service. Please check if the LLM service is running at {api_url}")
    except requests.exceptions.Timeout as e:
        logger.error(f"AI service timeout: {e}")
        raise Exception(f"AI service timeout. The request took too long to complete.")
    except requests.exceptions.RequestException as e:
        logger.error(f"Request failed: {e}")
        raise Exception(f"AI service request failed: {str(e)}")
    except Exception as e:
        logger.error(f"DataFrame Operations LLM API call failed: {e}")
        raise Exception(f"AI service error: {str(e)}")

def extract_dataframe_operations_json(text: str, available_files_with_columns: dict) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from LLM response with comprehensive validation for DataFrame operations.
    """
    if not text or not text.strip():
        logger.warning("🔍 JSON Extraction - Empty or None text provided")
        return None
    
    text = text.strip()
    
    # Remove <think> tags if present
    if '<think>' in text and '</think>' in text:
        think_end = text.find('</think>')
        if think_end != -1:
            text = text[think_end + 8:].strip()
            logger.info("🔍 JSON Extraction - Removed <think> tags")
    
    logger.info(f"🔍 DataFrame Operations JSON Extraction - Input length: {len(text)}")
    
    # JSON extraction patterns (same as explore agent)
    json_patterns = [
        r'```json\s*(\{.*?\})\s*```',
        r'```\s*(\{.*?\})\s*```',
    ]
    
    for pattern in json_patterns:
        matches = re.findall(pattern, text, re.DOTALL | re.IGNORECASE)
        for match in matches:
            try:
                result = json.loads(match)
                logger.info("✅ Successfully extracted JSON using pattern matching")
                return _validate_dataframe_operations_json(result, available_files_with_columns)
            except json.JSONDecodeError as e:
                logger.debug(f"JSON decode error with pattern {pattern}: {e}")
                continue
    
    # Fallback: Find JSON by counting braces
    def find_complete_json(text):
        start = text.find('{')
        if start == -1:
            return None
        
        brace_count = 0
        for i, char in enumerate(text[start:], start):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    return text[start:i+1]
        return None
    
    complete_json = find_complete_json(text)
    if complete_json:
        try:
            result = json.loads(complete_json)
            logger.info("✅ Successfully extracted JSON using brace counting")
            return _validate_dataframe_operations_json(result, available_files_with_columns)
        except json.JSONDecodeError as e:
            logger.debug(f"JSON decode error with brace counting: {e}")
    
    # Final fallback: Try bracket matching
    try:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_str = text[start:end+1]
            result = json.loads(json_str)
            logger.info("✅ Successfully extracted JSON using bracket matching")
            return _validate_dataframe_operations_json(result, available_files_with_columns)
    except json.JSONDecodeError as e:
        logger.debug(f"JSON decode error with bracket matching: {e}")
    
    # If all parsing fails, create helpful fallback response
    logger.warning("Could not extract valid JSON from LLM response")
    logger.warning(f"Response preview: {text[:200]}...")
    
    # Try to extract smart_response from malformed JSON
    smart_response = text.strip()
    if '"smart_response":' in text:
        try:
            start = text.find('"smart_response":"') + 18
            end = text.find('"', start)
            if start > 17 and end > start:
                smart_response = text[start:end]
                smart_response = smart_response.replace('\\"', '"').replace('\\n', '\n').replace('\\t', '\t')
        except:
            pass
    
    # Create helpful fallback with detailed file information
    if not smart_response or smart_response == text.strip():
        file_info = ""
        if available_files_with_columns:
            file_info_parts = []
            for file_name, file_data in available_files_with_columns.items():
                if isinstance(file_data, dict):
                    columns = file_data.get('columns', [])
                elif isinstance(file_data, list):
                    columns = file_data
                else:
                    columns = []
                display_name = file_name.split('/')[-1] if '/' in file_name else file_name
                # Format each file with its columns in a more detailed way
                column_list = ', '.join(columns[:8])  # Show first 8 columns
                if len(columns) > 8:
                    column_list += f" ... (+{len(columns) - 8} more)"
                file_info_parts.append(f"• **{display_name}** ({len(columns)} columns): {column_list}")
            file_info = '\n'.join(file_info_parts)
        
        smart_response = f"""I'd be happy to help you with DataFrame operations! Here are your available files and their columns:

📁 **Available Files:**
{file_info}

I can help you with:
• **Data Loading**: Load any of these files for processing
• **Filtering**: Filter rows based on column values (e.g., 'Filter Country column for USA')
• **Sorting**: Sort data by any column (e.g., 'Sort by Revenue descending')
• **Column Operations**: Add, delete, rename, or transform columns
• **Formulas**: Apply calculations using =SUM(), =AVG(), =DIV(), etc.
• **Data Transformations**: Clean, normalize, or restructure your data
• **Saving**: Save processed results to new files

💡 **How to use your data:**
For example, with your files you could ask:
- 'Load [filename] and show me the first 10 rows'
- 'Filter [filename] where [column] equals [value]'
- 'Sort [filename] by [column] in descending order'
- 'Add a new column to [filename] calculating [formula]'

What specific operations would you like me to perform and which file should I use?"""
    
    logger.info("Using LLM response as smart_response fallback")
    
    return {
        "success": False, 
        "message": "Could not parse LLM response as valid JSON",
        "smart_response": smart_response,
        "suggestions": [
            "Try being more specific about what DataFrame operations you want",
            "Ask about filtering, sorting, adding columns, or transforming data",
            "Specify which file you want to work with",
            "Describe the exact changes you want to make to your data"
        ],
        "next_steps": [
            "Tell me which file you want to work with",
            "Specify what operations you need (filter, sort, transform, etc.)",
            "Describe your desired outcome",
            "Ask about specific DataFrame manipulations"
        ],
        "raw_response": text
    }

def _validate_dataframe_operations_json(result: Dict[str, Any], available_files_with_columns: dict) -> Optional[Dict[str, Any]]:
    """
    Validate the extracted JSON for DataFrame operations requirements.
    """
    if not isinstance(result, dict):
        logger.warning("❌ Extracted JSON is not a dictionary")
        return None
    
    # Check for required fields
    if 'success' not in result:
        logger.warning("❌ Missing 'success' field in JSON")
        return None
    
    # If success is True, validate dataframe_config
    if result.get('success') and 'dataframe_config' not in result:
        logger.warning("❌ Missing 'dataframe_config' field in successful response")
        return None
    
    # Validate dataframe_config structure if present
    if 'dataframe_config' in result:
        df_config = result['dataframe_config']
        if not isinstance(df_config, dict):
            logger.warning("❌ dataframe_config is not a dictionary")
            return None
        
        # Check for required fields in dataframe_config - only operations is truly required
        required_fields = ['operations']
        for field in required_fields:
            if field not in df_config:
                logger.warning(f"❌ dataframe_config missing required field: {field}")
                return None
        
        # Validate operations list
        operations = df_config.get('operations', [])
        if not isinstance(operations, list):
            logger.warning("❌ operations is not a list")
            return None
        
        # Validate each operation
        for i, op in enumerate(operations):
            if not isinstance(op, dict):
                logger.warning(f"❌ Operation {i} is not a dictionary")
                return None
            
            # Check for minimal required operation fields
            required_op_fields = ['operation_id', 'api_endpoint', 'parameters']
            for field in required_op_fields:
                if field not in op:
                    logger.warning(f"❌ Operation {i} missing required field: {field}")
                    return None
        
        # Validate file references if present
        if 'source_data' in df_config:
            source_data = df_config['source_data']
            if isinstance(source_data, dict):
                if source_data.get('type') == 'file_upload' and 'file_path' in source_data:
                    file_path = source_data['file_path']
                    # Check if file exists in available files
                    if available_files_with_columns:
                        file_found = False
                        for available_file in available_files_with_columns.keys():
                            if file_path in available_file or available_file.endswith(file_path):
                                file_found = True
                                break
                        if not file_found:
                            logger.warning(f"❌ File '{file_path}' not found in available files")
                            # Don't return None here, just log warning - let frontend handle
    
    logger.info("✅ DataFrame operations JSON validation passed")
    return result
