import { TrendingUp, Target, LineChart, Sparkles } from 'lucide-react';
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
    id: 'marketing-mix',
    name: 'Marketing Mix Modeling',
    description:
      'Comprehensive MMM storyboard covering ROI insights, budget allocation and optimisation guidance.',
    category: 'Marketing Analytics',
    tags: ['marketing', 'roi', 'budget', 'channels'],
    icon: TrendingUp,
    slides: [
      {
        title: 'Marketing Mix Modeling Analysis',
        content: {
          textBoxes: [
            {
              text: 'Marketing Mix Modeling Analysis',
              position: { x: 96, y: 112 },
              size: { width: 640, height: 72 },
              fontSize: 42,
              bold: true,
            },
            {
              text: 'Comprehensive ROI & Channel Performance Review',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 48 },
              fontSize: 24,
            },
            {
              text: todaysDateLabel(),
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#4f46e5',
            },
          ],
          shapes: [
            {
              shapeId: 'rounded-rectangle',
              position: { x: 64, y: 96 },
              size: { width: 720, height: 360 },
              fill: 'rgba(79, 70, 229, 0.12)',
              stroke: 'rgba(79, 70, 229, 0.3)',
              strokeWidth: 2,
            },
          ],
        },
      },
      {
        title: 'Executive Summary',
        content: {
          textBoxes: [
            {
              text: 'Executive Summary',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 36,
              bold: true,
            },
            {
              text: '• Overall marketing ROI: [X]%\n• Top performing channel: [Channel]\n• Key insights and recommendations\n• Budget optimisation opportunities',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Methodology Overview',
        content: {
          textBoxes: [
            {
              text: 'Methodology Overview',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Data collection and preparation\n• Model selection and validation\n• Attribution methodology\n• Time period analysed',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
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
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Marketing channels analysed:\n• Digital channels\n• Traditional media\n• Sales data\n• External factors',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Channel Performance',
        content: {
          textBoxes: [
            {
              text: 'Channel Performance Analysis',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'ROI by Channel:\n• Paid Search: [ROI]\n• Social Media: [ROI]\n• Display: [ROI]\n• TV: [ROI]\n• Email: [ROI]',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 252 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Budget Allocation',
        content: {
          textBoxes: [
            {
              text: 'Current vs Optimal Budget Allocation',
              position: { x: 72, y: 80 },
              size: { width: 620, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Optimisation opportunities identified across all marketing channels',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 160 },
              fontSize: 20,
            },
          ],
          shapes: [
            {
              shapeId: 'rectangle',
              position: { x: 72, y: 320 },
              size: { width: 360, height: 180 },
              fill: 'rgba(59, 130, 246, 0.12)',
            },
            {
              shapeId: 'rectangle',
              position: { x: 456, y: 320 },
              size: { width: 360, height: 180 },
              fill: 'rgba(16, 185, 129, 0.12)',
            },
          ],
        },
      },
      {
        title: 'ROI Trends',
        content: {
          textBoxes: [
            {
              text: 'ROI Trends Over Time',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Quarter-over-quarter performance and seasonal patterns',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 160 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Attribution Insights',
        content: {
          textBoxes: [
            {
              text: 'Multi-touch Attribution Insights',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• First-touch attribution\n• Last-touch attribution\n• Linear attribution\n• Time-decay model results',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Key Findings',
        content: {
          textBoxes: [
            {
              text: 'Key Findings',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '1. [Finding 1]\n2. [Finding 2]\n3. [Finding 3]\n4. [Finding 4]\n5. [Finding 5]',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 260 },
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
              text: 'Strategic Recommendations',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Reallocate budget to high-ROI channels\n• Optimise underperforming channels\n• Test new channel opportunities\n• Adjust seasonal strategies',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
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
              text: 'Phase 1: Immediate actions (0-30 days)\nPhase 2: Medium-term optimisations (1-3 months)\nPhase 3: Long-term strategy (3-6 months)',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
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
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Review and approve recommendations\n• Begin budget reallocation\n• Set up tracking and monitoring\n• Schedule follow-up analysis',
              position: { x: 72, y: 156 },
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
      'Detailed promotional campaign analysis with uplift metrics, customer response and optimisation roadmap.',
    category: 'Revenue Growth',
    tags: ['promotion', 'retail', 'uplift', 'campaign'],
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
              fontSize: 40,
              bold: true,
            },
            {
              text: 'Campaign Performance & ROI Review',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 48 },
              fontSize: 24,
            },
            {
              text: todaysDateLabel(),
              position: { x: 96, y: 320 },
              size: { width: 320, height: 32 },
              fontSize: 18,
              color: '#db2777',
            },
          ],
          shapes: [
            {
              shapeId: 'rounded-rectangle',
              position: { x: 64, y: 96 },
              size: { width: 720, height: 360 },
              fill: 'rgba(219, 39, 119, 0.12)',
              stroke: 'rgba(219, 39, 119, 0.3)',
              strokeWidth: 2,
            },
          ],
        },
      },
      {
        title: 'Executive Summary',
        content: {
          textBoxes: [
            {
              text: 'Executive Summary',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 34,
              bold: true,
            },
            {
              text: '• Overall promo ROI: [X]%\n• Total uplift generated: [Y]%\n• Best performing promotion type\n• Key learnings and next steps',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Promotion Overview',
        content: {
          textBoxes: [
            {
              text: 'Promotion Overview',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Campaign period: [Dates]\n• Promotion types analysed\n• Products/categories included\n• Investment overview',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Sales Uplift Analysis',
        content: {
          textBoxes: [
            {
              text: 'Sales Uplift Analysis',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Incremental sales generated by promotion compared to baseline performance',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 160 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'ROI by Promotion Type',
        content: {
          textBoxes: [
            {
              text: 'ROI by Promotion Type',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Percentage Discount: [ROI]\n• BOGO: [ROI]\n• Bundle Offers: [ROI]\n• Dollar-Off: [ROI]\n• Free Shipping: [ROI]',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 252 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Customer Response',
        content: {
          textBoxes: [
            {
              text: 'Customer Response Metrics',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Redemption rates\n• Customer acquisition\n• Repeat purchase behaviour\n• Customer lifetime value impact',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Channel Performance',
        content: {
          textBoxes: [
            {
              text: 'Performance by Channel',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Promotion effectiveness across online and offline channels',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 160 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Profitability Impact',
        content: {
          textBoxes: [
            {
              text: 'Profitability Impact',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Gross margin impact\n• Net profit contribution\n• Break-even analysis\n• Long-term profitability outlook',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Key Learnings',
        content: {
          textBoxes: [
            {
              text: 'Key Learnings',
              position: { x: 72, y: 80 },
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '1. [Learning 1]\n2. [Learning 2]\n3. [Learning 3]\n4. [Learning 4]',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Optimisation Recommendations',
        content: {
          textBoxes: [
            {
              text: 'Optimisation Recommendations',
              position: { x: 72, y: 80 },
              size: { width: 560, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Adjust promotion depth for better ROI\n• Optimise timing and duration\n• Refine target audience\n• Test new promotion mechanics',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Next Steps & Action Plan',
        content: {
          textBoxes: [
            {
              text: 'Next Steps & Action Plan',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Implement optimisation strategies\n• A/B test new promotion formats\n• Monitor performance metrics\n• Schedule quarterly review',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 232 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'forecasting',
    name: 'Forecasting Analysis',
    description:
      'Time-series forecasting storyline highlighting demand trends, variance drivers and scenario planning.',
    category: 'Predictive Analytics',
    tags: ['forecasting', 'demand', 'planning', 'scenario'],
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
              fontSize: 40,
              bold: true,
            },
            {
              text: 'Forward-looking projections with variance explanations and scenario simulations',
              position: { x: 96, y: 204 },
              size: { width: 640, height: 60 },
              fontSize: 22,
            },
          ],
          shapes: [
            {
              shapeId: 'rounded-rectangle',
              position: { x: 64, y: 96 },
              size: { width: 720, height: 360 },
              fill: 'rgba(56, 189, 248, 0.12)',
              stroke: 'rgba(14, 165, 233, 0.3)',
              strokeWidth: 2,
            },
          ],
        },
      },
      {
        title: 'Executive Snapshot',
        content: {
          textBoxes: [
            {
              text: 'Executive Snapshot',
              position: { x: 72, y: 80 },
              size: { width: 440, height: 56 },
              fontSize: 34,
              bold: true,
            },
            {
              text: '• Forecast horizon: [Period]\n• Baseline growth: [X]%\n• Key variance drivers\n• Scenario confidence levels',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Historical Performance',
        content: {
          textBoxes: [
            {
              text: 'Historical Performance',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Year-on-year trends with rolling averages and outlier detection notes',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 160 },
              fontSize: 20,
            },
          ],
          shapes: [
            {
              shapeId: 'rectangle',
              position: { x: 72, y: 320 },
              size: { width: 704, height: 160 },
              fill: 'rgba(14, 165, 233, 0.08)',
            },
          ],
        },
      },
      {
        title: 'Forecast Drivers',
        content: {
          textBoxes: [
            {
              text: 'Forecast Drivers',
              position: { x: 72, y: 80 },
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Pricing strategy\n• Promotional cadence\n• Seasonality\n• External market indicators',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Baseline Forecast',
        content: {
          textBoxes: [
            {
              text: 'Baseline Forecast',
              position: { x: 72, y: 80 },
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Projected volumes with confidence intervals and methodology notes',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 160 },
              fontSize: 20,
            },
          ],
          shapes: [
            {
              shapeId: 'ellipse',
              position: { x: 120, y: 320 },
              size: { width: 200, height: 200 },
              fill: 'rgba(8, 145, 178, 0.12)',
            },
            {
              shapeId: 'ellipse',
              position: { x: 360, y: 320 },
              size: { width: 200, height: 200 },
              fill: 'rgba(59, 130, 246, 0.12)',
            },
            {
              shapeId: 'ellipse',
              position: { x: 600, y: 320 },
              size: { width: 200, height: 200 },
              fill: 'rgba(16, 185, 129, 0.12)',
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
              size: { width: 480, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Upside scenario assumptions\n• Base case expectations\n• Downside risk factors\n• Mitigation triggers',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Variance Commentary',
        content: {
          textBoxes: [
            {
              text: 'Variance Commentary',
              position: { x: 72, y: 80 },
              size: { width: 520, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Root cause analysis for the latest variance and corrective recommendations',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 180 },
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
              text: '• Supply chain readiness\n• Workforce planning\n• Inventory strategies\n• Service-level commitments',
              position: { x: 72, y: 156 },
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
              size: { width: 460, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: 'Strategic actions for demand shaping, pricing and cross-functional alignment',
              position: { x: 72, y: 156 },
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
              size: { width: 420, height: 56 },
              fontSize: 32,
              bold: true,
            },
            {
              text: '• Validate assumptions with stakeholders\n• Refresh forecast cadence\n• Activate monitoring alerts\n• Schedule alignment workshop',
              position: { x: 72, y: 156 },
              size: { width: 720, height: 220 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Presentation',
    description: 'Minimal starting point with cover, agenda and closing slide placeholders.',
    category: 'Custom',
    tags: ['blank', 'custom', 'lightweight'],
    icon: Sparkles,
    slides: [
      {
        title: 'Presentation Title',
        content: {
          textBoxes: [
            {
              text: 'Your Presentation Title',
              position: { x: 96, y: 160 },
              size: { width: 640, height: 96 },
              fontSize: 44,
              bold: true,
              align: 'center',
            },
            {
              text: 'Subtitle or presenter details',
              position: { x: 96, y: 272 },
              size: { width: 640, height: 48 },
              fontSize: 22,
              align: 'center',
            },
          ],
        },
      },
      {
        title: 'Agenda',
        content: {
          textBoxes: [
            {
              text: 'Agenda',
              position: { x: 72, y: 96 },
              size: { width: 420, height: 64 },
              fontSize: 36,
              bold: true,
            },
            {
              text: '1. Introduction\n2. Insight 1\n3. Insight 2\n4. Recommendations\n5. Next Steps',
              position: { x: 72, y: 184 },
              size: { width: 720, height: 260 },
              fontSize: 20,
            },
          ],
        },
      },
      {
        title: 'Closing Summary',
        content: {
          textBoxes: [
            {
              text: 'Closing Summary',
              position: { x: 72, y: 96 },
              size: { width: 520, height: 64 },
              fontSize: 34,
              bold: true,
            },
            {
              text: 'Summarise the key decisions, highlight owners and confirm next milestones.',
              position: { x: 72, y: 184 },
              size: { width: 720, height: 200 },
              fontSize: 20,
            },
          ],
        },
      },
    ],
  },
];

export const countSlides = (template: TemplateDefinition): number => template.slides.length;

export const matchTemplateQuery = (template: TemplateDefinition, query: string): boolean => {
  if (!query) {
    return true;
  }

  const normalised = query.trim().toLowerCase();
  if (normalised.length === 0) {
    return true;
  }

  if (template.name.toLowerCase().includes(normalised)) {
    return true;
  }

  if (template.description.toLowerCase().includes(normalised)) {
    return true;
  }

  if (template.category.toLowerCase().includes(normalised)) {
    return true;
  }

  return template.tags.some(tag => tag.toLowerCase().includes(normalised));
};
