# # llm_concat_agent.py

# import requests
# import json
# import re
# from minio import Minio
# from minio.error import S3Error
# from datetime import datetime
# import uuid

# class SmartConcatAgent:
#     """Complete LLM-driven concatenation agent with memory and conversation"""
    
#     def __init__(self, api_url, model_name, bearer_token, minio_endpoint, access_key, secret_key, bucket, prefix):
#         self.api_url = api_url
#         self.model_name = model_name
#         self.bearer_token = bearer_token
        
#         # MinIO connection
#         self.minio_client = Minio(minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False)
#         self.bucket = bucket
#         self.prefix = prefix
        
#         # Memory system
#         self.sessions = {}
#         self.available_files = []
        
#         # Load files once
#         self._load_files()
    
#     def _load_files(self):
#         """Load all files from MinIO"""
#         try:
#             objects = self.minio_client.list_objects(self.bucket, prefix=self.prefix, recursive=True)
#             self.available_files = [obj.object_name.split('/')[-1] for obj in objects 
#                                   if obj.object_name.endswith(('.xlsx', '.xls', '.csv'))]
#             print(f"[SYSTEM] Loaded {len(self.available_files)} files from MinIO")
#         except S3Error as e:
#             print(f"[ERROR] MinIO connection failed: {e}")
#             self.available_files = []
    
#     def create_session(self, session_id=None):
#         """Create new session"""
#         if session_id is None:
#             session_id = str(uuid.uuid4())
        
#         self.sessions[session_id] = {
#             "session_id": session_id,
#             "created_at": datetime.now().isoformat(),
#             "conversation_history": [],
#             "successful_configs": []
#         }
#         return session_id
    
#     def get_session(self, session_id):
#         """Get or create session"""
#         if session_id not in self.sessions:
#             self.create_session(session_id)
#         return self.sessions[session_id]
    
#     def process_request(self, user_prompt, session_id=None):
#         """Main processing method - everything handled by LLM"""
        
#         if session_id is None:
#             session_id = self.create_session()
        
#         session = self.get_session(session_id)
        
#         # Build conversation context
#         context = self._build_context(session_id)
        
#         # Create comprehensive LLM prompt
#         prompt = f"""You are an intelligent concatenation assistant with perfect memory. Your goal is to help users create concatenation configurations.

# USER INPUT: "{user_prompt}"

# AVAILABLE FILES:
# {json.dumps(self.available_files, indent=2)}

# CONVERSATION CONTEXT:
# {context}

# TASK: Analyze the user input and provide the appropriate response. You have two main outcomes:

# SUCCESS RESPONSE (when you have all required info):
# {{
#   "success": true,
#   "concat_json": {{
#     "bucket_name": "trinity",
#     "file1": ["exact_filename1.csv"],
#     "file2": ["exact_filename2.csv"],
#     "concat_direction": "vertical"
#   }},
#   "message": "Concatenation configuration completed successfully",
#   "reasoning": "Found all required components"
# }}

# FAILURE RESPONSE (when information is missing or unclear):
# {{
#   "success": false,
#   "suggestions": [
#     "I need more information to help you",
#     "Please specify two files to concatenate",
#     "Available files: file1.csv, file2.csv, file3.csv",
#     "Example: 'concatenate beans.csv with mayo.csv vertically'"
#   ],
#   "message": "More information needed for concatenation",
#   "reasoning": "Missing file specifications"
# }}

# RULES FOR SUCCESS:
# 1. Must have TWO distinct files identified
# 2. Must have concat_direction (vertical/horizontal)
# 3. Files must exist in the available files list
# 4. Use fuzzy matching for file names (e.g., "beans" matches "D0_KHC_UK_Beans.csv")

# RULES FOR FAILURE:
# 1. If files are unclear, suggest specific available files
# 2. If direction is missing, ask for vertical or horizontal
# 3. If user says "yes" or "no", interpret based on conversation context
# 4. Always provide helpful, specific suggestions

# INTELLIGENCE GUIDELINES:
# - Use fuzzy matching: "beans" should match "D0_KHC_UK_Beans.csv"
# - Handle conversational responses like "yes", "use those files", "combine them"
# - Use conversation history to understand context and references
# - Provide specific file suggestions from available files
# - Default to "vertical" if direction is not specified but files are clear

# EXAMPLES:
# - "concatenate beans with mayo" → SUCCESS (if files exist)
# - "combine some files" → FAILURE (too vague, need specific files)
# - "yes" (after suggestions) → SUCCESS (if context provides files)
# - "do it vertically" → depends on context for files

# USE MEMORY:
# - Reference previous successful configurations
# - Remember user preferences for files and directions
# - Use conversation context to interpret ambiguous requests

# Return ONLY the JSON response:"""

#         try:
#             # Call LLM
#             response = self._call_llm(prompt)
#             result = self._extract_json(response)
            
#             if not result:
#                 return self._create_fallback_response(session_id)
            
#             # Process result
#             processed_result = self._process_llm_result(result, session_id, user_prompt)
            
#             # Update memory
#             self._update_memory(session_id, user_prompt, processed_result)
            
#             return processed_result
            
#         except Exception as e:
#             print(f"[ERROR] Processing failed: {e}")
#             return self._create_error_response(session_id, str(e))
    
#     def _call_llm(self, prompt):
#         """Call LLM with optimized settings"""
#         payload = {
#             "model": self.model_name,
#             "messages": [{"role": "user", "content": prompt}],
#             "stream": False,
#             "options": {
#                 "temperature": 0.2,
#                 "top_p": 0.9,
#                 "num_predict": 800
#             }
#         }
        
#         headers = {
#             "Authorization": f"Bearer {self.bearer_token}",
#             "Content-Type": "application/json"
#         }
        
#         response = requests.post(self.api_url, json=payload, headers=headers, timeout=90)
#         response.raise_for_status()
        
#         return response.json().get('message', {}).get('content', '')
    
#     def _extract_json(self, response):
#         """Extract JSON from LLM response"""
#         # Clean response
#         cleaned = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
#         cleaned = re.sub(r'<reasoning>.*?</reasoning>', '', cleaned, flags=re.DOTALL)
        
#         # Find JSON
#         json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
#         if json_match:
#             try:
#                 return json.loads(json_match.group())
#             except json.JSONDecodeError:
#                 pass
        
#         return None
    
#     def _process_llm_result(self, result, session_id, user_prompt):
#         """Process LLM result and format response"""
#         session = self.get_session(session_id)
        
#         if result.get("success"):
#             # Store successful configuration
#             concat_json = result.get("concat_json", {})
#             session["successful_configs"].append({
#                 "timestamp": datetime.now().isoformat(),
#                 "user_prompt": user_prompt,
#                 "config": concat_json
#             })
            
#             return {
#                 "success": True,
#                 "bucket_name": concat_json.get("bucket_name", "trinity"),
#                 "file1": concat_json.get("file1", []),
#                 "file2": concat_json.get("file2", []),
#                 "concat_direction": concat_json.get("concat_direction", "vertical"),
#                 "session_id": session_id
#             }
#         else:
#             # Return failure with suggestions
#             return {
#                 "success": False,
#                 "suggestions": result.get("suggestions", [
#                     "Please specify two files to concatenate",
#                     "Example: 'concatenate file1.csv with file2.csv'"
#                 ]),
#                 "session_id": session_id
#             }
    
#     def _build_context(self, session_id):
#         """Build conversation context from memory"""
#         session = self.get_session(session_id)
        
#         context_parts = []
        
#         # Recent conversation history
#         history = session.get("conversation_history", [])
#         if history:
#             context_parts.append("RECENT CONVERSATION:")
#             for conv in history[-15:]:  # Last 5 interactions
#                 context_parts.append(f"- User: '{conv['user_prompt']}'")
#                 context_parts.append(f"  Result: {conv['result_type']}")
        
#         # Successful configurations
#         successful = session.get("successful_configs", [])
#         if successful:
#             context_parts.append("SUCCESSFUL CONFIGURATIONS:")
#             for config in successful[-3:]:  # Last 3 successful configs
#                 context_parts.append(f"- Files: {config['config']['file1']} + {config['config']['file2']}")
#                 context_parts.append(f"  Direction: {config['config']['concat_direction']}")
        
#         return "\n".join(context_parts) if context_parts else "No previous conversation"
    
#     def _update_memory(self, session_id, user_prompt, result):
#         """Update session memory"""
#         session = self.get_session(session_id)
        
#         # Add to conversation history
#         session["conversation_history"].append({
#             "timestamp": datetime.now().isoformat(),
#             "user_prompt": user_prompt,
#             "result_type": "success" if result.get("success") else "failure",
#             "has_suggestions": bool(result.get("suggestions"))
#         })
        
#         # Keep history manageable
#         if len(session["conversation_history"]) > 1000:
#             session["conversation_history"] = session["conversation_history"][-1000:]
        
#         # Keep successful configs manageable
#         if len(session.get("successful_configs", [])) > 50:
#             session["successful_configs"] = session["successful_configs"][-50:]
    
#     def _create_fallback_response(self, session_id):
#         """Create fallback response when LLM fails"""
#         return {
#             "success": False,
#             "suggestions": [
#                 "I had trouble understanding your request",
#                 "Please try again with specific file names",
#                 f"Available files: {', '.join(self.available_files[:5])}",
#                 "Example: 'concatenate beans.csv with mayo.csv vertically'"
#             ],
#             "session_id": session_id
#         }
    
#     def _create_error_response(self, session_id, error_msg):
#         """Create error response"""
#         return {
#             "success": False,
#             "suggestions": [
#                 f"System error: {error_msg}",
#                 "Please try again",
#                 "Contact support if the problem persists"
#             ],
#             "session_id": session_id
#         }
    
#     def get_session_history(self, session_id):
#         """Get session history"""
#         session = self.get_session(session_id)
#         return session.get("conversation_history", [])
    
#     def get_available_files(self):
#         """Get available files"""
#         return self.available_files
    
#     def get_session_stats(self, session_id):
#         """Get session statistics"""
#         session = self.get_session(session_id)
        
#         history = session.get("conversation_history", [])
#         successful = len([h for h in history if h.get("result_type") == "success"])
        
#         return {
#             "session_id": session_id,
#             "total_interactions": len(history),
#             "successful_configs": len(session.get("successful_configs", [])),
#             "success_rate": successful / len(history) if history else 0,
#             "created_at": session.get("created_at"),
#             "available_files": len(self.available_files)
#         }





# llm_concat_agent.py

import requests
import json
import re
from pathlib import Path
from minio import Minio
from minio.error import S3Error
from datetime import datetime
import uuid

class SmartConcatAgent:
    """Complete LLM-driven concatenation agent with full history context"""
    
    def __init__(self, api_url, model_name, bearer_token, minio_endpoint, access_key, secret_key, bucket, prefix):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        
        # MinIO connection
        self.minio_client = Minio(minio_endpoint, access_key=access_key, secret_key=secret_key, secure=False)
        self.bucket = bucket
        self.prefix = prefix
        
        # Memory system
        self.sessions = {}
        self.available_files = []
        
        # Load files once
        self._load_files()
    
    def _load_files(self):
        """Load available Arrow files from registry or MinIO."""
        try:
            from DataStorageRetrieval.flight_registry import ARROW_TO_ORIGINAL, REGISTRY_PATH

            arrow_objects = list(ARROW_TO_ORIGINAL.keys())
            if not arrow_objects and REGISTRY_PATH.exists():
                with REGISTRY_PATH.open("r") as f:
                    data = json.load(f)
                    arrow_objects = list(data.get("arrow_to_original", {}).keys())
            if arrow_objects:
                self.available_files = [Path(a).name for a in arrow_objects]
                print(f"[SYSTEM] Loaded {len(self.available_files)} arrow files from registry")
                return
        except Exception as e:
            print(f"[WARN] Failed to read arrow registry: {e}")

        try:
            objects = self.minio_client.list_objects(
                self.bucket, prefix=self.prefix, recursive=True
            )
            self.available_files = [
                obj.object_name.split("/")[-1]
                for obj in objects
                if obj.object_name.endswith(".arrow")
            ]
            print(f"[SYSTEM] Loaded {len(self.available_files)} arrow files from MinIO")
        except S3Error as e:
            print(f"[ERROR] MinIO connection failed: {e}")
            self.available_files = []
    
    def create_session(self, session_id=None):
        """Create new session"""
        if session_id is None:
            session_id = str(uuid.uuid4())
        
        self.sessions[session_id] = {
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
            "conversation_history": [],
            "successful_configs": [],
            "user_preferences": {
                "favorite_files": {},
                "preferred_direction": "vertical",
                "common_patterns": []
            }
        }
        return session_id
    
    def get_session(self, session_id):
        """Get or create session"""
        if session_id not in self.sessions:
            self.create_session(session_id)
        return self.sessions[session_id]
    
    def process_request(self, user_prompt, session_id=None):
        """Main processing method - everything handled by LLM with complete history"""
        
        if session_id is None:
            session_id = self.create_session()
        
        session = self.get_session(session_id)
        
        # Build rich conversation context with complete JSON history
        context = self._build_rich_context(session_id)
        
        # Create comprehensive LLM prompt with complete history
        prompt = f"""You are an intelligent concatenation assistant with perfect memory access to complete conversation history.

USER INPUT: "{user_prompt}"

AVAILABLE FILES:
{json.dumps(self.available_files, indent=2)}

COMPLETE CONVERSATION CONTEXT:
{context}

TASK: Analyze the user input along with the complete conversation history to provide the most appropriate response.

SUCCESS RESPONSE (when you have all required info):
{{
  "success": true,
  "concat_json": {{
    "bucket_name": "trinity",
    "file1": ["exact_filename1.csv"],
    "file2": ["exact_filename2.csv"],
    "concat_direction": "vertical"
  }},
  "message": "Concatenation configuration completed successfully",
  "reasoning": "Found all required components with context from history",
  "used_memory": true
}}

FAILURE RESPONSE (when information is missing or unclear):
{{
  "success": false,
  "suggestions": [
    "Based on your previous interactions, I suggest...",
    "From available files are {self.available_files}, these match your context:",
    "Previous successful pattern was: file1 + file2",
    "Try: 'concatenate [specific_file1] with [specific_file2] [direction]'"
  ],
  "message": "More information needed - Write in better Way !",
  "reasoning": "Missing information but providing context-aware suggestions",
  "recommended_files": ["file1.csv", "file2.csv"],
  "next_steps": [
    "Specify the exact files you want to concatenate",
    "Choose vertical or horizontal direction",
    "Or say 'yes' to use my suggestions"
  ]
}}

INTELLIGENCE RULES:
1. USE COMPLETE HISTORY: Reference previous interactions, successful configs, and user preferences
2. FUZZY MATCHING: "beans" matches "D0_KHC_UK_Beans.csv"
3. CONTEXT AWARENESS: Understand "yes", "no", "use those", "combine them" based on conversation
4. MEMORY UTILIZATION: Suggest files user has successfully used before
5. PATTERN RECOGNITION: Identify user's preferred file combinations and directions

CONVERSATIONAL HANDLING:
- "yes" after suggestions → Use the suggested configuration
- "no" after suggestions → Ask for different preferences
- "use those files" → Apply to most recent file suggestion
- "combine them" → Use default vertical direction with identified files
- "horizontally" or "vertically" → Apply to most recent file context

SUGGESTION QUALITY:
- Always provide specific file names from available files
- Use memory to suggest files user has worked with before
- Explain WHY you're suggesting specific files
- Provide concrete next steps, not generic advice

EXAMPLES OF SMART BEHAVIOR:
- If user previously used "beans.csv + mayo.csv", suggest similar food files
- If user always chooses "vertical", default to that direction
- If user says "yes" after you suggested files, complete the configuration
- If user mentions partial names, match to their previous successful patterns

Return ONLY the JSON response:"""

        try:
            # Call LLM
            response = self._call_llm(prompt)
            result = self._extract_json(response)
            
            if not result:
                return self._create_fallback_response(session_id)
            
            # Process result with enhanced memory updates
            processed_result = self._process_llm_result(result, session_id, user_prompt)
            
            # Update memory with complete interaction data
            self._update_comprehensive_memory(session_id, user_prompt, result, processed_result)
            
            return processed_result
            
        except Exception as e:
            print(f"[ERROR] Processing failed: {e}")
            return self._create_error_response(session_id, str(e))
    
    def _build_rich_context(self, session_id):
        """Build comprehensive conversation context with complete JSON history"""
        session = self.get_session(session_id)
        
        context_parts = []
        
        # Complete conversation history with full JSON details
        history = session.get("conversation_history", [])
        if history:
            context_parts.append("COMPLETE CONVERSATION HISTORY:")
            for i, conv in enumerate(history[-10:], 1):  # Last 10 interactions
                context_parts.append(f"\n--- INTERACTION {i} ---")
                context_parts.append(f"User Input: '{conv['user_prompt']}'")
                context_parts.append(f"System Response: {json.dumps(conv['system_response'], indent=2)}")
                context_parts.append(f"Result Type: {conv['result_type']}")
                context_parts.append(f"Timestamp: {conv['timestamp']}")
        
        # Successful configurations with complete details
        successful = session.get("successful_configs", [])
        if successful:
            context_parts.append("\n\nSUCCESSFUL CONFIGURATIONS:")
            for i, config in enumerate(successful[-5:], 1):  # Last 5 successful configs
                context_parts.append(f"\n--- SUCCESS {i} ---")
                context_parts.append(f"User Request: '{config['user_prompt']}'")
                context_parts.append(f"Configuration: {json.dumps(config['config'], indent=2)}")
                context_parts.append(f"Timestamp: {config['timestamp']}")
        
        # User preferences and patterns
        prefs = session.get("user_preferences", {})
        if prefs.get("favorite_files"):
            context_parts.append("\n\nUSER PREFERENCES:")
            context_parts.append(f"Favorite Files: {json.dumps(prefs['favorite_files'], indent=2)}")
            context_parts.append(f"Preferred Direction: {prefs['preferred_direction']}")
            if prefs.get("common_patterns"):
                context_parts.append(f"Common Patterns: {json.dumps(prefs['common_patterns'], indent=2)}")
        
        # Recent context for conversational responses
        if history:
            last_interaction = history[-1]
            context_parts.append(f"\n\nLAST INTERACTION CONTEXT:")
            context_parts.append(f"Last User Input: '{last_interaction['user_prompt']}'")
            context_parts.append(f"Last System Response: {json.dumps(last_interaction['system_response'], indent=2)}")
            if last_interaction.get('suggested_files'):
                context_parts.append(f"Files I Suggested: {last_interaction['suggested_files']}")
        
        return "\n".join(context_parts) if context_parts else "No previous conversation history"
    
    def _process_llm_result(self, result, session_id, user_prompt):
        """Process LLM result with enhanced response formatting"""
        session = self.get_session(session_id)
        
        if result.get("success"):
            # Store successful configuration
            concat_json = result.get("concat_json", {})
            session["successful_configs"].append({
                "timestamp": datetime.now().isoformat(),
                "user_prompt": user_prompt,
                "config": concat_json,
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False)
            })
            
            # Update user preferences
            self._update_user_preferences(session_id, concat_json)
            
            # **FIXED: Return the concat_json as a nested object instead of flattening it**
            return {
                "success": True,
                "message": result.get("message", "Concatenation configuration completed successfully"),
                "concat_json": {
                    "bucket_name": concat_json.get("bucket_name", "trinity"),
                    "file1": concat_json.get("file1", []),
                    "file2": concat_json.get("file2", []),
                    "concat_direction": concat_json.get("concat_direction", "vertical")
                },
                "reasoning": result.get("reasoning", ""),
                "used_memory": result.get("used_memory", False),
                "session_id": session_id
            }
        else:
            # Return enhanced failure response with intelligent suggestions
            return {
                "success": False,
                "message": result.get("message", "More information needed for concatenation"),
                "suggestions": result.get("suggestions", []),
                "recommended_files": result.get("recommended_files", []),
                "next_steps": result.get("next_steps", []),
                "reasoning": result.get("reasoning", ""),
                "session_id": session_id
            }

    
    def _update_user_preferences(self, session_id, concat_json):
        """Update user preferences based on successful configurations"""
        session = self.get_session(session_id)
        prefs = session["user_preferences"]
        
        # Track favorite files
        for file_key in ["file1", "file2"]:
            if concat_json.get(file_key):
                filename = concat_json[file_key][0] if isinstance(concat_json[file_key], list) else concat_json[file_key]
                prefs["favorite_files"][filename] = prefs["favorite_files"].get(filename, 0) + 1
        
        # Track preferred direction
        direction = concat_json.get("concat_direction", "vertical")
        prefs["preferred_direction"] = direction
        
        # Track common patterns
        pattern = {
            "file1": concat_json.get("file1", [""])[0],
            "file2": concat_json.get("file2", [""])[0],
            "direction": direction
        }
        
        # Add to patterns if unique
        if pattern not in prefs["common_patterns"]:
            prefs["common_patterns"].append(pattern)
            if len(prefs["common_patterns"]) > 10:
                prefs["common_patterns"] = prefs["common_patterns"][-10:]
    
    def _update_comprehensive_memory(self, session_id, user_prompt, llm_result, processed_result):
        """Update session memory with complete interaction data"""
        session = self.get_session(session_id)
        
        # Store complete interaction with all details
        interaction = {
            "timestamp": datetime.now().isoformat(),
            "user_prompt": user_prompt,
            "system_response": processed_result,
            "llm_raw_result": llm_result,
            "result_type": "success" if processed_result.get("success") else "failure",
            "has_suggestions": bool(processed_result.get("suggestions")),
            "suggested_files": processed_result.get("recommended_files", []),
            "used_memory": llm_result.get("used_memory", False),
            "reasoning": llm_result.get("reasoning", "")
        }
        
        session["conversation_history"].append(interaction)
        
        # Keep extensive history (1000 interactions)
        if len(session["conversation_history"]) > 1000:
            session["conversation_history"] = session["conversation_history"][-1000:]
        
        # Keep successful configs (100 configs)
        if len(session.get("successful_configs", [])) > 100:
            session["successful_configs"] = session["successful_configs"][-100:]
    
    def _call_llm(self, prompt):
        """Call LLM with optimized settings"""
        payload = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {
                "temperature": 0.2,
                "top_p": 0.9,
                "num_predict": 1000
            }
        }
        
        headers = {
            "Authorization": f"Bearer {self.bearer_token}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(self.api_url, json=payload, headers=headers, timeout=90)
        response.raise_for_status()
        
        return response.json().get('message', {}).get('content', '')
    
    def _extract_json(self, response):
        """Extract JSON from LLM response"""
        # Clean response
        cleaned = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL)
        cleaned = re.sub(r'<reasoning>.*?</reasoning>', '', cleaned, flags=re.DOTALL)
        
        # Find JSON
        json_match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        return None
    
    def _create_fallback_response(self, session_id):
        """Create fallback response when LLM fails"""
        session = self.get_session(session_id)
        
        # Use memory for fallback suggestions
        favorite_files = list(session.get("user_preferences", {}).get("favorite_files", {}).keys())[:3]
        
        return {
            "success": False,
            "message": "I had trouble understanding your request, but I can help based on your history",
            "suggestions": [
                "I had trouble processing your request",
                "Let me suggest based on your previous usage:",
                f"Files you've used before: {', '.join(favorite_files) if favorite_files else 'None yet'}",
                f"Available files: {', '.join(self.available_files[:5])}",
                "Example: 'concatenate beans.csv with mayo.csv vertically'"
            ],
            "recommended_files": favorite_files,
            "next_steps": [
                "Please try with specific file names",
                "Or say 'yes' if you want to use suggested files",
                "Or say 'show me available files' to see all options"
            ],
            "session_id": session_id
        }
    
    def _create_error_response(self, session_id, error_msg):
        """Create error response"""
        return {
            "success": False,
            "message": f"System error occurred: {error_msg}",
            "suggestions": [
                "System error occurred, please try again",
                "If the problem persists, contact support",
                "Try simplifying your request"
            ],
            "session_id": session_id
        }
    
    def get_session_history(self, session_id):
        """Get complete session history with all JSON details"""
        session = self.get_session(session_id)
        return session.get("conversation_history", [])
    
    def get_available_files(self):
        """Get available files"""
        return self.available_files
    
    def get_session_stats(self, session_id):
        """Get comprehensive session statistics"""
        session = self.get_session(session_id)
        
        history = session.get("conversation_history", [])
        successful = len([h for h in history if h.get("result_type") == "success"])
        
        return {
            "session_id": session_id,
            "total_interactions": len(history),
            "successful_configs": len(session.get("successful_configs", [])),
            "success_rate": successful / len(history) if history else 0,
            "created_at": session.get("created_at"),
            "available_files": len(self.available_files),
            "user_preferences": session.get("user_preferences", {}),
            "memory_utilization": {
                "favorite_files": len(session.get("user_preferences", {}).get("favorite_files", {})),
                "common_patterns": len(session.get("user_preferences", {}).get("common_patterns", [])),
                "history_depth": len(history)
            }
        }
    
    def get_detailed_session_info(self, session_id):
        """Get detailed session information for debugging"""
        session = self.get_session(session_id)
        
        return {
            "session_data": session,
            "available_files": self.available_files,
            "memory_context": self._build_rich_context(session_id)
        }
