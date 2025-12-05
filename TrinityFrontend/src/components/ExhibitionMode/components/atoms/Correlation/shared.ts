import { CorrelationMetadata } from './types';

export const DEFAULT_CORRELATION_METADATA: CorrelationMetadata = {
  correlationMatrix: [],
  variables: [],
  filterDimensions: {},
  matrixSettings: {
    theme: 'default',
    showAxisLabels: true,
    showDataLabels: true,
    showLegend: true,
    showGrid: true,
  },
  showAllColumns: false,
};

/**
 * Parse correlation metadata from atom metadata
 */
export function parseCorrelationMetadata(metadata: any): CorrelationMetadata | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  // Extract correlation data from metadata
  const parsed: CorrelationMetadata = {
    correlationMatrix: metadata.correlationMatrix || metadata.correlation_matrix,
    variables: metadata.variables || [],
    filterDimensions: metadata.filterDimensions || metadata.settings?.filterDimensions || {},
    selectedFile: metadata.selectedFile || metadata.selected_file,
    filteredFilePath: metadata.filteredFilePath || metadata.filtered_file_path,
    matrixSettings: metadata.matrixSettings || metadata.matrix_settings || DEFAULT_CORRELATION_METADATA.matrixSettings,
    selectedVar1: metadata.selectedVar1 || metadata.selected_var1,
    selectedVar2: metadata.selectedVar2 || metadata.selected_var2,
    showAllColumns: metadata.showAllColumns || metadata.show_all_columns || false,
    selectedNumericColumnsForMatrix: metadata.selectedNumericColumnsForMatrix || metadata.selected_numeric_columns_for_matrix,
    fileData: metadata.fileData || metadata.file_data,
  };

  return parsed;
}

/**
 * Get color for correlation value
 */
export function getCorrelationColor(value: number, theme: string = 'default'): string {
  // Normalize to 0-1 range (assuming value is between -1 and 1)
  const normalized = (value + 1) / 2;
  
  // Default blue-red diverging color scheme
  if (value < -0.5) return '#0571b0'; // Strong negative - dark blue
  if (value < -0.2) return '#92c5de'; // Moderate negative - light blue
  if (value < 0.2) return '#f7f7f7';  // Weak - light gray
  if (value < 0.5) return '#f4a582';  // Moderate positive - light red
  return '#ca0020';                    // Strong positive - dark red
}

/**
 * Format correlation value for display
 */
export function formatCorrelationValue(value: number): string {
  return value.toFixed(2);
}

/**
 * Get correlation strength label
 */
export function getCorrelationStrength(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 0.8) return 'Very Strong';
  if (abs >= 0.6) return 'Strong';
  if (abs >= 0.4) return 'Moderate';
  if (abs >= 0.2) return 'Weak';
  return 'Very Weak';
}



