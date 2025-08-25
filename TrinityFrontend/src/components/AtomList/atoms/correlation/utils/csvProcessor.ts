// CSV Processing and Correlation Calculation Utilities

export interface ProcessedCSVData {
  fileName: string;
  rawData: any[];
  numericColumns: string[];
  dateColumns: string[];
  categoricalColumns: string[];
  isProcessed: boolean;
}

export interface CorrelationResult {
  variables: string[];
  correlationMatrix: number[][];
  timeSeriesData: Array<{
    date: Date;
    var1Value: number;
    var2Value: number;
  }>;
}

/**
 * Parse CSV file content to JSON
 */
export function parseCSV(csvContent: string): any[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header and one data row');
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    const row: any = {};
    
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    
    data.push(row);
  }

  return data;
}

/**
 * Detect column types in the data
 */
export function analyzeColumns(data: any[]): {
  numericColumns: string[];
  dateColumns: string[];
  categoricalColumns: string[];
} {
  if (data.length === 0) {
    return { numericColumns: [], dateColumns: [], categoricalColumns: [] };
  }

  const columns = Object.keys(data[0]);
  const numericColumns: string[] = [];
  const dateColumns: string[] = [];
  const categoricalColumns: string[] = [];

  columns.forEach(column => {
    const sampleValues = data.slice(0, Math.min(10, data.length))
      .map(row => row[column])
      .filter(val => val !== '' && val !== null && val !== undefined);

    if (sampleValues.length === 0) {
      categoricalColumns.push(column);
      return;
    }

    // Check if it's numeric
    const numericValues = sampleValues.filter(val => !isNaN(parseFloat(val)));
    if (numericValues.length / sampleValues.length > 0.8) {
      numericColumns.push(column);
      return;
    }

    // Check if it's a date
    const dateValues = sampleValues.filter(val => {
      const date = new Date(val);
      return !isNaN(date.getTime()) && val.toString().length > 4;
    });
    if (dateValues.length / sampleValues.length > 0.5) {
      dateColumns.push(column);
      return;
    }

    // Default to categorical
    categoricalColumns.push(column);
  });

  return { numericColumns, dateColumns, categoricalColumns };
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }

  const n = x.length;
  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = y.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
  const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
  const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate Spearman correlation coefficient
 */
export function calculateSpearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) {
    return 0;
  }

  // Create rank arrays
  const xRanks = getRanks(x);
  const yRanks = getRanks(y);

  return calculatePearsonCorrelation(xRanks, yRanks);
}

/**
 * Get ranks for Spearman correlation
 */
function getRanks(arr: number[]): number[] {
  const indexed = arr.map((val, i) => ({ val, index: i }));
  indexed.sort((a, b) => a.val - b.val);
  
  const ranks = new Array(arr.length);
  indexed.forEach((item, rank) => {
    ranks[item.index] = rank + 1;
  });
  
  return ranks;
}

/**
 * Calculate correlation matrix for numeric columns
 */
export function calculateCorrelationMatrix(
  data: any[], 
  numericColumns: string[], 
  method: 'pearson' | 'spearman' = 'pearson'
): number[][] {
  if (numericColumns.length === 0 || data.length === 0) {
    return [];
  }

  const matrix: number[][] = [];
  
  for (let i = 0; i < numericColumns.length; i++) {
    matrix[i] = [];
    for (let j = 0; j < numericColumns.length; j++) {
      if (i === j) {
        matrix[i][j] = 1.0;
      } else {
        // Get valid data pairs (where both columns have numeric values)
        const validPairs: { x: number; y: number }[] = [];
        
        data.forEach(row => {
          const val1 = parseFloat(row[numericColumns[i]]);
          const val2 = parseFloat(row[numericColumns[j]]);
          
          if (!isNaN(val1) && !isNaN(val2) && isFinite(val1) && isFinite(val2)) {
            validPairs.push({ x: val1, y: val2 });
          }
        });

        if (validPairs.length < 2) {
          matrix[i][j] = 0;
        } else {
          const x = validPairs.map(p => p.x);
          const y = validPairs.map(p => p.y);
          
          let correlation = method === 'spearman' 
            ? calculateSpearmanCorrelation(x, y)
            : calculatePearsonCorrelation(x, y);
          
          // Ensure correlation is a valid number
          if (isNaN(correlation) || !isFinite(correlation)) {
            correlation = 0;
          }
          
          matrix[i][j] = correlation;
        }
      }
    }
  }

  return matrix;
}

/**
 * Generate time series data from the uploaded file
 */
export function generateTimeSeriesData(
  data: any[],
  dateColumn: string | null,
  var1Column: string,
  var2Column: string
): Array<{ date: Date; var1Value: number; var2Value: number }> {
  if (data.length === 0) {
    return [];
  }

  if (!dateColumn) {
    // If no date column, create artificial dates
    return data.slice(0, 50).map((row, index) => {
      const var1Value = parseFloat(row[var1Column]);
      const var2Value = parseFloat(row[var2Column]);
      
      return {
        date: new Date(2022, Math.floor(index / 4), (index % 4) * 7), // Roughly monthly
        var1Value: isNaN(var1Value) ? 0 : var1Value,
        var2Value: isNaN(var2Value) ? 0 : var2Value
      };
    });
  }

  // Use actual date column
  const timeSeriesData = data
    .map(row => {
      const dateValue = row[dateColumn];
      const var1Value = parseFloat(row[var1Column]);
      const var2Value = parseFloat(row[var2Column]);
      
      // Try different date parsing approaches
      let date: Date;
      if (typeof dateValue === 'string') {
        // Try parsing as string
        date = new Date(dateValue);
      } else if (typeof dateValue === 'number') {
        // Could be a timestamp or year
        if (dateValue > 1900 && dateValue < 2100) {
          // Likely a year
          date = new Date(dateValue, 0, 1);
        } else {
          // Likely a timestamp
          date = new Date(dateValue);
        }
      } else {
        // Fallback to current date
        date = new Date();
      }
      
      return {
        date,
        var1Value: isNaN(var1Value) ? 0 : var1Value,
        var2Value: isNaN(var2Value) ? 0 : var2Value,
        isValidDate: !isNaN(date.getTime())
      };
    })
    .filter(item => item.isValidDate) // Only keep items with valid dates
    .sort((a, b) => a.date.getTime() - b.date.getTime()) // Sort by date
    .slice(0, 100) // Limit to 100 points for performance
    .map(({ date, var1Value, var2Value }) => ({ date, var1Value, var2Value })); // Remove isValidDate property

  // If we don't have any valid dates, fallback to artificial dates
  if (timeSeriesData.length === 0) {
    return data.slice(0, 50).map((row, index) => {
      const var1Value = parseFloat(row[var1Column]);
      const var2Value = parseFloat(row[var2Column]);
      
      return {
        date: new Date(2022, Math.floor(index / 4), (index % 4) * 7),
        var1Value: isNaN(var1Value) ? 0 : var1Value,
        var2Value: isNaN(var2Value) ? 0 : var2Value
      };
    });
  }

  return timeSeriesData;
}

/**
 * Process uploaded CSV file
 */
export async function processCSVFile(file: File): Promise<ProcessedCSVData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const csvContent = e.target?.result as string;
        const rawData = parseCSV(csvContent);
        const { numericColumns, dateColumns, categoricalColumns } = analyzeColumns(rawData);
        
        resolve({
          fileName: file.name,
          rawData,
          numericColumns,
          dateColumns,
          categoricalColumns,
          isProcessed: true
        });
      } catch (error) {
        reject(new Error(`Failed to process CSV: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Calculate correlation results from processed CSV data
 */
export function calculateCorrelationFromData(
  fileData: ProcessedCSVData,
  method: 'pearson' | 'spearman' = 'pearson'
): CorrelationResult {
  const { rawData, numericColumns, dateColumns } = fileData;
  
  if (numericColumns.length < 2) {
    throw new Error('Need at least 2 numeric columns for correlation analysis');
  }

  if (rawData.length === 0) {
    throw new Error('No data rows found in the file');
  }

  // Calculate correlation matrix with proper error handling
  let correlationMatrix: number[][];
  try {
    correlationMatrix = calculateCorrelationMatrix(rawData, numericColumns, method);
  } catch (error) {
    
    // Fallback to identity matrix
    correlationMatrix = numericColumns.map((_, i) => 
      numericColumns.map((_, j) => i === j ? 1.0 : 0.0)
    );
  }

  // Ensure we have a valid matrix
  if (!correlationMatrix || correlationMatrix.length === 0) {
    correlationMatrix = numericColumns.map((_, i) => 
      numericColumns.map((_, j) => i === j ? 1.0 : 0.0)
    );
  }

  // Generate time series data using first two numeric columns as variables
  const var1Column = numericColumns[0];
  const var2Column = numericColumns[1];
  const dateColumn = dateColumns.length > 0 ? dateColumns[0] : null;
  
  let timeSeriesData: Array<{ date: Date; var1Value: number; var2Value: number }>;
  try {
    timeSeriesData = generateTimeSeriesData(rawData, dateColumn, var1Column, var2Column);
  } catch (error) {
   
    // Fallback to basic time series
    timeSeriesData = rawData.slice(0, 20).map((row, index) => ({
      date: new Date(2024, Math.floor(index / 4), (index % 4) * 7),
      var1Value: parseFloat(row[var1Column]) || 0,
      var2Value: parseFloat(row[var2Column]) || 0
    }));
  }

  return {
    variables: numericColumns,
    correlationMatrix,
    timeSeriesData
  };
}
