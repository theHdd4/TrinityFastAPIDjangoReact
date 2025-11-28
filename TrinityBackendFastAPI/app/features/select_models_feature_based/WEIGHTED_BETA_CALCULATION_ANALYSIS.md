# Weighted Beta Calculation Analysis

## Current Implementation (Lines 2328-2352 in service.py)

### Current Method:
```python
# For each variable:
for model, weight in weights:
    share = weight / weight_sum
    impact = model.variable_impacts.get(var_name, 0)  # From model results file
    avg = model.variable_averages.get(var_name, 0)    # From model results file
    
    # Derive beta: impact / avg
    if avg != 0:
        beta = impact / avg
    else:
        beta = impact
    
    # Weight the beta
    weighted_beta += beta * share
```

### Issues:

1. **Deriving Beta from Impact/Average** ⚠️
   - Assumes: `impact = beta * avg`
   - This relationship may not hold exactly, especially with transformations
   - Impact might be calculated differently (e.g., after adstock, standardization)

2. **Not Using Actual Coefficients** ⚠️
   - Regular method gets betas directly from MongoDB `model_coefficients`
   - These are the actual coefficients used in the model
   - More accurate than deriving from impacts/averages

3. **Inconsistency with Intercept** ⚠️
   - We now fetch intercepts from MongoDB (correct)
   - But we're still deriving betas from impacts/averages (inconsistent)
   - Should fetch both from the same source (MongoDB)

## Regular Method (Lines 1888-1919 in service.py)

### How Regular Method Gets Betas:
```python
# Get coefficients from MongoDB
coefficients = model_coeffs.get("coefficients", {})  # From MongoDB

# Try both patterns
beta_key = f"Beta_{x_var}"
if beta_key not in coefficients:
    beta_key = f"{x_var}_beta"

if beta_key in coefficients:
    beta_value = coefficients[beta_key]  # Direct from MongoDB
```

## Recommended Fix

### Should Fetch Betas from MongoDB:
1. For each model in the ensemble, fetch coefficients from MongoDB
2. Extract betas using both `Beta_{var}` and `{var}_beta` patterns
3. Calculate weighted beta: `sum(beta_i * weight_i)`

### Benefits:
- ✅ Uses actual model coefficients (more accurate)
- ✅ Consistent with how intercepts are fetched
- ✅ Consistent with regular method
- ✅ Handles transformations correctly (coefficients are post-transformation)

## Implementation Plan

1. Modify `calculate_weighted_ensemble` to accept MongoDB access
   - OR fetch betas in `get_ensemble_actual_vs_predicted` (like intercepts)
   
2. For each model:
   - Fetch `model_coefficients` from MongoDB
   - Extract betas for all x_variables
   - Weight by model performance (same weights as intercept)

3. Store weighted betas in `weighted_metrics`

