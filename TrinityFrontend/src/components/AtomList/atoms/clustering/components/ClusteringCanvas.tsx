import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Filter as FilterIcon, Target, BarChart3, Settings, Play, X, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { ClusteringSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { FEATURE_OVERVIEW_API, CLUSTERING_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import ClusteringCardinalityView from './ClusteringCardinalityView';
import Table from '@/templates/tables/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ClusteringCanvasProps {
  atomId: string;
  settings: ClusteringSettings;
  onSettingsChange: (settings: Partial<ClusteringSettings>) => void;
}

const ClusteringCanvas: React.FC<ClusteringCanvasProps> = ({
  atomId,
  settings,
  onSettingsChange
}) => {
  // Get updateSettings function from the store
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Safely access clustering data with defaults
  const clusteringData = settings.clusteringData || {
    selectedIdentifiers: [],
    availableIdentifiers: [],
    selectedMeasures: [],
    availableMeasures: [],
    selectedDataFile: '',
    objectName: '',
    allColumns: [],
    dateRange: undefined,
    clusterResults: null,
    isRunning: false
  };

  // Get selected identifiers and measures from the store directly
  const selectedIdentifiers = clusteringData.selectedIdentifiers || [];
  const selectedMeasures = clusteringData.selectedMeasures || [];
  const clusterResults = clusteringData.clusterResults;
  
  // Get the measures that were actually used in the clustering run
  const getActualMeasuresFromResults = () => {
    if (!clusterResults?.cluster_stats || !Array.isArray(clusterResults.cluster_stats) || clusterResults.cluster_stats.length === 0) {
      return [];
    }
    
    // Get the first cluster stat to see what measures are available
    const firstStat = clusterResults.cluster_stats[0];
    if (!firstStat?.centroid) {
      return [];
    }
    
    // Return the actual measure names from the centroid data
    return Object.keys(firstStat.centroid);
  };
  
  // Use actual measures from results if available, otherwise use selected measures
  const displayMeasures = clusterResults ? getActualMeasuresFromResults() : selectedMeasures;
  
  // Initialize identifierFilters state properly
  const [identifierFilters, setIdentifierFilters] = useState<Record<string, string[]>>({});
  const [uniqueValues, setUniqueValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({});
  const [clusteringError, setClusteringError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Use ref to track which identifiers have been fetched to prevent infinite loops
  const fetchedIdentifiers = useRef<Set<string>>(new Set());

  // State for Full Output Data filtering and sorting
  const [outputDataSortColumn, setOutputDataSortColumn] = useState<string>('');
  const [outputDataSortDirection, setOutputDataSortDirection] = useState<'asc' | 'desc'>('asc');
  const [outputDataColumnFilters, setOutputDataColumnFilters] = useState<Record<string, string[]>>({});

  // Initialize filters when selectedIdentifiers change
  useEffect(() => {
    setIdentifierFilters(prev => {
      const newFilters: Record<string, string[]> = {};
      
      // Only keep filters for currently selected identifiers
      selectedIdentifiers.forEach(identifier => {
        if (identifier in prev) {
          // Keep existing filter values for this identifier
          newFilters[identifier] = prev[identifier];
        } else {
          // Initialize new identifier with empty filters
          newFilters[identifier] = [];
        }
      });
      
      
      return newFilters;
    });
  }, [selectedIdentifiers]);

  // Fetch unique values for identifiers when they change
  useEffect(() => {
    if (!clusteringData.objectName || selectedIdentifiers.length === 0) return;

    selectedIdentifiers.forEach(async (identifier) => {
      // Use ref to check if already fetched to prevent infinite loops
      if (fetchedIdentifiers.current.has(identifier)) return;
      
      setLoadingValues(prev => ({ ...prev, [identifier]: true }));
      
      try {
        const response = await fetch(`${CLUSTERING_API}/unique_values?object_name=${encodeURIComponent(clusteringData.objectName)}&column_name=${encodeURIComponent(identifier)}`);
        
        if (response.ok) {
          const data = await response.json();
          const values = Array.isArray(data.unique_values) ? data.unique_values : [];
          
          setUniqueValues(prev => ({ ...prev, [identifier]: values }));
          // Mark as fetched
          fetchedIdentifiers.current.add(identifier);
        } else {
          setUniqueValues(prev => ({ ...prev, [identifier]: [] }));
          // Mark as fetched even if failed to prevent retries
          fetchedIdentifiers.current.add(identifier);
        }
      } catch (error) {
        setUniqueValues(prev => ({ ...prev, [identifier]: [] }));
        // Mark as fetched even if failed to prevent retries
        fetchedIdentifiers.current.add(identifier);
      } finally {
        setLoadingValues(prev => ({ ...prev, [identifier]: false }));
      }
    });
  }, [selectedIdentifiers, clusteringData.objectName]);

  // Clean up uniqueValues and loadingValues when identifiers are deselected
  useEffect(() => {
    
    // Clean up the fetched identifiers ref
    const currentIdentifiers = new Set(selectedIdentifiers);
    const newFetchedIdentifiers = new Set<string>();
    fetchedIdentifiers.current.forEach(identifier => {
      if (currentIdentifiers.has(identifier)) {
        newFetchedIdentifiers.add(identifier);
      }
    });
    fetchedIdentifiers.current = newFetchedIdentifiers;
    
    setUniqueValues(prev => {
      const newUniqueValues: Record<string, string[]> = {};
      selectedIdentifiers.forEach(identifier => {
        if (identifier in prev) {
          newUniqueValues[identifier] = prev[identifier];
        }
      });
      return newUniqueValues;
    });

    setLoadingValues(prev => {
      const newLoadingValues: Record<string, boolean> = {};
      selectedIdentifiers.forEach(identifier => {
        if (identifier in prev) {
          newLoadingValues[identifier] = prev[identifier];
        }
      });
      return newLoadingValues;
    });
  }, [selectedIdentifiers]);

  // Simple API health check
  const checkClusteringAPIHealth = async () => {
    try {
      const response = await fetch(`${CLUSTERING_API}/debug-columns?object_name=test`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  };

  const handleRun = async () => {
    if (!clusteringData.objectName || !clusteringData.selectedDataFile) {
      return;
    }

    // Set running state
    onSettingsChange({
      clusteringData: {
        ...clusteringData,
        isRunning: true
      }
    });

    // Clear any previous errors
    setClusteringError(null);

    try {
      // Check API health first
      const apiHealthy = await checkClusteringAPIHealth();
      if (!apiHealthy) {
        throw new Error('Clustering API is not reachable. Please check if the backend is running.');
      }

      // Prepare identifier filters
      const identifierFiltersList = Object.entries(identifierFilters).map(([column, values]) => ({
        column,
        values: Array.isArray(values) ? values : []
      })).filter(filter => Array.isArray(filter.values) && filter.values.length > 0);

      // Prepare clustering request
      const clusteringRequest = {
        file_path: clusteringData.objectName,
        identifier_columns: selectedIdentifiers,
        measure_columns: selectedMeasures,
        identifier_filters: identifierFiltersList.length > 0 ? identifierFiltersList : undefined,
        algorithm: clusteringData.algorithm || 'kmeans',
        
        // K-selection method and parameters
        k_selection: clusteringData.k_selection || 'elbow',
        
        // Conditional parameters based on K-selection method
        ...(clusteringData.k_selection === 'manual' ? {
          n_clusters: clusteringData.n_clusters || 3
        } : {
          k_min: clusteringData.k_min || 2,
          k_max: clusteringData.k_max || 10,
          ...(clusteringData.k_selection === 'gap' && {
            gap_b: clusteringData.gap_b || 10
          })
        }),
        
        // Algorithm-specific parameters
        eps: clusteringData.eps || 0.5,
        min_samples: clusteringData.min_samples || 5,
        linkage: clusteringData.linkage || 'ward',
        threshold: clusteringData.threshold || 0.5,
        
        // Date range filter
        ...(clusteringData.dateRange?.column && clusteringData.dateRange?.fromDate && clusteringData.dateRange?.toDate && {
          date_range: {
            column: clusteringData.dateRange.column,
            from_date: clusteringData.dateRange.fromDate,
            to_date: clusteringData.dateRange.toDate
          }
        }),
        
        // Options
        include_preview: true,
        preview_limit: 10
      };


      // Call clustering API
      
      try {
        const response = await fetch(`${CLUSTERING_API}/filter-and-cluster`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(clusteringRequest),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Clustering failed: ${response.status} ${response.statusText} - ${errorText}`);
        }

                 const result = await response.json();
         

        // Update settings with results
        onSettingsChange({
          clusteringData: {
            ...clusteringData,
            clusterResults: result,
            isRunning: false
          }
        });

      } catch (fetchError) {
        
        throw fetchError;
      }

    } catch (error) {
      
      // Set error message for user
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during clustering';
      setClusteringError(errorMessage);
      
      // Reset running state on error
      onSettingsChange({
        clusteringData: {
          ...clusteringData,
        isRunning: false 
        }
      });
    }
  };

  const handleIdentifierFilterChange = (identifier: string, values: string[]) => {
    setIdentifierFilters(prev => ({
      ...prev,
      [identifier]: values
    }));
  };

  const handleSelectAllValues = (identifier: string) => {
    const allValues = uniqueValues[identifier] || [];
    handleIdentifierFilterChange(identifier, allValues);
  };

  const handleClearAllValues = (identifier: string) => {
    handleIdentifierFilterChange(identifier, []);
  };

  // Filter identifiers to only show those with unique values > 1
  const filteredIdentifiers = (clusteringData.availableIdentifiers || []).filter(identifier => {
    const count = uniqueValues[identifier]?.length || 0;
    return count > 1;
  });

  // Functions for Full Output Data sorting and filtering
  const handleOutputDataSort = (column: string, direction?: 'asc' | 'desc') => {
    if (outputDataSortColumn === column) {
      if (outputDataSortDirection === 'asc') {
        setOutputDataSortDirection('desc');
      } else if (outputDataSortDirection === 'desc') {
        setOutputDataSortColumn('');
        setOutputDataSortDirection('asc');
      }
    } else {
      setOutputDataSortColumn(column);
      setOutputDataSortDirection(direction || 'asc');
    }
  };

  const handleOutputDataColumnFilter = (column: string, values: string[]) => {
    setOutputDataColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearOutputDataColumnFilter = (column: string) => {
    setOutputDataColumnFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
  };

  const getOutputDataUniqueColumnValues = (column: string, data: any[]): string[] => {
    if (!Array.isArray(data)) return [];
    
    // Get the currently filtered data (before applying the current column's filter)
    let filteredData = data;

    // Apply all other column filters except the current one
    Object.entries(outputDataColumnFilters).forEach(([col, filterValues]) => {
      if (col !== column && filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[col] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Get unique values from the filtered data
    const values = filteredData.map(row => String(row[column] || '')).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  // FilterMenu component for output data filtering
  const OutputDataFilterMenu = ({ column, data }: { column: string; data: any[] }) => {
    const uniqueValues = getOutputDataUniqueColumnValues(column, data);
    const current = outputDataColumnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handleOutputDataColumnFilter(column, temp);

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

  // Computed filtered and sorted output data
  const displayedOutputData = useMemo(() => {
    if (!clusterResults?.output_data || !Array.isArray(clusterResults.output_data)) return [];
    
    let filtered = [...clusterResults.output_data];

    // Apply column filters
    Object.entries(outputDataColumnFilters).forEach(([column, filterValues]) => {
      if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => {
          const cellValue = String(row[column] || '');
          return filterValues.includes(cellValue);
        });
      }
    });

    // Apply sorting
    if (outputDataSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[outputDataSortColumn];
        const bVal = b[outputDataSortColumn];
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return outputDataSortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [clusterResults?.output_data, outputDataColumnFilters, outputDataSortColumn, outputDataSortDirection]);

  // Export functions (assuming these are defined elsewhere or will be added)


  const exportFromBackend = async (filePath: string, format: 'csv' | 'excel') => {
    try {
      const endpoint = format === 'csv' ? '/export_csv' : '/export_excel';
      const url = `${CLUSTERING_API}${endpoint}?object_name=${encodeURIComponent(filePath)}`;
      
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to export ${format.toUpperCase()}: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = `${filePath.split('/').pop()?.replace('.arrow', '') || 'clustering_result'}.${format === 'csv' ? 'csv' : 'xlsx'}`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      
    } catch (error) {
      alert(`Failed to export ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveResultsToBackend = async (data: any[]) => {
    try {
      // Convert data to CSV string
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(key => {
            const value = row[key];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : String(value);
          }).join(',')
        )
      ].join('\n');

      const response = await fetch(`${CLUSTERING_API}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          csv_data: csvContent
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save results: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      // Store the output path in the clustering settings
      if (result.result_file) {
        updateSettings(atomId, {
          clusteringData: {
            ...clusteringData,
            outputPath: result.result_file,
            outputFilename: result.result_file.split('/').pop()?.replace('.arrow', '') || 'clustering_results'
          }
        });
      }
      
      toast({ 
        title: "DataFrame Saved Successfully",
        description: `Saved ${result.shape[0]} rows × ${result.shape[1]} columns`
      });
    } catch (error) {
      toast({
        title: "Error Saving DataFrame",
        description: error instanceof Error ? error.message : "Failed to save clustering results",
        variant: "destructive"
      });
    }
  };

  // Show placeholder when no data is loaded
  if (!clusteringData.objectName) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-orange-50/30 to-orange-50/50 overflow-y-auto relative">
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
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <Target className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
              Clustering Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a file from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cardinality View */}
      {clusteringData.objectName && (
        <ClusteringCardinalityView 
          objectName={clusteringData.objectName} 
          atomId={atomId} 
        />
      )}

             {/* Identifier Value Selectors - Only show identifiers with >1 unique value */}
              <Card className="p-2 border border-gray-200">
         <div className="mb-3">
                      <h3 className="text-base font-medium text-black">Identifier Filters</h3>
         </div>
         
                  {Array.isArray(filteredIdentifiers) && filteredIdentifiers.length > 0 ? (
            <div className="grid grid-cols-3 gap-4">
              {filteredIdentifiers.map((identifier) => (
                <div key={identifier} className="flex flex-col space-y-1">
                  {/* Identifier Name Label */}
                  <div className="text-xs font-medium text-black">
                    {capitalizeFirstLetter(identifier)}
                  </div>

            <Select
                  onValueChange={(value) => {
                    if (value === "All") {
                      handleIdentifierFilterChange(identifier, []);
                    }
                  }}
                >
                                                                           <SelectTrigger className="bg-white border border-gray-300 hover:border-gray-400 transition-colors w-full h-8 px-2">
                                                                                                                                                                         <span className="text-xs text-gray-700">
                         {identifierFilters[identifier]?.length === 0
                           ? "None"
                           : identifierFilters[identifier]?.length === uniqueValues[identifier]?.length
                           ? "All values"
                           : `${identifierFilters[identifier].length} selected`}
                       </span>
               </SelectTrigger>
                  <SelectContent className="w-64 max-h-80">
                    <div className="p-3 space-y-2">
                      <div className="text-sm font-medium text-gray-700 mb-3 border-b pb-2">
                        Select values for {capitalizeFirstLetter(identifier)}
                      </div>
                      
                      {/* Select All option */}
                      <div className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded cursor-pointer"
                           onClick={() => {
                             const allSelected = uniqueValues[identifier] && uniqueValues[identifier].length > 0 && identifierFilters[identifier] && identifierFilters[identifier].length === uniqueValues[identifier].length;
                             if (allSelected) {
                               handleClearAllValues(identifier);
                             } else {
                               handleSelectAllValues(identifier);
                             }
                           }}>
                        <input
                          type="checkbox"
                          checked={uniqueValues[identifier] && uniqueValues[identifier].length > 0 && identifierFilters[identifier] && identifierFilters[identifier].length === uniqueValues[identifier].length}
                          onChange={() => {
                            const allSelected = uniqueValues[identifier] && uniqueValues[identifier].length > 0 && identifierFilters[identifier] && identifierFilters[identifier].length === uniqueValues[identifier].length;
                            if (allSelected) {
                              handleClearAllValues(identifier);
                            } else {
                              handleSelectAllValues(identifier);
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium">
                          {uniqueValues[identifier] && uniqueValues[identifier].length > 0 && identifierFilters[identifier] && identifierFilters[identifier].length === uniqueValues[identifier].length 
                            ? 'Deselect All' 
                            : 'Select All'}
                        </span>
                      </div>
                      
                      <div className="border-t pt-2">
                        {/* Individual value options with checkboxes */}
                        {loadingValues[identifier] ? (
                          <div className="text-center py-4 text-gray-500">
                            <span className="text-xs">Loading values...</span>
                          </div>
                        ) : uniqueValues[identifier] && uniqueValues[identifier].length > 0 ? (
                          uniqueValues[identifier].map((value) => (
                            <div key={value} className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={identifierFilters[identifier]?.includes(value)}
                                onChange={() => handleIdentifierFilterChange(identifier, identifierFilters[identifier]?.includes(value) ? identifierFilters[identifier]?.filter(v => v !== value) : [...(identifierFilters[identifier] || []), value])}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs">{value}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-gray-500">
                            <span className="text-xs">No unique values found for {capitalizeFirstLetter(identifier)}.</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Clear All option - removed, now handled by Select All/Deselect All toggle */}
                    </div>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No identifiers with multiple values found. Please select the identifiers in the settings tab.
          </div>
        )}
      </Card>

             {/* Measures Section - Row format below identifiers */}
              <Card className="p-2 border border-gray-200">
         <div className="mb-3">
                      <h3 className="text-base font-medium text-black">Measures for Clustering</h3>
       </div>

                                    <div className="grid grid-cols-3 gap-4">
             {selectedMeasures.length > 0 ? (
               selectedMeasures.map((measure) => (
                 <div key={measure} className="flex flex-col space-y-1">
                   <div className="bg-white border border-gray-300 rounded-md p-1 text-left">
                     <span className="text-xs text-gray-700">
                       {capitalizeFirstLetter(measure)}
                     </span>
                   </div>
                 </div>
               ))
             ) : (
               <div className="col-span-3 text-center py-3 text-gray-500">
                 No measures selected. Please select measures in the Properties panel.
               </div>
             )}
           </div>
       </Card>

      <Separator />

      {/* Run Button - Right Side */}
      <div className="flex justify-end">
        <Button 
          onClick={handleRun}
          disabled={settings.clusteringData?.isRunning}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-6 py-2"
        >
          {settings.clusteringData?.isRunning ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Run
            </>
          )}
        </Button>
        </div>

      {/* Error Display */}
      {clusteringError && (
        <Card className="p-4 bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5">
              !
        </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 mb-1">Clustering Error</h4>
              <p className="text-sm text-red-700 mb-2">{clusteringError}</p>
              <div className="text-xs text-red-600 space-y-1">
                <p>• Check if the FastAPI backend is running</p>
                <p>• Verify the clustering API endpoint is accessible</p>
                <p>• Check browser console for detailed error information</p>
        </div>
          <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setClusteringError(null)}
                className="mt-2 text-red-600 border-red-300 hover:bg-red-100"
              >
                Dismiss Error
          </Button>
        </div>
      </div>
        </Card>
      )}

      {/* Visualization Area */}
             <Card className="p-6 border border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-gray-600" />
                     <h3 className="text-lg font-semibold text-black">Clustering Results</h3>
        </div>
        
                 <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          {clusterResults && typeof clusterResults === 'object' && 'cluster_stats' in clusterResults ? (
                          <div className="space-y-6">
              
              {/* Cluster Stats Table */}
              <div className="mt-6">
                                 <h4 className="text-lg font-semibold text-black mb-4">Cluster Statistics</h4>
                
                {/* Summary Cards */}
                                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                   <div className="bg-white p-2 rounded-lg border border-gray-200">
                     <div className="text-lg font-bold text-black">
                       {clusteringData.algorithm ? capitalizeFirstLetter(clusteringData.algorithm) : 'N/A'}
                     </div>
                     <div className="text-xs text-black">Clustering Method</div>
                   </div>
                   <div className="bg-white p-2 rounded-lg border border-gray-200">
                     <div className="text-lg font-bold text-black">
                       {clusteringData.algorithm === 'dbscan' ? 'N/A' : (clusteringData.k_selection ? clusteringData.k_selection.charAt(0).toUpperCase() + clusteringData.k_selection.slice(1) : 'N/A')}
                     </div>
                     <div className="text-xs text-black">
                       {clusteringData.algorithm === 'dbscan' ? 'Auto-clustering' : 'K-Selection Method'}
                     </div>
                   </div>
                   <div className="bg-white p-2 rounded-lg border border-gray-200">
                     <div className="text-lg font-bold text-black">
                       {clusterResults.n_clusters_found || (Array.isArray(clusterResults.cluster_stats) ? clusterResults.cluster_stats.length : 0)}
                     </div>
                     <div className="text-xs text-black">Total Clusters</div>
                   </div>
                   <div className="bg-white p-2 rounded-lg border border-gray-200">
                     <div className="text-lg font-bold text-black">
                       {Array.isArray(clusterResults.cluster_stats) ? clusterResults.cluster_stats.reduce((sum: number, stat: any) => sum + (stat.size || 0), 0) : 0}
                 </div>
                     <div className="text-xs text-black">Total Rows</div>
             </div>
           </div>
                                 {/* Detailed Cluster Table */}
                 <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                   <div className="max-h-96 overflow-y-auto">
                     <table className="min-w-full">
                       <thead className="bg-gray-50 sticky top-0">
                         <tr>
                           <th className="px-4 py-3 text-center text-sm font-medium text-black border-b border-r border-gray-300">Cluster ID</th>
                           <th className="px-4 py-3 text-center text-sm font-medium text-black border-b border-r border-gray-300">Size</th>
                           <th className="px-4 py-3 text-left text-sm font-medium text-black border-b" colSpan={displayMeasures.length || 1}>
                              Centroid Values
                            </th>
                          </tr>
                                                     {/* Sub-header row for measure names */}
                           <tr className="bg-gray-50">
                             <th className="px-4 py-2 text-center text-sm font-medium text-black border-r border-gray-300"></th>
                             <th className="px-4 py-2 text-center text-sm font-medium text-black border-r border-gray-300"></th>
                            {displayMeasures.length > 0 ? (
                              displayMeasures.map((measure, measureIndex) => (
                                <th key={measure} className="px-4 py-2 text-center text-sm font-medium text-black border-b border-gray-300">
                                  {capitalizeFirstLetter(measure)}
                                </th>
                              ))
                            ) : (
                              <th className="px-4 py-2 text-center text-sm font-medium text-black border-b border-gray-300">
                                Measures
                              </th>
                            )}
                          </tr>
                       </thead>
                       <tbody>
                         {clusterResults.cluster_stats && Array.isArray(clusterResults.cluster_stats) && clusterResults.cluster_stats.length > 0 ? (
                           clusterResults.cluster_stats.map((stat: any, index: number) => (
                             <tr key={index} className="hover:bg-gray-50 border-b border-gray-100">
                               <td className="px-4 py-3 text-sm text-black text-center border-r border-gray-300">
                                 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                   {stat.cluster_id !== undefined && stat.cluster_id !== null ? stat.cluster_id : index + 1}
                                 </span>
                               </td>
                               <td className="px-4 py-3 text-sm text-black text-center border-r border-gray-300">
                                 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                   {stat.size || 'N/A'}
                                 </span>
                               </td>
                                                                                               {/* Centroid Values as separate columns */}
                                 {displayMeasures.length > 0 ? (
                                   displayMeasures.map((measure, measureIndex) => (
                                     <td key={measure} className="px-4 py-3 text-sm text-black text-center border-gray-300">
                                       <span className="font-mono text-xs">
                                         {(() => {
                                           
                                           // Since we're using displayMeasures (actual measures from results), 
                                           // we can directly access the centroid value
                                           const value = stat.centroid?.[measure];
                                           
                                           if (value !== null && value !== undefined) {
                                             return typeof value === 'number' ? value.toFixed(3) : String(value);
                                           } else {
                                             return 'N/A';
                                           }
                                         })()}
                                       </span>
                                     </td>
                                   ))
                                 ) : (
                                   <td className="px-4 py-3 text-sm text-black text-center border-gray-300">
                                     <span className="text-gray-400">No measures</span>
                                   </td>
                                 )}
                             </tr>
                           ))
                         ) : (
                                                       <tr>
                              <td colSpan={displayMeasures.length > 0 ? displayMeasures.length + 2 : 3} className="px-4 py-8 text-center text-gray-500">
                                No cluster statistics available
                              </td>
                            </tr>
                         )}
                       </tbody>
                     </table>
                   </div>
                 </div>
                {/* Full Output Data with Cluster IDs */}
                {clusterResults.output_data && Array.isArray(clusterResults.output_data) && clusterResults.output_data.length > 0 && (
                  <div className="mt-6">
                    <Table
                      headers={Object.keys(clusterResults.output_data[0]).map((column) => {
                        const displayName = column === 'cluster_id' ? 'Cluster ID' : column;
                        return (
                          <ContextMenu key={column}>
                            <ContextMenuTrigger asChild>
                              <div className="flex items-center gap-1 cursor-pointer">
                                {displayName}
                                {outputDataSortColumn === column && (
                                  outputDataSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                )}
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                              <ContextMenuSub>
                                <ContextMenuSubTrigger className="flex items-center">
                                  <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                  <ContextMenuItem onClick={() => handleOutputDataSort(column, 'asc')}>
                                    <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                  </ContextMenuItem>
                                  <ContextMenuItem onClick={() => handleOutputDataSort(column, 'desc')}>
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
                                  <OutputDataFilterMenu column={column} data={clusterResults.output_data} />
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              {outputDataColumnFilters[column]?.length > 0 && (
                                <>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem onClick={() => clearOutputDataColumnFilter(column)}>
                                    Clear Filter
                                  </ContextMenuItem>
                                </>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                      bodyClassName="max-h-[300px] overflow-y-auto"
                      borderColor="border-orange-500"
                      customHeader={{
                        title: "Full Output Data with Cluster IDs",
                        subtitle: `Total Rows: ${displayedOutputData.length.toLocaleString()}${displayedOutputData.length !== clusterResults.output_data.length ? ` (${clusterResults.output_data.length.toLocaleString()} total)` : ''}`,
                        subtitlePosition: "right"
                      }}
                    >
                      {displayedOutputData.map((row: any, index: number) => (
                        <React.Fragment key={index}>
                          <tr className="table-row">
                            {Object.entries(row).map(([column, value]) => (
                              <td key={column} className="table-cell">
                                {column === 'cluster_id' ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {String(value)}
                                  </span>
                                ) : (
                                  <span className={typeof value === 'number' ? 'font-mono' : ''}>
                                    {typeof value === 'number' ? (value as number).toFixed(3) : String(value)}
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        </React.Fragment>
                      ))}
                    </Table>
                  </div>
                )}

                {/* Save DataFrame Button - Outside Results Box */}
                {clusterResults.output_data && Array.isArray(clusterResults.output_data) && clusterResults.output_data.length > 0 && (
                  <div className="mt-6 flex justify-end">
                    <Button
                      onClick={() => saveResultsToBackend(clusterResults.output_data)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 text-sm font-medium"
                    >
                      Save DataFrame
                    </Button>
                  </div>
                )}


              </div>
            </div>
          ) : (
            <div className="text-gray-500">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-orange-300" />
              <p className="text-lg">Run clustering to see results here</p>
        </div>
      )}
        </div>
      </Card>
    </div>
  );
};

export default ClusteringCanvas;