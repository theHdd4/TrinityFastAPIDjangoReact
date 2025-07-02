import json
import pickle
import os
import numpy as np
from typing import List, Dict, Optional
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime
import re

def canonicalize(text: str) -> str:
    return re.sub(r"\s+", "", text.lower())

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

class RAGRetriever:
    def __init__(self, model_name: str = './models/all-MiniLM-L6-v2', embeddings_file: str = "atom_rag_embeddings.pkl"):
        self.model = SentenceTransformer(model_name)
        self.embeddings_file = embeddings_file
        self.atom_embeddings = None
        self.atom_texts = []
        self.keyword_index = {}
        self.semantic_index = {}
        self.category_index = {}
        self.function_type_index = {}
        self.setup_rag_system()

    def setup_rag_system(self):
        print("🔄 Setting up RAG system...")
        if os.path.exists(self.embeddings_file):
            try:
                self._load_embeddings()
                print("✅ Loaded existing RAG embeddings")
            except Exception as e:
                print(f"⚠️ Failed to load embeddings: {e}, recreating...")
                self._create_embeddings()
        else:
            self._create_embeddings()

    def _create_embeddings(self):
        print("🔄 Creating RAG embeddings and indexes...")
        self.atom_texts = []
        self.keyword_index = {}
        self.semantic_index = {}
        self.category_index = {}
        self.function_type_index = {}

        knowledge_base = AtomKnowledgeBase.UNIQUE_ATOM_KNOWLEDGE
        for atom_name, atom_info in knowledge_base.items():
            text_parts = [
                f"Function: {atom_name}",
                f"Description: {atom_info['description']}",
                f"Keywords: {', '.join(atom_info['unique_keywords'])}",
                f"Semantic markers: {', '.join(atom_info['semantic_markers'])}",
                f"Category: {atom_info['category']}",
                f"Function type: {atom_info['function_type']}",
                f"Working process: {atom_info.get('working_process', '')}",
                f"Output: {atom_info.get('output', '')}",
                f"When to use: {atom_info.get('when_to_use', '')}",
                f"How it helps: {atom_info.get('how_it_helps', '')}",
                f"Examples: {', '.join(atom_info.get('example_user_prompts', []))}"
            ]
            full_text = ". ".join(text_parts)
            self.atom_texts.append(full_text)

            canon_name = canonicalize(atom_name)
            for keyword in atom_info['unique_keywords']:
                canon_kw = canonicalize(keyword)
                if canon_kw not in self.keyword_index:
                    self.keyword_index[canon_kw] = []
                self.keyword_index[canon_kw].append(canon_name)
            for marker in atom_info['semantic_markers']:
                canon_marker = canonicalize(marker)
                if canon_marker not in self.semantic_index:
                    self.semantic_index[canon_marker] = []
                self.semantic_index[canon_marker].append(canon_name)
            canon_cat = canonicalize(atom_info['category'])
            if canon_cat not in self.category_index:
                self.category_index[canon_cat] = []
            self.category_index[canon_cat].append(canon_name)
            canon_ft = canonicalize(atom_info['function_type'])
            if canon_ft not in self.function_type_index:
                self.function_type_index[canon_ft] = []
            self.function_type_index[canon_ft].append(canon_name)

        print("🔄 Generating embeddings...")
        self.atom_embeddings = self.model.encode(self.atom_texts)
        self._save_embeddings()
        print("✅ Created and saved RAG system")

    def _save_embeddings(self):
        try:
            with open(self.embeddings_file, 'wb') as f:
                pickle.dump({
                    'embeddings': self.atom_embeddings,
                    'texts': self.atom_texts,
                    'keyword_index': self.keyword_index,
                    'semantic_index': self.semantic_index,
                    'category_index': self.category_index,
                    'function_type_index': self.function_type_index,
                    'created_at': datetime.now().isoformat()
                }, f)
            print("✅ Saved RAG embeddings and indexes")
        except Exception as e:
            print(f"⚠️ Failed to save embeddings: {e}")

    def _load_embeddings(self):
        with open(self.embeddings_file, 'rb') as f:
            data = pickle.load(f)
            self.atom_embeddings = data['embeddings']
            self.atom_texts = data['texts']
            self.keyword_index = data['keyword_index']
            self.semantic_index = data['semantic_index']
            self.category_index = data['category_index']
            self.function_type_index = data['function_type_index']

    def retrieve_relevant_atoms(self, query: str, top_k: int = 5, min_score: float = 0.1) -> List[Dict]:
        if self.atom_embeddings is None:
            print("❌ RAG system not initialized")
            return []

        print(f"🔍 Retrieving atoms for query: '{query}'")
        query_lower = query.lower()
        query_words = set(re.findall(r'\b\w+\b', query_lower))
        all_matches = {}

        # Strategy 1: Exact keyword matching (case/space-insensitive)
        print("🎯 Strategy 1: Exact keyword matching")
        for word in query_words:
            canon_word = canonicalize(word)
            if canon_word in self.keyword_index:
                for canon_atom in self.keyword_index[canon_word]:
                    atom_info = AtomKnowledgeBase.get_atom_info(canon_atom)
                    score = atom_info['priority_score'] * 1.0
                    if canon_atom not in all_matches or score > all_matches[canon_atom]['score']:
                        all_matches[canon_atom] = {
                            'atom': canon_atom,
                            'score': score,
                            'match_type': 'exact_keyword',
                            'matched_term': word,
                            'strategy': 'keyword_matching'
                        }
                        print(f"  ✅ Found exact match: {canon_atom} (score: {score:.3f}, keyword: {word})")

        # Strategy 2: Semantic marker matching
        print("🎯 Strategy 2: Semantic marker matching")
        for marker in self.semantic_index:
            marker_words = set(re.findall(r'\b\w+\b', marker))
            if marker_words.intersection({canonicalize(w) for w in query_words}):
                for canon_atom in self.semantic_index[marker]:
                    atom_info = AtomKnowledgeBase.get_atom_info(canon_atom)
                    score = atom_info['priority_score'] * 0.8
                    if canon_atom not in all_matches or score > all_matches[canon_atom]['score']:
                        all_matches[canon_atom] = {
                            'atom': canon_atom,
                            'score': score,
                            'match_type': 'semantic_marker',
                            'matched_term': marker,
                            'strategy': 'semantic_matching'
                        }
                        print(f"  ✅ Found semantic match: {canon_atom} (score: {score:.3f}, marker: {marker})")

        # Strategy 3: Category matching
        print("🎯 Strategy 3: Category matching")
        for category in self.category_index:
            category_words = set(re.findall(r'\b\w+\b', category))
            if category_words.intersection({canonicalize(w) for w in query_words}):
                for canon_atom in self.category_index[category]:
                    atom_info = AtomKnowledgeBase.get_atom_info(canon_atom)
                    score = atom_info['priority_score'] * 0.6
                    if canon_atom not in all_matches:
                        all_matches[canon_atom] = {
                            'atom': canon_atom,
                            'score': score,
                            'match_type': 'category_match',
                            'matched_term': category,
                            'strategy': 'category_matching'
                        }
                        print(f"  ✅ Found category match: {canon_atom} (score: {score:.3f}, category: {category})")

        # Strategy 4: Embedding similarity
        print("🎯 Strategy 4: Embedding similarity")
        query_embedding = self.model.encode([query])
        similarities = cosine_similarity(query_embedding, self.atom_embeddings)[0]
        atom_names = AtomKnowledgeBase.get_all_atoms()
        for idx, similarity in enumerate(similarities):
            if similarity > min_score:
                canon_atom = atom_names[idx]
                atom_info = AtomKnowledgeBase.get_atom_info(canon_atom)
                score = similarity * atom_info['priority_score'] * 0.7
                if canon_atom not in all_matches:
                    all_matches[canon_atom] = {
                        'atom': canon_atom,
                        'score': score,
                        'match_type': 'embedding_similarity',
                        'matched_term': f'semantic_similarity_{similarity:.3f}',
                        'strategy': 'embedding_matching'
                    }
                    print(f"  ✅ Found embedding match: {canon_atom} (score: {score:.3f}, similarity: {similarity:.3f})")

        sorted_matches = sorted(all_matches.values(), key=lambda x: x['score'], reverse=True)
        top_matches = sorted_matches[:top_k]

        # Enrich with full atom information and use display_name for output
        enriched_results = []
        for match in top_matches:
            atom_info = AtomKnowledgeBase.get_atom_info(match['atom'])
            enriched_match = {
                **match,
                'display_name': atom_info.get('display_name', match['atom']),
                'description': atom_info['description'],
                'unique_keywords': atom_info['unique_keywords'],
                'semantic_markers': atom_info['semantic_markers'],
                'category': atom_info['category'],
                'function_type': atom_info['function_type'],
                'priority_score': atom_info['priority_score'],
                'working_process': atom_info.get('working_process', ''),
                'output': atom_info.get('output', ''),
                'when_to_use': atom_info.get('when_to_use', ''),
                'how_it_helps': atom_info.get('how_it_helps', ''),
                'example_user_prompts': atom_info.get('example_user_prompts', [])
            }
            enriched_results.append(enriched_match)

        print(f"🎯 Final results: {len(enriched_results)} atoms retrieved")
        return enriched_results

    def get_system_stats(self) -> Dict:
        return {
            'total_atoms': len(AtomKnowledgeBase.get_all_atoms()),
            'total_keywords': len(self.keyword_index),
            'total_semantic_markers': len(self.semantic_index),
            'total_categories': len(self.category_index),
            'total_function_types': len(self.function_type_index),
            'embedding_dimensions': self.atom_embeddings.shape[1] if self.atom_embeddings is not None else 0,
            'embeddings_file': self.embeddings_file
        }
