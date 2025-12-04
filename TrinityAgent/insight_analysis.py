"""
Enhanced Deep Insight Generation Module
Provides comprehensive statistical analysis and meaningful insights for atoms.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median, mode, StatisticsError, pstdev, stdev, variance
from typing import Any, Dict, List, Optional, Sequence, Tuple
from collections import Counter

try:
    from diskcache import Cache
    CACHE_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False
    Cache = None  # type: ignore

from TrinityAgent.llm_client import LLMClient

logger = logging.getLogger("trinity.atoms.insights")

_CACHE_PATH = Path(os.getenv("TRINITY_ATOM_INSIGHT_CACHE", "/tmp/trinity_atom_insights"))
_CACHE_PATH.mkdir(parents=True, exist_ok=True)
_CACHE = Cache(str(_CACHE_PATH)) if CACHE_AVAILABLE else None


@dataclass
class InsightPayload:
    """Structured insight entry returned to the UI."""
    insight: str
    impact: str
    risk: str
    next_action: str

    def to_dict(self) -> Dict[str, str]:
        return {
            "insight": self.insight,
            "impact": self.impact,
            "risk": self.risk,
            "next_action": self.next_action,
        }


@dataclass
class StatisticalSummary:
    """Comprehensive statistical summary for a numeric column."""
    count: int
    mean: float
    median: float
    mode: Optional[float]
    std_dev: float
    variance: float
    min: float
    max: float
    q1: float  # First quartile
    q3: float  # Third quartile
    iqr: float  # Interquartile range
    range: float
    skewness: float
    kurtosis: float


def _hash_facts(data_hash: Optional[str], facts: Any) -> str:
    """Generate hash for caching insights based on facts."""
    if data_hash:
        return data_hash
    try:
        # Create a safe version of facts for hashing (exclude large datasets)
        safe_facts = facts
        if isinstance(facts, dict):
            safe_facts = {}
            for key, value in facts.items():
                # Skip large data arrays for hashing
                if key.lower() in {"rows", "data", "samples", "preview"} and isinstance(value, (list, tuple)):
                    # Use length and first/last items for hash instead of full data
                    safe_facts[key] = f"<{len(value)} items>"
                    if len(value) > 0:
                        safe_facts[key] += f" first:{value[0] if len(value) > 0 else None}"
                else:
                    safe_facts[key] = value
        serialized = json.dumps(safe_facts, sort_keys=True, default=str)
    except (TypeError, ValueError):
        serialized = str(facts)[:1000]  # Limit string size for hashing
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _extract_numeric_columns(rows: Sequence[Dict[str, Any]]) -> Dict[str, List[float]]:
    """Extract numeric columns from rows of data."""
    numeric: Dict[str, List[float]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                numeric.setdefault(key, []).append(float(value))
    return numeric


def _calculate_quartiles(values: List[float]) -> Tuple[float, float, float]:
    """Calculate Q1, median (Q2), and Q3."""
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    
    if n == 0:
        return 0.0, 0.0, 0.0
    
    def get_percentile(data: List[float], p: float) -> float:
        if not data:
            return 0.0
        k = (n - 1) * p
        f = math.floor(k)
        c = math.ceil(k)
        if f == c:
            return data[int(k)]
        d0 = data[int(f)] * (c - k)
        d1 = data[int(c)] * (k - f)
        return d0 + d1
    
    q1 = get_percentile(sorted_vals, 0.25)
    median_val = get_percentile(sorted_vals, 0.5)
    q3 = get_percentile(sorted_vals, 0.75)
    
    return q1, median_val, q3


def _calculate_skewness(values: List[float], mean_val: float, std_val: float) -> float:
    """Calculate skewness of distribution."""
    if len(values) < 3 or std_val == 0:
        return 0.0
    n = len(values)
    sum_cubed = sum(((x - mean_val) / std_val) ** 3 for x in values)
    return (n / ((n - 1) * (n - 2))) * sum_cubed


def _calculate_kurtosis(values: List[float], mean_val: float, std_val: float) -> float:
    """Calculate kurtosis of distribution."""
    if len(values) < 4 or std_val == 0:
        return 0.0
    n = len(values)
    sum_fourth = sum(((x - mean_val) / std_val) ** 4 for x in values)
    return ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum_fourth - 3 * ((n - 1) ** 2) / ((n - 2) * (n - 3))


def _compute_advanced_stats(rows: Sequence[Dict[str, Any]]) -> Dict[str, StatisticalSummary]:
    """Compute comprehensive statistical summaries for numeric columns."""
    stats: Dict[str, StatisticalSummary] = {}
    if not rows:
        return stats

    numeric_columns = _extract_numeric_columns(rows)
    
    for col, values in numeric_columns.items():
        if not values or len(values) < 2:
            continue
        
        try:
            mean_val = mean(values)
            median_val = median(values)
            
            # Mode calculation
            try:
                mode_val = float(mode(values))
            except (StatisticsError, ValueError):
                mode_val = None
            
            std_val = stdev(values) if len(values) > 1 else 0.0
            var_val = variance(values) if len(values) > 1 else 0.0
            
            q1, q2, q3 = _calculate_quartiles(values)
            iqr = q3 - q1
            
            min_val = min(values)
            max_val = max(values)
            range_val = max_val - min_val
            
            skew = _calculate_skewness(values, mean_val, std_val)
            kurt = _calculate_kurtosis(values, mean_val, std_val)
            
            stats[col] = StatisticalSummary(
                count=len(values),
                mean=mean_val,
                median=median_val,
                mode=mode_val,
                std_dev=std_val,
                variance=var_val,
                min=min_val,
                max=max_val,
                q1=q1,
                q3=q3,
                iqr=iqr,
                range=range_val,
                skewness=skew,
                kurtosis=kurt
            )
        except Exception as e:
            logger.warning(f"Error computing stats for column {col}: {e}")
            continue

    return stats


def _detect_anomalies_advanced(rows: Sequence[Dict[str, Any]], stats: Dict[str, StatisticalSummary]) -> Dict[str, Any]:
    """Advanced anomaly detection using multiple methods."""
    anomalies: Dict[str, Any] = {
        "z_scores": {},
        "iqr_outliers": {},
        "percentile_outliers": {},
        "missing_rates": {},
        "distribution_issues": {}
    }
    
    if not rows:
        return anomalies

    numeric_columns = _extract_numeric_columns(rows)
    
    for col, values in numeric_columns.items():
        if col not in stats or len(values) < 3:
            continue
        
        stat = stats[col]
        
        # Method 1: Z-score outliers (beyond 3 standard deviations)
        if stat.std_dev > 0:
            outliers_z = []
            for val in values:
                z_score = abs((val - stat.mean) / stat.std_dev) if stat.std_dev > 0 else 0
                if z_score > 3:
                    outliers_z.append({"value": val, "z_score": z_score})
            
            if outliers_z:
                anomalies["z_scores"][col] = {
                    "mean": stat.mean,
                    "stdev": stat.std_dev,
                    "outliers": sorted(outliers_z, key=lambda x: x["z_score"], reverse=True)[:10],
                    "outlier_count": len(outliers_z),
                    "outlier_percentage": (len(outliers_z) / len(values)) * 100
                }
        
        # Method 2: IQR outliers (outside 1.5 * IQR from Q1/Q3)
        if stat.iqr > 0:
            lower_bound = stat.q1 - 1.5 * stat.iqr
            upper_bound = stat.q3 + 1.5 * stat.iqr
            outliers_iqr = [val for val in values if val < lower_bound or val > upper_bound]
            
            if outliers_iqr:
                anomalies["iqr_outliers"][col] = {
                    "q1": stat.q1,
                    "q3": stat.q3,
                    "iqr": stat.iqr,
                    "lower_bound": lower_bound,
                    "upper_bound": upper_bound,
                    "outliers": sorted(outliers_iqr)[:10],
                    "outlier_count": len(outliers_iqr),
                    "outlier_percentage": (len(outliers_iqr) / len(values)) * 100
                }
        
        # Method 3: Extreme percentile outliers (top/bottom 1%)
        if len(values) >= 100:
            sorted_vals = sorted(values)
            p01 = sorted_vals[int(len(sorted_vals) * 0.01)]
            p99 = sorted_vals[int(len(sorted_vals) * 0.99)]
            outliers_pct = [val for val in values if val < p01 or val > p99]
            
            if outliers_pct:
                anomalies["percentile_outliers"][col] = {
                    "p01": p01,
                    "p99": p99,
                    "outliers": sorted(outliers_pct)[:10],
                    "outlier_count": len(outliers_pct)
                }
        
        # Method 4: Distribution shape issues
        distribution_issues = []
        
        # High skewness indicates asymmetry
        if abs(stat.skewness) > 2:
            distribution_issues.append({
                "type": "high_skewness",
                "value": stat.skewness,
                "interpretation": "highly skewed" if stat.skewness > 2 else "highly left-skewed"
            })
        
        # High kurtosis indicates heavy tails
        if abs(stat.kurtosis) > 3:
            distribution_issues.append({
                "type": "high_kurtosis",
                "value": stat.kurtosis,
                "interpretation": "heavy-tailed distribution"
            })
        
        # Large gap between mean and median suggests outliers
        if stat.std_dev > 0:
            mean_median_diff = abs(stat.mean - stat.median)
            if mean_median_diff > 2 * stat.std_dev:
                distribution_issues.append({
                    "type": "mean_median_gap",
                    "value": mean_median_diff,
                    "interpretation": "significant difference suggests outliers"
                })
        
        if distribution_issues:
            anomalies["distribution_issues"][col] = distribution_issues
    
    # Missing data analysis
    total_rows = len(rows)
    missing_counts: Dict[str, int] = {}
    
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            is_missing = value in (None, "", "nan")
            if isinstance(value, float) and math.isnan(value):
                is_missing = True
            if is_missing:
                missing_counts[key] = missing_counts.get(key, 0) + 1
    
    if total_rows > 0:
        anomalies["missing_rates"] = {
            key: {
                "count": count,
                "percentage": (count / total_rows) * 100,
                "severity": "critical" if (count / total_rows) > 0.5 else "high" if (count / total_rows) > 0.2 else "medium" if (count / total_rows) > 0.05 else "low"
            }
            for key, count in missing_counts.items()
        }
    
    return anomalies


def _detect_patterns(rows: Sequence[Dict[str, Any]], stats: Dict[str, StatisticalSummary]) -> Dict[str, Any]:
    """Detect patterns in the data like trends, correlations, clusters."""
    patterns: Dict[str, Any] = {
        "trends": {},
        "correlations": {},
        "distributions": {},
        "dominant_values": {}
    }
    
    if not rows or len(rows) < 2:
        return patterns
    
    numeric_columns = _extract_numeric_columns(rows)
    
    # Trend detection (for columns that might be time-ordered)
    for col, values in numeric_columns.items():
        if col not in stats or len(values) < 5:
            continue
        
        # Simple trend: compare first half vs second half
        mid = len(values) // 2
        first_half = values[:mid]
        second_half = values[mid:]
        
        first_mean = mean(first_half) if first_half else 0
        second_mean = mean(second_half) if second_half else 0
        
        if first_mean > 0:
            change_pct = ((second_mean - first_mean) / abs(first_mean)) * 100
            if abs(change_pct) > 10:
                patterns["trends"][col] = {
                    "direction": "increasing" if change_pct > 0 else "decreasing",
                    "change_percentage": change_pct,
                    "first_half_mean": first_mean,
                    "second_half_mean": second_mean
                }
    
    # Distribution characteristics
    for col, stat in stats.items():
        # Calculate coefficient of variation
        cv = stat.std_dev / abs(stat.mean) if stat.mean != 0 else 0.0
        
        patterns["distributions"][col] = {
            "shape": "normal" if abs(stat.skewness) < 0.5 and abs(stat.kurtosis) < 0.5 else
                     "right_skewed" if stat.skewness > 0.5 else
                     "left_skewed" if stat.skewness < -0.5 else "irregular",
            "spread": "wide" if cv > 1.0 else
                      "moderate" if cv > 0.5 else "narrow",
            "skewness": stat.skewness,
            "kurtosis": stat.kurtosis,
            "coefficient_of_variation": cv
        }
    
    # Dominant values (for categorical-like numeric columns)
    for col, values in numeric_columns.items():
        if len(values) < 10:
            continue
        
        value_counts = Counter(values)
        most_common = value_counts.most_common(3)
        total = len(values)
        
        if most_common:
            top_value, top_count = most_common[0]
            top_percentage = (top_count / total) * 100
            
            if top_percentage > 40:  # If one value dominates
                patterns["dominant_values"][col] = {
                    "value": top_value,
                    "percentage": top_percentage,
                    "count": top_count,
                    "total": total
                }
    
    return patterns


def _detect_correlations(rows: Sequence[Dict[str, Any]], numeric_columns: Dict[str, List[float]]) -> Dict[str, Any]:
    """Detect correlations between numeric columns."""
    correlations: Dict[str, Any] = {
        "strong_positive": [],
        "strong_negative": [],
        "moderate": [],
        "weak": []
    }
    
    if len(numeric_columns) < 2 or len(rows) < 3:
        return correlations
    
    column_names = list(numeric_columns.keys())
    
    for i, col1 in enumerate(column_names):
        values1 = numeric_columns[col1]
        if len(values1) < 3:
            continue
        
        for col2 in column_names[i+1:]:
            values2 = numeric_columns[col2]
            if len(values2) < 3 or len(values1) != len(values2):
                continue
            
            # Calculate Pearson correlation
            try:
                mean1 = mean(values1)
                mean2 = mean(values2)
                
                numerator = sum((values1[j] - mean1) * (values2[j] - mean2) for j in range(len(values1)))
                denom1 = sum((v - mean1) ** 2 for v in values1)
                denom2 = sum((v - mean2) ** 2 for v in values2)
                
                if denom1 > 0 and denom2 > 0:
                    corr = numerator / math.sqrt(denom1 * denom2)
                    
                    corr_info = {
                        "column1": col1,
                        "column2": col2,
                        "correlation": corr
                    }
                    
                    if corr > 0.7:
                        correlations["strong_positive"].append(corr_info)
                    elif corr < -0.7:
                        correlations["strong_negative"].append(corr_info)
                    elif abs(corr) > 0.3:
                        correlations["moderate"].append(corr_info)
                    else:
                        correlations["weak"].append(corr_info)
            except Exception as e:
                logger.debug(f"Error calculating correlation between {col1} and {col2}: {e}")
                continue
    
    return correlations


def _compute_basic_stats(rows: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
    """Compute basic statistics (backward compatibility)."""
    stats: Dict[str, Dict[str, float]] = {}
    if not rows:
        return stats

    numeric_columns = _extract_numeric_columns(rows)
    for col, values in numeric_columns.items():
        if not values:
            continue
        stats[col] = {
            "min": min(values),
            "max": max(values),
            "avg": mean(values),
            "count": len(values),
        }
    return stats


def summarize_facts(
    goal: str,
    facts: Any,
    stats: Dict[str, StatisticalSummary],
    anomalies: Dict[str, Any],
    patterns: Dict[str, Any],
    correlations: Dict[str, Any]
) -> str:
    """Create comprehensive summary of facts for LLM processing."""
    lines = [
        f"Goal: {goal.strip()}",
        "=" * 80,
        "DETAILED FINDINGS:"
    ]
    
    # Add facts summary
    if isinstance(facts, str):
        lines.append(f"\nContext: {facts.strip()}")
    elif isinstance(facts, dict):
        for key, value in facts.items():
            if key in {"rows", "data", "samples"}:
                continue
            try:
                serialized = json.dumps(value, default=str)
                if len(serialized) > 500:
                    serialized = serialized[:500] + "..."
                lines.append(f"\n- {key}: {serialized}")
            except (TypeError, ValueError):
                lines.append(f"\n- {key}: {str(value)[:500]}")
    else:
        lines.append(f"\nContext: {str(facts)[:1000]}")
    
    # Add comprehensive statistics
    if stats:
        lines.append("\n" + "=" * 80)
        lines.append("COMPREHENSIVE STATISTICS:")
        for col, stat in list(stats.items())[:10]:  # Limit to top 10 columns
            lines.append(f"\n{col}:")
            lines.append(f"  Count: {stat.count:,}")
            lines.append(f"  Mean: {stat.mean:.4f} | Median: {stat.median:.4f}")
            if stat.mode is not None:
                lines.append(f"  Mode: {stat.mode:.4f}")
            lines.append(f"  Range: [{stat.min:.4f}, {stat.max:.4f}]")
            lines.append(f"  Standard Deviation: {stat.std_dev:.4f}")
            lines.append(f"  Quartiles: Q1={stat.q1:.4f}, Q2={stat.median:.4f}, Q3={stat.q3:.4f}, IQR={stat.iqr:.4f}")
            lines.append(f"  Skewness: {stat.skewness:.4f} | Kurtosis: {stat.kurtosis:.4f}")
    
    # Add anomaly findings
    anomaly_sections = []
    if anomalies.get("z_scores"):
        anomaly_sections.append("Z-Score Outliers (>3σ)")
        for col, meta in list(anomalies["z_scores"].items())[:5]:
            outlier_count = meta.get("outlier_count", 0)
            outlier_pct = meta.get("outlier_percentage", 0)
            anomaly_sections.append(
                f"  {col}: {outlier_count} outliers ({outlier_pct:.1f}%) "
                f"around mean {meta.get('mean', 0):.2f}"
            )
    
    if anomalies.get("iqr_outliers"):
        anomaly_sections.append("\nIQR Outliers")
        for col, meta in list(anomalies["iqr_outliers"].items())[:5]:
            outlier_count = meta.get("outlier_count", 0)
            outlier_pct = meta.get("outlier_percentage", 0)
            anomaly_sections.append(
                f"  {col}: {outlier_count} outliers ({outlier_pct:.1f}%) "
                f"outside [Q1-1.5*IQR, Q3+1.5*IQR]"
            )
    
    if anomalies.get("distribution_issues"):
        anomaly_sections.append("\nDistribution Issues")
        for col, issues in list(anomalies["distribution_issues"].items())[:5]:
            for issue in issues[:2]:
                anomaly_sections.append(
                    f"  {col}: {issue.get('interpretation', '')} "
                    f"(value: {issue.get('value', 0):.4f})"
                )
    
    missing = anomalies.get("missing_rates", {})
    if missing:
        critical_missing = {k: v for k, v in missing.items() if v.get("severity") in ["critical", "high"]}
        if critical_missing:
            anomaly_sections.append("\nData Quality Issues")
            for col, info in list(critical_missing.items())[:5]:
                anomaly_sections.append(
                    f"  {col}: {info.get('count', 0):,} missing "
                    f"({info.get('percentage', 0):.1f}%) - {info.get('severity', '')} severity"
                )
    
    if anomaly_sections:
        lines.append("\n" + "=" * 80)
        lines.append("ANOMALIES & DATA QUALITY:")
        lines.extend(anomaly_sections)
    
    # Add patterns
    if patterns.get("trends"):
        lines.append("\n" + "=" * 80)
        lines.append("TREND ANALYSIS:")
        for col, trend in list(patterns["trends"].items())[:5]:
            lines.append(
                f"  {col}: {trend.get('direction', '')} trend "
                f"({trend.get('change_percentage', 0):+.1f}% change)"
            )
    
    if patterns.get("dominant_values"):
        lines.append("\nDOMINANT VALUES:")
        for col, info in list(patterns["dominant_values"].items())[:5]:
            lines.append(
                f"  {col}: Value {info.get('value', 0)} appears "
                f"{info.get('percentage', 0):.1f}% of the time"
            )
    
    # Add correlations
    if correlations.get("strong_positive") or correlations.get("strong_negative"):
        lines.append("\n" + "=" * 80)
        lines.append("STRONG CORRELATIONS:")
        for corr in (correlations.get("strong_positive", []) + 
                    correlations.get("strong_negative", []))[:5]:
            lines.append(
                f"  {corr['column1']} ↔ {corr['column2']}: "
                f"r = {corr['correlation']:.3f}"
            )
    
    return "\n".join(lines)


def _build_prompt(goal: str, facts_text: str) -> str:
    """Build enhanced prompt for deeper insight generation."""
    return (
        "You are an expert data analyst providing business intelligence insights. "
        f"Given the goal: <goal>{goal}</goal> and the following comprehensive analysis: "
        f"<analysis>{facts_text}</analysis>\n\n"
        "Generate 3-5 detailed, actionable insights. Each insight must include:\n"
        "1. **Insight**: A clear, specific finding (what the data reveals)\n"
        "2. **Impact**: The business/operational impact (why it matters)\n"
        "3. **Risk**: Potential risks, limitations, or uncertainties\n"
        "4. **Next Action**: Specific, actionable recommendation\n\n"
        "Focus on:\n"
        "- Meaningful patterns, anomalies, or relationships discovered\n"
        "- Statistical significance and data quality considerations\n"
        "- Business implications and opportunities\n"
        "- Actionable recommendations based on evidence\n\n"
        "Return ONLY valid JSON array in this exact format:\n"
        "[{\"insight\": \"...\", \"impact\": \"...\", \"risk\": \"...\", \"next_action\": \"...\"}]\n\n"
        "Do not include markdown formatting, code blocks, or explanatory text outside the JSON."
    )


def _parse_insights(raw_response: str) -> List[InsightPayload]:
    """Parse insights from LLM response."""
    cleaned = raw_response.strip()
    
    # Remove markdown code blocks if present
    if cleaned.startswith("```"):
        # Find the closing ```
        end_idx = cleaned.find("```", 3)
        if end_idx > 0:
            cleaned = cleaned[3:end_idx].strip()
            # Remove language identifier if present
            if "\n" in cleaned:
                first_line = cleaned.split("\n")[0]
                if first_line.strip() in ["json", "JSON"]:
                    cleaned = "\n".join(cleaned.split("\n")[1:])
    
    # Find JSON array
    start = cleaned.find("[")
    if start == -1:
        return []
    
    snippet = cleaned[start:]
    # Find matching closing bracket
    bracket_count = 0
    end = -1
    for i, char in enumerate(snippet):
        if char == "[":
            bracket_count += 1
        elif char == "]":
            bracket_count -= 1
            if bracket_count == 0:
                end = i + 1
                break
    
    if end > 0:
        snippet = snippet[:end]
    
    try:
        data = json.loads(snippet)
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse insights JSON: {e}")
        return []
    
    insights: List[InsightPayload] = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            insights.append(
                InsightPayload(
                    insight=str(item.get("insight", "")).strip(),
                    impact=str(item.get("impact", "")).strip(),
                    risk=str(item.get("risk", "")).strip(),
                    next_action=str(item.get("next_action", "")).strip(),
                )
            )
    
    return insights


def generate_insights(
    goal: str,
    facts: Any,
    data_hash: Optional[str] = None,
    atom_id: Optional[str] = None,
    llm_client: Optional[LLMClient] = None,
) -> List[Dict[str, str]]:
    """Generate deep, meaningful insights for an atom with comprehensive analysis."""
    
    cache_key = f"{atom_id or 'atom'}:{_hash_facts(data_hash, facts)}"
    
    # Check cache
    if _CACHE is not None:
        cached = _CACHE.get(cache_key)
        if cached:
            logger.debug(f"Returning cached insights for {cache_key}")
            return cached
    
    # Extract rows from facts
    rows: Sequence[Dict[str, Any]] = []
    if isinstance(facts, dict):
        for candidate in ("rows", "data", "samples", "preview"):
            if isinstance(facts.get(candidate), list):
                rows = facts.get(candidate)  # type: ignore
                break
            if isinstance(facts.get(candidate), dict) and isinstance(facts[candidate].get("data"), list):
                rows = facts[candidate]["data"]  # type: ignore
                break
    elif isinstance(facts, list):
        rows = facts
    
    # Perform comprehensive analysis
    logger.info(f"Performing deep analysis on {len(rows)} rows...")
    
    # Advanced statistics
    advanced_stats = _compute_advanced_stats(rows)
    
    # Convert to basic stats for backward compatibility
    basic_stats = _compute_basic_stats(rows)
    
    # Anomaly detection
    anomalies = _detect_anomalies_advanced(rows, advanced_stats)
    
    # Pattern detection
    patterns = _detect_patterns(rows, advanced_stats)
    
    # Correlation analysis
    numeric_columns = _extract_numeric_columns(rows)
    correlations = _detect_correlations(rows, numeric_columns)
    
    # Build comprehensive summary
    facts_text = summarize_facts(goal, facts, advanced_stats, anomalies, patterns, correlations)
    
    # Build enhanced prompt
    prompt = _build_prompt(goal, facts_text)
    
    # Generate insights using LLM
    client = llm_client or LLMClient()
    
    try:
        logger.info("Calling LLM for insight generation...")
        raw = client.call(
            prompt,
            temperature=0.2,
            num_predict=1500,  # Increased for deeper insights
            top_p=0.9,
            repeat_penalty=1.05
        )
        
        parsed = _parse_insights(raw)
        
        if not parsed:
            logger.warning("No insights parsed from LLM response")
            raise ValueError("No insights parsed from LLM response")
        
        results = [p.to_dict() for p in parsed]
        
        # Cache results
        if _CACHE is not None:
            _CACHE.set(cache_key, results, expire=60 * 60 * 6)  # 6 hours
        
        logger.info(f"Generated {len(results)} insights successfully")
        return results
        
    except Exception as exc:
        logger.warning(f"Insight generation failed ({exc}); returning fallback")
        
        fallback = [
            {
                "insight": "Analysis completed but insight generation encountered an issue.",
                "impact": "Manual review recommended to extract full value from the data analysis.",
                "risk": "Low confidence due to processing error.",
                "next_action": "Review the atom output manually and verify key statistics and patterns.",
            }
        ]
        
        if _CACHE is not None:
            _CACHE.set(cache_key, fallback, expire=60 * 10)  # 10 minutes for fallback
        
        return fallback


