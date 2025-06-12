
import {
  Database,
  FileText,
  BarChart3,
  Brain,
  Zap, 
  Share2,
  TrendingUp,
  Filter,
  Shuffle,
  Target,
  Upload,
  Eye,
  Type,
  Search,
  Calculator,
  Merge,
  Copy,
  Settings,
  GitBranch,
  Crosshair,
  Building,
  DollarSign
} from 'lucide-react';

// Atom definitions are stored in individual folders under AtomList/atoms
import dataUploadValidate from '@/components/AtomList/atoms/data-upload-validate';
import csvImport from '@/components/AtomList/atoms/csv-import';
import jsonImport from '@/components/AtomList/atoms/json-import';
import databaseConnect from '@/components/AtomList/atoms/database-connect';
import featureOverview from '@/components/AtomList/atoms/feature-overview';
import groupbyWtgAvg from '@/components/AtomList/atoms/groupby-wtg-avg';
import merge from '@/components/AtomList/atoms/merge';
import concat from '@/components/AtomList/atoms/concat';
import featureCreateTransform from '@/components/AtomList/atoms/feature-create-transform';
import scopeSelector from '@/components/AtomList/atoms/scope-selector';
import rowOperations from '@/components/AtomList/atoms/row-operations';
import correlation from '@/components/AtomList/atoms/correlation';
import explore from '@/components/AtomList/atoms/explore';
import descriptiveStats from '@/components/AtomList/atoms/descriptive-stats';
import trendAnalysis from '@/components/AtomList/atoms/trend-analysis';
import regressionFeatureBased from '@/components/AtomList/atoms/regression-feature-based';
import selectModelsFeature from '@/components/AtomList/atoms/select-models-feature';
import evaluateModelsFeature from '@/components/AtomList/atoms/evaluate-models-feature';
import autoRegressiveModels from '@/components/AtomList/atoms/auto-regressive-models';
import selectModelsAutoRegressive from '@/components/AtomList/atoms/select-models-auto-regressive';
import evaluateModelsAutoRegressive from '@/components/AtomList/atoms/evaluate-models-auto-regressive';
import buildModelFeatureBased from '@/components/AtomList/atoms/build-model-feature-based';
import chartMaker from '@/components/AtomList/atoms/chart-maker';
import textBox from '@/components/AtomList/atoms/text-box';
import scatterPlot from '@/components/AtomList/atoms/scatter-plot';
import histogram from '@/components/AtomList/atoms/histogram';
import scenarioPlanner from '@/components/AtomList/atoms/scenario-planner';
import optimizer from '@/components/AtomList/atoms/optimizer';
import atomMaker from '@/components/AtomList/atoms/atom-maker';
import readPresentationSummarize from '@/components/AtomList/atoms/read-presentation-summarize';
import basePriceEstimator from '@/components/AtomList/atoms/base-price-estimator';
import promoEstimator from '@/components/AtomList/atoms/promo-estimator';

export interface Atom {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
  color: string;
}

export interface AtomCategory {
  name: string;
  icon: any;
  color: string;
  atoms: Atom[];
}

export const atomCategories: AtomCategory[] = [
  {
    name: 'Data Sources',
    icon: Database,
    color: 'bg-blue-500',
    atoms: [
      dataUploadValidate,
      csvImport,
      jsonImport,
      databaseConnect
    ]
  },
  {
    name: 'Data Processing',
    icon: Filter,
    color: 'bg-green-500',
    atoms: [
      featureOverview,
      groupbyWtgAvg,
      merge,
      concat,
      featureCreateTransform,
      scopeSelector,
      rowOperations
    ]
  },
  {
    name: 'Analytics',
    icon: BarChart3,
    color: 'bg-purple-500',
    atoms: [
      correlation,
      explore,
      descriptiveStats,
      trendAnalysis
    ]
  },
  {
    name: 'Machine Learning',
    icon: Brain,
    color: 'bg-orange-500',
    atoms: [
      regressionFeatureBased,
      selectModelsFeature,
      evaluateModelsFeature,
      autoRegressiveModels,
      selectModelsAutoRegressive,
      evaluateModelsAutoRegressive,
      buildModelFeatureBased
    ]
  },
  {
    name: 'Visualization',
    icon: TrendingUp,
    color: 'bg-pink-500',
    atoms: [
      chartMaker,
      textBox,
      scatterPlot,
      histogram
    ]
  },
  {
    name: 'Planning & Optimization',
    icon: Target,
    color: 'bg-indigo-500',
    atoms: [
      scenarioPlanner,
      optimizer
    ]
  },
  {
    name: 'Utilities',
    icon: Settings,
    color: 'bg-gray-500',
    atoms: [
      atomMaker,
      readPresentationSummarize
    ]
  },
  {
    name: 'Business Intelligence',
    icon: DollarSign,
    color: 'bg-emerald-500',
    atoms: [
      basePriceEstimator,
      promoEstimator
    ]
  }
];
