import requests
import json
import re
import os
from typing import Dict

# --- QueryEnhancer class (inlined and domain-tuned for charting) ---
class QueryEnhancer:
    def __init__(self, api_url: str, model_name: str, bearer_token: str):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json"
        }

    def enhance_query(self, raw_query: str) -> Dict:
        if not raw_query or not raw_query.strip():
            return {
                "domain_status": "out_of_domain",
                "raw_query": raw_query,
                "remark": "Empty query.",
                "domain_reason": "Query is empty, so cannot be related to any domain."
            }

        enhanced_query = self._call_deepseek_r1_minimal(raw_query)
        cleaned_query = self._clean_deepseek_response(enhanced_query, raw_query)
        if self._is_conversational_response(cleaned_query):
            cleaned_query = self._fallback_enhancement(raw_query)
        if not cleaned_query or cleaned_query.strip() == raw_query.strip():
            cleaned_query = self._fallback_enhancement(raw_query)

        # LLM-driven domain check with explicit reasoning
        domain_result = self._llm_domain_reasoning(cleaned_query)
        domain_status = "in_domain" if domain_result["in_domain"] else "out_of_domain"
        result = {
            "domain_status": domain_status,
            "raw_query": raw_query,
            "enhanced_query": cleaned_query,
            "domain_reason": domain_result["reason"]
        }
        if domain_status == "out_of_domain":
            result["final_response"] = domain_result["reason"]
        return result

    def _call_deepseek_r1_minimal(self, raw_query: str) -> str:
        prompt = (
            "You are an intelligent, smart, and highly professional AI engineer with deep expertise in data visualization and chart generation. "
            "Your main task is to enhance user queries so they are clear, precise, and perfectly suited for automated chart creation. "
            "Fix any spelling, grammar, or semantic errors, and rewrite the query to make it ideal for generating charts. "
            "Focus on ensuring the query specifies the data columns for the X and Y axes, chart type, and any other relevant configuration for charting. "
            "If the user query is ambiguous or lacks charting context, clarify it for the purpose of making a chart. "
            "Return only the improved query, nothing else.\n\n"
            f"User query: \"{raw_query}\"\n\n"
            "Enhanced charting query:"
        )
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2,
            "max_tokens": 80,
            "stream": False
        }
        response = requests.post(
            self.api_url,
            json=payload,
            headers=self.headers,
            timeout=30
        )
        if response.status_code != 200:
            raise Exception(f"HTTP {response.status_code}: {response.text}")
        response_data = json.loads(response.text)
        content = response_data.get('message', {}).get('content', '')
        if not content:
            raise Exception("Empty response from DeepSeek R1")
        return content.strip()

    def _clean_deepseek_response(self, llm_response: str, original_query: str) -> str:
        if not llm_response:
            return original_query
        cleaned = llm_response.strip()
        if '<think>' in cleaned:
            think_end = cleaned.find('</think>')
            if think_end != -1:
                cleaned = cleaned[think_end + 8:].strip()
            else:
                think_start = cleaned.find('<think>')
                if think_start != -1:
                    cleaned = cleaned[:think_start].strip()
        prefixes = [
            "Enhanced query:", "Query:", "Result:", "Output:", "Enhanced:", "Improved:",
            "Here's the enhanced query:", "The enhanced query is:", "Enhanced version:",
            "Transformed query:", "Improved version:", "Enhanced charting query:"
        ]
        for prefix in prefixes:
            if cleaned.lower().startswith(prefix.lower()):
                cleaned = cleaned[len(prefix):].strip()
        if (cleaned.startswith('"') and cleaned.endswith('"')) or (cleaned.startswith("'") and cleaned.endswith("'")):
            cleaned = cleaned[1:-1].strip()
        while cleaned.endswith(('!', '?', '.')) and len(cleaned) > 1:
            cleaned = cleaned[:-1].strip()
        if len(cleaned) < 3:
            return original_query
        if len(cleaned) > len(original_query) * 3:
            lines = cleaned.split('\n')
            for line in lines:
                line = line.strip()
                if line and len(line) <= len(original_query) * 2:
                    cleaned = line
                    break
        return cleaned

    def _is_conversational_response(self, response: str) -> bool:
        if not response:
            return False
        conversational_indicators = [
            "let me know", "feel free", "i hope", "would you like", "is this what",
            "hope this helps", "i can help", "here's what i suggest", "i recommend",
            "further refinements", "any adjustments", "more specific details", "let me",
            "hope this", "feel free"
        ]
        response_lower = response.lower()
        return any(indicator in response_lower for indicator in conversational_indicators)

    def _fallback_enhancement(self, raw_query: str) -> str:
        corrections = {
            'uplod': 'upload', 'corelation': 'correlation', 'optimzer': 'optimizer',
            'optimze': 'optimize', 'analize': 'analyze', 'analze': 'analyze',
            'visulaize': 'visualize', 'visualze': 'visualize', 'proces': 'process',
            'machne': 'machine', 'learing': 'learning', 'modle': 'model',
            'paramter': 'parameter', 'hyperparamter': 'hyperparameter', 'anomly': 'anomaly',
            'detec': 'detect', 'expor': 'export', 'impor': 'import', 'sumary': 'summary',
            'statistc': 'statistic', 'featur': 'feature', 'enginr': 'engineer',
            'charitng': 'charting', 'cahrt': 'chart', 'grpah': 'graph', 'sert': 'set',
            'atom': 'atom'
        }
        enhanced = raw_query.lower()
        for wrong, correct in corrections.items():
            enhanced = enhanced.replace(wrong, correct)
        if enhanced.startswith('need a ') and len(enhanced) > 7 and enhanced[7] in 'aeiou':
            enhanced = enhanced.replace('need a ', 'need an ', 1)
        return enhanced

    def _llm_domain_reasoning(self, enhanced_query: str) -> Dict:
        prompt = (
            "You are an intelligent, smart, and highly professional AI engineer specializing in chart making and data visualization. "
            "For the following user query, answer strictly in this format:\n"
            "1. Is this query related to making charts, data visualization, or analytics? (yes/no)\n"
            "2. Briefly explain your reasoning in one sentence, referencing specific words or context from the query. "
            "If you are uncertain, say so and explain why.\n"
            f"Query: \"{enhanced_query}\"\n"
            "Answer:"
        )
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.0,
            "max_tokens": 120,
            "stream": False
        }
        response = requests.post(
            self.api_url,
            json=payload,
            headers=self.headers,
            timeout=30
        )
        if response.status_code != 200:
            return {
                "in_domain": True,
                "reason": "LLM could not determine domain, passing query for further analysis."
            }
        content = response.json().get('message', {}).get('content', '').strip()
        answer_match = re.search(r'1\.\s*(yes|no)\s*[\n\r]+2\.\s*(.+)', content, re.IGNORECASE | re.DOTALL)
        if answer_match:
            answer = answer_match.group(1).strip().lower()
            reason = answer_match.group(2).strip()
            if answer == "yes":
                return {"in_domain": True, "reason": reason}
            elif answer == "no":
                return {"in_domain": False, "reason": reason}
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        for idx, line in enumerate(lines):
            if line.lower().startswith("yes"):
                reason = lines[idx + 1] if idx + 1 < len(lines) else line
                return {"in_domain": True, "reason": reason}
            elif line.lower().startswith("no"):
                reason = lines[idx + 1] if idx + 1 < len(lines) else line
                return {"in_domain": False, "reason": reason}
        return {"in_domain": True, "reason": "LLM was uncertain: " + content}

# --- Chart JSON generation logic ---

EXAMPLE_JSON = """
{
  "chart_type": "bar",
  "traces": [
    {
      "x_column": "Zone",
      "y_column": "Godrej Aer Matic",
      "name": "Godrej Aer Matic"
    }
  ],
  "config": {
    "title": { "text": "Awareness by Zone", "font_size": 24, "font_color": "#2c3e50" },
    "x_label": { "text": "Zone", "font_size": 16, "font_color": "#3775b4", "rotation": 0 },
    "y_label": { "text": "Awareness", "font_size": 16, "font_color": "#3775b4", "rotation": 0 },
    "style": { "bar": { "barmode": "group", "color": ["#FFA07A"], "width": null, "opacity": [0.8], "orientation": "v", "textposition": "auto", "texttemplate": null, "insidetextanchor": "end", "textfont_size": 14, "textfont_color": "#FFFFFF", "pattern_shape": [""], "pattern_fgcolor": ["#000000"], "pattern_bgcolor": ["#ffffff"] } },
    "legend": { "show": true, "position": "top+right", "orientation": "h" },
    "grid": { "type": "neither" }
  }
}
"""

def build_prompt(user_query):
    return f"""
You are a JSON chart schema generator. Given a user prompt, reply ONLY with valid JSON (no extra text) matching this schema:

{EXAMPLE_JSON}

- If any config field is missing in the prompt, set it to "default".
- If either x_column or y_column is missing, reply with:
{{ "error": "You must specify both x and y axis columns to plot a chart." }}
- Do not include any explanation or extra text.
Prompt: "{user_query}"
Return JSON only.
"""

def extract_json(response_text):
    match = re.search(r"\{.*\}", response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return {"error": "Invalid JSON generated."}
    return {"error": "No JSON found in response."}

def main(user_query, api_url, model_name, bearer_token):
    enhancer = QueryEnhancer(api_url, model_name, bearer_token)
    enhanced = enhancer.enhance_query(user_query)
    if enhanced.get("domain_status") == "out_of_domain":
        return {"error": enhanced.get("domain_reason")}

    prompt = build_prompt(enhanced["enhanced_query"])
    payload = {
        "model": model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.0,
        "max_tokens": 512,
        "stream": False
    }
    headers = {
        "Authorization": f"Bearer {bearer_token}",
        "Content-Type": "application/json"
    }
    response = requests.post(api_url, json=payload, headers=headers, timeout=30)
    llm_response = response.json().get("message", {}).get("content", "")
    return extract_json(llm_response)

# Example usage
if __name__ == "__main__":
    host_ip = os.getenv("HOST_IP", "127.0.0.1")
    API_URL = f"http://{host_ip}:11434/api/chat"
    MODEL_NAME = "deepseek-r1:32b"
    BEARER_TOKEN = "aakash_api_key"

    user_input = input("Enter chart prompt: ")
    result = main(user_input, API_URL, MODEL_NAME, BEARER_TOKEN)
    print(json.dumps(result, indent=2))
