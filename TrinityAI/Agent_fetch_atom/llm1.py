import requests
import json
import re
from typing import Dict
from sentence_transformers import SentenceTransformer

class QueryEnhancer:
    def __init__(self, api_url: str, model_name: str, bearer_token: str):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json"
        }
        self.embedder = SentenceTransformer('all-MiniLM-L6-v2')

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
            "Transformed query:", "Improved version:"
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
            "You are an expert data science assistant. For the following user query, answer strictly in this format:\n"
            "1. Is this query related to data science, analytics, statistics, or machine learning? (yes/no)\n"
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
        # Extract the last explicit yes/no and its reason, even after chain-of-thought
        answer_match = re.search(r'1\.\s*(yes|no)\s*[\n\r]+2\.\s*(.+)', content, re.IGNORECASE | re.DOTALL)
        if answer_match:
            answer = answer_match.group(1).strip().lower()
            reason = answer_match.group(2).strip()
            if answer == "yes":
                return {"in_domain": True, "reason": reason}
            elif answer == "no":
                return {"in_domain": False, "reason": reason}
        # Fallback: scan for the first yes/no in any line
        lines = [line.strip() for line in content.split('\n') if line.strip()]
        for idx, line in enumerate(lines):
            if line.lower().startswith("yes"):
                # Try to get the next line as reason if available
                reason = lines[idx + 1] if idx + 1 < len(lines) else line
                return {"in_domain": True, "reason": reason}
            elif line.lower().startswith("no"):
                reason = lines[idx + 1] if idx + 1 < len(lines) else line
                return {"in_domain": False, "reason": reason}
        # If nothing found, include the full LLM thinking for transparency
        return {"in_domain": True, "reason": "LLM was uncertain: " + content}
