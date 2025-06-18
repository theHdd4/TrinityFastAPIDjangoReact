# Validator Dispatcher
from .validators.base import BaseValidator
from .validators.promo import PriceElasticityValidator
from .validators.mmm import MMMValidator
from typing import Dict, Any
import pandas as pd

class ValidatorDispatcher:
    def __init__(self):
        self.validators = {
            "base": BaseValidator(),
            "price_elasticity": PriceElasticityValidator(),
            "mmm": MMMValidator(),
        }
    
    def validate(self, validator_atom: str, df: pd.DataFrame, file_key: str) -> Dict[str, Any]:
        if validator_atom.startswith("custom_"):
            return self.validators["base"].validate(df, file_key, validator_atom)
        else:
            validator_name = validator_atom.split("_")[0]
            validator = self.validators.get(validator_name, self.validators["base"])
            return validator.validate(df, file_key, validator_atom)