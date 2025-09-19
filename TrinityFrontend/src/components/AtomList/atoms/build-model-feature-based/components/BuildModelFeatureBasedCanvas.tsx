import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Play, X, Settings2, Target, Zap, ChevronDown, ChevronRight, BarChart3, TrendingUp, AlertTriangle, Calculator, Minimize2, Maximize2, ArrowUp, ArrowDown, Filter as FilterIcon } from 'lucide-react';
import { BuildModelFeatureBasedData, VariableTransformation, ModelConfig } from '../BuildModelFeatureBasedAtom';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { BUILD_MODEL_API } from '@/lib/api';
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

interface BuildModelFeatureBasedCanvasProps {
  data: BuildModelFeatureBasedData;
  onClose?: () => void;
  atomId: string; // Required for Laboratory Mode
}

const availableModels = [
  { id: 'linear-regression', name: 'Linear Regression', params: ['Learning Rate', 'Max Iterations', 'Tolerance'] },
  { id: 'random-forest', name: 'Random Forest', params: ['N Estimators', 'Max Depth', 'Min Samples Split'] },
  { id: 'svm', name: 'Support Vector Machine', params: ['C Parameter', 'Kernel', 'Gamma'] },
  { id: 'neural-network', name: 'Neural Network', params: ['Hidden Layers', 'Learning Rate', 'Epochs'] }
];

const BuildModelFeatureBasedCanvas: React.FC<BuildModelFeatureBasedCanvasProps> = ({
  data,
  onClose,
  atomId
}) => {
  const [scopeSectionExpanded, setScopeSectionExpanded] = useState(true);
  const [modelingSectionExpanded, setModelingSectionExpanded] = useState(true);
  const [minimizedCombinations, setMinimizedCombinations] = useState<Set<number>>(new Set());
  
  // Model Performance Metrics sorting and filtering state - per combination
  const [performanceSortColumn, setPerformanceSortColumn] = useState<{ [comboIndex: number]: string }>({});
  const [performanceSortDirection, setPerformanceSortDirection] = useState<{ [comboIndex: number]: 'asc' | 'desc' }>({});
  const [performanceColumnFilters, setPerformanceColumnFilters] = useState<{ [comboIndex: number]: { [key: string]: string[] } }>({});
  
  // Get latest data from store if in Laboratory Mode
  const storeAtom = useLaboratoryStore(state => (atomId ? state.getAtom(atomId) : undefined));
  const storeData = (storeAtom?.settings as any)?.data as BuildModelFeatureBasedData;
  
  // Use store data if available, otherwise use prop data
  const currentData = storeData || data;
  
  // Subscribe to store changes more directly
  const storeSubscription = useLaboratoryStore(state => 
    atomId ? state.getAtom(atomId)?.settings?.data : null
  );
  
  // Use store subscription data if available
  const finalData = storeSubscription || currentData;
  
  // Debug logging removed

  // Force re-render when store data changes
  useEffect(() => {
    // Store data changed - component will re-render
  }, [storeData, storeSubscription]);

  // Get updateSettings function for Laboratory Mode
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);

  // Data modification functions for Laboratory Mode
  const handleDataChange = (newData: Partial<BuildModelFeatureBasedData>) => {
    if (atomId && updateSettings) {
      const updatedData = { ...finalData, ...newData };
      updateSettings(atomId, { data: updatedData });
    }
  };

  // Settings modification functions for Laboratory Mode
  const handleSettingsChange = (newSettings: any) => {
    if (atomId && updateSettings) {
      updateSettings(atomId, newSettings);
    }
  };

  const addXVariable = () => {
    handleDataChange({
      xVariables: [...(finalData?.xVariables || []), []],
      transformations: [...(finalData?.transformations || []), 'standardize']
    });
  };

  const updateXVariable = (index: number, value: string | string[]) => {
    const updatedXVariables = [...(finalData?.xVariables || [])];
    updatedXVariables[index] = value;
    handleDataChange({ xVariables: updatedXVariables });
  };

  const toggleXVariable = (index: number, variable: string, checked: boolean) => {
    const currentXVariables = finalData?.xVariables || [];
    const currentValue = currentXVariables[index];
    
    if (Array.isArray(currentValue)) {
      // If it's already an array, add or remove the variable
      const newValue = checked 
        ? [...currentValue, variable]
        : currentValue.filter(v => v !== variable);
      updateXVariable(index, newValue);
    } else {
      // If it's a string, convert to array
      const newValue = checked ? [variable] : [];
      updateXVariable(index, newValue);
    }
  };

  const togglePopover = (index: number, open: boolean) => {
    setOpenPopovers(prev => ({
      ...prev,
      [index]: open
    }));
  };

  const runModel = async () => {
    if (!finalData?.selectedScope || !finalData?.selectedCombinations || finalData.selectedCombinations.length === 0) {
      setModelError('Missing required data: scope or combinations');
      return;
    }

    if (!finalData?.yVariable) {
      setModelError('Missing Y-variable selection');
      return;
    }

    // Flatten X-variables (handle both string and array formats)
    const allXVariables: string[] = [];
    finalData.xVariables?.forEach((xVar, index) => {
      if (Array.isArray(xVar)) {
        allXVariables.push(...xVar);
      } else if (xVar) {
        allXVariables.push(xVar);
      }
    });

    if (allXVariables.length === 0) {
      setModelError('No X-variables selected');
      return;
    }

    // Map frontend transformations to backend standardization
    const getStandardizationMethod = (transformation: string): string => {
      switch (transformation) {
        case 'normalize':
          return 'minmax';
        case 'standardize':
          return 'standard';
        case 'none':
        case 'log':
        case 'sqrt':
        case 'adstock':
        case 'logistic':
        case 'power':
          return 'none'; // These transformations are applied separately
        default:
          return 'none';
      }
    };

    // Get standardization method from first transformation (or default to 'none')
    const standardization = finalData.transformations?.[0] 
      ? getStandardizationMethod(finalData.transformations[0])
      : 'none';

    // Generate run_id for progress tracking
    const tempRunId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Construct the request payload for the direct endpoint
    const requestPayload = {
      run_id: tempRunId, // Send the run_id for progress tracking
      scope_number: finalData.selectedScope, // Send the scope number directly
      combinations: finalData.selectedCombinations, // Send the combination strings directly
      x_variables: allXVariables,
      y_variable: finalData.yVariable,
      standardization: standardization,
      k_folds: finalData.kFolds || 5, // Use value from settings or default
      test_size: finalData.testSize || 0.2, // Use value from settings or default
      models_to_run: finalData.selectedModels || null, // Use selected models from settings
      custom_model_configs: null, // Can be enhanced later
      // Stack modeling fields
      stack_modeling: finalData.stackModeling || false,
      pool_by_identifiers: (finalData.poolByIdentifiers || []).map(id => id.toLowerCase()),
      numerical_columns_for_clustering: (finalData.numericalColumnsForClustering || []).map(col => col.toLowerCase()),
      apply_interaction_terms: finalData.applyInteractionTerms || true,
      numerical_columns_for_interaction: (finalData.numericalColumnsForInteraction || []).map(col => col.toLowerCase())
    };

    // Model training started

    // Reset previous results and errors
    setModelResult(null);
    setModelError(null);
    
    // Save to global store
    handleSettingsChange({ modelResult: null, modelError: null });
    setIsRunningModel(true);
    
        // Initialize progress tracking
    const totalCombinations = finalData.selectedCombinations.length;
    const totalModels = finalData.selectedModels?.length || 0;
    const totalTasks = totalCombinations * totalModels;
    setModelProgress({ 
      current: 0, 
      total: totalTasks, 
      percentage: 0,
      status: "running",
      current_combination: "",
      current_model: "",
      completed_combinations: 0,
      total_combinations: totalCombinations
    });
    
    let progressPollingInterval: number;
    try {
      // Set the run_id and start progress polling immediately
      setRunId(tempRunId);
      
      // Start polling for progress immediately
      progressPollingInterval = setInterval(async () => {
        const shouldStop = await pollProgress(tempRunId);
        if (shouldStop) {
          clearInterval(progressPollingInterval);
        }
      }, 1000); // Poll every second
      
      const response = await fetch(`${BUILD_MODEL_API}/train-models-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Extract run_id from response if available and update if different
        const responseRunId = result.summary?.run_id;
        if (responseRunId && responseRunId !== tempRunId) {
          setRunId(responseRunId);
        }
        
        setModelResult(result);
        setModelError(null);
        
        // Save to global store
        handleSettingsChange({ modelResult: result, modelError: null });
        
        // Automatically minimize all combinations by default
        if (result.combination_results && result.combination_results.length > 0) {
          const allIndices = Array.from({ length: result.combination_results.length }, (_, i) => i);
          setMinimizedCombinations(new Set(allIndices));
        }
      } else {
        const errorText = await response.text();
        const errorMessage = `Model training failed: ${response.status} - ${errorText}`;
        setModelError(errorMessage);
        setModelResult(null);
        
        // Save to global store
        handleSettingsChange({ modelResult: null, modelError: errorMessage });
      }
    } catch (error) {
      const errorMessage = `Error running model: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setModelError(errorMessage);
      setModelResult(null);
      
      // Save to global store
      handleSettingsChange({ modelResult: null, modelError: errorMessage });
    } finally {
      // Clear progress polling interval and reset
      if (progressPollingInterval) {
        clearInterval(progressPollingInterval);
      }
      setIsRunningModel(false);
      // Keep progress visible for a moment before hiding
      setTimeout(() => {
        setModelProgress({ 
          current: 0, 
          total: 0, 
          percentage: 0,
          status: "",
          current_combination: "",
          current_model: "",
          completed_combinations: 0,
          total_combinations: 0
        });
      }, 2000);
    }
  };

  const removeXVariable = (index: number) => {
    handleDataChange({
      xVariables: (finalData?.xVariables || []).filter((_, i) => i !== index),
      transformations: (finalData?.transformations || []).filter((_, i) => i !== index)
    });
  };

  const updateTransformation = (index: number, value: string) => {
    const updatedTransformations = [...(finalData?.transformations || [])];
    updatedTransformations[index] = value;
    handleDataChange({ transformations: updatedTransformations });
  };

  // Handle combination deselection from canvas
  const removeCombination = (combinationToRemove: string) => {
    const updatedCombinations = (finalData?.selectedCombinations || []).filter(
      combination => combination !== combinationToRemove
    );
    handleDataChange({ selectedCombinations: updatedCombinations });
  };

  // Handle opening combination file in new tab
  const handleOpenCombinationFile = async (combinationId: string) => {
    // Get the actual file path from the backend
    const scopeNumber = finalData?.selectedScope;
    if (!scopeNumber) {
      console.warn('No scope selected');
      return;
    }
    
    try {
      // Get the actual file path from the backend
      const formData = new URLSearchParams();
      formData.append('scope', scopeNumber);
      formData.append('combination', combinationId);
      
      const response = await fetch(`${BUILD_MODEL_API}/get_file_path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        // Use the actual file path returned by the backend
        window.open(`/dataframe?name=${encodeURIComponent(data.file_path)}`, '_blank');
      } else {
        console.error('Failed to get file path:', response.statusText);
      }
    } catch (error) {
      console.error('Error getting file path:', error);
    }
  };

  const toggleCombinationMinimize = (comboIndex: number) => {
    setMinimizedCombinations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(comboIndex)) {
        newSet.delete(comboIndex);
      } else {
        newSet.add(comboIndex);
      }
      return newSet;
    });
  };

  // Fetch numerical columns when scope and combinations are selected
  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [openPopovers, setOpenPopovers] = useState<{ [key: number]: boolean }>({});
  const [isRunningModel, setIsRunningModel] = useState(false);
  const [modelResult, setModelResult] = useState<any>(() => {
    return data.modelResult || null;
  });
  const [modelError, setModelError] = useState<string | null>(() => {
    return data.modelError || null;
  });
  const [modelProgress, setModelProgress] = useState<{ 
    current: number; 
    total: number; 
    percentage: number;
    status: string;
    current_combination: string;
    current_model: string;
    completed_combinations: number;
    total_combinations: number;
  }>({ 
    current: 0, 
    total: 0, 
    percentage: 0,
    status: "",
    current_combination: "",
    current_model: "",
    completed_combinations: 0,
    total_combinations: 0
  });
  const [runId, setRunId] = useState<string | null>(null);

  // Function to poll progress
  const pollProgress = async (runId: string) => {
    try {
      const response = await fetch(`${BUILD_MODEL_API}/training-progress/${runId}`);
      if (response.ok) {
        const progress = await response.json();
        setModelProgress(progress);
        
        // If training is completed or errored, stop polling
        if (progress.status === 'completed' || progress.status === 'error') {
          return true; // Stop polling
        }
      }
    } catch (error) {
      console.error('Error polling progress:', error);
    }
    return false; // Continue polling
  };

  useEffect(() => {
    const fetchNumericalColumns = async () => {
      if (finalData?.selectedScope && finalData?.selectedCombinations && finalData.selectedCombinations.length > 0) {
        setIsLoadingColumns(true);
        try {
          // Use the first selected combination to get column info
          const firstCombination = finalData.selectedCombinations[0];
          const requestBody = {
            scope: finalData.selectedScope,
            combination: firstCombination
          };
          
          // Fetching columns for scope and combination
          
          // Create URLSearchParams for form data
          const formData = new URLSearchParams();
          formData.append('scope', finalData.selectedScope);
          formData.append('combination', firstCombination);
          
          // Fetching columns from API
          
          const response = await fetch(`${BUILD_MODEL_API}/get_columns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
          });
          
          if (response.ok) {
            const data = await response.json();
            
            // Use the numerical_columns directly from the backend response
            const numericalCols = data.numerical_columns || [];
            
            if (numericalCols.length > 0) {
            setNumericalColumns(numericalCols);
            } else {
              // Fallback to default columns if no numerical columns found
              setNumericalColumns(['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8']);
            }
          } else {
            const errorText = await response.text();
            
            // Fallback to default columns if API fails
            setNumericalColumns(['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8']);
          }
        } catch (error) {
          // Fallback to default columns if API fails
          setNumericalColumns(['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8']);
        } finally {
          setIsLoadingColumns(false);
        }
      }
    };

    fetchNumericalColumns();
  }, [finalData?.selectedScope, finalData?.selectedCombinations]);

  // Ensure at least one X variable exists
  useEffect(() => {
    if (!finalData?.xVariables || finalData.xVariables.length === 0) {
      addXVariable();
    }
  }, [finalData?.xVariables?.length]);

  // Sync with global store changes
  useEffect(() => {
    if (data.modelResult !== undefined) {
      setModelResult(data.modelResult);
    }
  }, [data.modelResult]);

  useEffect(() => {
    if (data.modelError !== undefined) {
      setModelError(data.modelError);
    }
  }, [data.modelError]);

  // Automatically minimize all combinations by default when model results are available
  useEffect(() => {
    if (modelResult?.combination_results && modelResult.combination_results.length > 0) {
      const allIndices = Array.from({ length: modelResult.combination_results.length }, (_, i) => i);
      setMinimizedCombinations(new Set(allIndices));
    }
  }, [modelResult?.combination_results]);

  // Model Performance Metrics sorting and filtering functions
  const getPerformanceUniqueColumnValues = (column: string, modelResults: any[], comboIndex: number): string[] => {
    if (!modelResults.length) return [];
    
    // Apply other active filters to get hierarchical filtering
    const currentFilters = performanceColumnFilters[comboIndex] || {};
    const otherFilters = Object.entries(currentFilters).filter(([key]) => key !== column);
    let dataToUse = modelResults;
    
    if (otherFilters.length > 0) {
      dataToUse = modelResults.filter(model => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          let cellValue = '';
          if (filterColumn === 'Model') {
            cellValue = String(model.model_name || '');
          } else if (filterColumn === 'MAPE Train') {
            cellValue = model.mape_train ? String(model.mape_train.toFixed(1)) : 'N/A';
          } else if (filterColumn === 'MAPE Test') {
            cellValue = model.mape_test ? String(model.mape_test.toFixed(1)) : 'N/A';
          } else if (filterColumn === 'R² Train') {
            cellValue = model.r2_train ? String(model.r2_train.toFixed(1)) : 'N/A';
          } else if (filterColumn === 'R² Test') {
            cellValue = model.r2_test ? String(model.r2_test.toFixed(1)) : 'N/A';
          } else if (filterColumn === 'AIC') {
            cellValue = model.aic ? String(model.aic.toFixed(1)) : 'N/A';
          } else if (filterColumn === 'BIC') {
            cellValue = model.bic ? String(model.bic.toFixed(1)) : 'N/A';
          }
          return filterValues.includes(cellValue);
        });
      });
    }
    
    const values: string[] = [];
    dataToUse.forEach(model => {
      let cellValue = '';
      if (column === 'Model') {
        cellValue = String(model.model_name || '');
      } else if (column === 'MAPE Train') {
        cellValue = model.mape_train ? String(model.mape_train.toFixed(1)) : 'N/A';
      } else if (column === 'MAPE Test') {
        cellValue = model.mape_test ? String(model.mape_test.toFixed(1)) : 'N/A';
      } else if (column === 'R² Train') {
        cellValue = model.r2_train ? String(model.r2_train.toFixed(1)) : 'N/A';
      } else if (column === 'R² Test') {
        cellValue = model.r2_test ? String(model.r2_test.toFixed(1)) : 'N/A';
      } else if (column === 'AIC') {
        cellValue = model.aic ? String(model.aic.toFixed(1)) : 'N/A';
      } else if (column === 'BIC') {
        cellValue = model.bic ? String(model.bic.toFixed(1)) : 'N/A';
      }
      if (cellValue && !values.includes(cellValue)) {
        values.push(cellValue);
      }
    });
    
    return values.sort();
  };

  const handlePerformanceSort = (column: string, comboIndex: number, direction?: 'asc' | 'desc') => {
    const currentSortColumn = performanceSortColumn[comboIndex] || '';
    const currentSortDirection = performanceSortDirection[comboIndex] || 'asc';
    
    if (currentSortColumn === column) {
      if (currentSortDirection === 'asc') {
        setPerformanceSortDirection(prev => ({ ...prev, [comboIndex]: 'desc' }));
      } else if (currentSortDirection === 'desc') {
        setPerformanceSortColumn(prev => ({ ...prev, [comboIndex]: '' }));
        setPerformanceSortDirection(prev => ({ ...prev, [comboIndex]: 'asc' }));
      }
    } else {
      setPerformanceSortColumn(prev => ({ ...prev, [comboIndex]: column }));
      setPerformanceSortDirection(prev => ({ ...prev, [comboIndex]: direction || 'asc' }));
    }
  };

  const handlePerformanceColumnFilter = (column: string, values: string[], comboIndex: number) => {
    setPerformanceColumnFilters(prev => ({
      ...prev,
      [comboIndex]: {
        ...prev[comboIndex],
        [column]: values
      }
    }));
  };

  const clearPerformanceColumnFilter = (column: string, comboIndex: number) => {
    setPerformanceColumnFilters(prev => {
      const cpy = { ...prev };
      if (cpy[comboIndex]) {
        const comboFilters = { ...cpy[comboIndex] };
        delete comboFilters[column];
        cpy[comboIndex] = comboFilters;
      }
      return cpy;
    });
  };

  const PerformanceFilterMenu = ({ column, modelResults, comboIndex }: { column: string; modelResults: any[]; comboIndex: number }) => {
    const uniqueValues = getPerformanceUniqueColumnValues(column, modelResults, comboIndex);
    const current = performanceColumnFilters[comboIndex]?.[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => handlePerformanceColumnFilter(column, temp, comboIndex);

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

  const getDisplayedPerformanceResults = (modelResults: any[], comboIndex: number) => {
    let filtered = [...modelResults];
    
    // Apply column filters
    const currentFilters = performanceColumnFilters[comboIndex] || {};
    Object.entries(currentFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(model => {
          let cellValue = '';
          if (column === 'Model') {
            cellValue = String(model.model_name || '');
          } else if (column === 'MAPE Train') {
            cellValue = model.mape_train ? String(model.mape_train.toFixed(1)) : 'N/A';
          } else if (column === 'MAPE Test') {
            cellValue = model.mape_test ? String(model.mape_test.toFixed(1)) : 'N/A';
          } else if (column === 'R² Train') {
            cellValue = model.r2_train ? String(model.r2_train.toFixed(1)) : 'N/A';
          } else if (column === 'R² Test') {
            cellValue = model.r2_test ? String(model.r2_test.toFixed(1)) : 'N/A';
          } else if (column === 'AIC') {
            cellValue = model.aic ? String(model.aic.toFixed(1)) : 'N/A';
          } else if (column === 'BIC') {
            cellValue = model.bic ? String(model.bic.toFixed(1)) : 'N/A';
          }
          return filterValues.includes(cellValue);
        });
      }
    });
    
    // Apply sorting
    const currentSortColumn = performanceSortColumn[comboIndex] || '';
    const currentSortDirection = performanceSortDirection[comboIndex] || 'asc';
    
    if (currentSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';
        
        if (currentSortColumn === 'Model') {
          aVal = String(a.model_name || '');
          bVal = String(b.model_name || '');
        } else if (currentSortColumn === 'MAPE Train') {
          aVal = a.mape_train || 0;
          bVal = b.mape_train || 0;
        } else if (currentSortColumn === 'MAPE Test') {
          aVal = a.mape_test || 0;
          bVal = b.mape_test || 0;
        } else if (currentSortColumn === 'R² Train') {
          aVal = a.r2_train || 0;
          bVal = b.r2_train || 0;
        } else if (currentSortColumn === 'R² Test') {
          aVal = a.r2_test || 0;
          bVal = b.r2_test || 0;
        } else if (currentSortColumn === 'AIC') {
          aVal = a.aic || 0;
          bVal = b.aic || 0;
        } else if (currentSortColumn === 'BIC') {
          aVal = a.bic || 0;
          bVal = b.bic || 0;
        }
        
        if (aVal === bVal) return 0;
        let comparison = 0;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        return currentSortDirection === 'desc' ? -comparison : comparison;
      });
    }
    
    return filtered;
  };

  // Show placeholder when no scope or combinations are selected
  if (!finalData?.selectedScope || !finalData?.selectedCombinations || finalData.selectedCombinations.length === 0) {
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
              <Zap className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-orange-500 to-orange-600 bg-clip-text text-transparent">
              Build Model Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a scope and combinations from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-background p-6 overflow-y-auto">

      {/* Scope Selected */}
      <Card className="mb-6">
        <div className="py-2 px-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Scope Selected
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setScopeSectionExpanded(!scopeSectionExpanded)}
              className="h-6 w-6 p-0"
            >
              {scopeSectionExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
                {scopeSectionExpanded && (
          <div className="p-4">
            <div className="grid grid-cols-3 gap-6">
              {/* Selected Scope */}
              <div className="col-span-1">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Selected Scope:</h4>
                {finalData?.selectedScope ? (
                  <Badge variant="default" className="px-3 py-1">
                    Scope {finalData.selectedScope}
                  </Badge>
                ) : (
                  <p className="text-sm text-muted-foreground">No scope selected</p>
                )}
              </div>

              {/* Selected Combinations */}
              <div className="col-span-2">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Selected Combinations:</h4>
                {finalData?.selectedCombinations && finalData.selectedCombinations.length > 0 ? (
                  <div className="max-h-32 max-w-full overflow-y-auto overflow-x-auto border rounded p-2">
                    <div className="flex flex-col gap-2">
                    {finalData.selectedCombinations.map((combination, index) => (
                        <Badge key={index} variant="secondary" className="px-3 py-1 flex items-center gap-1 whitespace-nowrap">
                        {combination}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCombination(combination)}
                          className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </Badge>
                    ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No combinations selected</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Modeling */}
      <Card className="mb-6">
        <div className="py-2 px-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Modeling
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModelingSectionExpanded(!modelingSectionExpanded)}
              className="h-6 w-6 p-0"
            >
              {modelingSectionExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
        {modelingSectionExpanded && (
          <div className="p-6 space-y-6">
            {/* Header row for Y & X variable controls */}
          <div className="flex items-center mb-2">
            <label className="text-sm font-medium text-muted-foreground w-3/12">Select Y-Variable</label>
            <label className="text-sm font-medium text-muted-foreground w-3/12 pl-4">Select X-Variable</label>
            <div className="flex-1" />
            <Button size="sm" className="bg-orange-300 text-white hover:bg-orange-400" onClick={addXVariable}>
              <Plus className="w-4 h-4 mr-2" />
              Add Variable
            </Button>
          </div>

          {/* Combined Y & X-Variables Selection list */}
          <div className="space-y-3">
            {(finalData?.xVariables || []).map((variable, index) => (
              <div key={`${variable}-${index}`} className={`grid grid-cols-12 gap-4 items-center p-3 rounded-lg shadow-sm ${index % 2 === 0 ? 'bg-white border-l-4 border-indigo-300' : 'bg-gray-50 border-l-4 border-teal-300'}`}>
                {/* Y-variable column only for first row */}
                {index === 0 ? (
                  <div className="col-span-3">
                    <Select value={finalData?.yVariable || ''} onValueChange={(value) => handleDataChange({ yVariable: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingColumns ? "Loading..." : "Select Y-Variable"} />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingColumns ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading numerical columns...</div>
                        ) : (
                          numericalColumns
                            .filter(col => {
                              // Exclude any X-variables that are selected (either as strings or arrays)
                              const isSelectedAsXVariable = finalData?.xVariables?.some(xVar => 
                                Array.isArray(xVar) ? xVar.includes(col) : xVar === col
                              );
                              return !isSelectedAsXVariable;
                            })
                            .map(col => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="col-span-3" />
                )}

                {/* X-variable select */}
                <div className="col-span-3">
                  <Popover open={openPopovers[index]} onOpenChange={(open) => togglePopover(index, open)}>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="w-full justify-between"
                        disabled={isLoadingColumns}
                      >
                        <span>
                          {isLoadingColumns 
                            ? "Loading..." 
                            : Array.isArray(variable) 
                              ? variable.length > 0 
                                ? `${variable.length} X-variable${variable.length > 1 ? 's' : ''} selected`
                                : "Select X-Variables"
                              : variable || "Select X-Variables"
                          }
                        </span>
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="bg-white border-gray-200 max-h-60 overflow-y-auto w-56 p-2" onPointerDownOutside={(e) => e.preventDefault()}>
                      {isLoadingColumns ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading numerical columns...</div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 py-1 border-b mb-2">
                            <Checkbox
                              checked={Array.isArray(variable) && variable.length === numericalColumns.filter(col => col !== finalData?.yVariable).length}
                              onCheckedChange={(checked) => {
                                const availableColumns = numericalColumns.filter(col => col !== finalData?.yVariable);
                                updateXVariable(index, checked ? availableColumns : []);
                              }}
                            />
                            <span className="text-sm font-medium">Select All</span>
                          </div>
                          {numericalColumns
                            .filter(col => col !== finalData?.yVariable)
                            .map(col => {
                              const isChecked = Array.isArray(variable) ? variable.includes(col) : variable === col;
                              return (
                                <div key={col} className="flex items-center gap-2 py-1">
                                  <Checkbox
                                    checked={isChecked}
                                    onCheckedChange={(checked) => toggleXVariable(index, col, !!checked)}
                                  />
                                  <span className="text-sm">{col}</span>
                                </div>
                              );
                            })}
                        </>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Standardization select */}
                <div className="col-span-3">
                  <Select value={finalData?.transformations?.[index] || ''} onValueChange={(val) => updateTransformation(index, val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Standardization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="normalize">Normalize (Min-Max)</SelectItem>
                      <SelectItem value="standardize">Standardize (Z-Score)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Remove button */}
                <div className="col-span-1">
                  <Button size="sm" variant="ghost" onClick={() => removeXVariable(index)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}
      </Card>

      {/* Run Model Button */}
      <div className="mb-6">
        <Button 
          className="bg-orange-500 hover:bg-orange-600"
          onClick={runModel}
          disabled={
            isRunningModel || 
            !finalData?.selectedScope || 
            !finalData?.yVariable || 
            !finalData?.xVariables?.some(xVar => 
              Array.isArray(xVar) ? xVar.length > 0 : xVar
            )
          }
        >
          {isRunningModel ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Running Model...
            </>
          ) : (
            <>
          <Play className="w-4 h-4 mr-2" />
          Run the Model
            </>
          )}
        </Button>

        {/* Progress Visualization */}
        {isRunningModel && modelProgress.total > 0 && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-blue-700">
                  {modelProgress.status === 'completed' ? 'Model Training Completed' : 'Model Training Progress'}
                </span>
              </div>
              <span className="text-sm text-blue-600 font-mono">
                {modelProgress.current} / {modelProgress.total} ({modelProgress.percentage}%)
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${modelProgress.percentage}%` }}
              ></div>
            </div>
            <div className="mt-2 text-xs text-blue-600">
              {modelProgress.status === 'running' && modelProgress.current_combination && (
                <div>Currently processing: {modelProgress.current_combination}</div>
              )}
              {modelProgress.status === 'running' && modelProgress.current_model && (
                <div>Status: {modelProgress.current_model}</div>
              )}
              <div>Completed {modelProgress.completed_combinations} of {modelProgress.total_combinations} combinations</div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {modelError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{modelError}</p>
          </div>
        )}


      </div>

      {/* Model Results Table */}
      {modelResult && (
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50/30">
          <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-gray-800">Model Training Results</h3>
                <p className="text-sm text-blue-600 font-medium">
                  Successfully processed {modelResult.total_combinations} combinations
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {modelResult.combination_results && modelResult.combination_results.length > 0 ? (
              <div className="space-y-8">
                {modelResult.combination_results.map((combination, comboIndex) => (
                  <div key={comboIndex} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <Target className="w-5 h-5 text-green-600" />
                        </div>
                                <h4 className="font-semibold text-base text-gray-800">
          Combination: <span 
            className="text-green-600 font-bold cursor-pointer hover:underline hover:text-green-700 transition-colors"
            onClick={() => handleOpenCombinationFile(combination.combination_id)}
            title="Click to open data file in new tab"
          >
            {combination.combination_id}
          </span>
        </h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCombinationMinimize(comboIndex)}
                        className="h-8 w-8 p-0 hover:bg-gray-100"
                      >
                        {minimizedCombinations.has(comboIndex) ? (
                          <Maximize2 className="w-4 h-4 text-gray-600" />
                        ) : (
                          <Minimize2 className="w-4 h-4 text-gray-600" />
                        )}
                      </Button>
                    </div>

                    {!minimizedCombinations.has(comboIndex) && (
                      <>
                        {combination.model_results && combination.model_results.length > 0 ? (
                          <div className="bg-gray-50 rounded-lg p-4 mb-6">
                            <h5 className="font-semibold text-lg text-gray-700 mb-4 flex items-center gap-2">
                              <TrendingUp className="w-5 h-5 text-blue-600" />
                              Model Performance Metrics
                            </h5>
                            <div className="overflow-x-auto">
                              <Table className="bg-white rounded-lg border border-gray-200">
                                <TableHeader>
                                  <TableRow className="bg-gradient-to-r from-blue-50 to-indigo-50 hover:bg-gradient-to-r hover:from-blue-100 hover:to-indigo-100">
                                    <TableHead className="font-semibold text-gray-700 bg-blue-50">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            Model
                                            {(performanceSortColumn[comboIndex] || '') === 'Model' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('Model', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('Model', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="Model" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['Model']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('Model', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                    <TableHead className="font-semibold text-gray-700">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            MAPE Train
                                            {(performanceSortColumn[comboIndex] || '') === 'MAPE Train' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('MAPE Train', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('MAPE Train', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="MAPE Train" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['MAPE Train']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('MAPE Train', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                    <TableHead className="font-semibold text-gray-700">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            MAPE Test
                                            {(performanceSortColumn[comboIndex] || '') === 'MAPE Test' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('MAPE Test', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('MAPE Test', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="MAPE Test" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['MAPE Test']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('MAPE Test', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                    <TableHead className="font-semibold text-gray-700">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            R² Train
                                            {(performanceSortColumn[comboIndex] || '') === 'R² Train' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('R² Train', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('R² Train', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="R² Train" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['R² Train']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('R² Train', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                    <TableHead className="font-semibold text-gray-700">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            R² Test
                                            {(performanceSortColumn[comboIndex] || '') === 'R² Test' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('R² Test', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('R² Test', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="R² Test" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['R² Test']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('R² Test', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                    <TableHead className="font-semibold text-gray-700">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            AIC
                                            {(performanceSortColumn[comboIndex] || '') === 'AIC' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('AIC', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('AIC', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="AIC" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['AIC']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('AIC', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                    <TableHead className="font-semibold text-gray-700">
                                      <ContextMenu>
                                        <ContextMenuTrigger asChild>
                                          <div className="flex items-center gap-1 cursor-pointer">
                                            BIC
                                            {(performanceSortColumn[comboIndex] || '') === 'BIC' && (
                                              (performanceSortDirection[comboIndex] || 'asc') === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                            )}
                                          </div>
                                        </ContextMenuTrigger>
                                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                                          <ContextMenuSub>
                                            <ContextMenuSubTrigger className="flex items-center">
                                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                                            </ContextMenuSubTrigger>
                                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                                              <ContextMenuItem onClick={() => handlePerformanceSort('BIC', comboIndex, 'asc')}>
                                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                                              </ContextMenuItem>
                                              <ContextMenuItem onClick={() => handlePerformanceSort('BIC', comboIndex, 'desc')}>
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
                                              <PerformanceFilterMenu column="BIC" modelResults={combination.model_results} comboIndex={comboIndex} />
                                            </ContextMenuSubContent>
                                          </ContextMenuSub>
                                          {performanceColumnFilters[comboIndex]?.['BIC']?.length > 0 && (
                                            <>
                                              <ContextMenuSeparator />
                                              <ContextMenuItem onClick={() => clearPerformanceColumnFilter('BIC', comboIndex)}>
                                                Clear Filter
                                              </ContextMenuItem>
                                            </>
                                          )}
                                        </ContextMenuContent>
                                      </ContextMenu>
                                    </TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {getDisplayedPerformanceResults(combination.model_results, comboIndex).map((model, modelIndex) => (
                                    <TableRow key={modelIndex} className="hover:bg-blue-50/50 transition-colors duration-150">
                                      <TableCell className="font-semibold text-blue-600">{model.model_name}</TableCell>
                                      <TableCell className="font-mono text-sm">{model.mape_train?.toFixed(1) || 'N/A'}</TableCell>
                                      <TableCell className="font-mono text-sm">{model.mape_test?.toFixed(1) || 'N/A'}</TableCell>
                                      <TableCell className="font-mono text-sm">{model.r2_train?.toFixed(1) || 'N/A'}</TableCell>
                                      <TableCell className="font-mono text-sm">{model.r2_test?.toFixed(1) || 'N/A'}</TableCell>
                                      <TableCell className="font-mono text-sm">{model.aic?.toFixed(1) || 'N/A'}</TableCell>
                                      <TableCell className="font-mono text-sm">{model.bic?.toFixed(1) || 'N/A'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <p className="text-yellow-700 font-medium flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5" />
                              No model results available
                            </p>
        </div>
                        )}
                        
                        {/* Coefficients Table */}
                        {combination.model_results && combination.model_results.length > 0 && (
                          <div className="bg-gray-50 rounded-lg p-4">
                            <h5 className="font-semibold text-lg text-gray-700 mb-4 flex items-center gap-2">
                              <Calculator className="w-5 h-5 text-purple-600" />
                              Model Coefficients
                            </h5>
                            <div className="overflow-x-auto">
                              <Table className="bg-white rounded-lg border border-gray-200">
            <TableHeader>
                                  <TableRow className="bg-gradient-to-r from-purple-50 to-pink-50 hover:bg-gradient-to-r hover:from-purple-100 hover:to-pink-100">
                                    <TableHead className="font-semibold text-gray-700 bg-purple-50">Variable</TableHead>
                                    {combination.model_results.map((model, index) => (
                                      <TableHead key={index} className="font-semibold text-gray-700">{model.model_name}</TableHead>
                                    ))}
              </TableRow>
            </TableHeader>
            <TableBody>
                                  {/* Intercept row - first row */}
                                  <TableRow className="hover:bg-purple-50/50 transition-colors duration-150">
                                    <TableCell className="font-semibold text-purple-600">Intercept</TableCell>
                                    {combination.model_results.map((model, index) => (
                                      <TableCell key={index} className="font-mono text-sm">
                                         {model.intercept ? model.intercept.toFixed(1) : 'N/A'}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                  {/* X-variables rows */}
                                   {finalData?.xVariables?.[0]?.map((variable) => (
                                    <TableRow key={variable} className="hover:bg-purple-50/50 transition-colors duration-150">
                                      <TableCell className="font-semibold text-purple-600">{variable}</TableCell>
                                      {combination.model_results.map((model, index) => (
                                        <TableCell key={index} className="font-mono text-sm">
                                           {model.coefficients && model.coefficients[`Beta_${variable.toLowerCase()}`] !== undefined
                                             ? model.coefficients[`Beta_${variable.toLowerCase()}`].toFixed(1) 
                                             : 'N/A'}
                                         </TableCell>
                                       ))}
                                     </TableRow>
                                   ))}
             </TableBody>
           </Table>
                             </div>
                           </div>
                         )}
                         
                         {/* Elasticities Table */}
                         {combination.model_results && combination.model_results.length > 0 && (
                           <div className="bg-gray-50 rounded-lg p-4">
                             <h5 className="font-semibold text-lg text-gray-700 mb-4 flex items-center gap-2">
                               <TrendingUp className="w-5 h-5 text-orange-600" />
                               Model Elasticities
                             </h5>
                             <div className="overflow-x-auto">
                               <Table className="bg-white rounded-lg border border-gray-200">
                                 <TableHeader>
                                   <TableRow className="bg-gradient-to-r from-orange-50 to-red-50 hover:bg-gradient-to-r hover:from-orange-100 hover:to-red-100">
                                     <TableHead className="font-semibold text-gray-700 bg-orange-50">Variable</TableHead>
                                     {combination.model_results.map((model, index) => (
                                       <TableHead key={index} className="font-semibold text-gray-700">{model.model_name}</TableHead>
                                     ))}
                                   </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                   {finalData?.xVariables?.[0]?.map((variable) => (
                                     <TableRow key={variable} className="hover:bg-orange-50/50 transition-colors duration-150">
                                       <TableCell className="font-semibold text-orange-600">{variable}</TableCell>
                                       {combination.model_results.map((model, index) => (
                                         <TableCell key={index} className="font-mono text-sm">
                                           {model.elasticities && model.elasticities[variable.toLowerCase()] !== undefined
                                             ? model.elasticities[variable.toLowerCase()].toFixed(1)
                                             : 'N/A'}
                                         </TableCell>
                                       ))}
                                     </TableRow>
                                   ))}
                                 </TableBody>
                               </Table>
                             </div>
                           </div>
                         )}
                         
                         {/* Contributions Table */}
                         {combination.model_results && combination.model_results.length > 0 && (
                           <div className="bg-gray-50 rounded-lg p-4">
                             <h5 className="font-semibold text-lg text-gray-700 mb-4 flex items-center gap-2">
                               <BarChart3 className="w-5 h-5 text-teal-600" />
                               Feature Contributions
                             </h5>
                             <div className="overflow-x-auto">
                               <Table className="bg-white rounded-lg border border-gray-200">
                                 <TableHeader>
                                   <TableRow className="bg-gradient-to-r from-teal-50 to-cyan-50 hover:bg-gradient-to-r hover:from-teal-100 hover:to-cyan-100">
                                     <TableHead className="font-semibold text-gray-700 bg-teal-50">Variable</TableHead>
                                     {combination.model_results.map((model, index) => (
                                       <TableHead key={index} className="font-semibold text-gray-700">{model.model_name}</TableHead>
                                     ))}
                                   </TableRow>
                                 </TableHeader>
                                 <TableBody>
                                   {finalData?.xVariables?.[0]?.map((variable) => (
                                     <TableRow key={variable} className="hover:bg-teal-50/50 transition-colors duration-150">
                                       <TableCell className="font-semibold text-teal-600">{variable}</TableCell>
                                       {combination.model_results.map((model, index) => (
                                         <TableCell key={index} className="font-mono text-sm">
                                           {model.contributions && model.contributions[variable.toLowerCase()] !== undefined
                                             ? (model.contributions[variable.toLowerCase()] * 100).toFixed(1) + '%'
                                            : 'N/A'}
                                        </TableCell>
                                      ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                <div className="p-3 bg-gray-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium text-lg">No combination results available</p>
              </div>
            )}
        </div>
      </Card>
      )}
    </div>
  );
};

export default BuildModelFeatureBasedCanvas;