import React, { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Card, CardContent } from '@/components/ui/card';
import { X, Database, Settings2, BarChart, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { DataSummaryView } from '@/components/shared/DataSummaryView';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const normalizeColumnName = (value: string | undefined | null) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

interface GroupByCanvasProps {
  atomId: string;
}

const GroupByCanvas: React.FC<GroupByCanvasProps> = ({ atomId }) => {
  const { toast } = useToast();
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};

  // Get input file name for clickable subtitle
  const inputFileName = settings.dataSource || '';

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

  const selectedMeasures = settings.selectedMeasures || [];
  const measures = settings.measures || [];
  const selectedIdentifiers = settings.selectedIdentifiers || [];
  const identifiers = settings.identifiers || [];
  const derivedIdentifiers = identifiers.length > 0 ? identifiers : (settings.allColumns || []).filter((c: any) => c.data_type && (
    c.data_type.toLowerCase().includes('object') ||
    c.data_type.toLowerCase().includes('string') ||
    c.data_type.toLowerCase().includes('category')
  )).map((c: any) => c.column);
  const availableIdentifiers = derivedIdentifiers.filter((id: string) => !selectedIdentifiers.includes(id));
  const [addingIdentifier, setAddingIdentifier] = useState(false);
  const handleAddIdentifier = (id: string) => {
    updateSettings(atomId, { selectedIdentifiers: [...selectedIdentifiers, id] });
    setAddingIdentifier(false);
  };

  // Helper: do any measures use Weighted Mean?
  const hasWeightedMean = selectedMeasures.some((m: any) => m.aggregator === 'Weighted Mean');

  // Total rows (before slicing) and Save DataFrame states
  const [totalRows, setTotalRows] = useState(() => {
    return settings.groupbyResults?.unsaved_data?.length || 0;
  });
  const [allResults, setAllResults] = useState<Record<string, any>[]>(() => {
    return settings.groupbyResults?.unsaved_data || [];
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  // Get configuration state from global store
  const configCollapsed = settings.configCollapsed || false;
  const currentPage = settings.currentPage || 1;
  const pageSize = 20;
  const resultsSortColumn = settings.resultsSortColumn || '';
  const resultsSortDirection = settings.resultsSortDirection || 'asc';
  const resultsColumnFilters = settings.resultsColumnFilters || {};

  // Helper to convert results to CSV
  const resultsToCSV = (data: Record<string, any>[]): string => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  // Open save modal with default filename
  const handleSaveDataFrame = () => {
    const dataToSave = allResults.length ? allResults : results;
    if (!dataToSave || dataToSave.length === 0) return;
    
    // Generate default filename
    const defaultFilename = `groupby_${settings?.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Actually save the DataFrame with the chosen filename
  const confirmSaveDataFrame = async () => {
    const dataToSave = allResults.length ? allResults : results;
    if (!dataToSave || dataToSave.length === 0) return;
    
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = resultsToCSV(dataToSave);
      const filename = saveFileName.trim() || `groupby_${settings?.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
      const response = await fetch(`${GROUPBY_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data, filename }),
      });
      let payload: any = {};
      try {
        payload = await response.json();
      } catch {}
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      await resolveTaskResponse(payload);
      setSaveSuccess(true);
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
      setShowSaveModal(false);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to save DataFrame';
      setSaveError(msg);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  const addGroupByLevel = () => {
    // Add logic to add new group by level
  };

  const removeIdentifier = (id: string) => {
    const newIds = selectedIdentifiers.filter((i: string) => i !== id);
    updateSettings(atomId, { selectedIdentifiers: newIds });
  };

  const removeSelectedMeasure = (index: number) => {
    const newMeasures = selectedMeasures.filter((_: any, i: number) => i !== index);
    updateSettings(atomId, { selectedMeasures: newMeasures });
  };

  const addMeasure = () => {
    const newMeasures = [...selectedMeasures, { field: '', aggregator: 'sum', weight_by: '', rename_to: '' }];
    updateSettings(atomId, { selectedMeasures: newMeasures });
  };

  const updateMeasure = (index: number, field: 'field' | 'aggregator' | 'weight_by' | 'rename_to', value: string) => {
    const newMeasures = selectedMeasures.map((measure: any, i: number) => (
      i === index ? { ...measure, [field]: value } : measure
    ));
    updateSettings(atomId, { selectedMeasures: newMeasures });
  };

  // Aggregation methods selected in settings (add this logic)
  const aggregationOptions = [
    'Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'
  ];
  const selectedAggregationMethods = Array.isArray(settings.selectedAggregationMethods) && settings.selectedAggregationMethods.length > 0
    ? settings.selectedAggregationMethods
    : aggregationOptions;

  // Fallback logic for measures
  const fallbackMeasures = measures.length === 0
    ? (settings.allColumns || []).filter((c: any) => c.data_type && (
        c.data_type.toLowerCase().includes('int') ||
        c.data_type.toLowerCase().includes('float') ||
        c.data_type.toLowerCase().includes('number')
      )).map((c: any) => c.column)
    : measures;

  // Use only selected measures from settings for the Field dropdown
  const selectedMeasureNames = Array.isArray(settings.selectedMeasureNames)
    ? settings.selectedMeasureNames
    : (
        // If settings.selectedMeasures present use them
        (Array.isArray(settings.selectedMeasures) && settings.selectedMeasures.length > 0)
          ? (
              typeof settings.selectedMeasures[0] === 'string'
                ? settings.selectedMeasures as string[]
                : settings.selectedMeasures.map((m: any) => m.field).filter(Boolean)
            )
          // else return empty array - no automatic measure selection
          : []
      );
  // Build numeric columns list directly from allColumns for comprehensive options
  const numericColumns = (settings.allColumns || []).filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('int') ||
      c.data_type.toLowerCase().includes('float') ||
      c.data_type.toLowerCase().includes('number')
    )
  ).map((c: any) => c.column);

  // Debug: Log numeric columns for Weight By dropdown
  console.log('🔍 Debug - Weight By numericColumns:', {
    allColumns: settings.allColumns?.length || 0,
    numericColumns: numericColumns,
    hasWeightedMean: hasWeightedMean
  });

  // Legacy cardinality fetch removed - now using DataSummaryView

  // ------------------------------------------------------------
  // Initialize measures only (no automatic selectedMeasureNames)
  React.useEffect(() => {
    if (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) {
      const numericCols = settings.allColumns
        .filter((c: any) => c.data_type && (
          c.data_type.toLowerCase().includes('int') ||
          c.data_type.toLowerCase().includes('float') ||
          c.data_type.toLowerCase().includes('number')
        ))
        .map((c: any) => c.column);

      // Initialize measures only if not already set
      if ((measures.length === 0) && numericCols.length > 0) {
        updateSettings(atomId, {
          measures: numericCols,
        });
      }
    }
  }, [settings.allColumns]);
  // Field dropdown options: use measures selected in settings tab
  const fieldOptions = Array.isArray(settings.selectedMeasureNames) && settings.selectedMeasureNames.length > 0 
    ? settings.selectedMeasureNames 
    : fallbackMeasures;

  // Initialize results from global store
  const [results, setResults] = useState<any[]>(() => {
    return settings.groupbyResults?.unsaved_data || [];
  });
  const [resultsHeaders, setResultsHeaders] = useState<string[]>(() => {
    return settings.groupbyResults?.unsaved_data?.length > 0 
      ? Object.keys(settings.groupbyResults.unsaved_data[0] || {})
      : [];
  });
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Sync with global store changes
  React.useEffect(() => {
    if (settings.groupbyResults?.unsaved_data) {
      setResults(settings.groupbyResults.unsaved_data);
      setAllResults(settings.groupbyResults.unsaved_data);
      setTotalRows(settings.groupbyResults.unsaved_data.length);
      if (settings.groupbyResults.unsaved_data.length > 0) {
        setResultsHeaders(Object.keys(settings.groupbyResults.unsaved_data[0] || {}));
      }
    }
  }, [settings.groupbyResults?.unsaved_data]);

  // Legacy cardinality view state and functions removed - now using DataSummaryView

  // Handler for Perform button
  const handlePerform = async () => {
    setResultsLoading(true);
    setResultsError(null);
    try {
      // Collect identifiers, measures, aggregations, and measure config
      const identifiers = selectedIdentifiers.map((id: string) => normalizeColumnName(id)).filter(Boolean);
      // Build aggregations object from measure config
      const aggregations: Record<string, any> = {};
      // Prepare for rename validation
    const existingColsLower = new Set(
      (settings.allColumns || []).map((c: any) => (c.column || '').toLowerCase())
    );
    const renameSeen = new Set<string>();

    selectedMeasures.forEach((measure: any) => {
        if (typeof measure === 'string') {
          const normalizedField = normalizeColumnName(measure);
          if (!normalizedField) {
            return;
          }
          // If selectedMeasures is just strings, use default aggregator
          aggregations[normalizedField] = { agg: (selectedAggregationMethods[0] || 'sum').toLowerCase() };
        } else if (measure.field && measure.aggregator) {
          // Map aggregator names to backend-friendly keys
          const aggRaw = (measure.aggregator || '').toLowerCase();
          let aggKey = aggRaw;
          if (aggRaw === 'weighted mean') aggKey = 'weighted_mean';
          if (aggRaw === 'rank percentile') aggKey = 'rank_pct';

          const normalizedField = normalizeColumnName(measure.field);
          if (!normalizedField) {
            return;
          }

          const aggObj: any = { agg: aggKey };
          // Validate rename uniqueness
           if (measure.rename_to && measure.rename_to.trim()) {
             const renameLower = measure.rename_to.trim().toLowerCase();
             if (renameSeen.has(renameLower) || existingColsLower.has(renameLower)) {
               toast({
                 title: 'Invalid rename',
                 description: `Column name '${measure.rename_to}' is already used. Choose a unique name.`,
                 variant: 'destructive',
               });
               setResultsLoading(false);
               throw new Error(`Duplicate or existing column name: ${measure.rename_to}`);
             }
             renameSeen.add(renameLower);
             aggObj.rename_to = measure.rename_to.trim();
           }
          if (aggKey === 'weighted_mean') {
            aggObj.weight_by = normalizeColumnName(measure.weight_by);
          }
          aggregations[normalizedField] = aggObj;
        }
      });
      // Fallback: if no measure config, use all selected measures with default aggregator
      if (Object.keys(aggregations).length === 0 && Array.isArray(selectedMeasures)) {
        selectedMeasures.forEach((m: any) => {
          const field = typeof m === 'string' ? m : m.field;
          aggregations[field] = { agg: (selectedAggregationMethods[0] || 'sum').toLowerCase() };
        });
      }
      
      console.log('🚀 GroupBy Perform - Sending data:', {
        identifiers,
        aggregations,
        dataSource: settings.dataSource,
        validator_atom_id: atomId
      });
      
      // Prepare form data
      const formData = new FormData();
      formData.append('validator_atom_id', atomId);
      formData.append('file_key', settings.dataSource || '');
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', settings.dataSource || '');
      formData.append('identifiers', JSON.stringify(identifiers));
      formData.append('aggregations', JSON.stringify(aggregations));
      
      console.log('📤 Calling GroupBy backend:', `${GROUPBY_API}/run`);
      
      const res = await fetch(`${GROUPBY_API}/run`, { method: 'POST', body: formData });
      let payload: any = {};
      try {
        payload = await res.json();
      } catch {}

      console.log('📥 GroupBy backend response:', payload);

      if (!res.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : res.statusText;
        throw new Error(detail || 'GroupBy run failed');
      }

      const data = (await resolveTaskResponse(payload)) || {};
      
      if (data.status === 'SUCCESS' && data.result_file) {
        // 🔧 CRITICAL FIX: Use the data returned directly from /run endpoint
        // The backend already returns the grouped results, no need to call /results
        
        // Check if we have results data directly
        if (data.results && Array.isArray(data.results)) {
          // Backend returned results directly
          const allRows = data.results;
          setTotalRows(allRows.length);
          setAllResults(allRows);
          setResults(allRows);
          updateSettings(atomId, { currentPage: 1 }); // Reset to first page when new data is loaded
          
          // Determine identifiers that have >1 unique value
          const idWithVariety = selectedIdentifiers.filter((id: string) => {
            const uniq = new Set(allRows.map((r: any) => r[id])).size;
            return uniq > 1;
          });
          
          const headers = Object.keys(allRows[0]).filter((h) => {
            if (selectedIdentifiers.includes(h)) {
              return idWithVariety.includes(h);
            }
            return true; // keep measure columns
          });
          
          setResultsHeaders(headers);
          
          // Persist result metadata and data
          updateSettings(atomId, {
            groupbyResults: {
              result_file: data.result_file,
              result_shape: [allRows.length, headers.length],
              row_count: data.row_count,
              columns: data.columns,
              unsaved_data: allRows
            },
          });
          
          toast({
            title: 'Success',
            description: `GroupBy completed! ${allRows.length} rows processed.`,
          });
          
        } else {
          // Fallback: try to fetch results from the saved file
          console.log('🔄 No direct results, trying to fetch from saved file...');
          
          // Try to get results from the cached_dataframe endpoint
          try {
            const totalRows = typeof data.row_count === 'number' ? data.row_count : 1000;
            const pageSize = Math.min(Math.max(totalRows, 50), 1000);
            const cachedUrl = `${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(
              data.result_file
            )}&page=1&page_size=${pageSize}`;
            const cachedRes = await fetch(cachedUrl);
            let cachedPayload: any = {};
            try {
              cachedPayload = await cachedRes.json();
            } catch {}
            if (cachedRes.ok) {
              const cachedData = (await resolveTaskResponse(cachedPayload)) || {};
              const csvText = String(cachedData?.data ?? '');
              // Parse CSV to get results
              const lines = csvText.split('\n');
              if (lines.length <= 1) {
                throw new Error('No data rows found in CSV');
              }

              const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
              const rows = lines
                .slice(1)
                .filter(line => line.trim())
                .map(line => {
                  const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                  const row: any = {};
                  headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                  });
                  return row;
                });
              
              setTotalRows(rows.length);
              setAllResults(rows);
              setResults(rows);
              updateSettings(atomId, { currentPage: 1 }); // Reset to first page when new data is loaded
              setResultsHeaders(headers);
              
              updateSettings(atomId, {
                groupbyResults: {
                  result_file: data.result_file,
                  result_shape: [rows.length, headers.length],
                  row_count: data.row_count,
                  columns: data.columns,
                  unsaved_data: rows
                },
              });
              
              toast({
                title: 'Success',
                description: `GroupBy completed! ${rows.length} rows processed.`,
              });
            } else {
              const detail = typeof cachedPayload?.detail === 'string' ? cachedPayload.detail : undefined;
              throw new Error(detail || 'Failed to fetch cached results');
            }
          } catch (fetchError) {
            console.error('❌ Error fetching cached results:', fetchError);
            // Still mark as successful since the operation completed
            updateSettings(atomId, {
              groupbyResults: {
                result_file: data.result_file,
                result_shape: [0, 0],
                row_count: data.row_count,
                columns: data.columns
              },
            });
            
            toast({
              title: 'Partial Success',
              description: 'GroupBy operation completed, but results display failed. Check the saved file.',
            });
          }
        }
      } else {
        setResultsError(data.error || 'GroupBy failed');
        setResults([]);
        setResultsHeaders([]);
        
        toast({
          title: 'Error',
          description: data.error || 'GroupBy operation failed',
          variant: 'destructive',
        });
      }
      setResultsLoading(false);
    } catch (e: any) {
      console.error('❌ GroupBy Perform Error:', e);
      setResultsError(e.message || 'Error performing groupby');
      setResults([]);
      setResultsHeaders([]);
      setResultsLoading(false);
      
      toast({
        title: 'Error',
        description: e.message || 'Error performing groupby',
        variant: 'destructive',
      });
    }
  };

  // Filtering and pagination functions for results
  const allFilteredData = useMemo(() => {
    if (!allResults.length) return [];
    
    let filtered = [...allResults];
    
    // Apply column filters
    Object.entries(resultsColumnFilters).forEach(([column, filterValues]) => {
      if (filterValues && filterValues.length > 0) {
        filtered = filtered.filter(row => 
          filterValues.includes(String(row[column] || ''))
        );
      }
    });
    
    // Apply sorting
    if (resultsSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[resultsSortColumn];
        const bVal = b[resultsSortColumn];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return resultsSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return resultsSortDirection === 'asc' ? -1 : 1;
        
        // Handle numeric values
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return resultsSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // Handle string values
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return resultsSortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }
    
    return filtered;
  }, [allResults, resultsColumnFilters, resultsSortColumn, resultsSortDirection]);

  // Get current page data from filtered results
  const displayedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allFilteredData.slice(startIndex, endIndex);
  }, [allFilteredData, currentPage, pageSize]);

  const totalPages = Math.ceil(allFilteredData.length / pageSize);

  const handlePageChange = (page: number) => {
    updateSettings(atomId, { currentPage: page });
  };

  const handleResultsSort = (column: string, direction?: 'asc' | 'desc') => {
    if (resultsSortColumn === column) {
      if (resultsSortDirection === 'asc') {
        updateSettings(atomId, { resultsSortDirection: 'desc' });
      } else if (resultsSortDirection === 'desc') {
        updateSettings(atomId, { resultsSortColumn: '', resultsSortDirection: 'asc' });
      }
    } else {
      updateSettings(atomId, { resultsSortColumn: column, resultsSortDirection: direction || 'asc' });
    }
  };

  const handleResultsColumnFilter = (column: string, values: string[]) => {
    updateSettings(atomId, {
      resultsColumnFilters: {
        ...resultsColumnFilters,
        [column]: values
      }
    });
  };

  const clearResultsColumnFilter = (column: string) => {
    const newFilters = { ...resultsColumnFilters };
    delete newFilters[column];
    updateSettings(atomId, { resultsColumnFilters: newFilters });
  };

  const getResultsUniqueColumnValues = (column: string): string[] => {
    if (!allResults.length) return [];

    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(resultsColumnFilters).filter(([key]) => key !== column);
    let dataToUse = allResults;

    if (otherFilters.length > 0) {
      dataToUse = allResults.filter(item => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(item[filterColumn] || '');
          return filterValues.includes(cellValue);
        });
      });
    }

    const values = dataToUse.map(item => String(item[column] || ''));
    const uniqueValues = Array.from(new Set(values));
    return uniqueValues.sort() as string[];
  };

  const ResultsFilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getResultsUniqueColumnValues(column);
    const current = resultsColumnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => {
      handleResultsColumnFilter(column, temp);
      updateSettings(atomId, { currentPage: 1 }); // Reset to first page when filtering
    };

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Show placeholder when no data source is selected
  if (!settings.dataSource) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-green-50/30 to-green-50/50 overflow-y-auto relative">
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <BarChart className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
              GroupBy Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a data source from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Get showDataSummary setting from global store
  const showDataSummary = settings.showDataSummary || false;

  return (
    <div className="p-2 space-y-2 h-full overflow-auto bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Data Summary - Unified component with metadata support */}
      {settings.dataSource && showDataSummary && (
        <div className="border-b border-slate-200 px-5 py-4">
          <DataSummaryView
            objectName={settings.dataSource}
            atomId={atomId}
            title="Data Summary"
            subtitle="Data in detail"
            subtitleClickable={!!settings.dataSource}
            onSubtitleClick={handleViewDataClick}
          />
                  </div>
      )}
      
      {/* Group By Section */}
      <Card className="hidden shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center space-x-2">
            <Settings2 className="h-5 w-5 text-green-500" />
            <span className="font-semibold text-base">Group By Configuration</span>
          </div>
          <button
            className="p-1 rounded hover:bg-green-100 transition-colors"
            onClick={() => updateSettings(atomId, { configCollapsed: !configCollapsed })}
            aria-label={configCollapsed ? 'Expand configuration' : 'Collapse configuration'}
          >
            {configCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
        {/* Configuration content */}
        {!configCollapsed && (
        <CardContent className="p-6 space-y-6">
          {/* Level Header and Row (only once) */}
          <div className="hidden bg-emerald-50 rounded-lg p-3 shadow-sm">
            <div className="flex flex-wrap gap-1 items-center">
              <div className="font-semibold text-green-600 mr-2 text-sm">Level:</div>
               {selectedIdentifiers.map((identifier: string) => (
                <div key={identifier} className="flex items-center gap-1 text-xs font-medium text-green-700 bg-gradient-to-r from-blue-50 to-indigo-50 px-2 py-1 rounded-full border border-blue-200 shadow-sm">
                <span>{identifier}</span>
                <button
                  className="text-slate-500 hover:text-red-600 focus:outline-none"
                  onClick={() => removeIdentifier(identifier)}
                  aria-label="Remove identifier"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
               ))}
               {/* Add Identifier Button / Selector */}
               {addingIdentifier ? (
                 <Select onValueChange={handleAddIdentifier} value="">
                   <SelectTrigger className="w-40 bg-white text-xs">
                     <SelectValue placeholder="Select identifier" />
                   </SelectTrigger>
                   <SelectContent className="max-h-48 overflow-auto">
                     {availableIdentifiers.map(id => (
                       <SelectItem key={id} value={id} className="text-xs">{id}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               ) : (
                 <Button variant="ghost" size="sm" className="text-green-700 hover:bg-green-100" onClick={() => setAddingIdentifier(true)}>
                   <Plus className="h-4 w-4" />
                 </Button>
               )}
             </div>
           </div>
          {/* Field and Aggregator Selectors */}
          <div className="space-y-4 pt-4 border-t border-slate-200">
            <h3 className="font-semibold text-slate-700 flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Measure Configuration
            </h3>
            {selectedMeasures.map((measure: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4 p-2 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="w-44">
                  <label className={`text-sm font-semibold mb-2 block text-green-700 ${index !== 0 ? 'sr-only' : ''}`}>Field</label>
                  <Select value={measure.field} onValueChange={(value) => updateMeasure(index, 'field', value)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                       {fieldOptions
                         .filter((col: string) => {
                           return !selectedMeasures.some((m: any, i2: number) => i2 !== index && m.field === col);
                         })
                         .map((col: string) => (
                           <SelectItem key={col} value={col}>{col}</SelectItem>
                         ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Placeholder heading for Weight By in first row */}
                {index === 0 && hasWeightedMean && measure.aggregator !== 'Weighted Mean' && (
                  <div className="w-44"></div>
                )}
                {measure.aggregator === 'Weighted Mean' && (
                  <div className="w-44">
                    <label className={`text-sm font-semibold mb-2 block text-green-700 ${(index !== 0) ? 'sr-only' : ''}`}>Weight By</label>
                    <Select value={measure.weight_by || ''} onValueChange={(value) => updateMeasure(index, 'weight_by', value)}>
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select weight column" />
                      </SelectTrigger>
                      <SelectContent>
                        {numericColumns.length > 0 ? (
                          numericColumns.map((col: string) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))
                        ) : (
                          <div className="p-2 text-sm text-gray-500">No numeric columns available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="w-44 ml-auto">
                  <label className={`text-sm font-semibold mb-2 block text-green-700 ${index !== 0 ? 'sr-only' : ''}`}>Aggregator</label>
                  <Select value={measure.aggregator} onValueChange={(value) => updateMeasure(index, 'aggregator', value)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select aggregation" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAggregationMethods.map((agg: string) => (
                        <SelectItem key={agg} value={agg}>{agg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* Rename To input */}
                <div className="w-44">
                  <label className={`text-sm font-semibold mb-2 block text-green-700 ${index !== 0 ? 'sr-only' : ''}`}>Rename To</label>
                  <Input
                    placeholder="New name"
                    value={measure.rename_to || ''}
                    onChange={(e) => updateMeasure(index, 'rename_to', e.target.value)}
                    className="bg-white"
                  />
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => removeSelectedMeasure(index)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={addMeasure}
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Measure
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handlePerform}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Perform
              </Button>
            </div>
          </div>
        </CardContent>
        )}
      </Card>
      
      {/* Group By Results */}
      {resultsLoading ? (
        <div className="p-4 text-blue-600">Loading results...</div>
      ) : resultsError ? (
        <div className="p-4 text-red-600">{resultsError}</div>
      ) : results && results.length > 0 ? (
        <div className="mt-0">
          <Table
            headers={resultsHeaders.map((header, index) => (
              <ContextMenu key={header}>
                <ContextMenuTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    {header}
                    {resultsSortColumn === header && (
                      resultsSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <ArrowUp className="w-4 h-4 mr-2" /> Sort
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                      <ContextMenuItem onClick={() => handleResultsSort(header, 'asc')}>
                        <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => handleResultsSort(header, 'desc')}>
                        <ArrowDown className="w-4 h-4 mr-2" /> Descending
                      </ContextMenuItem>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  <ContextMenuSeparator />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="flex items-center">
                      <FilterIcon className="w-4 h-4 mr-2" /> Filter
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                      <ResultsFilterMenu column={header} />
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                  {resultsColumnFilters[header]?.length > 0 && (
                    <>
                      <ContextMenuSeparator />
                      <ContextMenuItem onClick={() => clearResultsColumnFilter(header)}>
                        Clear Filter
                      </ContextMenuItem>
                    </>
                  )}
                </ContextMenuContent>
              </ContextMenu>
            ))}
            colClasses={resultsHeaders.map(() => "w-auto")}
            bodyClassName="max-h-[300px] overflow-y-auto"
            borderColor={`border-${groupbyWtgAvg.color.replace('bg-', '')}`}
            customHeader={{
              title: "Results",
              controls: (
                <div className="flex items-center gap-2">
                  <span className="inline-block bg-green-50 border border-green-200 text-green-700 text-xs font-semibold px-2 py-0.5 rounded">
                    {allFilteredData.length.toLocaleString()} rows • {resultsHeaders.length} columns
                  </span>
                  <Button
                    onClick={handleSaveDataFrame}
                    disabled={saveLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-7 px-3"
                  >
                    {saveLoading ? 'Saving...' : 'Save As'}
                  </Button>
                  {saveError && <span className="text-red-600 text-xs">{saveError}</span>}
                  {saveSuccess && <span className="text-green-600 text-xs">Saved!</span>}
                </div>
              )
            }}
          >
            {displayedData.map((row, rowIndex) => (
              <tr key={rowIndex} className="table-row">
                {resultsHeaders.map((header, colIndex) => (
                  <td key={colIndex} className="table-cell font-medium text-gray-700">
                    {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                      typeof row[header] === 'number' ? row[header] : String(row[header])
                    ) : (
                      <span className="italic text-gray-500">null</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <Card className="mt-2">
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-600">
                    Page {currentPage} of {totalPages}
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                          className={`cursor-pointer text-xs h-7 ${currentPage === 1 ? 'pointer-events-none opacity-50' : ''}`}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => handlePageChange(pageNum)}
                              isActive={currentPage === pageNum}
                              className="cursor-pointer text-xs h-7 w-7"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                          className={`cursor-pointer text-xs h-7 ${currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}`}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="p-4 text-gray-500">No results to display. Please Configure GroupBy options.</div>
      )}

      {/* Save DataFrame Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveFileName.trim()) {
                  confirmSaveDataFrame();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveModal(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveDataFrame}
              disabled={saveLoading || !saveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupByCanvas;