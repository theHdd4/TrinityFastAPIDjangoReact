# main_chart.py

from fastapi import FastAPI
from pydantic import BaseModel
from llm1 import RAGChartPropertyExtractor
from chart_rag import get_chart_schema, validate_extracted_properties, fill_defaults

LLM_API_URL = "http://10.2.1.65:11434/api/chat"
LLM_MODEL_NAME = "deepseek-r1:32b"
LLM_BEARER_TOKEN = "aakash_api_key"

app = FastAPI()
extractor = RAGChartPropertyExtractor(LLM_API_URL, LLM_MODEL_NAME, LLM_BEARER_TOKEN)

class ChartRequest(BaseModel):
    prompt: str

def detect_chart_type(prompt: str) -> str:
    prompt = prompt.lower()
    if "histogram" in prompt:
        return "histogram"
    if "pie" in prompt:
        return "pie"
    if "bar" in prompt:
        return "bar"
    if "line" in prompt:
        return "line"
    if "waterfall" in prompt:
        return "waterfall"
    if "distplot" in prompt:
        return "distplot"
    if "scatter" in prompt:
        return "scatter"
    if "area" in prompt:
        return "area"
    return "line"  # Default to line chart

@app.post("/generate_chart_json")
def generate_chart_json(request: ChartRequest):
    user_prompt = request.prompt
    chart_type = detect_chart_type(user_prompt)
    extraction = extractor.extract_properties(user_prompt, chart_type)
    enhanced_prompt = extraction.get("enhanced_prompt")
    extracted = extraction.get("extracted")

    # If the LLM returned an error, show enhanced prompt and suggestion
    if "error" in extracted:
        return {
            "success": False,
            "message": (
                "⚠️ Unable to generate chart due to missing or unclear information.\n"
                "Tip: Specify which columns to use for axes or labels (e.g., 'x axis: Month, y axis: Sales').\n"
                "Be clear about the chart type and data fields.\n"
                "Example: 'Create a bar chart of Sales by Month using the sales_data table.'\n"
                f"\nEnhanced prompt: {enhanced_prompt}\n"
                f"Error: {extracted['error']}"
            ),
            "enhanced_prompt": enhanced_prompt,
            "extracted": extracted
        }

    # Double-check required fields
    missing = validate_extracted_properties(chart_type, extracted)
    if missing:
        return {
            "success": False,
            "message": (
                f"⚠️ Missing required fields for {chart_type} chart: {', '.join(missing)}.\n"
                "Please specify these fields in your query for best results."
            ),
            "enhanced_prompt": enhanced_prompt,
            "extracted": extracted
        }

    # Fill all other fields with defaults
    template = get_chart_schema(chart_type)["template"]
    result = fill_defaults(template, extracted)
    return {
        "success": True,
        "message": "Chart JSON generated successfully.",
        "enhanced_prompt": enhanced_prompt,
        "extracted": extracted,
        "chart_json": result
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
