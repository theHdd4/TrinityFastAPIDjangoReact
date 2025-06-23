import requests
import json
import re
from chart_rag import get_chart_schema

def extract_first_json(text):
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

    def enhance_query(self, raw_query: str) -> str:
        prompt = (
            "You are a memory-augmented assistant that remembers and improves user chart requests. "
            "Your ONLY job is to correct grammar and spelling in the following chart prompt. "
            "Do NOT add explanations, reasoning, or extra text. "
            "Return ONLY the improved prompt as a single sentence, nothing else. "
            "Remember to keep the user's intent intact.\n"
            f"Prompt: {raw_query}\n"
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
            print(f"[Enhance Query] Sending prompt to LLM: {prompt}")
            response = requests.post(self.api_url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            content = response.json().get('message', {}).get('content', '')
            improved = content.strip().replace("Improved:", "").strip()
            improved = re.sub(r"<.*?>", "", improved)
            improved = improved.split('\n')[0].strip()
            if improved.startswith('"') and improved.endswith('"'):
                improved = improved[1:-1].strip()
            print(f"[Enhance Query] Improved prompt: {improved}")
            return improved if improved else raw_query
        except Exception as e:
            print(f"[Enhancement Error] {e}")
            return raw_query

    def _format_history(self, memory):
        if not memory:
            return ""
        formatted = []
        for msg in memory:
            if msg["role"] == "user":
                formatted.append(f"User: {msg['content']}")
            elif msg["role"] == "assistant":
                formatted.append(f"Assistant: {msg['content']}")
        history_str = "\n".join(formatted)
        print(f"[Format History] Formatted history:\n{history_str}")
        return history_str

    def extract_properties(self, user_prompt, chart_type, prev_state=None, memory=None):
        print("\n--- [LLM Extraction Step] ---")
        enhanced_prompt = self.enhance_query(user_prompt)
        schema = get_chart_schema(chart_type)
        template = schema["template"]
        prev_state_str = json.dumps(prev_state or {}, indent=2)

        history_context = self._format_history(memory)
        history_section = f"Conversation History:\n{history_context}\n\n" if history_context else ""

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
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        try:
            print(f"[LLM Extraction] Sending prompt to LLM:\n{prompt}")
            response = requests.post(self.api_url, json=payload, headers=headers, timeout=60)
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
