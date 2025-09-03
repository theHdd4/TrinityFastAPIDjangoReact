import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.exponential_smoothing.ets import ETSModel
from prophet import Prophet
from sklearn.metrics import mean_squared_error, mean_absolute_error
import warnings
from sklearn.metrics import mean_absolute_percentage_error

warnings.filterwarnings("ignore")

def get_arima_params(frequency):
    params = {
        'M': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 12)},
        'Q': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 4)},
        'D': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 7)},
        'W': {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 52)},
        'Y': {'order': (1, 1, 1), 'seasonal_order': None}
    }
    return params.get(frequency, {'order': (1, 1, 1), 'seasonal_order': (1, 1, 1, 12)})

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
    # Check if data exists
    if df.empty:
        return {
            "status": "FAILURE",
            "error": f"No data found for combination: {combination}"
        }

    # Check and set datetime index
    if 'date' not in df.columns:
        return {
            "status": "FAILURE",
            "error": "The 'date' column is required in the data"
        }

    # Convert and set index
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    df = df.dropna(subset=['date'])
    df = df.set_index('date').sort_index()

    # Ensure target column exists
    if y_var not in df.columns:
        return {
            "status": "FAILURE",
            "error": f"The target variable '{y_var}' is not in the data"
        }

    y_series = pd.to_numeric(df[y_var], errors='coerce')
    y_series = y_series.resample(frequency).mean().ffill().dropna()

    # Final check
    if y_series.empty:
        return {
            "status": "FAILURE",
            "error": f"No valid data found for target variable '{y_var}' after cleaning"
        }

    seasonal_periods = {'D': 7, 'W': 52, 'Q': 4, 'Y': 1, 'M': 12}.get(frequency, 12)
    
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
        'forecast_df': None,
        'metrics': {},
        'model_params': {},
        'combination': combination,
        'models_run': models_to_run
    }

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



    # def safe_mape(actual, predicted, min_actual_threshold=100):  # Use 100 instead of 1e-3
    #     actual = np.array(actual)
    #     predicted = np.array(predicted)
    #     mask = (np.abs(actual) > min_actual_threshold) & ~np.isnan(actual) & ~np.isnan(predicted)
    #     if mask.sum() == 0:
    #         return None
    #     return np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100

    def safe_mape(actual, predicted):
        mask = (actual != 0) & ~np.isnan(actual) & ~np.isnan(predicted)
        if mask.sum() == 0:
            return None
        return np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100

    

    print("Min actual:", y_series.min(), "Max actual:", y_series.max())


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
            # 'mean_absolute_percentage_error':mean_absolute_percentage_error(actual, fitted_vals) * 100
        }
        results['metrics'][model_name] = metrics
        return metrics


    # ARIMA
    if 'ARIMA' in models_to_run:
        try:
            freq_params = get_arima_params(frequency)
            arima_order = freq_params['order']
            arima_model = ARIMA(y_series, order=arima_order).fit()
            arima_forecast = arima_model.forecast(steps=forecast_horizon)
            arima_fitted = arima_model.predict(start=y_series.index[0], end=y_series.index[-1])
            df_results['ARIMA'] = list(arima_fitted) + list(arima_forecast)
            results['model_params']['ARIMA'] = {'order': arima_order}
            fitted_series = pd.Series(arima_fitted, index=y_series.index)
            calculate_metrics(y_series, fitted_series, 'ARIMA')
        except Exception as e:
            df_results['ARIMA'] = [None] * len(df_results)
    else:
        df_results['ARIMA'] = [None] * len(df_results)

    # SARIMA
    if 'SARIMA' in models_to_run:
        try:
            if len(y_series) >= 2 * seasonal_periods and y_series.nunique() > 1:
                sarima_order = freq_params['order']
                seasonal_order = freq_params['seasonal_order']
                sarima_model = SARIMAX(y_series, order=sarima_order, seasonal_order=seasonal_order).fit()
                sarima_forecast = sarima_model.forecast(steps=forecast_horizon)
                sarima_fitted = sarima_model.predict(start=y_series.index[0], end=y_series.index[-1])
                df_results['SARIMA'] = list(sarima_fitted) + list(sarima_forecast)
                results['model_params']['SARIMA'] = {'order': sarima_order, 'seasonal_order': seasonal_order}
                fitted_series = pd.Series(sarima_fitted, index=y_series.index)
                calculate_metrics(y_series, fitted_series, 'SARIMA')
            else:
                df_results['SARIMA'] = [None] * len(df_results)
        except Exception as e:
            df_results['SARIMA'] = [None] * len(df_results)
    else:
        df_results['SARIMA'] = [None] * len(df_results)

    # Holt-Winters
    if 'Holt-Winters' in models_to_run:
        try:
            if len(y_series) >= 2 * seasonal_periods and y_series.nunique() > 1:
                hw_model = ExponentialSmoothing(y_series, trend="add", seasonal="add",
                                                seasonal_periods=seasonal_periods).fit()
                hw_forecast = hw_model.forecast(steps=forecast_horizon)
                hw_fitted = hw_model.fittedvalues
                df_results['Holt-Winters'] = list(hw_fitted) + list(hw_forecast)
                results['model_params']['Holt-Winters'] = {
                    'trend': 'add',
                    'seasonal': 'add',
                    'seasonal_periods': seasonal_periods
                }
                fitted_series = pd.Series(hw_fitted, index=y_series.index)
                calculate_metrics(y_series, fitted_series, 'Holt-Winters')
            else:
                df_results['Holt-Winters'] = [None] * len(df_results)
        except Exception as e:
            df_results['Holt-Winters'] = [None] * len(df_results)
    else:
        df_results['Holt-Winters'] = [None] * len(df_results)

    # ETS
    if 'ETS' in models_to_run:
        try:
            if len(y_series) >= 2 * seasonal_periods:
                ets_model = ETSModel(y_series, error='add', trend='add', seasonal='add',
                                     seasonal_periods=seasonal_periods,
                                     initialization_method='estimated').fit()
            else:
                ets_model = ETSModel(y_series, error='add', trend='add', seasonal=None,
                                     initialization_method='estimated').fit()
            ets_forecast = ets_model.forecast(steps=forecast_horizon)
            ets_fitted = ets_model.fittedvalues
            df_results['ETS'] = list(ets_fitted) + list(ets_forecast)
            results['model_params']['ETS'] = {
                'error': 'add',
                'trend': 'add',
                'seasonal': 'add' if len(y_series) >= 2 * seasonal_periods else None,
                'seasonal_periods': seasonal_periods if len(y_series) >= 2 * seasonal_periods else None
            }
            fitted_series = pd.Series(ets_fitted, index=y_series.index)
            calculate_metrics(y_series, fitted_series, 'ETS')
        except Exception as e:
            df_results['ETS'] = [None] * len(df_results)
    else:
        df_results['ETS'] = [None] * len(df_results)

    # Prophet
    if 'Prophet' in models_to_run:
        try:
            df_prophet = pd.DataFrame({
                'ds': y_series.index,
                'y': y_series.values
            })
            prophet_model = Prophet()
            prophet_model.fit(df_prophet)
            future = prophet_model.make_future_dataframe(periods=forecast_horizon, freq=frequency)
            forecast = prophet_model.predict(future)
            fitted = forecast["yhat"].values[:len(y_series)]
            future_forecast = forecast["yhat"].values[-forecast_horizon:]
            df_results['Prophet'] = list(fitted) + list(future_forecast)
            results['model_params']['Prophet'] = {}
            fitted_series = pd.Series(fitted, index=y_series.index)
            calculate_metrics(y_series, fitted_series, 'Prophet')
        except Exception as e:
            df_results['Prophet'] = [None] * len(df_results)
    else:
        df_results['Prophet'] = [None] * len(df_results)

    results['forecast_df'] = df_results
    return results



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
    """
    # Ensure start_year is integer
    start_year = int(start_year)
    
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])

    # List of model columns (excluding 'date' and 'Actual')
    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    if len(forecast_cols) == 0:
        raise ValueError("No model forecast columns found in forecast_df.")

    for model_col in forecast_cols:
        model_name = model_col

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

        # # Aggregate
        # if frequency in ["D", "W", "M", "Q"]:
        #     annual_df = combined_df.groupby("fiscal_year")["volume"].mean().reset_index()
        # else:
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
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])
    # start_year = int(start_year)

    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    for model_col in forecast_cols:
        model_name = model_col

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

    return final_df[["fiscal_year", "fiscal_half", "model", "fiscal_total", "growth_rate"]]






import pandas as pd

def calculate_quarterly_yoy_growth(
    forecast_df: pd.DataFrame,
    forecast_horizon: int,
    fiscal_start_month: int = 1,
    # start_year: int = 2017,
    frequency: str = "M"
) -> pd.DataFrame:
    """
    Calculates quarterly Year-over-Year (YoY) growth using actual + forecasted data.
    Supports daily, weekly, monthly, quarterly, and yearly data with fiscal year and quarter adjustment.
    """
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])
    # start_year = int(start_year)

    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    for model_col in forecast_cols:
        model_name = model_col

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
