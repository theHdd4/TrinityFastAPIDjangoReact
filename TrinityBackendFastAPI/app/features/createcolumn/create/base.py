import pandas as pd
import numpy as np
import statsmodels.api as sm
from statsmodels.tsa.seasonal import STL

def identify_columns_from_user(identifiers, measures, df):
    id_cols = [col for col in identifiers if col in df.columns]
    ms_cols = [col for col in measures if col in df.columns and pd.api.types.is_numeric_dtype(df[col])]
    return id_cols, ms_cols


def calculate_residuals(df, y_var, x_vars):
    try:
        X = df[x_vars]
        y = df[y_var]

        if X.shape[0] < 2:
            raise Exception("Residual calculation requires at least 2 rows in each group.")

        X = (X - X.mean()) / X.std()
        X = sm.add_constant(X)

        # Remove rows with NaN or inf in X or y
        mask = (
            ~X.isnull().any(axis=1) &
            ~y.isnull() &
            np.isfinite(X).all(axis=1) &
            np.isfinite(y)
        )
        X_clean = X[mask]
        y_clean = y[mask]

        if X_clean.shape[0] == 0:
            raise Exception("No valid rows left after removing NaN/inf for residual calculation.")

        model = sm.OLS(y_clean, X_clean).fit()

        residuals = model.resid + y_clean.mean()
        rsquared = model.rsquared

        return residuals, rsquared
    except Exception as e:
        raise Exception(f"Residual calculation failed: {str(e)}")



def compute_rpi(df, pivot_keys):

    if "PPU" not in df.columns:
        raise ValueError("PPU column not found. Ensure 'PPU' exists before RPI computation.")

    # if not columns:
    #     raise ValueError("Pivot keys must be provided for RPI operation.")
    
    # pivot_keys = columns
    d_date = next((c for c in df.columns if c.strip().lower() == 'date'), None)
    d_channel = next((c for c in df.columns if c.strip().lower() == 'channel'), 'Channel')
    if not d_date:
        raise ValueError("Date column not found in data.")

    pivot_df = df.pivot_table(index=[d_date, d_channel], columns=pivot_keys, values='PPU')

    df = pd.concat([df.set_index([d_date, d_channel]), pivot_df], axis=1).reset_index()

    if isinstance(pivot_df.columns, pd.MultiIndex):
        for col_tuple in pivot_df.columns:
            comp_col = "_".join(map(str, col_tuple)) + "_PPU"
            df[comp_col] = df[col_tuple]
            cond = True
            for i, key in enumerate(pivot_keys):
                cond &= (df[key] == col_tuple[i])
            df.loc[cond, comp_col] = np.nan
    else:
        for val in pivot_df.columns:
            comp_col = f"{val}_PPU"
            df[comp_col] = df[val]
            cond = (df[pivot_keys[0]] == val)
            df.loc[cond, comp_col] = np.nan

    try:
        df.drop(columns=pivot_df.columns, inplace=True)
    except Exception as e:
        pass  # Silent fail or log warning as needed

    # rename to RPI and compute own_ppu / competitor_ppu
    df.columns = [
        c.replace('_PPU','_RPI') if isinstance(c, str) and c.endswith('_PPU') else c
        for c in df.columns
    ]

    own_ppu = df["PPU"]
    for col in df.columns:
        if isinstance(col, str) and col.endswith('_RPI') and col != "PPU_RPI":
            df[col] = np.where(df[col] != 0, own_ppu / df[col], 0)

    new_col = [c for c in df.columns if isinstance(c, str) and c.endswith("_RPI") and c != "PPU_RPI"]
    return df, new_col






def apply_stl_outlier(df, columns):

    d_date = next((c for c in df.columns if c.strip().lower() == 'date'), None)
    d_channel = next((c for c in df.columns if c.strip().lower() == 'channel'), 'Channel')
    if not d_date or d_date not in df.columns:
        raise ValueError("Date column not found in data.")
    df[d_date] = pd.to_datetime(df[d_date], errors='coerce')
    outlier_keys = [d_channel] + (columns or [])

    final_df = df.copy().set_index(d_date)
    final_df[['residual', 'z_score_residual', 'is_outlier']] = np.nan, np.nan, 0

    for name, grp in final_df.groupby(outlier_keys):
        if len(grp) < 2:
            continue
        grp0 = grp.reset_index()
        try:
            res = STL(grp0['Volume'], seasonal=13, period=13).fit()
            grp0['residual'] = res.resid
            grp0['z_score_residual'] = (
                (grp0['residual'] - grp0['residual'].mean()) / grp0['residual'].std()
            )
            grp0['is_outlier'] = (grp0['z_score_residual'].abs() > 3).astype(int)

            for _, row in grp0.iterrows():
                dt = row[d_date]
                final_df.at[dt, 'residual'] = row['residual']
                final_df.at[dt, 'z_score_residual'] = row['z_score_residual']
                final_df.at[dt, 'is_outlier'] = row['is_outlier']
        except Exception as e:
            print(f"STL failed for {name}: {e}")

    final_df.reset_index(inplace=True)
    final_df.sort_values(by=d_date, inplace=True)

    # df = final_df

    df = final_df.drop(columns=["residual", "z_score_residual"], errors="ignore")

    
    new_col = 'is_outlier'


    return df, 'is_outlier'



