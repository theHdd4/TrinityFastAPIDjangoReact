import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarChart3, Filter, X, Plus } from 'lucide-react';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';
import { ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from '@/components/AtomList/atoms/chart-maker/services/chartMakerApi';
import { migrateLegacyChart, buildTracesForAPI, validateChart } from '@/components/AtomList/atoms/chart-maker/utils/traceUtils';
import { useToast } from '@/hooks/use-toast';
import { VALIDATE_API } from '@/lib/api';

interface KPIDashboardChartConfigProps {
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
  onDataUpload: (data: KPIDashboardData) => void;
}

interface Frame {
  object_name: string;
  arrow_name?: string;
  csv_name?: string;
}

// Filter Value Selector Component
interface FilterValueSelectorProps {
  column: string;
  uniqueValues: string[];
  selectedValues: string[];
  onValuesChange: (values: string[]) => void;
}

const FilterValueSelector: React.FC<FilterValueSelectorProps> = ({
  column,
  uniqueValues,
  selectedValues,
  onValuesChange
}) => {
  const [tempValues, setTempValues] = useState<string[]>(selectedValues);

  const toggleValue = (value: string) => {
    setTempValues(prev => 
      prev.includes(value) 
        ? prev.filter(v => v !== value) 
        : [...prev, value]
    );
  };

  const selectAll = () => {
    setTempValues(tempValues.length === uniqueValues.length ? [] : uniqueValues);
  };

  const apply = () => {
    onValuesChange(tempValues);
  };

  const cancel = () => {
    setTempValues(selectedValues);
  };

  return (
    <div className="w-64 max-h-80 flex flex-col">
      <div className="p-2 border-b">
        <div className="flex items-center space-x-2 mb-2">
          <Checkbox 
            checked={tempValues.length === uniqueValues.length && uniqueValues.length > 0} 
            onCheckedChange={selectAll} 
          />
          <span className="text-xs font-medium">Select All ({tempValues.length}/{uniqueValues.length})</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {uniqueValues.map((value) => (
            <div key={value} className="flex items-center space-x-2">
              <Checkbox 
                checked={tempValues.includes(value)} 
                onCheckedChange={() => toggleValue(value)} 
              />
              <span className="text-xs">{value}</span>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t flex space-x-2">
        <Button size="sm" onClick={apply} className="flex-1">Apply</Button>
        <Button size="sm" variant="outline" onClick={cancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
};

const KPIDashboardChartConfig: React.FC<KPIDashboardChartConfigProps> = ({
  data,
  settings,
  onSettingsChange,
  onDataUpload
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fileId, setFileId] = useState<string>('');
  const [chartData, setChartData] = useState<any>(null);
  
  // Data Source state
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>((settings as any).selectedFile || '');
  const [loadingDataSource, setLoadingDataSource] = useState(false);
  const [dataSourceError, setDataSourceError] = useState<string | null>(null);
  
  // Find the selected chart box (memoized to prevent unnecessary recalculations)
  const selectedChartBox = useMemo(() => {
    return settings.layouts?.flatMap(layout => layout.boxes)
      .find(box => box.id === settings.selectedBoxId && box.elementType === 'chart');
  }, [settings.layouts, settings.selectedBoxId]);
  
  // Initialize chart config from box or create new one
  const [chartConfig, setChartConfig] = useState<ChartMakerConfig>(() => {
    if (selectedChartBox?.chartConfig) {
      return migrateLegacyChart(selectedChartBox.chartConfig as ChartMakerConfig);
    }
    return {
      id: '1',
      title: 'Chart',
      type: 'bar',
      xAxis: '',
      yAxis: '',
      filters: {},
      aggregation: 'sum',
      legendField: 'aggregate',
      traces: [],
      isAdvancedMode: false,
    };
  });

  // Fetch available dataframes from database
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`, {
      credentials: 'include'
    })
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch((err) => {
        console.error('Failed to fetch dataframes:', err);
        setFrames([]);
      });
  }, []);

  // Load dataframe data when file is selected
  const handleFileSelect = async (fileId: string) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardChartConfig.tsx:164',message:'handleFileSelect entry',data:{fileId,onDataUploadType:typeof onDataUpload,onDataUploadIsFunc:typeof onDataUpload==='function',onSettingsChangeType:typeof onSettingsChange,onSettingsChangeIsFunc:typeof onSettingsChange==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    setSelectedFile(fileId);
    setLoadingDataSource(true);
    setDataSourceError(null);

    try {
      const response = await fetch(`${VALIDATE_API}/load_dataframe_by_key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: fileId })
      });

      if (!response.ok) {
        // Try to get the actual error message from the backend
        let errorMessage = 'Failed to load dataframe';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const responseData = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardChartConfig.tsx:190',message:'Response data received',data:{hasHeaders:!!responseData.headers,headersType:typeof responseData.headers,headersIsArray:Array.isArray(responseData.headers),headersLength:Array.isArray(responseData.headers)?responseData.headers.length:'N/A',hasRows:!!responseData.rows,rowsType:typeof responseData.rows,rowsIsArray:Array.isArray(responseData.rows),rowsLength:Array.isArray(responseData.rows)?responseData.rows.length:'N/A',responseDataKeys:Object.keys(responseData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      const frame = frames.find(f => f.object_name === fileId);
      const fileName = frame?.arrow_name?.split('/').pop() || fileId;
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardChartConfig.tsx:195',message:'Before onSettingsChange call',data:{fileName,onSettingsChangeType:typeof onSettingsChange,onSettingsChangeIsFunc:typeof onSettingsChange==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Save selected file to settings so it's available for chart rendering
      onSettingsChange({ 
        ...settings,
        selectedFile: fileId,
        dataSource: fileName
      } as any);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardChartConfig.tsx:201',message:'Before onDataUpload call',data:{onDataUploadType:typeof onDataUpload,onDataUploadIsFunc:typeof onDataUpload==='function',uploadDataHeaders:Array.isArray(responseData.headers)?responseData.headers.length:'N/A',uploadDataRows:Array.isArray(responseData.rows)?responseData.rows.length:'N/A',fileName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      onDataUpload({
        headers: responseData.headers || [],
        rows: responseData.rows || [],
        fileName: fileName,
        metrics: []
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardChartConfig.tsx:207',message:'After onDataUpload call',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      setLoadingDataSource(false);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/c16dc138-1b27-4dba-8d9b-764693f664f3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'KPIDashboardChartConfig.tsx:209',message:'Error in handleFileSelect',data:{errorType:err instanceof Error?err.constructor.name:'unknown',errorMessage:err instanceof Error?err.message:String(err),errorStack:err instanceof Error?err.stack:'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      console.error('Error loading dataframe:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load dataframe';
      setDataSourceError(errorMessage);
      setLoadingDataSource(false);
    }
  };

  // Track previous data source to prevent unnecessary reloads
  const previousDataSourceRef = useRef<string | null>(null);
  const previousBoxIdRef2 = useRef<string | undefined>(undefined);
  
  // Load data and fetch column information when data is available
  useEffect(() => {
    if (!data || !selectedChartBox) {
      setChartData(null);
      return;
    }

    // Get the file ID from the data source
    const dataSource = (settings as any).selectedFile || (settings as any).dataSource;
    let objectName = dataSource;
    if (!objectName && data.fileName) {
      objectName = data.fileName.endsWith('.arrow') ? data.fileName : `${data.fileName}.arrow`;
    }
    
    // Only reload if data source or box actually changed
    const currentDataSource = objectName || data.fileName || '';
    const currentBoxId = selectedChartBox.id;
    
    if (
      previousDataSourceRef.current === currentDataSource &&
      previousBoxIdRef2.current === currentBoxId &&
      chartData !== null
    ) {
      // Data source and box haven't changed, skip reload
      return;
    }
    
    previousDataSourceRef.current = currentDataSource;
    previousBoxIdRef2.current = currentBoxId;

    const loadData = async () => {
      try {
        setLoading(true);
        
        if (!objectName) {
          console.warn('No data source found');
          return;
        }

        // Ensure object_name ends with .arrow
        if (!objectName.endsWith('.arrow')) {
          objectName += '.arrow';
        }

        const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName);
        const resolvedFileId = uploadResponse.file_id;
        setFileId(resolvedFileId);

        // Fetch column information
        const [allColumnsResponse, columnsResponse] = await Promise.all([
          chartMakerApi.getAllColumns(resolvedFileId),
          chartMakerApi.getColumns(resolvedFileId)
        ]);

        const finalFileId = columnsResponse.file_id || allColumnsResponse.file_id || resolvedFileId;
        
        // Fetch unique values for all columns
        const allColumns = allColumnsResponse.columns || [];
        const uniqueValuesResponse = await chartMakerApi.getUniqueValues(finalFileId, allColumns);

        const convertedData = {
          columns: data.headers,
          rows: data.rows,
          file_id: finalFileId,
          row_count: data.rows.length,
          allColumns: allColumnsResponse.columns,
          numericColumns: columnsResponse.numeric_columns || [],
          categoricalColumns: columnsResponse.categorical_columns || [],
          uniqueValuesByColumn: uniqueValuesResponse.values || {},
        };

        setChartData(convertedData);
      } catch (error) {
        console.error('Error loading chart data:', error);
        toast({
          title: 'Error',
          description: 'Failed to load chart data',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [data?.fileName, selectedChartBox?.id, (settings as any).selectedFile, (settings as any).dataSource]);

  // Track previous chart config to prevent unnecessary updates
  const previousChartConfigRef = useRef<string>('');
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Update chart config in box when it changes (debounced and with deep comparison)
  useEffect(() => {
    if (!selectedChartBox) return;
    
    // Serialize config for comparison
    const configString = JSON.stringify(chartConfig);
    
    // Skip if config hasn't actually changed
    if (previousChartConfigRef.current === configString) {
      return;
    }
    
    previousChartConfigRef.current = configString;
    
    // Clear any pending updates
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // Debounce the update to prevent rapid re-renders
    updateTimeoutRef.current = setTimeout(() => {
      const updatedLayouts = settings.layouts?.map(layout => ({
        ...layout,
        boxes: layout.boxes.map(box =>
          box.id === settings.selectedBoxId
            ? { ...box, chartConfig: chartConfig }
            : box
        )
      }));

      onSettingsChange({ layouts: updatedLayouts });
    }, 300); // 300ms debounce
    
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [chartConfig, selectedChartBox, settings.selectedBoxId, settings.layouts, onSettingsChange]);

  // Load existing chart config from box (only when box ID changes, not when config changes)
  const previousBoxIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Only update if the box ID actually changed, not just the config
    if (selectedChartBox?.id !== previousBoxIdRef.current) {
      previousBoxIdRef.current = selectedChartBox?.id;
      if (selectedChartBox?.chartConfig) {
        const migrated = migrateLegacyChart(selectedChartBox.chartConfig as ChartMakerConfig);
        // Reset the previous config ref when loading new config
        previousChartConfigRef.current = '';
        setChartConfig(migrated);
      }
    }
  }, [selectedChartBox?.id]);

  // Sync chart config when box's chartConfig changes (e.g., from global filters)
  // This ensures the component reflects changes made outside (like global filter updates)
  const previousBoxConfigRef = useRef<string>('');
  useEffect(() => {
    if (selectedChartBox?.chartConfig && selectedChartBox.id === previousBoxIdRef.current) {
      const migrated = migrateLegacyChart(selectedChartBox.chartConfig as ChartMakerConfig);
      const boxConfigString = JSON.stringify(migrated);
      
      // Only update if the box's config actually changed (to avoid infinite loops)
      if (previousBoxConfigRef.current !== boxConfigString) {
        previousBoxConfigRef.current = boxConfigString;
        
        // Check if filters changed specifically (global filter sync)
        const currentFilters = JSON.stringify(chartConfig.filters || {});
        const newFilters = JSON.stringify(migrated.filters || {});
        
        if (currentFilters !== newFilters) {
          console.log('[Chart Config] Syncing filters from box (global filter update):', {
            boxId: selectedChartBox.id,
            oldFilters: chartConfig.filters,
            newFilters: migrated.filters
          });
          // Reset the previous config ref to allow the update to propagate back
          previousChartConfigRef.current = '';
          setChartConfig(migrated);
        }
      }
    } else if (selectedChartBox?.chartConfig) {
      // Update ref when box changes
      const migrated = migrateLegacyChart(selectedChartBox.chartConfig as ChartMakerConfig);
      previousBoxConfigRef.current = JSON.stringify(migrated);
    }
  }, [selectedChartBox?.chartConfig, selectedChartBox?.id]);

  const getUniqueValues = (column: string) => {
    if (!chartData) return [];
    
    if (chartData.uniqueValuesByColumn && chartData.uniqueValuesByColumn[column]) {
      return chartData.uniqueValuesByColumn[column];
    }
    
    const values = new Set(chartData.rows.map((row: any) => String(row[column])));
    return Array.from(values).filter(v => v !== '' && v !== 'null' && v !== 'undefined');
  };

  const getNumericColumns = () => {
    if (!chartData) return [];
    return chartData.numericColumns || [];
  };

  const getCategoricalColumns = () => {
    if (!chartData) return [];
    return chartData.categoricalColumns || [];
  };

  const getXAxisColumns = () => {
    if (!chartData) return [];
    const numericColumns = new Set(getNumericColumns());
    const categoricalColumns = new Set(getCategoricalColumns());
    const allColumns = chartData.allColumns || chartData.columns || [];
    return allColumns.filter((column: string) => numericColumns.has(column) || categoricalColumns.has(column));
  };

  const getLegendColumns = () => {
    if (!chartData) return [];
    const categorical = getCategoricalColumns();
    const numericColumns = getNumericColumns();
    const filteredNumeric = numericColumns
      .filter((column: string) => getUniqueValues(column).length < 20);
    return Array.from(new Set([...categorical, ...filteredNumeric]));
  };

  const getAvailableFilterColumns = () => {
    if (!chartData) return [];
    const numeric = new Set(getNumericColumns());
    const categorical = new Set(getCategoricalColumns());
    const allColumns = chartData.allColumns || chartData.columns || [];
    return allColumns.filter((column: string) => numeric.has(column) || categorical.has(column));
  };

  const updateChart = (updates: Partial<ChartMakerConfig>) => {
    const updated = { ...chartConfig, ...updates };
    
    // Reset chart rendering state if key fields changed
    const resetKeys: (keyof ChartMakerConfig)[] = ['xAxis', 'yAxis', 'filters', 'traces', 'type'];
    const needsReset = resetKeys.some(key => key in updates);
    
    if (needsReset) {
      updated.chartRendered = false;
      updated.chartConfig = undefined;
      updated.filteredData = undefined;
    }
    
    setChartConfig(updated);
  };

  const updateFilter = (column: string, values: string[]) => {
    const newFilters = { ...chartConfig.filters, [column]: values };
    updateChart({ filters: newFilters });
  };

  const removeFilter = (column: string) => {
    const { [column]: removed, ...remainingFilters } = chartConfig.filters || {};
    updateChart({ filters: remainingFilters });
  };

  const handleRenderChart = async () => {
    if (!fileId || !chartData) {
      toast({
        title: 'Error',
        description: 'No data available',
        variant: 'destructive',
      });
      return;
    }

    const migratedChart = migrateLegacyChart(chartConfig);
    if (!validateChart(migratedChart)) {
      toast({
        title: 'Error',
        description: 'Please configure all required chart fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const traces = buildTracesForAPI(migratedChart);
      // Use filters directly from chart config - global filters are already synced to chartConfig.filters
      // in KPIDashboardSettings.tsx when global filter values change
      const mergedFilters = migratedChart.isAdvancedMode ? {} : migratedChart.filters || {};

      const chartRequest = {
        file_id: fileId,
        chart_type: migratedChart.type === 'stacked_bar' ? 'bar' : migratedChart.type,
        traces: traces,
        title: migratedChart.title,
        filters: Object.keys(mergedFilters).length > 0 ? mergedFilters : undefined,
      };

      const chartResponse = await chartMakerApi.generateChart(chartRequest);
      
      const updatedChart = {
        ...migratedChart,
        chartConfig: chartResponse.chart_config,
        filteredData: chartResponse.chart_config.data,
        chartRendered: true,
      };

      setChartConfig(updatedChart);

      // Update the box with rendered chart
      const updatedLayouts = settings.layouts?.map(layout => ({
        ...layout,
        boxes: layout.boxes.map(box =>
          box.id === settings.selectedBoxId
            ? { ...box, chartConfig: updatedChart }
            : box
        )
      }));

      onSettingsChange({ layouts: updatedLayouts });

      toast({
        title: 'Chart rendered',
        description: 'Your chart is ready.',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error rendering chart:', error);
      toast({
        title: 'Error',
        description: 'Failed to render chart',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!selectedChartBox) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <BarChart3 className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Select a chart element to configure it
        </p>
      </div>
    );
  }

  if (loading && !chartData && data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
        <BarChart3 className="w-12 h-12 text-muted-foreground mb-3 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading chart data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Data Source Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data Source</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedFile} onValueChange={handleFileSelect}>
            <SelectTrigger className="w-full bg-white border-gray-300">
              <SelectValue placeholder="Select a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {frames.length === 0 ? (
                <SelectItem value="no-data" disabled>
                  No dataframes available
                </SelectItem>
              ) : (
                frames.map(f => (
                  <SelectItem key={f.object_name} value={f.object_name}>
                    {f.arrow_name?.split('/').pop() || f.csv_name || f.object_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {loadingDataSource && (
            <p className="text-xs text-blue-600">Loading dataframe...</p>
          )}
          {dataSourceError && (
            <p className="text-xs text-red-600">{dataSourceError}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Select a dataframe from the database to use as data source
          </p>
        </CardContent>
      </Card>

      {!data && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Select a dataframe above to configure your chart
          </p>
        </div>
      )}

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Chart Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          {/* Chart Title and Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Chart Title</Label>
              <Input
                value={chartConfig.title}
                onChange={(e) => updateChart({ title: e.target.value })}
                className="mt-1"
                placeholder="Enter chart title"
              />
            </div>

            <div>
              <Label className="text-xs">Chart Type</Label>
              <Select 
                value={chartConfig.type} 
                onValueChange={(value) => updateChart({ type: value as any })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  {chartConfig.legendField && chartConfig.legendField !== 'aggregate' && (
                    <SelectItem value="stacked_bar">Stacked Bar Chart</SelectItem>
                  )}
                  <SelectItem value="area">Area Chart</SelectItem>
                  <SelectItem value="scatter">Scatter Plot</SelectItem>
                  {(!chartConfig.legendField || chartConfig.legendField === 'aggregate') && (
                    <SelectItem value="pie">Pie Chart</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* X-Axis and Y-Axis */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">X-Axis</Label>
              <Select 
                value={chartConfig.xAxis} 
                onValueChange={(value) => updateChart({ xAxis: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select X-axis column" />
                </SelectTrigger>
                <SelectContent>
                  {getXAxisColumns().map((column: string) => (
                    <SelectItem key={column} value={column}>{column}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Y-Axis</Label>
              <div className="flex gap-1">
                <Select 
                  value={chartConfig.yAxis} 
                  onValueChange={(value) => updateChart({ yAxis: value })}
                >
                  <SelectTrigger className="mt-1 flex-1">
                    <SelectValue placeholder="Select Y-axis column" />
                  </SelectTrigger>
                  <SelectContent>
                    {getNumericColumns().map((column: string) => (
                      <SelectItem key={column} value={column}>{column}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chartConfig.secondYAxis === undefined && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1 h-9 px-2"
                    onClick={() => updateChart({ secondYAxis: '' })}
                    title="Add second Y-axis"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Second Y-Axis if enabled */}
          {chartConfig.secondYAxis !== undefined && (
            <div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Axis Mode</Label>
                  <Select 
                    value={chartConfig.dualAxisMode || 'dual'} 
                    onValueChange={(value) => updateChart({ dualAxisMode: value as 'dual' | 'single' })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dual">Second Axis</SelectItem>
                      <SelectItem value="single">First Axis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Second Y-Axis</Label>
                  <div className="flex gap-1 mt-1">
                    <Select 
                      value={chartConfig.secondYAxis} 
                      onValueChange={(value) => updateChart({ secondYAxis: value })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select second Y-axis column" />
                      </SelectTrigger>
                      <SelectContent>
                        {getNumericColumns().map((column: string) => (
                          <SelectItem key={column} value={column}>{column}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 px-2 hover:bg-red-100 hover:text-red-600"
                      onClick={() => updateChart({ secondYAxis: undefined })}
                      title="Remove second Y-axis"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Aggregation */}
          <div>
            <Label className="text-xs">Aggregation</Label>
            <Select 
              value={chartConfig.aggregation || 'sum'} 
              onValueChange={(value: 'sum' | 'mean' | 'count' | 'min' | 'max') => updateChart({ aggregation: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="mean">Average</SelectItem>
                <SelectItem value="count">Count</SelectItem>
                <SelectItem value="min">Minimum</SelectItem>
                <SelectItem value="max">Maximum</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Segregate Field Values */}
          <div>
            <Label className="text-xs">Segregate Field Values</Label>
            <Select 
              value={chartConfig.legendField || 'aggregate'} 
              onValueChange={(value) => updateChart({ legendField: value })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Show Aggregate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aggregate">Show Aggregate</SelectItem>
                {getLegendColumns().map((column: string) => (
                  <SelectItem key={column} value={column}>{column}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filters */}
          <div>
            <Label className="text-xs">Filters</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(chartConfig.filters || {}).map(([column, values]) => (
                <div key={column} className="inline-flex items-center gap-1">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center rounded-full border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                      >
                        {column} ({Array.isArray(values) ? values.length : 0})
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64" align="start">
                      <FilterValueSelector
                        column={column}
                        uniqueValues={getUniqueValues(column)}
                        selectedValues={Array.isArray(values) ? values : []}
                        onValuesChange={(newValues) => updateFilter(column, newValues)}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFilter(column);
                    }}
                    className="p-0.5 hover:bg-red-100 rounded transition-colors"
                    title="Remove filter"
                  >
                    <X className="w-3 h-3 cursor-pointer hover:text-red-600" />
                  </button>
                </div>
              ))}
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    disabled={getAvailableFilterColumns().length === 0}
                  >
                    <Filter className="w-3 h-3 mr-1" />
                    Add Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="start">
                  <div className="space-y-3">
                    <Label className="text-xs font-medium">Select Column to Filter</Label>
                    {getAvailableFilterColumns().length === 0 ? (
                      <p className="text-xs text-muted-foreground">No columns available for filtering</p>
                    ) : (
                      <div style={{ maxHeight: '224px', overflowY: 'auto' }}>
                        {getAvailableFilterColumns().map((column: string) => (
                          <div key={column}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => {
                                if (!chartConfig.filters || !chartConfig.filters[column]) {
                                  const allValues = getUniqueValues(column);
                                  updateFilter(column, allValues);
                                }
                              }}
                              disabled={!!(chartConfig.filters && chartConfig.filters[column])}
                            >
                              {column}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Show Note Box Toggle */}
          <div className="flex items-center justify-between pt-2">
            <Label className="text-xs">Show Note Box</Label>
            <Switch
              checked={chartConfig.showNote || false}
              onCheckedChange={(checked) => updateChart({ showNote: checked })}
            />
          </div>
        </CardContent>
      </Card>
      )}

      {data && (
        <div className="sticky bottom-0 pt-4 border-t bg-white z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <Button 
            onClick={handleRenderChart} 
            className="w-full"
            disabled={!chartData || !validateChart(migrateLegacyChart(chartConfig)) || loading}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {loading ? 'Rendering...' : 'Render Chart'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default KPIDashboardChartConfig;

