# Column Operations Reference Guide

This document provides comprehensive information about all available column operations in the Metric Agent, including their requirements, parameters, and usage patterns.

## Operation Categories

### 1. Arithmetic Operations (Require 2+ Columns)

#### `add`
- **Required Columns**: 2 or more
- **Description**: Sums multiple columns together
- **Formula**: `column1 + column2 + ... + columnN`
- **Parameters**: None
- **Example**: `add_0: "column1,column2,column3"`

#### `subtract`
- **Required Columns**: 2 or more
- **Description**: Subtracts columns sequentially (first column minus all others)
- **Formula**: `column1 - column2 - ... - columnN`
- **Parameters**: None
- **Example**: `subtract_0: "column1,column2"` → `column1 - column2`

#### `multiply`
- **Required Columns**: 2 or more
- **Description**: Multiplies columns together
- **Formula**: `column1 * column2 * ... * columnN`
- **Parameters**: None
- **Example**: `multiply_0: "column1,column2"`

#### `divide`
- **Required Columns**: 2 or more
- **Description**: Divides columns sequentially (first column divided by all others)
- **Formula**: `column1 / column2 / ... / columnN`
- **Parameters**: None
- **Example**: `divide_0: "column1,column2"` → `column1 / column2`

#### `pct_change`
- **Required Columns**: Exactly 2 (MANDATORY - backend enforces this)
- **Description**: Calculates percentage change between two columns
- **Formula**: `((column2 - column1) / column1) * 100`
- **Parameters**: None
- **Example**: `pct_change_0: "column1,column2"`
- **CRITICAL**: Must provide exactly 2 columns - backend will reject if more or less

#### `residual`
- **Required Columns**: 2 or more (first is dependent variable y, rest are independent variables x1, x2, ...)
- **Description**: Calculates residuals from linear regression (y - predicted_y)
- **Formula**: Uses linear regression: `y - (a + b1*x1 + b2*x2 + ...)`
- **Parameters**: None
- **Requires Grouping**: Yes (MANDATORY - backend uses group_apply for grouped regression)
- **Requires Identifiers**: Yes (MUST provide identifiers array - backend will compute globally without grouping if not provided, which may not be desired)
- **Example**: `residual_0: "y_column,x1_column,x2_column"` with `identifiers: ["group1", "group2"]`
- **CRITICAL**: Always provide identifiers for proper grouped regression analysis

---

### 2. Single Column Numeric Operations

#### `abs`
- **Required Columns**: 1 or more
- **Description**: Absolute value of column(s)
- **Formula**: `|column|`
- **Parameters**: None
- **Example**: `abs_0: "column1"`

#### `log`
- **Required Columns**: 1 or more
- **Description**: Natural logarithm of column(s)
- **Formula**: `ln(column)`
- **Parameters**: None
- **Example**: `log_0: "column1"`

#### `sqrt`
- **Required Columns**: 1 or more
- **Description**: Square root of column(s)
- **Formula**: `√column`
- **Parameters**: None
- **Example**: `sqrt_0: "column1"`

#### `exp`
- **Required Columns**: 1 or more
- **Description**: Exponential function (e^column)
- **Formula**: `e^column`
- **Parameters**: None
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `exp_0: "column1"`

#### `power`
- **Required Columns**: 1 or more
- **Description**: Raises column(s) to a power
- **Formula**: `column^exponent`
- **Parameters**: `{operation}_0_param` (exponent as number, e.g., "2", "0.5", "3")
- **Example**: `power_0: "column1"` with `power_0_param: "2"` → `column1^2`

---

### 3. String Operations (In-Place Modifications)

#### `lower`
- **Required Columns**: 1 or more
- **Description**: Converts string column(s) to lowercase (modifies in place)
- **Parameters**: None
- **Example**: `lower_0: "column1"`

#### `upper`
- **Required Columns**: 1 or more
- **Description**: Converts string column(s) to uppercase (modifies in place)
- **Parameters**: None
- **Example**: `upper_0: "column1"`

#### `strip`
- **Required Columns**: 1 or more
- **Description**: Removes leading/trailing whitespace from string column(s) (modifies in place)
- **Parameters**: None
- **Example**: `strip_0: "column1"`

#### `replace`
- **Required Columns**: 1 or more
- **Description**: Replaces values in column(s)
- **Parameters**: 
  - `{operation}_0_oldValue`: Value to replace
  - `{operation}_0_newValue`: Replacement value
- **Example**: `replace_0: "column1"` with `replace_0_oldValue: "old"` and `replace_0_newValue: "new"`

---

### 4. Missing Value Operations

#### `fill_na`
- **Required Columns**: 1 or more (columns with missing values)
- **Description**: Fills missing values using various strategies
- **Parameters**: 
  - `{operation}_0_strategy`: One of: "mean", "median", "mode", "zero", "empty", "drop", "custom"
  - `{operation}_0_customValue`: Required if strategy is "custom"
- **Example**: `fill_na_0: "column1"` with `fill_na_0_strategy: "mean"`

---

### 5. Date/Time Operations (Require Date Column)

#### `datetime`
- **Required Columns**: 1 (date column)
- **Description**: Extracts date components from date column
- **Parameters**: `{operation}_0_param`: One of: "to_year", "to_month", "to_week", "to_day", "to_day_name", "to_month_name"
- **Example**: `datetime_0: "date_column"` with `datetime_0_param: "to_month"`

#### `lag`
- **Required Columns**: 1 or more
- **Description**: Shifts column(s) backward by N periods
- **Formula**: `column(t-n)`
- **Parameters**: `{operation}_0_param` (period as integer, e.g., "1", "2", "7")
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `lag_0: "column1"` with `lag_0_param: "1"`

#### `lead`
- **Required Columns**: 1 or more
- **Description**: Shifts column(s) forward by N periods
- **Formula**: `column(t+n)`
- **Parameters**: `{operation}_0_param` (period as integer)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `lead_0: "column1"` with `lead_0_param: "1"`

#### `diff`
- **Required Columns**: 1 or more
- **Description**: Calculates difference from N periods ago
- **Formula**: `column(t) - column(t-n)`
- **Parameters**: `{operation}_0_param` (period as integer)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `diff_0: "column1"` with `diff_0_param: "1"`

#### `growth_rate`
- **Required Columns**: 1 or more
- **Description**: Calculates percentage growth rate over N periods
- **Formula**: `((column(t) - column(t-n)) / column(t-n)) * 100`
- **Parameters**: 
  - `{operation}_0_param`: Period as integer or JSON: `{"period": 1, "frequency": "monthly", "comparison_type": "period"}` or `{"period": 1, "frequency": "monthly", "comparison_type": "yoy"}`
  - `{operation}_0_frequency`: Optional - "daily", "weekly", "monthly", "quarterly", "yearly"
  - `{operation}_0_comparison_type`: Optional - "period" (consecutive) or "yoy" (year-over-year)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `growth_rate_0: "column1"` with `growth_rate_0_param: "1"`

#### `rolling_mean`
- **Required Columns**: 1 or more
- **Description**: Rolling average over N periods
- **Formula**: `mean(column[t-n+1:t])`
- **Parameters**: `{operation}_0_param` (window size as integer)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `rolling_mean_0: "column1"` with `rolling_mean_0_param: "7"`

#### `rolling_sum`
- **Required Columns**: 1 or more
- **Description**: Rolling sum over N periods
- **Formula**: `sum(column[t-n+1:t])`
- **Parameters**: `{operation}_0_param` (window size as integer)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `rolling_sum_0: "column1"` with `rolling_sum_0_param: "7"`

#### `rolling_min`
- **Required Columns**: 1 or more
- **Description**: Rolling minimum over N periods
- **Formula**: `min(column[t-n+1:t])`
- **Parameters**: `{operation}_0_param` (window size as integer)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `rolling_min_0: "column1"` with `rolling_min_0_param: "7"`

#### `rolling_max`
- **Required Columns**: 1 or more
- **Description**: Rolling maximum over N periods
- **Formula**: `max(column[t-n+1:t])`
- **Parameters**: `{operation}_0_param` (window size as integer)
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `rolling_max_0: "column1"` with `rolling_max_0_param: "7"`

#### `cumulative_sum`
- **Required Columns**: 1 or more
- **Description**: Cumulative sum from start
- **Formula**: `sum(column[0:t])`
- **Parameters**: None
- **Requires Date Column**: Yes (for sorting)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `cumulative_sum_0: "column1"`

---

### 6. Time Series Decomposition Operations (Require Date Column)

#### `detrend`
- **Required Columns**: 1 or more
- **Description**: Removes trend component using STL decomposition (keeps seasonal + residual)
- **Formula**: `seasonal + residual` (from STL)
- **Parameters**: `{operation}_0_period` (optional, auto-detected if not provided)
- **Requires Date Column**: Yes
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `detrend_0: "column1"`

#### `deseasonalize`
- **Required Columns**: 1 or more
- **Description**: Removes seasonal component using STL decomposition (keeps trend + residual)
- **Formula**: `trend + residual` (from STL)
- **Parameters**: `{operation}_0_period` (optional, auto-detected if not provided)
- **Requires Date Column**: Yes
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `deseasonalize_0: "column1"`

#### `detrend_deseasonalize`
- **Required Columns**: 1 or more
- **Description**: Removes both trend and seasonal components (keeps only residual)
- **Formula**: `residual` (from STL)
- **Parameters**: `{operation}_0_period` (optional, auto-detected if not provided)
- **Requires Date Column**: Yes
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `detrend_deseasonalize_0: "column1"`

#### `stl_outlier`
- **Required Columns**: 1 (volume column, date column auto-detected)
- **Description**: Detects outliers using STL decomposition (z-score > 3)
- **Formula**: Binary indicator (0 or 1) for outliers
- **Parameters**: None
- **Requires Date Column**: Yes (auto-detected)
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `stl_outlier_0: "volume_column"`

---

### 7. Standardization/Normalization Operations

#### `standardize_zscore`
- **Required Columns**: 1 or more
- **Description**: Standardizes column(s) using z-score (mean=0, std=1)
- **Formula**: `(column - mean) / std`
- **Parameters**: None
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `standardize_zscore_0: "column1"`

#### `standardize_minmax`
- **Required Columns**: 1 or more
- **Description**: Normalizes column(s) to [0, 1] range using min-max scaling
- **Formula**: `(column - min) / (max - min)`
- **Parameters**: None
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `standardize_minmax_0: "column1"`

---

### 8. Advanced Operations

#### `dummy`
- **Required Columns**: 1 or more (categorical columns)
- **Description**: Converts categorical column(s) to numeric codes
- **Formula**: Categorical codes (0, 1, 2, ...)
- **Parameters**: None
- **Example**: `dummy_0: "category_column"`

#### `logistic`
- **Required Columns**: 1 or more
- **Description**: Applies logistic transformation with adstock effect
- **Formula**: `1 / (1 + exp(-gr * (standardized_adstocked - mp)))`
- **Parameters**: `{operation}_0_param` (JSON): `{"gr": growth_rate, "co": carryover, "mp": midpoint}`
- **Requires Grouping**: Yes (uses identifiers)
- **Example**: `logistic_0: "column1"` with `logistic_0_param: '{"gr": 0.5, "co": 0.3, "mp": 0.0}'`

#### `rpi`
- **Required Columns**: 2 or more (for RPI calculation)
- **Description**: Calculates Relative Price Index
- **Parameters**: None
- **Example**: `rpi_0: "column1,column2"`

---

### 9. Dataframe-Level Operations (No Column Requirements or Special Handling)

#### `select_columns`
- **Required Columns**: 1 or more (columns to keep)
- **Description**: Selects only specified columns, removes all others
- **Parameters**: None
- **Example**: `select_columns_0: "column1,column2,column3"`

#### `drop_columns`
- **Required Columns**: 1 or more (columns to remove)
- **Description**: Drops specified columns, keeps all others
- **Parameters**: None
- **Example**: `drop_columns_0: "column1,column2"`

#### `rename`
- **Required Columns**: 1 or more (columns to rename)
- **Description**: Renames column(s)
- **Parameters**: `{operation}_0_rename` (single name for one column, comma-separated for multiple)
- **Example**: `rename_0: "old_column"` with `rename_0_rename: "new_column"`

#### `reorder`
- **Required Columns**: 1 or more (columns in desired order)
- **Description**: Reorders columns (specified columns first, then remaining)
- **Parameters**: None
- **Example**: `reorder_0: "column3,column1,column2"`

#### `deduplicate`
- **Required Columns**: 1 or more (columns to use for duplicate detection)
- **Description**: Removes duplicate rows based on specified columns
- **Parameters**: None
- **Example**: `deduplicate_0: "column1,column2"`

#### `sort_rows`
- **Required Columns**: 1 or more (columns to sort by)
- **Description**: Sorts rows by specified columns
- **Parameters**: None
- **Example**: `sort_rows_0: "column1,column2"`

---

### 10. Filtering Operations

#### `filter_rows_condition`
- **Required Columns**: 1 or more (columns to filter on)
- **Description**: Filters rows based on conditions
- **Parameters**: 
  - `{operation}_0_condition_{idx}_operator`: One of: "==", "!=", ">", ">=", "<", "<=", "contains", "not_contains"
  - `{operation}_0_condition_{idx}_value`: Value to compare against
- **Example**: `filter_rows_condition_0: "column1"` with `filter_rows_condition_0_condition_0_operator: ">"` and `filter_rows_condition_0_condition_0_value: "100"`

#### `filter_top_n_per_group`
- **Required Columns**: 1 or more (identifiers + metric column)
- **Description**: Filters top N rows per group based on metric column
- **Parameters**: 
  - `{operation}_0_n`: Number of rows to keep (integer)
  - `{operation}_0_metric_col`: Column to rank by (optional, defaults to first column)
  - `{operation}_0_ascending`: "true" or "false" (default: "false" for top N)
- **Example**: `filter_top_n_per_group_0: "identifier1,metric_column"` with `filter_top_n_per_group_0_n: "10"` and `filter_top_n_per_group_0_metric_col: "metric_column"`

#### `filter_percentile`
- **Required Columns**: None (uses metric_col parameter instead)
- **Description**: Filters rows by percentile threshold
- **Parameters**: 
  - `{operation}_0_percentile`: Percentile value (0-100)
  - `{operation}_0_metric_col`: Column to filter by (REQUIRED)
  - `{operation}_0_direction`: "top" or "bottom" (default: "top")
- **Example**: `filter_percentile_0: ""` with `filter_percentile_0_percentile: "90"`, `filter_percentile_0_metric_col: "metric_column"`, `filter_percentile_0_direction: "top"`

---

### 11. Grouped Aggregation Operations (Require Identifiers)

#### `compute_metrics_within_group`
- **Required Columns**: Identifiers + metric columns
- **Description**: Computes aggregated metrics within groups
- **Parameters**: 
  - `{operation}_0_metric_cols`: JSON array: `[{"metric_col": "column1", "method": "sum", "rename": "new_name"}, ...]`
  - Methods: "sum", "mean", "median", "max", "min", "count", "nunique", "rank_pct"
- **Requires Identifiers**: Yes (from columns array, excluding metric columns)
- **Example**: `compute_metrics_within_group_0: "identifier1,identifier2,metric_column"` with `compute_metrics_within_group_0_metric_cols: '[{"metric_col": "metric_column", "method": "sum", "rename": "group_sum"}]'`

#### `group_share_of_total`
- **Required Columns**: Identifiers + metric columns
- **Description**: Calculates each row's share of its group total
- **Formula**: `column_value / group_sum(column)`
- **Parameters**: 
  - `{operation}_0_metric_cols`: JSON array: `[{"metric_col": "column1", "rename": "new_name"}, ...]`
- **Requires Identifiers**: Yes (from columns array, excluding metric columns)
- **Example**: `group_share_of_total_0: "identifier1,metric_column"` with `group_share_of_total_0_metric_cols: '[{"metric_col": "metric_column", "rename": "share"}]'`

#### `group_contribution`
- **Required Columns**: Identifiers + metric columns
- **Description**: Calculates group's contribution to overall total
- **Formula**: `(group_sum(column) / overall_sum(column)) * 100`
- **Parameters**: 
  - `{operation}_0_metric_cols`: JSON array: `[{"metric_col": "column1", "rename": "new_name"}, ...]`
- **Requires Identifiers**: Yes (from columns array, excluding metric columns)
- **Example**: `group_contribution_0: "identifier1,metric_column"` with `group_contribution_0_metric_cols: '[{"metric_col": "metric_column", "rename": "contribution"}]'`

---

## Operation Requirements Summary

### By Column Count

**No Columns Required:**
- `filter_percentile` (uses metric_col parameter)

**1 Column Required:**
- `abs`, `log`, `sqrt`, `exp`, `power`, `lower`, `upper`, `strip`, `fill_na`, `datetime`, `dummy`, `cumulative_sum`
- `lag`, `lead`, `diff`, `growth_rate`, `rolling_mean`, `rolling_sum`, `rolling_min`, `rolling_max`
- `detrend`, `deseasonalize`, `detrend_deseasonalize`, `standardize_zscore`, `standardize_minmax`, `logistic`
- `select_columns`, `drop_columns`, `rename`, `reorder`, `deduplicate`, `sort_rows`

**2 Columns Required:**
- `pct_change`, `divide`, `subtract`, `multiply`, `add` (minimum 2)
- `rpi`

**2+ Columns Required:**
- `add`, `subtract`, `multiply`, `divide`, `residual` (can use more than 2)

**Special:**
- `filter_rows_condition`: 1+ columns (one condition per column)
- `filter_top_n_per_group`: 1+ columns (identifiers + metric)
- `compute_metrics_within_group`: Identifiers + metric columns
- `group_share_of_total`: Identifiers + metric columns
- `group_contribution`: Identifiers + metric columns

### By Special Requirements

**Requires Date Column:**
- `datetime`, `lag`, `lead`, `diff`, `growth_rate`, `rolling_mean`, `rolling_sum`, `rolling_min`, `rolling_max`, `cumulative_sum`
- `detrend`, `deseasonalize`, `detrend_deseasonalize`, `stl_outlier`

**Requires Grouping (Identifiers):**
- `residual`, `exp`, `logistic`, `lag`, `lead`, `diff`, `growth_rate`, `rolling_mean`, `rolling_sum`, `rolling_min`, `rolling_max`, `cumulative_sum`
- `detrend`, `deseasonalize`, `detrend_deseasonalize`, `stl_outlier`
- `standardize_zscore`, `standardize_minmax`
- `compute_metrics_within_group`, `group_share_of_total`, `group_contribution`
- `filter_top_n_per_group`

**Requires Parameters:**
- `power`: `{operation}_0_param` (exponent)
- `datetime`: `{operation}_0_param` (extraction type)
- `lag`: `{operation}_0_param` (period)
- `lead`: `{operation}_0_param` (period)
- `diff`: `{operation}_0_param` (period)
- `growth_rate`: `{operation}_0_param` (period) or JSON with frequency/comparison_type
- `rolling_mean/sum/min/max`: `{operation}_0_param` (window size)
- `replace`: `{operation}_0_oldValue`, `{operation}_0_newValue`
- `fill_na`: `{operation}_0_strategy`, optionally `{operation}_0_customValue`
- `detrend/deseasonalize/detrend_deseasonalize`: `{operation}_0_period` (optional)
- `logistic`: `{operation}_0_param` (JSON with gr, co, mp)
- `filter_rows_condition`: `{operation}_0_condition_{idx}_operator`, `{operation}_0_condition_{idx}_value`
- `filter_top_n_per_group`: `{operation}_0_n`, `{operation}_0_metric_col`, `{operation}_0_ascending`
- `filter_percentile`: `{operation}_0_percentile`, `{operation}_0_metric_col`, `{operation}_0_direction`
- `compute_metrics_within_group`: `{operation}_0_metric_cols` (JSON array)
- `group_share_of_total`: `{operation}_0_metric_cols` (JSON array)
- `group_contribution`: `{operation}_0_metric_cols` (JSON array)

---

## Usage Notes

1. **Column Names**: Always use actual column names from the AVAILABLE FILES AND COLUMNS section. Do NOT use example names like "column1", "SalesValue", etc.

2. **File Names**: Always use actual file names from the AVAILABLE FILES AND COLUMNS section. Do NOT use example file names.

3. **Identifiers**: For operations requiring grouping, identifiers are automatically extracted from the columns array (excluding metric columns). Ensure identifiers are provided in the columns array.

4. **Date Column**: Operations requiring a date column will auto-detect a column named "date" (case-insensitive). Ensure your data has a date column.

5. **Parameters**: When parameters are required, they must be provided in the `parameters` object in the operation_config, or as separate form fields in the format `{operation}_{index}_{param_name}`.

6. **Rename**: Use the `rename` field to specify custom names for new columns. If not provided, default names are generated.

7. **Multiple Operations**: You can chain multiple operations by providing multiple operation entries in the operations array.

