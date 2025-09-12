import pandas as pd
import numpy as np
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.exponential_smoothing.ets import ETSModel

# Prophet availability will be checked inside the function for multiprocessing compatibility
PROPHET_AVAILABLE = None  # Will be set dynamically

from sklearn.metrics import mean_squared_error, mean_absolute_error
import warnings
from sklearn.metrics import mean_absolute_percentage_error

warnings.filterwarnings("ignore")



def clean_dataframe_for_json(df):
    """
    Clean DataFrame to ensure it's JSON serializable by replacing infinite and NaN values.
    """
    df_clean = df.copy()
    
    # Replace infinite values with None
    df_clean = df_clean.replace([np.inf, -np.inf], None)
    
    # Replace NaN values with None
    df_clean = df_clean.replace([np.nan], None)
    
    # Clean numeric columns specifically
    numeric_columns = df_clean.select_dtypes(include=[np.number]).columns
    for col in numeric_columns:
        df_clean[col] = df_clean[col].replace([np.inf, -np.inf], None)
        df_clean[col] = df_clean[col].replace([np.nan], None)
    
    return df_clean


def get_arima_params(frequency):
    params = {
        'M': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 12)},
        'Q': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 4)},
        'D': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 7)},
        'W': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 52)},
        'Y': {'order': (1, 1, 1), 'seasonal_order': None}
    }
    return params.get(frequency, {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 12)})

def process_model_cpu_bound(model_name, y_series_data, forecast_horizon, frequency, seasonal_periods, freq_params):
    """
    CPU-bound function to process a single model using ProcessPoolExecutor.
    This function runs in a separate process to utilize multiple CPU cores.
    """
    # Import pandas locally to ensure it's available in all contexts
    import pandas as pd
    import numpy as np
    
    try:
        # Convert y_series_data back to pandas Series
        y_series = pd.Series(y_series_data['values'], index=pd.DatetimeIndex(y_series_data['index']))
        
        if model_name == 'ARIMA':
            arima_order = freq_params['order']
            arima_model = ARIMA(y_series, order=arima_order).fit()
            arima_forecast = arima_model.forecast(steps=forecast_horizon)
            arima_fitted = arima_model.predict(start=y_series.index[0], end=y_series.index[-1])
            fitted_series = pd.Series(arima_fitted, index=y_series.index)
            return {
                'model_name': 'ARIMA',
                'forecast': list(arima_forecast),
                'fitted': list(arima_fitted),
                'fitted_series': fitted_series,
                'params': {'order': arima_order}
            }
        
        elif model_name == 'SARIMA':
            if len(y_series) >= 2 * seasonal_periods:
                sarima_order = freq_params['order']
                seasonal_order = freq_params['seasonal_order']
                sarima_model = SARIMAX(y_series, order=sarima_order, seasonal_order=seasonal_order).fit()
                sarima_forecast = sarima_model.forecast(steps=forecast_horizon)
                sarima_fitted = sarima_model.predict(start=y_series.index[0], end=y_series.index[-1])
                fitted_series = pd.Series(sarima_fitted, index=y_series.index)
                return {
                    'model_name': 'SARIMA',
                    'forecast': list(sarima_forecast),
                    'fitted': list(sarima_fitted),
                    'fitted_series': fitted_series,
                    'params': {'order': sarima_order, 'seasonal_order': seasonal_order}
                }
            else:
                return {'model_name': 'SARIMA', 'error': 'Insufficient data'}
        
        elif model_name == 'Holt-Winters':
            if len(y_series) >= 2 * seasonal_periods:
                hw_model = ExponentialSmoothing(y_series, trend="add", seasonal="add",
                                                seasonal_periods=seasonal_periods).fit()
                hw_forecast = hw_model.forecast(steps=forecast_horizon)
                hw_fitted = hw_model.fittedvalues
                fitted_series = pd.Series(hw_fitted, index=y_series.index)
                return {
                    'model_name': 'Holt-Winters',
                    'forecast': list(hw_forecast),
                    'fitted': list(hw_fitted),
                    'fitted_series': fitted_series,
                    'params': {
                        'trend': 'add',
                        'seasonal': 'add',
                        'seasonal_periods': seasonal_periods
                    }
                }
            else:
                return {'model_name': 'Holt-Winters', 'error': 'Insufficient data'}
        
        elif model_name == 'ETS':
            if len(y_series) >= 2 * seasonal_periods:
                ets_model = ETSModel(y_series, error='add', trend='add', seasonal='add',
                                     seasonal_periods=seasonal_periods,
                                     initialization_method='estimated').fit()
            else:
                ets_model = ETSModel(y_series, error='add', trend='add', seasonal=None,
                                     initialization_method='estimated').fit()
            ets_forecast = ets_model.forecast(steps=forecast_horizon)
            ets_fitted = ets_model.fittedvalues
            fitted_series = pd.Series(ets_fitted, index=y_series.index)
            return {
                'model_name': 'ETS',
                'forecast': list(ets_forecast),
                'fitted': list(ets_fitted),
                'fitted_series': fitted_series,
                'params': {
                    'error': 'add',
                    'trend': 'add',
                    'seasonal': 'add' if len(y_series) >= 2 * seasonal_periods else None,
                    'seasonal_periods': seasonal_periods if len(y_series) >= 2 * seasonal_periods else None
                }
            }
        
        elif model_name == 'Prophet':
            try:
                # Import Prophet dynamically for multiprocessing compatibility
                try:
                    from prophet import Prophet
                    prophet_available = True
                except ImportError as e:
                    prophet_available = False
                    return {'model_name': 'Prophet', 'error': f'Prophet library not available: {str(e)}'}
                
                if prophet_available:
                    
                    # Prophet requires at least 2 data points and some variation
                    if len(y_series) < 2:
                        return {'model_name': 'Prophet', 'error': 'Prophet requires at least 2 data points'}
                    
                    # Check for sufficient data variation for Prophet
                    if y_series.nunique() < 2:
                        # Add very small random noise to make Prophet work with constant data
                        noise_level = y_series.iloc[0] * 0.001
                        y_series_prophet = y_series + np.random.normal(0, noise_level, len(y_series))
                    else:
                        y_series_prophet = y_series
                    
                    # Prepare data for Prophet (requires 'ds' and 'y' columns)
                    df_prophet = pd.DataFrame({
                        'ds': y_series.index,
                        'y': y_series_prophet.values
                    })
                    
                    # Create and fit Prophet model
                    prophet_model = Prophet(
                        yearly_seasonality=False,  # Disable yearly seasonality for short series
                        weekly_seasonality=False,  # Disable weekly seasonality for short series
                        daily_seasonality=False,   # Disable daily seasonality for short series
                        seasonality_mode='additive'
                    )
                    prophet_model.fit(df_prophet)
                    
                    # Map frequency to Prophet-compatible format
                    prophet_freq_map = {
                        'D': 'D',      # Daily
                        'W': 'W',      # Weekly
                        'M': 'M',      # Monthly
                        'Q': 'Q',      # Quarterly
                        'Y': 'Y'       # Yearly
                    }
                    prophet_freq = prophet_freq_map.get(frequency, 'M')  # Default to monthly
                    
                    # Make future dataframe for forecasting
                    future = prophet_model.make_future_dataframe(periods=forecast_horizon, freq=prophet_freq)
                    
                    forecast = prophet_model.predict(future)
                    
                    # Extract fitted values (historical predictions)
                    fitted = forecast["yhat"].values[:len(y_series)]
                    fitted_series = pd.Series(fitted, index=y_series.index)
                    
                    # Extract future forecast values
                    future_forecast = forecast["yhat"].values[-forecast_horizon:]
                    
                    # Validate forecast results
                    if len(future_forecast) != forecast_horizon:
                        # Pad or truncate to match expected length
                        if len(future_forecast) > forecast_horizon:
                            future_forecast = future_forecast[:forecast_horizon]
                        else:
                            # Pad with the last value
                            last_value = future_forecast[-1] if len(future_forecast) > 0 else fitted[-1] if len(fitted) > 0 else 0
                            future_forecast = np.append(future_forecast, [last_value] * (forecast_horizon - len(future_forecast)))
                    
                    # Check for invalid values (NaN, inf)
                    if np.any(np.isnan(future_forecast)) or np.any(np.isinf(future_forecast)):
                        last_valid = fitted[-1] if len(fitted) > 0 and not np.isnan(fitted[-1]) else y_series.iloc[-1]
                        future_forecast = np.where(np.isnan(future_forecast) | np.isinf(future_forecast), last_valid, future_forecast)
                    
                    result = {
                        'model_name': 'Prophet',
                        'forecast': list(future_forecast),
                        'fitted': list(fitted),
                        'fitted_series': fitted_series,
                        'params': {
                            'growth': 'linear',
                            'seasonality': 'additive',
                            'holidays': 'auto'
                        }
                    }
                    return result
                else:
                    return {'model_name': 'Prophet', 'error': 'Prophet library not available'}
            except Exception as e:
                return {'model_name': 'Prophet', 'error': f'Prophet training failed: {str(e)}'}
        
        return {'model_name': model_name, 'error': 'Unknown model'}
        
    except Exception as e:
        return {'model_name': model_name, 'error': str(e)}


async def forecast_for_combination(df, y_var, forecast_horizon=12, fiscal_start_month=1, frequency="M", combination=None, models_to_run=None):
    """
    Run autoregressive forecasting on a dataframe that already contains data for a specific combination.
    
    Parameters:
    - df: DataFrame containing data for a specific combination (no filtering needed)
    - y_var: Target variable column name
    - forecast_horizon: Number of periods to forecast
    - fiscal_start_month: Fiscal year start month (1-12)
    - frequency: Data frequency ('D', 'W', 'M', 'Q', 'Y')
    - combination: Combination dictionary for reference (optional)
    """
    # Import pandas locally to ensure it's available in all contexts
    import pandas as pd
    import numpy as np
    
    try:
        # Check if data exists
        if df.empty:
            return {
                "status": "FAILURE",
                "error": f"No data found for combination: {combination}"
            }

        # Check and set datetime index - handle different date column names
        date_col = None
        for col in ['date', 'Date', 'DATE']:
            if col in df.columns:
                date_col = col
                break
        
        if not date_col:
            return {
                "status": "FAILURE",
                "error": "No date column found. Expected columns: 'date', 'Date', or 'DATE'"
            }

        # Convert and set index
        df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
        df = df.dropna(subset=[date_col])
        df = df.set_index(date_col).sort_index()

        # Ensure target column exists (case-insensitive matching)
        
        # Try exact match first
        if y_var in df.columns:
            actual_y_var = y_var
        else:
            # Try case-insensitive match
            actual_y_var = None
            for col in df.columns:
                if col.lower() == y_var.lower():
                    actual_y_var = col
                    break
            
            if actual_y_var is None:
                return {
                    "status": "FAILURE",
                    "error": f"The target variable '{y_var}' is not in the data. Available columns: {list(df.columns)}"
                }
        
        # Use the actual column name from the data
        y_var = actual_y_var

        y_series = pd.to_numeric(df[y_var], errors='coerce')
        
        y_series = y_series.resample(frequency).mean().ffill().dropna()

        # Final check
        if y_series.empty:
            return {
                "status": "FAILURE",
                "error": f"No valid data found for target variable '{y_var}' after cleaning"
            }

        # Define available models
        available_models = ['ARIMA', 'SARIMA', 'Holt-Winters', 'ETS', 'Prophet']
        
        # If models_to_run is None, run all models; otherwise run only specified models
        if models_to_run is None:
            models_to_run = available_models
        else:
            # Validate that all requested models are available
            invalid_models = [model for model in models_to_run if model not in available_models]
            if invalid_models:
                return {
                    "status": "FAILURE",
                    "error": f"Invalid models specified: {invalid_models}. Available models: {available_models}"
                }
        
        results = {
            'status': 'SUCCESS',
            'forecast_df': None,
            'metrics': {},
            'model_params': {},
            'combination': combination,
            'models_run': models_to_run
        }
        
        # Helper functions for metrics calculation (from working version)
        def safe_mape(actual, predicted):
            mask = (actual != 0) & ~np.isnan(actual) & ~np.isnan(predicted)
            if mask.sum() == 0:
                return None
            return np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100
        
        def smape(actual, predicted):
            actual = np.array(actual)
            predicted = np.array(predicted)
            denominator = (np.abs(actual) + np.abs(predicted)) / 2
            mask = (denominator != 0) & ~np.isnan(actual) & ~np.isnan(predicted)
            if mask.sum() == 0:
                return None
            return np.mean(np.abs(actual[mask] - predicted[mask]) / denominator[mask]) * 100
        
        def calculate_metrics(actual, fitted, model_name):
            actual = pd.Series(actual)
            fitted = pd.Series(fitted)
            
            aligned = pd.concat([actual, fitted], axis=1).dropna()
            if aligned.empty:
                return None
            
            actual_vals = aligned.iloc[:, 0]
            fitted_vals = aligned.iloc[:, 1]
            
            metrics = {
                'MAE': mean_absolute_error(actual_vals, fitted_vals),
                'MSE': mean_squared_error(actual_vals, fitted_vals),
                'RMSE': np.sqrt(mean_squared_error(actual_vals, fitted_vals)),
                'MAPE': safe_mape(actual_vals, fitted_vals),
                'SMAPE': smape(actual_vals, fitted_vals),
            }
            results['metrics'][model_name] = metrics
            return metrics

        last_date = y_series.index[-1]
        if frequency == "M":
            forecast_start = last_date + pd.offsets.MonthBegin(1)
        elif frequency == "Q":
            forecast_start = last_date + pd.offsets.QuarterBegin(1)
        elif frequency == "Y":
            forecast_start = last_date + pd.offsets.YearBegin(1)
        elif frequency == "W":
            forecast_start = last_date + pd.offsets.Week(1)
        elif frequency == "D":
            forecast_start = last_date + pd.offsets.Day(1)
        else:
            forecast_start = last_date + pd.offsets.MonthBegin(1)

        future_dates = pd.date_range(start=forecast_start, periods=forecast_horizon, freq=frequency)
        all_dates = list(y_series.index) + list(future_dates)

        df_results = pd.DataFrame({
            'date': all_dates,
            'Actual': list(y_series) + [None] * forecast_horizon
        })

        # Process models in parallel using ProcessPoolExecutor for CPU-bound tasks (from working version)
        seasonal_periods = {'D': 7, 'W': 52, 'Q': 4, 'Y': 1, 'M': 12}.get(frequency, 12)
        freq_params = get_arima_params(frequency)
        
        # Convert y_series to serializable format for multiprocessing
        y_series_data = {
            'values': y_series.values.tolist(),
            'index': y_series.index.tolist()
        }
        
        # Use ProcessPoolExecutor to utilize multiple CPU cores
        from concurrent.futures import ProcessPoolExecutor, as_completed
        import multiprocessing
        
        max_workers = min(multiprocessing.cpu_count(), len(models_to_run))
        
        model_results = []
        
        try:
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                # Submit all model tasks
                future_to_model = {
                    executor.submit(
                        process_model_cpu_bound, 
                        model_name, 
                        y_series_data, 
                        forecast_horizon, 
                        frequency, 
                        seasonal_periods, 
                        freq_params
                    ): model_name 
                    for model_name in models_to_run
                }
                
                # Collect results as they complete
                for future in as_completed(future_to_model):
                    model_name = future_to_model[future]
                    try:
                        result = future.result()
                        model_results.append(result)
                    except Exception as e:
                        model_results.append({'model_name': model_name, 'error': str(e)})
        except Exception as e:
            # Fallback to sequential processing if parallel processing fails
            for model_name in models_to_run:
                try:
                    result = process_model_cpu_bound(
                        model_name, 
                        y_series_data, 
                        forecast_horizon, 
                        frequency, 
                        seasonal_periods, 
                        freq_params
                    )
                    model_results.append(result)
                except Exception as e:
                    model_results.append({'model_name': model_name, 'error': str(e)})
        
        # Process results and populate df_results
        successful_models = []
        for result in model_results:
            model_name = result.get('model_name', 'Unknown')
            if 'error' not in result:
                # Model succeeded
                successful_models.append(model_name)
                forecast_values = result.get('forecast', [])
                fitted_values = result.get('fitted', [])
                
                # Ensure we have the right number of values
                if len(forecast_values) == forecast_horizon and len(fitted_values) == len(y_series):
                    df_results[model_name] = fitted_values + forecast_values
                    results['model_params'][model_name] = result.get('params', {})
                    
                    # Calculate metrics
                    fitted_series = pd.Series(fitted_values, index=y_series.index)
                    calculate_metrics(y_series, fitted_series, model_name)
                else:
                    df_results[model_name] = [None] * len(df_results)
            else:
                # Model failed
                df_results[model_name] = [None] * len(df_results)
        
        # Ensure all requested models have columns in df_results
        for model_name in models_to_run:
            if model_name not in df_results.columns:
                df_results[model_name] = [None] * len(df_results)
        
        results['models_run'] = successful_models

        # Convert DataFrame to serializable format
        results['forecast_df'] = df_results.to_dict('records') if df_results is not None else None
        
        return results
        
    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        return {
            "status": "FAILURE",
            "error": f"Error in forecast_for_combination: {str(e)}",
            "traceback": error_traceback
        }



# import pandas as pd
# import numpy as np

# def calculate_fiscal_growth(forecast_df: pd.DataFrame, fiscal_start_month: int) -> pd.DataFrame:
#     """
#     Calculates year-over-year growth per model (including actual and forecast) based on fiscal year.

#     Parameters:
#         forecast_df (pd.DataFrame): DataFrame containing 'date', 'actual', and forecast columns per model.
#         fiscal_start_month (int): Fiscal year start month (e.g., 4 for April).

#     Returns:
#         pd.DataFrame: DataFrame with columns ['model', 'fiscal_year', 'total', 'yoy_growth_pct']
#     """
#     if 'date' not in forecast_df.columns:
#         raise ValueError("The input DataFrame must contain a 'date' column.")

#     # Ensure datetime format
#     forecast_df = forecast_df.copy()
#     forecast_df['date'] = pd.to_datetime(forecast_df['date'])

#     # Create fiscal year column
#     forecast_df['fiscal_year'] = forecast_df['date'].map(
#         lambda x: f"FY{(x.year + 1) % 100:02d}" if x.month >= fiscal_start_month else f"FY{x.year % 100:02d}"
#     )

#     # Identify columns to melt (exclude 'date' and 'fiscal_year')
#     value_columns = [col for col in forecast_df.columns if col not in ['date', 'fiscal_year']]

#     # Melt to long format for aggregation
#     melted_df = forecast_df.melt(
#         id_vars=['date', 'fiscal_year'],
#         value_vars=value_columns,
#         var_name='model',
#         value_name='value'
#     )

#     # Remove missing values
#     melted_df.dropna(subset=['value'], inplace=True)

#     # Group by model and fiscal year
#     grouped = melted_df.groupby(['model', 'fiscal_year'])['value'].sum().reset_index(name='total')

#     # Calculate YoY growth
#     grouped.sort_values(by=['model', 'fiscal_year'], inplace=True)
#     grouped['yoy_growth_pct'] = grouped.groupby('model')['total'].pct_change() * 100
#     grouped['yoy_growth_pct'] = grouped['yoy_growth_pct'].round(2)

#     return grouped



# def calculate_fiscal_growth(forecast_df: pd.DataFrame, forecast_horizon: int, fiscal_start_month: int = 1, frequency: str = "M", start_year: int = 2017) -> pd.DataFrame:
#     """
#     Calculates fiscal year growth using actual + forecasted data for each model.
#     Assumes forecast_df has 'date', 'Actual', and model columns like 'ARIMA', 'SARIMA', etc.
#     """
#     forecast_df = forecast_df.copy()
#     forecast_df["date"] = pd.to_datetime(forecast_df["date"])

#     # List of model columns (excluding 'date' and 'Actual')
#     forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
#     output_rows = []

#     if len(forecast_cols) == 0:
#         raise ValueError("No model forecast columns found in forecast_df.")

#     for model_col in forecast_cols:
#         model_name = model_col

#         # Split actual and forecast based on forecast_horizon
#         actual_df = forecast_df.iloc[:-forecast_horizon][["date", "Actual"]].copy()
#         actual_df.rename(columns={"Actual": "volume"}, inplace=True)

#         forecast_part = forecast_df.iloc[-forecast_horizon:][["date", model_col]].copy()
#         forecast_part.rename(columns={model_col: "volume"}, inplace=True)

#         # Combine both
#         combined_df = pd.concat([actual_df, forecast_part], ignore_index=True)
#         combined_df = combined_df[combined_df["date"].dt.year >= start_year - 1]

#         # Fiscal year
#         combined_df["fiscal_year"] = combined_df["date"].map(
#             lambda x: f"FY{(x.year + 1) % 100:02d}" if x.month >= fiscal_start_month else f"FY{x.year % 100:02d}"
#         )

#         # Aggregate
#         if frequency in ["D", "W", "M", "Q"]:
#             annual_df = combined_df.groupby("fiscal_year")["volume"].mean().reset_index()
#         else:
#             annual_df = combined_df.groupby("fiscal_year")["volume"].mean().reset_index()

#         # Growth
#         annual_df["growth_rate"] = annual_df["volume"].pct_change()
#         annual_df["model"] = model_name

#         output_rows.append(annual_df[["fiscal_year", "model", "volume", "growth_rate"]])

#     if not output_rows:
#         raise ValueError("No valid data found to calculate fiscal growth.")

#     # Merge all models' data
#     growth_df = pd.concat(output_rows, ignore_index=True)
#     growth_df.rename(columns={"volume": "fiscal_total"}, inplace=True)
#     growth_df.sort_values(["model", "fiscal_year"], inplace=True)

#     return growth_df

def calculate_fiscal_growth(forecast_df: pd.DataFrame, forecast_horizon: int, fiscal_start_month: int = 1, frequency: str = "M", start_year: int = 2017) -> pd.DataFrame:
    """
    Calculates fiscal year growth using actual + forecasted data for each model.
    Assumes forecast_df has 'date', 'Actual', and model columns like 'ARIMA', 'SARIMA', etc.
    
    FIXED: Now generates unique growth rates for each combination by using actual forecast data
    from the training results instead of identical sample data for all combinations.
    """
    # Import pandas locally to ensure it's available in multiprocessing context
    import pandas as pd
    import numpy as np
    
    # Ensure start_year is integer
    start_year = int(start_year)
    
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])

    # List of model columns (excluding 'date' and 'Actual')
    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    if len(forecast_cols) == 0:
        raise ValueError("No model forecast columns found in forecast_df.")

    # Ensure we process ALL models, even if they have None values
    expected_models = ['ARIMA', 'SARIMA', 'Holt-Winters', 'ETS', 'Prophet']
    
    for model_name in expected_models:
        if model_name not in forecast_cols:
            # Add placeholder data for missing model
            placeholder_data = {
                'fiscal_year': ['FY23', 'FY24'],
                'model': [model_name, model_name],
                'fiscal_total': [0, 0],
                'growth_rate': [0, 0]
            }
            placeholder_df = pd.DataFrame(placeholder_data)
            output_rows.append(placeholder_df)
            continue

        model_col = model_name
        
        # Check if this model has valid data (not all None values)
        model_data = forecast_df[model_col]
        if model_data.isna().all() or (model_data == None).all():
            # Model failed - create placeholder data with 0 growth
            placeholder_data = {
                'fiscal_year': ['FY23', 'FY24'],
                'model': [model_name, model_name],
                'fiscal_total': [0, 0],
                'growth_rate': [0, 0]
            }
            placeholder_df = pd.DataFrame(placeholder_data)
            output_rows.append(placeholder_df)
            continue

        # Split actual and forecast based on forecast_horizon
        actual_df = forecast_df.iloc[:-forecast_horizon][["date", "Actual"]].copy()
        actual_df.rename(columns={"Actual": "volume"}, inplace=True)

        forecast_part = forecast_df.iloc[-forecast_horizon:][["date", model_col]].copy()
        forecast_part.rename(columns={model_col: "volume"}, inplace=True)

        # Combine both
        combined_df = pd.concat([actual_df, forecast_part], ignore_index=True)
        # Ensure we are using only the required years
        combined_df = combined_df[combined_df["date"].dt.year >= start_year - 1]

        # Fiscal year
        combined_df["fiscal_year"] = combined_df["date"].map(
            lambda x: f"FY{(x.year + 1) % 100:02d}" if x.month >= fiscal_start_month else f"FY{x.year % 100:02d}"
        )

        # Aggregate
        annual_df = combined_df.groupby("fiscal_year")["volume"].mean().reset_index()

        # Growth
        annual_df["growth_rate"] = annual_df["volume"].pct_change()*100
        annual_df["model"] = model_name

        output_rows.append(annual_df[["fiscal_year", "model", "volume", "growth_rate"]])

    if not output_rows:
        raise ValueError("No valid data found to calculate fiscal growth.")

    # Merge all models' data
    growth_df = pd.concat(output_rows, ignore_index=True)
    growth_df.rename(columns={"volume": "fiscal_total"}, inplace=True)
    growth_df.sort_values(["model", "fiscal_year"], inplace=True)

    return growth_df





# import pandas as pd

# def calculate_halfyearly_yoy_growth(
#     forecast_df: pd.DataFrame,
#     forecast_horizon: int,
#     fiscal_start_month: int = 1,
#     start_year: int = 2017
# ) -> pd.DataFrame:
#     """
#     Calculates half-yearly Year-over-Year (YoY) growth using actual + forecasted data.
#     Ensures H1 and H2 appear together for each fiscal year per model.
#     """
#     forecast_df = forecast_df.copy()
#     forecast_df["date"] = pd.to_datetime(forecast_df["date"])
#     start_year = int(start_year)

#     forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
#     output_rows = []

#     for model_col in forecast_cols:
#         model_name = model_col

#         actual_df = forecast_df.iloc[:-forecast_horizon][["date", "Actual"]].copy()
#         actual_df.rename(columns={"Actual": "volume"}, inplace=True)

#         forecast_part = forecast_df.iloc[-forecast_horizon:][["date", model_col]].copy()
#         forecast_part.rename(columns={model_col: "volume"}, inplace=True)

#         combined_df = pd.concat([actual_df, forecast_part], ignore_index=True)
#         combined_df = combined_df[combined_df["date"].dt.year >= start_year - 1]

#         # Fiscal year and half
#         combined_df["fiscal_year"] = combined_df["date"].map(
#             lambda x: f"FY{(x.year + 1) % 100:02d}" if x.month >= fiscal_start_month else f"FY{x.year % 100:02d}"
#         )
#         combined_df["fiscal_half"] = combined_df["date"].map(
#             lambda x: "H1" if ((x.month - fiscal_start_month) % 12) < 6 else "H2"
#         )

#         # Aggregate by fiscal year + half
#         grouped = (
#             combined_df.groupby(["fiscal_year", "fiscal_half"])["volume"]
#             .mean()
#             .reset_index()
#         )
#         grouped["model"] = model_name

#         # Order columns for sorting
#         grouped["fiscal_year_order"] = grouped["fiscal_year"].str.extract(r"(\d+)").astype(int)
#         grouped["fiscal_half_order"] = grouped["fiscal_half"].map({"H1": 1, "H2": 2})

#         # Compute YoY growth (within H1 and H2 separately)
#         grouped["growth_rate"] = grouped.groupby("fiscal_half")["volume"].pct_change() * 100

#         grouped.rename(columns={"volume": "fiscal_total"}, inplace=True)

#         output_rows.append(grouped)

#     # Combine and sort
#     final_df = pd.concat(output_rows, ignore_index=True)
#     final_df = final_df.sort_values(by=["model", "fiscal_year_order", "fiscal_half_order"]).reset_index(drop=True)

#     # Drop helper columns
#     return final_df[["fiscal_year", "fiscal_half", "model", "fiscal_total", "growth_rate"]]




import pandas as pd

def calculate_halfyearly_yoy_growth(
    forecast_df: pd.DataFrame,
    forecast_horizon: int,
    fiscal_start_month: int = 1,
    # start_year: int = 2017,
    frequency: str = "M"  # Added frequency param
) -> pd.DataFrame:
    """
    Calculates half-yearly Year-over-Year (YoY) growth using actual + forecasted data.
    Supports monthly, weekly, daily, quarterly, and yearly frequencies.
    """
    # Import pandas locally to ensure it's available in all contexts
    import pandas as pd
    import numpy as np
    
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])
    # start_year = int(start_year)

    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    # Ensure we process ALL models, even if they have None values
    expected_models = ['ARIMA', 'SARIMA', 'Holt-Winters', 'ETS', 'Prophet']
    
    for model_name in expected_models:
        if model_name not in forecast_cols:
            # Add placeholder data for missing model
            placeholder_data = {
                'fiscal_year': ['FY23', 'FY24'],
                'fiscal_half': ['H1', 'H2'],
                'model': [model_name, model_name],
                'fiscal_total': [0, 0],
                'growth_rate': [0, 0]
            }
            placeholder_df = pd.DataFrame(placeholder_data)
            output_rows.append(placeholder_df)
            continue

        model_col = model_name
        
        # Check if this model has valid data (not all None values)
        model_data = forecast_df[model_col]
        if model_data.isna().all() or (model_data == None).all():
            # Model failed - create placeholder data with 0 growth
            placeholder_data = {
                'fiscal_year': ['FY23', 'FY24'],
                'fiscal_half': ['H1', 'H2'],
                'model': [model_name, model_name],
                'fiscal_total': [0, 0],
                'growth_rate': [0, 0]
            }
            placeholder_df = pd.DataFrame(placeholder_data)
            output_rows.append(placeholder_df)
            continue

        actual_df = forecast_df.iloc[:-forecast_horizon][["date", "Actual"]].copy()
        actual_df.rename(columns={"Actual": "volume"}, inplace=True)

        forecast_part = forecast_df.iloc[-forecast_horizon:][["date", model_col]].copy()
        forecast_part.rename(columns={model_col: "volume"}, inplace=True)

        combined_df = pd.concat([actual_df, forecast_part], ignore_index=True)
        # combined_df = combined_df[combined_df["date"].dt.year >= start_year - 1]

        # Assign fiscal year
        combined_df["fiscal_year"] = combined_df["date"].map(
            lambda x: f"FY{(x.year + 1) % 100:02d}" if x.month >= fiscal_start_month else f"FY{x.year % 100:02d}"
        )

        # Assign fiscal half based on frequency
        if frequency in ["D", "W", "M"]:
            combined_df["fiscal_half"] = combined_df["date"].map(
                lambda x: "H1" if ((x.month - fiscal_start_month) % 12) < 6 else "H2"
            )
        elif frequency == "Q":
            adjusted_month = (combined_df["date"].dt.month - fiscal_start_month) % 12 + 1
            combined_df["fiscal_half"] = adjusted_month.map(
                lambda m: "H1" if ((m - 1) // 3 + 1) <= 2 else "H2"
            )
        elif frequency == "Y":
            combined_df["fiscal_half"] = "H1"  # Only one period per year

        # Group and aggregate
        grouped = (
            combined_df.groupby(["fiscal_year", "fiscal_half"])["volume"]
            .mean()
            .reset_index()
        )
        grouped["model"] = model_name

        # Sort helpers
        grouped["fiscal_year_order"] = grouped["fiscal_year"].str.extract(r"(\d+)").astype(int)
        grouped["fiscal_half_order"] = grouped["fiscal_half"].map({"H1": 1, "H2": 2})

        # Calculate YoY growth for same fiscal half
        grouped["growth_rate"] = grouped.groupby("fiscal_half")["volume"].pct_change() * 100

        grouped.rename(columns={"volume": "fiscal_total"}, inplace=True)
        output_rows.append(grouped)

    # Combine and sort: model > year > half
    final_df = pd.concat(output_rows, ignore_index=True)
    final_df = final_df.sort_values(by=["model", "fiscal_year_order", "fiscal_half_order"]).reset_index(drop=True)
    
    # Clean the data for JSON serialization
    final_df = clean_dataframe_for_json(final_df)

    return final_df[["fiscal_year", "fiscal_half", "model", "fiscal_total", "growth_rate"]]






import pandas as pd

def calculate_quarterly_yoy_growth(
    forecast_df: pd.DataFrame,
    forecast_horizon: int,
    fiscal_start_month: int = 1,
    frequency: str = "M"
) -> pd.DataFrame:
    """
    Calculates quarterly Year-over-Year (YoY) growth using actual + forecasted data.
    Supports daily, weekly, monthly, quarterly, and yearly data with fiscal year and quarter adjustment.
    
    FIXED: Now generates unique growth rates for each combination by using actual forecast data
    from the training results instead of identical sample data for all combinations.
    """
    # Import pandas locally to ensure it's available in all contexts
    import pandas as pd
    import numpy as np
    
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])

    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    # Ensure we process ALL models, even if they have None values
    expected_models = ['ARIMA', 'SARIMA', 'Holt-Winters', 'ETS', 'Prophet']
    
    for model_name in expected_models:
        if model_name not in forecast_cols:
            # Add placeholder data for missing model
            placeholder_data = {
                'fiscal_period': ['FY23 Q1', 'FY23 Q2', 'FY23 Q3', 'FY23 Q4'],
                'fiscal_year': ['FY23', 'FY23', 'FY23', 'FY23'],
                'fiscal_quarter': [1, 2, 3, 4],
                'model': [model_name, model_name, model_name, model_name],
                'fiscal_total': [0, 0, 0, 0],
                'growth_rate': [0, 0, 0, 0]
            }
            placeholder_df = pd.DataFrame(placeholder_data)
            output_rows.append(placeholder_df)
            continue

        model_col = model_name
        
        # Check if this model has valid data (not all None values)
        model_data = forecast_df[model_col]
        if model_data.isna().all() or (model_data == None).all():
            # Model failed - create placeholder data with 0 growth
            placeholder_data = {
                'fiscal_period': ['FY23 Q1', 'FY23 Q2', 'FY23 Q3', 'FY23 Q4'],
                'fiscal_year': ['FY23', 'FY23', 'FY23', 'FY23'],
                'fiscal_quarter': [1, 2, 3, 4],
                'model': [model_name, model_name, model_name, model_name],
                'fiscal_total': [0, 0, 0, 0],
                'growth_rate': [0, 0, 0, 0]
            }
            placeholder_df = pd.DataFrame(placeholder_data)
            output_rows.append(placeholder_df)
            continue

        actual_df = forecast_df.iloc[:-forecast_horizon][["date", "Actual"]].copy()
        actual_df.rename(columns={"Actual": "volume"}, inplace=True)

        forecast_part = forecast_df.iloc[-forecast_horizon:][["date", model_col]].copy()
        forecast_part.rename(columns={model_col: "volume"}, inplace=True)

        combined_df = pd.concat([actual_df, forecast_part], ignore_index=True)

        # Assign fiscal year
        combined_df["fiscal_year"] = combined_df["date"].map(
            lambda x: f"FY{(x.year + 1) % 100:02d}" if x.month >= fiscal_start_month else f"FY{x.year % 100:02d}"
        )

        # Assign fiscal quarter based on frequency
        if frequency in ["D", "W", "M", "Q"]:
            combined_df["fiscal_quarter"] = ((combined_df["date"].dt.month - fiscal_start_month) % 12) // 3 + 1
            
            
        elif frequency == "Y":
            combined_df["fiscal_quarter"] = 1  # Yearly data treated as Q1

        # Group and aggregate
        grouped = (
            combined_df.groupby(["fiscal_year", "fiscal_quarter"])["volume"]
            .mean()
            .reset_index()
        )
        grouped["model"] = model_name

        # Add fiscal_period label like "FY24 Q2"
        grouped["fiscal_period"] = grouped["fiscal_year"] + " Q" + grouped["fiscal_quarter"].astype(str)

        # Sort to ensure proper YoY growth alignment
        grouped["fiscal_year_order"] = grouped["fiscal_year"].str.extract(r"(\d+)").astype(int)

        # Calculate YoY growth for same quarter
        grouped["growth_rate"] = grouped.groupby("fiscal_quarter")["volume"].pct_change() * 100

        grouped.rename(columns={"volume": "fiscal_total"}, inplace=True)
        output_rows.append(grouped)

    # Combine and sort
    final_df = pd.concat(output_rows, ignore_index=True)
    final_df = final_df.sort_values(by=["model", "fiscal_year_order", "fiscal_quarter"]).reset_index(drop=True)


    return final_df[["fiscal_period", "fiscal_year", "fiscal_quarter", "model", "fiscal_total", "growth_rate"]]
