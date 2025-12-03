# Stack Modeling Build Documentation

## Overview

**Stack Modeling** is an advanced machine learning approach that pools data from multiple combinations (e.g., different product categories, regions, or market segments) to train unified models. Unlike individual modeling where each combination is trained separately, stack modeling leverages shared patterns across combinations to improve model performance and generalization.

### Key Concepts

- **Data Pooling**: Combines data from multiple combinations based on selected identifiers (e.g., Channel, Brand)
- **Clustering**: Groups similar combinations using K-means clustering on numerical features
- **Interaction Terms**: Creates combination-specific coefficients through interaction variables
- **Ensemble Calculation**: Combines multiple model results using weighted averaging based on MAPE performance

### Use Cases

- **Marketing Mix Modeling (MMM)**: Pool data across product categories to learn shared media effects
- **Multi-Market Analysis**: Combine data from different regions to build unified models
- **Cross-Category Learning**: Leverage patterns from one category to improve predictions in another

---

## Architecture

### Backend Components

#### 1. **StackModelDataProcessor** (`stack_model_data.py`)
Handles data preparation and pooling:
- Fetches combination files from MinIO
- Pools data by identifiers (e.g., Channel, Brand)
- Applies K-means clustering to group similar combinations
- Creates interaction terms between combinations and variables
- Splits clustered data for training

#### 2. **StackModelTrainer** (`stack_model_training.py`)
Manages model training workflow:
- Trains models on pooled/clustered data
- Calculates combination-specific betas from stack model coefficients
- Applies per-variable transformations (adstock, logistic, standardization)
- Handles constraint enforcement (positive/negative coefficients)

#### 3. **EnsembleCalculator** (`ensemble_calculation.py`)
**Core ensemble calculation engine** - see detailed section below

### Frontend Components

#### 1. **BuildModelFeatureBasedAtom.tsx**
Main atom component that orchestrates the build process

#### 2. **BuildModelFeatureBasedCanvas.tsx**
UI component for displaying training progress and results

#### 3. **BuildModelFeatureBasedSettings.tsx**
Configuration panel for stack modeling parameters

---

## Ensemble Calculation - Detailed Implementation

The ensemble calculation is the core mechanism for combining multiple model results into a single, more robust prediction. This section explains how it works.

### Overview

When multiple models (e.g., Linear Regression, Ridge, Lasso) are trained with different parameter combinations, the ensemble calculator:
1. Groups models by model type
2. Calculates weights based on MAPE test performance
3. Computes weighted averages for all metrics
4. Produces a single ensemble result per model type

### Weight Calculation Formula

The ensemble uses **exponential weighting** based on MAPE test performance:

```python
# For each model i:
weight_i = exp(-0.5 * (mape_test_i - best_mape))

# Normalize weights to sum to 1:
normalized_weight_i = weight_i / sum(all_weights)
```

**Example:**
- Model A: MAPE = 10% → weight = exp(-0.5 * (10 - 10)) = 1.0
- Model B: MAPE = 12% → weight = exp(-0.5 * (12 - 10)) = 0.368
- Model C: MAPE = 15% → weight = exp(-0.5 * (15 - 10)) = 0.082

After normalization:
- Model A: 68.9%
- Model B: 25.4%
- Model C: 5.7%

### Weighted Metrics Calculation

The `EnsembleCalculator._calculate_weighted_metrics()` method computes weighted averages for:

#### 1. **Performance Metrics**
```python
weighted_metric = sum(model_i.metric * weight_i for all models)
```
Metrics: `mape_train`, `mape_test`, `r2_train`, `r2_test`, `aic`, `bic`

#### 2. **Coefficients (Betas)**
```python
# For each variable:
weighted_beta[variable] = sum(model_i.beta[variable] * weight_i)
```
- Handles standardized coefficients
- Aggregates across all models for each variable

#### 3. **Elasticities**
```python
weighted_elasticity[variable] = sum(model_i.elasticity[variable] * weight_i)
```
- Elasticity = (β × X_mean) / Y_mean
- Weighted average preserves the elasticity interpretation

#### 4. **Contributions**
```python
weighted_contribution[variable] = sum(model_i.contribution[variable] * weight_i)
```
- Contribution = (β × X_mean) / sum(all_β × X_mean)
- Normalized to sum to 1 after weighting

#### 5. **Transformation Metadata**
```python
# For each transformation parameter (e.g., adstock_decay):
weighted_param = sum(model_i.param * weight_i)
```
- Aggregates transformation parameters (adstock, logistic, standardization)
- Preserves transformation step information

### Implementation Flow

```python
# 1. Group models by type
models_by_type = {
    "Linear Regression": [model1, model2, model3],
    "Ridge Regression": [model4, model5]
}

# 2. For each model type:
for model_type, models in models_by_type.items():
    # Extract MAPE values
    mape_values = [m.mape_test for m in models]
    best_mape = min(mape_values)
    
    # Calculate weights
    weights = [exp(-0.5 * (m.mape_test - best_mape)) for m in models]
    normalized_weights = [w / sum(weights) for w in weights]
    
    # Calculate weighted metrics
    ensemble_result = calculate_weighted_metrics(models, normalized_weights)
```

### Key Files

- **`ensemble_calculation.py`**: Main ensemble calculator class
  - `calculate_ensemble_results()`: Entry point
  - `_calculate_model_type_ensemble()`: Per-model-type calculation
  - `_calculate_weighted_metrics()`: Weighted averaging logic
  - `_weighted_average()`: Core weighted average function

- **`stack_model_training.py`**: Integrates ensemble into training pipeline
  - Calls ensemble calculator after individual model training
  - Merges ensemble results with individual results

### Ensemble Metadata

Each ensemble result includes metadata:
```python
ensemble_metadata = {
    'model_type': 'Linear Regression',
    'combination_id': 'Comb1',
    'num_combinations': 3,
    'best_mape': 10.0,
    'weights': [0.689, 0.254, 0.057],
    'mape_values': [10.0, 12.0, 15.0],
    'model_keys': ['key1', 'key2', 'key3']
}
```

---

## API Endpoints

### Stack Modeling Endpoints

#### 1. **Train Stack Models**
```
POST /api/build-model-feature-based/train-stack-models
```

**Request Body:**
```json
{
  "scope_number": "1",
  "combinations": ["Comb1", "Comb2"],
  "pool_by_identifiers": ["Channel", "Brand"],
  "x_variables": ["TV", "Radio", "Digital"],
  "y_variable": "Sales",
  "apply_clustering": true,
  "numerical_columns_for_clustering": ["TV", "Radio"],
  "n_clusters": 3,
  "apply_interaction_terms": true,
  "numerical_columns_for_interaction": ["TV", "Radio"],
  "standardization": "none",
  "k_folds": 5,
  "models_to_run": ["Linear Regression", "Ridge Regression"],
  "test_size": 0.2
}
```

**Response:**
```json
{
  "scope_id": "scope_1",
  "total_split_clusters": 3,
  "stack_model_results": [
    {
      "split_clustered_data_id": "pool1_0",
      "model_results": [
        {
          "model_name": "Linear Regression",
          "mape_train": 8.5,
          "mape_test": 10.2,
          "coefficients": {...},
          "intercept": 100.0
        }
      ]
    }
  ]
}
```

#### 2. **Calculate Individual Combination Metrics**
```
POST /api/build-model-feature-based/calculate-individual-combination-metrics
```

Uses stack model betas to calculate metrics for individual combinations.

#### 3. **Get Combination Betas**
```
GET /api/build-model-feature-based/combination-betas
```

Returns calculated betas for each combination from stack models.

### Ensemble Endpoints

#### 1. **Calculate Weighted Ensemble**
```
POST /api/select-models-feature-based/models/weighted-ensemble
```

**Request:**
```json
{
  "file_key": "model_results.csv",
  "grouping_keys": ["combination_id"],
  "filter_criteria": {"combination_id": "Comb1"},
  "filtered_models": ["Linear Regression", "Ridge Regression"]
}
```

**Response:**
```json
{
  "results": [
    {
      "combo": {"combination_id": "Comb1"},
      "weighted": {
        "mape_train": 9.2,
        "mape_test": 10.8,
        "intercept": 95.5,
        "tv_beta": 0.45,
        "radio_beta": 0.32
      },
      "model_composition": {
        "Linear Regression": 0.65,
        "Ridge Regression": 0.35
      }
    }
  ]
}
```

---

## Frontend Integration

### Files That Integrate with Backend

#### 1. **BuildModelFeatureBasedCanvas.tsx**
- **Endpoint**: `/api/build-model-feature-based/train-models-direct`
- **Purpose**: Initiates model training (individual + stack)
- **Key Functions**:
  - `handleTrainModels()`: Sends training request
  - `handleStackModeling()`: Configures stack modeling parameters

#### 2. **SelectModelsFeatureCanvas.tsx**
- **Endpoints**:
  - `/api/select-models-feature-based/models/weighted-ensemble`
  - `/api/select-models-feature-based/models/actual-vs-predicted-ensemble`
  - `/api/select-models-feature-based/models/contribution-ensemble`
  - `/api/select-models-feature-based/models/yoy-calculation-ensemble`
- **Purpose**: Displays ensemble results and visualizations
- **Key Functions**:
  - `fetchWeightedEnsembleData()`: Fetches ensemble weights and metrics
  - `fetchActualVsPredictedEnsemble()`: Gets actual vs predicted for ensemble
  - `fetchModelContributionEnsemble()`: Gets contribution data
  - `fetchYoYDataEnsemble()`: Gets year-over-year analysis

#### 3. **BuildModelFeatureBasedSettings.tsx**
- **Purpose**: Configuration UI for stack modeling
- **Settings**:
  - Pool by identifiers
  - Clustering columns
  - Interaction terms
  - Number of clusters

### API Client Configuration

**File**: `src/lib/api.ts`
```typescript
const BUILD_MODEL_API = 
  `${backendOrigin}/api/build-model-feature-based`;

const SELECT_API = 
  `${backendOrigin}/api/select-models-feature-based`;
```

---

## Data Flow

### Stack Modeling Flow

```
1. User Configuration
   ↓
2. Data Pooling (StackModelDataProcessor)
   - Fetch combination files
   - Merge by identifiers
   - Filter by pool identifiers
   ↓
3. Clustering (Optional)
   - K-means on numerical columns
   - Split by cluster_id
   ↓
4. Feature Engineering
   - Create encoded combination features
   - Create interaction terms (combination × variable)
   ↓
5. Model Training (StackModelTrainer)
   - Train models on each split cluster
   - Calculate combination-specific betas
   ↓
6. Individual Metrics Calculation
   - Apply stack betas to individual combinations
   - Calculate MAPE, AIC, BIC
   ↓
7. Ensemble Calculation (EnsembleCalculator)
   - Group by model type
   - Calculate weights from MAPE
   - Compute weighted averages
   ↓
8. Results Storage
   - Save to MinIO
   - Update MongoDB
```

### Ensemble Calculation Flow

```
1. Model Results Collection
   ↓
2. Group by Model Type
   ↓
3. Extract MAPE Test Values
   ↓
4. Find Best MAPE
   ↓
5. Calculate Exponential Weights
   weight = exp(-0.5 * (mape - best_mape))
   ↓
6. Normalize Weights
   normalized = weight / sum(weights)
   ↓
7. Calculate Weighted Metrics
   - Performance metrics (MAPE, R², AIC, BIC)
   - Coefficients (betas)
   - Elasticities
   - Contributions
   - Transformation metadata
   ↓
8. Return Ensemble Result
```

---

## Configuration Options

### Stack Modeling Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pool_by_identifiers` | `string[]` | Identifiers to pool by (e.g., ["Channel", "Brand"]) |
| `numerical_columns_for_clustering` | `string[]` | Columns to use for K-means clustering |
| `n_clusters` | `int?` | Number of clusters (auto if null) |
| `apply_interaction_terms` | `bool` | Enable combination × variable interactions |
| `numerical_columns_for_interaction` | `string[]` | Variables for interaction terms |
| `apply_clustering` | `bool` | Enable K-means clustering |

### Ensemble Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `grouping_keys` | `string[]` | Keys to group by (e.g., ["combination_id"]) |
| `filter_criteria` | `dict` | Filter models (e.g., {"combination_id": "Comb1"}) |
| `filtered_models` | `string[]?` | Specific models to include (all if null) |

---

## Example Usage

### Training Stack Models

```python
# Backend call
trainer = StackModelTrainer()
result = await trainer.train_models_for_stacked_data(
    scope_number="1",
    combinations=["Comb1", "Comb2", "Comb3"],
    pool_by_identifiers=["Channel"],
    x_variables=["TV", "Radio", "Digital"],
    y_variable="Sales",
    apply_clustering=True,
    numerical_columns_for_clustering=["TV", "Radio"],
    n_clusters=3,
    apply_interaction_terms=True,
    numerical_columns_for_interaction=["TV", "Radio"],
    models_to_run=["Linear Regression", "Ridge Regression"]
)
```

### Calculating Ensemble

```python
# Backend call
from .ensemble_calculation import ensemble_calculator

ensemble_results = ensemble_calculator.calculate_ensemble_results(
    combination_results=[
        {
            "combination_id": "Comb1",
            "model_results": [
                {"model_name": "Linear Regression", "mape_test": 10.0, ...},
                {"model_name": "Ridge Regression", "mape_test": 12.0, ...}
            ]
        }
    ]
)
```

---

## Performance Considerations

1. **Clustering**: Elbow method automatically determines optimal clusters
2. **Interaction Terms**: Only created when `apply_interaction_terms=True`
3. **Weight Calculation**: Exponential weighting ensures best models dominate
4. **Caching**: Ensemble results cached in MongoDB for faster retrieval

---

## Troubleshooting

### Common Issues

1. **No ensemble results**: Check that models have valid MAPE test values
2. **Zero weights**: Ensure MAPE values are not infinite
3. **Missing coefficients**: Verify models were trained successfully
4. **Clustering fails**: Check that numerical columns exist and have valid data

---

## References

- **Stack Model Training**: `stack_model_training.py`
- **Ensemble Calculation**: `ensemble_calculation.py`
- **Data Processing**: `stack_model_data.py`
- **API Routes**: `routes.py`
- **Frontend Canvas**: `BuildModelFeatureBasedCanvas.tsx`
- **Frontend Settings**: `BuildModelFeatureBasedSettings.tsx`

