import requests
import re
from typing import List, Dict

def canonicalize(text: str) -> str:
    return re.sub(r"\s+", "", text.lower())

class LLM2Enhancer:
    def __init__(self, api_url: str, model_name: str, bearer_token: str):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json"
        }

    def analyze_multi_atom_scenario(
            self,
            raw_query: str,
            enhance_query: str,
            rag_results: List[Dict],
            threshold: float = 0.3,
            wikipedia_info: str = "",
            domain_reason: str = ""
        ) -> Dict:
            for atom in rag_results:
                if "atom" in atom:
                    atom["atom"] = canonicalize(atom["atom"])
            # Changed filtering to use threshold for relevance
            relevant_atoms = [atom for atom in rag_results if atom.get('score', 0) > threshold]
            
            if not relevant_atoms:
                return self._no_atom_response(raw_query, enhance_query, domain_reason)
            elif len(relevant_atoms) >= 2:
                return self._multi_atom_llm_analysis(raw_query, enhance_query, relevant_atoms, wikipedia_info, domain_reason)
            else:
                return self._single_atom_llm_response(raw_query, enhance_query, relevant_atoms[0], wikipedia_info, domain_reason)

    def _single_atom_llm_response(self, raw_query, enhance_query, best_atom, wikipedia_info="", domain_reason=""):
        atom_name = best_atom['atom']
        description = best_atom.get('description', '')
        category = best_atom.get('category', '')
        keywords = best_atom.get('unique_keywords', [])
        prompt = f"""A user asked: "{enhance_query}"

The system found the most suitable atom: {atom_name}

Atom Details:
- Description: {atom_name}
- Category: {category}
- Keywords: {', '.join(keywords[:5])}
"""
        if wikipedia_info:
            prompt += f"\nAdditional context from Wikipedia about this atom:\n{wikipedia_info}\n"
        prompt += """
Provide a helpful response that:
1. Confirms this atom matches their need
2. Explains what this atom does in simple terms maximum words of entire answer is 60 words
3. Gives guidance on how to use it effectively 


Keep the response conversational and helpful, without markdown formatting."""
        final_response = self._call_llm2(prompt)
        return {
            "domain_status": "in_domain",
            "domain_reason": domain_reason,
            "llm2_status": "atom_found",
            "atom_status": True,
            "match_type": "single",
            "raw_query": raw_query,
            "enhanced_query": enhance_query,
            "atom_name": atom_name,
            "confidence": round(best_atom.get('score', 0), 3),
            "category": category,
            "description": description,
            "final_response": final_response,
            "recommendation": f"Use {atom_name} for your task"
        }

    def _multi_atom_llm_analysis(self, raw_query, enhance_query, relevant_atoms, wikipedia_info="", domain_reason=""):
        atom_details = []
        for atom in relevant_atoms:
            atom_details.append({
                'name': atom['atom'],
                'description': atom.get('description', ''),
                'score': round(atom.get('score', 0), 3),
                'category': atom.get('category', '')
            })
        prompt = f"""A user asked: "{enhance_query}"

The system found multiple potentially relevant atoms:

{"; ".join([a['name'] for a in atom_details])}
"""
        if wikipedia_info:
            prompt += f"\nAdditional context from Wikipedia about the top atom:\n{wikipedia_info}\n"
        prompt += """
Analyze this situation and provide helpful guidance that:
1. Explains why multiple atoms might be relevant
2. Recommends which atom to start with and why
3. Suggests if they need multiple atoms in sequence
4. Provides clear next steps for the user
5. Offers alternative approaches if needed
6. Be precise and actionable
7.dont suggest the libraries only give minimal information about the atom 

Be conversational and helpful, without markdown formatting."""
        final_response = self._call_llm2(prompt)
        return {
            "domain_status": "in_domain",
            "domain_reason": domain_reason,
            "llm2_status": "multi_atom_analysis",
            "atom_status": False,
            "match_type": "multi",
            "raw_query": raw_query,
            "enhanced_query": enhance_query,
            "relevant_atoms": atom_details,
            "final_response": final_response,
            "recommendation": self._extract_recommendation(final_response)
        }

    def _no_atom_response(self, raw_query, enhance_query, domain_reason=""):
        prompt = f"""A user asked: "{raw_query}"

No suitable atoms were found in the system, or the best match was too weak.

Your query appears to be out of context for the available tools, or did not match any known atoms with high enough confidence. Please provide a more relevant or specific prompt related to data analytics atoms.

Suggestions:
- Use clear, specific terms (e.g., 'upload data and validate', 'visualize data', 'find correlation', 'required statistical summary')
- Avoid vague or unrelated requests
- Try rephrasing your question to match data analytics tasks

Respond with a warning and actionable advice, without markdown formatting."""
        final_response = self._call_llm2(prompt)
        return {
            "domain_status": "in_domain",
            "domain_reason": domain_reason,
            "llm2_status": "no_atom",
            "atom_status": False,
            "match_type": "none",
            "raw_query": raw_query,
            "enhanced_query": enhance_query,
            "final_response": final_response,
            "recommendation": "Please provide a more relevant prompt for better performance."
        }

    def _call_llm2(self, prompt: str) -> str:
        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a data analytics consultant. Only answer questions about data science, analytics, statistics, or visualization. If a question is not related to these topics, respond: "
                    "'Sorry, I can only help with data analytics and related topics.' Be clear, helpful, and conversational."
                    " No markdown formatting. Remember : Just return the meaningful response dont waste the tokens by  writing long paragraphs and not  meaningful things "
                    "Note: Max words you can use is 100 words"
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.3,
            "max_tokens": 10,
            "stream": False
        }
        response = requests.post(
            self.api_url,
            headers=self.headers,
            json=payload,
            timeout=30
        )
        if response.status_code != 200:
            raise Exception(f"LLM2 API call failed: {response.status_code}")
        response_data = response.json()
        content = response_data.get('message', {}).get('content', '')
        if '<think>' in content:
            think_end = content.find('</think>')
            if think_end != -1:
                content = content[think_end + 8:].strip()
        return content.strip()

    def _extract_recommendation(self, final_response: str) -> str:
        lines = final_response.split('\n')
        for line in lines:
            line = line.strip()
            if any(keyword in line.lower() for keyword in ['recommend', 'suggest', 'start with', 'best approach']):
                return line
        for line in lines:
            if len(line.strip()) > 25:
                return line.strip()
        return "Check the detailed analysis above for guidance."
