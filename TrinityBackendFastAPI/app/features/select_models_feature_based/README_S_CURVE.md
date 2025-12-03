# S-Curve Analysis Documentation

## Overview

**S-Curve Analysis** is a marketing mix modeling (MMM) feature that visualizes the relationship between media investment and predicted sales volume. It helps marketers understand:
- **Diminishing Returns**: At what investment level do returns start to diminish?
- **Optimal Investment**: What is the sweet spot for media spending?
- **ROI Analysis**: How does ROI change with different investment levels?

### What is an S-Curve?

An S-curve shows how sales volume responds to changes in media investment. The curve typically has three phases:
1. **Start Point**: Minimum investment needed to see meaningful response
2. **Growth Phase**: Linear or near-linear response to investment
3. **Diminishing Returns**: Point where additional investment yields less incremental volume

The curve gets its name from the S-shaped pattern when plotted on a graph.

---

## Architecture

### Backend Components

#### 1. **s_curve.py** - Core S-Curve Engine
Main module containing all S-curve calculation logic:
- `get_s_curve_endpoint()`: Main entry point for S-curve generation
- `apply_transformation_steps()`: Applies transformations (adstock, logistic, standardization)
- `calculate_volume_series()`: Calculates predicted volume for scaled media series
- `find_diminishing_point()`: Identifies point of diminishing returns
- `find_start_point()`: Identifies minimum effective investment
- `generate_scaled_media_series()`: Creates scaled versions of media investment

#### 2. **service.py** - API Service Layer
- `generate_s_curve()`: Wraps async S-curve endpoint for synchronous API calls

#### 3. **endpoint.py** - FastAPI Routes
- `POST /api/select-models-feature-based/models/s-curve`: API endpoint

### Frontend Components

#### 1. **SelectModelsFeatureCanvas.tsx**
- `fetchSCurveData()`: Fetches S-curve data from backend
- Displays S-curve charts in the model analysis panel

#### 2. **SCurveChartRenderer.tsx**
- Renders interactive S-curve charts using Recharts
- Supports multiple color themes and customization options
- Displays media investment vs. volume prediction

---

## How S-Curves Work

### Step-by-Step Process

#### 1. **Data Preparation**
```python
# Get last 12 months of data for the combination
df_last_12_months = get_last_12_months_data(df, date_column, combination_name)

# Extract original media series
original_series = df_last_12_months[variable].fillna(0).tolist()
```

#### 2. **Generate Scaled Media Series**
Creates multiple versions of the media investment at different percentage changes:
```python
# Generate 51 points from -100% to +100% change
x_range_values = np.linspace(-100, 100, 51).tolist()

# Scale original series by percentage change
scaled_series = [v * (1 + percent_change/100) for v in original_series]
```

**Example:**
- Original: [100, 120, 110, ...]
- -50%: [50, 60, 55, ...]
- 0%: [100, 120, 110, ...] (unchanged)
- +50%: [150, 180, 165, ...]
- +100%: [200, 240, 220, ...]

#### 3. **Apply Transformations**
Each scaled series goes through the same transformations used in model training:

**Transformation Pipeline:**
```
Original Series
    ↓
Adstock (decay rate)
    ↓
Logistic (growth rate, midpoint)
    ↓
Standardization (mean, std) OR MinMax (min, max)
    ↓
Transformed Series
```

**Transformation Details:**

**a) Adstock Transformation:**
```python
adstock_value[i] = value[i] + decay_rate * adstock_value[i-1]
```
- Captures carryover effects from previous periods
- Decay rate typically ranges from 0.1 to 0.5

**b) Logistic Transformation:**
```python
logistic_value = 1 / (1 + exp(-growth_rate * (x - midpoint)))
```
- Models saturation effects
- Growth rate controls steepness
- Midpoint controls inflection point

**c) Standardization:**
```python
standardized = (x - mean) / std
```
- Normalizes to zero mean, unit variance
- Uses adstocked series statistics

**d) MinMax Scaling:**
```python
minmax = (x - min) / (max - min)
```
- Normalizes to [0, 1] range

#### 4. **Calculate Volume Predictions**
For each transformed scaled series, calculate predicted volume:

```python
Volume = Intercept + (Transformed_Media × Beta_Media) + Σ(Other_Variable_Mean × Beta_Other)
```

**Key Points:**
- Target variable (media) uses transformed scaled value
- Other variables use their transformed means (held constant)
- Negative betas are clamped to 0 (no negative volume contribution)

**Example Calculation:**
```python
intercept = 1000
tv_beta = 0.5
radio_beta = 0.3
tv_transformed = 0.8  # From scaled + transformed TV series
radio_mean = 0.6      # Transformed mean of radio (constant)

volume = 1000 + (0.8 × 0.5) + (0.6 × 0.3)
volume = 1000 + 0.4 + 0.18 = 1000.58
```

#### 5. **Calculate Total Volumes**
Sum volume across all 12 months for each scaled series:
```python
total_volume = sum(volume_series)  # Sum of 12 monthly predictions
```

#### 6. **Calculate Media Investment**
Sum media values across all 12 months:
```python
media_investment = sum(scaled_series)  # Total investment for 12 months
```

#### 7. **Find Key Points**

**Diminishing Point:**
- Analyzes slopes in the second half of the curve
- Finds point where slope drops below 70th percentile
- Represents where returns start diminishing

**Start Point:**
- Analyzes slopes in the first quarter to midpoint
- Finds point where slope exceeds 30th percentile
- Represents minimum effective investment

---

## API Endpoints

### Generate S-Curve Data

**Endpoint:** `POST /api/select-models-feature-based/models/s-curve`

**Request Body:**
```json
{
  "client_name": "client1",
  "app_name": "app1",
  "project_name": "project1",
  "file_key": "model_results.csv",
  "combination_name": "Comb1",
  "model_name": "Linear Regression"
}
```

**Response:**
```json
{
  "success": true,
  "combination_name": "Comb1",
  "model_name": "Linear Regression",
  "roi_variables": ["tv", "radio", "digital"],
  "x_range": [-100, -96, ..., 0, ..., 96, 100],
  "s_curves": {
    "tv": {
      "original_series": [100, 120, 110, ...],
      "scaled_series": [[50, 60, ...], [100, 120, ...], ...],
      "volume_series": [[1000, 1100, ...], [1200, 1300, ...], ...],
      "total_volumes": [12000, 14400, 16800, ...],
      "media_values": [1200, 1440, 1680, ...],
      "percent_changes": [-100, -96, ..., 0, ..., 96, 100],
      "date_range": {
        "start": "2023-01-01T00:00:00",
        "end": "2023-12-31T00:00:00"
      },
      "transformation_applied": true,
      "transformation_steps": [
        {"step": "adstock", "decay_rate": 0.4},
        {"step": "logistic", "growth_rate": 1.0, "midpoint": 0.5},
        {"step": "standardization", "scaler_mean": 0.6, "scaler_scale": 0.3}
      ],
      "model_info": {
        "intercept": 1000,
        "coefficients": {"Beta_tv": 0.5, "Beta_radio": 0.3},
        "transformed_means": {"tv": 0.6, "radio": 0.4}
      },
      "curve_analysis": {
        "max_point": {
          "media_value": 2000,
          "volume_prediction": 18000,
          "percent_change": 50
        },
        "min_point": {
          "media_value": 800,
          "volume_prediction": 10000,
          "percent_change": -20
        },
        "base_point": {
          "media_value": 1200,
          "volume_prediction": 14400,
          "percent_change": 0
        }
      }
    }
  },
  "date_range": {
    "start": "2023-01-01T00:00:00",
    "end": "2023-12-31T00:00:00"
  },
  "total_data_points": 12
}
```

---

## Frontend Integration

### Files That Integrate with Backend

#### 1. **SelectModelsFeatureCanvas.tsx**
- **Endpoint**: `/api/select-models-feature-based/models/s-curve`
- **Function**: `fetchSCurveData(combinationId, modelName)`
- **Purpose**: Fetches S-curve data when a model is selected
- **Location**: Lines 1914-1962

**Integration Code:**
```typescript
const fetchSCurveData = async (combinationId: string, modelName: string) => {
  const baseUrl = `${SELECT_API}/models/s-curve`;
  const requestBody = {
    client_name: env.CLIENT_NAME || '',
    app_name: env.APP_NAME || '',
    project_name: env.PROJECT_NAME || '',
    file_key: data.selectedDataset,
    combination_name: combinationId,
    model_name: modelName
  };
  
  const result = await fetchAndResolve(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  
  if (result?.success && result.s_curves) {
    handleDataChange({ sCurveData: result });
  }
};
```

#### 2. **SCurveChartRenderer.tsx**
- **Purpose**: Renders interactive S-curve charts
- **Features**:
  - Line charts showing media investment vs. volume
  - Multiple color themes (default, blue, green, purple, orange, red)
  - Customizable axis labels and titles
  - Grid, legend, and axis label toggles
  - Reference lines for key points (start, base, diminishing)

**Chart Data Format:**
```typescript
{
  media_value: number,      // X-axis: Total media investment
  volume_prediction: number, // Y-axis: Predicted total volume
  percent_change: number     // Percentage change from baseline
}
```

#### 3. **EvaluateModelsFeatureCanvas.tsx**
- **Endpoint**: `/api/evaluate-models-feature-based/s-curve`
- **Purpose**: Displays S-curves in evaluation mode
- **Location**: Lines 1171-1207

---

## Data Flow

### Complete S-Curve Generation Flow

```
1. API Request
   ↓
2. Get Model Coefficients (MongoDB)
   - Intercept
   - Betas (coefficients)
   - Transformation metadata
   ↓
3. Get Source File (MinIO)
   - Download combination file
   - Extract last 12 months of data
   ↓
4. Get ROI Variables (Build Config)
   - Variables configured for ROI analysis
   ↓
5. For Each ROI Variable:
   a. Extract original series (12 months)
   b. Generate scaled series (-100% to +100%, 51 points)
   c. Apply transformations to each scaled series
   d. Calculate volume predictions
   e. Sum volumes and media investments
   f. Find key points (start, base, diminishing)
   ↓
6. Return S-Curve Data
   - All variables with curve data
   - Key points for visualization
   - Transformation metadata
```

### Transformation Application Flow

```
Original Series (12 months)
    ↓
Adstock Transformation
    - Apply decay rate: value[i] + decay × adstock[i-1]
    - Capture adstock statistics (mean, std)
    ↓
Logistic Transformation (if applicable)
    - Apply: 1 / (1 + exp(-growth × (x - midpoint)))
    ↓
Standardization/MinMax
    - Use adstock statistics for standardization
    - OR use current series min/max for MinMax
    ↓
Transformed Series (ready for prediction)
```

---

## Key Algorithms

### 1. Diminishing Point Detection

```python
def find_diminishing_point(media_values, predictions):
    # Calculate slopes between consecutive points
    slopes = np.diff(predictions) / np.diff(media_values)
    
    # Focus on second half of curve
    second_half_start = len(slopes) // 2
    second_half_slopes = slopes[second_half_start:]
    
    # Find point where slope drops below 70th percentile
    threshold = np.percentile(second_half_slopes, 70)
    diminishing_index = np.argmax(second_half_slopes < threshold)
    
    return media_values[second_half_start + diminishing_index]
```

**Interpretation:**
- Identifies where incremental returns start decreasing
- Useful for setting maximum investment thresholds

### 2. Start Point Detection

```python
def find_start_point(media_values, predictions):
    # Calculate slopes
    slopes = np.diff(predictions) / np.diff(media_values)
    
    # Focus on first quarter to midpoint
    first_half_start = len(slopes) // 4
    first_half_end = len(slopes) // 2
    first_half_slopes = slopes[first_half_start:first_half_end]
    
    # Find point where slope exceeds 30th percentile
    threshold = np.percentile(first_half_slopes, 30)
    valid_indices = np.where(first_half_slopes > threshold)[0]
    
    if len(valid_indices) > 0:
        start_index = valid_indices[0]
        return media_values[first_half_start + start_index]
```

**Interpretation:**
- Identifies minimum investment needed for meaningful response
- Useful for setting minimum investment thresholds

### 3. Volume Calculation Formula

```python
def calculate_volume_series(scaled_series, variable_name, intercept, betas, 
                             transformed_means, transformation_metadata):
    # Apply transformations
    transformed_series = apply_transformation_steps(scaled_series, 
                                                    transformation_metadata[variable_name])
    
    # Get beta for target variable
    variable_beta = betas[f"Beta_{variable_name}"]
    
    # Clamp negative betas to 0
    if variable_beta < 0:
        variable_beta = 0.0
    
    # Calculate contribution from other variables (held at mean)
    other_contribution = sum(
        transformed_means[var] * betas[f"Beta_{var}"]
        for var in transformed_means
        if var != variable_name
    )
    
    # Calculate volume for each point
    volume_series = [
        intercept + (transformed_value * variable_beta) + other_contribution
        for transformed_value in transformed_series
    ]
    
    return volume_series
```

---

## Configuration

### ROI Variables Configuration

ROI variables are configured in the build configuration (`build-model_featurebased_configs`):

```json
{
  "roi_config": {
    "roiVariables": ["tv", "radio", "digital"],
    "features": {
      "tv": {"enabled": true},
      "radio": {"enabled": true},
      "digital": {"enabled": false}
    }
  }
}
```

### Transformation Metadata

Stored in MongoDB for each model:
```json
{
  "transformation_metadata": {
    "tv": {
      "transformation_steps": [
        {"step": "adstock", "decay_rate": 0.4},
        {"step": "logistic", "growth_rate": 1.0, "midpoint": 0.5},
        {"step": "standardization", "scaler_mean": 0.6, "scaler_scale": 0.3}
      ]
    }
  }
}
```

---

## Ensemble Model Support

S-curves support ensemble models by:
1. Calculating weighted ensemble metrics
2. Using weighted transformation metadata
3. Applying same transformation pipeline
4. Using weighted coefficients for predictions

**Ensemble Detection:**
```python
is_ensemble = model_name.lower() in ['ensemble', 'weighted ensemble', 'ensemble model']

if is_ensemble:
    # Use ensemble_metric_calculation module
    ensemble_metrics = await calculate_weighted_ensemble_metrics(...)
    transformation_metadata = ensemble_metrics["transformation_metadata"]
    model_coefficients = ensemble_metrics["coefficients"]
```

---

## Example Usage

### Backend Call

```python
from .s_curve import get_s_curve_endpoint

result = await get_s_curve_endpoint(
    client_name="client1",
    app_name="app1",
    project_name="project1",
    combination_name="Comb1",
    model_name="Linear Regression",
    db=db,
    minio_client=minio_client,
    MINIO_BUCKET="main-bucket"
)

# Access S-curve data
tv_curve = result["s_curves"]["tv"]
total_volumes = tv_curve["total_volumes"]
media_values = tv_curve["media_values"]
diminishing_point = tv_curve["curve_analysis"]["max_point"]
```

### Frontend Usage

```typescript
// Fetch S-curve data
const fetchSCurveData = async (combinationId: string, modelName: string) => {
  const response = await fetch(`${SELECT_API}/models/s-curve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: env.CLIENT_NAME,
      app_name: env.APP_NAME,
      project_name: env.PROJECT_NAME,
      file_key: data.selectedDataset,
      combination_name: combinationId,
      model_name: modelName
    })
  });
  
  const result = await response.json();
  return result;
};

// Render chart
<SCurveChartRenderer
  curveData={sCurveData.s_curves.tv}
  variableName="TV"
  onThemeChange={(theme) => setTheme(theme)}
/>
```

---

## Performance Considerations

1. **51 Data Points**: Generates 51 scaled series per variable for smooth curves
2. **12 Months Data**: Uses last 12 months for realistic baseline
3. **Transformation Caching**: Transformation metadata cached in MongoDB
4. **Parallel Processing**: Can process multiple variables in parallel

---

## Troubleshooting

### Common Issues

1. **No S-curve data returned**
   - Check that ROI variables are configured in build config
   - Verify transformation metadata exists in MongoDB
   - Ensure source file has last 12 months of data

2. **Negative betas**
   - Automatically clamped to 0 in volume calculation
   - Check model training for negative coefficient issues

3. **Missing transformation metadata**
   - Verify model was trained with transformations enabled
   - Check MongoDB for `transformation_metadata` field

4. **Empty curves**
   - Verify variable exists in source data
   - Check that variable has non-zero values in last 12 months

---

## References

- **Core Module**: `s_curve.py`
- **API Service**: `service.py` (generate_s_curve)
- **API Endpoint**: `endpoint.py` (POST /models/s-curve)
- **Frontend Canvas**: `SelectModelsFeatureCanvas.tsx`
- **Chart Renderer**: `SCurveChartRenderer.tsx`
- **Ensemble Support**: `ensemble_metric_calculation.py`

