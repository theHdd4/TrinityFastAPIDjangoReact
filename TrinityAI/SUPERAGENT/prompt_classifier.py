"""
Intelligent Prompt Classifier for SuperAgent

This module uses LLM to classify user prompts and determine whether they require
atom-based workflow generation or just a general conversational response.

Uses the atoms_knowledge_base.json to help the LLM understand atom capabilities.
"""

import os
import sys
import json
import logging
import requests
from typing import Dict, Any, Optional
from pathlib import Path

# Setup logging
logger = logging.getLogger("trinity.superagent.classifier")

# Add parent directory to path for imports
PARENT_DIR = Path(__file__).resolve().parent.parent
if str(PARENT_DIR) not in sys.path:
    sys.path.append(str(PARENT_DIR))

try:
    from main_api import get_llm_config
except ImportError:
    logger.warning("Could not import get_llm_config")
    get_llm_config = None


class PromptClassifier:
    """
    Intelligent prompt classifier that uses LLM to determine if a prompt
    requires atom-based workflow or general response.
    """
    
    def __init__(self, api_url: str = None, model_name: str = None, bearer_token: str = None):
        """
        Initialize the prompt classifier.
        
        Args:
            api_url: LLM API URL (optional, will use config if not provided)
            model_name: LLM model name (optional, will use config if not provided)
            bearer_token: Bearer token for authentication (optional)
        """
        # Load configuration
        if get_llm_config:
            config = get_llm_config()
            self.api_url = api_url or config["api_url"]
            self.model_name = model_name or config["model_name"]
            self.bearer_token = bearer_token or config.get("bearer_token", "")
        else:
            self.api_url = api_url or os.getenv("LLM_API_URL", "http://localhost:11434/v1/chat/completions")
            self.model_name = model_name or os.getenv("LLM_MODEL", "deepseek-r1:32b")
            self.bearer_token = bearer_token or os.getenv("OLLAMA_BEARER_TOKEN", "")
        
        # Load atoms knowledge base
        self.atoms_knowledge = self._load_atoms_knowledge()
        
        logger.info(f"✅ PromptClassifier initialized with model: {self.model_name}")
    
    def _load_atoms_knowledge(self) -> str:
        """
        Load the atoms knowledge base from JSON file.
        
        Returns:
            String containing formatted atoms knowledge
        """
        try:
            # Look for atoms_knowledge_base.json in workflow_mode/rag directory
            atoms_kb_path = PARENT_DIR / "workflow_mode" / "rag" / "atoms_knowledge_base.json"
            
            if not atoms_kb_path.exists():
                logger.warning(f"Atoms knowledge base not found at {atoms_kb_path}")
                return "Atoms knowledge base not available."
            
            with open(atoms_kb_path, "r", encoding="utf-8") as f:
                atoms_data = json.load(f)
            
            # Format the knowledge base for LLM consumption
            knowledge = "AVAILABLE ATOMS AND THEIR CAPABILITIES:\n\n"
            
            for category_key, category_data in atoms_data.get("categories", {}).items():
                if category_key == "metadata":
                    continue
                    
                category_name = category_data.get("name", category_key)
                category_desc = category_data.get("description", "")
                
                knowledge += f"\n## {category_name}\n"
                knowledge += f"{category_desc}\n\n"
                
                for atom in category_data.get("atoms", []):
                    atom_id = atom.get("id", "")
                    atom_title = atom.get("title", "")
                    atom_desc = atom.get("description", "")
                    atom_tags = ", ".join(atom.get("tags", []))
                    use_cases = atom.get("use_cases", [])
                    
                    knowledge += f"### {atom_title} (ID: {atom_id})\n"
                    knowledge += f"**Description**: {atom_desc}\n"
                    knowledge += f"**Tags**: {atom_tags}\n"
                    
                    if use_cases:
                        knowledge += "**Use Cases**:\n"
                        for use_case in use_cases[:3]:  # Limit to 3 to keep prompt size manageable
                            knowledge += f"  - {use_case}\n"
                    
                    knowledge += "\n"
            
            logger.info("✅ Atoms knowledge base loaded successfully")
            return knowledge
            
        except Exception as e:
            logger.error(f"Error loading atoms knowledge base: {e}")
            return "Atoms knowledge base not available."
    
    def classify_prompt(self, user_prompt: str, file_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Classify the user prompt to determine if it requires atom-based workflow
        or just a general conversational response.
        
        Args:
            user_prompt: The user's input prompt
            file_context: Optional context about mentioned files
        
        Returns:
            Dict containing:
                - needs_workflow (bool): Whether the prompt requires atom-based workflow
                - classification (str): One of "atom_workflow", "general_response", "clarification_needed"
                - confidence (float): Confidence score 0.0-1.0
                - reasoning (str): Explanation of the classification
                - suggested_atoms (list): List of atom IDs that might be relevant (if needs_workflow=True)
                - response_hint (str): Suggested response direction
        """
        
        # Build file context string
        file_context_str = ""
        if file_context:
            file_context_str = "\n\nFILE CONTEXT:\n"
            for filename, details in file_context.items():
                file_context_str += f"- {filename}: {len(details.get('columns', []))} columns\n"
        
        # Build the classification prompt
        classification_prompt = f"""You are an expert AI assistant that classifies user prompts for a data analytics platform.

Your job is to determine whether a user prompt requires DATA SCIENCE WORKFLOW (using atoms) or just a GENERAL CONVERSATIONAL RESPONSE.

{self.atoms_knowledge}

USER PROMPT: "{user_prompt}"{file_context_str}

CLASSIFICATION RULES:

1. **ATOM WORKFLOW** (needs_workflow: true)
   - User explicitly requests data operations (merge, filter, chart, analysis, transform)
   - User mentions specific files/datasets AND wants to do something with them
   - User asks to perform any operation described in the atoms knowledge base above
   - Examples:
     * "merge files uk mayo and uk beans"
     * "create a chart showing sales by region"
     * "filter the data to show only 2023 records"
     * "group by product and sum the revenue"
     * "show me the correlation between price and sales"

2. **GENERAL RESPONSE** (needs_workflow: false, classification: "general_response")
   - Greetings and casual conversation (hi, hello, how are you)
   - Questions about capabilities ("what can you do?", "how does this work?")
   - Questions about concepts ("what is data?", "explain merging")
   - Requests for help or guidance without specific action
   - General questions about the platform
   - Examples:
     * "hello, how can you help me?"
     * "what is a merge operation?"
     * "what features do you have?"
     * "explain what atoms are"
     * "tell me about your capabilities"

3. **CLARIFICATION NEEDED** (needs_workflow: false, classification: "clarification_needed")
   - Very vague requests without enough context
   - Ambiguous requests that could mean multiple things
   - Incomplete requests that need more information
   - Examples:
     * "analyze"
     * "help me with data"
     * "do something"
     * "show me"

IMPORTANT:
- Do NOT generate workflows for general questions or greetings
- Only generate workflows when the user explicitly wants to perform a data operation
- If unsure, prefer "clarification_needed" over "atom_workflow"
- Be conservative - better to ask for clarification than to incorrectly trigger a workflow

Respond with ONLY valid JSON in this exact format:

{{
  "needs_workflow": true/false,
  "classification": "atom_workflow" | "general_response" | "clarification_needed",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of why this classification was chosen",
  "suggested_atoms": ["atom-id-1", "atom-id-2"] or [],
  "response_hint": "Suggested direction for the response (for general_response or clarification_needed)"
}}"""

        try:
            # Call LLM for classification
            headers = {
                "Content-Type": "application/json"
            }
            
            if self.bearer_token:
                headers["Authorization"] = f"Bearer {self.bearer_token}"
            
            payload = {
                "model": self.model_name,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a prompt classification expert. Respond with ONLY valid JSON, no extra text."
                    },
                    {
                        "role": "user",
                        "content": classification_prompt
                    }
                ],
                "temperature": 0.1,  # Low temperature for consistent classification
                "max_tokens": 500
            }
            
            logger.info(f"🔍 Classifying prompt: {user_prompt[:100]}...")
            
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            
            response.raise_for_status()
            result = response.json()
            
            # Extract the response content
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            
            # Parse JSON from response
            classification_result = self._parse_json_response(content)
            
            # Log classification result
            logger.info(f"✅ Classification: {classification_result.get('classification')}")
            logger.info(f"   Needs Workflow: {classification_result.get('needs_workflow')}")
            logger.info(f"   Confidence: {classification_result.get('confidence')}")
            logger.info(f"   Reasoning: {classification_result.get('reasoning', '')[:100]}")
            
            return classification_result
            
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ LLM API error during classification: {e}")
            # Fallback to keyword-based classification
            return self._fallback_classification(user_prompt)
        
        except Exception as e:
            logger.error(f"❌ Error during prompt classification: {e}")
            # Fallback to keyword-based classification
            return self._fallback_classification(user_prompt)
    
    def _parse_json_response(self, content: str) -> Dict[str, Any]:
        """
        Parse JSON from LLM response, handling various formats.
        
        Args:
            content: LLM response content
        
        Returns:
            Parsed JSON dict
        """
        try:
            # Try direct JSON parse
            return json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            import re
            json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
            
            # Try to find JSON object in the text
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(0))
                except json.JSONDecodeError:
                    pass
            
            logger.warning(f"Could not parse JSON from LLM response: {content[:200]}")
            raise ValueError("Could not parse JSON from LLM response")
    
    def _fallback_classification(self, user_prompt: str) -> Dict[str, Any]:
        """
        Fallback classification using simple keyword matching.
        Used when LLM is unavailable or fails.
        
        Args:
            user_prompt: The user's input prompt
        
        Returns:
            Classification dict
        """
        logger.warning("⚠️ Using fallback keyword-based classification")
        
        prompt_lower = user_prompt.lower()
        
        # Greeting patterns
        greeting_keywords = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening']
        if any(keyword in prompt_lower for keyword in greeting_keywords):
            return {
                "needs_workflow": False,
                "classification": "general_response",
                "confidence": 0.9,
                "reasoning": "Detected greeting pattern",
                "suggested_atoms": [],
                "response_hint": "Respond with a friendly greeting and offer help"
            }
        
        # Question patterns (what, how, can you, etc.)
        question_keywords = ['what is', 'what are', 'how do', 'how does', 'can you explain', 'tell me about', 'what can you']
        if any(keyword in prompt_lower for keyword in question_keywords):
            return {
                "needs_workflow": False,
                "classification": "general_response",
                "confidence": 0.8,
                "reasoning": "Detected question pattern seeking information",
                "suggested_atoms": [],
                "response_hint": "Provide informative answer about capabilities or concepts"
            }
        
        # Action keywords (strong indicators of workflow need)
        action_keywords = [
            'merge', 'concat', 'join', 'combine',
            'create chart', 'plot', 'visualize', 'graph',
            'filter', 'group by', 'aggregate',
            'calculate', 'transform', 'create column'
        ]
        if any(keyword in prompt_lower for keyword in action_keywords):
            return {
                "needs_workflow": True,
                "classification": "atom_workflow",
                "confidence": 0.7,
                "reasoning": "Detected action keywords indicating data operation",
                "suggested_atoms": [],  # Could enhance this with keyword-to-atom mapping
                "response_hint": "Generate workflow for data operation"
            }
        
        # Very short or vague prompts
        if len(user_prompt.strip().split()) < 3:
            return {
                "needs_workflow": False,
                "classification": "clarification_needed",
                "confidence": 0.8,
                "reasoning": "Prompt too short or vague",
                "suggested_atoms": [],
                "response_hint": "Ask for clarification about what the user wants to do"
            }
        
        # Default: treat as general response to be safe
        return {
            "needs_workflow": False,
            "classification": "general_response",
            "confidence": 0.5,
            "reasoning": "Could not confidently classify - defaulting to general response",
            "suggested_atoms": [],
            "response_hint": "Provide helpful response or ask for more details"
        }


# Test function
def test_classifier():
    """Test the prompt classifier with various inputs"""
    
    classifier = PromptClassifier()
    
    test_prompts = [
        "hello, how can you help me?",
        "what is a merge operation?",
        "merge files uk mayo and uk beans",
        "create a chart showing sales by region",
        "help",
        "analyze data",
        "what can you do?",
        "filter the data to show only 2023",
        "tell me about your features",
        "group by product and sum revenue"
    ]
    
    print("\n" + "="*80)
    print("TESTING PROMPT CLASSIFIER")
    print("="*80)
    
    for prompt in test_prompts:
        print(f"\nPrompt: {prompt}")
        print("-" * 80)
        
        result = classifier.classify_prompt(prompt)
        
        print(f"Classification: {result['classification']}")
        print(f"Needs Workflow: {result['needs_workflow']}")
        print(f"Confidence: {result['confidence']}")
        print(f"Reasoning: {result['reasoning']}")
        print(f"Response Hint: {result.get('response_hint', 'N/A')}")
        
        if result.get('suggested_atoms'):
            print(f"Suggested Atoms: {', '.join(result['suggested_atoms'])}")
    
    print("\n" + "="*80)


if __name__ == "__main__":
    test_classifier()

