"""
AI Insight Generation Service - Following Explore Agent Pattern
Analyzes chart data and provides business intelligence insights using same AI system as explore.
"""

import os
import json
import logging
import time
from typing import Dict, Any, List, Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Set up logging
logger = logging.getLogger("trinity.ai.insights")
router = APIRouter(prefix="/insights", tags=["AI Insights"])

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
    smart_response: str = Field(..., description="User-friendly response from agent")
    response: str = Field(..., description="Raw response/thinking from agent")
    reasoning: str = Field(..., description="Reasoning behind agent's decision")
    data_summary: Dict[str, Any] = Field(..., description="Standardized data summary from atom handler")
    atom_type: str = Field(..., description="Type of atom (correlation, chart-maker, etc.)")
    session_id: Optional[str] = Field(None, description="Session ID for conversation tracking")

class AtomInsightResponse(BaseModel):
    success: bool = Field(..., description="Whether insight generation was successful")
    insight: str = Field(..., description="Generated insight text")
    processing_time: float = Field(..., description="Time taken to generate insight")
    error: Optional[str] = Field(None, description="Error message if generation failed")

def build_atom_insight_prompt(
    smart_response: str,
    response: str,
    reasoning: str,
    data_summary: Dict[str, Any],
    atom_type: str
) -> str:
    """Build AI prompt for atom insight generation."""
    
    atom_type_lower = atom_type.lower()
    
    # Build context section
    context_section = f"""AGENT RESPONSE CONTEXT:
Smart Response (User-friendly): {smart_response}
Response (Raw thinking): {response}
Reasoning: {reasoning}
"""
    
    # Build data summary section based on atom type
    data_section = "DATA SUMMARY:\n"
    
    if atom_type_lower == 'correlation':
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        method = summary_data.get('correlation_method', 'pearson')
        columns = summary_data.get('columns_analyzed', [])
        stats = summary_data.get('correlation_statistics', {})
        top_correlations = summary_data.get('top_correlations', [])
        row_count = metadata.get('row_count', 0)
        file_name = metadata.get('file_name', 'Unknown')
        
        data_section += f"""
Correlation Analysis Details:
- Method: {method}
- File: {file_name}
- Columns Analyzed: {len(columns)} ({', '.join(columns[:5])}{'...' if len(columns) > 5 else ''})
- Total Row Count: {row_count:,}
- Total Correlation Pairs: {stats.get('total_pairs', 0)}
- Strong Correlations (|r| > 0.7): {stats.get('strong_count', 0)}
- Moderate Correlations (0.3 < |r| ≤ 0.7): {stats.get('moderate_count', 0)}
- Weak Correlations (|r| ≤ 0.3): {stats.get('weak_count', 0)}
"""
        
        if top_correlations:
            data_section += "\nTop Correlations:\n"
            for i, corr in enumerate(top_correlations[:5], 1):
                var1 = corr.get('var1', '')
                var2 = corr.get('var2', '')
                value = corr.get('value', 0)
                data_section += f"{i}. {var1} ↔ {var2}: {value:.3f}\n"
    
    elif atom_type_lower == 'chart-maker':
        summary_data = data_summary.get('summary_data', {})
        metadata = data_summary.get('metadata', {})
        
        chart_count = summary_data.get('chart_count', 0)
        chart_configs = summary_data.get('chart_configs', [])
        chart_results = summary_data.get('chart_results', {})
        file_name = metadata.get('file_name', 'Unknown')
        row_count = metadata.get('row_count', 0)
        
        data_section += f"""
Chart Generation Details:
- File: {file_name}
- Number of Charts: {chart_count}
- Total Row Count: {row_count:,}
"""
        
        if chart_results:
            success_count = chart_results.get('success_count', 0)
            charts = chart_results.get('charts', [])
            data_section += f"- Successfully Generated: {success_count}/{chart_count}\n"
            
            if charts:
                data_section += "\nChart Details:\n"
                for i, chart in enumerate(charts[:3], 1):
                    title = chart.get('title', f'Chart {i}')
                    chart_type = chart.get('type', chart.get('chart_type', 'unknown'))
                    data_section += f"{i}. {title} ({chart_type})\n"
        
        if chart_configs:
            first_chart = chart_configs[0] if chart_configs else {}
            data_section += f"\nFirst Chart Configuration:\n"
            data_section += f"- Type: {first_chart.get('chart_type', 'unknown')}\n"
            if first_chart.get('traces'):
                first_trace = first_chart['traces'][0]
                data_section += f"- X-Axis: {first_trace.get('x_column', 'N/A')}\n"
                data_section += f"- Y-Axis: {first_trace.get('y_column', 'N/A')}\n"
    
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
Create Transform Details:
- File: {file_name}
- Total Row Count: {row_count:,}
- Original Column Count: {column_count}
- New Columns Created: {new_column_count}
- Operations Executed: {operations_count}
"""
        
        if operations:
            data_section += "\nOperations Performed:\n"
            for i, op in enumerate(operations[:10], 1):  # Show up to 10 operations
                op_type = op.get('type', 'unknown')
                columns = op.get('columns', [])
                new_column_name = op.get('new_column_name', '')
                data_section += f"{i}. {op_type.upper()}({', '.join(columns[:3])}{'...' if len(columns) > 3 else ''})"
                if new_column_name:
                    data_section += f" → {new_column_name}"
                data_section += "\n"
        
        if operation_results:
            result_file = operation_results.get('result_file', '')
            op_results = operation_results.get('operations_executed', [])
            new_columns = operation_results.get('new_columns', [])
            
            if result_file:
                data_section += f"\nResult File: {result_file}\n"
            
            if new_columns:
                data_section += f"\nNew Columns Created ({len(new_columns)}):\n"
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
Concat Operation Details:
- File 1: {file1}
- File 2: {file2}
- Direction: {direction}
"""
        
        if concat_results:
            concat_id = concat_results.get('concat_id', '')
            result_shape = concat_results.get('result_shape', '')
            columns = concat_results.get('columns', [])
            row_count = concat_results.get('row_count', 0)
            
            if concat_id:
                data_section += f"- Result ID: {concat_id}\n"
            if result_shape:
                data_section += f"- Result Shape: {result_shape}\n"
            if row_count > 0:
                data_section += f"- Total Rows: {row_count:,}\n"
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
        
        data_section += f"""
GroupBy Operation Details:
- File: {file_name}
- Total Row Count: {row_count:,}
- Result Column Count: {column_count}
- Grouping Identifiers: {identifiers_count}
- Aggregations Applied: {aggregations_count}
"""
        
        if identifiers:
            data_section += f"\nGrouping Identifiers:\n"
            for i, identifier in enumerate(identifiers[:10], 1):  # Show up to 10 identifiers
                data_section += f"{i}. {identifier}\n"
        
        if aggregations:
            data_section += f"\nAggregations Performed:\n"
            for i, agg in enumerate(aggregations[:10], 1):  # Show up to 10 aggregations
                if isinstance(agg, dict):
                    field = agg.get('field', 'unknown')
                    aggregator = agg.get('aggregator', agg.get('agg', 'unknown'))
                    weight_by = agg.get('weight_by', '')
                    rename_to = agg.get('rename_to', field)
                    data_section += f"{i}. {aggregator.upper()}({field})"
                    if weight_by:
                        data_section += f" weighted by {weight_by}"
                    if rename_to != field:
                        data_section += f" → {rename_to}"
                    data_section += "\n"
                else:
                    data_section += f"{i}. {agg}\n"
        
        if groupby_results:
            result_file = groupby_results.get('result_file', '')
            result_row_count = groupby_results.get('row_count', 0)
            result_columns = groupby_results.get('columns', [])
            
            if result_file:
                data_section += f"\nResult File: {result_file}\n"
            if result_row_count > 0:
                data_section += f"Result Rows: {result_row_count:,}\n"
            if result_columns:
                data_section += f"Result Columns: {len(result_columns)}\n"
                if len(result_columns) <= 20:
                    data_section += f"Columns: {', '.join(result_columns)}\n"
                else:
                    data_section += f"Columns (first 20): {', '.join(result_columns[:20])}...\n"
    
    else:
        # Generic atom type
        data_section += f"Atom Type: {atom_type}\n"
        data_section += f"Data Summary: {json.dumps(data_summary, indent=2)}\n"
    
    # Build the complete prompt
    prompt = f"""You are an intelligent data analysis assistant. Analyze the agent's response and the underlying data processing to provide a comprehensive, rigorous, and well-explained insight.

{context_section}

{data_section}

TASK: Generate a detailed, rigorous insight that explains:
1. What the agent did and why (based on reasoning and response)
2. What the data analysis reveals (based on data summary)
3. Key findings, patterns, or relationships discovered
4. Business implications or actionable insights
5. Any important considerations or limitations

The insight should be:
- Comprehensive and well-explained (can be lengthy - as detailed as needed)
- Focused on helping users understand the analysis
- Based on both the agent's reasoning AND the actual data results
- Written in clear, professional language
- Include specific numbers, metrics, or findings where relevant

Provide only the insight text - no JSON, no formatting markers, just the comprehensive insight explanation.

EXAMPLE OUTPUT STYLE FOR CORRELATION:
"The correlation analysis examined 15 numeric columns across 12,345 data rows using the Pearson method. The analysis revealed 105 total correlation pairs, with 8 showing strong correlations (|r| > 0.7), 32 showing moderate correlations (0.3 < |r| ≤ 0.7), and 65 showing weak correlations. The strongest relationship was found between SalesValue and Volume (r = 0.847), indicating that sales revenue is highly correlated with sales volume. This strong positive correlation suggests that as volume increases, sales value increases proportionally, which is expected in retail scenarios. Other notable correlations include [additional findings]. These findings suggest that [business implications]."

EXAMPLE OUTPUT STYLE FOR CHART-MAKER:
"The chart generation process successfully created 2 visualizations from the dataset. The first chart is a bar chart comparing [x-axis] across [y-axis], showing [key findings]. The chart reveals [patterns/trends], with [specific metrics]. The second chart displays [details]. Overall, the visualizations provide clear insights into [business context], showing that [key takeaways]."

EXAMPLE OUTPUT STYLE FOR CREATE-TRANSFORM:
"The create-transform operation successfully processed 12,345 rows from the dataset and executed 3 transformation operations. The first operation added two columns (SalesValue and Volume) to create a new column called RevenuePerUnit, which calculates the revenue efficiency metric. The second operation applied a logarithmic transformation to the SalesValue column to normalize the distribution, creating LogSalesValue. The third operation created a dummy variable from the Category column, generating Category_HEINZ. These transformations resulted in 3 new columns being added to the dataset, bringing the total column count from 15 to 18. The new columns enable [business use case], allowing for [specific analysis capabilities]. The transformed dataset has been saved and is ready for further analysis."

EXAMPLE OUTPUT STYLE FOR CONCAT:
"The concat operation successfully combined two datasets: D0_KHC_UK_Beans.arrow and D1_KHC_UK_Beans.arrow. The operation was performed vertically (stacking rows), which means rows from both files were appended together. The result contains [X] total rows and [Y] columns, combining data from both source files. This vertical concatenation is useful for [business use case], allowing you to [specific analysis capabilities]. The concatenated dataset preserves all columns from both files and is ready for further analysis."
"""
    
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
            request.smart_response,
            request.response,
            request.reasoning,
            request.data_summary,
            request.atom_type
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

@router.get("/health")
async def health_check():
    """Health check endpoint for insight service."""
    return {"status": "healthy", "service": "AI Insights"}