import React, { useState, useEffect } from 'react';
import { Calendar, X, FileText, AlertCircle, CheckCircle, Loader2, Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
    console.warn('Invalid correlation matrix data:', correlationDict);
    return { 
      matrix: variables.map((_, i) => variables.map((_, j) => i === j ? 1.0 : 0.0)),
      filteredVariables: variables
    };
  }

  console.log('Original correlation dict:', correlationDict);

  // Filter out variables that don't exist in the correlation matrix (non-numeric columns)
  const validVariables = variables.filter(variable => {
    const hasValidData = correlationDict[variable] && typeof correlationDict[variable] === 'object';
    if (!hasValidData) {
      console.log(`Filtering out non-numeric variable: ${variable}`);
    }
    return hasValidData;
  });

  console.log(`Filtered variables from ${variables.length} to ${validVariables.length}:`, validVariables);

  if (validVariables.length === 0) {
    console.warn('No valid numeric variables found in correlation matrix');
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
          console.warn(`Invalid correlation value for ${rowVar} vs ${colVar}:`, value);
          return 0.0; // Off-diagonal invalid values become 0.0
        }
      });
    });
    
    console.log('Transformed correlation matrix:', matrix);
    return { matrix, filteredVariables: validVariables };
  } catch (error) {
    console.error('Error transforming correlation matrix:', error);
    return { 
      matrix: validVariables.map((_, i) => validVariables.map((_, j) => i === j ? 1.0 : 0.0)),
      filteredVariables: validVariables
    };
  }
};

// Validate and transform time series data
const validateTimeSeriesData = (previewData: any[]): Array<{date: Date; var1Value: number; var2Value: number}> => {
  if (!Array.isArray(previewData) || previewData.length === 0) {
    return [];
  }

  try {
    return previewData.map((item, index) => {
      // Try to extract date from various possible fields
      let date = new Date();
      if (item.Date) {
        date = new Date(item.Date);
      } else if (item.date) {
        date = new Date(item.date);
      } else if (item.Year && item.Month) {
        date = new Date(item.Year, item.Month - 1, 1);
      } else {
        // Fallback: use index-based date
        date = new Date(2022, index % 12, 1);
      }

      // Validate date
      if (isNaN(date.getTime())) {
        date = new Date(2022, index % 12, 1);
      }

      // Extract numeric values (use first two numeric columns found)
      const numericKeys = Object.keys(item).filter(key => 
        typeof item[key] === 'number' && !isNaN(item[key]) && isFinite(item[key])
      );

      const var1Value = numericKeys[0] ? item[numericKeys[0]] : Math.random() * 100;
      const var2Value = numericKeys[1] ? item[numericKeys[1]] : Math.random() * 100;

      
      return {
        date,
        var1Value: typeof var1Value === 'number' && !isNaN(var1Value) ? var1Value : 0,
        var2Value: typeof var2Value === 'number' && !isNaN(var2Value) ? var2Value : 0
      };
    });
  } catch (error) {
    console.error('Error validating time series data:', error);
    return [];
  }
};

// Helper functions for date formatting
const getOptimalDateFormat = (analysis: DateAnalysisResponse): string => {
  switch (analysis.recommended_granularity) {
    case 'daily': return 'YYYY-MM-DD';
    case 'monthly': return 'MMM YYYY';
    case 'yearly': return 'YYYY';
    default: return 'YYYY-MM-DD';
  }
};

const formatDateForDisplay = (dateStr: string, format: string): string => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    switch (format) {
      case 'MMM YYYY':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      case 'YYYY':
        return date.getFullYear().toString();
      case 'YYYY-MM-DD':
      default:
        return date.toISOString().split('T')[0];
    }
  } catch {
    return dateStr;
  }
};

const getAvailableAggregationLevels = (granularity: string): string[] => {
  switch (granularity) {
    case 'daily': return ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];
    case 'monthly': return ['Monthly', 'Quarterly', 'Yearly'];
    case 'yearly': return ['Yearly'];
    default: return ['Monthly', 'Quarterly', 'Yearly'];
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
    } catch (error) {
      console.error('Failed to load columns:', error);
      setProcessingError(handleAPIError(error));
    }
  };

  const analyzeDates = async (filePath: string) => {
    setIsAnalyzingDates(true);
    try {
      console.log('🗓️ Starting date analysis for:', filePath);
      const analysis = await correlationAPI.analyzeDates(filePath);
      console.log('📅 Date analysis result:', analysis);
      
      // Store date analysis in component state
      onDataChange({
        dateAnalysis: analysis
      });
      
      // Auto-populate date fields if analysis successful
      if (analysis.has_date_data && analysis.overall_date_range) {
        const optimalFormat = getOptimalDateFormat(analysis);
        onDataChange({
          settings: {
            ...data.settings,
            dateFrom: formatDateForDisplay(analysis.overall_date_range.min_date, optimalFormat),
            dateTo: formatDateForDisplay(analysis.overall_date_range.max_date, optimalFormat),
            detectedDateFormat: analysis.date_format_detected,
            recommendedGranularity: analysis.recommended_granularity,
            // Auto-adjust aggregation level
            aggregationLevel: analysis.recommended_granularity.charAt(0).toUpperCase() + analysis.recommended_granularity.slice(1)
          }
        });
      }
    } catch (error) {
      console.error('Date analysis failed:', error);
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
      dateAnalysis: null,
      isUsingFileData: true  // Always default to using uploaded data
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
      console.warn('Could not get validator ID, using direct dataframe loading');
      // Fallback to direct dataframe loading
      try {
        const dataframeInfo = await correlationAPI.loadDataframe(objectName);
        onDataChange({
          fileData: {
            fileName: objectName,
            rawData: dataframeInfo.sampleData || [],
            numericColumns: dataframeInfo.numericColumns || [],
            dateColumns: [], // Will be detected from sample data
            categoricalColumns: dataframeInfo.categoricalColumns || [],
            isProcessed: true
          }
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

      // Add date filtering if we have date analysis and settings
      if (data.dateAnalysis?.has_date_data && data.settings?.dateFrom && data.settings?.dateTo) {
        const primaryDateColumn = data.dateAnalysis.date_columns[0]?.column_name;
        if (primaryDateColumn) {
          request.date_column = primaryDateColumn;
          request.date_range_filter = {
            start: data.settings.dateFrom,
            end: data.settings.dateTo
          };
        }
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
      
      // Transform backend correlation matrix dictionary to 2D array and filter out non-numeric columns
      const { matrix: transformedMatrix, filteredVariables } = transformCorrelationMatrix(
        result.correlation_results.correlation_matrix, 
        resultVariables
      );
      
      // Validate and transform time series data
      const validatedTimeSeriesData = validateTimeSeriesData(result.preview_data || []);
      
      // Transform backend result to match existing interface
      const transformedResult = {
        variables: filteredVariables, // Use filtered variables instead of all variables
        correlationMatrix: transformedMatrix,
        timeSeriesData: validatedTimeSeriesData
      };

      onDataChange({
        correlationMatrix: transformedResult.correlationMatrix,
        timeSeriesData: transformedResult.timeSeriesData,
        variables: transformedResult.variables,
        fileData: {
          fileName: filePath,
          rawData: result.preview_data || [],
          numericColumns: filteredVariables, // Use filtered variables for numeric columns
          dateColumns: result.date_analysis?.date_columns.map(col => col.column_name) || [],
          categoricalColumns: (result.columns_used || []).filter(col => 
            !filteredVariables.includes(col) // Non-numeric columns are the ones filtered out
          ),
          isProcessed: true
        }
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

  const handleIdentifierChange = (key: string, value: string) => {
    onDataChange({
      identifiers: {
        ...(data.identifiers || {}),
        [key]: value
      }
    });
  };

  const handleCorrelationMethodChange = (method: string) => {
    handleSettingsChange('correlationMethod', method);
    
    // If we have file data, settings will be applied when user clicks "Recalculate"
    onDataChange({
      settings: {
        ...(data.settings || {}),
        correlationMethod: method
      }
    });
  };

  const handleApplySettings = async () => {
    if (data.selectedFile) {
      try {
        setIsProcessing(true);
        setProcessingError(null);
        
        // Re-run correlation analysis with current settings
        await runCorrelationAnalysis(data.selectedFile);
      } catch (error) {
        console.error('Error applying settings:', error);
        setProcessingError('Failed to apply settings');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleReset = () => {
    // Reset correlation data but keep using file data if available
    onDataChange({
      correlationMatrix: [],
      timeSeriesData: [],
      variables: [],
      dateAnalysis: null
    });
    setProcessingError(null);
  };

  // Smart date field rendering
  const renderDateFilterSection = () => {
    // Don't render if no date analysis or no date data
    if (!data.dateAnalysis || !data.dateAnalysis.has_date_data) {
      return null;
    }

    const formatToShow = getOptimalDateFormat(data.dateAnalysis);
    
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Date Filter</h3>
        
        {/* Date range inputs with smart formatting */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="fromDate" className="text-xs text-muted-foreground">From</Label>
            <div className="relative">
              <Input
                id="fromDate"
                value={data.settings?.dateFrom || ''}
                onChange={(e) => handleSettingsChange('dateFrom', e.target.value)}
                className="pr-8 text-xs bg-background border-border"
                placeholder={data.dateAnalysis.overall_date_range?.min_date ? formatDateForDisplay(data.dateAnalysis.overall_date_range.min_date, formatToShow) : 'Start date'}
              />
              <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          </div>
          
          <div className="space-y-1">
            <Label htmlFor="toDate" className="text-xs text-muted-foreground">To</Label>
            <div className="relative">
              <Input
                id="toDate"
                value={data.settings?.dateTo || ''}
                onChange={(e) => handleSettingsChange('dateTo', e.target.value)}
                className="pr-8 text-xs bg-background border-border"
                placeholder={data.dateAnalysis.overall_date_range?.max_date ? formatDateForDisplay(data.dateAnalysis.overall_date_range.max_date, formatToShow) : 'End date'}
              />
              <Calendar className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            </div>
          </div>
        </div>
        
        {/* Show available date columns */}
        {data.dateAnalysis.date_columns.length > 1 && (
          <div className="text-xs text-muted-foreground">
            <strong>Available date columns:</strong> {data.dateAnalysis.date_columns.map(col => col.column_name).join(', ')}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-6 bg-background text-foreground">
        {/* File Upload Section */}
        <div className="space-y-3">
          {/* Saved Dataframes Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Select Saved Dataframe</Label>
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
          

            {/* Show column information for uploaded file */}
            {data.fileData?.isProcessed && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Available Columns</h4>
                <div className="space-y-1">
                  <div>
                    <span className="text-xs font-medium text-blue-800">({data.fileData?.numericColumns?.length || 0}): </span>
                    <span className="text-xs text-blue-700">
                      {data.fileData?.numericColumns?.join(', ') || ''}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Select Data Section */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Data</h3>
        <div className="space-y-2">
          <Select 
            value={data.settings?.selectData || 'Single Selection'} 
            onValueChange={(value) => handleSettingsChange('selectData', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Single Selection">Single Selection</SelectItem>
              <SelectItem value="Multi Selection">Multi Selection</SelectItem>
            </SelectContent>
          </Select>
          
          <Select 
            value={data.settings?.dataset || 'Sales_Data'} 
            onValueChange={(value) => handleSettingsChange('dataset', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Sales_Data">Sales_Data</SelectItem>
              <SelectItem value="Marketing_Data">Marketing_Data</SelectItem>
              <SelectItem value="Customer_Data">Customer_Data</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

        {/* Smart Date Filter Section - Only render if date data exists */}
        {renderDateFilterSection()}

        {/* Date and Time Aggregation - Smart options based on detected granularity */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Date and Time Aggregation</h3>
          <div className="space-y-2">
            <div className="flex gap-1 flex-wrap">
              {getAvailableAggregationLevels(data.dateAnalysis?.recommended_granularity || 'monthly').map((period) => (
                <Button
                  key={period}
                  variant={(data.settings?.aggregationLevel || 'Yearly') === period ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => handleSettingsChange('aggregationLevel', period)}
                >
                  {period}
                </Button>
              ))}
            </div>
          </div>
        </div>

      {/* Select Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Filter</h3>
        <div className="space-y-2">
          <Select 
            value={data.settings?.selectFilter || 'Multi Selection'} 
            onValueChange={(value) => handleSettingsChange('selectFilter', value)}
          >
            <SelectTrigger className="w-full bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background border-border z-50">
              <SelectItem value="Multi Selection">Multi Selection</SelectItem>
              <SelectItem value="Single Selection">Single Selection</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Filter Items */}
          <div className="space-y-2">
            {Object.entries(data.identifiers || {}).map(([key, value]) => {
              const displayName = key.replace('identifier', 'Identifier ');
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-[70px]">{displayName}</span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                    <span>{value || 'All'}</span>
                    <X className="h-3 w-3 text-muted-foreground cursor-pointer" 
                       onClick={() => handleIdentifierChange(key, 'All')} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Correlation Method */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Correlation Method</h3>
        <Select 
          value={data.settings?.correlationMethod || 'pearson'} 
          onValueChange={handleCorrelationMethodChange}
        >
          <SelectTrigger className="w-full bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background border-border z-50">
            <SelectItem value="pearson">Pearson</SelectItem>
            <SelectItem value="spearman">Spearman</SelectItem>
            <SelectItem value="phi_coefficient">Phi Coefficient</SelectItem>
            <SelectItem value="cramers_v">Cramer's V</SelectItem>
          </SelectContent>
        </Select>
      </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-4">
          <Button 
            variant="default" 
            size="sm" 
            className="flex-1"
            onClick={handleApplySettings}
            disabled={isProcessing || isAnalyzingDates || !data.fileData?.isProcessed}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Processing...
              </>
            ) : (
              'Recalculate'
            )}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleReset}
          >
            Reset
          </Button>
        </div>
      </div>
  );
};

export default CorrelationSettings;