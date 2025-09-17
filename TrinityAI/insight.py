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
        
        if response.status_code == 200:
            result = response.json()
            
            # Extract message content (same pattern as explore)
            if "message" in result and "content" in result["message"]:
                insight = result["message"]["content"].strip()
            elif "choices" in result and result["choices"]:
                insight = result["choices"][0].get("message", {}).get("content", "").strip()
            else:
                insight = str(result).strip()
            
            logger.info(f"✅ LLM insight generated: {insight[:100]}...")
            return insight
            
        else:
            logger.error(f"LLM API error: {response.status_code} - {response.text}")
            return "Unable to generate insights - AI service error."
            
    except Exception as e:
        logger.error(f"Error calling LLM for insights: {e}")
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

@router.get("/health")
async def health_check():
    """Health check endpoint for insight service."""
    return {"status": "healthy", "service": "AI Insights"}