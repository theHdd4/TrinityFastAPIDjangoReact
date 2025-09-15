import React, { useState, useEffect } from 'react';
import { Calendar, X, FileText, AlertCircle, CheckCircle, Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, parse, isValid, getDaysInMonth, startOfMonth, addMonths, subMonths } from 'date-fns';
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
        if (v1Raw === undefined || v2Raw === undefined) return null;
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

// Helper functions for date parsing and formatting
const parseDateString = (dateStr: string, formatStr: string): Date | null => {
  try {
    if (!dateStr || !formatStr) return null;
    
    // For the calendar component, try to parse the date string with the detected format
    let parseFormat = formatStr;
    
    // Common format mappings
    const formatMap: Record<string, string> = {
      'YYYY-MM-DD': 'yyyy-MM-dd',
      'MM/DD/YYYY': 'MM/dd/yyyy',
      'DD/MM/YYYY': 'dd/MM/yyyy',
      'YYYY/MM/DD': 'yyyy/MM/dd',
      'DD-MM-YYYY': 'dd-MM-yyyy',
      'MM-DD-YYYY': 'MM-dd-yyyy'
    };
    
    if (formatMap[formatStr]) {
      parseFormat = formatMap[formatStr];
    }
    
    const parsed = parse(dateStr, parseFormat, new Date());
    return isValid(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
};

const formatDateForCalendar = (date: Date): string => {
  try {
    return format(date, 'yyyy-MM-dd');
  } catch (error) {
    return '';
  }
};

const getDateRangeForCalendar = (dateAnalysis: DateAnalysisResponse | undefined) => {
  if (!dateAnalysis?.overall_date_range) return { fromDate: undefined, toDate: undefined };
  
  const formatStr = dateAnalysis.date_format_detected;
  const fromDate = parseDateString(dateAnalysis.overall_date_range.min_date, formatStr);
  const toDate = parseDateString(dateAnalysis.overall_date_range.max_date, formatStr);
  
  return { fromDate, toDate };
};

// Custom Elegant Date Picker Component
interface ElegantDatePickerProps {
  value?: string;
  onSelect: (date: string) => void;
  dateAnalysis: DateAnalysisResponse;
  placeholder?: string;
}

const ElegantDatePicker: React.FC<ElegantDatePickerProps> = ({ value, onSelect, dateAnalysis, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'month' | 'date'>('month');
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    if (value) {
      const parsed = parseDateString(value, dateAnalysis.date_format_detected);
      return parsed || new Date();
    }
    const { fromDate } = getDateRangeForCalendar(dateAnalysis);
    return fromDate || new Date();
  });

  const { fromDate, toDate } = getDateRangeForCalendar(dateAnalysis);
  const formatToShow = dateAnalysis.date_format_detected || 'YYYY-MM-DD';

  // Generate available months within the dataset range
  const getAvailableMonths = () => {
    if (!fromDate || !toDate) return [];
    
    const months = [];
    let current = startOfMonth(fromDate);
    const end = startOfMonth(toDate);
    
    while (current <= end) {
      months.push(new Date(current));
      current = addMonths(current, 1);
    }
    
    return months;
  };

  // Generate days for the selected month
  const getDaysInSelectedMonth = () => {
    const daysInMonth = getDaysInMonth(selectedMonth);
    const firstDay = startOfMonth(selectedMonth);
    const days = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), i);
      const isDisabled = (fromDate && date < fromDate) || (toDate && date > toDate);
      const isSelected = value && parseDateString(value, dateAnalysis.date_format_detected)?.toDateString() === date.toDateString();
      
      days.push({
        date,
        day: i,
        isDisabled,
        isSelected
      });
    }
    
    return days;
  };

  const handleDateSelect = (date: Date) => {
    const formatted = formatDateForDisplay(formatDateForCalendar(date), formatToShow);
    onSelect(formatted);
    setIsOpen(false);
  };

  const handleMonthSelect = (month: Date) => {
    setSelectedMonth(month);
    setCurrentView('date');
  };

  const availableMonths = getAvailableMonths();
  const daysData = getDaysInSelectedMonth();

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="absolute right-0 top-0 h-full w-8 px-0 hover:bg-transparent">
          <Calendar className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {currentView === 'month' ? (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-sm">Select Month</h3>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {availableMonths.map((month, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handleMonthSelect(month)}
                  className="text-xs h-8 hover:bg-primary hover:text-primary-foreground"
                >
                  {format(month, 'MMM yyyy')}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('month')}
                className="text-sm font-medium hover:bg-transparent"
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
                {format(selectedMonth, 'MMMM yyyy')}
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <div key={index} className="text-center text-xs font-medium text-muted-foreground p-2">
                  {day}
                </div>
              ))}
              {daysData.map(({ date, day, isDisabled, isSelected }, index) => (
                <Button
                  key={index}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  disabled={isDisabled}
                  onClick={() => handleDateSelect(date)}
                  className={`h-8 w-8 p-0 text-xs ${
                    isSelected ? 'bg-primary text-primary-foreground' : ''
                  } ${isDisabled ? 'opacity-30' : ''}`}
                >
                  {day}
                </Button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
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
  
  // Filter state
  const [loadingColumnValues, setLoadingColumnValues] = useState<string | null>(null);

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
          onDataChange({
            fileData: {
              fileName: data.selectedFile,
              rawData: dataframeInfo.sampleData || [],
              numericColumns: dataframeInfo.numericColumns || [],
              dateColumns: [], // Will be detected from sample data
              categoricalColumns: dataframeInfo.categoricalColumns || [],
              columnValues,
              isProcessed: true
            }
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
        const optimalFormat = getOptimalDateFormat(analysis);
        onDataChange({
          settings: {
            ...data.settings,
            dateFrom: formatDateForDisplay(analysis.overall_date_range.min_date, optimalFormat),
            dateTo: formatDateForDisplay(analysis.overall_date_range.max_date, optimalFormat),
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
        
        onDataChange({
          fileData: {
            fileName: objectName,
            rawData: dataframeInfo.sampleData || [],
            numericColumns: dataframeInfo.numericColumns || [],
            dateColumns: [], // Will be detected from sample data
            categoricalColumns: dataframeInfo.categoricalColumns || [],
            columnValues,
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

      onDataChange({
        correlationMatrix: transformedResult.correlationMatrix,
        timeSeriesData: [], // No default time series data
        timeSeriesIsDate: true,
        variables: transformedResult.variables,
        selectedVar1: null, // No default selection
        selectedVar2: null, // No default selection
        fileData: {
          ...(data.fileData || {}),
          fileName: filePath,
          rawData: result.preview_data || [],
          numericColumns: filteredVariables, // Use filtered variables for numeric columns
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

  const handleCorrelationMethodChange = (method: string) => {
    handleSettingsChange('correlationMethod', method);
    
    // If we have file data, settings will be applied when user clicks "Render"
    onDataChange({
      settings: {
        ...(data.settings || {}),
        correlationMethod: method
      }
    });
  };

  // Simple filter functions
  const handleAddFilter = async (columnName: string) => {
    if (!data.fileData?.fileName) return;
    
    // Check if we have cached column values
    const cachedValues = data.fileData?.columnValues?.[columnName];
    
    if (cachedValues) {
      // Use cached values - no API call needed
     
      const currentFilters = data.settings?.filterDimensions || {};
      handleSettingsChange('filterDimensions', {
        ...currentFilters,
        [columnName]: []
      });
    } else {
      // Fallback to API call if no cached values
      setLoadingColumnValues(columnName);
      try {
       
        const response = await correlationAPI.getColumnValues(data.fileData.fileName, columnName, 100);
        
        // Add empty filter for this column
        const currentFilters = data.settings?.filterDimensions || {};
        handleSettingsChange('filterDimensions', {
          ...currentFilters,
          [columnName]: []
        });
      } catch (error) {
      } finally {
        setLoadingColumnValues(null);
      }
    }
  };

  const handleRemoveFilter = (columnName: string) => {
    const currentFilters = data.settings?.filterDimensions || {};
    const newFilters = { ...currentFilters };
    delete newFilters[columnName];
    
    handleSettingsChange('filterDimensions', newFilters);
  };

  const handleApplySettings = async () => {
    if (data.selectedFile) {
      try {
        setIsProcessing(true);
        setProcessingError(null);
        
        // Re-run correlation analysis with current settings
        await runCorrelationAnalysis(data.selectedFile);
      } catch (error) {
        setProcessingError('Failed to apply settings');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Handle variable selection change for time series
  const handleVariableSelectionChange = async (var1: string, var2: string) => {
    if (!data.selectedFile || !var1 || !var2) return;
    
    try {

      // Update selected variables first
      onDataChange({
        selectedVar1: var1,
        selectedVar2: var2
      });
      
      // Fetch new time series data with specific columns
      const { data: enhancedTimeSeriesData, isDate } = await fetchEnhancedTimeSeriesData(
        data.selectedFile,
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
    if (!data.selectedFile) return;
    
    try {
     
      // Use current selected variables or let backend determine highest correlation
      const forceColumns = (data.selectedVar1 && data.selectedVar2) 
        ? { column1: data.selectedVar1, column2: data.selectedVar2 }
        : undefined;
      
      const { data: enhancedTimeSeriesData, isDate } = await fetchEnhancedTimeSeriesData(
        data.selectedFile,
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

  const handleReset = () => {
    // Reset correlation data but keep using file data if available
    onDataChange({
      correlationMatrix: [],
      timeSeriesData: [],
      timeSeriesIsDate: true,
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
        
        {/* Date range inputs with calendar pickers */}
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
              <ElegantDatePicker
                value={data.settings?.dateFrom || ''}
                onSelect={(date) => handleSettingsChange('dateFrom', date)}
                dateAnalysis={data.dateAnalysis}
                placeholder={data.dateAnalysis.overall_date_range?.min_date ? formatDateForDisplay(data.dateAnalysis.overall_date_range.min_date, formatToShow) : 'Start date'}
              />
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
              <ElegantDatePicker
                value={data.settings?.dateTo || ''}
                onSelect={(date) => handleSettingsChange('dateTo', date)}
                dateAnalysis={data.dateAnalysis}
                placeholder={data.dateAnalysis.overall_date_range?.max_date ? formatDateForDisplay(data.dateAnalysis.overall_date_range.max_date, formatToShow) : 'End date'}
              />
            </div>
          </div>
        </div>
        
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



        {/* Smart Date Filter Section - Only render if date data exists */}
        {renderDateFilterSection()}

      {/* Select Filter */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Select Filter</h3>
        <div className="space-y-2">
          {/* Show loading state for column values */}
          {data.columnValuesLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading column filter values...</span>
            </div>
          )}
          
          {/* Show error state for column values */}
          {data.columnValuesError && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>{data.columnValuesError}</span>
            </div>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between"
                disabled={!data.fileData?.fileName || data.columnValuesLoading}
              >
                {
                  !data.fileData?.fileName
                    ? "Select a file first"
                    : data.columnValuesLoading
                      ? "Loading column values..."
                      : Object.keys(data.settings?.filterDimensions || {}).length
                        ? `${Object.keys(data.settings?.filterDimensions || {}).length} Filters Selected`
                        : "Add Filter by Column"
                }
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-background border-border z-50 max-h-60 overflow-y-auto">
              {(data.fileData?.categoricalColumns || [])
                .filter((column) => {
                  const columnValues = data.fileData?.columnValues?.[column];
                  return columnValues && columnValues.length > 1;
                })
                .map((column) => {
                  const isChecked = Boolean(
                    data.settings?.filterDimensions && column in data.settings.filterDimensions,
                  );
                  return (
                    <DropdownMenuCheckboxItem
                      key={column}
                      checked={isChecked}
                      onCheckedChange={(checked) =>
                        checked ? handleAddFilter(column) : handleRemoveFilter(column)
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      {loadingColumnValues === column ? "Loading..." : column}
                      {data.fileData?.columnValues?.[column] && (
                        <span className="text-muted-foreground ml-1">
                          ({data.fileData.columnValues[column].length} values)
                        </span>
                      )}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              {!(data.fileData?.categoricalColumns?.filter((column) => {
                const columnValues = data.fileData?.columnValues?.[column];
                return columnValues && columnValues.length > 1;
              }).length) && (
                <DropdownMenuCheckboxItem disabled checked={false} onSelect={(e) => e.preventDefault()}>
                  No categorical columns available for filtering
                </DropdownMenuCheckboxItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Filter Items - Show active filter dimensions */}
          <div className="space-y-2">
            {Object.entries(data.settings?.filterDimensions || {}).map(([columnName, values]) => {
              const typedValues = Array.isArray(values) ? values : [];
              return (
                <div key={columnName} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground min-w-[70px]">{columnName}</span>
                  <div className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                    <span>{typedValues.length > 0 ? `${typedValues.length} selected` : 'All'}</span>
                    <X className="h-3 w-3 text-muted-foreground cursor-pointer" 
                       onClick={() => handleRemoveFilter(columnName)} />
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
              'Render'
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