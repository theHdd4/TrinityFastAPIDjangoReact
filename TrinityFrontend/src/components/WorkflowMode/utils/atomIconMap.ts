import {
    Upload,
    FileText,
    Database,
    Link,
    Table,
    Eye,
    Filter,
    Tag,
    Plus,
    Users,
    Weight,
    Merge,
    Copy,
    Wand2,
    Focus,
    RowsIcon,
    GitBranch,
    BarChart3,
    TrendingUp,
    Activity,
    Brain,
    Target,
    CheckSquare,
    Network,
    Layers,
    Boxes,
    PieChart,
    Type,
    ScatterChart,
    BarChart4,
    Lightbulb,
    Gauge,
    Sparkles,
    FileQuestion,
    Loader,
    DollarSign,
    Tag as TagIcon,
    Calculator,
    Search,
    Crosshair,
  } from 'lucide-react';
  
  export const atomIconMap: Record<string, any> = {
    // Data Sources
    'data-upload': Upload,
    'data-validate': CheckSquare,
    'csv-import': FileText,
    'json-import': Database,
    'database-connect': Link,
    'data-table': Table,
    
    // Data Processing
    'dataframe-operations': Calculator,
    'feature-overview': Eye,
    'column-classifier': Tag,
    'create-column': Plus,
    'groupby': Users,
    'groupby-weighted-average': Weight,
    'merge': Merge,
    'concat': Copy,
    'feature-create-transform': Wand2,
    'scope-selector': Focus,
    'row-operations': RowsIcon,
    
    // Analytics
    'analytics-explorer': Search,
    'correlation': GitBranch,
    'descriptive-stats': BarChart3,
    'trend-analysis': TrendingUp,
    
    // Machine Learning
    'regression-feature-based': Activity,
    'select-models-feature': Target,
    'evaluate-models-feature': CheckSquare,
    'auto-regressive-models': Network,
    'select-models-auto-regressive': Crosshair,
    'evaluate-models-auto-regressive': Layers,
    'build-model-feature-based': Boxes,
    'clustering': Boxes,
    
    // Visualization
    'explore': Eye,
    'chart-maker': PieChart,
    'text-box': Type,
    'scatter-plot': ScatterChart,
    'histogram': BarChart4,
    
    // Planning & Optimization
    'scenario-planner': Lightbulb,
    'optimizer': Gauge,
    
    // Utilities
    'atom-maker': Sparkles,
    'read-presentation-summarize': FileQuestion,
    'demo-loading': Loader,
    
    // Business Intelligence
    'base-price-estimator': DollarSign,
    'promo-estimator': TagIcon,
  };
  