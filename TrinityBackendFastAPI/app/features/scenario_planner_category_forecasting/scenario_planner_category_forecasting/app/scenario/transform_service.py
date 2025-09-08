"""
Replay the transformation pipeline stored in model metadata.
Currently supports:
  • standard_scaler (µ, σ)
  • minmax_scaler   (min, max)
  • log / exp
Extend easily by adding new _apply_* methods.
"""

import numpy as np
import pandas as pd

class TransformService:
    def __init__(self, trans_meta: dict):
        self.steps = []           # list of callables
        self.y_inverse = None

        for feat, spec in trans_meta.items():
            for m in spec.values():
                method = m["method"]
                params = m.get("params", {})

                if method == "standard_scaler":
                    mu, sigma = params["mean"], params["std"]
                    self.steps.append(lambda df, f=feat, mu=mu, s=sigma:
                                      df.assign(**{f: (df[f] - mu) / s}))

                elif method == "minmax_scaler":
                    lo, hi = params["min"], params["max"]
                    self.steps.append(lambda df, f=feat, lo=lo, hi=hi:
                                      df.assign(**{f: (df[f] - lo) / (hi - lo)}))

                elif method == "log":
                    self.steps.append(lambda df, f=feat: df.assign(**{f: np.log(df[f].clip(lower=1e-9))}))

                elif method == "exp":
                    self.steps.append(lambda df, f=feat: df.assign(**{f: np.exp(df[f])}))
                # add more elif …

        # example: if target was logged, model metadata could store inverse spec
        if "target_inverse" in trans_meta:
            if trans_meta["target_inverse"]["method"] == "log":
                self.y_inverse = np.exp
            elif trans_meta["target_inverse"]["method"] == "exp":
                self.y_inverse = np.log

    # ------------------------------------------------------------------ #
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        out = df.copy()
        for fn in self.steps:
            out = fn(out)
        return out

    def inverse_y(self, y):
        return self.y_inverse(y) if self.y_inverse else y
