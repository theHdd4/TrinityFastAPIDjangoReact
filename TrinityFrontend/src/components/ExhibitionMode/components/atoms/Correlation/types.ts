export interface CorrelationMetadata {
  // Correlation matrix data
  correlationMatrix?: number[][];
  variables?: string[];
  
  // Filter information
  filterDimensions?: Record<string, string[]>;
  selectedFile?: string;
  filteredFilePath?: string;
  
  // Matrix display settings
  matrixSettings?: {
    theme?: string;
    showAxisLabels?: boolean;
    showDataLabels?: boolean;
    showLegend?: boolean;
    showGrid?: boolean;
  };
  
  // Additional metadata
  selectedVar1?: string;
  selectedVar2?: string;
  showAllColumns?: boolean;
  selectedNumericColumnsForMatrix?: string[];
  
  // File data (if needed)
  fileData?: {
    fileName?: string;
    numericColumns?: string[];
    dateColumns?: string[];
    categoricalColumns?: string[];
  };
}

export interface CorrelationProps {
  metadata: any; // Will be parsed to CorrelationMetadata
  variant?: 'full' | 'compact';
}

export interface CorrelationExhibitionProps {
  data: CorrelationMetadata;
  variant?: 'full' | 'compact';
}





