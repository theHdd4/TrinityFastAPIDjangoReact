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
import type {
  TemplateDefinition,
  TemplateShapeDefinition,
  TemplateSlideDefinition,
  TemplateTextBoxDefinition,
} from './types';

const todaysDateLabel = () => {
  try {
    return new Date().toLocaleDateString();
  } catch {
    return 'Today';
  }
};

const hexToRgb = (hex: string): [number, number, number] | null => {
  const normalized = hex.replace('#', '').trim();

  if (![3, 6].includes(normalized.length)) {
    return null;
  }

  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map(char => char + char)
          .join('')
      : normalized;

  const intVal = parseInt(value, 16);

  if (Number.isNaN(intVal)) {
    return null;
  }

  return [
    (intVal >> 16) & 255,
    (intVal >> 8) & 255,
    intVal & 255,
  ];
};

const withAlpha = (hex: string, alpha: number, fallback: string): string => {
  const rgb = hexToRgb(hex);

  if (!rgb) {
    return fallback;
  }

  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type PlaceholderType =
  | 'chart'
  | 'table'
  | 'image'
  | 'diagram'
  | 'heatmap'
  | 'funnel'
  | 'timeline'
  | 'flow'
  | 'calendar'
  | 'bubble'
  | 'waterfall'
  | 'radar'
  | 'map'
  | 'text'
  | 'metric'
  | 'dashboard';

interface PlaceholderSpec {
  key: string;
  type: PlaceholderType;
  label: string;
  description?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  accentColor?: string;
}

interface SlideSpec {
  title: string;
  subtitle?: string;
  description?: string;
  bulletPoints?: string[];
  notes?: string[];
  callout?: string;
  footnote?: string;
  bodyPosition?: { x: number; y: number };
  bodySize?: { width: number; height: number };
  accentColor?: string;
  placeholders: PlaceholderSpec[];
  extraTextBoxes?: TemplateTextBoxDefinition[];
  extraShapes?: TemplateShapeDefinition[];
}

const PANEL_POSITION = { x: 64, y: 152 };
const PANEL_SIZE = { width: 736, height: 344 };
const BODY_POSITION = { x: 96, y: 188 };
const BODY_SIZE = { width: 312, height: 212 };

const DEFAULT_PLACEHOLDER_FRAMES = [
  { x: 420, y: 188, width: 320, height: 200 },
  { x: 420, y: 404, width: 320, height: 92 },
  { x: 96, y: 404, width: 312, height: 92 },
];

const buildSlideDefinition = (
  templateId: string,
  accentColor: string,
  spec: SlideSpec,
  index: number,
): TemplateSlideDefinition => {
  const accent = spec.accentColor ?? accentColor;
  const baseShapes: TemplateShapeDefinition[] = [
    {
      shapeId: `${templateId}-slide-${index}-panel`,
      position: PANEL_POSITION,
      size: PANEL_SIZE,
      fill: withAlpha(accent, 0.08, 'rgba(79, 70, 229, 0.08)'),
      stroke: withAlpha(accent, 0.24, 'rgba(79, 70, 229, 0.24)'),
      strokeWidth: 2,
    },
    {
      shapeId: `${templateId}-slide-${index}-accent`,
      position: { x: PANEL_POSITION.x, y: PANEL_POSITION.y },
      size: { width: 6, height: PANEL_SIZE.height },
      fill: withAlpha(accent, 0.5, 'rgba(79, 70, 229, 0.5)'),
    },
  ];

  const textBoxes: TemplateTextBoxDefinition[] = [
    {
      text: spec.title,
      position: { x: 72, y: 72 },
      size: { width: 520, height: 56 },
      fontSize: 32,
      bold: true,
      color: '#111827',
    },
  ];

  if (spec.subtitle) {
    textBoxes.push({
      text: spec.subtitle,
      position: { x: 72, y: 124 },
      size: { width: 520, height: 36 },
      fontSize: 20,
      color: '#4b5563',
    });
  }

  const bodySegments: string[] = [];

  if (spec.description) {
    bodySegments.push(spec.description);
  }

  if (spec.bulletPoints?.length) {
    bodySegments.push(spec.bulletPoints.map(point => `• ${point}`).join('\n'));
  }

  if (spec.notes?.length) {
    bodySegments.push(spec.notes.map(note => `◦ ${note}`).join('\n'));
  }

  if (bodySegments.length > 0) {
    textBoxes.push({
      text: bodySegments.join('\n\n'),
      position: spec.bodyPosition ?? BODY_POSITION,
      size: spec.bodySize ?? BODY_SIZE,
      fontSize: 18,
      color: '#475569',
    });
  }

  if (spec.callout) {
    textBoxes.push({
      text: spec.callout,
      position: { x: 420, y: 160 },
      size: { width: 320, height: 40 },
      fontSize: 16,
      color: withAlpha(accent, 0.8, 'rgba(79, 70, 229, 0.8)'),
      bold: true,
      align: 'right',
    });
  }

  const placeholderShapes: TemplateShapeDefinition[] = [];
  const placeholderTextBoxes: TemplateTextBoxDefinition[] = [];

  spec.placeholders.forEach((placeholder, placeholderIndex) => {
    const fallbackFrame =
      DEFAULT_PLACEHOLDER_FRAMES[placeholderIndex] ??
      DEFAULT_PLACEHOLDER_FRAMES[DEFAULT_PLACEHOLDER_FRAMES.length - 1];

    const frame = placeholder.position
      ? {
          x: placeholder.position.x,
          y: placeholder.position.y,
          width: placeholder.size?.width ?? fallbackFrame.width,
          height: placeholder.size?.height ?? fallbackFrame.height,
        }
      : fallbackFrame;

    const placeholderAccent = placeholder.accentColor ?? accent;

    placeholderShapes.push({
      shapeId: `${templateId}-slide-${index}-${placeholder.key}-frame`,
      position: { x: frame.x, y: frame.y },
      size: { width: frame.width, height: frame.height },
      fill: withAlpha(placeholderAccent, 0.12, 'rgba(79, 70, 229, 0.12)'),
      stroke: withAlpha(placeholderAccent, 0.35, 'rgba(79, 70, 229, 0.35)'),
      strokeWidth: 2,
    });

    placeholderShapes.push({
      shapeId: `${templateId}-slide-${index}-${placeholder.key}-accent`,
      position: { x: frame.x, y: frame.y + frame.height - 10 },
      size: { width: frame.width, height: 10 },
      fill: withAlpha(placeholderAccent, 0.4, 'rgba(79, 70, 229, 0.4)'),
      opacity: 0.75,
    });

    const placeholderTitle = `${placeholder.type.toUpperCase()} PLACEHOLDER`;
    const placeholderBody = placeholder.description
      ? `${placeholder.label}\n${placeholder.description}`
      : placeholder.label;

    placeholderTextBoxes.push({
      text: placeholderTitle,
      position: { x: frame.x + 16, y: frame.y + 16 },
      size: { width: frame.width - 32, height: 28 },
      fontSize: 14,
      color: '#1f2937',
      bold: true,
    });

    placeholderTextBoxes.push({
      text: placeholderBody,
      position: { x: frame.x + 16, y: frame.y + 48 },
      size: { width: frame.width - 32, height: frame.height - 64 },
      fontSize: 13,
      color: '#475569',
    });
  });

  if (spec.footnote) {
    textBoxes.push({
      text: spec.footnote,
      position: { x: 96, y: 520 },
      size: { width: 520, height: 32 },
      fontSize: 14,
      color: '#64748b',
    });
  }

  if (spec.extraTextBoxes) {
    textBoxes.push(...spec.extraTextBoxes);
  }

  const shapes = [...baseShapes, ...placeholderShapes];

  if (spec.extraShapes) {
    shapes.push(...spec.extraShapes);
  }

  return {
    title: spec.title,
    description: spec.description,
    content: {
      textBoxes: [...textBoxes, ...placeholderTextBoxes],
      shapes,
    },
  };
};

const buildSlides = (
  templateId: string,
  accentColor: string,
  slideSpecs: SlideSpec[],
): TemplateSlideDefinition[] =>
  slideSpecs.map((spec, index) => buildSlideDefinition(templateId, accentColor, spec, index));

const createTemplate = (
  meta: Omit<TemplateDefinition, 'slides'>,
  accentColor: string,
  slides: SlideSpec[],
): TemplateDefinition => ({
  ...meta,
  slides: buildSlides(meta.id, accentColor, slides),
});

*** End Patch

const churnSlides: SlideSpec[] = [
  {
    title: 'Churn Prediction for [Brand]',
    subtitle: 'Prepared for the retention leadership team',
    description: 'Executive overview of the churn modeling initiative for the current brand.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Customer retention focus — Q4 initiatives',
    placeholders: [
      {
        key: 'brand-hero',
        type: 'image',
        label: 'Hero image or brand logo representing the churn program',
        description: 'Swap with the latest brand asset when presenting.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'kpi-card',
        type: 'metric',
        label: 'Key KPIs — churn rate, retention %, CLV trend',
        description: 'Replace with most recent metric tiles for a quick read.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Business Context',
    description: 'Frame the churn challenge, success metrics, and business stakes for leadership.',
    bulletPoints: [
      'Define churn definition, measurement window, and impacted products',
      'North-star KPIs: retention rate, churn %, customer lifetime value',
      'Strategic objective: protect high-value cohorts and stabilise revenue base',
    ],
    placeholders: [
      {
        key: 'context-infographic',
        type: 'diagram',
        label: 'Infographic comparing current vs. target retention performance',
        description: 'Use icons or badges to highlight the KPIs being tracked.',
      },
    ],
  },
  {
    title: 'Data Overview',
    description: 'Summarise the data foundation powering the churn model.',
    bulletPoints: [
      'Transaction history, product usage telemetry, and support interactions',
      'Customer demographics, tenure, contract status, and engagement signals',
      'Refresh cadence and data quality considerations for the dataset',
    ],
    placeholders: [
      {
        key: 'data-table',
        type: 'table',
        label: 'Data inventory table covering sources, coverage, and freshness',
        description: 'Include column for ownership to reinforce accountability.',
      },
    ],
  },
  {
    title: 'Modeling Approach',
    description: 'Outline modeling techniques and workflow for predicting churn risk.',
    bulletPoints: [
      'Logistic regression, XGBoost, and random forest ensemble for robustness',
      'Feature engineering flow: behavioural, financial, and support signals',
      'Validation strategy with temporal splits and threshold optimisation',
    ],
    placeholders: [
      {
        key: 'model-flow',
        type: 'flow',
        label: 'Flowchart showing data prep, modeling, validation, and scoring deployment',
        description: 'Annotate key decision gates within the modeling pipeline.',
      },
    ],
  },
  {
    title: 'Feature Importance',
    description: 'Highlight the leading drivers influencing churn probability.',
    bulletPoints: [
      'Rank attributes using SHAP or permutation importance scores',
      'Surface behavioural drop-offs, support load, and contract term sensitivity',
      'Call out surprising signals to investigate further',
    ],
    placeholders: [
      {
        key: 'feature-bars',
        type: 'chart',
        label: 'Horizontal bar chart of SHAP values for top churn drivers',
        description: 'Include labels for lift impact and directionality.',
      },
    ],
  },
  {
    title: 'Model Performance',
    description: 'Communicate how well the models separate churners from retained customers.',
    bulletPoints: [
      'Report ROC-AUC, recall, precision, and F1 at the operating threshold',
      'Show confusion matrix insights for leadership understanding',
      'Discuss threshold tuning and business trade-offs',
    ],
    placeholders: [
      {
        key: 'roc-curve',
        type: 'chart',
        label: 'ROC curve with annotated operating point and lift table',
        description: 'Add inset for precision-recall view if useful.',
      },
    ],
  },
  {
    title: 'Segment-level Risk',
    description: 'Break down churn probability by audience segments.',
    bulletPoints: [
      'Compare risk across lifecycle stages, product tiers, or regions',
      'Highlight vulnerable cohorts needing bespoke plays',
      'Quantify revenue at risk for each segment cluster',
    ],
    placeholders: [
      {
        key: 'risk-heatmap',
        type: 'heatmap',
        label: 'Heatmap visual of churn probability by customer segment',
        description: 'Include annotations for segments exceeding alert thresholds.',
      },
    ],
  },
  {
    title: 'Churn Probability Distribution',
    description: 'Share the spread of predicted churn scores.',
    bulletPoints: [
      'Display histogram or density to show separation between classes',
      'Annotate high-risk threshold and tail behaviour',
      'Link to sample accounts for qualitative follow-up',
    ],
    placeholders: [
      {
        key: 'probability-histogram',
        type: 'chart',
        label: 'Histogram showing predicted churn probability distribution',
        description: 'Shade high-risk region with branded accent colour.',
      },
    ],
  },
  {
    title: 'Intervention Triggers',
    description: 'Define how high-risk signals convert into retention workflows.',
    bulletPoints: [
      'Flag triggers by propensity score bands and leading signals',
      'Recommended retention offers or outreach cadence',
      'Operational owners and SLAs for outreach',
    ],
    placeholders: [
      {
        key: 'trigger-funnel',
        type: 'funnel',
        label: 'Funnel diagram linking triggers to retention playbooks',
        description: 'Detail entry criteria and conversion checkpoints.',
      },
    ],
  },
  {
    title: 'Impact Simulation',
    description: 'Model the uplift of retention scenarios driven by interventions.',
    bulletPoints: [
      'Simulate improvements to churn with increased outreach capacity',
      'Quantify incremental revenue saved under each scenario',
      'Highlight best- and worst-case assumptions',
    ],
    placeholders: [
      {
        key: 'impact-tornado',
        type: 'waterfall',
        label: 'Tornado chart contrasting scenario uplift vs. baseline',
        description: 'Call out pivotal levers such as retention budget or SLA.',
      },
    ],
  },
  {
    title: 'Business Recommendations',
    description: 'Summarise the most actionable plays to reduce churn.',
    bulletPoints: [
      'Prioritised retention strategies by segment and channel',
      'Enablement needs for CX, marketing, and product teams',
      'Quick wins versus longer-term capability builds',
    ],
    placeholders: [
      {
        key: 'recommendation-cards',
        type: 'text',
        label: 'Recommendation cards with owners, timing, and impact',
        description: 'Use 2–3 cards across the placeholder for clarity.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Lay out the roadmap for automation and monitoring.',
    bulletPoints: [
      'Operationalise scoring in CRM or marketing automation',
      'Deploy dashboards for ongoing churn surveillance',
      'Schedule governance cadences and feedback loops',
    ],
    placeholders: [
      {
        key: 'next-steps-timeline',
        type: 'timeline',
        label: 'Timeline graphic covering near-term and long-term milestones',
        description: 'Include icons for automation, enablement, and analytics.',
      },
    ],
  },
];

const customerSegmentationSlides: SlideSpec[] = [
  {
    title: 'Customer Segmentation Analysis',
    subtitle: 'Behaviour, value, and preference insights',
    description: 'Introduce the segmentation programme and overall goals.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Personalisation unlocks: prioritise top-value cohorts',
    placeholders: [
      {
        key: 'segmentation-cover-visual',
        type: 'image',
        label: 'Hero mosaic or customer imagery representing personas',
        description: 'Use brand photography or abstract illustration.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'metric-highlight',
        type: 'metric',
        label: 'Snapshot of total customers, segments, and coverage',
        description: 'Consider small iconography per metric.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Segmentation Objective',
    description: 'Clarify the business objectives behind clustering customers.',
    bulletPoints: [
      'Identify actionable segments to tailor marketing and service',
      'Align leadership on KPIs: engagement, retention, incremental revenue',
      'Define use cases: targeting, lifecycle management, product roadmap',
    ],
    placeholders: [
      {
        key: 'objective-icons',
        type: 'diagram',
        label: 'Icon-driven summary of segmentation goals',
        description: 'Three-tile layout emphasising marketing, service, product.',
      },
    ],
  },
  {
    title: 'Data Inputs',
    description: 'Outline the data sets feeding segmentation.',
    bulletPoints: [
      'Behavioural: purchase frequency, engagement, digital interactions',
      'Transactional: revenue, margin, basket composition',
      'Demographic: geography, tenure, lifecycle stage',
    ],
    placeholders: [
      {
        key: 'data-flow',
        type: 'flow',
        label: 'Flowchart mapping behavioural, transactional, and demographic feeds',
        description: 'Include arrows into a unified feature store node.',
      },
    ],
  },
  {
    title: 'Methodology',
    description: 'Document algorithms and dimensionality reduction steps.',
    bulletPoints: [
      'K-means and hierarchical clustering for cohort discovery',
      'Principal component analysis for feature compression',
      'Silhouette and Davies–Bouldin indices for validation',
    ],
    placeholders: [
      {
        key: 'method-pipeline',
        type: 'diagram',
        label: 'Algorithm pipeline showing preprocessing to clustering',
        description: 'Use labelled stages with iconography for each step.',
      },
    ],
  },
  {
    title: 'Elbow Method',
    description: 'Show how the optimal number of clusters was selected.',
    bulletPoints: [
      'Plot inertia vs. k to reveal the elbow point',
      'Annotate chosen cluster count and reasoning',
      'Provide supportive stats for leadership confidence',
    ],
    placeholders: [
      {
        key: 'elbow-chart',
        type: 'chart',
        label: 'Line chart of number of clusters vs. within-cluster SSE',
        description: 'Highlight the inflection point chosen for segmentation.',
      },
    ],
  },
  {
    title: 'Cluster Profiles',
    description: 'Summarise the defining traits of each segment.',
    bulletPoints: [
      'Describe persona themes, needs, and value contribution',
      'Add segment sizes and share of revenue',
      'Call out signature behaviours or preferences',
    ],
    placeholders: [
      {
        key: 'cluster-radar',
        type: 'radar',
        label: 'Radar or bubble chart comparing key metrics per segment',
        description: 'Reserve space for three highlighted personas.',
      },
    ],
  },
  {
    title: 'Demographic Split',
    description: 'Display demographic breakdown by segment.',
    bulletPoints: [
      'Age, region, and gender mix across clusters',
      'Call out notable differences for targeting',
      'Use icons to illustrate demographic attributes',
    ],
    placeholders: [
      {
        key: 'demographic-pies',
        type: 'chart',
        label: 'Pie chart placeholders for age, region, and gender',
        description: 'Stack three mini pie visuals inside the area.',
      },
    ],
  },
  {
    title: 'Behavioural Patterns',
    description: 'Compare behaviour metrics between segments.',
    bulletPoints: [
      'Purchase frequency, recency, and basket size',
      'Digital engagement and support usage',
      'Show divergence between top and bottom performers',
    ],
    placeholders: [
      {
        key: 'behaviour-bars',
        type: 'chart',
        label: 'Grouped bar chart for behavioural KPIs by segment',
        description: 'Include highlight for standout segment.',
      },
    ],
  },
  {
    title: 'Segment Value',
    description: 'Quantify the economic contribution of each cohort.',
    bulletPoints: [
      'Average revenue and margin per segment',
      'Lifetime value uplift vs. baseline customers',
      'Profitability considerations for targeting spend',
    ],
    placeholders: [
      {
        key: 'value-columns',
        type: 'chart',
        label: 'Column chart ranking segments by revenue and margin',
        description: 'Add annotation for highest-value group.',
      },
    ],
  },
  {
    title: 'Marketing Strategies',
    description: 'Align strategies and messaging per segment.',
    bulletPoints: [
      'Channel mix and creative approach tailored to each persona',
      'Recommended offers and value propositions',
      'Operational owners and cadence per strategy',
    ],
    placeholders: [
      {
        key: 'strategy-table',
        type: 'table',
        label: 'Table mapping segments to recommended marketing actions',
        description: 'Include columns for message, channel, and KPI.',
      },
    ],
  },
  {
    title: 'KPI Impact',
    description: 'Show projected uplift from segment-led strategies.',
    bulletPoints: [
      'Expected revenue or retention lift per initiative',
      'Compare baseline vs. targeted scenario',
      'Add note on measurement methodology',
    ],
    placeholders: [
      {
        key: 'kpi-waterfall',
        type: 'waterfall',
        label: 'Waterfall chart linking initiatives to total uplift',
        description: 'Highlight cumulative effect at the end of the bar.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Plan how segmentation activates across the organisation.',
    bulletPoints: [
      'Integrate segments into CRM and marketing automation',
      'Enable teams with persona playbooks and dashboards',
      'Establish governance for refreshing clusters',
    ],
    placeholders: [
      {
        key: 'segmentation-roadmap',
        type: 'timeline',
        label: 'Process diagram from pilot activation to scale deployment',
        description: 'Use milestones for data, enablement, and optimisation.',
      },
    ],
  },
];

const marketingMixSlides: SlideSpec[] = [
  {
    title: 'Marketing Mix Modeling for [Brand]',
    subtitle: 'ROI insight and spend optimisation narrative',
    description: 'Introduce the MMM engagement, scope, and value promise.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Optimise spend for growth and profitability',
    placeholders: [
      {
        key: 'mmm-cover',
        type: 'image',
        label: 'Campaign collage or brand creative imagery',
        description: 'Swap with brand visuals representing paid channels.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'mmm-kpis',
        type: 'metric',
        label: 'Snapshot of spend, incremental revenue, ROI',
        description: 'Use modern metric chips with icons per KPI.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Define the purpose of MMM for stakeholders.',
    bulletPoints: [
      'Quantify ROI across marketing channels',
      'Inform optimal budget allocation and scenario planning',
      'Strengthen executive confidence in investment strategy',
    ],
    placeholders: [
      {
        key: 'objective-text',
        type: 'text',
        label: 'Narrative block summarising MMM objectives',
        description: 'Include callouts for efficiency vs. effectiveness goals.',
      },
    ],
  },
  {
    title: 'Data Overview',
    description: 'List the data sets powering the MMM model.',
    bulletPoints: [
      'Media spend across TV, digital, OOH, and partner channels',
      'Sales outcomes, promotions, and seasonality signals',
      'External factors: macroeconomic indices, competitor moves',
    ],
    placeholders: [
      {
        key: 'mmm-data-table',
        type: 'table',
        label: 'Data inventory matrix with owner, cadence, and notes',
        description: 'Highlight any modelling assumptions alongside.',
      },
    ],
  },
  {
    title: 'Modeling Framework',
    description: 'Explain the modeling approach for MMM.',
    bulletPoints: [
      'Hierarchical regression or Bayesian MMM to capture channel effects',
      'Diminishing returns and adstock transformations',
      'Model validation and holdout strategy',
    ],
    placeholders: [
      {
        key: 'mmm-pipeline',
        type: 'diagram',
        label: 'Pipeline diagram from data ingestion to optimisation output',
        description: 'Include icons for modelling, calibration, and reporting.',
      },
    ],
  },
  {
    title: 'Channel Contributions',
    description: 'Break down how channels drive base vs. incremental sales.',
    bulletPoints: [
      'Stack contributions to show total impact of each channel',
      'Differentiate base vs. incremental components',
      'Highlight top and rising performers',
    ],
    placeholders: [
      {
        key: 'contribution-stacked',
        type: 'chart',
        label: 'Stacked bar chart of channel contribution to revenue',
        description: 'Segment by base vs. incremental within each bar.',
      },
    ],
  },
  {
    title: 'ROI by Channel',
    description: 'Compare ROI across media investments.',
    bulletPoints: [
      'Show ROI for each channel with confidence intervals',
      'Highlight channels with over- or under-investment',
      'Connect ROI to spend levels for context',
    ],
    placeholders: [
      {
        key: 'roi-bars',
        type: 'chart',
        label: 'Horizontal bar chart ranking ROI by channel',
        description: 'Add annotation for benchmark ROI target line.',
      },
    ],
  },
  {
    title: 'Diminishing Returns',
    description: 'Visualise the response curves by channel.',
    bulletPoints: [
      'Show spend vs. ROI or incremental response curve',
      'Annotate saturation point for each channel',
      'Recommend investment guardrails',
    ],
    placeholders: [
      {
        key: 'diminishing-curve',
        type: 'chart',
        label: 'S-curve chart for spend vs. incremental ROI',
        description: 'Shade recommended operating zone for spend.',
      },
    ],
  },
  {
    title: 'Base vs. Incremental Sales',
    description: 'Decompose total sales into base and media-driven lift.',
    bulletPoints: [
      'Compare baseline sales to media-driven incremental impact',
      'Show contributions for each major channel or cluster',
      'Connect to business seasonality insights',
    ],
    placeholders: [
      {
        key: 'base-incremental-area',
        type: 'chart',
        label: 'Area chart splitting base vs. incremental sales over time',
        description: 'Overlay annotations for major campaign bursts.',
      },
    ],
  },
  {
    title: 'Optimal Spend Mix',
    description: 'Recommend optimal allocation across channels.',
    bulletPoints: [
      'Scenario analysis for optimal budget distribution',
      'Highlight recommended shifts vs. current spend',
      'Mention constraints or dependencies',
    ],
    placeholders: [
      {
        key: 'optimal-mix',
        type: 'bubble',
        label: 'Bubble or pie chart representing optimal channel mix',
        description: 'Size bubbles by spend, colour by ROI.',
      },
    ],
  },
  {
    title: 'Budget Reallocation',
    description: 'Simulate the impact of reallocating spend.',
    bulletPoints: [
      'Show recommended budget shifts vs. current plan',
      'Quantify incremental revenue impact per change',
      'Include guardrails or prerequisites for execution',
    ],
    placeholders: [
      {
        key: 'budget-tornado',
        type: 'waterfall',
        label: 'Tornado or column chart comparing current vs. proposed budget',
        description: 'Use directional arrows for increases and decreases.',
      },
    ],
  },
  {
    title: 'Business Impact',
    description: 'Project the financial upside of MMM recommendations.',
    bulletPoints: [
      'Incremental revenue forecast under optimised mix',
      'ROI uplift vs. status quo',
      'Confidence intervals or scenario bands for planning',
    ],
    placeholders: [
      {
        key: 'impact-line',
        type: 'chart',
        label: 'Line projection showing revenue trajectory with optimisation',
        description: 'Overlay baseline vs. optimised scenario lines.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Detail the cadence for MMM refreshes and adoption.',
    bulletPoints: [
      'Embed MMM outputs in planning cycles',
      'Define ownership for data refresh and governance',
      'Schedule workshops and enablement for marketing leads',
    ],
    placeholders: [
      {
        key: 'mmm-timeline',
        type: 'timeline',
        label: 'Timeline showing quarterly MMM refresh and governance touchpoints',
        description: 'Include icons for data, modelling, and planning steps.',
      },
    ],
  },
];

const demandForecastingSlides: SlideSpec[] = [
  {
    title: 'Demand Forecasting Overview',
    subtitle: 'Predictive insights for product and inventory planning',
    description: 'Set the stage for the forecasting engagement and key outcomes.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Align supply with demand to delight customers',
    placeholders: [
      {
        key: 'forecasting-cover',
        type: 'image',
        label: 'Visual of product assortment or supply chain illustration',
        description: 'Swap with photography or abstract patterns representing demand.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'forecast-kpi',
        type: 'metric',
        label: 'Metrics: forecast horizon, accuracy target, cadence',
        description: 'Use metric cards with icons for time horizon and accuracy.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Clarify the forecasting mandate for the business.',
    bulletPoints: [
      'Predict demand to reduce stock-outs and overstock',
      'Support sales, merchandising, and supply chain decisions',
      'Provide transparency for planning and scenario analysis',
    ],
    placeholders: [
      {
        key: 'objective-summary',
        type: 'text',
        label: 'Summary block articulating demand forecasting goals',
        description: 'Include icons for service level, inventory, and revenue.',
      },
    ],
  },
  {
    title: 'Data Summary',
    description: 'List the key data used for forecasting models.',
    bulletPoints: [
      'Historical sales, inventory positions, and pricing',
      'Promotion calendars and marketing signals',
      'External factors: weather, holidays, macro trends',
    ],
    placeholders: [
      {
        key: 'data-summary-table',
        type: 'table',
        label: 'Table describing each data source, granularity, and refresh',
        description: 'Add notes on data quality and transformations.',
      },
    ],
  },
  {
    title: 'Model Selection',
    description: 'Describe algorithms selected for forecasting.',
    bulletPoints: [
      'Classical models: ARIMA, ETS for baseline patterns',
      'Prophet for holiday effects and trend decomposition',
      'LSTM or gradient boosting for complex seasonality',
    ],
    placeholders: [
      {
        key: 'model-stack',
        type: 'diagram',
        label: 'Diagram contrasting ARIMA, Prophet, and machine learning approaches',
        description: 'Show decision tree for selecting best-fit model.',
      },
    ],
  },
  {
    title: 'Feature Engineering',
    description: 'Highlight engineered features powering models.',
    bulletPoints: [
      'Seasonality indicators, lagged features, and rolling windows',
      'Holiday/event flags and price elasticity features',
      'External regressors such as macroeconomic signals',
    ],
    placeholders: [
      {
        key: 'feature-flow',
        type: 'flow',
        label: 'Flow diagram illustrating feature pipelines',
        description: 'Include branch for domain-specific adjustments.',
      },
    ],
  },
  {
    title: 'Model Accuracy',
    description: 'Share accuracy metrics for the forecasts.',
    bulletPoints: [
      'Metrics: MAPE, RMSE, and bias across holdout periods',
      'Benchmark vs. naive or historical forecast',
      'Callouts for accuracy by product or region tiers',
    ],
    placeholders: [
      {
        key: 'accuracy-line',
        type: 'chart',
        label: 'Line chart comparing actual vs. forecast error metrics',
        description: 'Include callout for target thresholds.',
      },
    ],
  },
  {
    title: 'Forecast Results',
    description: 'Visualise the forecast compared to actuals.',
    bulletPoints: [
      'Overlay forecast vs. actual demand for selected SKUs',
      'Highlight variance windows requiring attention',
      'Discuss implications for service levels',
    ],
    placeholders: [
      {
        key: 'forecast-line-chart',
        type: 'chart',
        label: 'Line chart with forecast vs. actual demand and confidence bands',
        description: 'Add annotation for major events influencing demand.',
      },
    ],
  },
  {
    title: 'Category Forecast',
    description: 'Share forecasts by category, region, or SKU cluster.',
    bulletPoints: [
      'Small multiples for key product families or regions',
      'Highlight categories with growth or risk',
      'Indicate upcoming launches or discontinuations',
    ],
    placeholders: [
      {
        key: 'category-multiples',
        type: 'chart',
        label: 'Small multiples layout for category-level demand outlook',
        description: 'Reserve space for three or four mini charts inside the frame.',
      },
    ],
  },
  {
    title: 'Scenario Planning',
    description: 'Model demand under promotional or macro scenarios.',
    bulletPoints: [
      'Simulate demand shifts under promo depth or price changes',
      'Consider supply constraints or macroeconomic swings',
      'Provide playbook for reacting to scenarios',
    ],
    placeholders: [
      {
        key: 'scenario-area',
        type: 'chart',
        label: 'Area chart comparing baseline vs. scenario forecasts',
        description: 'Use gradient fills for each scenario band.',
      },
    ],
  },
  {
    title: 'Supply Implications',
    description: 'Translate forecast insights into supply chain action.',
    bulletPoints: [
      'Identify stock-out risks and inventory imbalances',
      'Recommend production or replenishment adjustments',
      'Link to service level and working capital targets',
    ],
    placeholders: [
      {
        key: 'supply-waterfall',
        type: 'waterfall',
        label: 'Waterfall chart showing inventory impact before and after actions',
        description: 'Include icons for logistics, procurement, and stores.',
      },
    ],
  },
  {
    title: 'Business Recommendations',
    description: 'Provide actionable insights for leadership.',
    bulletPoints: [
      'Communicate top levers to improve forecast accuracy',
      'Partner actions for sales, operations, and finance teams',
      'Technology or process enhancements required',
    ],
    placeholders: [
      {
        key: 'recommendation-cards',
        type: 'text',
        label: 'Recommendation cards summarising action, owner, and impact',
        description: 'Use three-column layout for quick scanning.',
      },
    ],
  },
  {
    title: 'Forecast Governance',
    description: 'Lay out cadence and ownership for ongoing forecasting.',
    bulletPoints: [
      'Meeting rhythm for forecast reviews and adjustments',
      'Ownership matrix across planning, analytics, and supply',
      'Tooling and dashboard updates to monitor accuracy',
    ],
    placeholders: [
      {
        key: 'governance-timeline',
        type: 'timeline',
        label: 'Process flow for forecast creation, review, and publication',
        description: 'Map monthly, weekly, and daily touchpoints.',
      },
    ],
  },
];

const priceOptimizationSlides: SlideSpec[] = [
  {
    title: 'Price Optimization',
    subtitle: 'Data-led pricing to maximise revenue and profit',
    description: 'Introduce the pricing optimisation journey and opportunity.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Balance growth and profitability with precision pricing',
    placeholders: [
      {
        key: 'price-cover',
        type: 'image',
        label: 'Product imagery or pricing tag visual',
        description: 'Use brand photography or stylised illustration.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'price-kpi',
        type: 'metric',
        label: 'Metrics: revenue uplift target, margin guardrail, elasticity focus',
        description: 'Include quick KPI badges for clarity.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Clarify goals for price optimisation efforts.',
    bulletPoints: [
      'Identify price points that maximise revenue and margin',
      'Understand elasticity across categories and segments',
      'Enable agile pricing tests and governance',
    ],
    placeholders: [
      {
        key: 'objective-summary',
        type: 'text',
        label: 'Summary card describing pricing goals and KPIs',
        description: 'Highlight revenue, margin, and competitiveness aims.',
      },
    ],
  },
  {
    title: 'Data Sources',
    description: 'Summarise datasets fuelling pricing models.',
    bulletPoints: [
      'Historical sales, promotions, and discounting',
      'Competitive pricing intelligence and market indices',
      'Cost inputs and elasticity experiments',
    ],
    placeholders: [
      {
        key: 'pricing-data-table',
        type: 'table',
        label: 'Table listing data sources, granularity, and coverage',
        description: 'Add column for freshness and owner.',
      },
    ],
  },
  {
    title: 'Modeling',
    description: 'Describe the modelling approach to price elasticity.',
    bulletPoints: [
      'Log-log regression for elasticity estimation',
      'Segmentation by channel, region, and SKU attributes',
      'Scenario engine to model price-impact trade-offs',
    ],
    placeholders: [
      {
        key: 'pricing-flow',
        type: 'flow',
        label: 'Flowchart of elasticity modelling steps',
        description: 'Include data prep, modelling, validation, and deployment.',
      },
    ],
  },
  {
    title: 'Elasticity Results',
    description: 'Display elasticity curves and sensitivity.',
    bulletPoints: [
      'Show price vs. demand curve with key thresholds',
      'Annotate elasticity at different price points',
      'Highlight break-even and optimal range',
    ],
    placeholders: [
      {
        key: 'elasticity-curve',
        type: 'chart',
        label: 'Line chart showing price vs. demand curve',
        description: 'Shade target operating zone and annotate optimal point.',
      },
    ],
  },
  {
    title: 'Category Impact',
    description: 'Surface elasticity variation across categories or SKUs.',
    bulletPoints: [
      'Compare elasticity across product families',
      'Call out sensitive items needing careful management',
      'Identify resilient SKUs for margin expansion',
    ],
    placeholders: [
      {
        key: 'category-bars',
        type: 'chart',
        label: 'Bar chart showing elasticity per category or SKU',
        description: 'Highlight key segments with annotations.',
      },
    ],
  },
  {
    title: 'Competitor Benchmark',
    description: 'Evaluate pricing relative to competitors.',
    bulletPoints: [
      'Benchmark price gaps vs. key competitors',
      'Overlay share or traffic impact from price differentials',
      'Identify opportunities for premium positioning',
    ],
    placeholders: [
      {
        key: 'competitor-scatter',
        type: 'chart',
        label: 'Scatter plot of price vs. competitor price with size by volume',
        description: 'Include diagonal parity line for quick comparison.',
      },
    ],
  },
  {
    title: 'Optimal Price',
    description: 'Reveal the recommended price point per SKU or segment.',
    bulletPoints: [
      'Show revenue-maximising price based on elasticity',
      'Annotate margin thresholds and guardrails',
      'Include notes on test cadence and monitoring',
    ],
    placeholders: [
      {
        key: 'optimal-line',
        type: 'chart',
        label: 'Line chart with annotation for optimal price point',
        description: 'Add callout for incremental revenue at the optimum.',
      },
    ],
  },
  {
    title: 'Margin Sensitivity',
    description: 'Assess margin impact across price scenarios.',
    bulletPoints: [
      'Plot profit curve vs. price adjustments',
      'Highlight guardrails to protect contribution margin',
      'Discuss trade-offs between volume and margin',
    ],
    placeholders: [
      {
        key: 'margin-area',
        type: 'chart',
        label: 'Area chart showing profit vs. price changes',
        description: 'Shade profit-protected zone for leadership clarity.',
      },
    ],
  },
  {
    title: 'Scenario Simulation',
    description: 'Explore what-if pricing scenarios.',
    bulletPoints: [
      'Model price increases and decreases with expected impact',
      'Include promotional or competitive response scenarios',
      'Quantify revenue and margin deltas for each scenario',
    ],
    placeholders: [
      {
        key: 'scenario-tornado',
        type: 'waterfall',
        label: 'Tornado chart comparing scenario outcomes vs. base',
        description: 'Use diverging bars to signal upside vs. downside.',
      },
    ],
  },
  {
    title: 'Recommendations',
    description: 'Summarise pricing actions and governance.',
    bulletPoints: [
      'Adjustments by category, region, and channel',
      'Testing roadmap and monitoring cadence',
      'Communications plan for stakeholders',
    ],
    placeholders: [
      {
        key: 'pricing-recommendations',
        type: 'text',
        label: 'Recommendation summary cards with action, owner, impact',
        description: 'Arrange as vertical stack for readability.',
      },
    ],
  },
  {
    title: 'Implementation Roadmap',
    description: 'Lay out pricing governance and execution milestones.',
    bulletPoints: [
      'Timeline for testing, rollout, and monitoring',
      'Stakeholder responsibilities and approvals',
      'Tools and dashboards supporting pricing decisions',
    ],
    placeholders: [
      {
        key: 'pricing-roadmap',
        type: 'timeline',
        label: 'Timeline graphic highlighting pricing governance phases',
        description: 'Include checkpoints for analytics, finance, and merchandising.',
      },
    ],
  },
];

const promoEffectivenessSlides: SlideSpec[] = [
  {
    title: 'Promo Effectiveness Analysis',
    subtitle: 'Campaign performance and uplift storytelling',
    description: 'Cover slide introducing the promotional analysis and timeframe.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Accelerate promo ROI with smarter targeting',
    placeholders: [
      {
        key: 'promo-cover',
        type: 'image',
        label: 'Campaign hero creative or seasonal imagery',
        description: 'Use visuals from the featured promotion.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'promo-kpi',
        type: 'metric',
        label: 'Summary metrics: uplift %, incremental revenue, ROI',
        description: 'Display as stacked metric tiles for quick view.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Set the scope and goals of the promotion evaluation.',
    bulletPoints: [
      'Define campaign period and key products or categories',
      'Clarify KPIs: incremental sales, ROI, customer acquisition',
      'Outline decisions informed by the study',
    ],
    placeholders: [
      {
        key: 'objective-summary',
        type: 'text',
        label: 'Summary block articulating promo effectiveness objectives',
        description: 'Include icons for sales, customers, and ROI.',
      },
    ],
  },
  {
    title: 'Data Overview',
    description: 'List the data inputs used to measure promo lift.',
    bulletPoints: [
      'Channel spend, impression, and conversion metrics',
      'Baseline sales, uplift performance, and segmentation',
      'Promo mechanics such as discount depth and duration',
    ],
    placeholders: [
      {
        key: 'promo-data-table',
        type: 'table',
        label: 'Data matrix outlining each source, cadence, and owner',
        description: 'Add column for promo-specific notes or tags.',
      },
    ],
  },
  {
    title: 'Methodology',
    description: 'Explain modelling or analytical approach for promo uplift.',
    bulletPoints: [
      'Regression or uplift modelling to isolate incrementality',
      'Control vs. exposed groups and matching technique',
      'Confidence intervals and validation checks',
    ],
    placeholders: [
      {
        key: 'promo-method-flow',
        type: 'flow',
        label: 'Flowchart visualising modelling stages and controls',
        description: 'Include icons for data prep, modelling, validation, reporting.',
      },
    ],
  },
  {
    title: 'Incremental Sales',
    description: 'Quantify incremental revenue generated by the promo.',
    bulletPoints: [
      'Lift vs. baseline with segmentation by product or channel',
      'Highlight contribution from new vs. existing customers',
      'Note confidence levels or statistical significance',
    ],
    placeholders: [
      {
        key: 'incremental-column',
        type: 'chart',
        label: 'Column chart comparing baseline vs. incremental sales',
        description: 'Highlight bars representing largest uplift.',
      },
    ],
  },
  {
    title: 'ROI by Channel',
    description: 'Compare promo ROI across channels.',
    bulletPoints: [
      'Evaluate ROI per channel or tactic',
      'Spot underperforming channels for reinvestment',
      'Mention data nuances or promotional overlap',
    ],
    placeholders: [
      {
        key: 'promo-roi-bars',
        type: 'chart',
        label: 'Horizontal bar chart ranking ROI by channel',
        description: 'Include target line for minimum acceptable ROI.',
      },
    ],
  },
  {
    title: 'Frequency Impact',
    description: 'Assess how promo frequency influences results.',
    bulletPoints: [
      'Compare uplift across frequency bands',
      'Note diminishing returns from overexposure',
      'Identify optimal cadence for future campaigns',
    ],
    placeholders: [
      {
        key: 'frequency-line',
        type: 'chart',
        label: 'Line chart showing uplift vs. promo frequency',
        description: 'Annotate sweet spot and overexposure regions.',
      },
    ],
  },
  {
    title: 'Creative Performance',
    description: 'Highlight which creatives or messages resonated.',
    bulletPoints: [
      'Compare creative variants by engagement and conversion',
      'Call out best-performing messaging themes',
      'Identify optimisation ideas for future creatives',
    ],
    placeholders: [
      {
        key: 'creative-bubble',
        type: 'chart',
        label: 'Bubble chart mapping creative performance vs. spend',
        description: 'Use bubble size for conversions and colour for ROI.',
      },
    ],
  },
  {
    title: 'Temporal Effects',
    description: 'Show performance before, during, and after the campaign.',
    bulletPoints: [
      'Overlay baseline vs. promo period vs. post-period',
      'Call out halo or cannibalisation effects',
      'Align with seasonal events or holidays',
    ],
    placeholders: [
      {
        key: 'temporal-area',
        type: 'chart',
        label: 'Area chart comparing pre, during, and post-promo performance',
        description: 'Shade phases with gradient and annotate peaks.',
      },
    ],
  },
  {
    title: 'Optimization Levers',
    description: 'Summarise opportunities to optimise future promos.',
    bulletPoints: [
      'Adjust spend allocation across channels',
      'Refine audience targeting or offer depth',
      'Coordinate timing with complementary campaigns',
    ],
    placeholders: [
      {
        key: 'optimization-heatmap',
        type: 'heatmap',
        label: 'Heatmap of promo levers vs. performance uplift',
        description: 'Use icons to denote levers: spend, offer, channel, timing.',
      },
    ],
  },
  {
    title: 'Insights Summary',
    description: 'Highlight key drivers of success and learnings.',
    bulletPoints: [
      'Top three drivers of incremental performance',
      'Actions to replicate or avoid next time',
      'Alignment with broader marketing strategy',
    ],
    placeholders: [
      {
        key: 'insight-cards',
        type: 'text',
        label: 'Insight cards summarising drivers, actions, and owners',
        description: 'Arrange three tiles with icons for clarity.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Outline future planning cadence and follow-ups.',
    bulletPoints: [
      'Schedule optimisation workshops and tests',
      'Update promo calendar with winning strategies',
      'Integrate learnings into dashboards and reporting',
    ],
    placeholders: [
      {
        key: 'promo-roadmap',
        type: 'timeline',
        label: 'Roadmap graphic covering next promo planning cycles',
        description: 'Include milestones for planning, execution, and analysis.',
      },
    ],
  },
];

const exploratoryDataAnalysisSlides: SlideSpec[] = [
  {
    title: 'EDA Report for [Dataset]',
    subtitle: 'Patterns, trends, and data quality insights',
    description: 'Introduce the dataset and analytic objectives for the exploration.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Discover signals to accelerate downstream modelling',
    placeholders: [
      {
        key: 'eda-cover',
        type: 'image',
        label: 'Dataset hero image or abstract data visual',
        description: 'Swap with dataset-specific imagery.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'eda-stats',
        type: 'metric',
        label: 'Dataset snapshot: records, variables, time span',
        description: 'Display as concise stat tiles.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Clarify the purpose of the exploratory analysis.',
    bulletPoints: [
      'Understand dataset composition, quality, and readiness',
      'Surface patterns, trends, and anomalies',
      'Identify hypotheses for modelling or business action',
    ],
    placeholders: [
      {
        key: 'eda-objective',
        type: 'text',
        label: 'Objective card summarising exploration goals',
        description: 'Include icons for quality, trends, and modelling readiness.',
      },
    ],
  },
  {
    title: 'Dataset Summary',
    description: 'Outline dataset structure and metadata.',
    bulletPoints: [
      'Variables, data types, and descriptive stats',
      'Observation count, time coverage, and refresh cadence',
      'Source systems and integration notes',
    ],
    placeholders: [
      {
        key: 'dataset-table',
        type: 'table',
        label: 'Table listing field name, type, completeness, and notes',
        description: 'Include column for business owner.',
      },
    ],
  },
  {
    title: 'Missing Data',
    description: 'Highlight null counts and patterns.',
    bulletPoints: [
      'Field-level missing data volume',
      'Patterns indicating structural gaps',
      'Imputation or remediation strategy',
    ],
    placeholders: [
      {
        key: 'missing-bar',
        type: 'chart',
        label: 'Bar chart ranking fields by missingness',
        description: 'Consider heatmap overlay for missing segments.',
      },
    ],
  },
  {
    title: 'Univariate Analysis',
    description: 'Visualise distributions for key variables.',
    bulletPoints: [
      'Histogram or density for numerical variables',
      'Count plots for categorical fields',
      'Highlight skewness or heavy tails',
    ],
    placeholders: [
      {
        key: 'univariate-histograms',
        type: 'chart',
        label: 'Grid of histogram placeholders for priority variables',
        description: 'Reserve slots for three to four variables.',
      },
    ],
  },
  {
    title: 'Bivariate Relationships',
    description: 'Show correlations or associations between variables.',
    bulletPoints: [
      'Scatter or heatmap for key predictor relationships',
      'Highlight correlations driving target variable',
      'Discuss non-linear patterns',
    ],
    placeholders: [
      {
        key: 'correlation-heatmap',
        type: 'heatmap',
        label: 'Heatmap showing pairwise correlation coefficients',
        description: 'Include annotation for strongest relationships.',
      },
    ],
  },
  {
    title: 'Outliers',
    description: 'Identify and contextualise outliers.',
    bulletPoints: [
      'Box plots or scatter to surface outliers',
      'Potential data issues vs. true anomalies',
      'Plan for handling in downstream analysis',
    ],
    placeholders: [
      {
        key: 'outlier-box',
        type: 'chart',
        label: 'Box plot layout comparing distributions with outliers',
        description: 'Use callouts for notable anomalies.',
      },
    ],
  },
  {
    title: 'Categorical Insights',
    description: 'Analyse categorical contributions.',
    bulletPoints: [
      'Bar charts of categorical contribution to target',
      'Highlight top categories by performance or frequency',
      'Call out segments requiring deeper analysis',
    ],
    placeholders: [
      {
        key: 'categorical-bars',
        type: 'chart',
        label: 'Bar chart placeholders for categorical feature analysis',
        description: 'Stack or group bars to show splits.',
      },
    ],
  },
  {
    title: 'Time Trends',
    description: 'Explore temporal patterns and seasonality.',
    bulletPoints: [
      'Line charts for trends and seasonality',
      'Highlight peak periods or anomalies',
      'Relate to events or promotions',
    ],
    placeholders: [
      {
        key: 'time-trend-line',
        type: 'chart',
        label: 'Line chart showing time series trends with annotations',
        description: 'Include callouts for significant events.',
      },
    ],
  },
  {
    title: 'Feature Importance',
    description: 'Rank predictors by impact on target variable.',
    bulletPoints: [
      'Preliminary feature importance from simple model',
      'Note features requiring transformation',
      'Inform next-step modelling focus',
    ],
    placeholders: [
      {
        key: 'eda-feature-bars',
        type: 'chart',
        label: 'Bar chart ranking preliminary feature importance',
        description: 'Use gradient fill to emphasise top drivers.',
      },
    ],
  },
  {
    title: 'Key Insights',
    description: 'Summarise discoveries from the EDA.',
    bulletPoints: [
      'Top behavioural or operational insights',
      'Data quality watch-outs',
      'Hypotheses for further testing',
    ],
    placeholders: [
      {
        key: 'eda-insight-cards',
        type: 'text',
        label: 'Insight cards capturing headline findings and owners',
        description: 'Design as elegant cards for quick consumption.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Outline readiness for modelling and follow-up actions.',
    bulletPoints: [
      'Data cleaning tasks and ownership',
      'Feature engineering roadmap',
      'Decision points for modelling or stakeholder review',
    ],
    placeholders: [
      {
        key: 'eda-checklist',
        type: 'text',
        label: 'Checklist layout with readiness criteria and owners',
        description: 'Include tick boxes for each action item.',
      },
    ],
  },
];

const forecastingAnalysisSlides: SlideSpec[] = [
  {
    title: 'Forecasting Analysis Overview',
    subtitle: 'Time-based trends, seasonality, and event impact',
    description: 'Introduce the broader forecasting analysis beyond demand planning.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Reveal drivers behind time-series performance',
    placeholders: [
      {
        key: 'forecasting-analysis-cover',
        type: 'image',
        label: 'Temporal or seasonal illustration',
        description: 'Use imagery reflecting time or trends.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'forecasting-analysis-kpi',
        type: 'metric',
        label: 'Key facts: time horizon, segments analysed, refresh cadence',
        description: 'Display as concise metrics with icons.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Define aims of the forecasting analysis.',
    bulletPoints: [
      'Diagnose trend components and structural shifts',
      'Quantify seasonality and event impacts',
      'Provide insight for planning, marketing, and finance teams',
    ],
    placeholders: [
      {
        key: 'forecasting-analysis-objective',
        type: 'text',
        label: 'Summary card of objectives and stakeholders',
        description: 'Include icons for finance, marketing, and operations.',
      },
    ],
  },
  {
    title: 'Data Inputs',
    description: 'List the time-series data and supporting signals.',
    bulletPoints: [
      'Historical performance metrics and KPIs',
      'Event calendars: holidays, campaigns, disruptions',
      'External indicators such as weather or macro drivers',
    ],
    placeholders: [
      {
        key: 'forecasting-analysis-data-table',
        type: 'table',
        label: 'Table summarising time-series sources, granularity, and owner',
        description: 'Include notes on transformations or adjustments.',
      },
    ],
  },
  {
    title: 'Trend Decomposition',
    description: 'Break down the series into trend, seasonality, and residual components.',
    bulletPoints: [
      'Use STL or classical decomposition',
      'Explain structural trend shifts and inflection points',
      'Highlight residual patterns needing attention',
    ],
    placeholders: [
      {
        key: 'trend-decomposition',
        type: 'chart',
        label: 'Multi-panel chart showing trend, seasonality, residual',
        description: 'Reserve stacked layout for each component.',
      },
    ],
  },
  {
    title: 'Seasonality Insights',
    description: 'Detail seasonal patterns across segments.',
    bulletPoints: [
      'Monthly or weekly seasonality signatures',
      'Compare across product or region segments',
      'Highlight peak and trough periods',
    ],
    placeholders: [
      {
        key: 'seasonality-heatmap',
        type: 'heatmap',
        label: 'Heatmap of seasonality index by month and segment',
        description: 'Highlight cells with strong seasonal effects.',
      },
    ],
  },
  {
    title: 'Autocorrelation Analysis',
    description: 'Show autocorrelation and partial autocorrelation insights.',
    bulletPoints: [
      'Identify significant lags driving forecast dynamics',
      'Inform model order selection and feature engineering',
      'Highlight anomalies in autocorrelation structure',
    ],
    placeholders: [
      {
        key: 'autocorrelation-plots',
        type: 'chart',
        label: 'Correlogram placeholders for ACF and PACF',
        description: 'Include markers for significant lags.',
      },
    ],
  },
  {
    title: 'Event Impact',
    description: 'Quantify how events affect the time series.',
    bulletPoints: [
      'Measure uplift or dips around key events',
      'Segment by event type such as promos, weather, or outages',
      'Highlight lasting vs. short-term impacts',
    ],
    placeholders: [
      {
        key: 'event-impact',
        type: 'chart',
        label: 'Event impact analysis chart with annotations',
        description: 'Use event markers on the time line and summary cards.',
      },
    ],
  },
  {
    title: 'Forecast Scenarios',
    description: 'Compare baseline and scenario forecasts.',
    bulletPoints: [
      'Baseline forecast vs. alternative scenarios',
      'Highlight upper and lower bounds',
      'Discuss assumptions behind each scenario',
    ],
    placeholders: [
      {
        key: 'scenario-lines',
        type: 'chart',
        label: 'Line chart overlaying multiple scenario forecasts',
        description: 'Include shading for confidence intervals.',
      },
    ],
  },
  {
    title: 'Dashboard Preview',
    description: 'Showcase how insights will surface in dashboards.',
    bulletPoints: [
      'Layout of live forecasting dashboard',
      'Highlight interactive filters and alerts',
      'Connect to data refresh and ownership',
    ],
    placeholders: [
      {
        key: 'dashboard-preview',
        type: 'dashboard',
        label: 'Dashboard mock-up placeholder with cards and charts',
        description: 'Use wireframe elements indicating interactions.',
      },
    ],
  },
  {
    title: 'Recommendations',
    description: 'Provide strategic and operational recommendations.',
    bulletPoints: [
      'Actions to leverage trend or seasonality patterns',
      'Mitigation for adverse event impacts',
      'Cross-functional coordination required',
    ],
    placeholders: [
      {
        key: 'forecasting-analysis-recommendations',
        type: 'text',
        label: 'Recommendation cards with action, owner, timing',
        description: 'Arrange as vertical stack.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Outline governance and refresh cadence for forecasting analysis.',
    bulletPoints: [
      'Establish monitoring and alerting workflows',
      'Schedule regular reviews with stakeholders',
      'Plan enhancements for future cycles',
    ],
    placeholders: [
      {
        key: 'forecasting-analysis-roadmap',
        type: 'timeline',
        label: 'Timeline of ongoing forecasting analysis milestones',
        description: 'Include checkpoints for analysis, review, and rollout.',
      },
    ],
  },
];

const priceLadderSlides: SlideSpec[] = [
  {
    title: 'Price Ladder Analytics Overview',
    subtitle: 'Elasticity across tiers and ladder optimisation',
    description: 'Introduce the price ladder analysis, scope, and goals.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Balance value perception across every rung of the ladder',
    placeholders: [
      {
        key: 'ladder-cover',
        type: 'image',
        label: 'Visual of product ladder or tiered assortment',
        description: 'Use imagery that highlights tier differentiation.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'ladder-kpi',
        type: 'metric',
        label: 'Key metrics: tiers analysed, revenue share, margin mix',
        description: 'Display as stacked KPI badges.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Clarify the goals of price ladder analytics.',
    bulletPoints: [
      'Understand elasticity across price tiers',
      'Optimise mix to maximise revenue and margin',
      'Align ladder structure with customer perception',
    ],
    placeholders: [
      {
        key: 'ladder-objective',
        type: 'text',
        label: 'Objective summary with focus areas',
        description: 'Include icons for elasticity, margin, and customer value.',
      },
    ],
  },
  {
    title: 'Current Ladder Snapshot',
    description: 'Summarise current ladder structure and performance.',
    bulletPoints: [
      'Tiers, price points, and product counts',
      'Revenue and margin contribution by tier',
      'Customer penetration per rung',
    ],
    placeholders: [
      {
        key: 'ladder-current-waterfall',
        type: 'waterfall',
        label: 'Waterfall chart showing margin flow across ladder tiers',
        description: 'Include annotations for major drop-offs.',
      },
    ],
  },
  {
    title: 'Elasticity Across Tiers',
    description: 'Display elasticity differences along the ladder.',
    bulletPoints: [
      'Elasticity by tier, segment, or region',
      'Identify tiers with pricing power vs. vulnerability',
      'Highlight opportunities for repositioning',
    ],
    placeholders: [
      {
        key: 'ladder-elasticity-bubble',
        type: 'bubble',
        label: 'Bubble chart showing price vs. demand by tier',
        description: 'Use bubble size for revenue share and colour for elasticity.',
      },
    ],
  },
  {
    title: 'Margin Flow',
    description: 'Visualise margin progression across the ladder.',
    bulletPoints: [
      'Bridge gross margin from entry tier to premium',
      'Highlight leakage points or cross-subsidies',
      'Relate to operational costs or promo intensity',
    ],
    placeholders: [
      {
        key: 'ladder-margin-waterfall',
        type: 'waterfall',
        label: 'Waterfall chart mapping gross to net margin across tiers',
        description: 'Annotate adjustments such as promo or logistics costs.',
      },
    ],
  },
  {
    title: 'Customer Segments',
    description: 'Link ladder performance to customer segments.',
    bulletPoints: [
      'Segment mix across ladder rungs',
      'Penetration of loyal vs. deal-seeking customers',
      'Identify segments with upsell potential',
    ],
    placeholders: [
      {
        key: 'ladder-heatmap',
        type: 'heatmap',
        label: 'Heatmap of SKU tiers vs. customer segments',
        description: 'Use shading to show performance intensity.',
      },
    ],
  },
  {
    title: 'Competitive Benchmark',
    description: 'Compare ladder against competitors.',
    bulletPoints: [
      'Price gaps vs. key competitors at each tier',
      'Perceived value differentials',
      'Identify differentiation opportunities',
    ],
    placeholders: [
      {
        key: 'ladder-competitive-scatter',
        type: 'chart',
        label: 'Scatter plot comparing our ladder to competitor pricing',
        description: 'Include parity line and highlight differentiation zones.',
      },
    ],
  },
  {
    title: 'Optimised Ladder Proposal',
    description: 'Show the recommended adjustments to the ladder.',
    bulletPoints: [
      'Proposed price changes per tier',
      'New product introductions or retirements',
      'Expected impact on mix and margin',
    ],
    placeholders: [
      {
        key: 'ladder-proposal-chart',
        type: 'chart',
        label: 'Combined chart showing current vs. proposed price ladder',
        description: 'Use connectors to show movement between tiers.',
      },
    ],
  },
  {
    title: 'Scenario Simulation',
    description: 'Model revenue and margin under different ladder scenarios.',
    bulletPoints: [
      'Simulate promotional and premiumisation scenarios',
      'Assess sensitivity to competitor moves',
      'Highlight best vs. worst-case outcomes',
    ],
    placeholders: [
      {
        key: 'ladder-scenario-tornado',
        type: 'waterfall',
        label: 'Tornado chart comparing ladder scenarios vs. base case',
        description: 'Use colour to distinguish upside vs. downside.',
      },
    ],
  },
  {
    title: 'Recommendations',
    description: 'Summarise key actions for ladder optimisation.',
    bulletPoints: [
      'Actions by tier, product family, and segment',
      'Testing roadmap and governance',
      'Dependencies across merchandising, marketing, and finance',
    ],
    placeholders: [
      {
        key: 'ladder-recommendations',
        type: 'text',
        label: 'Recommendation cards with action, owner, timing',
        description: 'Display as stacked cards for each initiative.',
      },
    ],
  },
  {
    title: 'Implementation Roadmap',
    description: 'Lay out timeline and governance for ladder changes.',
    bulletPoints: [
      'Implementation phases and milestones',
      'Stakeholder engagement and approvals',
      'Metrics to monitor success',
    ],
    placeholders: [
      {
        key: 'ladder-roadmap',
        type: 'timeline',
        label: 'Timeline graphic from pilot to full rollout',
        description: 'Include phases for analysis, testing, rollout.',
      },
    ],
  },
];

const ecomPromoPlanningSlides: SlideSpec[] = [
  {
    title: 'E-Commerce Promo Planning',
    subtitle: 'Campaign overview and historical performance',
    description: 'Introduce the e-commerce promo planning initiative and objectives.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Plan promos that maximise uplift without eroding margin',
    placeholders: [
      {
        key: 'ecom-promo-cover',
        type: 'image',
        label: 'E-commerce storefront or product hero image',
        description: 'Use digital-first imagery or UI mock-ups.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'ecom-promo-kpi',
        type: 'metric',
        label: 'Key metrics: budget, historic uplift, conversion rate',
        description: 'Display as compact KPI tiles.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Campaign Overview',
    description: 'Summarise the upcoming campaign scope.',
    bulletPoints: [
      'Promo period, target categories, and audiences',
      'Budget allocation and discount strategy',
      'Alignment with key commercial moments',
    ],
    placeholders: [
      {
        key: 'campaign-overview-card',
        type: 'text',
        label: 'Overview card summarising objectives and KPIs',
        description: 'Include icons for spend, uplift, and timeline.',
      },
    ],
  },
  {
    title: 'Historical Spend',
    description: 'Review historical promo spend and performance.',
    bulletPoints: [
      'Spend vs. uplift across previous campaigns',
      'Channel mix and ROI trends',
      'Lessons learned from prior efforts',
    ],
    placeholders: [
      {
        key: 'historical-spend-chart',
        type: 'chart',
        label: 'Column chart showing historical spend vs. uplift',
        description: 'Highlight standout campaigns with annotations.',
      },
    ],
  },
  {
    title: 'Forecasting Uplift',
    description: 'Estimate promo uplift based on forecast models.',
    bulletPoints: [
      'Forecast uplift by category and channel',
      'Assumptions for traffic, conversion, and AOV',
      'Confidence intervals for plan vs. stretch goals',
    ],
    placeholders: [
      {
        key: 'uplift-forecast',
        type: 'chart',
        label: 'Line chart forecasting uplift vs. baseline',
        description: 'Include shaded band for forecast intervals.',
      },
    ],
  },
  {
    title: 'Discount-Depth Curve',
    description: 'Visualise response vs. discount depth.',
    bulletPoints: [
      'Elasticity of conversion to discount levels',
      'Guardrails for margin preservation',
      'Opportunities for targeted offers',
    ],
    placeholders: [
      {
        key: 'discount-curve',
        type: 'chart',
        label: 'Line chart showing discount depth vs. uplift',
        description: 'Annotate optimal discount range.',
      },
    ],
  },
  {
    title: 'Promo Calendar',
    description: 'Lay out planned promo calendar with key events.',
    bulletPoints: [
      'Key campaign windows and supportive tactics',
      'Channel sequencing for awareness, engagement, conversion',
      'Dependencies on product drops or logistics',
    ],
    placeholders: [
      {
        key: 'promo-calendar',
        type: 'calendar',
        label: 'Calendar layout with promo waves and milestones',
        description: 'Use icons to denote channel focus and objectives.',
      },
    ],
  },
  {
    title: 'Media & Channel Plan',
    description: 'Detail channel strategy for the promo.',
    bulletPoints: [
      'Paid, owned, and earned channel mix',
      'Spend allocation and flighting',
      'Key messages by channel',
    ],
    placeholders: [
      {
        key: 'channel-plan',
        type: 'table',
        label: 'Table mapping channels to spend, objective, and KPI',
        description: 'Include columns for targeting and creative notes.',
      },
    ],
  },
  {
    title: 'Experience Preview',
    description: 'Show UI or creative previews for the promo.',
    bulletPoints: [
      'Homepage, PLP, and checkout experiences',
      'Mobile vs. desktop considerations',
      'Cross-sell and upsell touchpoints',
    ],
    placeholders: [
      {
        key: 'experience-preview',
        type: 'image',
        label: 'Placeholder for annotated UI mock-ups',
        description: 'Use wireframes or screenshots to illustrate flow.',
      },
    ],
  },
  {
    title: 'Simulation Dashboard',
    description: 'Preview the simulation dashboard for ongoing monitoring.',
    bulletPoints: [
      'KPIs tracked during the campaign',
      'Alert thresholds for rapid response',
      'Integration with merchandising and inventory teams',
    ],
    placeholders: [
      {
        key: 'simulation-dashboard',
        type: 'dashboard',
        label: 'Dashboard mock-up with uplift, conversion, and stock metrics',
        description: 'Include space for real-time alerts.',
      },
    ],
  },
  {
    title: 'Risks & Mitigations',
    description: 'Highlight risks and mitigation plans.',
    bulletPoints: [
      'Operational constraints or inventory risks',
      'Customer experience considerations',
      'Fallback plans for underperformance',
    ],
    placeholders: [
      {
        key: 'risk-cards',
        type: 'text',
        label: 'Risk cards with description, impact, mitigation, owner',
        description: 'Use caution-themed styling.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Outline the execution timeline and responsibilities.',
    bulletPoints: [
      'Finalize creative and offers',
      'Align cross-functional squads and approvals',
      'Set monitoring cadence and reporting',
    ],
    placeholders: [
      {
        key: 'promo-planning-roadmap',
        type: 'timeline',
        label: 'Timeline from pre-launch preparation to post-campaign review',
        description: 'Include checkpoints for QA, launch, and retrospectives.',
      },
    ],
  },
];

const ecomMediaPlanningSlides: SlideSpec[] = [
  {
    title: 'E-Commerce Media Planning',
    subtitle: 'Optimise digital media budget and reach',
    description: 'Introduce the media planning initiative and target outcomes.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Maximise conversion efficiency across the media mix',
    placeholders: [
      {
        key: 'media-planning-cover',
        type: 'image',
        label: 'Digital media creative collage or channel icons',
        description: 'Use imagery representing paid media channels.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'media-planning-kpi',
        type: 'metric',
        label: 'Key stats: budget, reach target, conversion goal',
        description: 'Display as clean metric badges.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Objective',
    description: 'Define objectives of the media plan.',
    bulletPoints: [
      'Drive efficient reach and conversions',
      'Balance upper-, mid-, and lower-funnel investment',
      'Align with e-commerce growth targets',
    ],
    placeholders: [
      {
        key: 'media-objective',
        type: 'text',
        label: 'Objective card covering reach, conversion, efficiency goals',
        description: 'Include icons representing funnel stages.',
      },
    ],
  },
  {
    title: 'Channel Spend vs. Conversions',
    description: 'Review spend effectiveness by channel.',
    bulletPoints: [
      'Plot spend vs. conversions for each channel',
      'Highlight channels with diminishing returns',
      'Spot opportunities to reallocate budget',
    ],
    placeholders: [
      {
        key: 'spend-vs-conversions',
        type: 'chart',
        label: 'Scatter chart of spend vs. conversions by channel',
        description: 'Use bubble size for CPA or ROAS.',
      },
    ],
  },
  {
    title: 'CPM & CPA Trends',
    description: 'Monitor cost trends across channels.',
    bulletPoints: [
      'Show CPM and CPA trend lines',
      'Identify channels with rising costs',
      'Discuss mitigation tactics',
    ],
    placeholders: [
      {
        key: 'cost-trends',
        type: 'chart',
        label: 'Dual-axis line chart showing CPM and CPA over time',
        description: 'Highlight spikes or anomalies.',
      },
    ],
  },
  {
    title: 'Reach & Frequency',
    description: 'Assess reach and frequency distribution.',
    bulletPoints: [
      'Compare reach vs. frequency by channel',
      'Highlight overserved or underserved audiences',
      'Recommend adjustments to pacing or caps',
    ],
    placeholders: [
      {
        key: 'reach-frequency',
        type: 'chart',
        label: 'Bubble chart mapping reach vs. frequency vs. CPA',
        description: 'Use colour to denote funnel stage.',
      },
    ],
  },
  {
    title: 'Multi-touch Attribution Flow',
    description: 'Illustrate customer journeys across channels.',
    bulletPoints: [
      'Map typical multi-touch paths',
      'Highlight high-value sequences',
      'Identify drop-off points',
    ],
    placeholders: [
      {
        key: 'mta-flow',
        type: 'diagram',
        label: 'Attribution flow diagram showing key touchpoints',
        description: 'Include nodes for awareness, consideration, conversion.',
      },
    ],
  },
  {
    title: 'Channel Dashboard',
    description: 'Preview the dashboard monitoring channel performance.',
    bulletPoints: [
      'Real-time spend, conversions, and ROAS metrics',
      'Alerting for underperforming channels',
      'Integration with optimisation workflows',
    ],
    placeholders: [
      {
        key: 'media-dashboard',
        type: 'dashboard',
        label: 'Dashboard mock-up showing channel KPIs',
        description: 'Include filters for device, audience, and campaign.',
      },
    ],
  },
  {
    title: 'Optimisation Recommendations',
    description: 'Summarise recommended changes by channel.',
    bulletPoints: [
      'Increase, maintain, or decrease spend guidance',
      'Creative or messaging adjustments',
      'Testing roadmap and measurement plan',
    ],
    placeholders: [
      {
        key: 'media-optimisation-table',
        type: 'table',
        label: 'Table summarising optimisation recommendation per channel',
        description: 'Include columns for action, impact, owner.',
      },
    ],
  },
  {
    title: 'Scenario Planner',
    description: 'Model different media budget scenarios.',
    bulletPoints: [
      'Simulate budget shifts across channels',
      'Estimate impact on conversions and ROAS',
      'Highlight best vs. worst-case scenarios',
    ],
    placeholders: [
      {
        key: 'media-scenario',
        type: 'chart',
        label: 'Scenario comparison chart showing conversions vs. spend',
        description: 'Use side-by-side bars or line overlays.',
      },
    ],
  },
  {
    title: 'Measurement & Governance',
    description: 'Outline governance for ongoing optimisation.',
    bulletPoints: [
      'Measurement framework and test cadence',
      'Ownership across media, analytics, and e-commerce teams',
      'Tools and integrations supporting optimisation',
    ],
    placeholders: [
      {
        key: 'governance-flow',
        type: 'timeline',
        label: 'Process flow depicting governance and reporting cadence',
        description: 'Include checkpoints for insights, decisions, and activation.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Summarise immediate actions and timeline.',
    bulletPoints: [
      'Finalise budget approvals',
      'Launch optimisation pilots',
      'Align reporting cadence and dashboards',
    ],
    placeholders: [
      {
        key: 'media-roadmap',
        type: 'timeline',
        label: 'Timeline from plan approval to optimisation cycles',
        description: 'Include near-term wins and quarterly checkpoints.',
      },
    ],
  },
];

const dataIntegrationSlides: SlideSpec[] = [
  {
    title: 'Data Integration Hub',
    subtitle: 'Unified data stitching and governance overview',
    description: 'Introduce the integration hub architecture and value.',
    footnote: `Updated ${todaysDateLabel()}`,
    callout: 'Deliver trustworthy, unified datasets for analytics and activation',
    placeholders: [
      {
        key: 'integration-cover',
        type: 'image',
        label: 'Architecture visual or data ecosystem illustration',
        description: 'Use diagrams representing pipelines and destinations.',
        position: { x: 456, y: 200 },
        size: { width: 280, height: 164 },
      },
      {
        key: 'integration-kpi',
        type: 'metric',
        label: 'Key stats: sources integrated, refresh frequency, uptime',
        description: 'Display as bold KPI tiles.',
        position: { x: 456, y: 380 },
        size: { width: 280, height: 112 },
      },
    ],
  },
  {
    title: 'Source Landscape',
    description: 'Summarise inbound data sources and ownership.',
    bulletPoints: [
      'Operational systems (CRM, ERP, commerce)',
      'Marketing, analytics, and third-party feeds',
      'Data latency and refresh expectations',
    ],
    placeholders: [
      {
        key: 'source-architecture',
        type: 'diagram',
        label: 'Architecture diagram of source systems feeding the hub',
        description: 'Group sources by domain with icons.',
      },
    ],
  },
  {
    title: 'Integration Architecture',
    description: 'Detail the integration layers and flow.',
    bulletPoints: [
      'Ingestion, transformation, and storage layers',
      'Streaming vs. batch pipelines',
      'Data catalog and governance components',
    ],
    placeholders: [
      {
        key: 'integration-architecture',
        type: 'diagram',
        label: 'Architecture diagram showing ETL/ELT pipelines',
        description: 'Include icons for lakehouse, warehouse, and serving layers.',
      },
    ],
  },
  {
    title: 'Data Validation KPIs',
    description: 'Track data quality across the hub.',
    bulletPoints: [
      'Freshness, completeness, accuracy metrics',
      'Automated quality checks and alerting',
      'Remediation workflows and ownership',
    ],
    placeholders: [
      {
        key: 'validation-dashboard',
        type: 'dashboard',
        label: 'Dashboard placeholder for data quality KPIs',
        description: 'Include gauges or scorecards for each metric.',
      },
    ],
  },
  {
    title: 'Latency Metrics',
    description: 'Show latency SLAs and current performance.',
    bulletPoints: [
      'Latency targets by pipeline or domain',
      'Current performance vs. target',
      'Bottlenecks and optimisation actions',
    ],
    placeholders: [
      {
        key: 'latency-line',
        type: 'chart',
        label: 'Line or column chart of latency across pipelines',
        description: 'Highlight any breaches of SLA.',
      },
    ],
  },
  {
    title: 'Data Stitching Process',
    description: 'Explain identity resolution and stitching steps.',
    bulletPoints: [
      'Matching keys, probabilistic methods, golden record strategy',
      'Privacy, consent, and governance considerations',
      'Downstream activation points',
    ],
    placeholders: [
      {
        key: 'stitching-flow',
        type: 'flow',
        label: 'Process diagram showing stitching workflow',
        description: 'Include stages for matching, merging, and publishing.',
      },
    ],
  },
  {
    title: 'Unified Dataset Schema',
    description: 'Provide an overview of the unified dataset structure.',
    bulletPoints: [
      'Core entities and relationships',
      'Key attributes and derived metrics',
      'Schema versioning and documentation',
    ],
    placeholders: [
      {
        key: 'schema-table',
        type: 'table',
        label: 'Schema table with entities, fields, and data types',
        description: 'Highlight primary keys and relationships.',
      },
    ],
  },
  {
    title: 'Governance Dashboard',
    description: 'Show governance, lineage, and compliance monitoring.',
    bulletPoints: [
      'Data lineage visualisation',
      'Compliance status and audit logs',
      'Ownership and stewardship assignments',
    ],
    placeholders: [
      {
        key: 'governance-dashboard',
        type: 'dashboard',
        label: 'Dashboard placeholder with lineage map and compliance KPIs',
        description: 'Include panel for stewardship contacts.',
      },
    ],
  },
  {
    title: 'Activation & Delivery',
    description: 'Explain how data is delivered to downstream systems.',
    bulletPoints: [
      'APIs, reverse ETL, and exports',
      'Real-time and batch delivery patterns',
      'Usage tracking and feedback loops',
    ],
    placeholders: [
      {
        key: 'activation-flow',
        type: 'diagram',
        label: 'Flow diagram showing delivery channels and destinations',
        description: 'Map BI, ML, CRM, and marketing endpoints.',
      },
    ],
  },
  {
    title: 'Roadmap & Milestones',
    description: 'Show roadmap for enhancing the integration hub.',
    bulletPoints: [
      'Upcoming source onboardings',
      'Automation or tooling upgrades',
      'Governance and compliance milestones',
    ],
    placeholders: [
      {
        key: 'integration-roadmap',
        type: 'timeline',
        label: 'Timeline covering near-term and long-term milestones',
        description: 'Include phases for discovery, build, and rollout.',
      },
    ],
  },
  {
    title: 'Next Steps',
    description: 'Outline actions to scale and sustain the integration hub.',
    bulletPoints: [
      'Prioritise source onboarding and data contracts',
      'Strengthen governance council and stewardship',
      'Expand monitoring and alerting capabilities',
    ],
    placeholders: [
      {
        key: 'integration-next-steps',
        type: 'text',
        label: 'Action list with owner, timing, and success metric',
        description: 'Format as elegant checklist for executive review.',
      },
    ],
  },
];

export const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  createTemplate(
    {
      id: 'churn-prediction',
      name: 'Churn Prediction',
      description:
        'Storyboard to identify at-risk customers, highlight churn drivers, and recommend retention actions.',
      category: 'Customer Intelligence',
      tags: ['retention', 'customer-success', 'predictive'],
      icon: Activity,
    },
    '#6366f1',
    churnSlides,
  ),
  createTemplate(
    {
      id: 'customer-segmentation',
      name: 'Customer Segmentation',
      description:
        'Cluster customers by behaviour and value to tailor marketing, service, and product experiences.',
      category: 'Customer Intelligence',
      tags: ['segmentation', 'personas', 'clusters'],
      icon: Users,
    },
    '#2563eb',
    customerSegmentationSlides,
  ),
  createTemplate(
    {
      id: 'marketing-mix-modeling',
      name: 'Marketing Mix Modeling',
      description: 'Measure ROI of marketing channels and optimise spend allocation across the media mix.',
      category: 'Marketing Analytics',
      tags: ['roi', 'budget', 'attribution'],
      icon: TrendingUp,
    },
    '#22c55e',
    marketingMixSlides,
  ),
  createTemplate(
    {
      id: 'demand-forecasting',
      name: 'Demand Forecasting',
      description: 'Predict product demand with time-series models to align supply and merchandising.',
      category: 'Planning & Forecasting',
      tags: ['time-series', 'inventory', 'planning'],
      icon: LineChart,
    },
    '#0ea5e9',
    demandForecastingSlides,
  ),
  createTemplate(
    {
      id: 'price-optimization',
      name: 'Price Optimization',
      description: 'Identify optimal prices that maximise revenue and profitability across the portfolio.',
      category: 'Revenue Management',
      tags: ['pricing', 'elasticity', 'profitability'],
      icon: BadgeDollarSign,
    },
    '#ec4899',
    priceOptimizationSlides,
  ),
  createTemplate(
    {
      id: 'promo-effectiveness',
      name: 'Promo Effectiveness',
      description: 'Evaluate campaign ROI, promotional uplift, and optimisation strategies.',
      category: 'Marketing Analytics',
      tags: ['promotion', 'uplift', 'campaigns'],
      icon: Target,
    },
    '#f97316',
    promoEffectivenessSlides,
  ),
  createTemplate(
    {
      id: 'exploratory-data-analysis',
      name: 'Exploratory Data Analysis',
      description: 'Identify patterns, anomalies, and readiness signals across complex datasets.',
      category: 'Analytics Foundations',
      tags: ['eda', 'insights', 'data-quality'],
      icon: Sparkles,
    },
    '#3b82f6',
    exploratoryDataAnalysisSlides,
  ),
  createTemplate(
    {
      id: 'forecasting-analysis',
      name: 'Forecasting Analysis',
      description: 'Analyse trends, seasonality, autocorrelation, and event impacts across time series.',
      category: 'Planning & Forecasting',
      tags: ['scenario', 'trend', 'time-series'],
      icon: BarChart3,
    },
    '#06b6d4',
    forecastingAnalysisSlides,
  ),
  createTemplate(
    {
      id: 'price-ladder-analytics',
      name: 'Price Ladder Analytics',
      description: 'Understand elasticity across ladder tiers and optimise assortment positioning.',
      category: 'Revenue Management',
      tags: ['pricing', 'ladder', 'merchandising'],
      icon: Network,
    },
    '#a855f7',
    priceLadderSlides,
  ),
  createTemplate(
    {
      id: 'ecom-promo-planning',
      name: 'E-Com Promo Planning',
      description: 'Plan optimal promotion schedules and experiences for digital campaigns.',
      category: 'E-Commerce Strategy',
      tags: ['promotion', 'planning', 'ecommerce'],
      icon: Megaphone,
    },
    '#ef4444',
    ecomPromoPlanningSlides,
  ),
  createTemplate(
    {
      id: 'ecom-media-planning',
      name: 'E-Com Media Planning',
      description: 'Optimise digital media budgets, reach, and attribution for e-commerce growth.',
      category: 'E-Commerce Strategy',
      tags: ['media', 'digital', 'optimization'],
      icon: Megaphone,
    },
    '#10b981',
    ecomMediaPlanningSlides,
  ),
  createTemplate(
    {
      id: 'data-integration-hub',
      name: 'Data Integration Hub',
      description: 'Describe ETL, data stitching, and unified dataset creation with governance.',
      category: 'Data Platform',
      tags: ['data-engineering', 'governance', 'etl'],
      icon: Database,
    },
    '#64748b',
    dataIntegrationSlides,
  ),
];
