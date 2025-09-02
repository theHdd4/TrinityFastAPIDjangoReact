# Chart Maker AI Agent - Enhanced Version

## Overview

The **Enhanced Chart Maker AI Agent** is a sophisticated LLM-powered system that generates chart configurations based on natural language prompts. It has been completely transformed to match the **Merge Agent's robust functionality**, providing the same user-friendly experience with active MinIO file loading, enhanced column analysis, and intelligent chart suggestions.

## 🚀 **Key Enhancements (Now Matching Merge Agent)**

### 🧠 **LLM-Driven Chart Generation**
- **No Manual Configuration**: The LLM automatically generates all chart configuration JSON
- **Intelligent Parsing**: Understands natural language requests and converts them to structured chart operations
- **Context Awareness**: Remembers previous successful chart patterns and user preferences

### 🔍 **LLM-Driven Column Analysis**
- **Automatic Column Detection**: The LLM automatically analyzes files and finds appropriate columns
- **Smart Axis Selection**: AI determines the most logical x/y columns based on data semantics
- **No Manual Configuration**: Everything is handled automatically by the language model

### 🎯 **Smart Chart Type Selection**
- **Default to Bar Chart**: Uses "bar" as the default chart type for maximum compatibility
- **User Preference Learning**: Remembers and applies user's preferred chart types from previous operations
- **Flexible Configuration**: Supports line, bar, area, pie, and scatter charts with intelligent defaults

### 💾 **Enhanced Memory System**
- **Session Management**: Maintains conversation history and successful configurations
- **Pattern Recognition**: Learns from user's successful chart patterns
- **Contextual Suggestions**: Provides intelligent recommendations based on historical usage

## Architecture

### Core Components

1. **ChartMakerAgent** (`llm_chartmaker.py`)
   - Main agent class handling all chart operations
   - **ACTIVE MinIO file loading and column detection** (like Merge agent)
   - Session management and memory persistence
   - Enhanced column analysis with metadata

2. **AI Logic Module** (`ai_logic.py`)
   - LLM prompt engineering for chart operations
   - **Robust JSON extraction** (like Merge agent)
   - Intelligent response processing with multiple fallback patterns

3. **FastAPI Router** (`main_app.py`)
   - RESTful API endpoints for chart operations
   - Health monitoring and debugging tools
   - Enhanced logging and error handling

### Data Flow

```
User Request → Context Enhancement → LLM Processing → JSON Generation → Validation → Response
     ↓              ↓                    ↓              ↓              ↓          ↓
Natural Language → Column Analysis → AI Processing → Chart Config → Defaults → Final Result
```

## API Endpoints

### Core Operations

- **`POST /trinityai/chart-maker/chart`** - Process chart requests with automatic configuration
- **`GET /files`** - List all available files with their columns
- **`POST /set-file-context`** - Set file context for chart generation

### Session Management

- **`GET /chart/history/{session_id}`** - Retrieve conversation history
- **`GET /file-context`** - Get current file context information
- **`GET /chart/health`** - Service status and capabilities

## Usage Examples

### Basic Chart Request
```bash
curl -X POST "http://localhost:8000/trinityai/chart-maker/chart" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "create a bar chart showing sales by region",
    "session_id": "user123"
  }'
```

### Response Structure
```json
{
  "success": true,
  "chart_json": {
    "chart_type": "bar",
    "traces": [
      {
        "x_column": "Region",
        "y_column": "Sales",
        "name": "Sales by Region",
        "chart_type": "bar",
        "aggregation": "sum"
      }
    ],
    "title": "Sales by Region"
  },
  "message": "Chart configuration completed successfully",
  "reasoning": "Found appropriate columns for bar chart visualization",
  "used_memory": true,
  "session_id": "user123",
  "file_name": "sales_data.arrow",
  "data_source": "sales_data.arrow"
}
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

- **Chart Type**: `bar` (preserves all data visualization options)
- **Bucket Name**: `trinity`
- **File Format Support**: `.arrow`, `.parquet`, `.feather`

## Intelligent Features

### LLM-Driven Column Analysis
The system works by:
1. **Loading file metadata and column information** from MinIO (ACTIVE like Merge agent)
2. Providing this information to the LLM for analysis
3. Letting the AI automatically find appropriate x/y columns and suggest chart strategies
4. Generating complete chart configurations without manual intervention

### Smart Defaults
- **Chart Type**: Defaults to "bar" for maximum compatibility
- **Bucket**: Automatically sets to "trinity" if not specified
- **Columns**: Automatically selects the most logical x/y columns

### Context-Aware Processing
- Remembers successful chart patterns
- Learns user preferences for chart types
- Provides contextual suggestions based on conversation history
- Handles conversational responses like "yes", "no", "use those columns", "create chart"

## Testing

Run the test script to verify functionality:

```bash
cd TrinityFastAPIDjangoReact/TrinityAI/Agent_chartmaker
python test_chart_agent.py
```

## Benefits

### For Users
- **No Manual Configuration**: Simply describe what chart you want to create
- **Intelligent Suggestions**: Get smart recommendations based on your data
- **Faster Operations**: Eliminate time spent on manual chart setup
- **Error Reduction**: AI handles complex chart logic automatically

### For Developers
- **Clean API**: Simple REST endpoints with intelligent processing
- **Extensible Architecture**: Easy to add new chart types and features
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Session Management**: Built-in conversation tracking and memory

## **Comparison with Merge Agent**

| Feature | Chart Maker Agent | Merge Agent |
|---------|------------------|-------------|
| **File Loading** | ✅ **ACTIVE** - Loads from MinIO on initialization | ✅ **ACTIVE** - Loads from MinIO on initialization |
| **MinIO Integration** | ✅ **Full Integration** - Dynamic prefix updates | ✅ **Full Integration** - Dynamic prefix updates |
| **File Discovery** | ✅ **Automatic** - Scans MinIO bucket | ✅ **Automatic** - Scans MinIO bucket |
| **Column Extraction** | ✅ **Real-time** - Reads actual file contents | ✅ **Real-time** - Reads actual file contents |
| **Memory Usage** | ✅ **Heavy** - Stores file metadata and columns | ✅ **Heavy** - Stores file metadata and columns |
| **Performance** | ✅ **Robust** - Self-contained file management | ✅ **Robust** - Self-contained file management |

## Future Enhancements

- **Advanced Chart Types**: Support for more complex visualizations
- **Data Type Inference**: Automatic column type detection
- **Template System**: Pre-built chart templates for common use cases
- **Performance Optimization**: Caching and optimization for large datasets

## Support

For issues or questions:
1. Check the health endpoint for service status
2. Review logs for detailed error information
3. Use the files endpoint for debugging file issues
4. Test with the provided test script

---

**Note**: This enhanced chart maker agent is designed to work seamlessly with the existing Trinity AI infrastructure and provides the **exact same robust functionality** as the Merge agent, ensuring consistency across all AI agents in the system.
