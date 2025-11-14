from __future__ import annotations

import ast
import json
import math
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Mapping

import numpy as np
import pandas as pd


class FormulaEvaluationError(Exception):
    """Raised when an Excel-like formula cannot be parsed or evaluated."""


@dataclass(frozen=True)
class _SanitisedExpression:
    expression: str
    column_mapping: Dict[str, str]


class _FormulaAstValidator(ast.NodeVisitor):
    """Restrict the Python AST produced from the sanitised expression."""

    _allowed_bin_ops = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.Mod)
    _allowed_unary_ops = (ast.UAdd, ast.USub)

    def __init__(self, allowed_names: Iterable[str], allowed_functions: Iterable[str]) -> None:
        self.allowed_names = set(allowed_names)
        self.allowed_functions = set(allowed_functions)

    # ------------------------------------------------------------------ Visitors
    def visit(self, node: ast.AST) -> Any:  # type: ignore[override]
        method = "visit_" + node.__class__.__name__
        visitor = getattr(self, method, self.generic_visit)
        return visitor(node)

    def visit_Expression(self, node: ast.Expression) -> Any:
        return self.visit(node.body)

    def visit_BinOp(self, node: ast.BinOp) -> Any:
        if not isinstance(node.op, self._allowed_bin_ops):
            raise FormulaEvaluationError(f"Operator '{ast.dump(node.op)}' is not supported.")
        self.visit(node.left)
        self.visit(node.right)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> Any:
        if not isinstance(node.op, self._allowed_unary_ops):
            raise FormulaEvaluationError("Only unary plus/minus are supported.")
        self.visit(node.operand)

    def visit_Name(self, node: ast.Name) -> Any:
        if node.id not in self.allowed_names and node.id not in self.allowed_functions:
            raise FormulaEvaluationError(f"Unknown identifier '{node.id}'.")

    def visit_Call(self, node: ast.Call) -> Any:
        if not isinstance(node.func, ast.Name):
            raise FormulaEvaluationError("Only simple function calls are supported.")
        func_name = node.func.id
        if func_name not in self.allowed_functions:
            raise FormulaEvaluationError(f"Function '{func_name}' is not supported.")
        for arg in node.args:
            self.visit(arg)
        for kw in node.keywords:
            if kw.arg is None:
                raise FormulaEvaluationError("Keyword unpacking is not supported.")
            self.visit(kw.value)

    def visit_Constant(self, node: ast.Constant) -> Any:  # Python 3.8+
        return node.value

    def visit_Num(self, node: ast.Num) -> Any:  # pragma: no cover - Py<3.8 compatibility
        return node.n

    def visit_List(self, node: ast.List) -> Any:
        for elt in node.elts:
            self.visit(elt)

    def visit_Tuple(self, node: ast.Tuple) -> Any:
        for elt in node.elts:
            self.visit(elt)

    def visit_Dict(self, node: ast.Dict) -> Any:
        for key in node.keys:
            if key is not None:
                self.visit(key)
        for value in node.values:
            self.visit(value)

    def visit_Subscript(self, _) -> Any:
        raise FormulaEvaluationError("Subscripting is not supported in formulas.")

    def visit_Attribute(self, _) -> Any:
        raise FormulaEvaluationError("Attribute access is not supported in formulas.")

    def visit_Lambda(self, _) -> Any:  # pragma: no cover - sanity guard
        raise FormulaEvaluationError("Lambda expressions are not supported.")


class _FunctionRegistry:
    """Vectorised implementations for Excel-like functions used in formulas."""

    def __init__(self, frame: pd.DataFrame) -> None:
        self.frame = frame
        self.index = frame.index
        self.length = len(frame.index)

    # ------------------------------------------------------------------ Helpers
    def _to_series(self, value: Any, *, allow_length_mismatch: bool = False) -> pd.Series:
        if isinstance(value, pd.Series):
            # Reindex to align with the source dataframe
            return value.reindex(self.index)
        if isinstance(value, (np.ndarray, list, tuple)):
            arr = np.asarray(value, dtype=object)
            if arr.ndim == 0:
                return pd.Series([arr.item()] * self.length, index=self.index)
            if allow_length_mismatch and len(arr) != self.length:
                return pd.Series(arr, index=range(len(arr)))
            if len(arr) != self.length:
                raise FormulaEvaluationError(
                    f"Expected a sequence of length {self.length}, received {len(arr)}."
                )
            return pd.Series(arr, index=self.index)
        if pd.api.types.is_scalar(value):
            return pd.Series([value] * self.length, index=self.index)
        raise FormulaEvaluationError(f"Unsupported value type '{type(value).__name__}'.")

    def _as_scalar(self, value: Any) -> float | int | str | None:
        if isinstance(value, pd.Series):
            # Reduce series to scalar by dropping missing values
            non_null = value.dropna()
            return non_null.iloc[0] if not non_null.empty else None
        if isinstance(value, np.ndarray):
            arr = np.asarray(value)
            if arr.ndim == 0:
                return arr.item()
            raise FormulaEvaluationError("Expected scalar value, received an array.")
        if isinstance(value, (list, tuple)):
            raise FormulaEvaluationError("Expected scalar value, received a sequence.")
        return value  # scalar or None

    def _to_numeric_series(self, value: Any) -> pd.Series:
        series = self._to_series(value)
        numeric = pd.to_numeric(series, errors="coerce")
        return numeric

    def _scalar_to_int(self, value: Any, default: int = 0) -> int:
        scalar = self._as_scalar(value)
        if scalar is None:
            return default
        try:
            return int(float(scalar))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _clean_mapping(mapping: Any) -> Dict[Any, Any]:
        if isinstance(mapping, Mapping):
            return dict(mapping)
        if isinstance(mapping, str):
            try:
                return json.loads(mapping)
            except json.JSONDecodeError as exc:
                raise FormulaEvaluationError("MAP requires a JSON-like dictionary.") from exc
        raise FormulaEvaluationError("MAP requires a dictionary mapping.")

    @staticmethod
    def _clean_bins(bins: Any) -> Iterable[float]:
        if isinstance(bins, str):
            try:
                bins = json.loads(bins)
            except json.JSONDecodeError as exc:
                raise FormulaEvaluationError("BIN requires a list of numeric boundaries.") from exc
        if isinstance(bins, (list, tuple, np.ndarray, pd.Series)):
            try:
                return [float(b) for b in bins]
            except (TypeError, ValueError) as exc:
                raise FormulaEvaluationError("BIN boundaries must be numeric.") from exc
        raise FormulaEvaluationError("BIN requires an iterable of numeric boundaries.")

    # ------------------------------------------------------------------ Public vectorised functions
    def func_sum(self, *values: Any) -> Any:
        if not values:
            raise FormulaEvaluationError("SUM requires at least one argument.")
        if len(values) == 1:
            value = values[0]
            if isinstance(value, pd.Series):
                return value.sum(skipna=True)
            return self._as_scalar(value)
        result = self._to_series(values[0]).astype(float)
        for val in values[1:]:
            result = result.add(self._to_series(val).astype(float), fill_value=0.0)
        return result

    def func_avg(self, *values: Any) -> Any:
        if not values:
            raise FormulaEvaluationError("AVG requires at least one argument.")
        if len(values) == 1:
            value = values[0]
            if isinstance(value, pd.Series):
                return value.mean(skipna=True)
            return self._as_scalar(value)
        stacked = [self._to_series(v).astype(float) for v in values]
        summed = sum(stacked)
        return summed / len(stacked)

    def func_max(self, *values: Any) -> Any:
        if not values:
            raise FormulaEvaluationError("MAX requires at least one argument.")
        if len(values) == 1:
            value = values[0]
            if isinstance(value, pd.Series):
                return value.max(skipna=True)
            return self._as_scalar(value)
        result = self._to_series(values[0])
        for val in values[1:]:
            result = pd.concat([result, self._to_series(val)], axis=1).max(axis=1, skipna=True)
        return result

    def func_min(self, *values: Any) -> Any:
        if not values:
            raise FormulaEvaluationError("MIN requires at least one argument.")
        if len(values) == 1:
            value = values[0]
            if isinstance(value, pd.Series):
                return value.min(skipna=True)
            return self._as_scalar(value)
        result = self._to_series(values[0])
        for val in values[1:]:
            result = pd.concat([result, self._to_series(val)], axis=1).min(axis=1, skipna=True)
        return result

    def func_prod(self, *values: Any) -> Any:
        if not values:
            raise FormulaEvaluationError("PROD requires at least one argument.")
        result = self._to_series(values[0]).astype(float)
        for val in values[1:]:
            result = result * self._to_series(val).astype(float)
        return result

    def func_div(self, *values: Any) -> Any:
        if not values:
            raise FormulaEvaluationError("DIV requires at least one argument.")
        result = self._to_series(values[0]).astype(float)
        for val in values[1:]:
            if pd.api.types.is_scalar(val):
                if val == 0:
                    continue
                result = result / float(val)
            else:
                denominator = self._to_series(val).astype(float)
                safe_denominator = denominator.where(denominator != 0, 1.0)
                result = result / safe_denominator
        return result

    def func_median(self, value: Any) -> Any:
        series = self._to_series(value)
        try:
            return series.median(skipna=True)
        except Exception as exc:
            raise FormulaEvaluationError("MEDIAN requires numeric input.") from exc

    def func_percentile(self, value: Any, quantile: Any) -> Any:
        series = self._to_series(value)
        if isinstance(quantile, pd.Series):
            raise FormulaEvaluationError("PERCENTILE quantile must be a scalar between 0 and 1.")
        try:
            q = float(quantile)
        except (TypeError, ValueError) as exc:
            raise FormulaEvaluationError("PERCENTILE quantile must be numeric.") from exc
        if q < 0 or q > 1:
            raise FormulaEvaluationError("PERCENTILE quantile must be between 0 and 1.")
        try:
            return series.quantile(q, interpolation="linear")
        except Exception as exc:
            raise FormulaEvaluationError("PERCENTILE requires numeric input.") from exc

    def func_std(self, value: Any) -> Any:
        series = self._to_series(value).astype(float)
        return float(series.std(skipna=True, ddof=0))

    def func_var(self, value: Any) -> Any:
        series = self._to_series(value).astype(float)
        return float(series.var(skipna=True, ddof=0))

    def func_cov(self, value1: Any, value2: Any) -> Any:
        series1 = self._to_series(value1).astype(float)
        series2 = self._to_series(value2).astype(float)
        try:
            return float(series1.cov(series2, min_periods=1))
        except Exception as exc:
            raise FormulaEvaluationError("COV requires numeric inputs.") from exc

    def func_corr(self, value1: Any, value2: Any) -> Any:
        series1 = self._to_series(value1).astype(float)
        series2 = self._to_series(value2).astype(float)
        try:
            return float(series1.corr(series2, min_periods=1))
        except Exception as exc:
            raise FormulaEvaluationError("CORR requires numeric inputs.") from exc

    def func_cumsum(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype(float)
        return series.cumsum()

    def func_cumprod(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype(float)
        return series.cumprod()

    def func_cummax(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype(float)
        return series.cummax()

    def func_cummin(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype(float)
        return series.cummin()

    def func_diff(self, value: Any, periods: Any = 1) -> pd.Series:
        series = self._to_series(value).astype(float)
        try:
            lag = int(periods)
        except (TypeError, ValueError) as exc:
            raise FormulaEvaluationError("DIFF periods must be an integer.") from exc
        return series.diff(lag)

    def func_pct_change(self, value: Any, periods: Any = 1) -> pd.Series:
        series = self._to_series(value).astype(float)
        try:
            lag = int(periods)
        except (TypeError, ValueError) as exc:
            raise FormulaEvaluationError("PCT_CHANGE periods must be an integer.") from exc
        result = series.pct_change(lag)
        result = result.replace([np.inf, -np.inf], np.nan)
        return result

    def func_lag(self, value: Any, periods: Any = 1) -> pd.Series:
        series = self._to_series(value)
        try:
            lag = int(periods)
        except (TypeError, ValueError) as exc:
            raise FormulaEvaluationError("LAG periods must be an integer.") from exc
        return series.shift(lag)

    def func_count(self, value: Any) -> Any:
        series = self._to_series(value)
        return int(series.count())

    def func_round(self, value: Any, digits: Any = 0) -> Any:
        if isinstance(digits, pd.Series):
            digits = digits.fillna(0).astype(int)
        elif not pd.api.types.is_scalar(digits):
            raise FormulaEvaluationError("ROUND digits argument must be a scalar.")
        try:
            precision = int(digits)
        except (TypeError, ValueError) as exc:
            raise FormulaEvaluationError("ROUND digits argument must be an integer.") from exc

        if isinstance(value, pd.Series):
            return value.round(precision)
        if isinstance(value, (np.ndarray, list, tuple)):
            return np.round(value, precision)
        if value is None:
            return None
        return round(float(value), precision)

    def func_zscore(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype(float)
        mean = series.mean(skipna=True)
        std = series.std(skipna=True, ddof=0)
        if std is None or std == 0 or np.isclose(std, 0.0):
            return pd.Series([0.0 if not pd.isna(v) else None for v in series], index=self.index)
        return (series - mean) / std

    def func_norm(self, value: Any) -> pd.Series:
        return self.func_zscore(value)

    def func_fillna(self, value: Any, replacement: Any) -> pd.Series:
        series = self._to_series(value)
        if isinstance(replacement, pd.Series):
            replacement = replacement.reindex(self.index)
        return series.fillna(replacement)

    def func_map(self, value: Any, mapping: Any) -> pd.Series:
        series = self._to_series(value)
        mapping_dict = self._clean_mapping(mapping)
        result = series.map(lambda x: mapping_dict.get(x, mapping_dict.get(str(x), x)))
        return result

    def func_bin(self, value: Any, bins: Any) -> pd.Series:
        series = self._to_series(value).astype(float)
        edges = sorted(self._clean_bins(bins))
        if len(edges) < 2:
            raise FormulaEvaluationError("BIN requires at least two boundaries.")
        cut = pd.cut(series, bins=edges, right=False, include_lowest=True)
        result = cut.astype(str)
        below = series < edges[0]
        above = series >= edges[-1]
        result = result.where(~below, f"<{edges[0]}")
        result = result.where(~above, f">={edges[-1]}")
        return result

    def func_date_diff(self, end_value: Any, start_value: Any) -> pd.Series:
        end_series = pd.to_datetime(self._to_series(end_value), errors="coerce")
        start_series = pd.to_datetime(self._to_series(start_value), errors="coerce")
        delta = end_series - start_series
        return delta.dt.days

    def func_abs(self, value: Any) -> pd.Series:
        series = self._to_numeric_series(value)
        return series.abs()

    def func_floor(self, value: Any) -> pd.Series:
        series = self._to_numeric_series(value)
        return np.floor(series)

    def func_ceil(self, value: Any) -> pd.Series:
        series = self._to_numeric_series(value)
        return np.ceil(series)

    def func_exp(self, value: Any) -> pd.Series:
        series = self._to_numeric_series(value)
        return np.exp(series)

    def func_log(self, value: Any) -> pd.Series:
        series = self._to_numeric_series(value)
        safe = series.where(series > 0)
        return np.log(safe)

    def func_sqrt(self, value: Any) -> pd.Series:
        series = self._to_numeric_series(value)
        safe = series.where(series >= 0)
        return np.sqrt(safe)

    def func_if(self, condition: Any, true_value: Any, false_value: Any) -> pd.Series:
        cond_series = self._to_series(condition).astype(bool)
        true_series = self._to_series(true_value)
        false_series = self._to_series(false_value)
        return true_series.where(cond_series, false_series)

    def func_isnull(self, value: Any) -> pd.Series:
        series = self._to_series(value)
        string_series = series.astype("string")
        blank_mask = string_series.str.strip().eq("").fillna(False)
        return series.isna() | blank_mask

    def func_lower(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype("string")
        return series.str.lower()

    def func_upper(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype("string")
        return series.str.upper()

    def func_len(self, value: Any) -> pd.Series:
        series = self._to_series(value).astype("string")
        result = series.str.len()
        return result.fillna(0).astype(int)

    def func_substr(self, value: Any, start: Any, end: Any | None = None) -> pd.Series:
        series = self._to_series(value).astype("string")
        start_idx = self._scalar_to_int(start, 0)
        end_idx = None
        scalar_end = self._as_scalar(end)
        if scalar_end is not None:
            try:
                end_idx = int(float(scalar_end))
            except (TypeError, ValueError):
                end_idx = None
        return series.str.slice(start_idx, end_idx)

    def func_str_replace(self, value: Any, old: Any, new: Any) -> pd.Series:
        series = self._to_series(value).astype("string")
        replacement_series = self._to_series(new).astype("string")
        old_scalar = "" if old is None else str(old)

        if old_scalar == "":
            mask = series.isna() | series.str.strip().eq("").fillna(False)
            return series.where(~mask, replacement_series)

        def _replace(val: Any, rep: Any) -> Any:
            if val is None or (isinstance(val, float) and math.isnan(val)):
                return val
            text = str(val)
            if pd.isna(rep):
                replacement_text = ""
            else:
                replacement_text = str(rep)
            return text.replace(old_scalar, replacement_text)

        if isinstance(new, (pd.Series, list, tuple, np.ndarray)):
            return series.combine(replacement_series, _replace)

        replacement_text = "" if new is None else str(new)
        return series.str.replace(old_scalar, replacement_text, regex=False)

    def func_year(self, value: Any) -> pd.Series:
        series = pd.to_datetime(self._to_series(value), errors="coerce")
        return series.dt.year

    def func_month(self, value: Any) -> pd.Series:
        series = pd.to_datetime(self._to_series(value), errors="coerce")
        return series.dt.month

    def func_day(self, value: Any) -> pd.Series:
        series = pd.to_datetime(self._to_series(value), errors="coerce")
        return series.dt.day

    def func_weekday(self, value: Any) -> pd.Series:
        series = pd.to_datetime(self._to_series(value), errors="coerce")
        return series.dt.day_name()

    def func_fillblank(self, value: Any, replacement: Any) -> pd.Series:
        series = self._to_series(value)
        string_series = series.astype("string")
        mask = string_series.isna() | string_series.str.strip().eq("").fillna(False)
        replacement_series = self._to_series(replacement)
        return series.where(~mask, replacement_series)


class FormulaEngine:
    """Parse and evaluate Excel-style formulas against a pandas DataFrame."""

    _function_aliases: Dict[str, str] = {
        "SUM": "SUM",
        "AVG": "AVG",
        "MEAN": "AVG",
        "MAX": "MAX",
        "MIN": "MIN",
        "PROD": "PROD",
        "DIV": "DIV",
        "ABS": "ABS",
        "FLOOR": "FLOOR",
        "CEIL": "CEIL",
        "EXP": "EXP",
        "LOG": "LOG",
        "SQRT": "SQRT",
        "MEDIAN": "MEDIAN",
        "PERCENTILE": "PERCENTILE",
        "PERCENTILE_INC": "PERCENTILE",
        "STD": "STD",
        "VAR": "VAR",
        "COV": "COV",
        "CORR": "CORR",
        "CUMSUM": "CUMSUM",
        "CUMPROD": "CUMPROD",
        "CUMMAX": "CUMMAX",
        "CUMMIN": "CUMMIN",
        "DIFF": "DIFF",
        "PCT_CHANGE": "PCT_CHANGE",
        "LAG": "LAG",
        "COUNT": "COUNT",
        "ROUND": "ROUND",
        "ZSCORE": "ZSCORE",
        "NORM": "NORM",
        "IF": "IF",
        "ISNULL": "ISNULL",
        "LOWER": "LOWER",
        "UPPER": "UPPER",
        "LEN": "LEN",
        "SUBSTR": "SUBSTR",
        "STR_REPLACE": "STR_REPLACE",
        "FILLNA": "FILLNA",
        "FILLBLANK": "FILLBLANK",
        "MAP": "MAP",
        "BIN": "BIN",
        "DATE_DIFF": "DATE_DIFF",
        "YEAR": "YEAR",
        "MONTH": "MONTH",
        "DAY": "DAY",
        "WEEKDAY": "WEEKDAY",
    }

    _string_pattern = re.compile(r'("([^"\\]|\\.)*"|\'([^\'\\]|\\.)*\')')

    def evaluate(self, expression: str, frame: pd.DataFrame) -> pd.Series:
        if frame.empty:
            raise FormulaEvaluationError("Cannot apply formulas to an empty dataframe.")

        expr = expression.strip()
        if not expr:
            raise FormulaEvaluationError("Formula cannot be empty.")

        sanitised = self._sanitise_expression(expr, frame.columns.tolist())

        registry = _FunctionRegistry(frame)
        env = self._build_environment(registry, sanitised.column_mapping, frame)

        parsed = ast.parse(sanitised.expression, mode="eval")
        validator = _FormulaAstValidator(
            allowed_names=set(sanitised.column_mapping.values()),
            allowed_functions=set(env.keys()) - set(sanitised.column_mapping.values()),
        )
        validator.visit(parsed)

        try:
            result = eval(compile(parsed, "<formula>", "eval"), {"__builtins__": {}}, env)
        except FormulaEvaluationError:
            raise
        except Exception as exc:  # pragma: no cover - safety net
            raise FormulaEvaluationError(f"Failed to evaluate formula: {exc}") from exc

        return self._finalise_result(result, frame.index)

    # ------------------------------------------------------------------ Helpers
    def _sanitise_expression(self, expression: str, columns: list[str]) -> _SanitisedExpression:
        placeholders: Dict[str, str] = {}

        def _stash_string(match: re.Match[str]) -> str:
            placeholder = f"__STR_{len(placeholders)}__"
            placeholders[placeholder] = match.group(0)
            return placeholder

        without_strings = self._string_pattern.sub(_stash_string, expression)

        column_mapping: Dict[str, str] = {}
        safe_names: Dict[str, str] = {}

        def _make_safe(name: str) -> str:
            base = re.sub(r"\W+", "_", name).strip("_") or "COL"
            if not base[0].isalpha():
                base = f"C_{base}"
            candidate = base.upper()
            counter = 1
            while candidate in safe_names.values():
                counter += 1
                candidate = f"{base.upper()}_{counter}"
            return candidate

        sorted_columns = sorted([col for col in columns if col], key=len, reverse=True)
        if sorted_columns:
            pattern = re.compile(
                r"(?<![A-Za-z0-9_])(" + "|".join(re.escape(col) for col in sorted_columns) + r")(?![A-Za-z0-9_])"
            )

            def _replace(match: re.Match[str]) -> str:
                original = match.group(0)
                if original not in column_mapping:
                    column_mapping[original] = _make_safe(original)
                return column_mapping[original]

            without_strings = pattern.sub(_replace, without_strings)

        restored = without_strings
        for placeholder, value in placeholders.items():
            restored = restored.replace(placeholder, value)

        return _SanitisedExpression(expression=restored, column_mapping=column_mapping)

    def _build_environment(
        self,
        registry: _FunctionRegistry,
        column_mapping: Dict[str, str],
        frame: pd.DataFrame,
    ) -> Dict[str, Any]:
        env: Dict[str, Any] = {}

        for original, safe in column_mapping.items():
            env[safe] = frame[original]

        function_map = {
            "SUM": registry.func_sum,
            "AVG": registry.func_avg,
            "MEAN": registry.func_avg,
            "MAX": registry.func_max,
            "MIN": registry.func_min,
            "PROD": registry.func_prod,
            "DIV": registry.func_div,
            "ABS": registry.func_abs,
            "FLOOR": registry.func_floor,
            "CEIL": registry.func_ceil,
            "EXP": registry.func_exp,
            "LOG": registry.func_log,
            "SQRT": registry.func_sqrt,
            "MEDIAN": registry.func_median,
            "PERCENTILE": registry.func_percentile,
            "STD": registry.func_std,
            "VAR": registry.func_var,
            "COV": registry.func_cov,
            "CORR": registry.func_corr,
            "CUMSUM": registry.func_cumsum,
            "CUMPROD": registry.func_cumprod,
            "CUMMAX": registry.func_cummax,
            "CUMMIN": registry.func_cummin,
            "DIFF": registry.func_diff,
            "PCT_CHANGE": registry.func_pct_change,
            "LAG": registry.func_lag,
            "COUNT": registry.func_count,
            "ROUND": registry.func_round,
            "ZSCORE": registry.func_zscore,
            "NORM": registry.func_norm,
            "IF": registry.func_if,
            "ISNULL": registry.func_isnull,
            "LOWER": registry.func_lower,
            "UPPER": registry.func_upper,
            "LEN": registry.func_len,
            "SUBSTR": registry.func_substr,
            "STR_REPLACE": registry.func_str_replace,
            "FILLNA": registry.func_fillna,
            "FILLBLANK": registry.func_fillblank,
            "MAP": registry.func_map,
            "BIN": registry.func_bin,
            "DATE_DIFF": registry.func_date_diff,
            "YEAR": registry.func_year,
            "MONTH": registry.func_month,
            "DAY": registry.func_day,
            "WEEKDAY": registry.func_weekday,
        }

        env.update(function_map)
        env["PI"] = math.pi
        env["E"] = math.e

        return env

    def _finalise_result(self, value: Any, index: pd.Index) -> pd.Series:
        if isinstance(value, pd.Series):
            series = value.reindex(index)
            series.index = range(len(series))
            return series

        if isinstance(value, np.ndarray):
            arr = np.asarray(value)
            if arr.ndim == 0:
                arr = np.full(len(index), arr.item())
            elif len(arr) != len(index):
                raise FormulaEvaluationError("Resulting array length does not match dataframe rows.")
            return pd.Series(arr)

        if isinstance(value, (list, tuple)):
            if len(value) != len(index):
                raise FormulaEvaluationError("Resulting list length does not match dataframe rows.")
            return pd.Series(list(value))

        if pd.api.types.is_scalar(value) or value is None:
            return pd.Series([value] * len(index))

        raise FormulaEvaluationError(f"Unsupported result type '{type(value).__name__}'.")


def evaluate_formula(expression: str, frame: pd.DataFrame) -> pd.Series:
    """Convenience wrapper."""

    engine = FormulaEngine()
    return engine.evaluate(expression, frame)

