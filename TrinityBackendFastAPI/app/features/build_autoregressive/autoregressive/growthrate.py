import pandas as pd

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


def calculate_halfyearly_yoy_growth(
    forecast_df: pd.DataFrame,
    forecast_horizon: int,
    fiscal_start_month: int = 1,
    frequency: str = "M"  # Added frequency param
) -> pd.DataFrame:
    """
    Calculates half-yearly Year-over-Year (YoY) growth using actual + forecasted data.
    Supports monthly, weekly, daily, quarterly, and yearly frequencies.
    """
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])

    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    for model_col in forecast_cols:
        model_name = model_col

        actual_df = forecast_df.iloc[:-forecast_horizon][["date", "Actual"]].copy()
        actual_df.rename(columns={"Actual": "volume"}, inplace=True)

        forecast_part = forecast_df.iloc[-forecast_horizon:][["date", model_col]].copy()
        forecast_part.rename(columns={model_col: "volume"}, inplace=True)

        combined_df = pd.concat([actual_df, forecast_part], ignore_index=True)

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


def calculate_quarterly_yoy_growth(
    forecast_df: pd.DataFrame,
    forecast_horizon: int,
    fiscal_start_month: int = 1,
    frequency: str = "M"
) -> pd.DataFrame:
    """
    Calculates quarterly Year-over-Year (YoY) growth using actual + forecasted data.
    Supports daily, weekly, monthly, quarterly, and yearly data with fiscal year and quarter adjustment.
    """
    forecast_df = forecast_df.copy()
    forecast_df["date"] = pd.to_datetime(forecast_df["date"])

    forecast_cols = [col for col in forecast_df.columns if col not in ["date", "Actual"]]
    output_rows = []

    for model_col in forecast_cols:
        model_name = model_col

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
