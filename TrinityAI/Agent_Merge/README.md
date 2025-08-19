# Smart Merge Agent - Enhanced Version

## Overview

The Smart Merge Agent is an intelligent, LLM-driven system that automatically handles file merge operations with advanced column detection and smart JSON generation. It eliminates the need for manual configuration by leveraging AI to understand user intent and automatically determine the optimal merge parameters.

<<<<<<< HEAD
- `POST http://192.168.1.98:8002/merge` – generate merge settings from a prompt.
- `GET http://192.168.1.98:8002/history/{session_id}` – view conversation history.
- `GET http://192.168.1.98:8002/debug/{session_id}` – debug a merge session.
- `DELETE http://192.168.1.98:8002/session/{session_id}` – clear a session.
- `GET http://192.168.1.98:8002/sessions` – list active sessions.
- `GET http://192.168.1.98:8002/files` – list available files.
- `POST http://192.168.1.98:8002/reload-files` – reload file metadata from MinIO.
- `GET http://192.168.1.98:8002/health` – health information.
=======
## Key Features
>>>>>>> a59d29f1db03fba2026dfd5af31e85c15f2042a0

### 🧠 **LLM-Driven JSON Generation**
- **No Manual Configuration**: The LLM automatically generates all merge configuration JSON
- **Intelligent Parsing**: Understands natural language requests and converts them to structured merge operations
- **Context Awareness**: Remembers previous successful merge patterns and user preferences

### 🔍 **LLM-Driven Column Analysis**
- **Automatic Column Detection**: The LLM automatically analyzes files and finds common columns
- **Smart Join Column Selection**: AI determines the most logical join column based on data semantics
- **No Manual Configuration**: Everything is handled automatically by the language model

### 🎯 **Smart Join Type Selection**
- **Default to Outer Join**: Uses "outer" as the default join type for maximum data preservation
- **User Preference Learning**: Remembers and applies user's preferred join types from previous operations
- **Flexible Configuration**: Supports inner, left, right, and outer join types

### 💾 **Enhanced Memory System**
- **Session Management**: Maintains conversation history and successful configurations
- **Pattern Recognition**: Learns from user's successful merge patterns
- **Contextual Suggestions**: Provides intelligent recommendations based on historical usage

## Architecture

### Core Components

1. **SmartMergeAgent** (`llm_merge.py`)
   - Main agent class handling all merge operations
   - Automatic file loading and column detection
   - Session management and memory persistence

2. **AI Logic Module** (`ai_logic.py`)
   - LLM prompt engineering for merge operations
   - JSON extraction and validation
   - Intelligent response processing

3. **FastAPI Router** (`main_app.py`)
   - RESTful API endpoints for merge operations
   - Health monitoring and debugging tools
   - Common column analysis endpoints

### Data Flow

```
User Request → Context Enhancement → LLM Processing → JSON Generation → Validation → Response
     ↓              ↓                    ↓              ↓              ↓          ↓
Natural Language → Column Analysis → AI Processing → Merge Config → Defaults → Final Result
```

## API Endpoints

### Core Operations

- **`POST /merge`** - Process merge requests with automatic configuration
- **`GET /files`** - List all available files with their columns
- **`GET /common-columns/{file1}/{file2}`** - Analyze common columns between files

### Session Management

- **`GET /history/{session_id}`** - Retrieve conversation history
- **`DELETE /session/{session_id}`** - Clear session data
- **`GET /sessions`** - List active sessions

### System Health

- **`GET /health`** - Service status and capabilities
- **`POST /reload-files`** - Refresh file list from storage

## Usage Examples

### Basic Merge Request
```bash
curl -X POST "http://localhost:8000/merge" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "merge orders.csv with customers.csv",
    "session_id": "user123"
  }'
```

### Response Structure
```json
{
  "success": true,
  "merge_json": {
    "bucket_name": "trinity",
    "file1": ["orders.csv"],
    "file2": ["customers.csv"],
    "join_columns": ["customer_id"],
    "join_type": "outer"
  },
  "message": "Merge configuration completed successfully",
  "reasoning": "Found common column 'customer_id' between files",
  "used_memory": true,
  "session_id": "user123"
}
```

### Common Column Analysis
```bash
curl "http://localhost:8000/common-columns/orders.csv/customers.csv"
```

## Configuration

### Environment Variables

```bash
# LLM Configuration
LLM_API_URL=http://localhost:11434/api/chat
LLM_MODEL_NAME=deepseek-r1:32b
LLM_BEARER_TOKEN=your_token

# MinIO Configuration
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET=trinity
MINIO_PREFIX=client/app/project/
```

### Default Values

- **Join Type**: `outer` (preserves all data from both files)
- **Bucket Name**: `trinity`
- **File Format Support**: `.csv`, `.xlsx`, `.xls`, `.arrow`

## Intelligent Features

### LLM-Driven Column Analysis
The system works by:
1. Loading file metadata and column information
2. Providing this information to the LLM for analysis
3. Letting the AI automatically find common columns and suggest join strategies
4. Generating complete merge configurations without manual intervention

### Smart Defaults
- **Join Type**: Defaults to "outer" for maximum data preservation
- **Bucket**: Automatically sets to "trinity" if not specified
- **Columns**: Automatically selects the most logical common column

### Context-Aware Processing
- Remembers successful merge patterns
- Learns user preferences for join types
- Provides contextual suggestions based on conversation history
- Handles conversational responses like "yes", "no", "use those files"

## Testing

Run the test script to verify functionality:

```bash
cd TrinityFastAPIDjangoReact/TrinityAI/Agent_Merge
python test_merge_agent.py
```

## Benefits

### For Users
- **No Manual Configuration**: Simply describe what you want to merge
- **Intelligent Suggestions**: Get smart recommendations based on your data
- **Faster Operations**: Eliminate time spent on manual merge setup
- **Error Reduction**: AI handles complex merge logic automatically

### For Developers
- **Clean API**: Simple REST endpoints with intelligent processing
- **Extensible Architecture**: Easy to add new file formats and merge types
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Session Management**: Built-in conversation tracking and memory

## Future Enhancements

- **Advanced Column Mapping**: Support for custom column name mappings
- **Data Quality Analysis**: Automatic detection of data quality issues
- **Performance Optimization**: Caching and optimization for large datasets
- **Multi-Table Merges**: Support for merging more than two files simultaneously

## Support

For issues or questions:
1. Check the health endpoint for service status
2. Review logs for detailed error information
3. Use the common-columns endpoint for debugging column issues
4. Test with the provided test script

---

**Note**: This enhanced merge agent is designed to work seamlessly with the existing Trinity AI infrastructure and provides a significant improvement in user experience by eliminating manual configuration requirements.
