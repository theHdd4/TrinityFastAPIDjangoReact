# import requests
# import json
# import re
# from typing import Dict, List, Optional

# class SingleLLMProcessor:
#     def __init__(self, api_url: str, model_name: str, bearer_token: str):
#         self.api_url = api_url
#         self.model_name = model_name
#         self.bearer_token = bearer_token
#         self.headers = {
#             "Authorization": f"Bearer {bearer_token}",
#             "Content-Type": "application/json"
#         }
        
#         # Valid atom names for validation
#         self.valid_atoms = [
#             "ChartMaker", "Feature Overview", "GroupBy with Wtg Avg", "Data Upload & Validate",
#             "Explore", "Merge", "Concatenate", "Create", "Delete", "Rename", "Text Box",
#             "Correlation", "Scope Selector", "Row Operations", "Regression - Feature Based",
#             "Select Models - Feature Based", "Evaluate Models - Feature Based",
#             "Auto-regressive Models", "Select Models - Auto Regressive", 
#             "Evaluate Models - Auto Regressive", "Scenario Planner", "Optimizer",
#             "Base Price Estimator", "Promo Estimator"
#         ]
        
#         # Atom descriptions and keywords
#         self.atom_knowledge = self._build_comprehensive_atom_knowledge()

#     def _build_comprehensive_atom_knowledge(self) -> str:
#         """Build comprehensive atom knowledge with keywords"""
#         atom_data = {
#             "ChartMaker": {
#                 "description": "Creates interactive charts (bar, line, area, pie, histogram, heatmap, waterfall). Uses FastAPI, pandas, and Plotly for business dashboards.",
#                 "keywords": ['chart maker', 'chart creation', 'data visualization', 'chart', 'graph', 'plot', 'interactive chart', 'bar chart', 'line chart', 'pie chart', 'histogram', 'heatmap', 'business dashboard', 'analytics chart']
#             },
#             "Feature Overview": {
#                 "description": "Provides comprehensive dataset profiling across markets, products, and time. Analyzes completeness, segment coverage, and key statistics.",
#                 "keywords": ['feature overview', 'data overview', 'dataset summary', 'feature profiling', 'data readiness', 'EDA', 'data completeness', 'data health check']
#             },
#             "GroupBy with Wtg Avg": {
#                 "description": "Aggregates datasets by grouping across dimensions using weighted averages, sum, mean, rank percentile.",
#                 "keywords": ['weighted average', 'group by', 'aggregate', 'grouping', 'data aggregation', 'summarization', 'dimension analysis', 'KPIs']
#             },
#             "Data Upload & Validate": {
#                 "description": "Uploads master files, validates schemas, classifies columns into identifiers/measures, maps business dimensions.",
#                 "keywords": ['data upload', 'file validation', 'master file', 'column classification', 'schema validation', 'data governance']
#             },
#             "Explore": {
#                 "description": "Interactive data browsing, missing value analysis, column profiling, data distribution analysis.",
#                 "keywords": ['data exploration', 'missing values', 'summary statistics', 'column profile', 'EDA', 'data browser']
#             },
#             "Merge": {
#                 "description": "Joins datasets on common columns (inner/left/right/outer joins). Similar to VLOOKUP or SQL JOIN.",
#                 "keywords": ['merge', 'join', 'combine', 'VLOOKUP', 'inner join', 'left join', 'outer join', 'data integration']
#             },
#             "Concatenate": {
#                 "description": "Combines datasets vertically (row-wise) or horizontally (column-wise).",
#                 "keywords": ['concatenate', 'concat', 'stack', 'append', 'combine datasets', 'vertical merge', 'horizontal merge']
#             },
#             "Create": {
#                 "description": "Generates new columns through operations (add, subtract, multiply, divide, dummy conversion, trend detection).",
#                 "keywords": ['create', 'feature engineering', 'new columns', 'add', 'subtract', 'multiply', 'divide', 'dummy variable']
#             },
#             "Correlation": {
#                 "description": "Computes correlation matrices (Pearson, Spearman, Kendall) between numerical variables.",
#                 "keywords": ['correlation', 'relationship', 'pearson', 'spearman', 'kendall', 'correlation matrix']
#             },
#             "Regression - Feature Based": {
#                 "description": "Fits regression models using manually engineered features. OLS regression with interpretable coefficients.",
#                 "keywords": ['regression', 'linear regression', 'feature model', 'OLS', 'predictive modeling']
#             },
#             "Auto-regressive Models": {
#                 "description": "Fits time-series models (AR, ARIMA, SARIMA) for forecasting. Captures trends, seasonality, auto-correlations.",
#                 "keywords": ['time series', 'ARIMA', 'SARIMA', 'forecast', 'forecasting', 'seasonality']
#             },
#             "Scenario Planner": {
#                 "description": "Simulates business outcomes under different assumptions. What-if analysis for planning.",
#                 "keywords": ['scenario', 'what-if analysis', 'business scenario', 'planning', 'simulation']
#             },
#             "Optimizer": {
#                 "description": "Solves constrained optimization problems (maximize sales, minimize cost, resource allocation).",
#                 "keywords": ['optimizer', 'optimization', 'maximize', 'minimize', 'resource allocation', 'optimal']
#             }
#         }
        
#         knowledge = "Available atoms with descriptions and keywords:\n\n"
#         for atom, data in atom_data.items():
#             knowledge += f"**{atom}**: {data['description']}\n"
#             knowledge += f"Keywords: {', '.join(data['keywords'][:15])}\n\n"
        
#         return knowledge

#     def process_query(self, raw_query: str) -> Dict:
#         """Single LLM processing for domain check, query enhancement, and atom extraction"""
        
#         if not raw_query or not raw_query.strip():
#             return {
#                 "domain_status": "out_of_domain",
#                 "raw_query": raw_query,
#                 "enhanced_query": raw_query,
#                 "final_response": "Empty query provided",
#                 "domain_reason": "Query is empty, cannot be processed"
#             }

#         # Enhanced prompt that combines domain checking and atom extraction
#         prompt = f"""You are an expert data analytics consultant. Analyze the user query and perform the following tasks:

# 1. First, enhance the query by fixing grammar and improving clarity
# 2. Check if the enhanced query relates to data analytics, visualization, or business intelligence
# 3. If in-domain, identify the most suitable atom/tool from the available options

# User Query: "{raw_query}"

# {self.atom_knowledge}

# Instructions:
# - Enhance the query for better clarity and grammar
# - Determine if query is related to data analytics, visualization, ML, statistics, or BI
# - If in-domain, match to the best atom(s) using keywords and descriptions
# - Return response in the exact JSON format below

# For IN-DOMAIN with SINGLE atom match:
# {{
#   "domain_status": "in_domain",
#   "raw_query": "{raw_query}",
#   "enhanced_query": "enhanced version of the query",
#   "match_type": "single",
#   "atom_name": "ChartMaker",
#   "confidence": 0.9,
#   "reason": "Perfect match for visualization needs",
#   "final_response": "ChartMaker is the best tool for your needs",
#   "domain_reason": "Query relates to data visualization"
# }}

# For IN-DOMAIN with MULTIPLE atom matches:
# {{
#   "domain_status": "in_domain", 
#   "raw_query": "{raw_query}",
#   "enhanced_query": "enhanced version of the query",
#   "match_type": "multi",
#   "relevant_atoms": [
#     {{
#       "atom_name": "ChartMaker",
#       "confidence": 0.8,
#       "reason": "Good for visualization"
#     }},
#     {{
#       "atom_name": "Feature Overview",
#       "confidence": 0.7,
#       "reason": "Good for data profiling"
#     }}
#   ],
#   "final_response": "Multiple tools could help with your task",
#   "domain_reason": "Query relates to data analytics"
# }}

# For OUT-OF-DOMAIN:
# {{
#   "domain_status": "out_of_domain",
#   "raw_query": "{raw_query}",
#   "enhanced_query": "enhanced version of the query", 
#   "final_response": "This query is not related to data analytics or business intelligence",
#   "domain_reason": "Query does not relate to data analytics, visualization, or BI tasks"
# }}

# Analyze and respond with JSON only:"""

#         return self._call_single_llm(prompt, raw_query)

#     def _call_single_llm(self, prompt: str, raw_query: str) -> Dict:
#         """Call single LLM for complete processing"""
#         payload = {
#             "model": self.model_name,
#             "messages": [
#                 {
#                     "role": "system",
#                     "content": "You are an expert data analytics consultant. ALWAYS respond with ONLY valid JSON. NO additional text, explanations, or formatting outside the JSON structure."
#                 },
#                 {
#                     "role": "user",
#                     "content": prompt
#                 }
#             ],
#             "temperature": 0.1,
#             "max_tokens": 600,
#             "stream": False
#         }
        
#         try:
#             print(f"\n🔄 Single LLM Processing: '{raw_query}'")
#             response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=30)
            
#             print(f"📥 LLM Response Status: {response.status_code}")
            
#             if response.status_code != 200:
#                 return self._create_error_response(raw_query)
            
#             content = response.json().get('message', {}).get('content', '')
#             print(f"\n📋 Raw LLM Output:\n{content}")
            
#             # Clean and extract JSON
#             json_content = self._extract_json_from_content(content)
#             if not json_content:
#                 return self._create_error_response(raw_query)
            
#             try:
#                 result = json.loads(json_content)
#                 return self._format_response(result, raw_query)
                
#             except json.JSONDecodeError as e:
#                 print(f"❌ JSON Parse Error: {str(e)}")
#                 return self._create_error_response(raw_query)
                
#         except Exception as e:
#             print(f"❌ Request Exception: {str(e)}")
#             return self._create_error_response(raw_query)

#     def _extract_json_from_content(self, content: str) -> str:
#         """Extract JSON from mixed content"""
#         # Clean thinking tokens
#         if '<think>' in content:
#             think_end = content.find('</think>')
#             if think_end != -1:
#                 content = content[think_end + 8:].strip()
        
#         # Try direct JSON extraction
#         json_pattern = r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})'
#         matches = re.findall(json_pattern, content, re.DOTALL)
        
#         for match in matches:
#             try:
#                 json.loads(match)
#                 return match.strip()
#             except:
#                 continue
        
#         # Try entire content if it looks like JSON
#         content = content.strip()
#         if content.startswith('{') and content.endswith('}'):
#             return content
        
#         return ""

#     def _format_response(self, llm_result: Dict, raw_query: str) -> Dict:
#         """Format response to maintain backward compatibility"""
#         domain_status = llm_result.get("domain_status", "in_domain")
        
#         if domain_status == "out_of_domain":
#             return {
#                 "domain_status": "out_of_domain",
#                 "raw_query": raw_query,
#                 "enhanced_query": llm_result.get("enhanced_query", raw_query),
#                 "final_response": llm_result.get("final_response", "Query is not related to data analytics"),
#                 "domain_reason": llm_result.get("domain_reason", "Out of domain query")
#             }
        
#         # In-domain processing
#         match_type = llm_result.get("match_type", "none")
        
#         base_response = {
#             "domain_status": "in_domain",
#             "domain_reason": llm_result.get("domain_reason", "Query relates to data analytics"),
#             "raw_query": raw_query,
#             "enhanced_query": llm_result.get("enhanced_query", raw_query),
#             "tools_used": ["Single_LLM_Direct"],
#             "processing_steps": ["single_llm_processing"]
#         }
        
#         if match_type == "single":
#             atom_name = llm_result.get("atom_name", "")
            
#             # Validate atom name
#             if atom_name not in self.valid_atoms:
#                 return self._create_no_atom_response(raw_query, llm_result.get("enhanced_query", raw_query))
            
#             return {
#                 **base_response,
#                 "llm2_status": "atom_found",
#                 "atom_status": True,
#                 "match_type": "single",
#                 "atom_name": atom_name.lower().replace(" ", ""),
#                 "confidence": llm_result.get("confidence", 0.8),
#                 "category": self._get_atom_category(atom_name),
#                 "description": self._get_atom_description(atom_name),
#                 "final_response": llm_result.get("final_response", f"{atom_name} is the best tool for your needs"),
#                 "recommendation": f"Use {atom_name.lower().replace(' ', '')} for your task"
#             }
            
#         elif match_type == "multi":
#             relevant_atoms = llm_result.get("relevant_atoms", [])
#             formatted_atoms = []
            
#             for atom in relevant_atoms:
#                 atom_name = atom.get("atom_name", "")
#                 if atom_name in self.valid_atoms:
#                     formatted_atoms.append({
#                         "name": atom_name.lower().replace(" ", ""),
#                         "description": self._get_atom_description(atom_name),
#                         "score": atom.get("confidence", 0.5),
#                         "category": self._get_atom_category(atom_name)
#                     })
            
#             if not formatted_atoms:
#                 return self._create_no_atom_response(raw_query, llm_result.get("enhanced_query", raw_query))
            
#             atom_names = [atom["name"] for atom in formatted_atoms]
            
#             return {
#                 **base_response,
#                 "llm2_status": "multi_atom_analysis",
#                 "atom_status": False,
#                 "match_type": "multi",
#                 "relevant_atoms": formatted_atoms,
#                 "final_response": llm_result.get("final_response", f"Multiple tools could help: {', '.join(atom_names)}"),
#                 "recommendation": f"Consider using multiple tools: {', '.join(atom_names)}"
#             }
        
#         else:
#             return self._create_no_atom_response(raw_query, llm_result.get("enhanced_query", raw_query))

#     def _get_atom_category(self, atom_name: str) -> str:
#         """Get atom category"""
#         category_map = {
#             "ChartMaker": "visualization",
#             "Feature Overview": "data_profiling",
#             "GroupBy with Wtg Avg": "aggregation",
#             "Data Upload & Validate": "data_governance",
#             "Explore": "data_exploration",
#             "Merge": "data_integration",
#             "Concatenate": "data_integration",
#             "Create": "feature_engineering",
#             "Delete": "data_cleaning",
#             "Rename": "data_cleaning",
#             "Text Box": "documentation",
#             "Correlation": "statistical_analysis",
#             "Scope Selector": "data_filtering",
#             "Row Operations": "data_manipulation",
#             "Regression - Feature Based": "modeling",
#             "Select Models - Feature Based": "model_selection",
#             "Evaluate Models - Feature Based": "model_evaluation",
#             "Auto-regressive Models": "time_series_modeling",
#             "Select Models - Auto Regressive": "model_selection",
#             "Evaluate Models - Auto Regressive": "model_evaluation",
#             "Scenario Planner": "business_planning",
#             "Optimizer": "optimization",
#             "Base Price Estimator": "pricing_analysis",
#             "Promo Estimator": "marketing_analysis"
#         }
#         return category_map.get(atom_name, "unknown")

#     def _get_atom_description(self, atom_name: str) -> str:
#         """Get atom description"""
#         descriptions = {
#             "ChartMaker": "Creates interactive charts and visualizations using FastAPI, pandas, and Plotly",
#             "Feature Overview": "Provides comprehensive dataset profiling and readiness assessment",
#             "GroupBy with Wtg Avg": "Performs data aggregation with weighted averages across dimensions",
#             "Data Upload & Validate": "Uploads and validates data files with schema verification",
#             "Explore": "Interactive data browsing and missing value analysis",
#             "Merge": "Joins datasets on common columns with various join types",
#             "Concatenate": "Combines datasets vertically or horizontally",
#             "Create": "Generates new columns through various operations and transformations",
#             "Correlation": "Computes correlation matrices between numerical variables",
#             "Regression - Feature Based": "Fits regression models using manually engineered features",
#             "Auto-regressive Models": "Fits time-series models for forecasting",
#             "Scenario Planner": "Simulates business outcomes under different assumptions",
#             "Optimizer": "Solves constrained optimization problems"
#         }
#         return descriptions.get(atom_name, "Data analytics tool")

#     def _create_no_atom_response(self, raw_query: str, enhanced_query: str) -> Dict:
#         """Create response when no atoms found"""
#         return {
#             "domain_status": "in_domain",
#             "domain_reason": "Query relates to data analytics but no specific tool match found",
#             "llm2_status": "no_atom",
#             "atom_status": False,
#             "match_type": "none",
#             "raw_query": raw_query,
#             "enhanced_query": enhanced_query,
#             "final_response": "To better assist you in finding the right tool, I need more specific information about your data analytics task.",
#             "recommendation": "Please provide a more specific query for better tool matching",
#             "tools_used": ["Single_LLM_Direct"],
#             "processing_steps": ["single_llm_processing"]
#         }

#     def _create_error_response(self, raw_query: str) -> Dict:
#         """Create error response"""
#         return {
#             "domain_status": "in_domain",
#             "domain_reason": "Technical error occurred during processing",
#             "llm2_status": "error",
#             "atom_status": False,
#             "match_type": "none",
#             "raw_query": raw_query,
#             "enhanced_query": raw_query,
#             "final_response": "Technical error occurred. Please try again.",
#             "error": "Single LLM processing failed",
#             "tools_used": ["Single_LLM_Direct"],
#             "processing_steps": ["error_handling"]
#         }


# import requests
# import json
# import re
# from typing import Dict, List, Optional

# class SingleLLMProcessor:
#     def __init__(self, api_url: str, model_name: str, bearer_token: str):
#         self.api_url = api_url
#         self.model_name = model_name
#         self.bearer_token = bearer_token
#         self.headers = {
#             "Authorization": f"Bearer {bearer_token}",
#             "Content-Type": "application/json"
#         }
        
#         # Valid atom names for validation
#         self.valid_atoms = [
#             "ChartMaker", "Feature Overview", "GroupBy with Wtg Avg", "Data Upload & Validate",
#             "Explore", "Merge", "Concatenate", "Create", "Delete", "Rename", "Text Box",
#             "Correlation", "Scope Selector", "Row Operations", "Regression - Feature Based",
#             "Select Models - Feature Based", "Evaluate Models - Feature Based",
#             "Auto-regressive Models", "Select Models - Auto Regressive", 
#             "Evaluate Models - Auto Regressive", "Scenario Planner", "Optimizer",
#             "Base Price Estimator", "Promo Estimator"
#         ]
        
#         # Atom descriptions and keywords
#         self.atom_knowledge = self._build_comprehensive_atom_knowledge()

#     def _build_comprehensive_atom_knowledge(self) -> str:
#         """Build comprehensive atom knowledge with keywords"""
#         atom_data = {
#             "ChartMaker": {
#                 "description": "Creates interactive charts (bar, line, area, pie, histogram, heatmap, waterfall). It is great tool for graphs  and data visualization.",
#                 "keywords": ['chart maker', 'chart creation', 'data visualization', 'chart', 'graph', 'plot', 'interactive chart', 'bar chart', 'line chart', 'pie chart', 'histogram', 'heatmap', 'business dashboard', 'analytics chart']
#             },
#             "Feature Overview": {
#                 "description": "Provides comprehensive dataset profiling across markets, products, and time. Analyzes completeness, segment coverage, and key statistics for model readiness assessment.",
#                 "keywords": ['feature overview', 'data overview', 'dataset summary', 'feature profiling', 'data readiness', 'EDA', 'data completeness', 'data health check']
#             },
#             "GroupBy with Wtg Avg": {
#                 "description": "Aggregates datasets by grouping across dimensions using weighted averages, sum, mean, rank percentile for business KPIs and reporting.",
#                 "keywords": ['weighted average', 'group by', 'aggregate', 'grouping', 'data aggregation', 'summarization', 'dimension analysis', 'KPIs']
#             },
#             "Data Upload & Validate": {
#                 "description": "Uploads master files, validates schemas, classifies columns into identifiers/measures, maps business dimensions .",
#                 "keywords": ['data upload', 'file validation', 'master file', 'column classification', 'schema validation', 'data governance']
#             },
#             "Explore": {
#                 "description": "Interactive data browsing, missing value analysis, column profiling, data distribution analysis for early data exploration.",
#                 "keywords": ['data exploration', 'missing values', 'summary statistics', 'column profile', 'EDA', 'data browser']
#             },
#             "Merge": {
#                 "description": "Joins datasets on common columns (inner/left/right/outer joins). Similar to VLOOKUP or SQL JOIN for data integration.",
#                 "keywords": ['merge', 'join', 'combine', 'VLOOKUP', 'inner join', 'left join', 'outer join', 'data integration']
#             },
#             "Concatenate": {
#                 "description": "Combines datasets vertically (row-wise) or horizontally (column-wise) for stacking or extending data.",
#                 "keywords": ['concatenate', 'concat', 'stack', 'append', 'combine datasets', 'vertical merge', 'horizontal merge']
#             },
#             "Create": {
#                 "description": "Generates new columns through operations (add, subtract, multiply, divide, dummy conversion, trend detection) for feature engineering.",
#                 "keywords": ['create', 'feature engineering', 'new columns', 'add', 'subtract', 'multiply', 'divide', 'dummy variable']
#             },
#             "Correlation": {
#                 "description": "Computes correlation matrices (Pearson, Spearman, Kendall) between numerical variables to identify relationships and multicollinearity.",
#                 "keywords": ['correlation', 'relationship', 'pearson', 'spearman', 'kendall', 'correlation matrix']
#             },
#             "Regression - Feature Based": {
#                 "description": "Fits regression models using manually engineered features. OLS regression with interpretable coefficients for hypothesis-driven modeling.",
#                 "keywords": ['regression', 'linear regression', 'feature model', 'OLS', 'predictive modeling']
#             },
#             "Auto-regressive Models": {
#                 "description": "Fits time-series models (AR, ARIMA, SARIMA) for forecasting. Captures trends, seasonality, auto-correlations in historical data.",
#                 "keywords": ['time series', 'ARIMA', 'SARIMA', 'forecast', 'forecasting', 'seasonality']
#             },
#             "Scenario Planner": {
#                 "description": "Simulates business outcomes under different assumptions. What-if analysis for strategic planning and decision impact evaluation.",
#                 "keywords": ['scenario', 'what-if analysis', 'business scenario', 'planning', 'simulation']
#             },
#             "Optimizer": {
#                 "description": "Solves constrained optimization problems (maximize sales, minimize cost, resource allocation) for strategic decision-making.",
#                 "keywords": ['optimizer', 'optimization', 'maximize', 'minimize', 'resource allocation', 'optimal']
#             }
#         }
        
#         knowledge = "Available atoms with descriptions and keywords:\n\n"
#         for atom, data in atom_data.items():
#             knowledge += f"**{atom}**: {data['description']}\n"
#             knowledge += f"Keywords: {', '.join(data['keywords'][:15])}\n\n"
        
#         return knowledge

#     def process_query(self, raw_query: str) -> Dict:
#         """Single LLM processing for domain check, query enhancement, and atom extraction"""
        
#         if not raw_query or not raw_query.strip():
#             return {
#                 "domain_status": "out_of_domain",
#                 "raw_query": raw_query,
#                 "enhanced_query": raw_query,
#                 "final_response": "Empty query provided. Please ask a question related to data analytics, visualization, or business intelligence.",
#                 "domain_reason": "Query is empty, cannot be processed"
#             }

#         # Enhanced prompt that combines domain checking and atom extraction
#         prompt = f"""You are an expert data analytics consultant. Analyze the user query and perform the following tasks:

# 1. First, enhance the query by fixing grammar and improving clarity
# 2. Check if the enhanced query relates to data analytics, visualization, or business intelligence
# 3. If in-domain, identify the most suitable atom/tool from the available options

# User Query: "{raw_query}"

# {self.atom_knowledge}

# Instructions:
# - Enhance the query for better clarity and grammar
# - Determine if query is related to data analytics, visualization, ML, statistics, or BI
# - If in-domain, match to the best atom(s) using keywords and descriptions
# - Return response in the exact JSON format below

# For IN-DOMAIN with SINGLE atom match:
# {{
#   "domain_status": "in_domain",
#   "raw_query": "{raw_query}",
#   "enhanced_query": "enhanced version of the query",
#   "match_type": "single",
#   "atom_name": "ChartMaker",
#   "confidence": 0.9,
#   "reason": "Perfect match for visualization needs",
#   "domain_reason": "Query relates to data visualization"
# }}

# For IN-DOMAIN with MULTIPLE atom matches:
# {{
#   "domain_status": "in_domain", 
#   "raw_query": "{raw_query}",
#   "enhanced_query": "enhanced version of the query",
#   "match_type": "multi",
#   "relevant_atoms": [
#     {{
#       "atom_name": "ChartMaker",
#       "confidence": 0.8,
#       "reason": "Good for visualization"
#     }},
#     {{
#       "atom_name": "Feature Overview",
#       "confidence": 0.7,
#       "reason": "Good for data profiling"
#     }}
#   ],
#   "domain_reason": "Query relates to data analytics"
# }}

# For OUT-OF-DOMAIN:
# {{
#   "domain_status": "out_of_domain",
#   "raw_query": "{raw_query}",
#   "enhanced_query": "enhanced version of the query", 
#   "domain_reason": "Query does not relate to data analytics, visualization, or BI tasks"
# }}

# Analyze and respond with JSON only:"""

#         return self._call_single_llm(prompt, raw_query)

#     def _call_single_llm(self, prompt: str, raw_query: str) -> Dict:
#         """Call single LLM for complete processing"""
#         payload = {
#             "model": self.model_name,
#             "messages": [
#                 {
#                     "role": "system",
#                     "content": "You are an expert data analytics consultant. ALWAYS respond with ONLY valid JSON. NO additional text, explanations, or formatting outside the JSON structure."
#                 },
#                 {
#                     "role": "user",
#                     "content": prompt
#                 }
#             ],
#             "temperature": 0.1,
#             "max_tokens": 600,
#             "stream": False
#         }
        
#         try:
#             print(f"\n🔄 Single LLM Processing: '{raw_query}'")
#             response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=30)
            
#             print(f"📥 LLM Response Status: {response.status_code}")
            
#             if response.status_code != 200:
#                 return self._create_error_response(raw_query)
            
#             content = response.json().get('message', {}).get('content', '')
#             print(f"\n📋 Raw LLM Output:\n{content}")
            
#             # Clean and extract JSON
#             json_content = self._extract_json_from_content(content)
#             if not json_content:
#                 return self._create_error_response(raw_query)
            
#             try:
#                 result = json.loads(json_content)
#                 return self._format_response_with_llm_intelligence(result, raw_query)
                
#             except json.JSONDecodeError as e:
#                 print(f"❌ JSON Parse Error: {str(e)}")
#                 return self._create_error_response(raw_query)
                
#         except Exception as e:
#             print(f"❌ Request Exception: {str(e)}")
#             return self._create_error_response(raw_query)

#     def _format_response_with_llm_intelligence(self, llm_result: Dict, raw_query: str) -> Dict:
#         """Format response using LLM intelligence for final_response generation"""
#         domain_status = llm_result.get("domain_status", "in_domain")
        
#         if domain_status == "out_of_domain":
#             # Generate intelligent out-of-domain response
#             final_response = self._generate_out_of_domain_response(
#                 llm_result.get("enhanced_query", raw_query),
#                 llm_result.get("domain_reason", "")
#             )
            
#             return {
#                 "domain_status": "out_of_domain",
#                 "raw_query": raw_query,
#                 "enhanced_query": llm_result.get("enhanced_query", raw_query),
#                 "final_response": final_response,
#                 "domain_reason": llm_result.get("domain_reason", "Out of domain query")
#             }
        
#         # In-domain processing
#         match_type = llm_result.get("match_type", "none")
        
#         base_response = {
#             "domain_status": "in_domain",
#             "domain_reason": llm_result.get("domain_reason", "Query relates to data analytics"),
#             "raw_query": raw_query,
#             "enhanced_query": llm_result.get("enhanced_query", raw_query),
#             "tools_used": ["Single_LLM_Direct"],
#             "processing_steps": ["single_llm_processing"]
#         }
        
#         if match_type == "single":
#             atom_name = llm_result.get("atom_name", "")
            
#             # Validate atom name
#             if atom_name not in self.valid_atoms:
#                 return self._create_no_atom_response_with_llm(raw_query, llm_result.get("enhanced_query", raw_query))
            
#             # Generate intelligent final response using atom description
#             final_response = self._generate_single_atom_response(
#                 atom_name,
#                 llm_result.get("reason", ""),
#                 llm_result.get("enhanced_query", raw_query)
#             )
            
#             return {
#                 **base_response,
#                 "llm2_status": "atom_found",
#                 "atom_status": True,
#                 "match_type": "single",
#                 "atom_name": atom_name.lower().replace(" ", ""),
#                 "confidence": llm_result.get("confidence", 0.8),
#                 "category": self._get_atom_category(atom_name),
#                 "description": self._get_atom_description(atom_name),
#                 "final_response": final_response,
#                 "recommendation": f"Use {atom_name.lower().replace(' ', '')} for your task"
#             }
            
#         elif match_type == "multi":
#             relevant_atoms = llm_result.get("relevant_atoms", [])
#             formatted_atoms = []
            
#             for atom in relevant_atoms:
#                 atom_name = atom.get("atom_name", "")
#                 if atom_name in self.valid_atoms:
#                     formatted_atoms.append({
#                         "name": atom_name.lower().replace(" ", ""),
#                         "description": self._get_atom_description(atom_name),
#                         "score": atom.get("confidence", 0.5),
#                         "category": self._get_atom_category(atom_name)
#                     })
            
#             if not formatted_atoms:
#                 return self._create_no_atom_response_with_llm(raw_query, llm_result.get("enhanced_query", raw_query))
            
#             # Generate intelligent multi-atom response
#             final_response = self._generate_multi_atom_response(
#                 formatted_atoms,
#                 llm_result.get("enhanced_query", raw_query)
#             )
            
#             atom_names = [atom["name"] for atom in formatted_atoms]
            
#             return {
#                 **base_response,
#                 "llm2_status": "multi_atom_analysis",
#                 "atom_status": False,
#                 "match_type": "multi",
#                 "relevant_atoms": formatted_atoms,
#                 "final_response": final_response,
#                 "recommendation": f"Consider using multiple tools: {', '.join(atom_names)}"
#             }
        
#         else:
#             return self._create_no_atom_response_with_llm(raw_query, llm_result.get("enhanced_query", raw_query))

#     def _generate_out_of_domain_response(self, enhanced_query: str, domain_reason: str) -> str:
#         """Generate intelligent out-of-domain response using LLM"""
#         prompt = f"""You are a helpful data analytics assistant. A user asked: "{enhanced_query}"

# This query is out-of-domain because: {domain_reason}

# Generate a helpful response (max 100 words) that:
# 1. Politely explains why this is outside your expertise
# 2. Suggests what types of data analytics questions you can help with
# 3. Be encouraging and helpful

# Response:"""

#         try:
#             response = self._call_llm_for_response_generation(prompt, max_tokens=120)
#             return response if response else f"This query is outside my data analytics expertise. I can help with data visualization, statistical analysis, machine learning, business intelligence, and data processing tasks. Please ask about charts, data exploration, modeling, or analytics workflows."
#         except:
#             return f"This query is outside my data analytics expertise. I can help with data visualization, statistical analysis, machine learning, business intelligence, and data processing tasks."

#     def _generate_single_atom_response(self, atom_name: str, reason: str, enhanced_query: str) -> str:
#         """Generate intelligent response for single atom match using LLM"""
#         atom_description = self._get_atom_description(atom_name)
        
#         prompt = f"""You are a data analytics expert. A user asked: "{enhanced_query}"

# The best tool for this task is: {atom_name}
# Tool description: {atom_description}
# Match reason: {reason}

# Generate a helpful response (max 80 words) that:
# 1. Confirms this tool is perfect for their need
# 2. Briefly explains what the tool does
# 3. Gives practical guidance on how it helps
# 4. Be encouraging and actionable

# Response:"""

#         try:
#             response = self._call_llm_for_response_generation(prompt, max_tokens=100)
#             return response if response else f"{atom_name} is the perfect tool for your needs. {atom_description} This will help you accomplish your task efficiently."
#         except:
#             return f"{atom_name} is the best tool for your needs. {reason}"

#     def _generate_multi_atom_response(self, formatted_atoms: List[Dict], enhanced_query: str) -> str:
#         """Generate intelligent response for multiple atoms using LLM"""
#         atom_info = []
#         for atom in formatted_atoms[:3]:  # Top 3 atoms
#             atom_info.append(f"{atom['name']}: {atom['description'][:50]}...")
        
#         atom_list = "; ".join(atom_info)
        
#         prompt = f"""You are a data analytics expert. A user asked: "{enhanced_query}"

# Multiple tools could help with this task:
# {atom_list}

# Generate a helpful response (max 100 words) that:
# 1. Acknowledges multiple tools are relevant
# 2. Suggests which tool to start with and why
# 3. Explains how they might work together
# 4. Gives clear next steps

# Response:"""

#         try:
#             response = self._call_llm_for_response_generation(prompt, max_tokens=120)
#             return response if response else f"Your query could benefit from multiple tools: {', '.join([a['name'] for a in formatted_atoms])}. I recommend starting with {formatted_atoms[0]['name']} as it has the highest relevance to your task."
#         except:
#             atom_names = [atom["name"] for atom in formatted_atoms]
#             return f"Your query could benefit from multiple tools: {', '.join(atom_names)}. Consider using them in sequence based on your workflow needs."

#     def _create_no_atom_response_with_llm(self, raw_query: str, enhanced_query: str) -> Dict:
#         """Create no atom response with LLM-generated final response"""
#         final_response = self._generate_no_match_response(enhanced_query)
        
#         return {
#             "domain_status": "in_domain",
#             "domain_reason": "Query relates to data analytics but no specific tool match found",
#             "llm2_status": "no_atom",
#             "atom_status": False,
#             "match_type": "none",
#             "raw_query": raw_query,
#             "enhanced_query": enhanced_query,
#             "final_response": final_response,
#             "recommendation": "Please provide a more specific query for better tool matching",
#             "tools_used": ["Single_LLM_Direct"],
#             "processing_steps": ["single_llm_processing"]
#         }

#     def _generate_no_match_response(self, enhanced_query: str) -> str:
#         """Generate intelligent no-match response using LLM"""
#         prompt = f"""You are a data analytics expert. A user asked: "{enhanced_query}"

# This query relates to data analytics but doesn't match any specific tool clearly.

# Generate a helpful response (max 80 words) that:
# 1. Acknowledges their analytics interest
# 2. Asks for more specific details
# 3. Suggests what information would help
# 4. Be encouraging and helpful

# Response:"""

#         try:
#             response = self._call_llm_for_response_generation(prompt, max_tokens=100)
#             return response if response else "I understand you're looking for data analytics help. To find the best tool, could you provide more specific details about your task? For example: Are you looking to visualize data, analyze patterns, merge datasets, or build models?"
#         except:
#             return "To better assist you in finding the right tool, I need more specific information about your data analytics task. Could you clarify what specific operation you want to perform?"

#     def _call_llm_for_response_generation(self, prompt: str, max_tokens: int = 100) -> str:
#         """Call LLM specifically for response generation"""
#         payload = {
#             "model": self.model_name,
#             "messages": [
#                 {
#                     "role": "system",
#                     "content": "You are a helpful data analytics expert. Provide clear, concise, and actionable responses. Be encouraging and professional."
#                 },
#                 {
#                     "role": "user",
#                     "content": prompt
#                 }
#             ],
#             "temperature": 0.3,
#             "max_tokens": max_tokens,
#             "stream": False
#         }
        
#         try:
#             response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=15)
            
#             if response.status_code != 200:
#                 return ""
            
#             content = response.json().get('message', {}).get('content', '').strip()
            
#             # Clean thinking tokens
#             if '<think>' in content:
#                 think_end = content.find('</think>')
#                 if think_end != -1:
#                     content = content[think_end + 8:].strip()
            
#             return content
            
#         except Exception as e:
#             print(f"Response generation error: {e}")
#             return ""

#     def _extract_json_from_content(self, content: str) -> str:
#         """Extract JSON from mixed content"""
#         # Clean thinking tokens
#         if '<think>' in content:
#             think_end = content.find('</think>')
#             if think_end != -1:
#                 content = content[think_end + 8:].strip()
        
#         # Try direct JSON extraction
#         json_pattern = r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})'
#         matches = re.findall(json_pattern, content, re.DOTALL)
        
#         for match in matches:
#             try:
#                 json.loads(match)
#                 return match.strip()
#             except:
#                 continue
        
#         # Try entire content if it looks like JSON
#         content = content.strip()
#         if content.startswith('{') and content.endswith('}'):
#             return content
        
#         return ""

#     def _get_atom_category(self, atom_name: str) -> str:
#         """Get atom category"""
#         category_map = {
#             "ChartMaker": "visualization",
#             "Feature Overview": "data_profiling",
#             "GroupBy with Wtg Avg": "aggregation",
#             "Data Upload & Validate": "data_governance",
#             "Explore": "data_exploration",
#             "Merge": "data_integration",
#             "Concatenate": "data_integration",
#             "Create": "feature_engineering",
#             "Delete": "data_cleaning",
#             "Rename": "data_cleaning",
#             "Text Box": "documentation",
#             "Correlation": "statistical_analysis",
#             "Scope Selector": "data_filtering",
#             "Row Operations": "data_manipulation",
#             "Regression - Feature Based": "modeling",
#             "Select Models - Feature Based": "model_selection",
#             "Evaluate Models - Feature Based": "model_evaluation",
#             "Auto-regressive Models": "time_series_modeling",
#             "Select Models - Auto Regressive": "model_selection",
#             "Evaluate Models - Auto Regressive": "model_evaluation",
#             "Scenario Planner": "business_planning",
#             "Optimizer": "optimization",
#             "Base Price Estimator": "pricing_analysis",
#             "Promo Estimator": "marketing_analysis"
#         }
#         return category_map.get(atom_name, "unknown")

#     def _get_atom_description(self, atom_name: str) -> str:
#         """Get atom description"""
#         descriptions = {
#             "ChartMaker": "Creates interactive charts and visualizations using FastAPI, pandas, and Plotly",
#             "Feature Overview": "Provides comprehensive dataset profiling and readiness assessment",
#             "GroupBy with Wtg Avg": "Performs data aggregation with weighted averages across dimensions",
#             "Data Upload & Validate": "Uploads and validates data files with schema verification",
#             "Explore": "Interactive data browsing and missing value analysis",
#             "Merge": "Joins datasets on common columns with various join types",
#             "Concatenate": "Combines datasets vertically or horizontally",
#             "Create": "Generates new columns through various operations and transformations",
#             "Correlation": "Computes correlation matrices between numerical variables",
#             "Regression - Feature Based": "Fits regression models using manually engineered features",
#             "Auto-regressive Models": "Fits time-series models for forecasting",
#             "Scenario Planner": "Simulates business outcomes under different assumptions",
#             "Optimizer": "Solves constrained optimization problems"
#         }
#         return descriptions.get(atom_name, "Data analytics tool")

#     def _create_error_response(self, raw_query: str) -> Dict:
#         """Create error response"""
#         return {
#             "domain_status": "in_domain",
#             "domain_reason": "Technical error occurred during processing",
#             "llm2_status": "error",
#             "atom_status": False,
#             "match_type": "none",
#             "raw_query": raw_query,
#             "enhanced_query": raw_query,
#             "final_response": "I encountered a technical issue while processing your request. Please try again or rephrase your question about data analytics, visualization, or business intelligence.",
#             "error": "Single LLM processing failed",
#             "tools_used": ["Single_LLM_Direct"],
#             "processing_steps": ["error_handling"]
#         }











import requests
import json
import re
from typing import Dict, List, Optional

class SingleLLMProcessor:
    def __init__(self, api_url: str, model_name: str, bearer_token: str):
        self.api_url = api_url
        self.model_name = model_name
        self.bearer_token = bearer_token
        self.headers = {
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json"
        }
        
        # Updated valid atom names from atoms_knowledge_base.json
        self.valid_atoms = [
            "Data Upload & Validate", "Feature Overview", "Column Classifier", "DataFrame Operations",
            "Create and Transform Features", "GroupBy with Wtg Avg", "Merge", "Concat",
            "Scope Selector", "Correlation", "Explore", "Regression - Feature Based",
            "Select Models - Feature Based", "Evaluate Models - Feature Based",
            "Auto-regressive Models", "Build Model - Feature Based", "Clustering",
            "ChartMaker", "Scenario Planner"
        ]
        
        # Updated atom descriptions from atoms_knowledge_base.json
        self.atom_descriptions = {
            "Data Upload & Validate": "Primary data ingestion atom that uploads CSV, Excel, and Arrow files with intelligent schema inference, automatic data type detection, missing value analysis, and comprehensive quality checks. This atom is ALWAYS the starting point of any data workflow.",
            
            "Feature Overview": "Comprehensive data profiling and exploratory data analysis atom. Generates statistical summaries, identifies patterns, detects anomalies, and provides visual insights into your dataset. Essential for understanding data structure before feature engineering.",
            
            "Column Classifier": "Intelligent column classification atom that automatically detects data types (numeric, categorical, datetime, text) and suggests appropriate transformations. Essential for preparing features for machine learning models.",
            
            "DataFrame Operations": "Universal data transformation atom that handles ALL data manipulation tasks through natural language. Think of it as your 'data swiss army knife' - it can filter rows, sort data, reorder columns, calculate metrics, clean data, and perform any ad-hoc data transformation in a single step.",
            
            "Create and Transform Features": "Feature engineering atom for creating calculated columns, derived metrics, and transformed features. Supports mathematical operations, string manipulations, date calculations, and conditional logic to enrich your dataset.",
            
            "GroupBy with Wtg Avg": "Powerful aggregation atom for grouping data by dimensions and calculating summaries including weighted averages. Essential for business intelligence, KPIs, and segment-level analysis.",
            
            "Merge": "Join datasets atom for combining multiple dataframes. Supports SQL-style joins (inner, left, right, outer) and can handle multiple key columns for complex data enrichment.",
            
            "Concat": "Concatenate datasets vertically (stack rows) or horizontally (append columns). Used for combining multiple files or extending datasets with additional records or attributes.",
            
            "Scope Selector": "Filter and subset data atom for selecting specific columns, rows, or data ranges. Essential for focusing analysis on relevant data segments.",
            
            "Correlation": "Calculate correlation analysis atom for discovering relationships between variables. Generates correlation matrices and heatmaps to identify dependencies, multicollinearity, and feature relationships.",
            
            "Explore": "Interactive data exploration atom with AI-powered insights. Browse, profile, and discover patterns in data through an intuitive interface with intelligent recommendations.",
            
            "Regression - Feature Based": "Build regression models atom for predicting continuous target variables using features. Trains linear regression, polynomial, and feature-based models with automatic feature selection.",
            
            "Select Models - Feature Based": "Model selection atom for comparing multiple regression models, performing hyperparameter tuning, and identifying the best performing model through cross-validation.",
            
            "Evaluate Models - Feature Based": "Model evaluation atom for assessing regression model performance with comprehensive metrics, residual analysis, and diagnostic plots to validate model quality.",
            
            "Auto-regressive Models": "Time series forecasting atom using ARIMA and seasonal decomposition for predicting future values based on historical patterns, trends, and seasonality.",
            
            "Build Model - Feature Based": "Production-ready model building atom for training, persisting, and deploying regression models with comprehensive feature engineering and model artifacts.",
            
            "Clustering": "Unsupervised clustering atom for customer segmentation, pattern discovery, and grouping similar observations using K-means and optimal cluster selection.",
            
            "ChartMaker": "AI-powered chart creation atom with natural language interface. Creates interactive, publication-ready charts and dashboards from data. Supports bar, line, area, pie, scatter plots, heatmaps, and more.",
            
            "Scenario Planner": "Business scenario planning atom for creating and comparing multiple what-if scenarios. Adjusts variables to assess impacts and supports strategic decision making."
        }
        
        # Updated atom keywords from atoms_knowledge_base.json
        self.atom_categories = {
            "Data Upload & Validate": ['upload', 'validate', 'import', 'data-quality', 'schema', 'ingestion', 'csv', 'excel', 'arrow', 'file upload', 'data validation', 'schema inference', 'data type detection', 'missing value analysis', 'quality checks', 'data ingestion', 'first step', 'starting point', 'load data', 'import data'],
            
            "Feature Overview": ['eda', 'profiling', 'overview', 'statistics', 'exploration', 'analysis', 'data profiling', 'exploratory', 'summary statistics', 'data overview', 'dataset summary', 'statistical summary', 'anomaly detection', 'pattern identification', 'data insights', 'data discovery'],
            
            "Column Classifier": ['classification', 'data-types', 'schema', 'feature-types', 'preparation', 'column classification', 'type detection', 'categorical', 'numerical', 'datetime', 'text classification', 'feature types', 'data types', 'column types'],
            
            "DataFrame Operations": ['operations', 'transform', 'manipulate', 'ai-powered', 'cleaning', 'filtering', 'versatile', 'filter', 'sort', 'reorder', 'delete columns', 'edit cells', 'calculated columns', 'data cleaning', 'subset', 'natural language', 'data manipulation', 'data preparation', 'swiss army knife', 'ad-hoc', 'quick transform', 'restructure'],
            
            "Create and Transform Features": ['calculate', 'derive', 'transform', 'feature-engineering', 'columns', 'mathematical operations', 'string operations', 'date calculations', 'conditional logic', 'new columns', 'derived metrics', 'feature creation', 'calculated fields', 'transformations'],
            
            "GroupBy with Wtg Avg": ['groupby', 'aggregate', 'weighted-average', 'summarize', 'kpi', 'weighted average', 'group by', 'aggregation', 'sum', 'mean', 'median', 'count', 'business intelligence', 'segment analysis', 'dimension analysis', 'weighted sum'],
            
            "Merge": ['merge', 'join', 'combine', 'vlookup', 'lookup', 'inner join', 'left join', 'right join', 'outer join', 'sql join', 'data integration', 'combine datasets', 'enrich data', 'link data'],
            
            "Concat": ['concat', 'stack', 'append', 'combine', 'union', 'concatenate', 'vertical', 'horizontal', 'row-wise', 'column-wise', 'combine files', 'stack data', 'extend dataset'],
            
            "Scope Selector": ['filter', 'select', 'subset', 'focus', 'column selection', 'row filtering', 'conditional selection', 'date range', 'value range', 'data scoping', 'focus analysis', 'segment data'],
            
            "Correlation": ['correlation', 'relationship', 'statistics', 'pattern', 'pearson', 'spearman', 'correlation matrix', 'heatmap', 'multicollinearity', 'feature relationships', 'variable relationships', 'dependencies'],
            
            "Explore": ['explore', 'eda', 'interactive', 'insights', 'discovery', 'data exploration', 'interactive browsing', 'data browser', 'pattern recognition', 'ai insights', 'anomaly detection', 'data navigation'],
            
            "Regression - Feature Based": ['regression', 'prediction', 'ml', 'supervised', 'modeling', 'linear regression', 'polynomial', 'feature-based', 'predictive modeling', 'continuous target', 'model training'],
            
            "Select Models - Feature Based": ['model-selection', 'comparison', 'hyperparameter', 'optimization', 'cross-validation', 'model comparison', 'best model', 'hyperparameter tuning', 'grid search', 'model optimization'],
            
            "Evaluate Models - Feature Based": ['evaluation', 'metrics', 'performance', 'diagnostics', 'r-squared', 'mae', 'mse', 'rmse', 'residual analysis', 'model validation', 'prediction accuracy', 'model assessment'],
            
            "Auto-regressive Models": ['time-series', 'forecasting', 'arima', 'prediction', 'seasonal decomposition', 'forecast', 'trend', 'seasonality', 'time series forecasting', 'historical patterns'],
            
            "Build Model - Feature Based": ['modeling', 'production', 'deployment', 'training', 'model persistence', 'feature engineering', 'model artifacts', 'batch prediction', 'model versioning', 'production model'],
            
            "Clustering": ['clustering', 'segmentation', 'unsupervised', 'kmeans', 'customer segmentation', 'pattern discovery', 'k-means', 'cluster analysis', 'grouping', 'segment discovery'],
            
            "ChartMaker": ['chart', 'visualization', 'plotly', 'interactive', 'dashboard', 'bar chart', 'line chart', 'area chart', 'pie chart', 'scatter plot', 'histogram', 'heatmap', 'waterfall', 'visual', 'graph', 'plot', 'business dashboard', 'reporting'],
            
            "Scenario Planner": ['planning', 'scenarios', 'what-if', 'strategy', 'scenario planning', 'what-if analysis', 'business scenarios', 'impact analysis', 'sensitivity testing', 'strategic planning', 'decision making']
        }
        
        # Build comprehensive atom knowledge
        self.atom_knowledge = self._build_comprehensive_atom_knowledge()

    def _build_comprehensive_atom_knowledge(self) -> str:
        """Build comprehensive atom knowledge with keywords from paste file"""
        knowledge = "Available atoms with detailed descriptions and keywords:\n\n"
        
        for atom in self.valid_atoms:
            description = self.atom_descriptions.get(atom, "")
            keywords = self.atom_categories.get(atom, [])
            
            knowledge += f"**{atom}**: {description}\n"
            if keywords:
                # Limit keywords for prompt size but include most relevant ones
                keyword_str = ', '.join(keywords[:20])
                knowledge += f"Keywords: {keyword_str}\n"
            knowledge += "\n"
        
        return knowledge

    def process_query(self, raw_query: str) -> Dict:
        """Single LLM processing for domain check, query enhancement, and atom extraction"""
        
        if not raw_query or not raw_query.strip():
            return {
                "domain_status": "out_of_domain",
                "raw_query": raw_query,
                "enhanced_query": raw_query,
                "final_response": "Empty query provided. Please ask about data analytics.",
                "domain_reason": "Query is empty"
            }

        # Enhanced prompt using comprehensive atom knowledge
        prompt = f"""You are an expert data analytics consultant. Analyze the user query and perform the following tasks:

1. First, enhance the query by fixing grammar and improving clarity
2. Check if the enhanced query relates to data analytics, visualization, or business intelligence
3. If in-domain, identify the most suitable atom/tool from the available options

User Query: "{raw_query}"

{self.atom_knowledge}

IMPORTANT MATCHING GUIDELINES:
- "DataFrame Operations" is the MOST VERSATILE atom - use it for: filtering, sorting, reordering columns, data cleaning, subsetting, viewing raw data, excel-like operations, and general data manipulation
- "Data Upload & Validate" is ALWAYS the first atom for loading/uploading data files
- "ChartMaker" for all visualization, charts, graphs, and plotting requests
- "Feature Overview" for data profiling, EDA, and summary statistics
- "Create and Transform Features" for creating calculated columns and feature engineering
- "Correlation" for analyzing relationships between variables
- Use machine learning atoms only when explicitly building predictive models

Instructions:
- Enhance the query for better clarity and grammar
- Determine if query is related to data analytics, visualization, ML, statistics, or modeling 
- Use the keywords and descriptions to match the best atom(s)
- Consider synonyms and related terms from the keyword lists
- Prioritize DataFrame Operations for general data manipulation tasks
- Return response in the exact JSON format below

For IN-DOMAIN with SINGLE atom match:
{{
  "domain_status": "in_domain",
  "raw_query": "{raw_query}",
  "enhanced_query": "enhanced version of the query",
  "match_type": "single",
  "atom_name": "DataFrame Operations",
  "confidence": 0.9,
  "reason": "Perfect match for data filtering and manipulation based on keywords",
  "domain_reason": "Query relates to data manipulation"
}}

For IN-DOMAIN with MULTIPLE atom matches:
{{
  "domain_status": "in_domain", 
  "raw_query": "{raw_query}",
  "enhanced_query": "enhanced version of the query",
  "match_type": "multi",
  "relevant_atoms": [
    {{
      "atom_name": "DataFrame Operations",
      "confidence": 0.8,
      "reason": "Good for data manipulation based on keywords"
    }},
    {{
      "atom_name": "Feature Overview",
      "confidence": 0.7,
      "reason": "Good for data profiling based on keywords"
    }}
  ],
  "domain_reason": "Query relates to data analytics"
}}

For OUT-OF-DOMAIN:
{{
  "domain_status": "out_of_domain",
  "raw_query": "{raw_query}",
  "enhanced_query": "enhanced version of the query", 
  "domain_reason": "Query does not relate to data analytics, visualization, or modeling tasks"
}}

Analyze and respond with JSON only:"""

        return self._call_single_llm(prompt, raw_query)

    def _call_single_llm(self, prompt: str, raw_query: str) -> Dict:
        """Call single LLM for complete processing"""
        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert data analytics consultant with comprehensive knowledge of all available atoms (19 total) from the atoms_knowledge_base.json. These atoms are organized into 6 categories: data_sources, data_processing, analytics, machine_learning, visualization, and planning_optimization. ALWAYS respond with ONLY valid JSON. NO additional text, explanations, or formatting outside the JSON structure. Use the detailed atom descriptions and keywords for precise matching. Prioritize 'DataFrame Operations' for general data manipulation tasks as it's the most versatile atom."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.1,
            "max_tokens": 600,
            "stream": False
        }
        
        try:
            response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=30)
            
            if response.status_code != 200:
                return self._create_error_response(raw_query)
            
            content = response.json().get('message', {}).get('content', '')
            
            # Clean and extract JSON
            json_content = self._extract_json_from_content(content)
            if not json_content:
                return self._create_error_response(raw_query)
            
            try:
                result = json.loads(json_content)
                return self._format_response_with_optimal_length(result, raw_query)
                
            except json.JSONDecodeError as e:
                return self._create_error_response(raw_query)
                
        except Exception as e:
            return self._create_error_response(raw_query)

    def _format_response_with_optimal_length(self, llm_result: Dict, raw_query: str) -> Dict:
        """Format response with optimal 3-4 line responses (around 100 words)"""
        domain_status = llm_result.get("domain_status", "in_domain")
        
        if domain_status == "out_of_domain":
            # Generate optimal out-of-domain response
            final_response = self._generate_optimal_out_of_domain_response(
                llm_result.get("enhanced_query", raw_query),
                llm_result.get("domain_reason", "")
            )
            
            return {
                "domain_status": "out_of_domain",
                "raw_query": raw_query,
                "enhanced_query": llm_result.get("enhanced_query", raw_query),
                "final_response": final_response,
                "domain_reason": llm_result.get("domain_reason", "Out of domain query")
            }
        
        # In-domain processing
        match_type = llm_result.get("match_type", "none")
        
        base_response = {
            "domain_status": "in_domain",
            "domain_reason": llm_result.get("domain_reason", "Query relates to data analytics"),
            "raw_query": raw_query,
            "enhanced_query": llm_result.get("enhanced_query", raw_query),
            "tools_used": ["Single_LLM_Direct"],
            "processing_steps": ["single_llm_processing"]
        }
        
        if match_type == "single":
            atom_name = llm_result.get("atom_name", "")
            
            # Validate atom name
            if atom_name not in self.valid_atoms:
                return self._create_no_atom_response_optimal(raw_query, llm_result.get("enhanced_query", raw_query))
            
            # Generate optimal final response (3-4 lines, ~100 words)
            final_response = self._generate_optimal_single_atom_response(
                atom_name,
                llm_result.get("reason", "")
            )
            
            return {
                **base_response,
                "llm2_status": "atom_found",
                "atom_status": True,
                "match_type": "single",
                "atom_name": atom_name.lower().replace(" ", ""),
                "confidence": llm_result.get("confidence", 0.8),
                "category": self._get_atom_category(atom_name),
                "description": self.atom_descriptions.get(atom_name, ""),
                "final_response": final_response,
                "recommendation": f"Use {atom_name.lower().replace(' ', '')} for your task"
            }
            
        elif match_type == "multi":
            relevant_atoms = llm_result.get("relevant_atoms", [])
            formatted_atoms = []
            
            for atom in relevant_atoms:
                atom_name = atom.get("atom_name", "")
                if atom_name in self.valid_atoms:
                    formatted_atoms.append({
                        "name": atom_name.lower().replace(" ", ""),
                        "description": self.atom_descriptions.get(atom_name, ""),
                        "score": atom.get("confidence", 0.5),
                        "category": self._get_atom_category(atom_name)
                    })
            
            if not formatted_atoms:
                return self._create_no_atom_response_optimal(raw_query, llm_result.get("enhanced_query", raw_query))
            
            # Generate optimal multi-atom response (3-4 lines, ~100 words)
            final_response = self._generate_optimal_multi_atom_response(formatted_atoms)
            
            atom_names = [atom["name"] for atom in formatted_atoms]
            
            return {
                **base_response,
                "llm2_status": "multi_atom_analysis",
                "atom_status": False,
                "match_type": "multi",
                "relevant_atoms": formatted_atoms,
                "final_response": final_response,
                "recommendation": f"Consider using multiple tools: {', '.join(atom_names)}"
            }
        
        else:
            return self._create_no_atom_response_optimal(raw_query, llm_result.get("enhanced_query", raw_query))

    def _generate_optimal_out_of_domain_response(self, enhanced_query: str, domain_reason: str) -> str:
        """Generate optimal out-of-domain response (3-4 lines, ~100 words)"""
        prompt = f"""User asked: "{enhanced_query}"

This is out-of-domain because: {domain_reason}

Generate a helpful response in exactly 3-4 lines (around 100 words) that:
1. Politely explains why this is outside data analytics expertise
2. Suggests what types of questions you can help with
3. Be encouraging and specific about your capabilities
4. Keep it conversational and helpful

Response:"""

        try:
            response = self._call_llm_for_optimal_response(prompt, max_tokens=120)
            return response if response else "This query is outside my data analytics expertise. I specialize in helping with data visualization, statistical analysis, machine learning, business intelligence, and data processing tasks. I can assist with charts, data exploration, modeling, forecasting, and analytics workflows. Please ask about specific data analytics operations you need help with."
        except:
            return "This query is outside my data analytics expertise. I specialize in helping with data visualization, statistical analysis, machine learning, business intelligence, and data processing tasks. I can assist with charts, data exploration, modeling, forecasting, and analytics workflows. Please ask about specific data analytics operations you need help with."

    def _generate_optimal_single_atom_response(self, atom_name: str, reason: str) -> str:
        """Generate optimal response for single atom match (3-4 lines, ~100 words)"""
        prompt = f"""Tool found: {atom_name}
Reason: {reason}

Generate a helpful response in exactly 3-4 lines (around 100 words) that:
1. Confirms this tool is perfect for their need
2. Briefly explains what the tool does and its key benefits
3. Provides practical guidance on how it helps their specific task
4. Be encouraging and actionable

Response:"""

        try:
            response = self._call_llm_for_optimal_response(prompt, max_tokens=120)
            return response if response else f"{atom_name} is the perfect tool for your needs. This powerful solution will help you accomplish your data analytics task efficiently. It provides comprehensive functionality specifically designed for your requirements. You can start using it immediately to get the results you're looking for."
        except:
            return f"{atom_name} is the perfect tool for your needs. This powerful solution will help you accomplish your data analytics task efficiently. It provides comprehensive functionality specifically designed for your requirements. You can start using it immediately to get the results you're looking for."

    def _generate_optimal_multi_atom_response(self, formatted_atoms: List[Dict]) -> str:
        """Generate optimal response for multiple atoms (3-4 lines, ~100 words)"""
        atom_names = [atom['name'] for atom in formatted_atoms[:3]]
        
        prompt = f"""Multiple tools found: {', '.join(atom_names)}

Generate a helpful response in exactly 3-4 lines (around 100 words) that:
1. Acknowledges multiple relevant tools are available
2. Suggests which tool to start with and why
3. Explains how they might work together in a workflow
4. Provides clear next steps and be actionable

Response:"""

        try:
            response = self._call_llm_for_optimal_response(prompt, max_tokens=120)
            return response if response else f"Multiple tools could help with your task: {', '.join(atom_names)}. I recommend starting with {formatted_atoms[0]['name']} as it has the highest relevance to your specific needs. You can then use the other tools in sequence to complete your workflow. This approach will give you comprehensive results for your data analytics requirements."
        except:
            return f"Multiple tools could help with your task: {', '.join(atom_names)}. I recommend starting with {formatted_atoms[0]['name']} as it has the highest relevance to your specific needs. You can then use the other tools in sequence to complete your workflow. This approach will give you comprehensive results for your data analytics requirements."

    def _create_no_atom_response_optimal(self, raw_query: str, enhanced_query: str) -> Dict:
        """Create optimal no atom response (3-4 lines, ~100 words)"""
        final_response = self._generate_optimal_no_match_response(enhanced_query)
        
        return {
            "domain_status": "in_domain",
            "domain_reason": "Query relates to data analytics but no specific tool match found",
            "llm2_status": "no_atom",
            "atom_status": False,
            "match_type": "none",
            "raw_query": raw_query,
            "enhanced_query": enhanced_query,
            "final_response": final_response,
            "recommendation": "Please provide a more specific query for better tool matching",
            "tools_used": ["Single_LLM_Direct"],
            "processing_steps": ["single_llm_processing"]
        }

    def _generate_optimal_no_match_response(self, enhanced_query: str) -> str:
        """Generate optimal no-match response (3-4 lines, ~100 words)"""
        prompt = f"""User asked: "{enhanced_query}"

This relates to data analytics but doesn't match any specific tool clearly.

Generate a helpful response in exactly 3-4 lines (around 100 words) that:
1. Acknowledges their analytics interest
2. Asks for more specific details about their task
3. Suggests what information would help find the right tool
4. Be encouraging and provide examples of what you can help with

Response:"""

        try:
            response = self._call_llm_for_optimal_response(prompt, max_tokens=120)
            return response if response else "I understand you're looking for data analytics help, but I need more specific details to find the perfect tool for you. Could you clarify what specific operation you want to perform? For example, are you looking to create visualizations, analyze data patterns, merge datasets, build predictive models, or perform statistical analysis? With more details, I can recommend the exact tool that matches your needs."
        except:
            return "I understand you're looking for data analytics help, but I need more specific details to find the perfect tool for you. Could you clarify what specific operation you want to perform? For example, are you looking to create visualizations, analyze data patterns, merge datasets, build predictive models, or perform statistical analysis? With more details, I can recommend the exact tool that matches your needs."

    def _call_llm_for_optimal_response(self, prompt: str, max_tokens: int = 120) -> str:
        """Call LLM specifically for optimal response generation (3-4 lines, ~100 words)"""
        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a helpful data analytics expert. Provide clear, concise, and actionable responses in exactly 3-4 lines (around 100 words). Be encouraging, professional, and specific. Focus on quality over quantity."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "stream": False
        }
        
        try:
            response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=15)
            
            if response.status_code != 200:
                return ""
            
            content = response.json().get('message', {}).get('content', '').strip()
            
            # Clean thinking tokens
            if '<think>' in content:
                think_end = content.find('</think>')
                if think_end != -1:
                    content = content[think_end + 8:].strip()
            
            # Ensure response is optimal length (around 100 words, 3-4 lines)
            words = content.split()
            if len(words) > 120:
                content = ' '.join(words[:120])
            elif len(words) < 60:
                # If too short, pad with helpful context
                content += " This will help you achieve your data analytics goals efficiently."
            
            return content
            
        except Exception as e:
            return ""

    def _extract_json_from_content(self, content: str) -> str:
        """Extract JSON from mixed content"""
        # Clean thinking tokens
        if '<think>' in content:
            think_end = content.find('</think>')
            if think_end != -1:
                content = content[think_end + 8:].strip()
        
        # Try direct JSON extraction
        json_pattern = r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})'
        matches = re.findall(json_pattern, content, re.DOTALL)
        
        for match in matches:
            try:
                json.loads(match)
                return match.strip()
            except:
                continue
        
        # Try entire content if it looks like JSON
        content = content.strip()
        if content.startswith('{') and content.endswith('}'):
            return content
        
        return ""

    def _get_atom_category(self, atom_name: str) -> str:
        """Get atom category - updated from atoms_knowledge_base.json"""
        category_map = {
            "Data Upload & Validate": "data_sources",
            "Feature Overview": "data_processing",
            "Column Classifier": "data_processing",
            "DataFrame Operations": "data_processing",
            "Create and Transform Features": "data_processing",
            "GroupBy with Wtg Avg": "data_processing",
            "Merge": "data_processing",
            "Concat": "data_processing",
            "Scope Selector": "data_processing",
            "Correlation": "analytics",
            "Explore": "analytics",
            "Regression - Feature Based": "machine_learning",
            "Select Models - Feature Based": "machine_learning",
            "Evaluate Models - Feature Based": "machine_learning",
            "Auto-regressive Models": "machine_learning",
            "Build Model - Feature Based": "machine_learning",
            "Clustering": "machine_learning",
            "ChartMaker": "visualization",
            "Scenario Planner": "planning_optimization"
        }
        return category_map.get(atom_name, "unknown")

    def _create_error_response(self, raw_query: str) -> Dict:
        """Create optimal error response (3-4 lines, ~100 words)"""
        return {
            "domain_status": "in_domain",
            "domain_reason": "Technical error occurred during processing",
            "llm2_status": "error",
            "atom_status": False,
            "match_type": "none",
            "raw_query": raw_query,
            "enhanced_query": raw_query,
            "final_response": "I encountered a technical issue while processing your request. This appears to be a temporary problem with the system. Please try again with your data analytics question, or rephrase your query for better results. I'm here to help with charts, data analysis, modeling, and business intelligence tasks.",
            "error": "Single LLM processing failed",
            "tools_used": ["Single_LLM_Direct"],
            "processing_steps": ["error_handling"]
        }


