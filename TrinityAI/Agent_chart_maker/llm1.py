# llm1.py

import requests
import json
import re
from chart_rag import get_chart_schema

def clean_llm_output(text):
    # Remove <think>...</think> and similar tags
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # Remove common LLM reasoning prefixes
    text = re.sub(r"(?i)^(thought process:|reasoning:|thinking:).*", "", text, flags=re.MULTILINE)
    return text.strip()

class RAGChartPropertyExtractor:
    def __init__(self, api_url, model_name, bearer_token):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token

    def enhance_query(self, raw_query: str) -> str:
        prompt = (
            "You are an intelligent, smart, and highly professional AI agent and chart developer. "
            "Your task is to fix any spelling, grammar, or clarity issues in the following chart-related user prompt. "
            "Do not change the user's intent. Return only the improved prompt, nothing else.\n"
            f"User prompt: \"{raw_query}\"\n"
            "Improved prompt:"
        )
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        try:
            response = requests.post(self.api_url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            content = response.json().get('message', {}).get('content', '')
            improved = clean_llm_output(content.strip().replace("Improved prompt:", "").strip())
            if improved.startswith('"') and improved.endswith('"'):
                improved = improved[1:-1].strip()
            return improved if improved else raw_query
        except Exception as e:
            print(f"[QueryEnhancer] Enhancement failed: {e}")
            return raw_query

    def extract_properties(self, user_prompt, chart_type):
        enhanced_prompt = self.enhance_query(user_prompt)
        schema = get_chart_schema(chart_type)
        template = schema["template"]
        required = schema["required"]
        prompt = (
            "You are an intelligent, smart, and highly professional AI agent and chart developer. "
            "Your task is to extract chart properties from the user prompt according to the schema below. "
            "You MUST only extract fields the user provides. "
            "If any required field is missing, return only this: "
            '{"error": "Missing fields: "}.\n\n'
            f"Schema:\n{json.dumps(template, indent=2)}\n\n"
            f"Required fields: {', '.join(required)}\n"
            f"User prompt:\n\"{enhanced_prompt}\"\n"
            "Extracted JSON:"
        )
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        try:
            response = requests.post(self.api_url, json=payload, headers=headers, timeout=60)
            response.raise_for_status()
            content = response.json().get('message', {}).get('content', '')
            content = clean_llm_output(content)
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            if json_start == -1 or json_end == 0:
                raise ValueError("No valid JSON found in LLM response.")
            result = json.loads(content[json_start:json_end])
        except Exception as e:
            print(f"[Extractor] Extraction failed: {e}")
            # Enhanced error message with suggestion and enhanced prompt
            result = {
                "error": (
                    "This chart-making tool could not extract all necessary details from your query. "
                    "Please clarify your request (e.g., specify which columns to use for axes or labels). "
                    f"Enhanced prompt used: '{enhanced_prompt}'.\n"
                    f"Error: {str(e)}"
                )
            }
        # Print for transparency
        print(f"\n[ENHANCED PROMPT]: {enhanced_prompt}")
        print(f"[EXTRACTED]: {json.dumps(result, indent=2)}")
        return {
            "enhanced_prompt": enhanced_prompt,
            "extracted": result
        }
