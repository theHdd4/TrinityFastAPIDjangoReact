# Explore AI Agent - Enhanced Version with Full AI Integration

## Overview

The **Enhanced Explore AI Agent** is a sophisticated LLM-powered system that generates data exploration configurations based on natural language prompts. It has been completely transformed to match the **Chart Maker Agent's robust functionality**, providing the same user-friendly experience with active MinIO file loading, enhanced column analysis, intelligent exploration suggestions, and **full integration with the Explore Atom backend system**.

## 🚀 **Key Enhancements (Now Matching Chart Maker Agent)**

### 🧠 **LLM-Driven Exploration Generation**
- **No Manual Configuration**: The LLM automatically generates all exploration configuration JSON
- **Intelligent Parsing**: Understands natural language requests and converts them to structured exploration operations
- **Context Awareness**: Remembers previous successful exploration patterns and user preferences
- **Multi-Exploration Support**: Can generate multiple complementary analyses in a single request

### 🔍 **LLM-Driven Column Analysis**
- **Automatic Column Detection**: The LLM automatically analyzes files and finds appropriate columns
- **Smart Analysis Selection**: AI determines the most logical exploration strategy based on data semantics
- **No Manual Configuration**: Everything is handled automatically by the language model
- **Intelligent Mapping**: Maps user intent to specific data columns and metrics

### 🎯 **Smart Exploration Type Selection**
- **Intelligent Defaults**: AI selects optimal exploration types based on data characteristics
- **User Preference Learning**: Remembers and applies user's preferred exploration types from previous operations
- **Flexible Configuration**: Supports multiple exploration types with intelligent defaults
- **Context-Aware Suggestions**: Provides relevant exploration options based on available data

### 💾 **Enhanced Memory System**
- **Session Management**: Maintains conversation history and successful configurations
- **Pattern Recognition**: Learns from user's successful exploration patterns
- **Contextual Suggestions**: Provides intelligent recommendations based on historical usage
- **Comprehensive Context**: Builds rich context from complete conversation history

### 🔗 **Explore Atom Backend Integration**
- **Seamless Workflow Execution**: Direct integration with Explore Atom APIs
- **Real-time Data Processing**: Generates chart-ready data through backend
- **Configuration Persistence**: Saves exploration configurations to MongoDB
- **Caching Support**: Leverages Redis for performance optimization

## Architecture

### Core Components

1. **ExploreAgent** (`llm_explore.py`)
   - Main agent class handling all exploration operations
   - **ACTIVE MinIO file loading and column detection** (like Chart Maker agent)
   - Session management and memory persistence
   - Enhanced column analysis with metadata

2. **AI Logic Module** (`ai_logic.py`)
   - LLM prompt engineering for exploration operations
   - **Robust JSON extraction** (like Chart Maker agent)
   - Intelligent response processing with multiple fallback patterns

3. **FastAPI Router** (`main_app.py`)
   - RESTful API endpoints for exploration operations
   - Health monitoring and debugging tools
   - Enhanced logging and error handling

### Data Flow

```
User Request → Context Enhancement → LLM Processing → JSON Generation → Validation → Response
     ↓              ↓                    ↓              ↓              ↓          ↓
Natural Language → Column Analysis → AI Processing → Exploration Config → Defaults → Final Result
```

## API Endpoints

### Core Operations

- **`POST /trinityai/explore-agent/explore`** - Process exploration requests with automatic configuration
- **`POST /trinityai/explore-agent/explore/execute`** - Execute complete Explore Atom workflow with AI configuration
- **`POST /trinityai/explore-agent/chat`** - Conversational interface for data exploration
- **`GET /trinityai/explore-agent/files`** - List all available files with their columns
- **`POST /trinityai/explore-agent/set-file-context`** - Set file context for exploration

### Session Management

- **`GET /trinityai/explore-agent/explore/history/{session_id}`** - Retrieve conversation history
- **`GET /trinityai/explore-agent/file-context`** - Get current file context information
- **`GET /trinityai/explore-agent/explore/health`** - Service status and capabilities

### AI Integration Features

- **Natural Language Processing**: Understands complex exploration requests
- **Multi-Exploration Support**: Generates multiple complementary analyses
- **Context Awareness**: Maintains conversation history and user preferences
- **Intelligent Suggestions**: Provides relevant exploration options
- **Backend Integration**: Seamless integration with Explore Atom system

## Usage Examples

### Basic Exploration Request
```bash
curl -X POST "http://localhost:8000/trinityai/explore-agent/explore" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "analyze sales patterns by region and identify outliers",
    "session_id": "user123"
  }'
```

### Complete Workflow Execution
```bash
curl -X POST "http://localhost:8000/trinityai/explore-agent/explore/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "show me sales trends by region and create a dashboard",
    "session_id": "user123"
  }'
```

### Conversational Interface
```bash
curl -X POST "http://localhost:8000/trinityai/explore-agent/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "what can I discover in my customer data?",
    "session_id": "user123"
  }'
```

### Response Structure
```json
{
  "success": true,
  "exploration_config": [
    {
      "exploration_id": "1",
      "exploration_type": "pattern_analysis",
      "target_columns": ["sales", "region"],
      "analysis_method": "correlation_study",
      "visualization_type": "scatter",
      "insights_focus": "sales_patterns_by_region",
      "description": "Analyze sales patterns across different regions to identify correlations and trends"
    }
  ],
  "message": "Exploration configuration completed successfully",
  "reasoning": "Found appropriate columns for pattern analysis",
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

- **Exploration Type**: `pattern_analysis` (preserves all data analysis options)
- **Bucket Name**: `trinity`
- **File Format Support**: `.arrow`, `.parquet`, `.feather`

## Intelligent Features

### LLM-Driven Column Analysis
The system works by:
1. **Loading file metadata and column information** from MinIO (ACTIVE like Chart Maker agent)
2. Providing this information to the LLM for analysis
3. Letting the AI automatically find appropriate columns and suggest exploration strategies
4. Generating complete exploration configurations without manual intervention

### Smart Defaults
- **Exploration Type**: Defaults to "pattern_analysis" for maximum compatibility
- **Bucket**: Automatically sets to "trinity" if not specified
- **Columns**: Automatically selects the most logical columns for analysis

### Context-Aware Processing
- Remembers successful exploration patterns
- Learns user preferences for exploration types
- Provides contextual suggestions based on conversation history
- Handles conversational responses like "yes", "no", "use those columns", "analyze data"

## Supported Exploration Types

### Analysis Types
- **pattern_analysis**: Find patterns, correlations, and relationships in data
- **trend_analysis**: Analyze time-based trends and seasonal patterns
- **outlier_detection**: Identify unusual data points and anomalies
- **statistical_summary**: Generate descriptive statistics and summaries
- **clustering_analysis**: Group similar data points together
- **dimensionality_reduction**: Reduce data complexity for better visualization

### Analysis Methods
- **correlation_study**: Analyze relationships between variables
- **time_series_analysis**: Study patterns over time
- **statistical_analysis**: Apply statistical tests and measures
- **clustering**: Group data by similarity
- **regression_analysis**: Model relationships between variables
- **distribution_analysis**: Study data distributions and shapes

### Visualization Types
- **scatter**: Show relationships between two variables
- **line**: Display trends over time
- **bar**: Compare categories
- **box**: Show distributions and outliers
- **histogram**: Display frequency distributions
- **heatmap**: Show correlation matrices
- **area**: Display cumulative trends

## Testing

Run the test script to verify functionality:

```bash
cd TrinityFastAPIDjangoReact/TrinityAI/Agent_explore
python test_explore_agent.py
```

## Benefits

### For Users
- **No Manual Configuration**: Simply describe what analysis you want to perform
- **Intelligent Suggestions**: Get smart recommendations based on your data
- **Faster Operations**: Eliminate time spent on manual exploration setup
- **Error Reduction**: AI handles complex analysis logic automatically

### For Developers
- **Clean API**: Simple REST endpoints with intelligent processing
- **Extensible Architecture**: Easy to add new exploration types and features
- **Comprehensive Logging**: Detailed logs for debugging and monitoring
- **Session Management**: Built-in conversation tracking and memory

## **Comparison with Chart Maker Agent**

| Feature | Explore Agent | Chart Maker Agent |
|---------|---------------|-------------------|
| **File Loading** | ✅ **ACTIVE** - Loads from MinIO on initialization | ✅ **ACTIVE** - Loads from MinIO on initialization |
| **MinIO Integration** | ✅ **Full Integration** - Dynamic prefix updates | ✅ **Full Integration** - Dynamic prefix updates |
| **File Discovery** | ✅ **Automatic** - Scans MinIO bucket | ✅ **Automatic** - Scans MinIO bucket |
| **Column Extraction** | ✅ **Real-time** - Reads actual file contents | ✅ **Real-time** - Reads actual file contents |
| **Memory Usage** | ✅ **Heavy** - Stores file metadata and columns | ✅ **Heavy** - Stores file metadata and columns |
| **Performance** | ✅ **Robust** - Self-contained file management | ✅ **Robust** - Self-contained file management |

## Future Enhancements

- **Advanced Analysis Types**: Support for more complex statistical analyses
- **Data Type Inference**: Automatic column type detection and validation
- **Template System**: Pre-built exploration templates for common use cases
- **Performance Optimization**: Caching and optimization for large datasets
- **Integration with Visualization**: Direct chart generation from exploration results

## Support

For issues or questions:
1. Check the health endpoint for service status
2. Review logs for detailed error information
3. Use the files endpoint for debugging file issues
4. Test with the provided test script

---

**Note**: This enhanced explore agent is designed to work seamlessly with the existing Trinity AI infrastructure and provides the **exact same robust functionality** as the Chart Maker agent, ensuring consistency across all AI agents in the system.