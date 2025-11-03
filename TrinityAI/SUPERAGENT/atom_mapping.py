"""
Atom Mapping Configuration
===========================

Maps internal agent names to correct atomIds for card creation
and backend endpoints for agent execution.

This file ensures consistency between:
- Frontend atomIds (from atoms_knowledge_base.json)
- Backend endpoints (agent APIs)
- Workflow generation (SUPERAGENT)
"""

# Mapping from agent keywords to correct atomIds and endpoints
ATOM_MAPPING = {
    "merge": {
        "atomId": "merge",
        "endpoint": "/trinityai/merge",
        "task_desc": "Merge datasets by common columns",
        "keywords": ["merge", "join", "combine", "vlookup"]
    },
    "concat": {
        "atomId": "concat",
        "endpoint": "/trinityai/concat",
        "task_desc": "Concatenate datasets",
        "keywords": ["concat", "concatenate", "stack", "append"]
    },
    "chart-maker": {
        "atomId": "chart-maker",  # Correct: kebab-case
        "endpoint": "/trinityai/chart-maker",  # Updated to match frontend
        "task_desc": "Create chart visualization",
        "keywords": ["chart", "graph", "visualiz", "plot", "dashboard"]
    },
    "groupby-wtg-avg": {
        "atomId": "groupby-wtg-avg",  # Correct: full name with kebab-case
        "endpoint": "/trinityai/groupby",
        "task_desc": "Group and aggregate data",
        "keywords": ["group", "aggregate", "pivot", "summarize"]
    },
    "explore": {
        "atomId": "explore",
        "endpoint": "/trinityai/explore",
        "task_desc": "Explore and analyze dataset",
        "keywords": ["explore", "analyze", "eda", "summary"]
    },
    "dataframe-operations": {
        "atomId": "dataframe-operations",  # Correct: kebab-case
        "endpoint": "/trinityai/dataframe-operations",
        "task_desc": "Perform DataFrame operations",
        "keywords": ["dataframe", "operations", "filter", "sort", "transform"]
    },
    "create-and-transform-features": {
        "atomId": "create-and-transform-features",  # Correct: full name
        "endpoint": "/trinityai/create-transform",
        "task_desc": "Transform data columns and create features",
        "keywords": ["transform", "create column", "feature", "calculate"]
    },
    "data-upload-validate": {
        "atomId": "data-upload-validate",
        "endpoint": "/trinityai/upload",
        "task_desc": "Upload and validate data",
        "keywords": ["upload", "validate", "import"]
    },
    "feature-overview": {
        "atomId": "feature-overview",
        "endpoint": "/trinityai/feature-overview",
        "task_desc": "Generate feature overview",
        "keywords": ["overview", "profile", "statistics"]
    },
    "column-classifier": {
        "atomId": "column-classifier",
        "endpoint": "/trinityai/column-classifier",
        "task_desc": "Classify column types",
        "keywords": ["classify", "column", "type"]
    },
    "correlation": {
        "atomId": "correlation",
        "endpoint": "/trinityai/correlation",
        "task_desc": "Calculate correlations",
        "keywords": ["correlation", "relationship"]
    },
    "scope-selector": {
        "atomId": "scope-selector",
        "endpoint": "/trinityai/scope",
        "task_desc": "Select data scope",
        "keywords": ["scope", "select", "filter"]
    }
}

# Reverse mapping: keywords to atomId
KEYWORD_TO_ATOM = {}
for atom_key, atom_info in ATOM_MAPPING.items():
    for keyword in atom_info["keywords"]:
        if keyword not in KEYWORD_TO_ATOM:
            KEYWORD_TO_ATOM[keyword] = atom_key


def detect_atom_from_prompt(prompt: str) -> dict:
    """
    Detect the correct atom from a user prompt.
    
    Args:
        prompt: User's natural language prompt
        
    Returns:
        Dict with atomId, endpoint, and task_desc
    """
    prompt_lower = prompt.lower()
    
    # Check each keyword
    for keyword, atom_key in KEYWORD_TO_ATOM.items():
        if keyword in prompt_lower:
            return ATOM_MAPPING[atom_key]
    
    # Default to merge if no match
    return ATOM_MAPPING["merge"]


def get_atom_info(atom_key: str) -> dict:
    """
    Get atom information by key.
    
    Args:
        atom_key: Atom key (e.g., "merge", "chart-maker")
        
    Returns:
        Dict with atomId, endpoint, and task_desc
    """
    return ATOM_MAPPING.get(atom_key, ATOM_MAPPING["merge"])


# Legacy mapping for backward compatibility
LEGACY_AGENT_MAPPING = {
    "chartmaker": "chart-maker",
    "groupby": "groupby-wtg-avg",
    "dataframe_operations": "dataframe-operations",
    "create_transform": "create-and-transform-features",
    "create-column": "create-and-transform-features"
}

# Mapping from fetch_atom return values to correct atomIds
# fetch_atom returns: atom_name.lower().replace(" ", "")
# Examples: "createandtransformfeatures", "dataframeoperations", "chartmaker"
FETCH_ATOM_TO_ATOMID = {
    # Data sources
    "dataupload&validate": "data-upload-validate",
    "datauploadvalidate": "data-upload-validate",
    
    # Data processing
    "featureoverview": "feature-overview",
    "columnclassifier": "column-classifier",
    "dataframeoperations": "dataframe-operations",
    "createandtransformfeatures": "create-and-transform-features",
    "createtransformfeatures": "create-and-transform-features",
    "groupbywtgavg": "groupby-wtg-avg",
    "groupbywithweightedaverage": "groupby-wtg-avg",
    "merge": "merge",
    "concat": "concat",
    "scopeselector": "scope-selector",
    
    # Analytics
    "correlation": "correlation",
    "explore": "explore",
    
    # Machine learning
    "regression-featurebased": "regression-feature-based",
    "regressionfeaturebased": "regression-feature-based",
    "selectmodels-featurebased": "select-models-feature",
    "selectmodelsfeaturebased": "select-models-feature",
    "evaluatemodels-featurebased": "evaluate-models-feature",
    "evaluatemodelsfeaturebased": "evaluate-models-feature",
    "auto-regressivemodels": "auto-regressive-models",
    "autoregressivemodels": "auto-regressive-models",
    "buildmodel-featurebased": "build-model-feature-based",
    "buildmodelfeaturebased": "build-model-feature-based",
    "clustering": "clustering",
    
    # Visualization
    "chartmaker": "chart-maker",
    "chart-maker": "chart-maker",
    
    # Planning
    "scenarioplanner": "scenario-planner"
}


def normalize_atom_id(atom_id: str) -> str:
    """
    Normalize legacy atom IDs to correct format.
    
    Args:
        atom_id: Atom ID (may be legacy format)
        
    Returns:
        Correct atomId in kebab-case
    """
    # Check if it's a legacy ID
    if atom_id in LEGACY_AGENT_MAPPING:
        return LEGACY_AGENT_MAPPING[atom_id]
    
    # Check if it already exists in mapping
    if atom_id in ATOM_MAPPING:
        return atom_id
    
    # Convert underscore to kebab-case
    return atom_id.replace("_", "-")


def fetch_atom_name_to_atomid(fetch_atom_name: str) -> str:
    """
    Convert fetch_atom return value to correct atomId.
    
    fetch_atom returns atom names as: atom_name.lower().replace(" ", "")
    Example: "Create and Transform Features" → "createandtransformfeatures"
    
    Args:
        fetch_atom_name: Atom name from fetch_atom response
        
    Returns:
        Correct atomId in kebab-case format
    """
    # Clean the input
    clean_name = fetch_atom_name.lower().strip()
    
    # Check direct mapping first
    if clean_name in FETCH_ATOM_TO_ATOMID:
        return FETCH_ATOM_TO_ATOMID[clean_name]
    
    # Fallback: try to find by checking if it exists in ATOM_MAPPING
    if clean_name in ATOM_MAPPING:
        return clean_name
    
    # Last resort: convert to kebab-case
    # Remove special characters and convert spaces to hyphens
    normalized = clean_name.replace("&", "and").replace(" ", "-")
    return normalized

