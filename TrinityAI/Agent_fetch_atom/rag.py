import logging
import re
import string
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import faiss
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize as l2_normalize

logger = logging.getLogger(__name__)

def canonicalize(text: str) -> str:
    return re.sub(r"\s+", "", text.lower())


def normalize_text(text: str) -> str:
    """Lowercase, strip punctuation, and collapse whitespace for stable indexing."""

    lowered = text.lower()
    without_punct = lowered.translate(str.maketrans("", "", string.punctuation))
    collapsed = re.sub(r"\s+", " ", without_punct).strip()
    return collapsed


@dataclass
class AtomDocument:
    doc_id: str
    title: str
    body: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def corpus_text(self) -> str:
        meta_parts = []
        for key in (
            "working_process",
            "output",
            "when_to_use",
            "how_it_helps",
        ):
            value = self.metadata.get(key)
            if value:
                meta_parts.append(str(value))

        extras = self.metadata.get("example_user_prompts") or []
        prompt_text = " ".join(extras) if extras else ""
        combined = " ".join([self.title, self.body, prompt_text] + meta_parts)
        return normalize_text(combined)

class AtomKnowledgeBase:
    UNIQUE_ATOM_KNOWLEDGE = {
        "chartmaker": {
            "display_name": "ChartMaker",
            "description": (
                "chartmaker is a powerful tool for creating interactive charts . It allows users to explore, filter, and visualize datasets dynamically, generating various chart types like bar, line, area, pie, histogram, and more."
                "  This atom is strictly for  data visualization and analytics."
            ),
            "unique_keywords": ['atom chartmaker', 'chart maker', 'chart creation', 'data visualization',
                "Plotly", "pandas", "tool chart", "data exploration", "chart", "graph", "plot", "interactive chart",
                "chart type", "chart properties", "bar chart", "line chart", "area chart", "pie chart", "histogram", "distplot",
                "waterfall chart", "heatmap", "subplots", "categorical filter", "numerical filter", "data filtering", "chart layout",
                "annotations", "vertical grid", "horizontal grid", "multiple line graphs", "chart title", "font", "axis", "bar width",
                "line width", "line type", "chart configuration", "chart style", "chart image", "chart JSON", "business dashboard",
                "analytics chart", "business data", "business intelligence", "BI", "business analytics"
            ],
            "semantic_markers": [
                "data_visualization", "chart_creation", "graph_plotting", "visual_analysis", "interactive_analytics", "dynamic_filtering",
                "business_intelligence", "analytics_dashboard"
            ],
            "category": "visualization",
            "priority_score": 1.0,
            "function_type": "data_visualization",
            "working_process": (
                "User sends an HTTP request to the API with file and chart config. Backend retrieves the file from MinIO, loads it into pandas, "
                "applies filters, generates Plotly charts, extracts metadata, and returns chart JSON/image and filtered data. Errors are handled gracefully."
            ),
            "output": (
                "Interactive Plotly charts (JSON/image), filtered datasets, column metadata, and structured API responses."
            ),
            "when_to_use": (
                "When users need to explore, filter, and visualize business or analytics data dynamically, or export filtered datasets."
            ),
            "how_it_helps": (
                "Empowers users to make data-driven decisions by enabling interactive analytics and visualization. Not for unrelated topics like movies or art."
            ),
            "example_user_prompts": [
                "Create a bar chart of sales by region.",
                "Show a line chart with filters for product and date.",
                "Visualize my sales data with a heatmap and export the chart as an image."
            ]
        },
        # Add other atoms here using canonicalized keys (lowercase, no spaces)
         "feature_overview": {
            "description": (
                "feature_overview provides a comprehensive snapshot of a dataset, profiling its distribution across markets, products, and time. "
                "It automatically summarizes completeness, segment coverage, and key statistics to assess readiness for modeling or analytics. "
                "This atom is strictly for business data profiling, not for general summaries or unrelated domains."
            ),
            "unique_keywords": ['feature overview', 'atom overview', 'atom feature overview',
                "data overview", "dataset summary", "feature profiling", "market-product analysis", "data readiness", "EDA", "unique combinations",
                "business dimensions", "summary statistics", "missing segments", "data completeness", "data health check", "AI prompt",
                "forecasting readiness", "model suitability", "segment coverage", "business analytics", "data profiling",'feature overview', 'feature engineering',
            ],
            "semantic_markers": [
                "data_exploration", "profiling", "segment_analysis", "completeness_check", "data_health", "business_data"
            ],
            "category": "data_profiling",
            "priority_score": 1.0,
            "function_type": "data_analysis",
            "working_process": (
                "User uploads or refers to a dataset and specifies columns for market/product/time. Atom analyzes all combinations, checks completeness, "
                "calculates stats, and returns a summary."
            ),
            "output": (
                "Coverage matrix of unique combinations, summary table of stats, assessment of data richness, and guidance on trustworthy segments."
            ),
            "when_to_use": (
                "As the first step in business data analysis or modeling to check data readiness and completeness."
            ),
            "how_it_helps": (
                "Acts as an automatic health check, helping users understand data structure and identify issues before modeling."
            ),
            "example_user_prompts": [
                "Give me a summary of this sales data file and tell me if it’s good for forecasting.",
                "Summarize the uploaded data and show the most complete combinations.",
                "Check if the retail sales file is ready for model building."
            ]
        },

        "groupby": {
            "description": (
                "Aggregates and summarizes datasets by grouping across selected dimensions (e.g., product, region, date) using statistical functions "
                "like sum, mean, weighted average, and rank percentile. Used for business KPIs, reporting, and segment analysis."
            ),
            "unique_keywords": ['aggregate', 'group by', 'grouping','atom groupby', 'atom aggregation', 'data aggregation',
                "groupby", "aggregation", "summarization", "weighted mean", "rank percentile", "time aggregation", "resampling",
                "dimension analysis", "KPIs", "business intelligence", "group", "aggregate", "sum", "mean", "median", "count", "min", "max"
            ],
            "semantic_markers": [
                "aggregation", "dimension_grouping", "business_metrics", "segment_aggregation"
            ],
            "category": "aggregation",
            "priority_score": 1.0,
            "function_type": "data_aggregation",
            "working_process": (
                "User specifies grouping columns and metrics. Atom groups data, applies aggregations, and returns summarized results."
            ),
            "output": (
                "Aggregated DataFrame with grouping columns and metrics (e.g., total sales, average quantity, rank percent)."
            ),
            "when_to_use": (
                "For business reporting, KPI dashboards, or preparing data for modeling."
            ),
            "how_it_helps": (
                "Provides fast insights into key metrics by segment, simplifies data for downstream analytics."
            ),
            "example_user_prompts": [
                "Show the weighted average price and total sales for each product category every month.",
                "Aggregate sales data by region and quarter."
            ]
        },

        "create": {
            "description": (
                "Generates new columns in your data by performing operations like add, subtract, multiply, divide, residual, dummy conversion, trend detection, and more."
            ),
            "unique_keywords": ['atom create', 'atom feature generation', 'feature engineering',
                "new columns", "create fields", "add", "subtract", "multiply", "divide", "dummy variable", "residual", "trend", "feature generation", "RPI"
            ],
            "semantic_markers": [
                "feature_creation", "column_generation", "data_transformation"
            ],
            "category": "feature_engineering",
            "priority_score": 0.9,
            "function_type": "data_processing",
            "working_process": (
                "User describes the new column(s) to create. Atom performs the operation and adds the result as new columns."
            ),
            "output": (
                "New version of data with additional columns (e.g., sales_minus_returns, dummy variables, trends)."
            ),
            "when_to_use": (
                "For feature engineering before charts, modeling, or dashboards."
            ),
            "how_it_helps": (
                "Simplifies complex logic, prepares data for advanced analytics."
            ),
            "example_user_prompts": [
                "Add quantity and discount",
                "Subtract returns from sales",
                "Create dummy from store_type column",
                "Calculate the trend of sales"
            ]
        },

        "merge": {
            "description": (
                "Joins two datasets together based on common columns (like date, product, region). Supports inner, left, right, and outer joins. "
                "Similar to VLOOKUP or JOIN in Excel/SQL."
            ),
            "unique_keywords": ['atom merge', 'atom join', 'data merge', 'data join', 'dataset merging',
                "merge", "join", "combine", "VLOOKUP", "Excel join", "inner join", "left join", "outer join", "link data", "match files"
            ],
            "semantic_markers": [
                "data_joining", "dataset_merging", "file_combination", "data_integration"
            ],
            "category": "data_integration",
            "priority_score": 0.9,
            "function_type": "data_processing",
            "working_process": (
                "User provides two files and join columns. Atom merges datasets, handles column overlaps, and returns merged data."
            ),
            "output": (
                "Merged dataset with all columns from both files, suffixes for overlaps, and join logic applied."
            ),
            "when_to_use": (
                "To enrich or combine related datasets for analysis or modeling."
            ),
            "how_it_helps": (
                "Enables data enrichment, feature creation, and comprehensive analysis."
            ),
            "example_user_prompts": [
                "Merge my sales file with product data using Product_ID",
                "Join two files on Date and Region"
            ]
        },

        "concatenate": {
            "description": (
                "Combines two datasets either vertically (row-wise) or horizontally (column-wise). Useful for stacking or joining data split across files."
            ),
            "unique_keywords": ['atom concatenate', 'atom concat', 'atom stack', 'atom join columns', 'atom join rows', 'data concatenation',
                "concatenate", "concat", "stack", "join columns", "join rows", "append", "extend", "combine datasets", "vertical merge", "horizontal merge"
            ],
            "semantic_markers": [
                "data_stacking", "row_combination", "column_combination"
            ],
            "category": "data_integration",
            "priority_score": 0.8,
            "function_type": "data_processing",
            "working_process": (
                "User specifies files and concat direction. Atom checks columns/rows, combines datasets, and returns the result."
            ),
            "output": (
                "Combined dataset with user-chosen direction and column handling."
            ),
            "when_to_use": (
                "To stack monthly data, combine train/test splits, or add new fields."
            ),
            "how_it_helps": (
                "Simplifies data consolidation and preparation for analysis."
            ),
            "example_user_prompts": [
                "Stack Jan and Feb sales data",
                "Combine sales and product info side by side"
            ]
        },

        "delete": {
            "description": (
                "Removes unnecessary or unwanted columns from a dataset. Helps clean data by deleting fields not required for analysis or modeling."
            ),
            "unique_keywords": ['atom delete', 'atom drop', 'atom remove', 'data cleanup', 'column deletion', 'field removal',
                "delete columns", "drop fields", "remove variables", "data cleanup", "column pruning", "feature removal", "preprocessing"
            ],
            "semantic_markers": [
                "column_removal", "data_cleaning", "feature_pruning"
            ],
            "category": "data_cleaning",
            "priority_score": 0.8,
            "function_type": "data_processing",
            "working_process": (
                "User specifies columns to delete. Atom removes them, saves cleaned data, and returns updated column list."
            ),
            "output": (
                "Cleaned dataset with specified columns removed and list of deleted columns."
            ),
            "when_to_use": (
                "Before modeling or transformation to reduce data complexity."
            ),
            "how_it_helps": (
                "Improves model performance and simplifies analysis."
            ),
            "example_user_prompts": [
                "Remove extra columns from sales data",
                "Drop the unnecessary ID and metadata fields"
            ]
        },

        "rename": {
            "description": (
                "Changes the name of a column in a dataset for clarity or  before analysis or modeling."
            ),
            "unique_keywords": ['atom rename', 'atom change column name', 'atom edit header', 'atom relabel', 'atom standardize column', 'data preprocessing',
                "rename column", "change column name", "edit header", "relabel", "standardize column", "preprocessing", "data cleanup"
            ],
            "semantic_markers": [
                "column_renaming", "column_name change", "header_editing"
            ],
            "category": "data_cleaning",
            "priority_score": 0.8,
            "function_type": "data_processing",
            "working_process": (
                "User provides old and new column names. Atom renames column, updates dataset, and confirms changes."
            ),
            "output": (
                "Dataset with updated column names and confirmation of changes."
            ),
            "when_to_use": (
                "To make data more readable and consistent before further processing."
            ),
            "how_it_helps": (
                "Improves data clarity and usability for analysis and modeling."
            ),
            "example_user_prompts": [
                "Rename ‘prod_cat’ to ‘product_category’ in the product data.",
                "Change ‘cust_id’ to ‘customer_id’"
            ]
        },
        "data_upload_and_validate": {
    "display_name": "Data Upload and Validate",
    "description": (
        "The Data Upload and Validate Atom allows users to upload a master file and define validation rules for all future uploads. "
        "It includes pre-built templates for marketing mix modeling, promo analysis, and category forecasting. The Atom intelligently classifies columns, "
        "maps them to business dimensions, and stores validation schemas for consistent data processing."
    ),
    "unique_keywords": ['atom data upload', 'atom file validation', 'atom master file', 'atom template validation',
        "data upload", "file validation", "master file", "template validation", "column classification",
        "identifiers", "measures", "dimensions mapping", "promo analysis", "marketing mix modeling",
        "category forecasting", "data preprocessing", "MinIO storage", "MongoDB logging", "data governance"
    ],
    "semantic_markers": [
        "data_validation", "column_classification", "business_dimensions", "template_mapping", "file_consistency", "data_integrity"
    ],
    "category": "data_governance",
    "priority_score": 1.0,
    "function_type": "data_validation",
    "working_process": (
        "User either uploads a custom master file or selects from pre-built templates. The system analyzes the structure, classifies columns into identifiers and measures, "
        "maps identifiers to business dimensions (e.g., Product, Market, Time), and builds validation rules. All configurations are stored in MinIO and MongoDB for audit and reuse. "
        "Future uploads are auto-validated for schema consistency, missing fields, and mapping alignment."
    ),
    "output": (
        "Validated master schema, column classification report, dimension mapping configuration, validation rules for future files, MinIO storage confirmation, "
        "MongoDB logs, and pre-configured templates (if used)."
    ),
    "when_to_use": (
        "As the first step in any analytics pipeline to ensure consistent file formats, schema validation, and column mapping for downstream processing."
    ),
    "how_it_helps": (
        "Eliminates data inconsistencies, automates validation, reduces manual preprocessing, and ensures quality and governance across datasets."
    ),
    "example_user_prompts": [
        "Upload my master sales file and validate all future uploads against it.",
        "Set up promo analysis validation using a pre-built template.",
        "Classify and validate columns in my marketing mix data.",
        "Define product and market dimensions from my master file for forecasting.",
        "Ensure all future campaign files follow the same schema."
    ]
},"text_box": {
    "display_name": "Text Box",
    "description": (
        "The Text Box Atom allows users to input or edit custom text or markdown content, enabling annotation, contextual notes, or documentation alongside data analysis."
    ),
    "unique_keywords": ["atom textbox", "text input", "add note", "markdown box", "write comment", "text annotation"],
    "semantic_markers": ["text_entry", "annotation", "markdown_input"],
    "category": "ui_tools",
    "priority_score": 0.5,
    "function_type": "text_annotation",
    "working_process": "User enters text or markdown to document insights, assumptions, or commentary.",
    "output": "Rendered markdown or plain text block for display.",
    "when_to_use": "To provide contextual commentary or explanations in workflows.",
    "how_it_helps": "Helps users track assumptions and communicate insights effectively.",
    "example_user_prompts": [
        "Add a note explaining the sales drop in Q2.",
        "Insert markdown with the summary of this model output."
    ]
},"correlation": {
    "display_name": "Correlation",
    "description": (
        "Computes correlation matrices between numerical variables to identify linear relationships, supporting Pearson, Spearman, or Kendall correlation."
    ),
    "unique_keywords": ["correlation", "relationship", "linear relationship", "pearson", "spearman", "kendall", "correlation matrix"],
    "semantic_markers": ["feature_relationship", "correlation_analysis"],
    "category": "data_analysis",
    "priority_score": 0.9,
    "function_type": "data_analysis",
    "working_process": "User selects columns; atom computes correlation coefficients and optionally shows heatmaps.",
    "output": "Correlation matrix and optional visualizations.",
    "when_to_use": "To identify multicollinearity or understand variable interactions.",
    "how_it_helps": "Assists in feature selection and understanding dependencies.",
    "example_user_prompts": [
        "Show correlation between all numerical features.",
        "Find strongly correlated variables in my dataset."
    ]
},"scope_selector": {
    "display_name": "Scope Selector",
    "description": (
        "Allows users to define data scope filters dynamically, such as selecting date ranges, market segments, or product categories for downstream atoms."
    ),
    "unique_keywords": ["data filter", "segment selector", "date filter", "scope selector"],
    "semantic_markers": ["data_filtering", "scope_control"],
    "category": "ui_tools",
    "priority_score": 0.7,
    "function_type": "data_filtering",
    "working_process": "User selects filtering dimensions which restrict data flowing to other atoms.",
    "output": "Scoped data subset based on selected criteria.",
    "when_to_use": "Before performing analysis that should be limited to specific segments.",
    "how_it_helps": "Improves focus and accuracy of analysis by narrowing data scope.",
    "example_user_prompts": [
        "Filter data to only North region and 2024 Q1.",
        "Limit analysis to Product A only."
    ]
},"row_operations": {
    "display_name": "Row Operations",
    "description": (
        "Allows users to perform custom row-level operations like filtering, deleting, editing values, or applying lambda functions on rows."
    ),
    "unique_keywords": ["edit row", "lambda function", "delete row", "row transform", "row operations", "custom row logic"],
    "semantic_markers": ["row_level_operations", "data_editing"],
    "category": "data_cleaning",
    "priority_score": 0.8,
    "function_type": "data_processing",
    "working_process": "User selects rows or conditions and applies transformations or filters.",
    "output": "Modified dataset with row-level changes.",
    "when_to_use": "To clean, filter, or manually edit specific rows.",
    "how_it_helps": "Supports granular control over data quality and business logic.",
    "example_user_prompts": [
        "Delete all rows where sales < 0.",
        "Apply lambda to flag high-revenue rows."
    ]
},"base_price_estimator": {
    "display_name": "Base Price Estimator",
    "description": (
        "Estimates the underlying base price of a product after removing promotional effects using statistical techniques or regression models."
    ),
    "unique_keywords": ["base price", "price decomposition", "price estimator", "non-promo price"],
    "semantic_markers": ["price_analysis", "base_price_estimation"],
    "category": "pricing_analysis",
    "priority_score": 1.0,
    "function_type": "price_modeling",
    "working_process": "User provides sales and price data with promo flags. Atom estimates base price using regression or smoothing.",
    "output": "Base price series for each product/region.",
    "when_to_use": "Before modeling or planning to isolate promotion impact.",
    "how_it_helps": "Supports clean separation of base vs promo pricing for accurate elasticity or uplift modeling.",
    "example_user_prompts": [
        "Estimate base price from historical data ignoring promo periods.",
        "What is the true base price for Product X in 2024?"
    ]
},"promo_estimator": {
    "display_name": "Promo Estimator",
    "description": (
        "Measures the uplift or impact of promotional events on sales using causal inference or regression models."
    ),
    "unique_keywords": ["promo uplift", "promotion impact", "campaign evaluation", "promotion estimator"],
    "semantic_markers": ["promotion_analysis", "uplift_modeling"],
    "category": "marketing_analytics",
    "priority_score": 1.0,
    "function_type": "promo_modeling",
    "working_process": "User inputs sales, spend, and promo flags. Atom estimates lift using time-series or counterfactual models.",
    "output": "Estimated uplift, baseline, and promo ROI metrics.",
    "when_to_use": "To evaluate effectiveness of past promotional campaigns.",
    "how_it_helps": "Quantifies incremental gains from promotions and supports budget allocation.",
    "example_user_prompts": [
        "Measure sales uplift from the August promo.",
        "Estimate promo ROI for Product Y in Q3."
    ]
},"promo_estimator": {
    "display_name": "Promo Estimator",
    "description": (
        "Measures the uplift or impact of promotional events on sales using causal inference or regression models."
    ),
    "unique_keywords": ["promo uplift", "promotion impact", "campaign evaluation", "promotion estimator"],
    "semantic_markers": ["promotion_analysis", "uplift_modeling"],
    "category": "marketing_analytics",
    "priority_score": 1.0,
    "function_type": "promo_modeling",
    "working_process": "User inputs sales, spend, and promo flags. Atom estimates lift using time-series or counterfactual models.",
    "output": "Estimated uplift, baseline, and promo ROI metrics.",
    "when_to_use": "To evaluate effectiveness of past promotional campaigns.",
    "how_it_helps": "Quantifies incremental gains from promotions and supports budget allocation.",
    "example_user_prompts": [
        "Measure sales uplift from the August promo.",
        "Estimate promo ROI for Product Y in Q3."
    ]
},
"explore": {
    "display_name": "Explore",
    "description": (
        "Explore allows users to interactively browse and understand data distributions, missing values, and basic statistics, helping identify data issues early."
    ),
    "unique_keywords": [
        "atom explore", "data exploration", "data browser", "missing values", "summary statistics", "column profile", "EDA"
    ],
    "semantic_markers": ["data_exploration", "eda", "summary_analysis"],
    "category": "data_analysis",
    "priority_score": 0.9,
    "function_type": "data_exploration",
    "working_process": "User selects a dataset. Atom profiles each column, identifies types, missingness, and distributions.",
    "output": "Column-wise summaries, missing value reports, and datatype inferences.",
    "when_to_use": "Right after data upload, before any modeling or transformation.",
    "how_it_helps": "Quickly reveals data quality issues and guides preprocessing.",
    "example_user_prompts": [
        "Explore the uploaded dataset and summarize each column.",
        "Check for missing values and types in my sales data."
    ]
},"groupby_with_wtg_avg": {
    "display_name": "GroupBy with Wtg Avg",
    "description": (
        "Performs aggregation using group-by operations across dimensions and computes weighted averages using specified weights."
    ),
    "unique_keywords": [
        "atom groupby with wtg avg", "weighted average", "group by", "dimension summary", "aggregate by segment", "wt avg"
    ],
    "semantic_markers": ["aggregation", "weighted_grouping", "segment_summary"],
    "category": "aggregation",
    "priority_score": 1.0,
    "function_type": "data_aggregation",
    "working_process": "User provides grouping columns, metrics, and weights. Atom returns grouped and weighted summaries.",
    "output": "Aggregated table with weighted averages and totals.",
    "when_to_use": "For reporting KPIs or segment summaries using weighted metrics.",
    "how_it_helps": "Produces accurate segment metrics when simple averages aren’t sufficient.",
    "example_user_prompts": [
        "Group sales by region and product and show weighted average price.",
        "Summarize units sold with weighted revenue across channels."
    ]
},"regression_feature_based": {
    "display_name": "Regression - Feature Based",
    "description": (
        "Fits regression models using manually engineered features. Suitable for structured business data and hypothesis-driven modeling."
    ),
    "unique_keywords": [
        "atom regression feature based", "linear regression", "feature model", "regression with predictors", "OLS", "manual regression"
    ],
    "semantic_markers": ["regression_modeling", "manual_features", "predictive_model"],
    "category": "modeling",
    "priority_score": 1.0,
    "function_type": "model_training",
    "working_process": "User selects outcome and predictors. Atom fits and returns model stats, coefficients, and predictions.",
    "output": "Model coefficients, goodness-of-fit metrics, and predictions.",
    "when_to_use": "When testing the impact of selected features on outcomes.",
    "how_it_helps": "Explains variable influence and builds interpretable predictive models.",
    "example_user_prompts": [
        "Fit a regression model using spend and price as predictors.",
        "Show coefficient impact of marketing variables on sales."
    ]
},"select_models_feature_based": {
    "display_name": "Select Models - Feature Based",
    "description": (
        "Helps users choose the best performing feature-based regression models using techniques like forward selection, cross-validation, and AIC/BIC."
    ),
    "unique_keywords": [
        "atom select models feature based", "model selection", "feature selection", "choose regression model", "best model"
    ],
    "semantic_markers": ["model_selection", "feature_screening", "regression_optimization"],
    "category": "modeling",
    "priority_score": 0.9,
    "function_type": "model_selection",
    "working_process": "Atom tests combinations of features and selects the optimal regression model.",
    "output": "Best model summary, chosen features, and performance metrics.",
    "when_to_use": "When you have many predictors and need the most predictive subset.",
    "how_it_helps": "Improves model performance and prevents overfitting.",
    "example_user_prompts": [
        "Select the best model from my feature list.",
        "Choose top predictors using AIC."
    ]
},"evaluate_models_feature_based": {
    "display_name": "Evaluate Models - Feature Based",
    "description": (
        "Evaluates performance of trained feature-based regression models using metrics like RMSE, MAPE, R-squared, and cross-validation."
    ),
    "unique_keywords": [
        "atom evaluate models feature based", "model evaluation", "regression metrics", "model scoring", "MAPE", "RMSE", "R2"
    ],
    "semantic_markers": ["model_evaluation", "feature_model_metrics"],
    "category": "modeling",
    "priority_score": 0.9,
    "function_type": "model_evaluation",
    "working_process": "Takes model and test data, computes evaluation scores and visual diagnostics.",
    "output": "Performance metrics, plots (residuals, predicted vs actual).",
    "when_to_use": "After training a feature-based model to assess quality.",
    "how_it_helps": "Quantifies model accuracy and guides improvement.",
    "example_user_prompts": [
        "Evaluate my sales regression model with test data.",
        "Show MAPE and R-squared for the selected model."
    ]
},"auto_regressive_models": {
    "display_name": "Auto-regressive Models",
    "description": (
        "Fits time-series models like AR, ARIMA, SARIMA to capture trends, seasonality, and auto-correlations for forecasting."
    ),
    "unique_keywords": [
        "atom auto regressive models", "time series model", "ARIMA", "SARIMA", "forecast model", "lag features", "seasonality"
    ],
    "semantic_markers": ["time_series_modeling", "forecasting", "autocorrelation"],
    "category": "modeling",
    "priority_score": 1.0,
    "function_type": "model_training",
    "working_process": "User selects time column and series. Atom fits AR/ARIMA-based models and returns diagnostics.",
    "output": "Fitted models, residual analysis, forecasts, and confidence intervals.",
    "when_to_use": "For forecasting structured time-series data with historical patterns.",
    "how_it_helps": "Captures lag dependencies and recurring patterns for better forecasting.",
    "example_user_prompts": [
        "Build a monthly ARIMA model for sales.",
        "Forecast next 3 months using auto-regression."
    ]
},"select_models_auto_regressive": {
    "display_name": "Select Models - Auto Regressive",
    "description": (
        "Chooses the best auto-regressive model using AIC/BIC criteria, auto-ARIMA grid search, or seasonal decomposition."
    ),
    "unique_keywords": [
        "atom select models auto regressive", "auto arima", "select time series model", "best forecast model", "model grid"
    ],
    "semantic_markers": ["model_selection", "time_series_tuning"],
    "category": "modeling",
    "priority_score": 0.9,
    "function_type": "model_selection",
    "working_process": "Runs multiple ARIMA variants and selects the optimal model based on criteria.",
    "output": "Selected model summary and hyperparameters.",
    "when_to_use": "When choosing between many ARIMA configurations for forecasting.",
    "how_it_helps": "Automates model tuning and improves forecast accuracy.",
    "example_user_prompts": [
        "Auto-select the best ARIMA model for my sales data.",
        "Optimize my forecast model using AIC."
    ]
},"evaluate_models_auto_regressive": {
    "display_name": "Evaluate Models - Auto Regressive",
    "description": (
        "Evaluates performance of auto-regressive time-series models using WMAPE, MASE, and residual plots."
    ),
    "unique_keywords": [
        "atom evaluate models auto regressive", "forecast evaluation", "time series scoring", "WMAPE", "MASE", "residual analysis"
    ],
    "semantic_markers": ["forecast_evaluation", "time_series_metrics"],
    "category": "modeling",
    "priority_score": 0.9,
    "function_type": "model_evaluation",
    "working_process": "Computes performance metrics for fitted AR/ARIMA models over test data.",
    "output": "Forecast errors, visual diagnostics, and scoring summary.",
    "when_to_use": "After training a time-series model to check forecasting quality.",
    "how_it_helps": "Identifies errors and improves time-series model fit.",
    "example_user_prompts": [
        "Evaluate ARIMA model for accuracy.",
        "Show WMAPE for the forecasted series."
    ]
},"scenario_planner": {
    "display_name": "Scenario Planner",
    "description": (
        "Enables simulation of business outcomes under different assumptions, allowing users to test 'what-if' scenarios for planning."
    ),
    "unique_keywords": [
        "atom scenario planner", "what-if analysis", "business scenario", "planning tool", "input simulator", "scenario testing"
    ],
    "semantic_markers": ["scenario_analysis", "forecast_planning"],
    "category": "decision_support",
    "priority_score": 1.0,
    "function_type": "planning",
    "working_process": "User adjusts key variables (like price, spend). Atom simulates output using existing models or rules.",
    "output": "Simulated business outcomes under changed assumptions.",
    "when_to_use": "To evaluate the impact of decisions before implementation.",
    "how_it_helps": "Supports strategic planning and risk mitigation.",
    "example_user_prompts": [
        "Simulate what happens if price is reduced by 10%.",
        "Show scenario with doubled marketing spend."
    ]
},"optimizer": {
    "display_name": "Optimizer",
    "description": (
        "Solves constrained optimization problems, such as maximizing sales or minimizing cost, using models and business constraints."
    ),
    "unique_keywords": [
        "atom optimizer", "business optimization", "maximize sales", "minimize spend", "resource allocation", "optimal plan"
    ],
    "semantic_markers": ["optimization", "constraint_solver", "business_planning"],
    "category": "decision_support",
    "priority_score": 1.0,
    "function_type": "optimization",
    "working_process": "User defines objective, constraints, and variables. Atom finds the best feasible solution.",
    "output": "Optimal values of decision variables and objective function.",
    "when_to_use": "To generate best-case plans under budget, capacity, or ROI constraints.",
    "how_it_helps": "Automates strategic decision-making to meet goals efficiently.",
    "example_user_prompts": [
        "Find optimal spend allocation to maximize revenue.",
        "Optimize campaign mix under a $1M budget."
    ]
}


    }

    @classmethod
    def get_all_atoms(cls) -> List[str]:
        return list(cls.UNIQUE_ATOM_KNOWLEDGE.keys())

    @classmethod
    def get_atom_info(cls, atom_name: str) -> Optional[Dict]:
        canon = canonicalize(atom_name)
        return cls.UNIQUE_ATOM_KNOWLEDGE.get(canon)

class HybridAtomRetriever:
    def __init__(
        self,
        documents: List[AtomDocument],
        *,
        model_name: str = "all-MiniLM-L6-v2",
        lexical_weight: float = 0.6,
        tfidf_weight: float = 0.4,
        hybrid_weight: float = 0.5,
    ):
        self.documents = documents
        self.doc_lookup = {doc.doc_id: doc for doc in documents}
        self.doc_index = {doc.doc_id: idx for idx, doc in enumerate(documents)}
        self.index_to_doc_id = {idx: doc.doc_id for idx, doc in enumerate(documents)}
        self.lexical_weight = lexical_weight
        self.tfidf_weight = tfidf_weight
        self.hybrid_weight = hybrid_weight
        self.embedding_model = SentenceTransformer(model_name)
        self.embedding_cache: Dict[str, np.ndarray] = {}
        self.query_embedding_cache: Dict[str, np.ndarray] = {}
        self.observability_traces: List[Dict[str, Any]] = []
        self._prepare_corpus()

    def _prepare_corpus(self) -> None:
        self.normalized_corpus = [doc.corpus_text for doc in self.documents]
        self.tokenized_corpus = [text.split() for text in self.normalized_corpus]
        self.bm25 = BM25Okapi(self.tokenized_corpus)

        min_df = 2 if len(self.documents) >= 2 else 1
        self.tfidf_vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=min_df)
        self.tfidf_matrix = self.tfidf_vectorizer.fit_transform(self.normalized_corpus)

        self._embed_corpus()

    def _embed_corpus(self) -> None:
        embeddings = self.embedding_model.encode(
            self.normalized_corpus,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        embeddings = l2_normalize(np.asarray(embeddings))
        self.doc_embeddings = embeddings.astype(np.float32)

        base_index = faiss.IndexFlatIP(self.doc_embeddings.shape[1])
        self.faiss_index = faiss.IndexIDMap(base_index)
        ids = np.array(list(self.index_to_doc_id.keys()), dtype=np.int64)
        self.faiss_index.add_with_ids(self.doc_embeddings, ids)

        for idx, doc in enumerate(self.documents):
            self.embedding_cache[doc.doc_id] = self.doc_embeddings[idx]

    def _normalize_scores(self, scores: Dict[str, float]) -> Dict[str, float]:
        if not scores:
            return {}
        values = np.array(list(scores.values()), dtype=np.float32)
        min_val, max_val = values.min(), values.max()
        if np.isclose(min_val, max_val):
            normalized = np.ones_like(values)
        else:
            normalized = (values - min_val) / (max_val - min_val)
        return dict(zip(scores.keys(), normalized.tolist()))

    def _lexical_shortlist(self, normalized_query: str, k: int = 200) -> Dict[str, Dict[str, float]]:
        tokens = normalized_query.split()
        bm25_scores = dict(zip(self.doc_lookup.keys(), self.bm25.get_scores(tokens)))

        tfidf_vector = self.tfidf_vectorizer.transform([normalized_query])
        tfidf_scores = dict(
            zip(
                self.doc_lookup.keys(),
                cosine_similarity(tfidf_vector, self.tfidf_matrix).ravel().tolist(),
            )
        )

        bm25_norm = self._normalize_scores(bm25_scores)
        tfidf_norm = self._normalize_scores(tfidf_scores)

        combined_scores: Dict[str, Dict[str, float]] = {}
        for doc_id in self.doc_lookup:
            score = self.lexical_weight * bm25_norm.get(doc_id, 0.0) + self.tfidf_weight * tfidf_norm.get(doc_id, 0.0)
            combined_scores[doc_id] = {
                "bm25": bm25_norm.get(doc_id, 0.0),
                "tfidf": tfidf_norm.get(doc_id, 0.0),
                "lexical_score": score,
            }

        shortlist = dict(
            sorted(combined_scores.items(), key=lambda item: item[1]["lexical_score"], reverse=True)[:k]
        )
        return shortlist

    def _get_query_embedding(self, normalized_query: str) -> np.ndarray:
        cached = self.query_embedding_cache.get(normalized_query)
        if cached is not None:
            return cached

        embedding = self.embedding_model.encode(
            [normalized_query],
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )[0]
        normalized = l2_normalize(embedding.reshape(1, -1)).astype(np.float32)[0]
        self.query_embedding_cache[normalized_query] = normalized
        return normalized

    def _embedding_scores(self, query_embedding: np.ndarray, shortlist: Dict[str, Dict[str, float]], top_m: int = 80) -> Dict[str, float]:
        if not shortlist:
            return {}

        search_k = min(max(top_m * 3, top_m), len(self.documents))
        distances, indices = self.faiss_index.search(query_embedding.reshape(1, -1), search_k)

        filtered: Dict[str, float] = {}
        for idx, score in zip(indices[0], distances[0]):
            if idx == -1:
                continue
            doc_id = self.index_to_doc_id.get(int(idx))
            if doc_id not in shortlist:
                continue
            filtered[doc_id] = float(score)
            if len(filtered) >= top_m:
                break

        return filtered

    def _combine_scores(
        self,
        lexical_scores: Dict[str, Dict[str, float]],
        embedding_scores: Dict[str, float],
        top_n: int = 30,
    ) -> List[Dict[str, Any]]:
        if not lexical_scores:
            return []

        lexical_norm = self._normalize_scores({k: v["lexical_score"] for k, v in lexical_scores.items()})
        embed_norm = self._normalize_scores(embedding_scores)

        combined = []
        for doc_id in lexical_scores:
            hybrid_score = self.hybrid_weight * lexical_norm.get(doc_id, 0.0) + (1 - self.hybrid_weight) * embed_norm.get(doc_id, 0.0)
            combined.append(
                {
                    "doc_id": doc_id,
                    "document": self.doc_lookup[doc_id],
                    "scores": {
                        "lexical": lexical_norm.get(doc_id, 0.0),
                        "embedding": embed_norm.get(doc_id, 0.0),
                        "hybrid_score": hybrid_score,
                        "bm25": lexical_scores[doc_id]["bm25"],
                        "tfidf": lexical_scores[doc_id]["tfidf"],
                    },
                }
            )

        combined_sorted = sorted(combined, key=lambda item: item["scores"]["hybrid_score"], reverse=True)[:top_n]
        return combined_sorted

    def _keyword_overlap(self, normalized_query: str, keywords: List[str]) -> float:
        query_terms = set(normalized_query.split())
        keyword_terms = {normalize_text(word) for word in keywords}
        return len(query_terms.intersection(keyword_terms)) / max(len(keyword_terms), 1)

    def _generate_atom_insights(self, document: AtomDocument, query: str, scores: Dict[str, float]) -> List[str]:
        metadata = document.metadata
        insights = [
            f"{document.title} focuses on {metadata.get('category', 'general analysis')} and is suited for {metadata.get('function_type', 'data tasks')}.",
        ]

        when_to_use = metadata.get("when_to_use")
        if when_to_use:
            insights.append(f"Use it when: {when_to_use}")

        how_it_helps = metadata.get("how_it_helps")
        if how_it_helps:
            insights.append(f"Business impact: {how_it_helps}")

        working_process = metadata.get("working_process")
        if working_process:
            insights.append(f"Execution plan: {working_process[:240]}")

        insights.append(
            f"ReAct focus: align the next tool call with {document.title} and favor evidence from lexical={scores.get('lexical', 0):.2f}, embedding={scores.get('embedding', 0):.2f}."
        )
        return insights

    def _rerank_with_llm(self, normalized_query: str, candidates: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
        reranked = []
        for candidate in candidates[: max(top_k, 10)]:
            doc = candidate["document"]
            metadata = doc.metadata
            priority = float(metadata.get("priority_score", 1.0))
            overlap = self._keyword_overlap(normalized_query, metadata.get("unique_keywords", []))
            business_bias = 0.2 * priority + 0.3 * overlap
            rerank_score = candidate["scores"]["hybrid_score"] * 0.7 + business_bias

            reranked.append(
                {
                    **candidate,
                    "scores": {**candidate["scores"], "rerank_score": rerank_score},
                    "insights": self._generate_atom_insights(doc, normalized_query, candidate["scores"]),
                }
            )

        reranked_sorted = sorted(reranked, key=lambda item: item["scores"]["rerank_score"], reverse=True)
        return reranked_sorted[:top_k]

    def retrieve(
        self,
        query: str,
        *,
        shortlist_k: int = 200,
        embed_top_m: int = 80,
        hybrid_top_n: int = 30,
        final_top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        normalized_query = normalize_text(query)
        lexical_shortlist = self._lexical_shortlist(normalized_query, shortlist_k)
        query_embedding = self._get_query_embedding(normalized_query)
        embedding_scores = self._embedding_scores(query_embedding, lexical_shortlist, top_m=embed_top_m)
        combined = self._combine_scores(lexical_shortlist, embedding_scores, top_n=hybrid_top_n)
        reranked = self._rerank_with_llm(normalized_query, combined, final_top_k)

        trace = {
            "query": query,
            "normalized_query": normalized_query,
            "lexical_shortlist": list(lexical_shortlist.keys()),
            "embedding_candidates": list(embedding_scores.keys()),
            "final_candidates": [item["doc_id"] for item in reranked],
        }
        self.observability_traces.append(trace)
        return reranked

    def get_index_stats(self) -> Dict[str, Any]:
        return {
            "documents_indexed": len(self.documents),
            "embedding_dimensions": int(self.doc_embeddings.shape[1]),
            "cached_queries": len(self.query_embedding_cache),
            "cached_documents": len(self.embedding_cache),
        }

    def get_traces(self) -> List[Dict[str, Any]]:
        return self.observability_traces[-25:]


class RAGRetriever:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", embeddings_file: str = "atom_rag_embeddings.pkl"):
        self.embeddings_file = embeddings_file
        self.documents = self._build_documents()
        self.pipeline = HybridAtomRetriever(self.documents, model_name=model_name)

    def _build_documents(self) -> List[AtomDocument]:
        documents: List[AtomDocument] = []
        for atom_name, atom_info in AtomKnowledgeBase.UNIQUE_ATOM_KNOWLEDGE.items():
            canon_name = canonicalize(atom_name)
            body_parts = [
                atom_info.get("description", ""),
                " ".join(atom_info.get("unique_keywords", [])),
                " ".join(atom_info.get("semantic_markers", [])),
            ]
            body = " ".join([part for part in body_parts if part])
            documents.append(
                AtomDocument(
                    doc_id=canon_name,
                    title=atom_info.get("display_name", atom_name),
                    body=body,
                    metadata=atom_info,
                )
            )
        return documents

    def retrieve_relevant_atoms(self, query: str, top_k: int = 5, min_score: float = 0.1) -> List[Dict]:
        results = self.pipeline.retrieve(query, final_top_k=top_k)
        enriched_results = []
        for result in results:
            if result["scores"]["hybrid_score"] < min_score:
                continue
            doc = result["document"]
            metadata = doc.metadata
            enriched_results.append(
                {
                    "atom": doc.doc_id,
                    "display_name": doc.title,
                    "description": metadata.get("description", doc.body),
                    "unique_keywords": metadata.get("unique_keywords", []),
                    "semantic_markers": metadata.get("semantic_markers", []),
                    "category": metadata.get("category"),
                    "function_type": metadata.get("function_type"),
                    "priority_score": metadata.get("priority_score", 0),
                    "working_process": metadata.get("working_process", ""),
                    "output": metadata.get("output", ""),
                    "when_to_use": metadata.get("when_to_use", ""),
                    "how_it_helps": metadata.get("how_it_helps", ""),
                    "example_user_prompts": metadata.get("example_user_prompts", []),
                    "scores": result["scores"],
                    "insights": result.get("insights", []),
                }
            )

        return enriched_results

    def get_system_stats(self) -> Dict:
        stats = self.pipeline.get_index_stats()
        stats.update({"total_atoms": len(self.documents), "embeddings_file": self.embeddings_file})
        return stats
