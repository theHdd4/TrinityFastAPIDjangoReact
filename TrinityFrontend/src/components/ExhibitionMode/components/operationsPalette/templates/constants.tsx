import {
  Activity,
  Users,
  TrendingUp,
  LineChart,
  BadgeDollarSign,
  Target,
  Sparkles,
  BarChart3,
  Megaphone,
  Network,
  Database,
} from 'lucide-react';
import type { TemplateDefinition } from './types';

const todaysDateLabel = () => {
  try {
    return new Date().toLocaleDateString();
  } catch {
    return 'Today';
  }
};

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    id: 'churn-prediction',
    name: 'Churn Prediction',
    description:
      'Storyboard to identify at-risk customers, highlight churn drivers, and recommend retention actions.',
    category: 'Customer Intelligence',
    tags: ['retention', 'customer-success', 'predictive'],
    icon: Activity,
    slides: [
      {
        title: 'Churn Prediction for [Brand]',
        content: {
          textBoxes: [
            {
              text: 'Churn Prediction for [Brand]',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Prepared for the retention leadership team',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#9333ea',
            },
          ],
        },
      },
      {
        title: 'Business Context',
        content: {
          textBoxes: [
            {
              text: 'Business Context',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 34,
              bold: true,
            },
            {
              text: '• Define churn problem statement\n• KPIs: retention rate, churn rate, CLV\n• Strategic goal: reduce attrition and boost loyalty\n• Visualization: infographic comparing current vs target KPIs',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Overview',
        content: {
          textBoxes: [
            {
              text: 'Data Overview',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Sources: transactions, product usage logs, support tickets\n• Customer demographics & tenure\n• Data windows and refresh cadence\n• Visualization: table or flow diagram summarising data feeds',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Modeling Approach',
        content: {
          textBoxes: [
            {
              text: 'Modeling Approach',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Logistic Regression | XGBoost | Random Forest\n• Feature engineering process\n• Train/validation split strategy\n• Visualization: flowchart of modeling pipeline',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Feature Importance',
        content: {
          textBoxes: [
            {
              text: 'Feature Importance',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Key churn drivers ranked by SHAP values\n• Usage drop-offs\n• Support ticket volume\n• Contract tenure\n• Visualization: horizontal bar chart of feature contributions',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Model Performance',
        content: {
          textBoxes: [
            {
              text: 'Model Performance Metrics',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'AUC | Recall | Precision | F1\n• Confusion matrix insights\n• Threshold tuning considerations\n• Visualization: ROC curve with annotated operating point',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Segment-level Risk',
        content: {
          textBoxes: [
            {
              text: 'Segment-level Risk',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Breakdown of churn probability by customer segment\n• Segment definitions and counts\n• High, medium, low risk tiers\n• Visualization: heatmap of risk vs segment attributes',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Churn Probability Distribution',
        content: {
          textBoxes: [
            {
              text: 'Churn Probability Distribution',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Histogram of predicted churn scores\n• Binning strategy\n• Cohort comparisons\n• Visualization: histogram with risk thresholds highlighted',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Intervention Triggers',
        content: {
          textBoxes: [
            {
              text: 'Intervention Triggers',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• High-risk flags & alerting rules\n• Recommended retention offers\n• Escalation paths for enterprise accounts\n• Visualization: funnel diagram showing intervention stages',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Impact Simulation',
        content: {
          textBoxes: [
            {
              text: 'Impact Simulation',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'What-if retention uplift scenarios\n• Expected churn reduction\n• CLV impact per scenario\n• Visualization: tornado chart of sensitivity analysis',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Business Recommendations',
        content: {
          textBoxes: [
            {
              text: 'Business Recommendations',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Targeted retention strategy\n• Programmatic outreach playbook\n• Measurement cadence and KPIs\n• Visualization: bullet summary with icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 400, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Automation roadmap\n• Dashboard deployment\n• Stakeholder training & governance\n• Visualization: timeline graphic with milestones',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'customer-segmentation',
    name: 'Customer Segmentation',
    description:
      'Cluster customers by behaviour and value to tailor marketing, service, and product experiences.',
    category: 'Customer Intelligence',
    tags: ['segmentation', 'personas', 'clusters'],
    icon: Users,
    slides: [
      {
        title: 'Customer Segmentation Analysis',
        content: {
          textBoxes: [
            {
              text: 'Customer Segmentation Analysis',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Behaviour, value, and preference insights',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#2563eb',
            },
          ],
        },
      },
      {
        title: 'Segmentation Objective',
        content: {
          textBoxes: [
            {
              text: 'Segmentation Objective',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 34,
              bold: true,
            },
            {
              text: '• Define segmentation goal\n• Link to marketing and CX priorities\n• Success measures: engagement, conversion, retention\n• Visualization: icon-based summary',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Inputs',
        content: {
          textBoxes: [
            {
              text: 'Data Inputs',
              position: { x: 72, y: 80 },
              size: { width: 400, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Behavioural, transactional, demographic, attitudinal\n• Data quality checks\n• Coverage and refresh frequency\n• Visualization: flowchart of data sources',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Methodology',
        content: {
          textBoxes: [
            {
              text: 'Methodology',
              position: { x: 72, y: 80 },
              size: { width: 400, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'K-means | Hierarchical Clustering | PCA\n• Scaling and dimensionality reduction\n• Cluster selection process\n• Visualization: algorithm pipeline diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Elbow Method Validation',
        content: {
          textBoxes: [
            {
              text: 'Elbow Method Validation',
              position: { x: 72, y: 80 },
              size: { width: 540, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Within-cluster sum of squares\n• Knee-point rationale\n• Recommended cluster count\n• Visualization: line chart of inertia vs cluster count',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Cluster Profiles',
        content: {
          textBoxes: [
            {
              text: 'Cluster Profiles',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Summary narrative for each segment\n• Key behaviours & value metrics\n• Visual identity cues\n• Visualization: bubble or radar chart per cluster',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 248 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Demographic Split',
        content: {
          textBoxes: [
            {
              text: 'Demographic Split',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Age | Region | Gender distribution\n• Segment share by demographic\n• Visualization: pie charts or stacked bars',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Behavioral Patterns',
        content: {
          textBoxes: [
            {
              text: 'Behavioral Patterns',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Purchase frequency | Recency | Engagement level\n• Key differences among segments\n• Visualization: bar charts highlighting behavioural KPIs',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Segment Value',
        content: {
          textBoxes: [
            {
              text: 'Segment Value',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Average revenue, margin, and growth potential per segment\n• Visualization: column chart comparing value metrics',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Marketing Strategies',
        content: {
          textBoxes: [
            {
              text: 'Marketing Strategies',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Targeting, messaging, and offers per segment\n• Channel mix recommendations\n• Visualization: strategy table with icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'KPI Impact',
        content: {
          textBoxes: [
            {
              text: 'KPI Impact',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Segment strategy uplift on revenue, retention, NPS\n• Visualization: waterfall chart of incremental impact',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Integrate segments into CRM & activation flows\n• Data refresh cadence\n• Experimentation roadmap\n• Visualization: process diagram of rollout plan',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'marketing-mix-modeling',
    name: 'Marketing Mix Modeling',
    description:
      'Measure ROI across media channels, optimise spend, and communicate MMM insights to stakeholders.',
    category: 'Marketing Analytics',
    tags: ['marketing', 'roi', 'mmm'],
    icon: TrendingUp,
    slides: [
      {
        title: 'Marketing Mix Modeling for [Brand]',
        content: {
          textBoxes: [
            {
              text: 'Marketing Mix Modeling for [Brand]',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Media ROI optimisation playbook',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#1d4ed8',
            },
          ],
        },
      },
      {
        title: 'Objective',
        content: {
          textBoxes: [
            {
              text: 'Objective',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Define MMM purpose and success metrics\n• Business questions answered\n• Visualization: summary callouts',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Overview',
        content: {
          textBoxes: [
            {
              text: 'Data Overview',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Media spend, sales, promotions, seasonality\n• Data granularity & period\n• Visualization: overview table',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Modeling Framework',
        content: {
          textBoxes: [
            {
              text: 'Modeling Framework',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Regression / Bayesian MMM\n• Controls for seasonality & promotions\n• Prior assumptions\n• Visualization: pipeline diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Channel Contributions',
        content: {
          textBoxes: [
            {
              text: 'Channel Contributions',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'TV | Digital | OOH | Print | Other\n• Contribution to incremental sales\n• Visualization: stacked bar chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'ROI by Channel',
        content: {
          textBoxes: [
            {
              text: 'ROI by Channel',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Return vs spend for each channel\n• Benchmark comparisons\n• Visualization: horizontal bar chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Diminishing Returns',
        content: {
          textBoxes: [
            {
              text: 'Diminishing Returns',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Spend vs ROI curve per channel\n• Saturation points\n• Visualization: S-curve chart with annotations',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Base vs Incremental Sales',
        content: {
          textBoxes: [
            {
              text: 'Base vs Incremental Sales',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Decomposition of base vs marketing-driven sales\n• Visualization: area chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Optimal Spend Mix',
        content: {
          textBoxes: [
            {
              text: 'Optimal Spend Mix',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Scenario analysis for optimal allocation\n• Visualization: bubble or pie chart showing new mix',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Budget Reallocation Simulation',
        content: {
          textBoxes: [
            {
              text: 'Budget Reallocation Simulation',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Expected gains from alternative spend plans\n• Visualization: tornado or column chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Business Impact Forecast',
        content: {
          textBoxes: [
            {
              text: 'Business Impact Forecast',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Incremental revenue projection\n• Visualization: line projection with scenarios',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'MMM integration cadence\n• Governance & refresh frequency\n• Stakeholder alignment actions\n• Visualization: timeline graphic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'demand-forecasting',
    name: 'Demand Forecasting',
    description:
      'Time-series forecasting deck covering models, accuracy, and planning recommendations.',
    category: 'Supply Chain & Ops',
    tags: ['forecasting', 'time-series', 'planning'],
    icon: LineChart,
    slides: [
      {
        title: 'Demand Forecasting Overview',
        content: {
          textBoxes: [
            {
              text: 'Demand Forecasting Overview',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Predictive outlook for products and categories',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#0ea5e9',
            },
          ],
        },
      },
      {
        title: 'Objective',
        content: {
          textBoxes: [
            {
              text: 'Objective',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Define forecasting need, decision windows, and stakeholders\n• Visualization: summary text with icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Summary',
        content: {
          textBoxes: [
            {
              text: 'Data Summary',
              position: { x: 72, y: 80 },
              size: { width: 400, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Sales | Inventory | Promotions | External drivers\n• Visualization: summary table',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Model Selection',
        content: {
          textBoxes: [
            {
              text: 'Model Selection',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'ARIMA | Prophet | LSTM comparison\n• Selection criteria\n• Visualization: diagram of evaluation pipeline',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Feature Engineering',
        content: {
          textBoxes: [
            {
              text: 'Feature Engineering',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Seasonality, holiday effects, price adjustments\n• Visualization: flowchart outlining feature creation steps',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Model Accuracy',
        content: {
          textBoxes: [
            {
              text: 'Model Accuracy',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'MAPE | RMSE | Bias metrics\n• Visualization: line chart of actual vs forecast errors',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Forecast Results',
        content: {
          textBoxes: [
            {
              text: 'Forecast Results',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Overview of forecast vs actual across horizon\n• Visualization: line chart with confidence bands',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Category Forecasts',
        content: {
          textBoxes: [
            {
              text: 'Category Forecasts',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'SKU or region-level highlights\n• Visualization: small multiples for key segments',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Scenario Planning',
        content: {
          textBoxes: [
            {
              text: 'Scenario Planning',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Demand under promotional and price scenarios\n• Visualization: area simulations for demand ranges',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Supply Implications',
        content: {
          textBoxes: [
            {
              text: 'Supply Implications',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Stock-out risk and safety stock adjustments\n• Visualization: waterfall chart of inventory deltas',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Business Recommendations',
        content: {
          textBoxes: [
            {
              text: 'Business Recommendations',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Actionable next steps for merchandising and supply planning\n• Visualization: text + icons summary',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Forecast Governance',
        content: {
          textBoxes: [
            {
              text: 'Forecast Governance',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Update frequency, ownership, and monitoring\n• Visualization: process flow with checkpoints',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'price-optimization',
    name: 'Price Optimization',
    description:
      'Determine revenue-maximising price points and communicate elasticity-driven recommendations.',
    category: 'Pricing Strategy',
    tags: ['pricing', 'elasticity', 'profit'],
    icon: BadgeDollarSign,
    slides: [
      {
        title: 'Price Optimization',
        content: {
          textBoxes: [
            {
              text: 'Price Optimization',
              position: { x: 96, y: 112 },
              size: { width: 520, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Maximising revenue and profit across SKUs',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#22c55e',
            },
          ],
        },
      },
      {
        title: 'Objective',
        content: {
          textBoxes: [
            {
              text: 'Pricing Objectives',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Define pricing goals and success measures\n• Visualization: summary text block',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Sources',
        content: {
          textBoxes: [
            {
              text: 'Data Sources',
              position: { x: 72, y: 80 },
              size: { width: 400, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Sales history, price elasticity studies, competitor benchmarks\n• Visualization: table of inputs',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Modeling Approach',
        content: {
          textBoxes: [
            {
              text: 'Modeling Approach',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Elasticity model (log-log regression)\n• Controls and assumptions\n• Visualization: flowchart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Elasticity Results',
        content: {
          textBoxes: [
            {
              text: 'Elasticity Results',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Price vs demand curve\n• Visualization: line chart with elasticity points',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Category Impact',
        content: {
          textBoxes: [
            {
              text: 'Category Impact',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Elasticity per SKU or category\n• Visualization: bar chart comparing elasticity coefficients',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Competitor Benchmark',
        content: {
          textBoxes: [
            {
              text: 'Competitor Benchmark',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Price gap analysis vs competitors\n• Visualization: scatter plot of price vs share',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Optimal Price Point',
        content: {
          textBoxes: [
            {
              text: 'Optimal Price Point',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Revenue-maximising price recommendation\n• Visualization: line chart with highlighted optimum',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Margin Sensitivity',
        content: {
          textBoxes: [
            {
              text: 'Margin Sensitivity',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Profit impact per price step\n• Visualization: area chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Scenario Simulation',
        content: {
          textBoxes: [
            {
              text: 'Scenario Simulation',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'What-if analyses for promotional depth and competitor reactions\n• Visualization: tornado chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Recommendations',
        content: {
          textBoxes: [
            {
              text: 'Recommendations',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Summary of pricing adjustments and guardrails\n• Visualization: bullet list with icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Implementation Roadmap',
        content: {
          textBoxes: [
            {
              text: 'Implementation Roadmap',
              position: { x: 72, y: 80 },
              size: { width: 540, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Pricing governance, monitoring, and roles\n• Visualization: timeline of rollout milestones',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'promo-effectiveness',
    name: 'Promo Effectiveness',
    description:
      'Evaluate campaign uplift, ROI, and optimisation levers for future promotion planning.',
    category: 'Marketing Analytics',
    tags: ['promotion', 'uplift', 'roi'],
    icon: Target,
    slides: [
      {
        title: 'Promo Effectiveness Analysis',
        content: {
          textBoxes: [
            {
              text: 'Promo Effectiveness Analysis',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Campaign ROI and uplift insights',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#ec4899',
            },
          ],
        },
      },
      {
        title: 'Objective',
        content: {
          textBoxes: [
            {
              text: 'Campaign Objective',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Define promotion scope, goals, and KPIs\n• Visualization: summary text block',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Overview',
        content: {
          textBoxes: [
            {
              text: 'Data Overview',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Channel, spend, uplift, and control period information\n• Visualization: table layout',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Methodology',
        content: {
          textBoxes: [
            {
              text: 'Methodology',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Regression / uplift modeling approach\n• Test vs control setup\n• Visualization: flowchart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Incremental Sales',
        content: {
          textBoxes: [
            {
              text: 'Incremental Sales',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Lift vs baseline results\n• Visualization: column chart of incremental sales',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'ROI by Channel',
        content: {
          textBoxes: [
            {
              text: 'ROI by Channel',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'ROI percentage comparison across channels\n• Visualization: horizontal bar chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Frequency Impact',
        content: {
          textBoxes: [
            {
              text: 'Frequency Impact',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Overexposure and frequency analysis\n• Visualization: line chart of frequency vs ROI',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Creative Performance',
        content: {
          textBoxes: [
            {
              text: 'Creative Performance',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Message & creative comparisons\n• Visualization: bubble chart highlighting winners',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Temporal Effects',
        content: {
          textBoxes: [
            {
              text: 'Temporal Effects',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Pre, during, and post-campaign performance\n• Visualization: area chart by phase',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Optimization Levers',
        content: {
          textBoxes: [
            {
              text: 'Optimization Levers',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Spend reallocation opportunities\n• Visualization: heatmap of levers vs impact',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Insights Summary',
        content: {
          textBoxes: [
            {
              text: 'Insights Summary',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Key drivers of promotion success\n• Visualization: highlighted bullet summary',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Future planning cadence and roadmap\n• Visualization: roadmap graphic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'exploratory-data-analysis',
    name: 'Exploratory Data Analysis',
    description:
      'Summarise patterns, anomalies, and readiness insights from exploratory data analysis.',
    category: 'Data Science',
    tags: ['eda', 'insights', 'analysis'],
    icon: Sparkles,
    slides: [
      {
        title: 'EDA Report for [Dataset]',
        content: {
          textBoxes: [
            {
              text: 'EDA Report for [Dataset]',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Discoveries from exploratory analysis',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#f97316',
            },
          ],
        },
      },
      {
        title: 'Objective',
        content: {
          textBoxes: [
            {
              text: 'Objective',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Define purpose of EDA and decision context\n• Visualization: text summary',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Dataset Summary',
        content: {
          textBoxes: [
            {
              text: 'Dataset Summary',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Variables, size, period covered\n• Visualization: table of metadata',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Missing Data',
        content: {
          textBoxes: [
            {
              text: 'Missing Data',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Null counts and patterns\n• Visualization: bar chart of missingness',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Univariate Analysis',
        content: {
          textBoxes: [
            {
              text: 'Univariate Analysis',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Distribution per variable and summary stats\n• Visualization: histograms',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Bivariate Relationships',
        content: {
          textBoxes: [
            {
              text: 'Bivariate Relationships',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Correlations and key interactions\n• Visualization: heatmap of correlation matrix',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Outliers',
        content: {
          textBoxes: [
            {
              text: 'Outliers',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Detection techniques and flagged records\n• Visualization: box plots',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Categorical Insights',
        content: {
          textBoxes: [
            {
              text: 'Categorical Insights',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Category contributions to KPIs\n• Visualization: bar chart or treemap',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Time Trends',
        content: {
          textBoxes: [
            {
              text: 'Time Trends',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Seasonality and trend observations\n• Visualization: line chart over time',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Feature Importance',
        content: {
          textBoxes: [
            {
              text: 'Feature Importance',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Predictor ranking based on preliminary models\n• Visualization: bar chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Key Insights',
        content: {
          textBoxes: [
            {
              text: 'Key Insights',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Top findings and implications\n• Visualization: bullet summary',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Model readiness checklist and recommended actions\n• Visualization: checklist layout',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'forecasting-analysis',
    name: 'Forecasting Analysis',
    description:
      'Analyse and communicate time-based trends, decomposition, and event impacts for broader forecasting.',
    category: 'Data Science',
    tags: ['forecasting', 'time-series', 'analysis'],
    icon: BarChart3,
    slides: [
      {
        title: 'Forecasting Analysis Overview',
        content: {
          textBoxes: [
            {
              text: 'Forecasting Analysis Overview',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Trend decomposition, autocorrelation, and event review',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#10b981',
            },
          ],
        },
      },
      {
        title: 'Objective & Scope',
        content: {
          textBoxes: [
            {
              text: 'Objective & Scope',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Purpose of analysis and decision cadence\n• Visualization: summary with icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Foundation',
        content: {
          textBoxes: [
            {
              text: 'Data Foundation',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Granularity, timespan, and key measures\n• Visualization: data lineage table',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Trend Decomposition',
        content: {
          textBoxes: [
            {
              text: 'Trend Decomposition',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Breakdown into trend, seasonality, residuals\n• Visualization: decomposition charts',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Autocorrelation Insights',
        content: {
          textBoxes: [
            {
              text: 'Autocorrelation Insights',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'ACF/PACF diagnostics and implications\n• Visualization: correlogram plots',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Event & Campaign Impacts',
        content: {
          textBoxes: [
            {
              text: 'Event & Campaign Impacts',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Quantify impact of promotions, launches, and disruptions\n• Visualization: annotated event timeline',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Seasonality Diagnostics',
        content: {
          textBoxes: [
            {
              text: 'Seasonality Diagnostics',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Seasonal strength and periodicity insights\n• Visualization: seasonal subseries plots',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Forecast Comparison',
        content: {
          textBoxes: [
            {
              text: 'Forecast Comparison',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Multiple model comparison and accuracy metrics\n• Visualization: overlayed line charts',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Scenario Exploration',
        content: {
          textBoxes: [
            {
              text: 'Scenario Exploration',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Evaluate upside/downside and event-driven scenarios\n• Visualization: fan chart or interval ribbons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Operational Implications',
        content: {
          textBoxes: [
            {
              text: 'Operational Implications',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Impact on supply, marketing, and finance planning\n• Visualization: swimlane style summary',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Key Takeaways',
        content: {
          textBoxes: [
            {
              text: 'Key Takeaways',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Summary of trend, seasonality, and event learnings\n• Visualization: highlighted bullet list',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Broader forecasting roadmap and analytics backlog\n• Visualization: timeline graphic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'price-ladder-analytics',
    name: 'Price Ladder Analytics',
    description:
      'Understand elasticity across price tiers and optimise ladder architecture for growth.',
    category: 'Pricing Strategy',
    tags: ['pricing', 'ladder', 'elasticity'],
    icon: BadgeDollarSign,
    slides: [
      {
        title: 'Price Ladder Analytics Overview',
        content: {
          textBoxes: [
            {
              text: 'Price Ladder Analytics Overview',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Elasticity across tiers and optimisation roadmap',
              position: { x: 96, y: 204 },
              size: { width: 520, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#6366f1',
            },
          ],
        },
      },
      {
        title: 'Objective',
        content: {
          textBoxes: [
            {
              text: 'Objective',
              position: { x: 72, y: 80 },
              size: { width: 320, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Define ladder optimisation goals and KPIs\n• Visualization: summary icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Current Ladder Structure',
        content: {
          textBoxes: [
            {
              text: 'Current Ladder Structure',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Product tiers, price gaps, and share mix\n• Visualization: ladder diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Elasticity Overview',
        content: {
          textBoxes: [
            {
              text: 'Elasticity Overview',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Demand responsiveness per tier\n• Visualization: bubble chart for price vs demand',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Margin Flow',
        content: {
          textBoxes: [
            {
              text: 'Margin Flow',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Gross-to-net waterfall across ladder\n• Visualization: waterfall chart of margin flow',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Segment Performance Heatmap',
        content: {
          textBoxes: [
            {
              text: 'Segment Performance Heatmap',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'SKU vs customer segment performance\n• Visualization: heatmap showing mix and margin',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Competitive Benchmark',
        content: {
          textBoxes: [
            {
              text: 'Competitive Benchmark',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Comparison vs competitor ladders\n• Visualization: scatter of price vs feature set',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Gap & Opportunity Analysis',
        content: {
          textBoxes: [
            {
              text: 'Gap & Opportunity Analysis',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Identify white space and cannibalisation risks\n• Visualization: opportunity matrix',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Scenario Simulation',
        content: {
          textBoxes: [
            {
              text: 'Scenario Simulation',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'What-if price tier adjustments and mix shifts\n• Visualization: tornado chart of revenue/profit impact',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Recommended Ladder',
        content: {
          textBoxes: [
            {
              text: 'Recommended Ladder',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Proposed tier structure and price points\n• Visualization: redesigned ladder diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Financial Impact',
        content: {
          textBoxes: [
            {
              text: 'Financial Impact',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Revenue and margin outcomes by tier\n• Visualization: stacked column comparison',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Implementation Plan',
        content: {
          textBoxes: [
            {
              text: 'Implementation Plan',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Rollout steps, governance, and monitoring\n• Visualization: timeline with milestones',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'ecom-promo-planning',
    name: 'E-Com Promo Planning',
    description:
      'Plan optimal promotion schedules, forecast uplift, and communicate the activation roadmap.',
    category: 'E-Commerce',
    tags: ['promotion', 'planning', 'ecommerce'],
    icon: Megaphone,
    slides: [
      {
        title: 'E-Commerce Promo Planning',
        content: {
          textBoxes: [
            {
              text: 'E-Commerce Promo Planning',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Campaign calendar, uplift forecasts, and execution plan',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#facc15',
            },
          ],
        },
      },
      {
        title: 'Campaign Overview',
        content: {
          textBoxes: [
            {
              text: 'Campaign Overview',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Objectives, target audiences, key categories\n• Visualization: campaign summary infographic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Historical Spend Snapshot',
        content: {
          textBoxes: [
            {
              text: 'Historical Spend Snapshot',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Spend by channel and season\n• Visualization: stacked bar chart by month',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Forecasting Methodology',
        content: {
          textBoxes: [
            {
              text: 'Forecasting Methodology',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Approach for predicting promo uplift\n• Data sources, model types, validation\n• Visualization: flowchart of forecasting process',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 240 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Promo Uplift Forecast',
        content: {
          textBoxes: [
            {
              text: 'Promo Uplift Forecast',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Expected incremental revenue and orders\n• Visualization: line/area chart of uplift across campaign weeks',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Discount Depth Curve',
        content: {
          textBoxes: [
            {
              text: 'Discount Depth Curve',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Relationship between discount and expected uplift\n• Visualization: curve chart with optimal depth highlighted',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Inventory & Operations Impact',
        content: {
          textBoxes: [
            {
              text: 'Inventory & Operations Impact',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Forecasted demand vs stock position\n• Visualization: heatmap of SKU readiness',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Scenario Confidence',
        content: {
          textBoxes: [
            {
              text: 'Scenario Confidence',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Best, expected, and downside forecasts\n• Visualization: fan chart or interval bands',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Recommended Promo Calendar',
        content: {
          textBoxes: [
            {
              text: 'Recommended Promo Calendar',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Week-by-week activation plan\n• Visualization: calendar style schedule',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Campaign Playbook',
        content: {
          textBoxes: [
            {
              text: 'Campaign Playbook',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Messaging, creative, and channel tactics per phase\n• Visualization: table with icons',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Simulation Dashboard Preview',
        content: {
          textBoxes: [
            {
              text: 'Simulation Dashboard Preview',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Interactive levers and KPI outputs\n• Visualization: dashboard mock-up with key widgets',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps & Governance',
        content: {
          textBoxes: [
            {
              text: 'Next Steps & Governance',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Execution checklist, owners, and measurement cadence\n• Visualization: timeline or RACI chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'ecom-media-planning',
    name: 'E-Com Media Planning',
    description:
      'Optimise digital media budget, reach, and conversion performance across channels.',
    category: 'E-Commerce',
    tags: ['media', 'planning', 'digital'],
    icon: Network,
    slides: [
      {
        title: 'E-Commerce Media Planning',
        content: {
          textBoxes: [
            {
              text: 'E-Commerce Media Planning',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Optimising digital reach, efficiency, and ROI',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#38bdf8',
            },
          ],
        },
      },
      {
        title: 'Objective & KPIs',
        content: {
          textBoxes: [
            {
              text: 'Objective & KPIs',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Define media planning goals and measurement framework\n• Visualization: KPI cards',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Channel Mix Snapshot',
        content: {
          textBoxes: [
            {
              text: 'Channel Mix Snapshot',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Spend, impressions, and conversions by channel\n• Visualization: stacked bar or donut chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Spend vs Conversions',
        content: {
          textBoxes: [
            {
              text: 'Spend vs Conversions',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Channel efficiency comparison\n• Visualization: scatter plot of spend vs conversions',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'CPM Trends',
        content: {
          textBoxes: [
            {
              text: 'CPM Trends',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Cost per thousand impressions over time\n• Visualization: line chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'CPA Trends',
        content: {
          textBoxes: [
            {
              text: 'CPA Trends',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Cost per acquisition trend by channel\n• Visualization: line chart with benchmark bands',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Attribution Flow',
        content: {
          textBoxes: [
            {
              text: 'Multi-touch Attribution Flow',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Path-to-conversion insights across touchpoints\n• Visualization: flow diagram or Sankey',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Audience Insights',
        content: {
          textBoxes: [
            {
              text: 'Audience Insights',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Demographic and behavioural audience highlights\n• Visualization: persona cards or heatmap',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Optimization Opportunities',
        content: {
          textBoxes: [
            {
              text: 'Optimization Opportunities',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Channel-level recommendations for spend, messaging, and creative\n• Visualization: optimisation table per channel',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Budget Reallocation Plan',
        content: {
          textBoxes: [
            {
              text: 'Budget Reallocation Plan',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Scenario modelling of spend shifts and expected impact\n• Visualization: waterfall or stacked bar chart',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Measurement Framework',
        content: {
          textBoxes: [
            {
              text: 'Measurement Framework',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Testing roadmap, incrementality studies, dashboards\n• Visualization: framework diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 360, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Media activation timeline, owners, and checkpoints\n• Visualization: roadmap graphic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'data-integration-hub',
    name: 'Data Integration Hub',
    description:
      'Describe ETL processes, data stitching, and unified dataset delivery for stakeholders.',
    category: 'Data Platform',
    tags: ['data', 'integration', 'architecture'],
    icon: Database,
    slides: [
      {
        title: 'Data Integration Hub Overview',
        content: {
          textBoxes: [
            {
              text: 'Data Integration Hub Overview',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Unified data stitching and delivery platform',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 48 },
              fontSize: 22,
            },
            {
              text: `Updated ${todaysDateLabel()}`,
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#a855f7',
            },
          ],
        },
      },
      {
        title: 'Strategic Objective',
        content: {
          textBoxes: [
            {
              text: 'Strategic Objective',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Business outcomes enabled by integration hub\n• Visualization: value chain graphic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Source Landscape',
        content: {
          textBoxes: [
            {
              text: 'Source Landscape',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Systems feeding the hub (CRM, ERP, web, etc.)\n• Visualization: source inventory table',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Architecture Diagram',
        content: {
          textBoxes: [
            {
              text: 'Architecture Diagram',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'High-level ETL/ELT architecture with components\n• Visualization: architecture diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Ingestion Pipeline',
        content: {
          textBoxes: [
            {
              text: 'Ingestion Pipeline',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Batch and streaming ingestion processes\n• Visualization: pipeline flow diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Validation KPIs',
        content: {
          textBoxes: [
            {
              text: 'Data Validation KPIs',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Completeness, accuracy, consistency metrics\n• Visualization: KPI scorecards',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Data Quality Scorecards',
        content: {
          textBoxes: [
            {
              text: 'Data Quality Scorecards',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Issue trends and remediation\n• Visualization: scorecard dashboard',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Latency & Freshness Metrics',
        content: {
          textBoxes: [
            {
              text: 'Latency & Freshness Metrics',
              position: { x: 72, y: 80 },
              size: { width: 580, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Ingestion latency, SLA adherence, refresh cadence\n• Visualization: line/bar charts',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Unified Dataset Schema',
        content: {
          textBoxes: [
            {
              text: 'Unified Dataset Schema',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Entity model, primary keys, key joins\n• Visualization: schema diagram',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Consumption Interfaces',
        content: {
          textBoxes: [
            {
              text: 'Consumption Interfaces',
              position: { x: 72, y: 80 },
              size: { width: 500, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'BI, APIs, and downstream products\n• Visualization: interface catalog',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Governance Dashboard',
        content: {
          textBoxes: [
            {
              text: 'Governance Dashboard',
              position: { x: 72, y: 80 },
              size: { width: 500, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Data stewardship metrics, access controls\n• Visualization: dashboard screenshot',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Roadmap & Next Steps',
        content: {
          textBoxes: [
            {
              text: 'Roadmap & Next Steps',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Planned enhancements, timelines, and owners\n• Visualization: roadmap graphic',
              position: { x: 72, y: 160 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
];
