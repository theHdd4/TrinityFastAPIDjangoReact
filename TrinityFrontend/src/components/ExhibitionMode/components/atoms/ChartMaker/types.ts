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

