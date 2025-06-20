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
                "A modular, API-driven pipeline for dynamic data exploration, filtering, and interactive chart creation. "
                "ChartMaker uses FastAPI, pandas, and Plotly to support a wide range of chart types (bar, line, area, pie, "
                "histogram, distplot, waterfall, heatmap, subplots) and robust data filtering. It enables users to upload "
                "CSV/Excel, apply categorical/numerical filters, and generate custom, interactive visualizations for analytics "
                "workflows. ChartMaker also provides metadata extraction for UI filtering and returns structured API responses "
                "for frontend integration. This tool is strictly for data analytics and business intelligence use cases."
            ),
            "unique_keywords": [
                "Plotly", "pandas", "data visualization", "data exploration", "chart", "graph", "plot", "interactive chart",
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
            "unique_keywords": [
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
            "unique_keywords": ['aggregate', 'group by', 'grouping',
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
            "unique_keywords": [
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
            "unique_keywords": [
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
            "unique_keywords": [
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
            "unique_keywords": [
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
                "Changes the name of a column in a dataset for clarity or standardization before analysis or modeling."
            ),
            "unique_keywords": [
                "rename column", "change column name", "edit header", "relabel", "standardize column", "preprocessing", "data cleanup"
            ],
            "semantic_markers": [
                "column_renaming", "data_standardization", "header_editing"
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
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2', embeddings_file: str = "atom_rag_embeddings.pkl"):
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
