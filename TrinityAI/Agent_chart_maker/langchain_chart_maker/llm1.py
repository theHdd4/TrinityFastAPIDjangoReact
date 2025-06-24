import requests
import json
import re
from chart_rag import get_chart_schema

def extract_first_json(text):
    """
    Extracts and parses the first valid JSON object from text using brace counting.
    """
    start = text.find('{')
    if start == -1:
        raise ValueError("No JSON object found")
    brace_count = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            brace_count += 1
        elif text[i] == '}':
            brace_count -= 1
            if brace_count == 0:
                json_str = text[start:i+1]
                try:
                    return json.loads(json_str)
                except Exception as e:
                    raise ValueError(f"Invalid JSON: {e}")
    raise ValueError("No complete JSON object found")

class RAGChartPropertyExtractor:
    def __init__(self, api_url, model_name, bearer_token):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }

    def _call_deepseek_r1_minimal(self, raw_query: str) -> str:
        prompt = f"""Fix spelling and grammar errors or any semantic errors in this query. Return only the improved query:

Query: "{raw_query}"

Enhanced query:"""
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

    def _format_history(self, memory):
        """
        Formats the conversation memory (list of dicts) into a string for the LLM prompt.
        """
        if not memory:
            return ""
        formatted = []
        for msg in memory:
            if msg["role"] == "user":
                formatted.append(f"User: {msg['content']}")
            elif msg["role"] == "assistant":
                formatted.append(f"Assistant: {msg['content']}")
        return "\n".join(formatted)

    def extract_properties(self, user_prompt, chart_type, prev_state=None, memory=None):
        print("\n--- [LLM Extraction Step] ---")
        # Use the robust enhancement method
        enhanced_prompt = self._call_deepseek_r1_minimal(user_prompt)
        schema = get_chart_schema(chart_type)
        template = schema["template"]
        prev_state_str = json.dumps(prev_state or {}, indent=2)

        # Format conversation memory for the LLM prompt
        history_context = self._format_history(memory)
        if history_context:
            history_section = f"Conversation History:\n{history_context}\n\n"
        else:
            history_section = ""

        prompt = (
            f"{history_section}"
            "Respond ONLY with a single valid JSON object. Do NOT include any explanations, markdown, or extra text.\n"
            "You are a chart property extraction agent for an AI chart builder. "
            "Below is the chart configuration collected so far (in JSON):\n"
            f"{prev_state_str}\n\n"
            "The user now says:\n"
            f"\"{enhanced_prompt}\"\n\n"
            "Rules:\n"
            "1. Extract ONLY fields explicitly mentioned in the latest message\n"
            "2. Output JSON with ONLY new/updated fields\n"
            "3. NEVER repeat values from previous context\n"
            "4. If required field is specified, include it\n"
            "5. If no fields mentioned, return {}\n"
            "6. For 'clear' or 'reset', return {\"reset\": true}\n"
            "Schema reference:\n"
            f"{json.dumps(template, indent=2)}\n"
            "Output ONLY valid JSON. Any extra text will break the system."
        )

        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False
        }
        try:
            print(f"[LLM Extraction] Sending prompt to LLM:\n{prompt}")
            response = requests.post(self.api_url, json=payload, headers=self.headers, timeout=60)
            response.raise_for_status()
            content = response.json().get('message', {}).get('content', '')
            print(f"[LLM Extraction] Raw LLM response:\n{content}")

            result = extract_first_json(content)
            print(f"[LLM Extraction] Extracted JSON: {json.dumps(result, indent=2)}")
            return {
                "enhanced_prompt": enhanced_prompt,
                "extracted": result,
                "llm_response": content
            }

        except Exception as e:
            print(f"[Extraction Error] {e}")
            return {
                "enhanced_prompt": enhanced_prompt,
                "extracted": {"error": f"Extraction failed: {str(e)}"},
                "llm_response": ""
            }
