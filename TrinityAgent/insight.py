"""
AI Insight Generation Service - Following Explore Agent Pattern
Analyzes chart data and provides business intelligence insights using same AI system as explore.
"""

import os
import json
import logging
import time
import requests
from typing import Dict, Any, List, Optional, Union

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

# Set up logging
logger = logging.getLogger("trinity.ai.insights")
router = APIRouter(prefix="/insights", tags=["AI Insights"])

# 🔧 ENHANCED: Temporary storage for insights when cards aren't available yet (React loops)
_pending_insights: Dict[str, Dict[str, Any]] = {}  # atom_id -> {insight, client_name, app_name, project_name, timestamp}

# Import enhanced insight analysis module
try:
    from TrinityAgent.insight_analysis import (
        generate_insights as generate_deep_insights,
        InsightPayload
    )
    DEEP_INSIGHTS_AVAILABLE = True
except ImportError as e:
    DEEP_INSIGHTS_AVAILABLE = False
    logger.warning(f"Enhanced insight analysis module not available: {e}")

# 🔧 Use same LLM config pattern as explore agent
def get_llm_config():
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    return {
        "api_url": api_url,
        "model_name": os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b"),
        "bearer_token": os.getenv("LLM_BEARER_TOKEN", "aakash_api_key"),
    }

class InsightRequest(BaseModel):
    chart_data: List[Dict[str, Any]] = Field(..., description="Chart data to analyze")
    chart_config: Dict[str, Any] = Field(..., description="Chart configuration (type, axes, etc.)")
    chart_metadata: Optional[Dict[str, Any]] = Field(None, description="Additional chart metadata")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")

class InsightResponse(BaseModel):
    success: bool = Field(..., description="Whether insight generation was successful")
    insight: str = Field(..., description="Generated business insight")
    key_findings: Optional[List[str]] = Field(None, description="Key bullet point findings")
    recommendations: Optional[List[str]] = Field(None, description="Business recommendations")
    processing_time: float = Field(..., description="Time taken to generate insight")
    session_id: Optional[str] = Field(None, description="Session ID")

def analyze_chart_data(chart_data: List[Dict], chart_config: Dict) -> Dict[str, Any]:
    """Analyze chart data to extract key statistics and patterns."""
    
    if not chart_data or not isinstance(chart_data, list):
        return {"error": "Invalid chart data"}
    
    try:
        x_axis = chart_config.get('x_axis', chart_config.get('xAxis', ''))
        y_axis = chart_config.get('y_axis', chart_config.get('yAxes', [''])[0])
        chart_type = chart_config.get('chart_type', chart_config.get('chartType', ''))
        
        # Extract numerical values for analysis
        values = []
        categories = []
        
        for point in chart_data:
            if y_axis and y_axis in point:
                val = point[y_axis]
                if isinstance(val, (int, float)):
                    values.append(val)
            
            if x_axis and x_axis in point:
                categories.append(str(point[x_axis]))
        
        if not values:
            return {"error": "No numerical data found for analysis"}
        
        # Calculate statistics
        total = sum(values)
        average = total / len(values) if values else 0
        min_val = min(values) if values else 0
        max_val = max(values) if values else 0
        
        # Find top performers
        data_with_categories = list(zip(categories, values))
        sorted_data = sorted(data_with_categories, key=lambda x: x[1], reverse=True)
        top_3 = sorted_data[:3]
        
        # Calculate percentages
        top_performers = []
        for cat, val in top_3:
            percentage = (val / total * 100) if total > 0 else 0
            top_performers.append({
                "category": cat,
                "value": val, 
                "percentage": percentage
            })
        
        return {
            "total_value": total,
            "average_value": average,
            "min_value": min_val,
            "max_value": max_val,
            "data_points": len(values),
            "categories": categories,
            "top_performers": top_performers,
            "chart_type": chart_type,
            "x_axis": x_axis,
            "y_axis": y_axis
        }
        
    except Exception as e:
        logger.error(f"Error analyzing chart data: {e}")
        return {"error": str(e)}

def build_insight_prompt(chart_analysis: Dict[str, Any], user_context: str = "") -> str:
    """Build AI prompt for insight generation - same pattern as explore agent."""
    
    prompt = f"""You are an intelligent data insight analyst. Analyze this chart data and provide concise business insights.

CHART DATA ANALYSIS:
Chart Type: {chart_analysis.get('chart_type', 'Unknown')}
X-Axis: {chart_analysis.get('x_axis', 'Unknown')}  
Y-Axis: {chart_analysis.get('y_axis', 'Unknown')}
Data Points: {chart_analysis.get('data_points', 0)}
Total Value: {chart_analysis.get('total_value', 0):,.0f}
Average: {chart_analysis.get('average_value', 0):,.0f}
Min Value: {chart_analysis.get('min_value', 0):,.0f}
Max Value: {chart_analysis.get('max_value', 0):,.0f}

TOP PERFORMERS:"""

    for performer in chart_analysis.get('top_performers', []):
        prompt += f"\n- {performer['category']}: {performer['value']:,.0f} ({performer['percentage']:.1f}%)"
    
    prompt += f"""

CONTEXT: {user_context}

TASK: Generate a concise, actionable business insight (2-3 sentences) that focuses on:
1. Key trends, patterns, or outliers in the data
2. Market leaders and performance gaps
3. Business implications and opportunities

Provide only the insight text - no JSON, no formatting, just the business intelligence insight.

EXAMPLE OUTPUT STYLE:
"HEINZ dominates the mayo market with 45% share and £557M in sales, significantly outperforming competitors. The £254M gap between HEINZ and second-place Hellmanns indicates strong brand loyalty and market positioning opportunities for competitors."
"""
    
    return prompt

def call_llm_for_insights(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call LLM for insight generation - same pattern as explore agent."""
    
    # Print full prompt to terminal
    print("\n" + "="*80)
    print("🚀 INSIGHT LLM CALL - FULL PROMPT")
    print("="*80)
    print(f"API URL: {api_url}")
    print(f"Model: {model_name}")
    print(f"Temperature: 0.3, Max Tokens: 500")
    print(f"Prompt Length: {len(prompt)} characters")
    print("-"*80)
    print("FULL PROMPT:")
    print("-"*80)
    print(prompt)
    print("="*80 + "\n")
    
    try:
        import requests
        import json as json_lib
        
        logger.info(f"🤖 Calling LLM for insights - Model: {model_name}")
        
        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "temperature": 0.3,
            "max_tokens": 500
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {bearer_token}"
        }
        
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        
        # Get raw response
        raw_response_text = response.text
        
        # Print raw API response to terminal
        print("\n" + "="*80)
        print("📥 INSIGHT LLM - RAW RESPONSE")
        print("="*80)
        print(f"Status Code: {response.status_code}")
        print("-"*80)
        print("RAW JSON RESPONSE:")
        print("-"*80)
        print(raw_response_text)
        print("="*80 + "\n")
        
        if response.status_code == 200:
            result = response.json()
            
            # Extract message content (same pattern as explore)
            if "message" in result and "content" in result["message"]:
                insight = result["message"]["content"].strip()
            elif "choices" in result and result["choices"]:
                insight = result["choices"][0].get("message", {}).get("content", "").strip()
            else:
                insight = str(result).strip()
            
            # Print processed content
            print("\n" + "="*80)
            print("✨ INSIGHT LLM - PROCESSED CONTENT")
            print("="*80)
            print(f"Content Length: {len(insight)} characters")
            print("-"*80)
            print("EXTRACTED CONTENT:")
            print("-"*80)
            print(insight)
            print("="*80 + "\n")
            
            logger.info(f"✅ LLM insight generated: {insight[:100]}...")
            return insight
            
        else:
            logger.error(f"LLM API error: {response.status_code} - {response.text}")
            print(f"\n❌ INSIGHT LLM ERROR: {response.status_code} - {response.text}\n")
            return "Unable to generate insights - AI service error."
            
    except Exception as e:
        logger.error(f"Error calling LLM for insights: {e}")
        print(f"\n❌ INSIGHT LLM EXCEPTION: {e}\n")
        return f"Insight generation failed: {str(e)}"

def call_llm_for_atom_insights(api_url: str, model_name: str, bearer_token: str, prompt: str) -> str:
    """Call LLM for comprehensive atom insight generation with higher token limit."""
    
    # Print full prompt to terminal
    print("\n" + "="*80)
    print("🚀 ATOM INSIGHT LLM CALL - FULL PROMPT")
    print("="*80)
    print(f"API URL: {api_url}")
    print(f"Model: {model_name}")
    print(f"Temperature: 0.3, Max Tokens: 2000")
    print(f"Prompt Length: {len(prompt)} characters")
    print("-"*80)
    print("FULL PROMPT:")
    print("-"*80)
    print(prompt)
    print("="*80 + "\n")
    
    try:
        import requests
        import json as json_lib
        
        logger.info(f"🤖 Calling LLM for atom insights - Model: {model_name}")
        
        payload = {
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "temperature": 0.3,
            "max_tokens": 2000  # Higher limit for comprehensive insights
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {bearer_token}"
        }
        
        response = requests.post(api_url, headers=headers, json=payload, timeout=60)
        
        # Get raw response
        raw_response_text = response.text
        
        # Print raw API response to terminal
        print("\n" + "="*80)
        print("📥 ATOM INSIGHT LLM - RAW RESPONSE")
        print("="*80)
        print(f"Status Code: {response.status_code}")
        print("-"*80)
        print("RAW JSON RESPONSE:")
        print("-"*80)
        print(raw_response_text)
        print("="*80 + "\n")
        
        if response.status_code == 200:
            result = response.json()
            
            # Extract message content (same pattern as explore)
            if "message" in result and "content" in result["message"]:
                insight = result["message"]["content"].strip()
            elif "choices" in result and result["choices"]:
                insight = result["choices"][0].get("message", {}).get("content", "").strip()
            else:
                insight = str(result).strip()
            
            # Print processed content
            print("\n" + "="*80)
            print("✨ ATOM INSIGHT LLM - PROCESSED CONTENT")
            print("="*80)
            print(f"Content Length: {len(insight)} characters")
            print("-"*80)
            print("EXTRACTED CONTENT:")
            print("-"*80)
            print(insight)
            print("="*80 + "\n")
            
            logger.info(f"✅ LLM atom insight generated: {insight[:100]}...")
            return insight
            
        else:
            logger.error(f"LLM API error: {response.status_code} - {response.text}")
            print(f"\n❌ ATOM INSIGHT LLM ERROR: {response.status_code} - {response.text}\n")
            return "Unable to generate insights - AI service error."
            
    except Exception as e:
        logger.error(f"Error calling LLM for atom insights: {e}")
        print(f"\n❌ ATOM INSIGHT LLM EXCEPTION: {e}\n")
        return f"Insight generation failed: {str(e)}"

# 🔧 Initialize same LLM configuration as explore agent
cfg = get_llm_config()

@router.post("/generate", response_model=InsightResponse)
async def generate_insights(request: InsightRequest):
    """
    Generate AI-powered business insights from chart data using same AI system as explore.
    """
    start_time = time.time()
    
    try:
        logger.info(f"🤖 Insight generation request - Data points: {len(request.chart_data)}")
        
        # Analyze chart data to extract statistics
        chart_analysis = analyze_chart_data(request.chart_data, request.chart_config)
        
        if "error" in chart_analysis:
            return InsightResponse(
                success=False,
                insight=f"Analysis failed: {chart_analysis['error']}",
                processing_time=time.time() - start_time,
                session_id=request.session_id
            )
        
        # Generate AI prompt using same pattern as explore
        user_context = f"Chart: {request.chart_config.get('title', 'Untitled Chart')}"
        prompt = build_insight_prompt(chart_analysis, user_context)
        
        logger.info(f"🤖 Generated insight prompt (length: {len(prompt)})")
        
        # Call same LLM system as explore agent
        ai_insight = call_llm_for_insights(
            cfg["api_url"], 
            cfg["model_name"], 
            cfg["bearer_token"], 
            prompt
        )
        
        # Extract key findings from top performers
        key_findings = []
        for performer in chart_analysis.get('top_performers', []):
            key_findings.append(
                f"{performer['category']} leads with {performer['value']:,.0f} ({performer['percentage']:.1f}%)"
            )
        
        # Generate recommendations based on data
        recommendations = []
        if chart_analysis.get('top_performers'):
            top_performer = chart_analysis['top_performers'][0]
            recommendations.append(f"Focus on {top_performer['category']} strategy - market leader")
            
            if len(chart_analysis.get('top_performers', [])) > 1:
                second_performer = chart_analysis['top_performers'][1]
                gap = top_performer['percentage'] - second_performer['percentage']
                if gap > 20:
                    recommendations.append("Significant market concentration - monitor competitive dynamics")
                else:
                    recommendations.append("Competitive market - differentiation opportunities exist")
        
        processing_time = time.time() - start_time
        
        logger.info(f"✅ Insight generated successfully in {processing_time:.2f}s")
        
        return InsightResponse(
            success=True,
            insight=ai_insight,
            key_findings=key_findings,
            recommendations=recommendations,
            processing_time=processing_time,
            session_id=request.session_id
        )
        
    except Exception as e:
        logger.error(f"Insight generation failed: {e}")
        return InsightResponse(
            success=False,
            insight=f"Failed to generate insights: {str(e)}",
            processing_time=time.time() - start_time,
            session_id=request.session_id
        )

class AtomInsightRequest(BaseModel):
    reasoning: str = Field(..., description="Detailed reasoning explaining atom choice, raw thinking, and decision rationale")
    data_summary: Dict[str, Any] = Field(..., description="Standardized data summary from atom handler")
    atom_type: str = Field(..., description="Type of atom (correlation, chart-maker, etc.)")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")

class AtomInsightResponse(BaseModel):
    success: bool = Field(..., description="Whether insight generation was successful")
    insight: str = Field(..., description="Generated insight text")
    processing_time: float = Field(..., description="Time taken to generate insight")
    error: Optional[str] = Field(None, description="Error message if generation failed")

class AsyncAtomInsightRequest(BaseModel):
    reasoning: str = Field(..., description="Detailed reasoning explaining atom choice, raw thinking, and decision rationale")
    data_summary: Dict[str, Any] = Field(..., description="Standardized data summary from atom handler")
    atom_type: str = Field(..., description="Type of atom (correlation, chart-maker, etc.)")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")
    atom_id: str = Field(..., description="Atom ID to update text box for")
    client_name: Optional[str] = Field(None, description="Client name for card update")
    app_name: Optional[str] = Field(None, description="App name for card update")
    project_name: Optional[str] = Field(None, description="Project name for card update")
    examples: Optional[List[str]] = Field(None, description="Example insights for LLM guidance")

class AsyncAtomInsightResponse(BaseModel):
    success: bool = Field(..., description="Whether async task was started successfully")
    message: str = Field(..., description="Status message")
    task_id: Optional[str] = Field(None, description="Task ID for tracking")

def _safe_serialize_data_summary(data_summary: Dict[str, Any], max_size: int = 5000) -> str:
    """
    Safely serialize data_summary, excluding large datasets to prevent hanging.
    
    Args:
        data_summary: The data summary dictionary
        max_size: Maximum size of serialized output in characters
    
    Returns:
        Serialized string representation, truncated if necessary
    """
    # Keys that typically contain large datasets that should be excluded or summarized
    large_data_keys = {'rows', 'data', 'samples', 'preview', 'chart_data', 'dataset', 'values'}
    
    # Create a safe copy without large datasets
    safe_summary = {}
    for key, value in data_summary.items():
        if key.lower() in large_data_keys:
            # Replace large datasets with summaries
            if isinstance(value, (list, tuple)):
                safe_summary[key] = f"<{len(value)} items> (data excluded for performance)"
            elif isinstance(value, dict):
                safe_summary[key] = f"<dict with {len(value)} keys> (data excluded for performance)"
            else:
                safe_summary[key] = f"<{type(value).__name__}> (data excluded for performance)"
        else:
            # For other values, include them but check size
            try:
                test_serialized = json.dumps(value, default=str)
                if len(test_serialized) > 1000:  # If value itself is large, summarize
                    if isinstance(value, (list, tuple)):
                        safe_summary[key] = f"<{len(value)} items> (truncated)"
                    elif isinstance(value, dict):
                        safe_summary[key] = f"<dict with {len(value)} keys> (truncated)"
                    else:
                        safe_summary[key] = str(value)[:500] + "..." if len(str(value)) > 500 else value
                else:
                    safe_summary[key] = value
            except (TypeError, ValueError):
                safe_summary[key] = str(value)[:500] if len(str(value)) > 500 else str(value)
    
    try:
        serialized = json.dumps(safe_summary, indent=2, default=str)
        # Truncate if still too large
        if len(serialized) > max_size:
            serialized = serialized[:max_size] + "\n... (truncated for performance)"
        return serialized
    except (TypeError, ValueError) as e:
        return f"<Error serializing data summary: {e}>"

def build_atom_insight_prompt(
    reasoning: str,
    data_summary: Dict[str, Any],
    atom_type: str,
    examples: Optional[List[str]] = None
) -> str:
    """Build AI prompt for atom insight generation."""
    
    atom_type_lower = atom_type.lower()
    
    # Build data summary section based on atom type (focus only on results, not process)
    data_section = "DATA SUMMARY:\n"
    
    if atom_type_lower == 'correlation':
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        method = summary_data.get('correlation_method', 'pearson')
        columns = summary_data.get('columns_analyzed', [])
        stats = summary_data.get('correlation_statistics', {})
        top_correlations = summary_data.get('top_correlations', [])
        correlation_matrix = summary_data.get('correlation_matrix', {})
        row_count = metadata.get('row_count', 0)
        file_name = metadata.get('file_name', 'Unknown')
        
        data_section += f"""
CORRELATION DATA ANALYSIS:
- Dataset: {file_name} ({row_count:,} rows)
- Method: {method}
- Columns Analyzed ({len(columns)}): {', '.join(columns) if columns else 'N/A'}
- Strong Correlations (|r| > 0.7): {stats.get('strong_count', 0)}
- Moderate Correlations (0.3 < |r| ≤ 0.7): {stats.get('moderate_count', 0)}
- Weak Correlations (|r| ≤ 0.3): {stats.get('weak_count', 0)}
"""
        
        if top_correlations:
            data_section += "\nTOP CORRELATIONS (exact column names and correlation values):\n"
            for i, corr in enumerate(top_correlations[:10], 1):  # Show top 10
                var1 = corr.get('var1', '')
                var2 = corr.get('var2', '')
                value = corr.get('value', corr.get('correlation', 0))
                data_section += f"{i}. Column '{var1}' ↔ Column '{var2}': r = {value:.4f}\n"
        
        # Include correlation matrix sample if available
        if correlation_matrix and isinstance(correlation_matrix, dict):
            data_section += "\nCORRELATION MATRIX (sample of key relationships):\n"
            matrix_items = list(correlation_matrix.items())[:5]  # Show first 5 entries
            for key, value in matrix_items:
                if isinstance(value, dict):
                    value_str = ", ".join([f"{k}: {v:.3f}" for k, v in list(value.items())[:3]])
                    data_section += f"  {key}: {value_str}\n"
    
    elif atom_type_lower == 'chart-maker':
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        chart_count = summary_data.get('chart_count', 0)
        chart_configs = summary_data.get('chart_configs', [])
        chart_results = summary_data.get('chart_results', {})
        file_name = metadata.get('file_name', 'Unknown')
        row_count = metadata.get('row_count', 0)
        columns = metadata.get('column_count', 0)
        
        data_section += f"""
CHART MAKER DATA ANALYSIS:
- Dataset: {file_name} ({row_count:,} rows, {columns} columns)
- Charts Created: {chart_count}
"""
        
        # Include actual chart configurations with exact column names and data
        if chart_configs:
            for i, chart_config in enumerate(chart_configs[:3], 1):  # Show up to 3 charts
                chart_title = chart_config.get('title', f'Chart {i}')
                chart_type = chart_config.get('chart_type', chart_config.get('type', 'unknown'))
                traces = chart_config.get('traces', [])
                
                data_section += f"\nCHART {i}: {chart_title} (Type: {chart_type})\n"
                
                for j, trace in enumerate(traces[:2], 1):  # Show up to 2 traces per chart
                    x_col = trace.get('x_column', 'N/A')
                    y_col = trace.get('y_column', 'N/A')
                    trace_name = trace.get('name', f'Trace {j}')
                    
                    data_section += f"  Trace {j} ({trace_name}):\n"
                    data_section += f"    X-Axis Column: {x_col}\n"
                    data_section += f"    Y-Axis Column: {y_col}\n"
                    
                    # Include actual data values if available
                    x_data = trace.get('x', [])
                    y_data = trace.get('y', [])
                    
                    if x_data and len(x_data) > 0:
                        data_section += f"    X-Values Sample: {x_data[:10]}{'...' if len(x_data) > 10 else ''}\n"
                    if y_data and len(y_data) > 0:
                        # Show actual numeric values
                        y_sample = y_data[:10] if len(y_data) > 10 else y_data
                        y_str = ', '.join([f"{val:.2f}" if isinstance(val, (int, float)) else str(val) for val in y_sample])
                        data_section += f"    Y-Values Sample: [{y_str}]{'...' if len(y_data) > 10 else ''}\n"
                        # Include summary stats
                        if isinstance(y_data[0], (int, float)):
                            y_numeric = [v for v in y_data if isinstance(v, (int, float))]
                            if y_numeric:
                                data_section += f"    Y-Values Stats: Min={min(y_numeric):.2f}, Max={max(y_numeric):.2f}, Avg={sum(y_numeric)/len(y_numeric):.2f}\n"
        
        # Include chart results with actual data if available
        if chart_results:
            charts = chart_results.get('charts', [])
            file_data = chart_results.get('file_data', {})
            
            if file_data:
                available_columns = file_data.get('columns', [])
                if available_columns:
                    data_section += f"\nAVAILABLE COLUMNS IN DATASET:\n"
                    data_section += f"{', '.join(available_columns)}\n"
            
            if charts:
                data_section += f"\nCHART RESULTS:\n"
                for i, chart in enumerate(charts[:2], 1):  # Show up to 2 charts
                    title = chart.get('title', f'Chart {i}')
                    chart_type = chart.get('type', chart.get('chart_type', 'unknown'))
                    data_section += f"{i}. {title} ({chart_type})\n"
                    
                    # Include actual data points if available
                    chart_data = chart.get('data', {})
                    if chart_data:
                        data_section += f"   Data points available: {len(chart_data.get('x', []))} points\n"
    
    elif atom_type_lower in ['create-transform', 'create-column']:
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        operations_count = summary_data.get('operations_count', 0)
        operations = summary_data.get('operations', [])
        operation_results = summary_data.get('operation_results', {})
        file_name = metadata.get('file_name', 'Unknown')
        row_count = metadata.get('row_count', 0)
        column_count = metadata.get('column_count', 0)
        new_column_count = metadata.get('new_column_count', 0)
        
        data_section += f"""
DATA RESULTS:
- Dataset: {file_name} ({row_count:,} rows)
- Original Columns: {column_count}
- New Columns: {new_column_count}
"""
        
        if operation_results:
            new_columns = operation_results.get('new_columns', [])
            if new_columns:
                data_section += f"\nNEW COLUMNS:\n"
                for i, col in enumerate(new_columns[:10], 1):  # Show up to 10 new columns
                    data_section += f"{i}. {col}\n"
    
    elif atom_type_lower == 'concat':
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        file1 = summary_data.get('file1', metadata.get('file1_name', 'Unknown'))
        file2 = summary_data.get('file2', metadata.get('file2_name', 'Unknown'))
        direction = summary_data.get('direction', 'vertical')
        concat_results = summary_data.get('concat_results', {})
        
        data_section += f"""
DATA RESULTS:
- Files Combined: {file1} + {file2}
- Direction: {direction}
"""
        
        if concat_results:
            columns = concat_results.get('columns', [])
            row_count = concat_results.get('row_count', 0)
            
            if row_count > 0:
                data_section += f"- Combined Rows: {row_count:,}\n"
            if columns:
                data_section += f"- Total Columns: {len(columns)}\n"
                if len(columns) <= 20:
                    data_section += f"- Columns: {', '.join(columns)}\n"
                else:
                    data_section += f"- Columns (first 20): {', '.join(columns[:20])}...\n"
    
    elif atom_type_lower in ['groupby-wtg-avg', 'groupby']:
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        identifiers = summary_data.get('identifiers', [])
        aggregations = summary_data.get('aggregations', [])
        groupby_results = summary_data.get('groupby_results', {})
        file_name = metadata.get('file_name', 'Unknown')
        row_count = metadata.get('row_count', 0)
        column_count = metadata.get('column_count', 0)
        identifiers_count = metadata.get('identifiers_count', 0)
        aggregations_count = metadata.get('aggregations_count', 0)
        
        result_row_count = groupby_results.get('row_count', 0) if groupby_results else 0
        
        data_section += f"""
GROUPBY DATA ANALYSIS:
- Dataset: {file_name} ({row_count:,} rows)
- Grouped Result: {result_row_count:,} groups, {column_count} columns
- Grouping By: {identifiers_count} identifier(s)
- Aggregations Applied: {aggregations_count}
"""
        
        if identifiers:
            data_section += f"\nGROUPING COLUMNS (exact names):\n"
            for i, identifier in enumerate(identifiers, 1):
                data_section += f"{i}. {identifier}\n"
        
        if aggregations:
            data_section += f"\nAGGREGATIONS (exact column names and operations):\n"
            # Handle both list and dict formats for aggregations
            if isinstance(aggregations, list):
                for i, agg in enumerate(aggregations, 1):
                    if isinstance(agg, dict):
                        field = agg.get('field', 'unknown')
                        aggregator = agg.get('aggregator', agg.get('agg', 'unknown'))
                        weight_by = agg.get('weight_by', '')
                        rename_to = agg.get('rename_to', field)
                        data_section += f"{i}. {aggregator.upper()}({field})"
                        if weight_by:
                            data_section += f" weighted by {weight_by}"
                        if rename_to != field:
                            data_section += f" → renamed to {rename_to}"
                        data_section += "\n"
                    else:
                        data_section += f"{i}. {agg}\n"
            elif isinstance(aggregations, dict):
                for i, (field, agg_config) in enumerate(list(aggregations.items()), 1):
                    if isinstance(agg_config, dict):
                        aggregator = agg_config.get('aggregator', agg_config.get('agg', 'unknown'))
                        weight_by = agg_config.get('weight_by', '')
                        rename_to = agg_config.get('rename_to', field)
                        data_section += f"{i}. {aggregator.upper()}({field})"
                        if weight_by:
                            data_section += f" weighted by {weight_by}"
                        if rename_to != field:
                            data_section += f" → renamed to {rename_to}"
                        data_section += "\n"
                    else:
                        data_section += f"{i}. {field}: {agg_config}\n"
        
        if groupby_results:
            result_file = groupby_results.get('result_file', '')
            result_row_count = groupby_results.get('row_count', 0)
            result_columns = groupby_results.get('columns', [])
            unsaved_data = groupby_results.get('unsaved_data')
            
            if result_columns:
                data_section += f"\nRESULT COLUMNS (exact names):\n"
                data_section += f"{', '.join(result_columns)}\n"
            
            # Include actual grouped data values if available
            if unsaved_data and isinstance(unsaved_data, list) and len(unsaved_data) > 0:
                data_section += f"\nGROUPED DATA RESULTS (top 10 groups with actual values):\n"
                for i, row in enumerate(unsaved_data[:10], 1):
                    if isinstance(row, dict):
                        # Show identifier values and aggregated values
                        row_str = ", ".join([f"{k}: {v}" for k, v in list(row.items())[:5]])
                        data_section += f"{i}. {row_str}\n"
                    else:
                        data_section += f"{i}. {str(row)[:200]}\n"
            
            if result_row_count > 0:
                data_section += f"\nTotal Groups: {result_row_count:,}\n"
    
    else:
        # Generic atom type - use safe serialization to avoid hanging on large datasets
        data_section += f"Atom Type: {atom_type}\n"
        safe_summary = _safe_serialize_data_summary(data_summary)
        data_section += f"Data Summary: {safe_summary}\n"
    
    # Build the complete prompt - DATA-DRIVEN INSIGHTS WITH ACTUAL VALUES
    prompt = f"""You are a data insights analyst. Provide detailed, data-driven insights based on the ACTUAL data analysis results below.

{data_section}

CRITICAL REQUIREMENTS:
1. Use EXACT column names as shown in the data above - do not generalize or hide names
2. Include ACTUAL values, numbers, and metrics from the data - be specific
3. Reference specific data points, groups, or results mentioned above
4. Use the exact terminology from the dataset (column names, categories, etc.)

TASK: Generate detailed, data-driven insights (3-5 paragraphs) that:
1. Reference specific column names and their actual values from the data
2. Identify key patterns, trends, or relationships using actual numbers/metrics
3. Highlight top performers, outliers, or significant findings with specific values
4. Provide business implications based on the actual data results
5. Include actionable recommendations based on specific findings

DO NOT:
- Use generic placeholders like "[Brand/Product]" or "[metric]" - use actual names and values
- Hide or generalize column names - use them exactly as shown
- Make up values - only use what's provided in the data above
- Explain what was done - focus on what the data reveals

The insight MUST:
- Reference exact column names from the dataset
- Include specific numeric values, percentages, or metrics where available
- Mention specific categories, groups, or data points by name
- Be based on the actual data provided above
- Be detailed enough to understand the specific findings

Start directly with specific findings using actual column names and values from the data.

Provide only the insight text - no JSON, no formatting markers, just detailed data-driven insights.

EXAMPLE OUTPUT STYLE FOR CORRELATION:
"SalesValue and Volume columns show a strong positive correlation (r = 0.847), indicating that sales revenue increases proportionally with sales volume. The correlation matrix reveals that SalesValue has the highest correlation (0.92) with Volume among all numeric columns. This suggests pricing strategies that encourage volume growth could directly impact revenue. Consider analyzing the relationship between Volume and SalesValue by region to identify growth opportunities."

EXAMPLE OUTPUT STYLE FOR CHART-MAKER:
"The bar chart using column 'Year' on X-axis and 'SalesValue' on Y-axis reveals that 2023 has the highest SalesValue at $2.45M, representing a 15% increase from 2022's $2.13M. The data shows consistent growth from 2018 ($1.8M) to 2023, with the largest year-over-year increase occurring between 2021 and 2022 (12%). This upward trend suggests successful market strategies. Recommendations: Continue current growth strategies and investigate factors driving the 2021-2022 surge."

EXAMPLE OUTPUT STYLE FOR GROUPBY:
"Grouping by 'Brand' and 'Region' columns with SUM(SalesValue) aggregation shows that Brand 'HEINZ' leads with $5.2M total sales across all regions, followed by 'Knorr' at $3.8M. The 'UK' region dominates with $12.5M total sales, with HEINZ contributing $2.1M (17%) in that region. The weighted average calculation reveals that HEINZ has the highest average sales per unit at $45.30. These insights support focusing marketing efforts on HEINZ in the UK region. Recommendations: Increase inventory for HEINZ in UK and analyze HEINZ's success factors for replication in other regions."
"""
    
    # Add examples if provided
    if examples and len(examples) > 0:
        prompt += "\n\nEXAMPLE INSIGHTS FOR REFERENCE:\n"
        for i, example in enumerate(examples[:3], 1):  # Show up to 3 examples
            prompt += f"\nExample {i}:\n{example}\n"
        prompt += "\nUse these examples as a guide - keep insights concise and direct, focusing on findings and implications.\n"
    
    return prompt

@router.post("/generate-atom-insight", response_model=AtomInsightResponse)
async def generate_atom_insight(request: AtomInsightRequest):
    """
    Generate AI-powered insights from atom agent responses and data summaries.
    """
    start_time = time.time()
    
    try:
        logger.info(f"🤖 Atom insight generation request - Atom type: {request.atom_type}")
        
        # Build prompt for atom insight
        prompt = build_atom_insight_prompt(
            request.reasoning,
            request.data_summary,
            request.atom_type,
            examples=None  # Examples not in original request model
        )
        
        logger.info(f"🤖 Generated atom insight prompt (length: {len(prompt)})")
        
        # Call LLM for insight generation with higher max_tokens for comprehensive insights
        ai_insight = call_llm_for_atom_insights(
            cfg["api_url"],
            cfg["model_name"],
            cfg["bearer_token"],
            prompt
        )
        
        processing_time = time.time() - start_time
        
        logger.info(f"✅ Atom insight generated successfully in {processing_time:.2f}s")
        
        return AtomInsightResponse(
            success=True,
            insight=ai_insight,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"Atom insight generation failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return AtomInsightResponse(
            success=False,
            insight="",
            processing_time=time.time() - start_time,
            error=str(e)
        )

def find_card_by_atom_id(cards: List[Dict[str, Any]], atom_id: str) -> Optional[Dict[str, Any]]:
    """
    Robust card lookup with multiple matching strategies.
    
    Args:
        cards: List of card dictionaries
        atom_id: Atom ID to search for
    
    Returns:
        Card dictionary if found, None otherwise
    """
    if not cards or not atom_id:
        return None
    
    # Strategy 1: Exact match
    for card in cards:
        if card.get("atoms"):
            for atom in card["atoms"]:
                atom_id_in_card = atom.get("id") or atom.get("atomId") or atom.get("atom_id")
                if atom_id_in_card == atom_id:
                    logger.info(f"✅ Found card with exact atom ID match: {atom_id}")
                    return card
    
    # Strategy 2: Case-insensitive match
    atom_id_lower = atom_id.lower().strip()
    for card in cards:
        if card.get("atoms"):
            for atom in card["atoms"]:
                atom_id_in_card = atom.get("id") or atom.get("atomId") or atom.get("atom_id")
                if atom_id_in_card and str(atom_id_in_card).lower().strip() == atom_id_lower:
                    logger.info(f"✅ Found card with case-insensitive atom ID match: {atom_id} == {atom_id_in_card}")
                    return card
    
    # Strategy 3: Partial match (atom_id ends with or contains the search term)
    for card in cards:
        if card.get("atoms"):
            for atom in card["atoms"]:
                atom_id_in_card = atom.get("id") or atom.get("atomId") or atom.get("atom_id")
                if atom_id_in_card:
                    atom_id_str = str(atom_id_in_card)
                    # Check if atom_id ends with our search term or vice versa
                    if atom_id_str.endswith(atom_id) or atom_id.endswith(atom_id_str):
                        logger.info(f"✅ Found card with partial atom ID match: {atom_id} ~= {atom_id_str}")
                        return card
                    # Check if one contains the other
                    if atom_id in atom_id_str or atom_id_str in atom_id:
                        logger.info(f"✅ Found card with substring atom ID match: {atom_id} contains {atom_id_str}")
                        return card
    
    # Strategy 4: Match by prefix (e.g., "chart-maker-123" matches "chart-maker")
    atom_prefix = atom_id.split("-")[0] if "-" in atom_id else atom_id
    for card in cards:
        if card.get("atoms"):
            for atom in card["atoms"]:
                atom_id_in_card = atom.get("id") or atom.get("atomId") or atom.get("atom_id")
                if atom_id_in_card:
                    atom_id_str = str(atom_id_in_card)
                    if atom_id_str.startswith(atom_prefix) or atom_prefix in atom_id_str:
                        logger.info(f"✅ Found card with prefix atom ID match: {atom_id} (prefix: {atom_prefix})")
                        return card
    
    return None


def update_card_textbox_background(
    atom_id: str,
    insight: str,
    client_name: Optional[str],
    app_name: Optional[str],
    project_name: Optional[str],
    max_retries: int = 10,  # 🔧 INCREASED: More retries for React loops
    retry_delay: float = 3.0  # 🔧 INCREASED: Longer delays for React loops
):
    """
    Background task to update card text box with generated insight.
    🔧 ENHANCED: Added retry logic and robust card lookup.
    
    Args:
        atom_id: Atom ID to update
        insight: Generated insight text
        client_name: Client name
        app_name: App name
        project_name: Project name
        max_retries: Maximum number of retry attempts
        retry_delay: Delay between retries in seconds
    """
    try:
        # Get laboratory API URL from environment
        # Try multiple possible environment variable names
        # Default to FastAPI backend service in Docker (fastapi service on port 8001)
        lab_api_base = (
            os.getenv("LABORATORY_API_URL") or 
            os.getenv("LAB_API_URL") or 
            os.getenv("LABORATORY_API") or
            os.getenv("FASTAPI_BACKEND_URL") or
            "http://fastapi:8001"  # Default to FastAPI service in Docker
        )
        
        # Remove trailing slash and ensure /api/laboratory-project-state prefix
        lab_api_base = lab_api_base.rstrip("/")
        if not lab_api_base.endswith("/api/laboratory-project-state"):
            if lab_api_base.endswith("/api"):
                lab_api_base = f"{lab_api_base}/laboratory-project-state"
            else:
                lab_api_base = f"{lab_api_base}/api/laboratory-project-state"
        
        # Get cards from laboratory API using GET endpoint
        # Endpoint: GET /api/laboratory-project-state/get/{client_name}/{app_name}/{project_name}
        client_name_encoded = requests.utils.quote(client_name or "", safe="")
        app_name_encoded = requests.utils.quote(app_name or "", safe="")
        project_name_encoded = requests.utils.quote(project_name or "", safe="")
        cards_url = f"{lab_api_base}/get/{client_name_encoded}/{app_name_encoded}/{project_name_encoded}"
        
        logger.info(f"📤 Fetching cards to update insight for atomId: {atom_id}")
        logger.info(f"📤 Cards URL: {cards_url}")
        logger.info(f"📤 Client: {client_name}, App: {app_name}, Project: {project_name}")
        
        # 🔧 ENHANCED: Retry logic with exponential backoff
        target_card = None
        cards_data = None
        
        for attempt in range(max_retries):
            try:
                cards_response = requests.get(cards_url, timeout=10)
                
                if not cards_response.ok:
                    error_text = cards_response.text[:500] if cards_response.text else "No error message"
                    logger.warning(f"⚠️ Failed to fetch cards (attempt {attempt + 1}/{max_retries}): {cards_response.status_code}")
                    logger.warning(f"⚠️ Error response: {error_text}")
                    
                    if attempt < max_retries - 1:
                        time.sleep(retry_delay * (attempt + 1))  # Exponential backoff
                        continue
                    else:
                        logger.error(f"❌ Failed to fetch cards after {max_retries} attempts")
                        return
                
                cards_data = cards_response.json()
                cards = cards_data.get("cards", [])
                
                # 🔧 ENHANCED: Better logging for debugging
                logger.info(f"📥 Cards API response structure: keys={list(cards_data.keys())}")
                logger.info(f"📥 Cards array length: {len(cards) if cards else 0}")
                
                if not cards:
                    logger.warning(
                        f"⚠️ No cards found in response (attempt {attempt + 1}/{max_retries})\n"
                        f"   Response keys: {list(cards_data.keys())}\n"
                        f"   Response preview: {json.dumps({k: str(v)[:100] if isinstance(v, (list, dict)) else v for k, v in list(cards_data.items())[:5]}, default=str)}"
                    )
                    # 🔧 ENHANCED: For React loops, cards might not be saved yet - use longer delays
                    if attempt < max_retries - 1:
                        # Progressive delay: 3s, 6s, 9s, 12s, 15s, 18s, 21s, 24s, 27s, 30s
                        wait_time = retry_delay * (attempt + 1)
                        logger.info(f"⏳ Retrying in {wait_time}s (cards might not be saved yet in React loop)...")
                        time.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"❌ No cards found after {max_retries} attempts")
                        logger.error(f"   Final response keys: {list(cards_data.keys())}")
                        logger.error(f"   Client: {client_name}, App: {app_name}, Project: {project_name}")
                        # 🔧 FINAL FALLBACK: Store insight for later retrieval when cards become available
                        logger.warning(f"⚠️ Insight generated but cards array is empty - storing for later - atomId: {atom_id}")
                        _pending_insights[atom_id] = {
                            "insight": insight,
                            "client_name": client_name,
                            "app_name": app_name,
                            "project_name": project_name,
                            "timestamp": time.time()
                        }
                        logger.info(f"💾 Stored pending insight for atomId: {atom_id} (will retry when cards are available)")
                        # Schedule a delayed retry to check if cards become available
                        import threading
                        def delayed_retry():
                            time.sleep(30)  # Wait 30 seconds
                            logger.info(f"🔄 Delayed retry: Attempting to update card for atomId: {atom_id}")
                            if atom_id in _pending_insights:
                                pending = _pending_insights[atom_id]
                                update_card_textbox_background(
                                    atom_id=atom_id,
                                    insight=pending["insight"],
                                    client_name=pending["client_name"],
                                    app_name=pending["app_name"],
                                    project_name=pending["project_name"],
                                    max_retries=5,  # Fewer retries for delayed attempt
                                    retry_delay=2.0
                                )
                                # Remove from pending if successful (check will be done in the function)
                        threading.Thread(target=delayed_retry, daemon=True).start()
                        return
                
                # 🔧 ENHANCED: Use robust card lookup
                target_card = find_card_by_atom_id(cards, atom_id)
                
                if target_card:
                    logger.info(f"✅ Found target card on attempt {attempt + 1}")
                    break
                else:
                    # Log all atom IDs for debugging
                    all_atom_ids = []
                    for card in cards:
                        if card.get("atoms"):
                            for atom in card["atoms"]:
                                atom_id_in_card = atom.get("id") or atom.get("atomId") or atom.get("atom_id")
                                if atom_id_in_card:
                                    all_atom_ids.append(atom_id_in_card)
                    
                    logger.warning(
                        f"⚠️ Card not found for atomId: {atom_id} (attempt {attempt + 1}/{max_retries})\n"
                        f"   Available atom IDs: {all_atom_ids[:10]}{'...' if len(all_atom_ids) > 10 else ''}"
                    )
                    
                    if attempt < max_retries - 1:
                        wait_time = retry_delay * (attempt + 1)
                        logger.info(f"⏳ Retrying in {wait_time}s (card might not be saved yet)...")
                        time.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"❌ Card not found after {max_retries} attempts")
                        logger.error(f"   Searched for: {atom_id}")
                        logger.error(f"   Total cards: {len(cards)}")
                        logger.error(f"   Total atoms: {len(all_atom_ids)}")
                        return
                        
            except requests.exceptions.RequestException as e:
                logger.warning(f"⚠️ Request exception (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay * (attempt + 1))
                    continue
                else:
                    logger.error(f"❌ Request exception after {max_retries} attempts: {e}")
                    return
        
        if not target_card:
            logger.error(f"❌ Could not find card for atomId: {atom_id} after all retry attempts")
            # 🔧 ENHANCED: Store insight for delayed retry if card not found
            logger.warning(f"💾 Storing insight for delayed retry - atomId: {atom_id}")
            _pending_insights[atom_id] = {
                "insight": insight,
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "timestamp": time.time()
            }
            # Schedule delayed retry
            import threading
            def delayed_retry():
                time.sleep(30)  # Wait 30 seconds for cards to be created
                logger.info(f"🔄 Delayed retry: Attempting to update card for atomId: {atom_id}")
                if atom_id in _pending_insights:
                    pending = _pending_insights[atom_id]
                    update_card_textbox_background(
                        atom_id=atom_id,
                        insight=pending["insight"],
                        client_name=pending["client_name"],
                        app_name=pending["app_name"],
                        project_name=pending["project_name"],
                        max_retries=5,
                        retry_delay=2.0
                    )
            threading.Thread(target=delayed_retry, daemon=True).start()
            return
        
        # Update the insight text box
        text_boxes = target_card.get("textBoxes", [])
        
        # Find the last text box with title 'AI Insight' or 'Generating insight...'
        insight_box_index = -1
        for i in range(len(text_boxes) - 1, -1, -1):
            title = text_boxes[i].get("title", "")
            if title == "AI Insight" or title == "Generating insight..." or "Insight" in title:
                insight_box_index = i
                break
        
        if insight_box_index >= 0:
            # Update existing insight text box
            text_boxes[insight_box_index] = {
                **text_boxes[insight_box_index],
                "title": "AI Insight",
                "content": insight,
                "html": insight.replace("\n", "<br />")
            }
        else:
            # Create new insight text box
            new_text_box = {
                "id": f"insight-{atom_id}-{int(time.time())}",
                "title": "AI Insight",
                "content": insight,
                "html": insight.replace("\n", "<br />"),
                "settings": {}
            }
            text_boxes.append(new_text_box)
        
        # Update card
        target_card["textBoxes"] = text_boxes
        target_card["textBoxEnabled"] = True
        
        # Save updated cards
        # Endpoint: POST /api/laboratory-project-state/save
        save_url = f"{lab_api_base}/save"
        save_payload = {
            "client_name": client_name or "",
            "app_name": app_name or "",
            "project_name": project_name or "",
            "cards": cards,
            "workflow_molecules": cards_data.get("workflow_molecules", []),
            "auxiliaryMenuLeftOpen": cards_data.get("auxiliaryMenuLeftOpen", True),
            "autosaveEnabled": cards_data.get("autosaveEnabled", True),
            "mode": "laboratory"
        }
        
        logger.info(f"📤 Saving updated card with insight for atomId: {atom_id}")
        logger.info(f"📤 Save URL: {save_url}")
        save_response = requests.post(save_url, json=save_payload, timeout=10)
        
        if save_response.ok:
            logger.info(f"✅ Successfully updated card text box with insight for atomId: {atom_id}")
            # 🔧 ENHANCED: Clean up pending insight if successfully saved
            if atom_id in _pending_insights:
                del _pending_insights[atom_id]
                logger.info(f"🗑️ Removed pending insight for atomId: {atom_id} (successfully saved)")
        else:
            logger.error(f"❌ Failed to save card: {save_response.status_code} - {save_response.text}")
            
    except Exception as e:
        logger.error(f"❌ Error updating card text box in background: {e}")
        import traceback
        logger.error(traceback.format_exc())

@router.post("/generate-atom-insight-async", response_model=AsyncAtomInsightResponse)
async def generate_atom_insight_async(
    request: AsyncAtomInsightRequest,
    background_tasks: BackgroundTasks
):
    """
    Generate AI-powered insights asynchronously in the background.
    The insight will be automatically updated in the card text box when complete.
    This ensures insights complete even when new atoms are called.
    """
    try:
        logger.info(f"🚀 Starting async atom insight generation - Atom type: {request.atom_type}, AtomId: {request.atom_id}")
        
        # Add background task to generate insight and update card
        background_tasks.add_task(
            process_insight_and_update_card,
            request
        )
        
        return AsyncAtomInsightResponse(
            success=True,
            message="Insight generation started in background. Text box will be updated when complete.",
            task_id=f"insight-{request.atom_id}-{int(time.time())}"
        )
        
    except Exception as e:
        logger.error(f"Failed to start async insight generation: {e}")
        return AsyncAtomInsightResponse(
            success=False,
            message=f"Failed to start insight generation: {str(e)}",
            task_id=None
        )

def process_insight_and_update_card(request: AsyncAtomInsightRequest):
    """Process insight generation and update card in background."""
    start_time = time.time()
    
    try:
        logger.info(f"🤖 Processing atom insight in background - Atom type: {request.atom_type}")
        
        # Build prompt for atom insight
        prompt = build_atom_insight_prompt(
            request.reasoning,
            request.data_summary,
            request.atom_type,
            examples=request.examples
        )
        
        logger.info(f"🤖 Generated atom insight prompt (length: {len(prompt)})")
        
        # Call LLM for insight generation
        ai_insight = call_llm_for_atom_insights(
            cfg["api_url"],
            cfg["model_name"],
            cfg["bearer_token"],
            prompt
        )
        
        processing_time = time.time() - start_time
        logger.info(f"✅ Atom insight generated successfully in {processing_time:.2f}s")
        
        # Update card text box with the insight (synchronous function)
        update_card_textbox_background(
            request.atom_id,
            ai_insight,
            request.client_name,
            request.app_name,
            request.project_name
        )
        
    except Exception as e:
        logger.error(f"❌ Background insight generation failed: {e}")
        import traceback
        logger.error(traceback.format_exc())

def extract_facts_from_data_summary(data_summary: Dict[str, Any], atom_type: str) -> Dict[str, Any]:
    """Extract facts (rows/data) from data_summary for deep insight analysis."""
    facts = {}
    
    # Try to extract actual data rows
    summary_data = data_summary.get('summary_data', {})
    metadata = data_summary.get('metadata', {})
    
    # Look for rows/data in various places
    if 'rows' in summary_data:
        facts['rows'] = summary_data['rows']
    elif 'data' in summary_data:
        facts['rows'] = summary_data['data']
    elif 'preview' in summary_data:
        facts['rows'] = summary_data['preview']
    
    # Add metadata
    facts['metadata'] = metadata
    facts['summary'] = summary_data
    
    return facts


def generate_atom_insight_with_deep_analysis(
    goal: str,
    data_summary: Dict[str, Any],
    atom_type: str,
    atom_id: Optional[str] = None,
    use_deep_analysis: bool = True
) -> str:
    """Generate insight using deep analysis if available and data is present."""
    if not DEEP_INSIGHTS_AVAILABLE or not use_deep_analysis:
        return None
    
    try:
        # Extract facts from data summary
        facts = extract_facts_from_data_summary(data_summary, atom_type)
        
        # Check if we have actual data rows
        rows = facts.get('rows', [])
        if not rows or len(rows) == 0:
            logger.debug("No rows found for deep analysis")
            return None
        
        # Generate deep insights
        insights = generate_deep_insights(
            goal=goal,
            facts=facts,
            data_hash=None,
            atom_id=atom_id,
            llm_client=None  # Will use default LLMClient
        )
        
        if insights and len(insights) > 0:
            # Format insights into a comprehensive text
            insight_parts = []
            for i, insight_dict in enumerate(insights, 1):
                insight_parts.append(f"### Insight {i}")
                insight_parts.append(f"**Finding:** {insight_dict.get('insight', '')}")
                insight_parts.append(f"**Impact:** {insight_dict.get('impact', '')}")
                insight_parts.append(f"**Risk:** {insight_dict.get('risk', '')}")
                insight_parts.append(f"**Recommended Action:** {insight_dict.get('next_action', '')}")
                insight_parts.append("")
            
            return "\n".join(insight_parts)
    
    except Exception as e:
        logger.warning(f"Deep insight analysis failed, falling back to standard: {e}")
        return None
    
    return None


@router.post("/generate-deep-insights", response_model=AtomInsightResponse)
async def generate_deep_insights_endpoint(request: AtomInsightRequest):
    """
    Generate deep insights using enhanced statistical analysis and pattern detection.
    """
    start_time = time.time()
    
    try:
        logger.info(f"🤖 Deep insight generation request - Atom type: {request.atom_type}")
        
        if not DEEP_INSIGHTS_AVAILABLE:
            return AtomInsightResponse(
                success=False,
                insight="Deep insight analysis module not available",
                processing_time=time.time() - start_time,
                error="Module not available"
            )
        
        # Build goal from reasoning and atom_type
        goal = f"Analyze {request.atom_type} results: {request.reasoning[:200]}"
        
        # Extract facts from data summary
        facts = extract_facts_from_data_summary(request.data_summary, request.atom_type)
        
        # Generate deep insights
        insights = generate_deep_insights(
            goal=goal,
            facts=facts,
            data_hash=None,
            atom_id=None,
            llm_client=None
        )
        
        if not insights or len(insights) == 0:
            raise ValueError("No insights generated")
        
        # Format insights
        insight_parts = []
        for i, insight_dict in enumerate(insights, 1):
            insight_parts.append(f"### Insight {i}")
            insight_parts.append(f"**Finding:** {insight_dict.get('insight', '')}")
            insight_parts.append(f"**Impact:** {insight_dict.get('impact', '')}")
            insight_parts.append(f"**Risk:** {insight_dict.get('risk', '')}")
            insight_parts.append(f"**Recommended Action:** {insight_dict.get('next_action', '')}")
            insight_parts.append("")
        
        insight_text = "\n".join(insight_parts)
        
        processing_time = time.time() - start_time
        logger.info(f"✅ Deep insight generated successfully in {processing_time:.2f}s")
        
        return AtomInsightResponse(
            success=True,
            insight=insight_text,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"Deep insight generation failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return AtomInsightResponse(
            success=False,
            insight="",
            processing_time=time.time() - start_time,
            error=str(e)
        )


@router.get("/pending-insights/{atom_id}")
async def get_pending_insight(atom_id: str):
    """
    Get pending insight for an atom if cards weren't available when insight was generated.
    Useful for React loops where cards might be created after insight generation.
    """
    if atom_id in _pending_insights:
        pending = _pending_insights[atom_id]
        return {
            "status": "pending",
            "atom_id": atom_id,
            "insight": pending["insight"],
            "timestamp": pending["timestamp"],
            "has_insight": True
        }
    return {
        "status": "not_found",
        "atom_id": atom_id,
        "has_insight": False
    }


@router.post("/retry-pending/{atom_id}")
async def retry_pending_insight(atom_id: str):
    """
    Retry updating card with pending insight.
    Useful when cards become available after insight was generated.
    """
    if atom_id not in _pending_insights:
        return {
            "status": "not_found",
            "message": f"No pending insight found for atom_id: {atom_id}"
        }
    
    pending = _pending_insights[atom_id]
    
    # Try to update card again
    update_card_textbox_background(
        atom_id=atom_id,
        insight=pending["insight"],
        client_name=pending["client_name"],
        app_name=pending["app_name"],
        project_name=pending["project_name"],
        max_retries=5,
        retry_delay=2.0
    )
    
    return {
        "status": "retry_initiated",
        "atom_id": atom_id,
        "message": "Retry initiated - card will be updated if available"
    }


@router.get("/health")
async def health_check():
    """Health check endpoint for insight service."""
    return {
        "status": "healthy",
        "service": "AI Insights",
        "deep_insights_available": DEEP_INSIGHTS_AVAILABLE,
        "pending_insights_count": len(_pending_insights)
    }