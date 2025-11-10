import { ChartMakerExhibitionSelectionChartState } from '@/components/LaboratoryMode/store/laboratoryStore';

export interface ChartMakerMetadata {
  chartId?: string;
  chartTitle?: string;
  chartState?: ChartMakerExhibitionSelectionChartState;
  chartContext?: {
    dataSource?: string;
    uploadedData?: any;
    chartConfig?: {
      data?: any[];
      theme?: string;
      showLegend?: boolean;
      showXAxisLabels?: boolean;
      showYAxisLabels?: boolean;
      showDataLabels?: boolean;
      showGrid?: boolean;
      sortOrder?: 'asc' | 'desc' | null;
      sortColumn?: string;
      enableScroll?: boolean;
      chartsPerRow?: number;
      colors?: string[];
      seriesSettings?: Record<string, { color?: string; showDataLabels?: boolean }>;
      [key: string]: any; // Allow other properties
    };
  };
  capturedAt?: string;
  sourceAtomTitle?: string;
}

export interface ChartMakerComponentProps {
  metadata: ChartMakerMetadata;
  variant: 'full' | 'compact';
}

export interface ChartMakerProps {
  metadata?: Record<string, unknown> | null;
  variant?: 'full' | 'compact';
}

