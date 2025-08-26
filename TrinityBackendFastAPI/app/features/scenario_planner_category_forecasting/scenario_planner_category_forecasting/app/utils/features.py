# app/scenario/features.py

import json
import logging
from typing import List, Dict, Any, Tuple, Set

logger = logging.getLogger(__name__)

def extract_features_from_models(models: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Given a list of model metadata dicts, extract:
     - Features grouped by model_id
     - All unique features combined (set)

    Returns:
    {
      "features_by_model": {
          model_id1: {
              "features": [feature_info, ...],
              "identifiers": {...},
              "model_name": str,
              "model_type": str,
              "training_id": str,
          },
          ...
      },
      "all_unique_features": [feature_name1, feature_name2, ...]
    }
    """

    features_by_model = {}
    all_features_set: Set[str] = set()

    for model in models:
        training_id = model.get("training_id", "unknown")
        identifiers = model.get("identifiers", {})

        raw_features = model.get("x_variables") or model.get("features") or []
        # You might have features under "x_variables" or "features". Prefer x_variables here.
        for features in raw_features:
            all_features_set.add(features)

        features_by_model[training_id] = {
            "features": raw_features,
            "identifiers": identifiers
        }

    all_unique_features = sorted(all_features_set)

    return {
        "features_by_model": features_by_model,
        "all_unique_features": all_unique_features
    }
