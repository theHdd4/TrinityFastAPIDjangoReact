/**
 * Table Utility Functions
 * Aggregations, calculations, and helper functions
 */

export type AggregationType = 'sum' | 'average' | 'count' | 'min' | 'max' | 'none';

/**
 * Calculate aggregation for a column
 */
export const calculateAggregation = (
  data: Array<Record<string, any>>,
  column: string,
  type: AggregationType
): number | string => {
  if (type === 'none') {
    return '';
  }

  // Extract values from column, filtering out null/empty
  const values = data
    .map(row => row[column])
    .filter(v => v !== null && v !== undefined && v !== '');

  if (values.length === 0) {
    return '';
  }

  switch (type) {
    case 'sum':
      return values.reduce((a, b) => Number(a) + Number(b), 0);
    
    case 'average':
      const sum = values.reduce((a, b) => Number(a) + Number(b), 0);
      return sum / values.length;
    
    case 'count':
      return values.length;
    
    case 'min':
      return Math.min(...values.map(Number));
    
    case 'max':
      return Math.max(...values.map(Number));
    
    default:
      return '';
  }
};

/**
 * Format aggregation result for display
 */
export const formatAggregation = (value: number | string, type: AggregationType): string => {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  if (type === 'average') {
    return typeof value === 'number' ? value.toFixed(2) : String(value);
  }

  if (type === 'sum' || type === 'min' || type === 'max') {
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  }

  return String(value);
};

/**
 * Check if column contains numeric data
 */
export const isNumericColumn = (
  data: Array<Record<string, any>>,
  column: string
): boolean => {
  const sampleSize = Math.min(10, data.length);
  const sample = data.slice(0, sampleSize);
  
  return sample.every(row => {
    const value = row[column];
    return value === null || value === undefined || value === '' || !isNaN(Number(value));
  });
};

/**
 * Get border classes based on border style
 */
export const getBorderClasses = (
  borderStyle: 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header',
  isHeader: boolean = false,
  isFirstRow: boolean = false,
  isFirstCell: boolean = false,
  isLastCell: boolean = false
): string => {
  switch (borderStyle) {
    case 'all':
      return 'border border-gray-200';
    
    case 'none':
      return '';
    
    case 'outside':
      const outsideClasses: string[] = [];
      if (isFirstRow) outsideClasses.push('border-t');
      if (isFirstCell) outsideClasses.push('border-l');
      if (isLastCell) outsideClasses.push('border-r');
      return outsideClasses.join(' ') || 'border-0';
    
    case 'horizontal':
      return isHeader ? 'border-b-2 border-gray-300' : 'border-t border-gray-200';
    
    case 'vertical':
      return 'border-l border-r border-gray-200';
    
    case 'header':
      return isHeader ? 'border-b-2 border-gray-300' : '';
    
    default:
      return 'border border-gray-200';
  }
};

/**
 * Generate a unique column key following col_1, col_2, col_3 pattern
 * Checks existing columns and returns next available name
 */
export const getNextColKey = (headers: string[]): string => {
  let idx = 1;
  let key = `col_${idx}`;
  while (headers.includes(key)) {
    idx++;
    key = `col_${idx}`;
  }
  return key;
};

