import React, { useState, useEffect } from 'react';
import { FileText, AlertCircle, CheckCircle, Loader2, Clock, Settings } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { VALIDATE_API } from '@/lib/api';
import type { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { correlationAPI, handleAPIError, type FilterAndCorrelateRequest, type DateAnalysisResponse } from '../helpers/correlationAPI';

interface CorrelationSettingsProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

// Transform dictionary correlation matrix to 2D array, filtering out non-numeric columns
const transformCorrelationMatrix = (correlationDict: any, variables: string[]): { matrix: number[][], filteredVariables: string[] } => {
  if (!correlationDict || typeof correlationDict !== 'object') {
    return {
      matrix: variables.map((_, i) => variables.map((_, j) => i === j ? 1.0 : 0.0)),
      filteredVariables: variables
    };
  }


  // Filter out variables that don't exist in the correlation matrix (non-numeric columns)
  const validVariables = variables.filter(variable => {
    const hasValidData = correlationDict[variable] && typeof correlationDict[variable] === 'object';
    if (!hasValidData) {
     
    }
    return hasValidData;
  });



  if (validVariables.length === 0) {
    return {
      matrix: [[1.0]],
      filteredVariables: variables.length > 0 ? [variables[0]] : ['Unknown']
    };
  }

  try {
    const matrix = validVariables.map(rowVar => {
      const rowData = correlationDict[rowVar];
      
      return validVariables.map(colVar => {
        // ALWAYS ensure diagonal values are 1.0
        if (rowVar === colVar) {
          return 1.0;
        }
        
        const value = rowData[colVar];
        // Validate the correlation value for off-diagonal elements
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          return value;
        } else {
          return 0.0; // Off-diagonal invalid values become 0.0
        }
      });
    });
    
   
    return { matrix, filteredVariables: validVariables };
  } catch (error) {
    return {
      matrix: validVariables.map((_, i) => validVariables.map((_, j) => i === j ? 1.0 : 0.0)),
      filteredVariables: validVariables
    };
  }
};

// API functions for time series data
// API functions for time series data - now using correlationAPI
const fetchTimeSeriesAxis = async (filePath: string, startDate?: string, endDate?: string) => {
  return await correlationAPI.getTimeSeriesAxis(filePath, startDate, endDate);
};

const fetchHighestCorrelationPair = async (filePath: string) => {
  return await correlationAPI.getHighestCorrelationPair(filePath);
};

const fetchTimeSeriesData = async (filePath: string, request: {
  column1: string;
  column2: string;
  start_date?: string;
  end_date?: string;
  datetime_column?: string;
}) => {
  return await correlationAPI.getTimeSeriesData(filePath, request);
};

// Enhanced time series data fetching with datetime axis and highest correlation
const fetchEnhancedTimeSeriesData = async (
  filePath: string,
  startDate?: string,
  endDate?: string,
  forceColumns?: { column1: string; column2: string }
): Promise<{ data: Array<{ date: number; var1Value: number; var2Value: number }>; isDate: boolean }> => {
  try {
    // 1. Get axis data (datetime or indices)
    const axisData = await fetchTimeSeriesAxis(filePath, startDate, endDate);
    const isDate = axisData.has_datetime;

    // 2. Get highest correlation pair (unless forced columns provided)
    let pairData;
    if (forceColumns) {
      pairData = {
        column1: forceColumns.column1,
        column2: forceColumns.column2,
        correlation_value: 0,
      };
    } else {
      pairData = await fetchHighestCorrelationPair(filePath);
    }

    // 3. Get Y-values for the selected columns
    const seriesRequest = {
      column1: pairData.column1,
      column2: pairData.column2,
      start_date: startDate,
      end_date: endDate,
      datetime_column: axisData.datetime_column,
    };

    const seriesData = await fetchTimeSeriesData(filePath, seriesRequest);

    // 4. Transform to chart format
    const chartData = axisData.x_values
      .map((x: any, index: number) => {
        const v1Raw = seriesData.column1_values[index];
        const v2Raw = seriesData.column2_values[index];
        if (v1Raw === undefined || v1Raw === null || v2Raw === undefined || v2Raw === null) return null;
        const v1 = parseFloat(v1Raw);
        const v2 = parseFloat(v2Raw);
        if (!isFinite(v1) || !isFinite(v2)) return null;
        return {
          date: isDate ? new Date(x).getTime() : index,
          var1Value: v1,
          var2Value: v2,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.date - b.date);

    return { data: chartData, isDate };
  } catch (error) {
    // Fallback to empty array
    return { data: [], isDate: false };
  }
};


interface Frame { 
  object_name: string; 
  csv_name: string; 
  arrow_name?: string;
}

const CorrelationSettings: React.FC<CorrelationSettingsProps> = ({ data, onDataChange }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [availableColumns, setAvailableColumns] = useState<{identifiers: string[], measures: string[]}>({
    identifiers: [],
    measures: []
  });
  const [isAnalyzingDates, setIsAnalyzingDates] = useState(false);
  

  // Load available dataframes on component mount
  useEffect(() => {
    let query = '';
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        query =
          '?' +
          new URLSearchParams({
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || ''
          }).toString();
      } catch {
        /* ignore */
      }
    }
    fetch(`${VALIDATE_API}/list_saved_dataframes${query}`)
      .then(r => r.json())
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  // Load columns when a file is selected
  useEffect(() => {
    if (data?.selectedFile && data?.validatorAtomId) {
      loadColumns(data.validatorAtomId);
    }
  }, [data?.selectedFile, data?.validatorAtomId]);

  const loadColumns = async (validatorAtomId: string) => {
    try {
      const columns = await correlationAPI.getColumns(validatorAtomId);
      setAvailableColumns(columns);
      
      // Also try to get categorical columns directly from the file using loadDataframe
      if (data.selectedFile) {
        try {
          const dataframeInfo = await correlationAPI.loadDataframe(data.selectedFile);
          
          // Fetch column values for categorical columns
          let columnValues: { [columnName: string]: string[] } = {};
          if (dataframeInfo.categoricalColumns && dataframeInfo.categoricalColumns.length > 0) {
            onDataChange({ columnValuesLoading: true, columnValuesError: undefined });
            try {
              columnValues = await correlationAPI.fetchAllColumnValues(data.selectedFile, dataframeInfo.categoricalColumns);
              onDataChange({ columnValuesLoading: false });
            } catch (columnValuesError) {
              onDataChange({
                columnValuesLoading: false,
                columnValuesError: 'Failed to load column filter values'
              });
            }
          }
          
          // Update fileData with categorical columns and column values
          const numericCols = dataframeInfo.numericColumns || [];
          // Preserve existing selection if valid, otherwise default to first 15 columns (or all if <= 15)
          const existingSelection = data.selectedNumericColumnsForMatrix || [];
          const validSelection = existingSelection.filter(col => numericCols.includes(col));
          const defaultSelection = numericCols.length > 15 ? numericCols.slice(0, 15) : numericCols;
          const finalSelection = validSelection.length > 0 && validSelection.length === existingSelection.length 
            ? validSelection 
            : defaultSelection;
          
          onDataChange({
            fileData: {
              fileName: data.selectedFile,
              rawData: dataframeInfo.sampleData || [],
              numericColumns: numericCols,
              dateColumns: [], // Will be detected from sample data
              categoricalColumns: dataframeInfo.categoricalColumns || [],
              columnValues,
              isProcessed: true
            },
            // Preserve existing selection if valid, otherwise default to all selected
            selectedNumericColumnsForMatrix: finalSelection
          });
          
        } catch (fileError) {
          // could not load categorical columns from validator path
        }
      }
    } catch (error) {
      setProcessingError(handleAPIError(error));
    }
  };

  const analyzeDates = async (filePath: string) => {
    setIsAnalyzingDates(true);
    try {
      const analysis = await correlationAPI.analyzeDates(filePath);
      
      // Store date analysis in component state
      onDataChange({
        dateAnalysis: analysis
      });
      
      // Auto-populate date fields if analysis successful
      if (analysis.has_date_data && analysis.overall_date_range) {
        onDataChange({
          settings: {
            ...data.settings,
            dateFrom: analysis.overall_date_range.min_date,
            dateTo: analysis.overall_date_range.max_date,
            detectedDateFormat: analysis.date_format_detected,
            recommendedGranularity: analysis.recommended_granularity,
            // Auto-adjust aggregation level - default to None
            aggregationLevel: 'None'
          }
        });
      }
    } catch (error) {
      onDataChange({
        dateAnalysis: {
          has_date_data: false,
          date_columns: [],
          recommended_granularity: 'monthly',
          date_format_detected: 'YYYY-MM-DD'
        }
      });
    } finally {
      setIsAnalyzingDates(false);
    }
  };

  const handleFileSelection = async (objectName: string) => {
    setProcessingError(null);
    setIsProcessing(true);

    onDataChange({
      selectedFile: objectName,
      fileData: null,
      correlationMatrix: null,
      timeSeriesData: null,
      timeSeriesIsDate: true,
      dateAnalysis: null,
      isUsingFileData: true,  // Always default to using uploaded data
      filteredFilePath: undefined
    });
    
    // Analyze dates first
    await analyzeDates(objectName);
    
    // Try to get validator atom ID and load columns
    try {
      const validatorInfo = await correlationAPI.getDataframeValidator(objectName);
      if (validatorInfo.validatorId) {
        onDataChange({
          validatorAtomId: validatorInfo.validatorId
        });
        await loadColumns(validatorInfo.validatorId);
        
        // Auto-run correlation analysis after validation completes
        await runCorrelationAnalysis(objectName);
      }
    } catch (error) {
      // Fallback to direct dataframe loading
      try {
        const dataframeInfo = await correlationAPI.loadDataframe(objectName);
       
        
        // Fetch column values for all categorical columns
        let columnValues: { [columnName: string]: string[] } = {};
        if (dataframeInfo.categoricalColumns && dataframeInfo.categoricalColumns.length > 0) {
          onDataChange({ columnValuesLoading: true, columnValuesError: undefined });
          try {
          
            columnValues = await correlationAPI.fetchAllColumnValues(objectName, dataframeInfo.categoricalColumns);
           
            onDataChange({ columnValuesLoading: false });
          } catch (columnValuesError) {
            onDataChange({
              columnValuesLoading: false,
              columnValuesError: 'Failed to load column filter values'
            });
          }
        }
        
        const numericCols = dataframeInfo.numericColumns || [];
        // Preserve existing selection if valid, otherwise default to first 15 columns (or all if <= 15)
        const existingSelection = data.selectedNumericColumnsForMatrix || [];
        const validSelection = existingSelection.filter(col => numericCols.includes(col));
        const defaultSelection = numericCols.length > 15 ? numericCols.slice(0, 15) : numericCols;
        const finalSelection = validSelection.length > 0 && validSelection.length === existingSelection.length 
          ? validSelection 
          : defaultSelection;
        
        onDataChange({
          fileData: {
            fileName: objectName,
            rawData: dataframeInfo.sampleData || [],
            numericColumns: numericCols,
            dateColumns: [], // Will be detected from sample data
            categoricalColumns: dataframeInfo.categoricalColumns || [],
            columnValues,
            isProcessed: true
          },
          // Preserve existing selection if valid, otherwise default to all selected
          selectedNumericColumnsForMatrix: finalSelection
        });
        
        // Auto-run correlation analysis after dataframe loading
        await runCorrelationAnalysis(objectName);
      } catch (loadError) { 
        setProcessingError('Failed to load dataframe for correlation analysis');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const runCorrelationAnalysis = async (filePath: string) => {
    try {
      const request: FilterAndCorrelateRequest = {
        file_path: filePath,
        method: (data.settings?.correlationMethod || 'pearson').toLowerCase() as any,
        include_preview: true,
        preview_limit: 10,
        save_filtered: true,
        include_date_analysis: true // Always include date analysis
      };

      // Add filter dimensions as identifier filters
      const filterDimensions = data.settings?.filterDimensions || {};
      const identifierFilters = Object.entries(filterDimensions)
        .filter(([_, values]) => Array.isArray(values) && values.length > 0)
        .map(([column, values]) => ({ column, values: values as string[] }));
      
      if (identifierFilters.length > 0) {
        request.identifier_filters = identifierFilters;
      }

      // Add column selections if specified
      if (data.selectedColumns && Array.isArray(data.selectedColumns) && data.selectedColumns.length > 0) {
        // Separate columns by type based on available columns
        const selectedIdentifiers = (data.selectedColumns || []).filter(col => 
          availableColumns?.identifiers && availableColumns.identifiers.includes(col)
        );
        const selectedMeasures = (data.selectedColumns || []).filter(col => 
          availableColumns?.measures && availableColumns.measures.includes(col)
        );
        
        if (selectedIdentifiers.length > 0) {
          request.identifier_columns = selectedIdentifiers;
        }
        if (selectedMeasures.length > 0) {
          request.measure_columns = selectedMeasures;
        }
      }

        // Add date filtering and time aggregation if available
        const primaryDateColumn = data.dateAnalysis?.date_columns[0]?.column_name;
        if (primaryDateColumn) {
          request.date_column = primaryDateColumn;
        }
        if (data.dateAnalysis?.has_date_data && data.settings?.dateFrom && data.settings?.dateTo && primaryDateColumn) {
          request.date_range_filter = {
            start: data.settings.dateFrom,
            end: data.settings.dateTo
          };
        }
        if (data.settings?.aggregationLevel && data.settings.aggregationLevel !== 'None' && primaryDateColumn) {
          request.aggregation_level = data.settings.aggregationLevel.toLowerCase();
        }

        const result = await correlationAPI.filterAndCorrelate(request);
      
      // Update date analysis if included in response
      if (result.date_analysis) {
        onDataChange({
          dateAnalysis: result.date_analysis
        });
      }
      
      // Get variables (column names) from the result
      const resultVariables = result.columns_used || [];
      
      // Transform backend correlation matrix dictionary to 2D array and
      // filter out non-numeric columns. The API might return the matrix
      // directly or nested inside a `results` field when loaded from MongoDB.
      const correlationDict =
        result.correlation_results?.correlation_matrix ??
        result.correlation_results?.results?.correlation_matrix ??
        {};

      const { matrix: transformedMatrix, filteredVariables } =
        transformCorrelationMatrix(correlationDict, resultVariables);
      
      // Start with no columns selected and no time series data
      // User must explicitly select variables to see correlations
     
      // Transform backend result to match existing interface
      const transformedResult = {
        variables: filteredVariables, // Use filtered variables instead of all variables
        correlationMatrix: transformedMatrix,
        timeSeriesData: [] // No default time series data
      };

      const newNumericCols = filteredVariables;
      onDataChange({
        correlationMatrix: transformedResult.correlationMatrix,
        timeSeriesData: [], // No default time series data
        timeSeriesIsDate: true,
        variables: transformedResult.variables,
        selectedVar1: null, // No default selection
        selectedVar2: null, // No default selection
        filteredFilePath: result.filtered_file_path ?? undefined,
        fileData: {
          ...(data.fileData || {}),
          fileName: result.filtered_file_path || filePath,
          rawData: result.preview_data || [],
          numericColumns: newNumericCols, // Use filtered variables for numeric columns
          dateColumns:
            result.date_analysis?.date_columns.map((col) => col.column_name) ||
            data.fileData?.dateColumns || [],
          categoricalColumns:
            data.fileData?.categoricalColumns ||
            (result.columns_used || []).filter(
              (col) => !filteredVariables.includes(col), // Non-numeric columns are the ones filtered out
            ),
          columnValues: data.fileData?.columnValues || {},
          isProcessed: true,
        },
        // Initialize or update selected numeric columns for matrix (default: first 15 if > 15, else all)
        selectedNumericColumnsForMatrix: data.selectedNumericColumnsForMatrix && 
          data.selectedNumericColumnsForMatrix.every(col => newNumericCols.includes(col))
          ? data.selectedNumericColumnsForMatrix.filter(col => newNumericCols.includes(col))
          : (newNumericCols.length > 15 ? newNumericCols.slice(0, 15) : newNumericCols)
      });

    } catch (error) {
      setProcessingError(handleAPIError(error));
    }
  };

  const handleSettingsChange = (key: string, value: any) => {
    onDataChange({
      settings: {
        ...(data.settings || {}),
        [key]: value
      }
    });
  };



  // Handle variable selection change for time series
  const handleVariableSelectionChange = async (var1: string, var2: string) => {
    const resolvedFilePath =
      data.filteredFilePath || data.selectedFile || data.fileData?.fileName;
    if (!resolvedFilePath || !var1 || !var2) return;
    
    try {

      // Update selected variables first
      onDataChange({
        selectedVar1: var1,
        selectedVar2: var2
      });
      
      // Fetch new time series data with specific columns
      const { data: enhancedTimeSeriesData, isDate } = await fetchEnhancedTimeSeriesData(
        resolvedFilePath,
        data.settings?.dateFrom,
        data.settings?.dateTo,
        { column1: var1, column2: var2 } // Force specific columns
      );

      // Update time series data
      onDataChange({
        timeSeriesData: enhancedTimeSeriesData,
        timeSeriesIsDate: isDate,
        selectedVar1: var1,
        selectedVar2: var2,
      });
      
     
    } catch (error) {
      // Set empty data on error - no fallback
      onDataChange({
        timeSeriesData: [],
        timeSeriesIsDate: true,
        selectedVar1: var1,
        selectedVar2: var2,
      });
    }
  };

  // Refetch time series data when date filters change
  const refetchTimeSeriesWithDateFilter = async () => {
    const resolvedFilePath =
      data.filteredFilePath || data.selectedFile || data.fileData?.fileName;
    if (!resolvedFilePath) return;
    
    try {
     
      // Use current selected variables or let backend determine highest correlation
      const forceColumns = (data.selectedVar1 && data.selectedVar2) 
        ? { column1: data.selectedVar1, column2: data.selectedVar2 }
        : undefined;
      
      const { data: enhancedTimeSeriesData, isDate } = await fetchEnhancedTimeSeriesData(
        resolvedFilePath,
        data.settings?.dateFrom,
        data.settings?.dateTo,
        forceColumns
      );

      onDataChange({
        timeSeriesData: enhancedTimeSeriesData,
        timeSeriesIsDate: isDate,
      });
      
     
    } catch (error) {
      // Set empty data on error - no fallback
      onDataChange({
        timeSeriesData: [],
        timeSeriesIsDate: true,
      });
    }
  };

  // React to date filter changes
  React.useEffect(() => {
    if (data.selectedFile && (data.settings?.dateFrom || data.settings?.dateTo)) {
      refetchTimeSeriesWithDateFilter();
    }
  }, [data.settings?.dateFrom, data.settings?.dateTo]);



  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6 bg-background text-foreground">
        {/* File Upload Section */}
        <div className="space-y-3">
          {/* Saved Dataframes Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Data Source</Label>
            <Select value={data?.selectedFile || ''} onValueChange={handleFileSelection}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a saved dataframe..." />
              </SelectTrigger>
              <SelectContent>
                {(frames || []).map((frame) => (
                  <SelectItem key={frame.object_name} value={frame.object_name}>
                    {frame.csv_name.split('/').pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Show processing status */}
            {(isProcessing || isAnalyzingDates) && (
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                {isAnalyzingDates ? 'Analyzing date columns...' : 'Processing dataframe...'}
              </div>
            )}
          </div>

          {/* Data Summary Toggle - Only when data source is selected (chartmaker pattern) */}
          {data.selectedFile && (
            <div className="flex items-center justify-between pt-4 border-t mt-4">
              <Label className="text-xs">Show Data Summary</Label>
              <Switch
                checked={data.showDataSummary || false}
                onCheckedChange={(checked) => onDataChange({ showDataSummary: checked })}
              />
            </div>
          )}
        </div>

        {/* Display Settings */}
        <Card className="border border-border shadow-sm">
          <div className="p-4">
            <h4 className="font-medium text-foreground mb-4 flex items-center">
              <Settings className="w-4 h-4 text-muted-foreground mr-2" />
              Display Settings
            </h4>
            <div className="space-y-4">
              {/* Show Note Box Toggle - Moved to settings panel */}
              <div className="flex items-center justify-between">
                <Label className="text-sm">Show Note Box</Label>
                <Switch
                  checked={data.showNote || false}
                  onCheckedChange={(checked) => onDataChange({ showNote: checked })}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CorrelationSettings;
