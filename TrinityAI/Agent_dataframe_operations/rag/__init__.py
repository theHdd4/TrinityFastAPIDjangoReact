# RAG Module for DataFrame Operations
# Provides access to API endpoints and operation examples from JSON files

import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("smart.dataframe_operations.rag")

# Cache loaded JSON files
_api_endpoints_cache: Optional[Dict[str, Any]] = None
_operation_examples_cache: Optional[Dict[str, Any]] = None


def get_rag_file_path(filename: str) -> str:
    """Get the absolute path to a RAG JSON file"""
    current_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(current_dir, filename)


def load_api_endpoints() -> Dict[str, Any]:
    """Load API endpoints documentation from JSON file"""
    global _api_endpoints_cache
    
    if _api_endpoints_cache is not None:
        return _api_endpoints_cache
    
    try:
        file_path = get_rag_file_path("api_endpoints.json")
        with open(file_path, 'r', encoding='utf-8') as f:
            _api_endpoints_cache = json.load(f)
        logger.info(f"✅ Loaded API endpoints from {file_path}")
        return _api_endpoints_cache
    except Exception as e:
        logger.error(f"❌ Failed to load api_endpoints.json: {e}")
        return {}


def load_operation_examples() -> Dict[str, Any]:
    """Load operation examples from JSON file"""
    global _operation_examples_cache
    
    if _operation_examples_cache is not None:
        return _operation_examples_cache
    
    try:
        file_path = get_rag_file_path("operation_examples.json")
        with open(file_path, 'r', encoding='utf-8') as f:
            _operation_examples_cache = json.load(f)
        logger.info(f"✅ Loaded operation examples from {file_path}")
        return _operation_examples_cache
    except Exception as e:
        logger.error(f"❌ Failed to load operation_examples.json: {e}")
        return {}


def format_api_endpoints_for_prompt() -> str:
    """Format API endpoints as a string for LLM prompt"""
    endpoints = load_api_endpoints()
    
    if not endpoints:
        return "API endpoints not available"
    
    output = []
    output.append(f"**Base URL:** {endpoints.get('base_url', '/api/dataframe-operations/')}")
    output.append("")
    output.append("**Available Endpoints:**")
    output.append("")
    
    for endpoint_path, endpoint_data in endpoints.get('endpoints', {}).items():
        output.append(f"### {endpoint_path}")
        output.append(f"**Method:** {endpoint_data.get('method', 'POST')}")
        output.append(f"**Description:** {endpoint_data.get('description', 'No description')}")
        output.append("")
        
        # Required parameters
        if endpoint_data.get('required_parameters'):
            output.append("**Required Parameters:**")
            for param_name, param_info in endpoint_data['required_parameters'].items():
                if isinstance(param_info, dict):
                    output.append(f"- `{param_name}`: {param_info.get('type', 'any')} - {param_info.get('description', '')}")
                else:
                    output.append(f"- `{param_name}`: {param_info}")
            output.append("")
        
        # Optional parameters
        if endpoint_data.get('optional_parameters'):
            output.append("**Optional Parameters:**")
            for param_name, param_info in endpoint_data['optional_parameters'].items():
                if isinstance(param_info, dict):
                    default = param_info.get('default', 'null')
                    output.append(f"- `{param_name}`: {param_info.get('type', 'any')} - {param_info.get('description', '')} (default: {default})")
            output.append("")
        
        # Example
        if 'example' in endpoint_data:
            output.append(f"**Example:** `{json.dumps(endpoint_data['example'])}`")
            output.append("")
    
    # Add critical rules
    if 'critical_rules' in endpoints:
        output.append("**🚨 CRITICAL RULES:**")
        for rule in endpoints['critical_rules']:
            output.append(f"- {rule}")
        output.append("")
    
    return "\n".join(output)


def format_operation_examples_for_prompt() -> str:
    """Format operation examples as a string for LLM prompt"""
    examples = load_operation_examples()
    
    if not examples:
        return "Operation examples not available"
    
    output = []
    output.append("**DataFrame Operations Examples:**")
    output.append("")
    
    # Add operation patterns
    if 'operation_patterns' in examples:
        output.append("**Operation Patterns:**")
        for pattern_name, pattern_data in examples['operation_patterns'].items():
            output.append(f"- **{pattern_name.replace('_', ' ').title()}**: {pattern_data.get('rule', '')}")
        output.append("")
    
    # Add selected examples (not all, to keep prompt size manageable)
    if 'examples' in examples:
        output.append("**Example Workflows:**")
        output.append("")
        
        # Select key examples
        key_examples = [
            'minimal_load_file',
            'load_and_filter', 
            'apply_formula_sum',
            'apply_formula_conditional',
            'comprehensive_pipeline'
        ]
        
        for example_key in key_examples:
            if example_key in examples['examples']:
                example = examples['examples'][example_key]
                output.append(f"**Example: {example.get('description', example_key)}**")
                output.append(f"User Request: \"{example.get('user_request', '')}\"")
                output.append(f"Expected JSON Response:")
                output.append(f"```json")
                output.append(json.dumps(example.get('json_response', {}), indent=2))
                output.append(f"```")
                output.append("")
    
    # Add common user requests
    if 'common_user_requests' in examples:
        output.append("**Common User Request Patterns:**")
        for pattern_name, pattern_example in examples['common_user_requests'].items():
            output.append(f"- {pattern_name.replace('_', ' ').title()}: \"{pattern_example}\"")
        output.append("")
    
    return "\n".join(output)


def get_endpoint_info(endpoint_path: str) -> Optional[Dict[str, Any]]:
    """Get detailed information about a specific endpoint"""
    endpoints = load_api_endpoints()
    return endpoints.get('endpoints', {}).get(endpoint_path)


def get_example_by_type(example_type: str) -> Optional[Dict[str, Any]]:
    """Get a specific example by its type key"""
    examples = load_operation_examples()
    return examples.get('examples', {}).get(example_type)


def reload_rag_data():
    """Force reload of RAG data from JSON files (useful for development)"""
    global _api_endpoints_cache, _operation_examples_cache
    _api_endpoints_cache = None
    _operation_examples_cache = None
    logger.info("🔄 RAG cache cleared, will reload on next access")

