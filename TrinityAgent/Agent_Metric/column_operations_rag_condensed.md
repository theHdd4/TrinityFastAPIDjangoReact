# Column Operations Quick Reference

## Operation Requirements Summary

### By Column Count

**1 Column Required:**
- `abs`, `log`, `sqrt`, `exp`, `power` (needs param: exponent), `lower`, `upper`, `strip`, `fill_na` (needs strategy), `datetime` (needs param), `dummy`, `cumulative_sum` (needs date)
- `lag`, `lead`, `diff`, `growth_rate` (all need param: period, need date column, need identifiers)
- `rolling_mean`, `rolling_sum`, `rolling_min`, `rolling_max` (all need param: window, need date column, need identifiers)
- `detrend`, `deseasonalize`, `detrend_deseasonalize` (need date column, need identifiers, optional param: period)
- `standardize_zscore`, `standardize_minmax` (need identifiers)
- `logistic` (needs param: JSON with gr/co/mp, needs identifiers)
- `select_columns`, `drop_columns`, `rename` (needs rename param), `reorder`, `deduplicate`, `sort_rows`

**2 Columns Required:**
- `pct_change` (exactly 2), `divide`, `subtract`, `multiply`, `add` (minimum 2)

**2+ Columns Required:**
- `add`, `subtract`, `multiply`, `divide`, `residual` (needs identifiers), `rpi`

**No Columns Required:**
- `filter_percentile` (uses metric_col parameter instead)

**Special Requirements:**
- `replace`: needs oldValue, newValue params
- `filter_rows_condition`: needs condition operators/values per column
- `filter_top_n_per_group`: needs n, metric_col, ascending params
- `compute_metrics_within_group`: needs metric_cols JSON array, needs identifiers
- `group_share_of_total`: needs metric_cols JSON array, needs identifiers
- `group_contribution`: needs metric_cols JSON array, needs identifiers

### By Special Requirements

**Requires Date Column:**
- `datetime`, `lag`, `lead`, `diff`, `growth_rate`, `rolling_mean`, `rolling_sum`, `rolling_min`, `rolling_max`, `cumulative_sum`
- `detrend`, `deseasonalize`, `detrend_deseasonalize`, `stl_outlier`

**Requires Identifiers (Grouping):**
- `residual`, `exp`, `logistic`, `lag`, `lead`, `diff`, `growth_rate`, `rolling_mean`, `rolling_sum`, `rolling_min`, `rolling_max`, `cumulative_sum`
- `detrend`, `deseasonalize`, `detrend_deseasonalize`, `stl_outlier`
- `standardize_zscore`, `standardize_minmax`
- `compute_metrics_within_group`, `group_share_of_total`, `group_contribution`, `filter_top_n_per_group`

**Requires Parameters:**
- `power`: param (exponent number, e.g., 2, 0.5, 3)
- `datetime`: param (string value: "to_year", "to_month", "to_week", "to_day", "to_day_name", or "to_month_name")
  - In JSON, use: `{"parameters": {"to_year": true}}` - the handler will extract "to_year" as the param value
- `lag/lead/diff`: param (period integer)
- `growth_rate`: param (period integer) or JSON with frequency/comparison_type
- `rolling_mean/sum/min/max`: param (window integer)
- `replace`: oldValue, newValue
- `fill_na`: strategy (mean/median/mode/zero/empty/drop/custom), optionally customValue
- `detrend/deseasonalize/detrend_deseasonalize`: period (optional integer)
- `logistic`: param (JSON: {"gr": number, "co": number, "mp": number})
- `filter_rows_condition`: condition_{idx}_operator, condition_{idx}_value (per column)
- `filter_top_n_per_group`: n (integer), metric_col (string), ascending (boolean)
- `filter_percentile`: percentile (0-100), metric_col (string), direction (top/bottom)
- `compute_metrics_within_group`: metric_cols (JSON array: [{"metric_col": "col", "method": "sum", "rename": "name"}])
- `group_share_of_total`: metric_cols (JSON array: [{"metric_col": "col", "rename": "name"}])
- `group_contribution`: metric_cols (JSON array: [{"metric_col": "col", "rename": "name"}])

## Common Operation Patterns

**Arithmetic:** add, subtract, multiply, divide (2+ columns)
**Transformations:** abs, log, sqrt, exp, power (1 column)
**String:** lower, upper, strip, replace (1+ columns, in-place)
**Time Series:** lag, lead, diff, growth_rate (1+ columns, needs date + identifiers)
**Rolling:** rolling_mean, rolling_sum, rolling_min, rolling_max (1+ columns, needs date + identifiers + window)
**Decomposition:** detrend, deseasonalize, detrend_deseasonalize (1+ columns, needs date + identifiers)
**Grouping:** compute_metrics_within_group, group_share_of_total, group_contribution (needs identifiers + metric columns)

