"""
Separate AI Logic for Workflow Generation

This module handles workflow JSON generation with detailed terminal output for debugging.
"""

import os
import json
import logging
import requests
import re
from typing import Dict, Any, List, Optional
from atom_mapping import detect_atom_from_prompt, get_atom_info, ATOM_MAPPING

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workflow_generator")

# Add console handler for terminal output
console = logging.StreamHandler()
console.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
console.setFormatter(formatter)
logger.addHandler(console)


class WorkflowGenerator:
    """AI-powered workflow generator with detailed logging"""
    
    def __init__(self, api_url: str, model_name: str):
        self.api_url = api_url
        self.model_name = model_name
        
        print("\n" + "="*80)
        print("🤖 WORKFLOW GENERATOR INITIALIZED")
        print("="*80)
        print(f"API URL: {self.api_url}")
        print(f"Model: {self.model_name}")
        print("="*80 + "\n")
    
    def generate_workflow(self, user_prompt: str, available_files: List[str] = None) -> Dict[str, Any]:
        """Generate workflow JSON with detailed terminal output"""
        
        print("\n" + "🔄 "*40)
        print("STARTING WORKFLOW GENERATION")
        print("🔄 "*40)
        print(f"\n📝 User Prompt: {user_prompt}")
        print(f"📁 Available Files: {len(available_files) if available_files else 0}")
        
        try:
            # Step 1: Build the prompt
            print("\n" + "-"*80)
            print("STEP 1: Building LLM Prompt")
            print("-"*80)
            
            prompt = self._build_prompt(user_prompt, available_files)
            
            print(f"\n📝 EXACT PROMPT BEING SENT:")
            print("="*80)
            print(prompt)
            print("="*80)
            print(f"✅ Prompt length: {len(prompt)} characters")
            
            # Step 2: Call LLM
            print("\n" + "-"*80)
            print("STEP 2: Calling LLM API")
            print("-"*80)
            print(f"🌐 Endpoint: {self.api_url}")
            print(f"🤖 Model: {self.model_name}")
            
            workflow_json = self._call_llm(prompt, user_prompt)
            
            if "error" in workflow_json:
                print(f"\n❌ LLM returned error: {workflow_json['error']}")
                print("\n⚠️ Using fallback workflow generation...")
                workflow_json = self._generate_fallback_workflow(user_prompt)
            
            # Step 3: Validate workflow
            print("\n" + "-"*80)
            print("STEP 3: Validating Workflow")
            print("-"*80)
            
            validation = self._validate_workflow(workflow_json)
            
            if validation["valid"]:
                print("✅ Workflow validation passed!")
            else:
                print("❌ Workflow validation failed:")
                for error in validation["errors"]:
                    print(f"  - {error}")
            
            # Step 4: Print final workflow
            print("\n" + "-"*80)
            print("STEP 4: Final Workflow JSON")
            print("-"*80)
            print(json.dumps(workflow_json, indent=2))
            
            print("\n" + "✅ "*40)
            print("WORKFLOW GENERATION COMPLETE")
            print("✅ "*40 + "\n")
            
            return workflow_json
            
        except Exception as e:
            print(f"\n❌ EXCEPTION: {e}")
            print("⚠️ Using fallback workflow...")
            return self._generate_fallback_workflow(user_prompt)
    
    def _build_prompt(self, user_prompt: str, available_files: List[str] = None) -> str:
        """Build the LLM prompt using few-shot approach"""
        
        # Use few-shot examples to teach the model the pattern
        prompt = f"""USER: merge files file1 and file2

ASSISTANT: {{"workflow": [{{"step": 1, "action": "CARD_CREATION", "prompt": "Create empty laboratory card", "endpoint": "/api/laboratory/cards", "depends_on": null, "payload": {{"source": "ai", "llm": "deepseek-r1:32b"}}}}, {{"step": 2, "action": "FETCH_ATOM", "agent": "fetch_atom", "prompt": "merge files file1 and file2", "endpoint": "/trinityai/chat", "depends_on": 1}}, {{"step": 3, "action": "AGENT_EXECUTION", "agent": "merge", "prompt": "merge files file1 and file2", "endpoint": "/trinityai/merge", "depends_on": 2}}], "is_data_science": true, "total_steps": 3, "original_prompt": "merge files file1 and file2"}}

USER: create a chart from sales data

ASSISTANT: {{"workflow": [{{"step": 1, "action": "CARD_CREATION", "prompt": "Create empty laboratory card", "endpoint": "/api/laboratory/cards", "depends_on": null, "payload": {{"source": "ai", "llm": "deepseek-r1:32b"}}}}, {{"step": 2, "action": "FETCH_ATOM", "agent": "fetch_atom", "prompt": "create a chart from sales data", "endpoint": "/trinityai/chat", "depends_on": 1}}, {{"step": 3, "action": "AGENT_EXECUTION", "agent": "chart-maker", "prompt": "create a chart from sales data", "endpoint": "/trinityai/chart-maker", "depends_on": 2}}], "is_data_science": true, "total_steps": 3, "original_prompt": "create a chart from sales data"}}

USER: {user_prompt}

ASSISTANT:"""
        
        return prompt
    
    def _call_llm(self, prompt: str, user_prompt: str) -> Dict[str, Any]:
        """Call LLM API and parse response"""
        
        messages = [
            {
                "role": "system",
                "content": "You are a workflow JSON generator. You respond with ONLY valid JSON objects. No explanations, no markdown, no thinking tags. Just pure JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        
        payload = {
            "model": self.model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 2000,
                "top_p": 0.9,
                "top_k": 40
            },
            "format": "json"
        }
        
        print(f"\n📤 SENDING REQUEST TO LLM")
        print("="*80)
        print(f"🌐 Endpoint: {self.api_url}")
        print(f"🤖 Model: {self.model_name}")
        print(f"\n📦 COMPLETE REQUEST PAYLOAD:")
        print("-"*80)
        import json as json_module
        print(json_module.dumps(payload, indent=2))
        print("="*80)
        
        try:
            response = requests.post(
                self.api_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=120
            )
            
            print(f"\n📥 RESPONSE RECEIVED: HTTP {response.status_code}")
            print("="*80)
            
            if response.status_code != 200:
                print(f"❌ HTTP Error: {response.status_code}")
                print(f"\n📄 FULL RESPONSE TEXT:")
                print("-"*80)
                print(response.text)
                print("="*80)
                return {"error": f"HTTP {response.status_code}"}
            
            # Print the complete raw response from the API
            print(f"\n📄 COMPLETE API RESPONSE:")
            print("-"*80)
            try:
                response_json = response.json()
                print(json_module.dumps(response_json, indent=2))
            except:
                print(response.text)
            print("="*80)
            
            result = response.json()
            
            if "message" not in result or "content" not in result["message"]:
                print("\n❌ Invalid response format - missing 'message.content'")
                print(f"Response keys: {list(result.keys())}")
                return {"error": "Invalid response format"}
            
            raw_response = result["message"]["content"].strip()
            
            print("\n" + "="*80)
            print("🎯 EXTRACTED LLM CONTENT (message.content):")
            print("="*80)
            print(raw_response)
            if len(raw_response) > 2000:
                print(f"\n... (response is {len(raw_response)} characters total)")
            print("="*80 + "\n")
            
            # Quick check: if response doesn't start with {, it's not JSON
            if not raw_response.startswith('{'):
                print("❌ LLM returned non-JSON response (doesn't start with '{')")
                print("⚠️ Using fallback workflow generation immediately")
                return {"error": "LLM returned non-JSON"}
            
            # Clean the response
            print("🧹 Cleaning LLM response...")
            cleaned_response = self._clean_response(raw_response)
            
            print("\n" + "="*80)
            print("CLEANED RESPONSE:")
            print("="*80)
            print(cleaned_response[:1000])
            if len(cleaned_response) > 1000:
                print(f"\n... ({len(cleaned_response)} total characters)")
            print("="*80 + "\n")
            
            # Parse JSON
            print("🔍 Parsing JSON...")
            try:
                workflow_json = json.loads(cleaned_response)
                print("✅ JSON parsed successfully!")
                print(f"   Steps: {len(workflow_json.get('workflow', []))}")
                print(f"   Is data science: {workflow_json.get('is_data_science', False)}")
                return workflow_json
            except json.JSONDecodeError as e:
                print(f"❌ JSON parsing failed: {e}")
                print(f"   Error at position: {e.pos}")
                print(f"   Error line: {e.lineno}")
                
                # Try fixing common issues
                print("\n🔧 Attempting to fix JSON...")
                fixed_response = self._try_fix_json(cleaned_response)
                
                if fixed_response:
                    try:
                        workflow_json = json.loads(fixed_response)
                        print("✅ JSON fixed and parsed!")
                        return workflow_json
                    except:
                        print("❌ Could not fix JSON")
                
                return {"error": "JSON parsing failed", "raw": cleaned_response[:500]}
        
        except requests.exceptions.Timeout:
            print("❌ Request timed out")
            return {"error": "Timeout"}
        except requests.exceptions.ConnectionError:
            print("❌ Connection error")
            return {"error": "Connection error"}
        except Exception as e:
            print(f"❌ Exception: {e}")
            return {"error": str(e)}
    
    def _clean_response(self, raw_response: str) -> str:
        """Clean LLM response to extract JSON"""
        
        # Remove thinking tags
        cleaned = re.sub(r"<think>.*?</think>", "", raw_response, flags=re.DOTALL)
        cleaned = re.sub(r"<reasoning>.*?</reasoning>", "", cleaned, flags=re.DOTALL)
        
        # Remove markdown code blocks
        cleaned = re.sub(r"```json\s*", "", cleaned)
        cleaned = re.sub(r"```\s*", "", cleaned)
        
        # Extract JSON between first { and last }
        first_brace = cleaned.find('{')
        last_brace = cleaned.rfind('}')
        
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace:last_brace+1]
        
        return cleaned.strip()
    
    def _try_fix_json(self, json_str: str) -> Optional[str]:
        """Try to fix common JSON issues"""
        
        # Replace single quotes with double quotes
        fixed = json_str.replace("'", '"')
        
        # Fix trailing commas
        fixed = re.sub(r',\s*}', '}', fixed)
        fixed = re.sub(r',\s*]', ']', fixed)
        
        return fixed
    
    def _validate_workflow(self, workflow: Dict[str, Any]) -> Dict[str, Any]:
        """Validate workflow structure"""
        
        errors = []
        
        if "workflow" not in workflow:
            errors.append("Missing 'workflow' key")
            return {"valid": False, "errors": errors}
        
        steps = workflow["workflow"]
        
        if not isinstance(steps, list):
            errors.append("'workflow' is not a list")
            return {"valid": False, "errors": errors}
        
        if len(steps) != 3:
            errors.append(f"Expected 3 steps, got {len(steps)}")
        
        # Validate step 1
        if len(steps) > 0:
            step1 = steps[0]
            if step1.get("action") != "CARD_CREATION":
                errors.append(f"Step 1: action should be CARD_CREATION, got {step1.get('action')}")
            if step1.get("endpoint") != "/api/laboratory/cards":
                errors.append(f"Step 1: wrong endpoint {step1.get('endpoint')}")
            if not step1.get("payload"):
                errors.append("Step 1: missing payload")
        
        # Validate step 2
        if len(steps) > 1:
            step2 = steps[1]
            if step2.get("action") != "FETCH_ATOM":
                errors.append(f"Step 2: action should be FETCH_ATOM, got {step2.get('action')}")
            if step2.get("endpoint") != "/trinityai/chat":
                errors.append(f"Step 2: wrong endpoint {step2.get('endpoint')}")
        
        # Validate step 3
        if len(steps) > 2:
            step3 = steps[2]
            if step3.get("action") != "AGENT_EXECUTION":
                errors.append(f"Step 3: action should be AGENT_EXECUTION, got {step3.get('action')}")
            if not step3.get("endpoint", "").startswith("/trinityai/"):
                errors.append(f"Step 3: endpoint should start with /trinityai/")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors
        }
    
    def _generate_fallback_workflow(self, user_prompt: str) -> Dict[str, Any]:
        """Generate fallback workflow using keyword matching"""
        
        print("\n" + "🔄 "*40)
        print("GENERATING FALLBACK WORKFLOW")
        print("🔄 "*40)
        
        # Use the atom_mapping module to detect the correct atom
        atom_info = detect_atom_from_prompt(user_prompt)
        
        agent = atom_info["atomId"]
        endpoint = atom_info["endpoint"]
        task_desc = atom_info["task_desc"]
        
        print(f"📊 Detected agent: {agent}")
        print(f"🎯 Endpoint: {endpoint}")
        print(f"📝 Task: {task_desc}")
        
        workflow = {
            "workflow": [
                {
                    "step": 1,
                    "action": "CARD_CREATION",
                    "prompt": "Create empty laboratory card",
                    "endpoint": "/api/laboratory/cards",
                    "depends_on": None,
                    "payload": {
                        "source": "ai",
                        "llm": "deepseek-r1:32b"
                    }
                },
                {
                    "step": 2,
                    "action": "FETCH_ATOM",
                    "agent": "fetch_atom",
                    "prompt": user_prompt,  # Use original prompt to detect atom
                    "endpoint": "/trinityai/chat",
                    "depends_on": 1
                },
                {
                    "step": 3,
                    "action": "AGENT_EXECUTION",
                    "agent": agent,
                    "prompt": user_prompt,  # Clean prompt - agent will load files
                    "endpoint": endpoint,
                    "depends_on": 2
                }
            ],
            "is_data_science": True,
            "total_steps": 3,
            "original_prompt": user_prompt,
            "fallback": True
        }
        
        print("✅ Fallback workflow generated")
        print("="*80 + "\n")
        
        return workflow


# Test function
def test_workflow_generator():
    """Test the workflow generator"""
    
    # Get config
    ollama_ip = os.getenv("OLLAMA_IP", os.getenv("HOST_IP", "127.0.0.1"))
    llm_port = os.getenv("OLLAMA_PORT", "11434")
    api_url = os.getenv("LLM_API_URL", f"http://{ollama_ip}:{llm_port}/api/chat")
    model_name = os.getenv("LLM_MODEL_NAME", "deepseek-r1:32b")
    
    generator = WorkflowGenerator(api_url, model_name)
    
    test_prompts = [
        "merge files uk mayo and uk beans",
        "create a chart from sales data",
        "explore the customer dataset"
    ]
    
    for prompt in test_prompts:
        print("\n" + "🧪 "*40)
        print(f"TESTING: {prompt}")
        print("🧪 "*40)
        
        result = generator.generate_workflow(prompt)
        
        print("\n" + "📊 "*40)
        print("RESULT:")
        print("📊 "*40)
        print(json.dumps(result, indent=2))
        print("\n")


if __name__ == "__main__":
    test_workflow_generator()

