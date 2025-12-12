import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PIPELINE_API, VALIDATE_API, FEATURE_OVERVIEW_API, GROUPBY_API, CHART_MAKER_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { Loader2, FileText, RefreshCw, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { resolveTaskResponse } from '@/lib/taskQueue';

interface RootFileReplacement {
  original_file: string;
  replacement_file: string | null;
  keep_original: boolean;
}

interface PipelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: string;
}

const PipelineModal: React.FC<PipelineModalProps> = ({ open, onOpenChange, mode = 'laboratory' }) => {
  const { toast } = useToast();
  const updateAtomSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const getAtom = useLaboratoryStore(state => state.getAtom);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [fileReplacements, setFileReplacements] = useState<RootFileReplacement[]>([]);
  const [running, setRunning] = useState(false);
  const [projectContext, setProjectContext] = useState<ReturnType<typeof getActiveProjectContext>>(null);
  const [savedDataframes, setSavedDataframes] = useState<Array<{ object_name: string; display_name?: string }>>([]);
  const [fileColumnValidation, setFileColumnValidation] = useState<Record<string, { isValid: boolean; error?: string; originalColumns: string[]; replacementColumns: string[] }>>({});
  const [validatingColumns, setValidatingColumns] = useState<Record<string, boolean>>({});

  // Load project context and saved dataframes when modal opens
  useEffect(() => {
    if (open) {
      const context = getActiveProjectContext();
      setProjectContext(context);
      if (context) {
        loadPipelineData(context);
        loadSavedDataframes();
      } else {
        toast({
          title: 'Project Context Missing',
          description: 'Please select a project first.',
          variant: 'destructive',
        });
      }
    }
  }, [open, mode]);

  const loadSavedDataframes = async () => {
    try {
      const response = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      const data = await response.json();
      // Filter to only show Arrow files and exclude derived files
      const allFiles = Array.isArray(data.files) ? data.files : [];
      const arrowFiles = allFiles.filter((f: any) => 
        f.object_name && f.object_name.endsWith('.arrow')
      );
      
      // Get derived files from pipeline data to exclude them (only .arrow files, exclude CSV temp files)
      const derivedFileKeysSet = new Set<string>();
      if (pipelineData?.pipeline?.execution_graph) {
        pipelineData.pipeline.execution_graph.forEach((step: any) => {
          step.outputs?.forEach((output: any) => {
            if (output.file_key && output.file_key.endsWith('.arrow')) {
              derivedFileKeysSet.add(output.file_key);
            }
          });
        });
      }
      
      // Filter out derived files
      const availableFiles = arrowFiles.filter((f: any) => 
        !derivedFileKeysSet.has(f.object_name)
      );
      
      setSavedDataframes(availableFiles);
    } catch (error) {
      console.error('Error loading saved dataframes:', error);
      setSavedDataframes([]);
    }
  };

  const loadPipelineData = async (context?: ReturnType<typeof getActiveProjectContext>) => {
    const ctx = context || projectContext;
    if (!ctx) return;

    setLoadingData(true);
    try {
      const params = new URLSearchParams({
        client_name: ctx.client_name || '',
        app_name: ctx.app_name || '',
        project_name: ctx.project_name || '',
        mode: mode,
      });

      const response = await fetch(`${PIPELINE_API}/get?${params}`);
      const result = await response.json();

      if (result.status === 'success' && result.data) {
        setPipelineData(result.data);
        
        // Initialize file replacements with all root files set to keep original
        const rootFiles = result.data.pipeline?.root_files || [];
        const rootFileKeys = rootFiles.map((rf: any) => rf.file_key || rf);
        setFileReplacements(
          rootFileKeys.map((file: string) => ({
            original_file: file,
            replacement_file: null,
            keep_original: true,
          }))
        );
        
        // Reload saved dataframes after pipeline data is loaded (to exclude derived files)
        loadSavedDataframes();
      } else {
        toast({
          title: 'No Pipeline Data',
          description: result.message || 'No pipeline execution data found. Execute some atoms first.',
          variant: 'default',
        });
      }
    } catch (error: any) {
      console.error('Error loading pipeline data:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load pipeline data',
        variant: 'destructive',
      });
    } finally {
      setLoadingData(false);
    }
  };

  const validateColumnMatch = async (originalFile: string, replacementFile: string) => {
    if (!replacementFile || replacementFile === 'original') {
      // Clear validation if keeping original
      setFileColumnValidation((prev) => {
        const updated = { ...prev };
        delete updated[originalFile];
        return updated;
      });
      return;
    }

    setValidatingColumns((prev) => ({ ...prev, [originalFile]: true }));

    try {
      // Get original file columns from pipeline data
      const rootFiles = pipelineData?.pipeline?.root_files || [];
      const originalFileObj = rootFiles.find((rf: any) => (rf.file_key || rf) === originalFile);
      const originalColumns = originalFileObj?.columns || [];

      // If original columns are not in pipeline data, fetch them
      let originalCols = originalColumns;
      if (originalCols.length === 0) {
        try {
          const origResponse = await fetch(
            `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(originalFile)}`
          );
          if (origResponse.ok) {
            const origData = await origResponse.json();
            originalCols = Array.isArray(origData.summary) 
              ? origData.summary.map((col: any) => col.column || col.field).filter(Boolean)
              : [];
          }
        } catch (e) {
          console.warn('Could not fetch original file columns:', e);
        }
      }

      // Get replacement file columns
      let replacementCols: string[] = [];
      try {
        const replResponse = await fetch(
          `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(replacementFile)}`
        );
        if (replResponse.ok) {
          const replData = await replResponse.json();
          replacementCols = Array.isArray(replData.summary)
            ? replData.summary.map((col: any) => col.column || col.field).filter(Boolean)
            : [];
        }
      } catch (e) {
        console.warn('Could not fetch replacement file columns:', e);
      }

      // Compare columns (order doesn't matter, but all columns must match)
      const originalSet = new Set(originalCols.map((c: string) => String(c).toLowerCase().trim()));
      const replacementSet = new Set(replacementCols.map((c: string) => String(c).toLowerCase().trim()));

      const isValid = 
        originalCols.length > 0 &&
        replacementCols.length > 0 &&
        originalSet.size === replacementSet.size &&
        Array.from(originalSet).every((col: string) => replacementSet.has(col));

      setFileColumnValidation((prev) => ({
        ...prev,
        [originalFile]: {
          isValid,
          error: isValid 
            ? undefined 
            : `Column mismatch: Original has ${originalCols.length} columns, replacement has ${replacementCols.length} columns`,
          originalColumns: originalCols,
          replacementColumns: replacementCols,
        },
      }));
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setFileColumnValidation((prev) => ({
        ...prev,
        [originalFile]: {
          isValid: false,
          error: `Failed to validate columns: ${errorMessage}`,
          originalColumns: [],
          replacementColumns: [],
        },
      }));
    } finally {
      setValidatingColumns((prev) => {
        const updated = { ...prev };
        delete updated[originalFile];
        return updated;
      });
    }
  };

  const handleFileChange = async (originalFile: string, replacementFile: string) => {
    setFileReplacements((prev) =>
      prev.map((repl) =>
        repl.original_file === originalFile
          ? {
              ...repl,
              replacement_file: replacementFile || null,
              keep_original: !replacementFile || replacementFile.trim() === '',
            }
          : repl
      )
    );

    // Validate column match if replacement file is selected
    if (replacementFile && replacementFile !== 'original') {
      await validateColumnMatch(originalFile, replacementFile);
    } else {
      // Clear validation if keeping original
      setFileColumnValidation((prev) => {
        const updated = { ...prev };
        delete updated[originalFile];
        return updated;
      });
    }
  };

  const handleKeepOriginalToggle = (originalFile: string, keepOriginal: boolean) => {
    setFileReplacements((prev) =>
      prev.map((repl) =>
        repl.original_file === originalFile
          ? { ...repl, keep_original: keepOriginal, replacement_file: keepOriginal ? null : repl.replacement_file }
          : repl
      )
    );
  };

  const handleRunPipeline = async () => {
    if (!projectContext) {
      toast({
        title: 'Error',
        description: 'Project context is missing. Please select a project first.',
        variant: 'destructive',
      });
      return;
    }

    // Validate all file replacements have matching columns
    const invalidReplacements = Object.entries(fileColumnValidation).filter(
      ([_, validation]) => !(validation as { isValid: boolean }).isValid
    );

    if (invalidReplacements.length > 0) {
      toast({
        title: 'Column Mismatch',
        description: `Some replacement files have different columns than their original files. Please fix the mismatches before running the pipeline.`,
        variant: 'destructive',
      });
      return;
    }

    // Check if any replacement files are still being validated
    const stillValidating = Object.values(validatingColumns).some(v => v);
    if (stillValidating) {
      toast({
        title: 'Validation in Progress',
        description: 'Please wait for column validation to complete.',
        variant: 'default',
      });
      return;
    }

    setRunning(true);
    try {
      const replacements = fileReplacements
        .filter((repl) => !repl.keep_original && repl.replacement_file)
        .map((repl) => ({
          original_file: repl.original_file,
          replacement_file: repl.replacement_file,
          keep_original: false,
        }));

      const requestBody = {
        client_name: projectContext.client_name || '',
        app_name: projectContext.app_name || '',
        project_name: projectContext.project_name || '',
        mode: mode,
        file_replacements: replacements,
      };

      const response = await fetch(`${PIPELINE_API}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.status === 'success') {
        toast({
          title: 'Pipeline Started',
          description: `Executing ${result.executed_atoms} atoms. Processing results...`,
          variant: 'default',
        });
        
        // Process each atom execution and update frontend state
        const executionLog = result.execution_log || [];
        let processedCount = 0;
        let successCount = 0;
        let failedCount = 0;
        
        // Process each atom execution
        for (const logEntry of executionLog) {
          if (logEntry.status === 'success' && logEntry.task_response) {
            try {
              const atomInstanceId = logEntry.atom_instance_id;
              const atomType = logEntry.atom_type || '';
              const taskResponse = logEntry.task_response;
              
              // Resolve task response (poll if needed, or get result if already complete)
              const taskResult = await resolveTaskResponse(taskResponse);
              
              // Check for success status (can be 'SUCCESS' or 'success')
              const isSuccess = (taskResult.status === 'SUCCESS' || taskResult.task_status === 'success' || taskResult.status === 'success');
              
              // Get current atom to preserve existing settings
              const currentAtom = getAtom(atomInstanceId);
              const currentSettings = currentAtom?.settings || {};
              
              // Handle different atom types
              if (atomType === 'groupby-wtg-avg') {
                const resultFile = taskResult.result_file || taskResult.result?.result_file;
                const stepConfig = logEntry.configuration || {};
                
                // Get init_result from logEntry (contains identifiers/measures from /init)
                const initResult = logEntry.init_result || taskResult.init_result;
                
                // Prepare settings update object
                const settingsUpdate: any = {};
                
                // 1. Update identifiers and measures from /init result (if available)
                if (initResult && initResult.status === 'SUCCESS') {
                  if (initResult.identifiers && Array.isArray(initResult.identifiers)) {
                    settingsUpdate.identifiers = initResult.identifiers;
                  }
                  if (initResult.measures && Array.isArray(initResult.measures)) {
                    settingsUpdate.measures = initResult.measures;
                  }
                  if (initResult.numeric_measures && Array.isArray(initResult.numeric_measures)) {
                    settingsUpdate.numericMeasures = initResult.numeric_measures;
                  }
                }
                
                // 2. Apply stored configurations from MongoDB (identifiers, aggregations)
                if (stepConfig.identifiers && Array.isArray(stepConfig.identifiers)) {
                  settingsUpdate.selectedIdentifiers = stepConfig.identifiers;
                }
                if (stepConfig.aggregations && typeof stepConfig.aggregations === 'object') {
                  // Convert aggregations to selectedMeasures format
                  const selectedMeasures: any[] = [];
                  Object.entries(stepConfig.aggregations).forEach(([field, aggConfig]: [string, any]) => {
                    if (aggConfig && typeof aggConfig === 'object') {
                      selectedMeasures.push({
                        field: field,
                        aggregation: aggConfig.agg || 'sum',
                      });
                    }
                  });
                  if (selectedMeasures.length > 0) {
                    settingsUpdate.selectedMeasures = selectedMeasures;
                    settingsUpdate.selectedMeasureNames = selectedMeasures.map(m => m.field);
                  }
                }
                
                // 3. Update dataSource to replacement file (if it was replaced)
                if (stepConfig.file_key && stepConfig.file_key !== currentSettings.dataSource) {
                  settingsUpdate.dataSource = stepConfig.file_key;
                }
                
                if (isSuccess && resultFile) {
                  // Update atom settings with results (same as normal perform)
                  let resultData: any = {
                    result_file: resultFile,
                    row_count: taskResult.row_count || taskResult.result?.row_count || 0,
                    columns: taskResult.columns || taskResult.result?.columns || [],
                  };
                  
                  // If we have results data directly, include it
                  if (taskResult.results && Array.isArray(taskResult.results)) {
                    resultData.unsaved_data = taskResult.results;
                    resultData.result_shape = [taskResult.results.length, Object.keys(taskResult.results[0] || {}).length];
                    
                    // Update atom settings in Zustand store (include init and config updates)
                    updateAtomSettings(atomInstanceId, {
                      ...settingsUpdate,
                      groupbyResults: resultData,
                    });
                  } else {
                    // Fallback: fetch results from cached dataframe (same as normal perform)
                    try {
                      const totalRows = typeof resultData.row_count === 'number' ? resultData.row_count : 1000;
                      const pageSize = Math.min(Math.max(totalRows, 50), 1000);
                      const cachedUrl = `${GROUPBY_API}/cached_dataframe?object_name=${encodeURIComponent(resultFile)}&page=1&page_size=${pageSize}`;
                      const cachedRes = await fetch(cachedUrl);
                      let cachedPayload: any = {};
                      try {
                        cachedPayload = await cachedRes.json();
                      } catch {}
                      
                      if (cachedRes.ok) {
                        const cachedData = (await resolveTaskResponse(cachedPayload)) || {};
                        const csvText = String(cachedData?.data ?? '');
                        const lines = csvText.split('\n');
                        
                        if (lines.length > 1) {
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
                          
                          resultData.unsaved_data = rows;
                          resultData.result_shape = [rows.length, headers.length];
                        }
                      }
                      
                      // Update atom settings in Zustand store (include init and config updates)
                      updateAtomSettings(atomInstanceId, {
                        ...settingsUpdate,
                        groupbyResults: resultData,
                      });
                    } catch (fetchError) {
                      console.error('Error fetching cached dataframe:', fetchError);
                      // Still update with what we have
                      updateAtomSettings(atomInstanceId, {
                        ...settingsUpdate,
                        groupbyResults: resultData,
                      });
                    }
                  }
                  
                  successCount++;
                  processedCount++;
                } else {
                  // Even if execution failed, still apply init and config updates
                  if (Object.keys(settingsUpdate).length > 0) {
                    updateAtomSettings(atomInstanceId, settingsUpdate);
                  }
                  
                  failedCount++;
                  processedCount++;
                }
              } else if (atomType === 'feature-overview') {
                // Feature overview doesn't have result_file, results are in MongoDB
                // Force re-render by updating timestamp and dataSource
                const stepConfig = logEntry.configuration || {};
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render by changing timestamp
                };
                
                // Get additional_results (from uniquecount execution, after auto-classification)
                // Also check logEntry directly (passed from backend)
                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryIdentifiers = logEntry.identifiers;
                const logEntryMeasures = logEntry.measures;
                const logEntryNumericMeasures = logEntry.numeric_measures;
                const logEntryDimensions = logEntry.dimensions;
                
                // 1. Update identifiers and measures (fetched after auto-classification, like groupby init)
                // Priority: logEntry (from backend) > additionalResults
                if (logEntryIdentifiers && Array.isArray(logEntryIdentifiers)) {
                  updateData.identifiers = logEntryIdentifiers;
                } else if (additionalResults.identifiers && Array.isArray(additionalResults.identifiers)) {
                  updateData.identifiers = additionalResults.identifiers;
                }
                
                if (logEntryMeasures && Array.isArray(logEntryMeasures)) {
                  updateData.measures = logEntryMeasures;
                } else if (additionalResults.measures && Array.isArray(additionalResults.measures)) {
                  updateData.measures = additionalResults.measures;
                }
                
                if (logEntryNumericMeasures && Array.isArray(logEntryNumericMeasures)) {
                  updateData.numericColumns = logEntryNumericMeasures;
                } else if (additionalResults.numeric_measures && Array.isArray(additionalResults.numeric_measures)) {
                  updateData.numericColumns = additionalResults.numeric_measures;
                }
                
                // 2. Get dimensions from logEntry or additional_results (from uniquecount execution)
                const dimensions = logEntryDimensions || additionalResults?.dimensions;
                if (dimensions) {
                  // Set as originalDimensionMap to preserve all dimensions (this is the source of truth)
                  updateData.originalDimensionMap = dimensions;
                  
                  // 3. Apply stored dimensionMap from configuration (selected dimensions)
                  const storedDimensionMap = stepConfig.dimensionMap || stepConfig.dimensions;
                  if (storedDimensionMap && typeof storedDimensionMap === 'object') {
                    // Merge stored selections with original dimensions to preserve deselected ones
                    const mergedDimensionMap: Record<string, string[]> = {};
                    Object.keys(dimensions).forEach(dimName => {
                      mergedDimensionMap[dimName] = dimensions[dimName] || [];
                    });
                    Object.keys(storedDimensionMap).forEach(dimName => {
                      if (mergedDimensionMap[dimName]) {
                        mergedDimensionMap[dimName] = storedDimensionMap[dimName] || [];
                      } else {
                        mergedDimensionMap[dimName] = storedDimensionMap[dimName] || [];
                      }
                    });
                    updateData.dimensionMap = mergedDimensionMap; // Selected dimensions
                  } else {
                    // If no stored selection, use all dimensions as selected
                    updateData.dimensionMap = dimensions;
                  }
                }
                
                // 4. Apply stored yAxes from configuration (selected measures for "Select Dependant Variables for SKU Analysis")
                // Check both stepConfig and API calls for these
                if (stepConfig.yAxes && Array.isArray(stepConfig.yAxes)) {
                  updateData.yAxes = stepConfig.yAxes;
                }
                if (stepConfig.xAxis && typeof stepConfig.xAxis === 'string') {
                  updateData.xAxis = stepConfig.xAxis;
                }
                
                // 5. Apply stored combination from MongoDB
                if (stepConfig.combination) {
                  try {
                    const combination = typeof stepConfig.combination === 'string' 
                      ? JSON.parse(stepConfig.combination) 
                      : stepConfig.combination;
                    if (combination && typeof combination === 'object') {
                      // Store combination for summary endpoint
                      updateData.combination = combination;
                    }
                  } catch (e) {
                    console.warn('Failed to parse combination:', e);
                  }
                }
                
                // Also check API calls for yAxes, xAxis, and combination
                const apiCalls = logEntry.api_calls || [];
                for (const apiCall of apiCalls) {
                  if (apiCall.endpoint?.includes('/summary')) {
                    const params = apiCall.params || {};
                    // Check for yAxes
                    if (params.yAxes && Array.isArray(params.yAxes)) {
                      updateData.yAxes = params.yAxes;
                    }
                    // Check for xAxis
                    if (params.xAxis && typeof params.xAxis === 'string') {
                      updateData.xAxis = params.xAxis;
                    }
                    // Check for combination
                    if (params.combination) {
                      try {
                        const combination = typeof params.combination === 'string'
                          ? JSON.parse(params.combination)
                          : params.combination;
                        if (combination && typeof combination === 'object') {
                          updateData.combination = combination;
                        }
                      } catch (e) {
                        console.warn('Failed to parse combination from API call:', e);
                      }
                    }
                  }
                }
                
                // Update dataSource to replacement file (if it was replaced)
                if (stepConfig.file_key && stepConfig.file_key !== currentSettings.dataSource) {
                  updateData.dataSource = stepConfig.file_key;
                } else if (stepConfig.object_names) {
                  // If file_key not available, try object_names
                  const objectNames = Array.isArray(stepConfig.object_names) 
                    ? stepConfig.object_names[0] 
                    : stepConfig.object_names;
                  if (objectNames && objectNames !== currentSettings.dataSource) {
                    updateData.dataSource = objectNames;
                  }
                }
                
                // Clear cached results to force re-fetch
                updateData.skuTable = [];
                updateData.statDataMap = {};
                
                // Update atom settings to trigger re-render and re-fetch
                updateAtomSettings(atomInstanceId, updateData);
                
                successCount++;
                processedCount++;
              } else if (atomType === 'correlation') {
                // Correlation atom - update settings from configuration
                const stepConfig = logEntry.configuration || {};
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render
                };
                
                // Get additional_results from execution
                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};
                
                // 1. Update file_path/dataSource to replacement file (always update even if same, to ensure consistency)
                if (stepConfig.file_path) {
                  updateData.selectedFile = stepConfig.file_path;
                } else if (stepConfig.file_key) {
                  updateData.selectedFile = stepConfig.file_key;
                }
                
                // 1a. ALWAYS load column summary (like feature-overview identifiers/measures and pivot-table columns)
                // Priority: logEntry (from backend) > logEntryAdditionalResults > additionalResults
                // This ensures filters and numerical columns are always up-to-date, even if filename is the same
                const columnSummary = logEntry.column_summary 
                  || logEntryAdditionalResults.column_summary 
                  || additionalResults.column_summary;
                const columns = logEntry.columns 
                  || logEntryAdditionalResults.columns 
                  || additionalResults.columns;
                const filterOptions = logEntry.filter_options 
                  || logEntryAdditionalResults.filter_options 
                  || additionalResults.filter_options;
                const numericalColumns = logEntry.numerical_columns 
                  || logEntryAdditionalResults.numerical_columns 
                  || additionalResults.numerical_columns;
                
                // Extract columns and filter options from column_summary if not directly available
                let extractedColumns = columns;
                let extractedFilterOptions = filterOptions;
                let extractedNumericalColumns = numericalColumns;
                
                if (columnSummary && columnSummary.summary) {
                  const summary = Array.isArray(columnSummary.summary) ? columnSummary.summary : [];
                  if (!extractedColumns) {
                    extractedColumns = summary.map((item: any) => item.column).filter(Boolean);
                  }
                  if (!extractedFilterOptions) {
                    extractedFilterOptions = {};
                    summary.forEach((item: any) => {
                      const column = item.column;
                      if (column && item.unique_values) {
                        extractedFilterOptions[column] = item.unique_values;
                        extractedFilterOptions[column.toLowerCase()] = item.unique_values;
                      }
                    });
                  }
                  if (!extractedNumericalColumns) {
                    extractedNumericalColumns = [];
                    summary.forEach((item: any) => {
                      const column = item.column;
                      const dataType = String(item.data_type || '').toLowerCase();
                      if (column && (dataType.includes('int') || dataType.includes('float') || dataType.includes('number'))) {
                        extractedNumericalColumns.push(column);
                      }
                    });
                  }
                }
                
                // Always update columns, filter options, and numerical columns (like feature-overview always updates identifiers/measures)
                if (extractedColumns && Array.isArray(extractedColumns) && extractedColumns.length > 0) {
                  updateData.availableColumns = extractedColumns;
                }
                if (extractedFilterOptions && typeof extractedFilterOptions === 'object' && Object.keys(extractedFilterOptions).length > 0) {
                  updateData.filterOptions = extractedFilterOptions; // Replace entirely, don't merge
                }
                if (extractedNumericalColumns && Array.isArray(extractedNumericalColumns) && extractedNumericalColumns.length > 0) {
                  updateData.numericalColumns = extractedNumericalColumns; // Replace entirely, don't merge
                }
                
                // 2. Apply stored configuration from MongoDB
                if (stepConfig.identifier_columns && Array.isArray(stepConfig.identifier_columns)) {
                  updateData.selectedColumns = [
                    ...(currentSettings.selectedColumns || []),
                    ...stepConfig.identifier_columns.filter((col: string) => !currentSettings.selectedColumns?.includes(col))
                  ];
                }
                if (stepConfig.measure_columns && Array.isArray(stepConfig.measure_columns)) {
                  updateData.selectedColumns = [
                    ...(currentSettings.selectedColumns || []),
                    ...stepConfig.measure_columns.filter((col: string) => !currentSettings.selectedColumns?.includes(col))
                  ];
                }
                
                // 3. Apply stored correlation method
                if (stepConfig.method && typeof stepConfig.method === 'string') {
                  updateData.settings = {
                    ...currentSettings.settings,
                    correlationMethod: stepConfig.method,
                  };
                }
                
                // 4. Apply stored filters
                if (stepConfig.identifier_filters && Array.isArray(stepConfig.identifier_filters)) {
                  const filterDimensions: Record<string, string[]> = {};
                  stepConfig.identifier_filters.forEach((filter: any) => {
                    if (filter.column && Array.isArray(filter.values)) {
                      filterDimensions[filter.column] = filter.values;
                    }
                  });
                  if (Object.keys(filterDimensions).length > 0) {
                    updateData.settings = {
                      ...updateData.settings,
                      filterDimensions: {
                        ...(currentSettings.settings?.filterDimensions || {}),
                        ...filterDimensions,
                      },
                    };
                  }
                }
                
                // 5. Apply stored date settings
                if (stepConfig.date_column && typeof stepConfig.date_column === 'string') {
                  updateData.settings = {
                    ...updateData.settings,
                    dateColumn: stepConfig.date_column,
                  };
                }
                if (stepConfig.date_range_filter && typeof stepConfig.date_range_filter === 'object') {
                  updateData.settings = {
                    ...updateData.settings,
                    dateFrom: stepConfig.date_range_filter.start,
                    dateTo: stepConfig.date_range_filter.end,
                  };
                }
                if (stepConfig.aggregation_level && typeof stepConfig.aggregation_level === 'string') {
                  updateData.settings = {
                    ...updateData.settings,
                    aggregationLevel: stepConfig.aggregation_level,
                  };
                }
                
                // 6. Update correlation results if available
                // Get correlation_results from multiple sources (backend may return it in different places)
                const correlationResults = additionalResults.correlation_results 
                  || logEntry.correlation_results 
                  || logEntry.additional_results?.correlation_results;
                
                if (correlationResults) {
                  // Extract correlation_matrix dictionary
                  const correlationMatrixDict = correlationResults.correlation_matrix || correlationResults.results?.correlation_matrix || {};
                  
                  // Get columns_used for variables (from multiple sources)
                  const columnsUsed = additionalResults.columns_used 
                    || logEntry.columns_used 
                    || correlationResults.numeric_columns 
                    || stepConfig.columns 
                    || [];
                  
                  // Transform correlation_matrix dictionary to 2D array (same logic as CorrelationCanvas)
                  const transformCorrelationMatrix = (correlationDict: any, variables: string[]): { matrix: number[][], filteredVariables: string[] } => {
                    if (!correlationDict || typeof correlationDict !== "object") {
                      return {
                        matrix: variables.map((_, i) => variables.map((_, j) => (i === j ? 1.0 : 0.0))),
                        filteredVariables: variables,
                      };
                    }
                    
                    const validVariables = variables.filter(
                      (variable) => correlationDict[variable] && typeof correlationDict[variable] === "object"
                    );
                    
                    if (validVariables.length === 0) {
                      return {
                        matrix: [[1.0]],
                        filteredVariables: variables.length > 0 ? [variables[0]] : ["Unknown"],
                      };
                    }
                    
                    try {
                      const matrix = validVariables.map((rowVar) => {
                        const rowData = correlationDict[rowVar];
                        return validVariables.map((colVar) => {
                          if (rowVar === colVar) return 1.0;
                          const value = rowData[colVar];
                          return typeof value === "number" && isFinite(value) ? value : 0.0;
                        });
                      });
                      return { matrix, filteredVariables: validVariables };
                    } catch (error) {
                      return {
                        matrix: validVariables.map((_, i) => validVariables.map((_, j) => (i === j ? 1.0 : 0.0))),
                        filteredVariables: validVariables,
                      };
                    }
                  };
                  
                  const { matrix, filteredVariables } = transformCorrelationMatrix(correlationMatrixDict, columnsUsed);
                  
                  // Update correlationMatrix and variables (required for canvas to display)
                  updateData.correlationMatrix = matrix;
                  updateData.variables = filteredVariables;
                  updateData.selectedVar1 = null;
                  updateData.selectedVar2 = null;
                  updateData.timeSeriesData = [];
                  updateData.timeSeriesIsDate = true;
                }
                
                // Get correlation fields from multiple sources
                const correlationId = additionalResults.correlation_id || logEntry.correlation_id;
                const filteredFilePath = additionalResults.filtered_file_path || logEntry.filtered_file_path;
                const columnsUsed = additionalResults.columns_used || logEntry.columns_used;
                const dateAnalysis = additionalResults.date_analysis || logEntry.date_analysis;
                
                if (correlationId) {
                  updateData.correlationId = correlationId;
                }
                if (filteredFilePath) {
                  updateData.filteredFilePath = filteredFilePath;
                }
                if (columnsUsed && Array.isArray(columnsUsed)) {
                  updateData.selectedColumns = columnsUsed;
                }
                if (dateAnalysis) {
                  updateData.dateAnalysis = dateAnalysis;
                }
                
                // Update atom settings
                updateAtomSettings(atomInstanceId, updateData);
                
                successCount++;
                processedCount++;
              } else if (atomType === 'pivot-table') {
                // Handle pivot-table atom updates
                // Force re-render by updating timestamp (like feature-overview)
                const stepConfig = logEntry.configuration || {};
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render by changing timestamp
                };
                
                // Get additional_results from execution
                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};
                
                // Prioritize logEntry for direct backend-provided data, then task_response, then additional_results
                const pivotResults = logEntry.pivot_results 
                  || logEntryAdditionalResults.pivot_results 
                  || additionalResults.pivot_results 
                  || taskResponse.data 
                  || taskResult.data;
                const pivotHierarchy = logEntry.pivot_hierarchy 
                  || logEntryAdditionalResults.pivot_hierarchy 
                  || additionalResults.pivot_hierarchy 
                  || taskResponse.hierarchy 
                  || taskResult.hierarchy;
                const pivotColumnHierarchy = logEntry.pivot_column_hierarchy 
                  || logEntryAdditionalResults.pivot_column_hierarchy 
                  || additionalResults.pivot_column_hierarchy 
                  || taskResponse.column_hierarchy 
                  || taskResult.column_hierarchy;
                const pivotRowCount = logEntry.pivot_row_count 
                  || logEntryAdditionalResults.pivot_row_count 
                  || additionalResults.pivot_row_count 
                  || taskResponse.rows 
                  || taskResult.rows;
                const pivotUpdatedAt = logEntry.pivot_updated_at 
                  || logEntryAdditionalResults.pivot_updated_at 
                  || additionalResults.pivot_updated_at 
                  || taskResponse.updated_at 
                  || taskResult.updated_at;
                
                // 1. Update dataSource to replacement file (if it was replaced)
                // Always update even if same, to ensure consistency
                if (stepConfig.data_source) {
                  updateData.dataSource = stepConfig.data_source;
                } else if (stepConfig.file_key) {
                  updateData.dataSource = stepConfig.file_key;
                }
                
                // 1a. ALWAYS load column summary (like feature-overview identifiers/measures)
                // Priority: logEntry (from backend) > logEntryAdditionalResults > additionalResults
                // This ensures columns and filter options are always up-to-date, even if filename is the same
                const columnSummary = logEntry.column_summary 
                  || logEntryAdditionalResults.column_summary 
                  || additionalResults.column_summary;
                const columns = logEntry.columns 
                  || logEntryAdditionalResults.columns 
                  || additionalResults.columns;
                const filterOptions = logEntry.filter_options 
                  || logEntryAdditionalResults.filter_options 
                  || additionalResults.filter_options;
                
                // Extract columns from column_summary if not directly available
                let extractedColumns = columns;
                let extractedFilterOptions = filterOptions;
                
                if (columnSummary && columnSummary.summary) {
                  const summary = Array.isArray(columnSummary.summary) ? columnSummary.summary : [];
                  if (!extractedColumns) {
                    extractedColumns = summary.map((item: any) => item.column).filter(Boolean);
                  }
                  if (!extractedFilterOptions) {
                    extractedFilterOptions = {};
                    summary.forEach((item: any) => {
                      const column = item.column;
                      if (column && item.unique_values) {
                        extractedFilterOptions[column] = item.unique_values;
                        extractedFilterOptions[column.toLowerCase()] = item.unique_values;
                      }
                    });
                  }
                }
                
                // Always update columns and filter options (like feature-overview always updates identifiers/measures)
                if (extractedColumns && Array.isArray(extractedColumns) && extractedColumns.length > 0) {
                  updateData.dataSourceColumns = extractedColumns;
                  updateData.fields = extractedColumns;
                }
                if (extractedFilterOptions && typeof extractedFilterOptions === 'object' && Object.keys(extractedFilterOptions).length > 0) {
                  updateData.pivotFilterOptions = extractedFilterOptions; // Replace entirely, don't merge
                }
                
                // 2. Update pivot results if available
                if (pivotResults && Array.isArray(pivotResults)) {
                  updateData.pivotResults = pivotResults;
                }
                if (pivotHierarchy && Array.isArray(pivotHierarchy)) {
                  updateData.pivotHierarchy = pivotHierarchy;
                }
                if (pivotColumnHierarchy && Array.isArray(pivotColumnHierarchy)) {
                  updateData.pivotColumnHierarchy = pivotColumnHierarchy;
                }
                if (pivotRowCount !== undefined && pivotRowCount !== null) {
                  updateData.pivotRowCount = pivotRowCount;
                }
                if (pivotUpdatedAt) {
                  updateData.pivotUpdatedAt = pivotUpdatedAt;
                }
                
                // 3. Apply stored configuration from MongoDB
                if (stepConfig.rows && Array.isArray(stepConfig.rows)) {
                  updateData.rowFields = stepConfig.rows;
                }
                if (stepConfig.columns && Array.isArray(stepConfig.columns)) {
                  updateData.columnFields = stepConfig.columns;
                }
                if (stepConfig.values && Array.isArray(stepConfig.values)) {
                  updateData.valueFields = stepConfig.values;
                }
                if (stepConfig.filters && Array.isArray(stepConfig.filters)) {
                  // Convert filters to pivotFilterSelections format
                  const filterSelections: Record<string, string[]> = {};
                  stepConfig.filters.forEach((filter: any) => {
                    if (filter.field && filter.include && Array.isArray(filter.include)) {
                      filterSelections[filter.field] = filter.include;
                    }
                  });
                  if (Object.keys(filterSelections).length > 0) {
                    updateData.pivotFilterSelections = {
                      ...(currentSettings.pivotFilterSelections || {}),
                      ...filterSelections,
                    };
                  }
                }
                if (stepConfig.sorting && typeof stepConfig.sorting === 'object') {
                  updateData.pivotSorting = stepConfig.sorting;
                }
                if (stepConfig.grand_totals) {
                  updateData.grandTotalsMode = stepConfig.grand_totals;
                }
                
                // 4. Update status
                updateData.pivotStatus = 'success';
                updateData.pivotError = null;
                
                // Update atom settings
                updateAtomSettings(atomInstanceId, updateData);
                
                successCount++;
                processedCount++;
              } else if (atomType === 'merge') {
                // Handle merge atom updates
                const stepConfig = logEntry.configuration || {};
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render
                };

                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};

                // Prioritize logEntry for direct backend-provided data
                const mergeResults = logEntryAdditionalResults.merge_results || additionalResults.merge_results;
                const initResult = logEntryAdditionalResults.init_result || additionalResults.init_result;
                const savedFile = logEntryAdditionalResults.saved_file || additionalResults.saved_file;
                const rowCount = logEntryAdditionalResults.row_count || additionalResults.row_count;
                const columns = logEntryAdditionalResults.columns || additionalResults.columns;
                const saveResult = logEntryAdditionalResults.save_result || additionalResults.save_result;
                const commonColumns = logEntryAdditionalResults.common_columns || additionalResults.common_columns || initResult?.common_columns;

                // Update init result (common columns)
                if (initResult && initResult.common_columns) {
                  updateData.availableColumns = Array.isArray(initResult.common_columns) ? initResult.common_columns : [];
                } else if (commonColumns && Array.isArray(commonColumns)) {
                  updateData.availableColumns = commonColumns;
                }

                // Update merge results
                if (mergeResults) {
                  updateData.mergeResults = mergeResults;
                  // Set unsavedData from mergeResults.data (CSV data) so canvas can display it
                  if (mergeResults.data) {
                    updateData.unsavedData = mergeResults.data;
                  }
                }
                
                // Update saved file path
                if (savedFile) {
                  updateData.resultFilePath = savedFile;
                  updateData.unsavedData = null; // Clear unsaved data if file is saved
                } else if (mergeResults && mergeResults.data) {
                  // If no saved file but we have merge results, use unsaved data
                  updateData.unsavedData = mergeResults.data;
                }
                
                if (rowCount !== undefined) {
                  updateData.rowCount = rowCount;
                }
                if (columns && Array.isArray(columns)) {
                  updateData.columns = columns;
                }
                if (saveResult) {
                  updateData.saveResult = saveResult;
                }

                // Restore other settings from stepConfig
                if (stepConfig.file1) {
                  updateData.file1 = stepConfig.file1;
                }
                if (stepConfig.file2) {
                  updateData.file2 = stepConfig.file2;
                }
                if (stepConfig.join_columns) {
                  updateData.joinColumns = Array.isArray(stepConfig.join_columns) 
                    ? stepConfig.join_columns 
                    : (typeof stepConfig.join_columns === 'string' ? JSON.parse(stepConfig.join_columns) : []);
                }
                if (stepConfig.join_type) {
                  updateData.joinType = stepConfig.join_type;
                }

                updateAtomSettings(atomInstanceId, updateData);
                successCount++;
                processedCount++;
              } else if (atomType === 'concat') {
                // Handle concat atom updates
                const stepConfig = logEntry.configuration || {};
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render
                };

                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};

                // Prioritize logEntry for direct backend-provided data
                const concatResults = logEntryAdditionalResults.concat_results || additionalResults.concat_results;
                const initResult = logEntryAdditionalResults.init_result || additionalResults.init_result;
                const savedFile = logEntryAdditionalResults.saved_file || additionalResults.saved_file;
                const rowCount = logEntryAdditionalResults.row_count || additionalResults.row_count;
                const columns = logEntryAdditionalResults.columns || additionalResults.columns;
                const saveResult = logEntryAdditionalResults.save_result || additionalResults.save_result;
                const concatId = logEntryAdditionalResults.concat_id || additionalResults.concat_id;

                // Update init result
                if (initResult) {
                  updateData.initResult = initResult;
                }

                // Update concat results
                if (concatResults) {
                  updateData.concatResults = concatResults;
                  // Set unsavedData from concatResults.data (CSV data) so canvas can display it
                  if (concatResults.data) {
                    updateData.unsavedData = concatResults.data;
                    updateData.fullCsv = concatResults.data;
                  }
                }
                
                // Update saved file path
                if (savedFile) {
                  updateData.resultFilePath = savedFile;
                  updateData.unsavedData = null; // Clear unsaved data if file is saved
                } else if (concatResults && concatResults.data) {
                  // If no saved file but we have concat results, use unsaved data
                  updateData.unsavedData = concatResults.data;
                  updateData.fullCsv = concatResults.data;
                }
                
                if (concatId) {
                  updateData.concatId = concatId;
                }
                if (rowCount !== undefined) {
                  updateData.rowCount = rowCount;
                }
                if (columns && Array.isArray(columns)) {
                  updateData.columns = columns;
                }
                if (saveResult) {
                  updateData.saveResult = saveResult;
                }

                // Restore other settings from stepConfig
                if (stepConfig.file1) {
                  updateData.file1 = stepConfig.file1;
                }
                if (stepConfig.file2) {
                  updateData.file2 = stepConfig.file2;
                }
                if (stepConfig.concat_direction) {
                  updateData.direction = stepConfig.concat_direction;
                }

                updateAtomSettings(atomInstanceId, updateData);
                successCount++;
                processedCount++;
              } else if (atomType === 'chart-maker') {
                // Handle chart-maker atom updates
                console.log('🔄 [PIPELINE] ChartMaker restoration started', {
                  atomInstanceId,
                  logEntry: logEntry.configuration,
                });
                
                const stepConfig = logEntry.configuration || {};
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render
                  pipelineRestored: true, // Flag to preserve charts during file load
                };

                // Get additional_results from execution
                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};

                // 1. Update dataSource/fileId to replacement file (always update even if same, to ensure consistency)
                const fileId = stepConfig.file_id || logEntryAdditionalResults.file_id || additionalResults.file_id;
                console.log('🔄 [PIPELINE] ChartMaker fileId resolution', {
                  stepConfig_file_id: stepConfig.file_id,
                  logEntry_file_id: logEntryAdditionalResults.file_id,
                  additionalResults_file_id: additionalResults.file_id,
                  resolved_fileId: fileId,
                  currentSettings_dataSource: currentSettings.dataSource,
                  currentSettings_fileId: currentSettings.fileId,
                });
                
                if (fileId) {
                  updateData.dataSource = fileId;
                  updateData.fileId = fileId;
                  updateData.selectedDataSource = fileId;
                  console.log('✅ [PIPELINE] ChartMaker fileId updated', { fileId });
                }
                
                // 1a. ALWAYS load column summary (like feature-overview identifiers/measures and pivot-table columns)
                // Priority: logEntry (from backend) > logEntryAdditionalResults > additionalResults
                // This ensures column options for each dropdown are always up-to-date, even if filename is the same
                const columnSummary = logEntry.column_summary 
                  || logEntryAdditionalResults.column_summary 
                  || additionalResults.column_summary;
                const columns = logEntry.columns 
                  || logEntryAdditionalResults.columns 
                  || additionalResults.columns;
                
                // Extract columns from column_summary if not directly available
                let extractedColumns = columns;
                
                if (columnSummary && columnSummary.summary) {
                  const summary = Array.isArray(columnSummary.summary) ? columnSummary.summary : [];
                  if (!extractedColumns) {
                    extractedColumns = summary.map((item: any) => item.column).filter(Boolean);
                  }
                }
                
                // Always update columns for dropdown options (like feature-overview always updates identifiers/measures)
                if (extractedColumns && Array.isArray(extractedColumns) && extractedColumns.length > 0) {
                  // Update uploadedData with fresh columns for all dropdowns
                  updateData.uploadedData = {
                    ...(currentSettings.uploadedData || {}),
                    columns: extractedColumns,
                    allColumns: extractedColumns,
                    numeric_columns: extractedColumns.filter((col: string) => {
                      // Try to identify numeric columns from column summary
                      if (columnSummary && columnSummary.summary) {
                        const item = columnSummary.summary.find((s: any) => s.column === col);
                        if (item) {
                          const dataType = String(item.data_type || '').toLowerCase();
                          return dataType.includes('int') || dataType.includes('float') || dataType.includes('number');
                        }
                      }
                      return false;
                    }),
                    numericColumns: extractedColumns.filter((col: string) => {
                      if (columnSummary && columnSummary.summary) {
                        const item = columnSummary.summary.find((s: any) => s.column === col);
                        if (item) {
                          const dataType = String(item.data_type || '').toLowerCase();
                          return dataType.includes('int') || dataType.includes('float') || dataType.includes('number');
                        }
                      }
                      return false;
                    }),
                    categorical_columns: extractedColumns.filter((col: string) => {
                      if (columnSummary && columnSummary.summary) {
                        const item = columnSummary.summary.find((s: any) => s.column === col);
                        if (item) {
                          const dataType = String(item.data_type || '').toLowerCase();
                          return !(dataType.includes('int') || dataType.includes('float') || dataType.includes('number'));
                        }
                      }
                      return true;
                    }),
                    categoricalColumns: extractedColumns.filter((col: string) => {
                      if (columnSummary && columnSummary.summary) {
                        const item = columnSummary.summary.find((s: any) => s.column === col);
                        if (item) {
                          const dataType = String(item.data_type || '').toLowerCase();
                          return !(dataType.includes('int') || dataType.includes('float') || dataType.includes('number'));
                        }
                      }
                      return true;
                    }),
                    unique_values: (() => {
                      const uniqueValues: Record<string, string[]> = {};
                      if (columnSummary && columnSummary.summary) {
                        columnSummary.summary.forEach((item: any) => {
                          if (item.column && item.unique_values) {
                            uniqueValues[item.column] = item.unique_values;
                          }
                        });
                      }
                      return uniqueValues;
                    })(),
                    uniqueValuesByColumn: (() => {
                      const uniqueValues: Record<string, string[]> = {};
                      if (columnSummary && columnSummary.summary) {
                        columnSummary.summary.forEach((item: any) => {
                          if (item.column && item.unique_values) {
                            uniqueValues[item.column] = item.unique_values;
                          }
                        });
                      }
                      return uniqueValues;
                    })(),
                  };
                }
 
                // 2. If we have a file_id, try to reload file data FIRST to get fresh columns and unique values
                // This is needed to map column names case-insensitively
                let loadedFileData: any = null;
                if (fileId && isSuccess) {
                  try {
                    console.log('🔄 [PIPELINE] ChartMaker loading file data', { fileId });
                    // Try to load the file to get column information
                    const loadResponse = await fetch(`${CHART_MAKER_API}/load-saved-dataframe`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ object_name: fileId })
                    });

                    if (loadResponse.ok) {
                      const fileData = await loadResponse.json();
                      const resolvedData = await resolveTaskResponse(fileData);
                      
                      if (resolvedData) {
                        loadedFileData = resolvedData;
                        console.log('✅ [PIPELINE] ChartMaker file data loaded', {
                          columns: resolvedData.columns?.length || 0,
                          columns_list: resolvedData.columns || [],
                          file_id: resolvedData.file_id || fileId,
                          row_count: resolvedData.row_count || 0,
                        });
                        
                        updateData.uploadedData = {
                          columns: resolvedData.columns || [],
                          allColumns: resolvedData.columns || [],
                          rows: resolvedData.sample_data || [],
                          numeric_columns: resolvedData.numeric_columns || [],
                          numericColumns: resolvedData.numeric_columns || [],
                          categorical_columns: resolvedData.categorical_columns || [],
                          categoricalColumns: resolvedData.categorical_columns || [],
                          unique_values: resolvedData.unique_values || {},
                          uniqueValuesByColumn: resolvedData.unique_values || {},
                          file_id: resolvedData.file_id || fileId,
                          row_count: resolvedData.row_count || 0
                        };
                      }
                    } else {
                      console.warn('⚠️ [PIPELINE] ChartMaker file load failed', { status: loadResponse.status });
                    }
                  } catch (loadError) {
                    console.warn('❌ [PIPELINE] Could not reload chartmaker file data:', loadError);
                    // Continue without file data - charts will need to be manually re-rendered
                  }
                } else {
                  console.log('⏭️ [PIPELINE] ChartMaker skipping file load', { fileId, isSuccess });
                }

                // 3. Restore chart configurations from stored configuration
                // Create case-insensitive column mapping if we have file data (needed for both paths)
                const columnMapping: Record<string, string> = {};
                if (loadedFileData && loadedFileData.columns) {
                  loadedFileData.columns.forEach((col: string) => {
                    columnMapping[col.toLowerCase()] = col;
                  });
                  console.log('✅ [PIPELINE] ChartMaker column mapping created', {
                    mapping_count: Object.keys(columnMapping).length,
                    sample_mapping: Object.entries(columnMapping).slice(0, 5),
                  });
                } else {
                  console.warn('⚠️ [PIPELINE] ChartMaker no file data for column mapping');
                }

                // Helper function to map column name case-insensitively
                const mapColumn = (colName: string | undefined): string | undefined => {
                  if (!colName) return colName;
                  // Normalize the input column name (trim and lowercase)
                  const normalizedColName = colName.trim().toLowerCase();
                  
                  // If we have a mapping, use it (case-insensitive lookup)
                  if (Object.keys(columnMapping).length > 0) {
                    const mapped = columnMapping[normalizedColName];
                    if (mapped) {
                      if (mapped !== colName) {
                        console.log(`🔍 [PIPELINE] Column mapped (case-insensitive): "${colName}" -> "${mapped}"`);
                      }
                      return mapped;
                    }
                  }
                  
                  // Fallback: try to find case-insensitive match in loadedFileData columns directly
                  if (loadedFileData && loadedFileData.columns && Array.isArray(loadedFileData.columns)) {
                    const found = loadedFileData.columns.find((col: string) => 
                      col && typeof col === 'string' && col.trim().toLowerCase() === normalizedColName
                    );
                    if (found) {
                      console.log(`🔍 [PIPELINE] Column found via case-insensitive search: "${colName}" -> "${found}"`);
                      return found;
                    }
                  }
                  
                  return colName;
                };
                
                // Find ALL chart API calls to restore multiple charts
                const apiCalls = logEntry.api_calls || [];
                const chartApiCalls = apiCalls.filter((call: any) => {
                  const endpoint = call.endpoint || '';
                  return endpoint.includes('/chart-maker/charts') || endpoint.includes('/api/chart-maker/charts');
                });
                
                console.log('🔄 [PIPELINE] ChartMaker found chart API calls', {
                  total_api_calls: apiCalls.length,
                  chart_api_calls: chartApiCalls.length,
                });
                
                // If we have chart API calls, restore each as a separate chart
                // Otherwise, fall back to stepConfig.traces (for backward compatibility)
                if (chartApiCalls.length > 0) {
                  console.log('🔄 [PIPELINE] ChartMaker restoring charts from API calls', {
                    chart_count: chartApiCalls.length,
                  });
                  
                  // Group API calls by chart title + trace columns to deduplicate
                  // Same chart might have multiple API calls (create + update), keep only the last one
                  const chartsByKey = new Map<string, any>();
                  
                  chartApiCalls.forEach((chartCall: any, chartIdx: number) => {
                    const chartParams = chartCall.params || {};
                    const chartTraces = chartParams.traces || [];
                    
                    if (chartTraces.length > 0) {
                      // Map column names to actual file columns (case-insensitive)
                      const restoredTraces = chartTraces.map((trace: any, traceIdx: number) => {
                        const mapped = {
                          x_column: mapColumn(trace.x_column),
                          y_column: mapColumn(trace.y_column),
                          name: trace.name || mapColumn(trace.y_column) || trace.y_column,
                          aggregation: trace.aggregation || 'sum',
                          chart_type: trace.chart_type || chartParams.chart_type || 'line',
                          legend_field: trace.legend_field ? mapColumn(trace.legend_field) : undefined, // Restore legend_field (segregation)
                        };
                        console.log(`📊 [PIPELINE] Chart ${chartIdx + 1}, Trace ${traceIdx + 1} restored`, {
                          original: { x: trace.x_column, y: trace.y_column, legend_field: trace.legend_field },
                          mapped: { x: mapped.x_column, y: mapped.y_column, legend_field: mapped.legend_field },
                        });
                        return mapped;
                      });
                      
                      const firstTrace = restoredTraces.length > 0 ? restoredTraces[0] : null;
                      
                      // Create a unique key: title + first trace columns (to identify duplicate charts)
                      const chartTitle = chartParams.title || `Chart ${chartIdx + 1}`;
                      const traceKey = firstTrace ? `${firstTrace.x_column}_${firstTrace.y_column}` : '';
                      const chartKey = `${chartTitle}_${traceKey}`;
                      
                      // Extract legendField from first trace (for segregation)
                      const legendField = firstTrace?.legend_field || chartParams.legend_field ? mapColumn(chartParams.legend_field || firstTrace?.legend_field) : undefined;
                      
                      // Detect dual Y-axis: 2 traces with same x_column and different y_columns (no legend_field)
                      const isDualYAxis = (
                        restoredTraces.length === 2 &&
                        restoredTraces[0].x_column &&
                        restoredTraces[1].x_column &&
                        restoredTraces[0].x_column.toLowerCase() === restoredTraces[1].x_column.toLowerCase() &&
                        restoredTraces[0].y_column &&
                        restoredTraces[1].y_column &&
                        restoredTraces[0].y_column.toLowerCase() !== restoredTraces[1].y_column.toLowerCase() &&
                        !restoredTraces[0].legend_field &&
                        !restoredTraces[1].legend_field
                      );
                      
                      // Extract secondYAxis and dualAxisMode from configuration or detect from traces
                      const secondYAxis = chartParams.second_y_axis 
                        ? mapColumn(chartParams.second_y_axis) 
                        : (isDualYAxis && restoredTraces.length >= 2 ? restoredTraces[1].y_column : undefined);
                      const dualAxisMode = chartParams.dual_axis_mode || (secondYAxis ? 'dual' : undefined);
                      
                      // Extract aggregation from first trace
                      const aggregation = firstTrace?.aggregation || 'sum';
                      
                      const chartConfig: any = {
                        // Don't set ID yet - will be assigned after deduplication
                        type: chartParams.chart_type || 'line',
                        title: chartTitle,
                        traces: restoredTraces,
                        xAxis: firstTrace?.x_column || '',
                        yAxis: firstTrace?.y_column || '',
                        secondYAxis: secondYAxis, // Restore second Y-axis if dual Y-axis chart
                        dualAxisMode: dualAxisMode, // Restore axis mode ('dual' or 'single')
                        aggregation: aggregation, // Restore aggregation from first trace
                        legendField: legendField || 'aggregate', // Restore legendField (segregation) - default to 'aggregate' if not set
                        chartRendered: false,
                        chartLoading: false,
                        filters: {},
                      };
                      
                      // Add filters if they exist - ensure values are arrays
                      if (chartParams.filters && typeof chartParams.filters === 'object' && chartParams.filters !== null) {
                        const mappedFilters: Record<string, any> = {};
                        Object.keys(chartParams.filters).forEach((key: string) => {
                          const mappedKey = mapColumn(key) || key;
                          const filterValue = chartParams.filters[key];
                          // Ensure filter value is an array (it should be, but double-check)
                          mappedFilters[mappedKey] = Array.isArray(filterValue) ? filterValue : (filterValue ? [filterValue] : []);
                        });
                        chartConfig.filters = mappedFilters;
                        console.log(`🔍 [PIPELINE] Chart ${chartIdx + 1} filters restored`, {
                          filter_keys: Object.keys(mappedFilters),
                          filter_values: Object.entries(mappedFilters).map(([k, v]) => ({ key: k, count: Array.isArray(v) ? v.length : 0 })),
                        });
                      }
                      
                      // Store the chart, overwriting if we've seen this key before (keeps the last/latest version)
                      chartsByKey.set(chartKey, chartConfig);
                      console.log(`📋 [PIPELINE] Chart stored with key: ${chartKey}`, {
                        title: chartTitle,
                        trace_key: traceKey,
                        total_unique_charts: chartsByKey.size
                      });
                    }
                  });
                  
                  // Convert map to array (deduplicated charts) and assign unique IDs
                  const restoredCharts = Array.from(chartsByKey.values()).map((chart: any, idx: number) => ({
                    ...chart,
                    id: `chart_${idx}`, // Assign unique IDs based on final array index
                  }));
                  
                  if (restoredCharts.length > 0) {
                    updateData.charts = restoredCharts;
                    updateData.currentChart = restoredCharts[0];
                    console.log('✅ [PIPELINE] ChartMaker restored multiple charts (deduplicated)', {
                      original_api_calls: chartApiCalls.length,
                      unique_charts: restoredCharts.length,
                      chart_titles: restoredCharts.map((c: any) => c.title),
                      chart_ids: restoredCharts.map((c: any) => c.id),
                    });
                  }
                } else if (stepConfig.traces && Array.isArray(stepConfig.traces) && stepConfig.traces.length > 0) {
                  // Fallback: restore from stepConfig.traces (backward compatibility)
                  console.log('🔄 [PIPELINE] ChartMaker restoring traces from stepConfig (fallback)', {
                    traces_count: stepConfig.traces.length,
                    original_traces: stepConfig.traces,
                  });
                  
                  // Reconstruct chart with all traces (simple mode - one chart)
                  // Map column names to actual file columns (case-insensitive)
                  const restoredTraces = stepConfig.traces.map((trace: any, idx: number) => {
                    const mapped = {
                      x_column: mapColumn(trace.x_column),
                      y_column: mapColumn(trace.y_column),
                      name: trace.name || mapColumn(trace.y_column) || trace.y_column,
                      aggregation: trace.aggregation || 'sum',
                      chart_type: trace.chart_type || stepConfig.chart_type || 'line',
                      legend_field: trace.legend_field ? mapColumn(trace.legend_field) : undefined, // Restore legend_field (segregation)
                    };
                    console.log(`📊 [PIPELINE] Trace ${idx + 1} restored`, {
                      original: { x: trace.x_column, y: trace.y_column, legend_field: trace.legend_field },
                      mapped: { x: mapped.x_column, y: mapped.y_column, legend_field: mapped.legend_field },
                    });
                    return mapped;
                  });

                  // In simple mode, the properties panel reads xAxis and yAxis from the chart object
                  // Extract from first trace for simple mode
                  const firstTrace = restoredTraces.length > 0 ? restoredTraces[0] : null;
                  const secondTrace = restoredTraces.length > 1 ? restoredTraces[1] : null;
                  
                  // Extract legendField from first trace or stepConfig (for segregation)
                  const legendField = firstTrace?.legend_field || (stepConfig.legend_field ? mapColumn(stepConfig.legend_field) : undefined);
                  
                  // Detect dual Y-axis: 2 traces with same x_column and different y_columns (no legend_field)
                  const isDualYAxis = (
                    restoredTraces.length === 2 &&
                    restoredTraces[0].x_column &&
                    restoredTraces[1].x_column &&
                    restoredTraces[0].x_column.toLowerCase() === restoredTraces[1].x_column.toLowerCase() &&
                    restoredTraces[0].y_column &&
                    restoredTraces[1].y_column &&
                    restoredTraces[0].y_column.toLowerCase() !== restoredTraces[1].y_column.toLowerCase() &&
                    !restoredTraces[0].legend_field &&
                    !restoredTraces[1].legend_field
                  );
                  
                  // Extract secondYAxis and dualAxisMode from configuration or detect from traces
                  const secondYAxis = stepConfig.second_y_axis 
                    ? mapColumn(stepConfig.second_y_axis) 
                    : (isDualYAxis && restoredTraces.length >= 2 ? restoredTraces[1].y_column : undefined);
                  const dualAxisMode = stepConfig.dual_axis_mode || (secondYAxis ? 'dual' : undefined);
                  
                  // Extract aggregation from first trace
                  const aggregation = firstTrace?.aggregation || 'sum';
                  
                  const chartConfig: any = {
                    id: 'chart_0',
                    type: stepConfig.chart_type || 'line',
                    title: stepConfig.title || 'Chart',
                    traces: restoredTraces,
                    // Set xAxis and yAxis for simple mode properties panel
                    xAxis: firstTrace?.x_column || '',
                    yAxis: firstTrace?.y_column || '',
                    secondYAxis: secondYAxis, // Restore second Y-axis if dual Y-axis chart
                    dualAxisMode: dualAxisMode, // Restore axis mode ('dual' or 'single')
                    aggregation: aggregation, // Restore aggregation from first trace
                    legendField: legendField || 'aggregate', // Restore legendField (segregation) - default to 'aggregate' if not set
                    chartRendered: false, // Will be re-rendered after file loads
                    chartLoading: false,
                    filters: {}, // Always initialize filters as empty object
                  };

                  // Add filters if they exist, mapping keys to actual column names - ensure values are arrays
                  if (stepConfig.filters && typeof stepConfig.filters === 'object' && stepConfig.filters !== null) {
                    const mappedFilters: Record<string, any> = {};
                    Object.keys(stepConfig.filters).forEach((key: string) => {
                      const mappedKey = mapColumn(key) || key;
                      const filterValue = stepConfig.filters[key];
                      // Ensure filter value is an array (it should be, but double-check)
                      mappedFilters[mappedKey] = Array.isArray(filterValue) ? filterValue : (filterValue ? [filterValue] : []);
                    });
                    chartConfig.filters = mappedFilters;
                    console.log('🔍 [PIPELINE] ChartMaker filters mapped', {
                      original_keys: Object.keys(stepConfig.filters),
                      mapped_keys: Object.keys(mappedFilters),
                      filter_values: Object.entries(mappedFilters).map(([k, v]) => ({ key: k, count: Array.isArray(v) ? v.length : 0 })),
                    });
                  }

                  updateData.charts = [chartConfig];
                  updateData.currentChart = chartConfig;
                  console.log('✅ [PIPELINE] ChartMaker chart config created', {
                    chart_type: chartConfig.type,
                    traces_count: chartConfig.traces.length,
                    chartRendered: chartConfig.chartRendered,
                  });
                } else {
                  console.warn('⚠️ [PIPELINE] ChartMaker no traces to restore', {
                    has_traces: !!stepConfig.traces,
                    traces_type: typeof stepConfig.traces,
                    traces_length: Array.isArray(stepConfig.traces) ? stepConfig.traces.length : 'not array',
                  });
                }

                // 4. Get chart result from additional_results if available
                const chartResult = additionalResults.chart_result || logEntryAdditionalResults.chart_result;
                const chartConfigFromExecution = additionalResults.chart_config || logEntryAdditionalResults.chart_config;
                const dataSummary = additionalResults.data_summary || logEntryAdditionalResults.data_summary;

                // Check if file was replaced (fileId changed from original)
                // Use input_files[0] as the original file, not stepConfig.file_id (which may have been updated during execution)
                const originalFileId = logEntry.input_files && logEntry.input_files.length > 0 
                  ? logEntry.input_files[0] 
                  : stepConfig.file_id;
                const wasFileReplaced = fileId && originalFileId && fileId !== originalFileId;

                console.log('🔄 [PIPELINE] ChartMaker checking execution results', {
                  has_chartConfigFromExecution: !!chartConfigFromExecution,
                  has_chartResult: !!chartResult,
                  has_updateData_charts: !!updateData.charts,
                  charts_length: updateData.charts?.length || 0,
                  has_loadedFileData: !!loadedFileData,
                  originalFileId,
                  replacementFileId: fileId,
                  wasFileReplaced,
                });

                // Check if we have multiple charts - if so, don't use single execution config
                // The execution config only contains the LAST chart, not all charts
                const hasMultipleCharts = updateData.charts && updateData.charts.length > 1;
                const allChartResults = additionalResults.all_chart_results || logEntryAdditionalResults.all_chart_results;
                
                // Check if chart has filters or legendField (segregation) - if so, always mark for re-render
                const firstChartHasFilters = updateData.charts && updateData.charts.length > 0 
                  ? (updateData.charts[0].filters && Object.keys(updateData.charts[0].filters).length > 0)
                  : false;
                const firstChartHasLegendField = updateData.charts && updateData.charts.length > 0
                  ? (updateData.charts[0].legendField && updateData.charts[0].legendField !== 'aggregate')
                  : false;
                const needsReRender = firstChartHasFilters || firstChartHasLegendField;
                
                if (chartConfigFromExecution && updateData.charts && updateData.charts.length > 0 && !wasFileReplaced && !hasMultipleCharts && !needsReRender) {
                  // Update the first (and only) chart with the rendered config from execution
                  // Only use execution config if file was NOT replaced AND we have only ONE chart AND no filters/legendField
                  // (execution config only contains the last chart's result, and filters/legendField need re-render)
                  console.log('✅ [PIPELINE] ChartMaker using execution chart config (file not replaced, single chart, no filters/legendField)');
                  
                  // Ensure xAxis and yAxis are set from traces for properties panel
                  const firstTrace = updateData.charts[0].traces && updateData.charts[0].traces.length > 0 
                    ? updateData.charts[0].traces[0] 
                    : null;
                  
                  updateData.charts[0] = {
                    ...updateData.charts[0],
                    // Preserve xAxis and yAxis from traces for properties panel
                    xAxis: updateData.charts[0].xAxis || firstTrace?.x_column || '',
                    yAxis: updateData.charts[0].yAxis || firstTrace?.y_column || '',
                    // Preserve legendField, dualAxisMode, aggregation, and secondYAxis from restored config
                    legendField: updateData.charts[0].legendField,
                    dualAxisMode: updateData.charts[0].dualAxisMode,
                    aggregation: updateData.charts[0].aggregation,
                    secondYAxis: updateData.charts[0].secondYAxis,
                    chartConfig: chartConfigFromExecution,
                    chartRendered: false, // 🔧 CRITICAL: Always mark as not rendered when pipeline runs, even if file name is same
                    filteredData: chartConfigFromExecution.data || [],
                    pipelineAutoRender: true, // 🔧 CRITICAL: Always set flag to trigger auto-render when pipeline runs
                  };
                  updateData.chartRendered = false; // 🔧 CRITICAL: Always mark as not rendered when pipeline runs
                  updateData.pipelineAutoRender = true; // 🔧 CRITICAL: Always set flag when pipeline runs
                  updateData.autoRenderAfterPipeline = true; // 🔧 CRITICAL: Set flag for useEffect dependency
                } else if (needsReRender && updateData.charts && updateData.charts.length > 0) {
                  // Chart has filters or legendField - mark for re-render to ensure they are applied
                  console.log('🔄 [PIPELINE] ChartMaker chart has filters or legendField - marking for re-render', {
                    has_filters: firstChartHasFilters,
                    has_legendField: firstChartHasLegendField,
                    filter_keys: Object.keys(updateData.charts[0].filters || {}),
                    legendField: updateData.charts[0].legendField,
                  });
                  updateData.charts[0] = {
                    ...updateData.charts[0],
                    chartRendered: false,
                    chartLoading: false,
                    pipelineAutoRender: true,
                  };
                  updateData.chartRendered = false;
                  updateData.pipelineAutoRender = true;
                } else if (hasMultipleCharts && allChartResults && Array.isArray(allChartResults) && allChartResults.length > 0) {
                  // If we have multiple charts AND all chart results from execution, match them by configuration
                  console.log('✅ [PIPELINE] ChartMaker using all chart results from execution', {
                    charts_count: updateData.charts.length,
                    results_count: allChartResults.length
                  });
                  
                  // Match chart results to restored charts by comparing title and trace columns
                  // Get the original API call params to match results to charts
                  const chartApiCalls = (logEntry.api_calls || []).filter((call: any) => {
                    const endpoint = call.endpoint || '';
                    return endpoint.includes('/chart-maker/charts') || endpoint.includes('/api/chart-maker/charts');
                  });
                  
                  updateData.charts = updateData.charts.map((chart: any) => {
                    // Find matching chart result by comparing title and first trace columns
                    const firstTrace = chart.traces && chart.traces.length > 0 ? chart.traces[0] : null;
                    const chartXColumn = firstTrace?.x_column || '';
                    const chartYColumn = firstTrace?.y_column || '';
                    const chartTitle = chart.title || '';
                    const chartLegendField = chart.legendField || '';
                    
                    // Try to find matching API call - use the LAST match (most recent) since charts are deduplicated
                    let matchingResultIndex = -1;
                    for (let i = chartApiCalls.length - 1; i >= 0; i--) {
                      const apiCall = chartApiCalls[i];
                      const apiParams = apiCall.params || {};
                      const apiTraces = apiParams.traces || [];
                      const apiFirstTrace = apiTraces.length > 0 ? apiTraces[0] : null;
                      const apiXColumn = mapColumn(apiFirstTrace?.x_column || '');
                      const apiYColumn = mapColumn(apiFirstTrace?.y_column || '');
                      const apiTitle = apiParams.title || '';
                      const apiLegendField = mapColumn(apiFirstTrace?.legend_field) || apiFirstTrace?.legend_field || '';
                      
                      // Match by title, trace columns, and legendField (case-insensitive)
                      if (
                        chartTitle.toLowerCase() === apiTitle.toLowerCase() &&
                        chartXColumn.toLowerCase() === apiXColumn.toLowerCase() &&
                        chartYColumn.toLowerCase() === apiYColumn.toLowerCase() &&
                        chartLegendField.toLowerCase() === apiLegendField.toLowerCase()
                      ) {
                        matchingResultIndex = i;
                        break; // Found the last (most recent) match
                      }
                    }
                    
                    // If found matching API call, use corresponding result
                    if (matchingResultIndex >= 0 && matchingResultIndex < allChartResults.length) {
                      const chartResult = allChartResults[matchingResultIndex];
                      if (chartResult && chartResult.chart_config) {
                        // Check if chart has filters or legendField - if so, always mark for re-render to ensure they are applied
                        const hasFilters = chart.filters && Object.keys(chart.filters).length > 0;
                        const hasLegendField = chart.legendField && chart.legendField !== 'aggregate';
                        const shouldReRender = wasFileReplaced || hasFilters || hasLegendField;
                        
                        console.log(`✅ [PIPELINE] Matched chart "${chartTitle}" to result ${matchingResultIndex}`, {
                          chart_x: chartXColumn,
                          chart_y: chartYColumn,
                          chart_legend: chartLegendField,
                          hasFilters,
                          hasLegendField,
                          wasFileReplaced,
                          shouldReRender,
                        });
                        
                        // 🔧 CRITICAL: Always mark for re-render when pipeline runs, even if file name is same
                        // This ensures charts are re-rendered with potentially updated data
                        return {
                          ...chart,
                          xAxis: chart.xAxis || chartXColumn,
                          yAxis: chart.yAxis || chartYColumn,
                          // Preserve legendField, dualAxisMode, aggregation, and secondYAxis from restored config
                          legendField: chart.legendField,
                          dualAxisMode: chart.dualAxisMode,
                          aggregation: chart.aggregation,
                          secondYAxis: chart.secondYAxis,
                          chartConfig: undefined, // 🔧 CRITICAL: Always clear config to force re-render when pipeline runs
                          chartRendered: false, // 🔧 CRITICAL: Always mark as not rendered when pipeline runs
                          filteredData: undefined, // 🔧 CRITICAL: Always clear data to force re-render when pipeline runs
                          pipelineAutoRender: true, // 🔧 CRITICAL: Always set flag when pipeline runs, even if file name is same
                        };
                      }
                    } else {
                      console.warn(`⚠️ [PIPELINE] Could not match chart "${chartTitle}" to any result`, {
                        chart_x: chartXColumn,
                        chart_y: chartYColumn,
                        chart_legend: chartLegendField,
                        available_results: allChartResults.length,
                      });
                    }
                    
                    // 🔧 CRITICAL: If chart wasn't matched, still mark for re-render when pipeline runs
                    return {
                      ...chart,
                      chartRendered: false,
                      chartLoading: false,
                      pipelineAutoRender: true, // Always set flag when pipeline runs
                    };
                  });
                  updateData.chartRendered = false; // 🔧 CRITICAL: Always mark as not rendered when pipeline runs
                  updateData.pipelineAutoRender = true; // 🔧 CRITICAL: Always set flag when pipeline runs
                  updateData.autoRenderAfterPipeline = true; // 🔧 CRITICAL: Set flag for useEffect dependency
                } else if (updateData.charts && updateData.charts.length > 0 && loadedFileData) {
                  // If file was replaced OR no chart config from execution, mark ALL charts as not rendered
                  // so they will auto-render with the new file data
                  console.log('🔄 [PIPELINE] ChartMaker marking charts for auto-render', {
                    reason: wasFileReplaced ? 'file_was_replaced' : 'no_execution_config',
                    charts_count: updateData.charts.length,
                  });
                  // 🔧 CRITICAL: Mark ALL charts for auto-rendering, not just the first one
                  // Always mark for re-render when pipeline runs, even if file name is same
                  updateData.charts = updateData.charts.map((chart: any) => ({
                    ...chart,
                    chartRendered: false, // 🔧 CRITICAL: Always mark as not rendered when pipeline runs
                    chartLoading: false,
                    pipelineAutoRender: true, // 🔧 CRITICAL: Flag to trigger auto-render after pipeline restoration
                  }));
                  updateData.chartRendered = false; // 🔧 CRITICAL: Always mark as not rendered when pipeline runs
                  updateData.pipelineAutoRender = true; // 🔧 CRITICAL: Set flag at atom level too
                  updateData.autoRenderAfterPipeline = true; // 🔧 CRITICAL: Set flag for useEffect dependency
                } else {
                  console.warn('⚠️ [PIPELINE] ChartMaker cannot determine render state', {
                    has_charts: !!updateData.charts,
                    charts_length: updateData.charts?.length || 0,
                    has_loadedFileData: !!loadedFileData,
                  });
                }

                console.log('📦 [PIPELINE] ChartMaker final updateData', {
                  dataSource: updateData.dataSource,
                  fileId: updateData.fileId,
                  has_uploadedData: !!updateData.uploadedData,
                  uploadedData_columns: updateData.uploadedData?.columns?.length || 0,
                  charts_count: updateData.charts?.length || 0,
                  chart_traces: updateData.charts?.[0]?.traces?.length || 0,
                  chart_rendered: updateData.charts?.[0]?.chartRendered,
                  chart_traces_detail: updateData.charts?.[0]?.traces?.map((t: any) => ({
                    x: t.x_column,
                    y: t.y_column,
                  })),
                });

                // Update atom settings
                updateAtomSettings(atomInstanceId, updateData);
                
                // 🔧 CRITICAL: Immediately trigger auto-render by updating charts array with pipelineAutoRender flag
                // This ensures the useEffect in ChartMakerAtom detects the change and renders
                setTimeout(() => {
                  const currentAtom = useLaboratoryStore.getState().getAtom(atomInstanceId);
                  const currentSettings = currentAtom?.settings || {};
                  const currentCharts = (currentSettings as any).charts || [];
                  
                  if (currentCharts.length > 0) {
                    // Mark ALL charts for rendering with pipelineAutoRender flag
                    const chartsToRender = currentCharts.map((chart: any) => ({
                      ...chart,
                      chartRendered: false, // Force re-render
                      chartLoading: false,
                      pipelineAutoRender: true, // Set flag to trigger auto-render
                    }));
                    
                    updateAtomSettings(atomInstanceId, {
                      charts: chartsToRender, // Update charts array to trigger useEffect
                      pipelineAutoRender: true, // Set atom-level flag
                      autoRenderAfterPipeline: true, // Set flag for useEffect dependency
                    });
                  } else {
                    // Fallback: just set the flag
                    updateAtomSettings(atomInstanceId, {
                      autoRenderAfterPipeline: true,
                      pipelineAutoRender: true,
                    });
                  }
                }, 500);
                
                successCount++;
                processedCount++;
              } else {
                // Other atom types - just mark as processed
                if (isSuccess) {
                  successCount++;
                } else {
                  failedCount++;
                }
                processedCount++;
              }
            } catch (error: any) {
              console.error(`Error processing atom ${logEntry.atom_instance_id}:`, error);
              failedCount++;
              processedCount++;
            }
          } else if (logEntry.status === 'failed') {
            failedCount++;
            processedCount++;
          } else {
            processedCount++;
          }
        }
        
        toast({
          title: 'Pipeline Completed',
          description: `Processed ${processedCount} atoms. ${successCount} successful, ${failedCount} failed.`,
          variant: successCount > 0 ? 'default' : 'destructive',
        });
        
        onOpenChange(false);
      } else {
        toast({
          title: 'Error',
          description: result.message || 'Failed to run pipeline',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error running pipeline:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run pipeline',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  if (!projectContext) {
    return null;
  }

  const rootFiles = pipelineData?.pipeline?.root_files || [];
  const executionGraph = pipelineData?.pipeline?.execution_graph || [];
  
  // Extract root file keys for display
  const rootFileKeys = rootFiles.map((rf: any) => rf.file_key || rf);
  
  // Extract derived files with their execution details (only .arrow files, exclude CSV temp files)
  const derivedFilesMap = new Map<string, {
    file_key: string;
    save_as_name?: string;
    is_default_name?: boolean;
    step: any;
    output: any;
  }>();
  
  executionGraph.forEach((step: any) => {
    step.outputs?.forEach((output: any) => {
      if (output.file_key && output.file_key.endsWith('.arrow')) {
        derivedFilesMap.set(output.file_key, {
          file_key: output.file_key,
          save_as_name: output.save_as_name,
          is_default_name: output.is_default_name,
          step: step,
          output: output,
        });
      }
    });
  });
  
  const derivedFiles = Array.from(derivedFilesMap.values());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run Pipeline</DialogTitle>
          <DialogDescription>
            Review root files and configure replacements before re-executing all atoms in the pipeline.
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading pipeline data...</span>
          </div>
        ) : !pipelineData ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>No pipeline execution data found.</p>
            <p className="text-sm mt-2">Execute some atoms first to create pipeline data.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pipeline Summary */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Pipeline Summary</h3>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Atoms</div>
                  <div className="font-semibold">{pipelineData?.summary?.total_atoms || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Root Files</div>
                  <div className="font-semibold">{pipelineData?.summary?.root_files_count || 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Derived Files</div>
                  <div className="font-semibold">{pipelineData?.summary?.derived_files_count || 0}</div>
                </div>
              </div>
            </div>

            {/* Root Files Configuration */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Root Files</h3>
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                {rootFileKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No root files found.</p>
                ) : (
                  rootFileKeys.map((file: string) => {
                    const replacement = fileReplacements.find((r) => r.original_file === file);
                    const rootFileObj = rootFiles.find((rf: any) => (rf.file_key || rf) === file);
                    const originalName = rootFileObj?.original_name || file.split('/').pop() || file;
                    
                    // Find execution steps that used this file as input
                    const executionSteps = executionGraph.filter((step: any) => 
                      step.inputs?.some((input: any) => input.file_key === file)
                    );
                    
                    return (
                      <div key={file} className="border rounded-lg p-4 space-y-3">
                        {/* File row with original file and dropdown */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <Label className="text-sm font-medium mb-1 block">Original File</Label>
                            <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded truncate" title={file}>
                              {originalName}
                            </div>
                            {file !== originalName && (
                              <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-1 rounded truncate mt-1" title={file}>
                                {file}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <Label className="text-sm font-medium mb-1 block">Replacement File</Label>
                            <Select
                              value={
                                replacement?.keep_original !== false && !replacement?.replacement_file
                                  ? 'original'
                                  : replacement?.replacement_file || 'original'
                              }
                              onValueChange={async (value) => {
                                if (value === 'original') {
                                  handleKeepOriginalToggle(file, true);
                                  await handleFileChange(file, '');
                                } else {
                                  handleKeepOriginalToggle(file, false);
                                  await handleFileChange(file, value);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Select replacement file" />
                              </SelectTrigger>
                              <SelectContent className="z-[20000] max-h-[300px]">
                                <SelectItem value="original">Keep Original</SelectItem>
                                {savedDataframes.length > 0 ? (
                                  savedDataframes
                                    .filter((df: any) => {
                                      // Exclude derived files
                                      const isDerived = derivedFilesMap.has(df.object_name);
                                      return !isDerived;
                                    })
                                    .map((df: any) => (
                                      <SelectItem key={df.object_name} value={df.object_name}>
                                        {df.display_name || df.object_name.split('/').pop() || df.object_name}
                                      </SelectItem>
                                    ))
                                ) : (
                                  <SelectItem value="no-files" disabled>No files available</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            Root
                          </Badge>
                        </div>
                        
                        {/* Column validation status */}
                        {fileColumnValidation[file] && (
                          <div className={`text-xs p-2 rounded ${
                            fileColumnValidation[file].isValid 
                              ? 'bg-green-50 text-green-700 border border-green-200' 
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {validatingColumns[file] ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Validating columns...</span>
                              </div>
                            ) : fileColumnValidation[file].isValid ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Columns match ✓</span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-3 w-3" />
                                  <span className="font-medium">{fileColumnValidation[file].error}</span>
                                </div>
                                {fileColumnValidation[file].originalColumns.length > 0 && (
                                  <div className="pl-5 text-[10px]">
                                    Original: {fileColumnValidation[file].originalColumns.join(', ')}
                                  </div>
                                )}
                                {fileColumnValidation[file].replacementColumns.length > 0 && (
                                  <div className="pl-5 text-[10px]">
                                    Replacement: {fileColumnValidation[file].replacementColumns.join(', ')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Execution details below the file */}
                        {executionSteps.length > 0 && (
                          <div className="space-y-2 pt-2 border-t">
                            <Label className="text-xs font-semibold text-muted-foreground">Executions Using This File</Label>
                            <div className="space-y-2">
                              {executionSteps.map((step: any, idx: number) => {
                                const exec = step.execution || {};
                                const status = exec.status || 'pending';
                                const duration = exec.duration_ms || 0;
                                const startedAt = exec.started_at ? new Date(exec.started_at).toLocaleString() : 'N/A';
                                const apiCalls = step.api_calls || [];
                                
                                return (
                                  <div key={idx} className="bg-muted/50 rounded p-2 text-xs space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                        {status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                                        {status === 'pending' && <Clock className="h-3 w-3 text-yellow-500" />}
                                        <span className="font-medium">{step.atom_title || step.atom_type}</span>
                                        <Badge variant="outline" className="text-[10px]">
                                          {step.atom_type}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-2 text-muted-foreground">
                                        <Clock className="h-3 w-3" />
                                        <span>{duration}ms</span>
                                      </div>
                                    </div>
                                    <div className="text-muted-foreground pl-5">
                                      Started: {startedAt}
                                    </div>
                                    {exec.error && (
                                      <div className="text-red-500 pl-5 text-[10px]">
                                        Error: {exec.error}
                                      </div>
                                    )}
                                    
                                    {/* API Calls Section */}
                                    {apiCalls.length > 0 && (
                                      <div className="pl-5 pt-1 space-y-1 border-t border-muted-foreground/20 mt-1">
                                        <div className="text-[10px] font-semibold text-muted-foreground">
                                          API Calls ({apiCalls.length}):
                                        </div>
                                        <div className="space-y-1">
                                          {apiCalls.map((apiCall: any, apiIdx: number) => {
                                            const apiTimestamp = apiCall.timestamp 
                                              ? new Date(apiCall.timestamp).toLocaleTimeString() 
                                              : 'N/A';
                                            const apiMethod = apiCall.method || 'N/A';
                                            const apiEndpoint = apiCall.endpoint || 'N/A';
                                            const apiStatus = apiCall.response_status || 0;
                                            const isSuccess = apiStatus >= 200 && apiStatus < 300;
                                            
                                            return (
                                              <div key={apiIdx} className="bg-background/50 rounded p-1.5 text-[10px] space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                  <span className={`font-mono ${isSuccess ? 'text-green-600' : apiStatus >= 400 ? 'text-red-600' : 'text-yellow-600'}`}>
                                                    {apiMethod}
                                                  </span>
                                                  <span className="text-muted-foreground truncate flex-1">
                                                    {apiEndpoint}
                                                  </span>
                                                  {apiStatus > 0 && (
                                                    <Badge 
                                                      variant="outline" 
                                                      className={`text-[9px] ${
                                                        isSuccess ? 'text-green-600 border-green-600' 
                                                        : apiStatus >= 400 ? 'text-red-600 border-red-600' 
                                                        : 'text-yellow-600 border-yellow-600'
                                                      }`}
                                                    >
                                                      {apiStatus}
                                                    </Badge>
                                                  )}
                                                </div>
                                                {apiCall.timestamp && (
                                                  <div className="text-[9px] text-muted-foreground pl-1">
                                                    {apiTimestamp}
                                                  </div>
                                                )}
                                                {apiCall.response_data && typeof apiCall.response_data === 'object' && (
                                                  <details className="pl-1 mt-0.5">
                                                    <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground">
                                                      View Response
                                                    </summary>
                                                    <pre className="text-[9px] bg-muted p-1 rounded mt-0.5 overflow-x-auto max-h-20 overflow-y-auto">
                                                      {JSON.stringify(apiCall.response_data, null, 2)}
                                                    </pre>
                                                  </details>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Derived Files with Execution Details */}
            {derivedFiles.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Derived Files</h3>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {derivedFiles.map((derivedFile: any) => {
                    const file = derivedFile.file_key;
                    const step = derivedFile.step;
                    const output = derivedFile.output;
                    const exec = step.execution || {};
                    const status = exec.status || 'pending';
                    const duration = exec.duration_ms || 0;
                    const startedAt = exec.started_at ? new Date(exec.started_at).toLocaleString() : 'N/A';
                    const apiCalls = step.api_calls || [];
                    const fileName = derivedFile.save_as_name || file.split('/').pop() || file;
                    
                    return (
                      <div key={file} className="border rounded-lg p-4 space-y-3">
                        {/* File info */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <Label className="text-sm font-medium mb-1 block">Derived File</Label>
                            <div className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded truncate" title={file}>
                              {fileName}
                            </div>
                            {file !== fileName && (
                              <div className="text-xs text-muted-foreground font-mono bg-muted/50 p-1 rounded truncate mt-1" title={file}>
                                {file}
                              </div>
                            )}
                            {derivedFile.save_as_name && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {derivedFile.is_default_name ? 'Default name' : `Saved as: ${derivedFile.save_as_name}`}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            Derived
                          </Badge>
                        </div>
                        
                        {/* Execution details */}
                        <div className="space-y-2 pt-2 border-t">
                          <Label className="text-xs font-semibold text-muted-foreground">Created By</Label>
                          <div className="bg-muted/50 rounded p-2 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                {status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                                {status === 'pending' && <Clock className="h-3 w-3 text-yellow-500" />}
                                <span className="font-medium">{step.atom_title || step.atom_type}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {step.atom_type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{duration}ms</span>
                              </div>
                            </div>
                            <div className="text-muted-foreground pl-5">
                              Started: {startedAt}
                            </div>
                            {exec.error && (
                              <div className="text-red-500 pl-5 text-[10px]">
                                Error: {exec.error}
                              </div>
                            )}
                            
                            {/* API Calls Section */}
                            {apiCalls.length > 0 && (
                              <div className="pl-5 pt-1 space-y-1 border-t border-muted-foreground/20 mt-1">
                                <div className="text-[10px] font-semibold text-muted-foreground">
                                  API Calls ({apiCalls.length}):
                                </div>
                                <div className="space-y-1">
                                  {apiCalls.map((apiCall: any, apiIdx: number) => {
                                    const apiTimestamp = apiCall.timestamp 
                                      ? new Date(apiCall.timestamp).toLocaleTimeString() 
                                      : 'N/A';
                                    const apiMethod = apiCall.method || 'N/A';
                                    const apiEndpoint = apiCall.endpoint || 'N/A';
                                    const apiStatus = apiCall.response_status || 0;
                                    const isSuccess = apiStatus >= 200 && apiStatus < 300;
                                    
                                    return (
                                      <div key={apiIdx} className="bg-background/50 rounded p-1.5 text-[10px] space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className={`font-mono ${isSuccess ? 'text-green-600' : apiStatus >= 400 ? 'text-red-600' : 'text-yellow-600'}`}>
                                            {apiMethod}
                                          </span>
                                          <span className="text-muted-foreground truncate flex-1">
                                            {apiEndpoint}
                                          </span>
                                          {apiStatus > 0 && (
                                            <Badge 
                                              variant="outline" 
                                              className={`text-[9px] ${
                                                isSuccess ? 'text-green-600 border-green-600' 
                                                : apiStatus >= 400 ? 'text-red-600 border-red-600' 
                                                : 'text-yellow-600 border-yellow-600'
                                              }`}
                                            >
                                              {apiStatus}
                                            </Badge>
                                          )}
                                        </div>
                                        {apiCall.timestamp && (
                                          <div className="text-[9px] text-muted-foreground pl-1">
                                            {apiTimestamp}
                                          </div>
                                        )}
                                        {apiCall.response_data && typeof apiCall.response_data === 'object' && (
                                          <details className="pl-1 mt-0.5">
                                            <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground">
                                              View Response
                                            </summary>
                                            <pre className="text-[9px] bg-muted p-1 rounded mt-0.5 overflow-x-auto max-h-20 overflow-y-auto">
                                              {JSON.stringify(apiCall.response_data, null, 2)}
                                            </pre>
                                          </details>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* File metadata */}
                        {(output.row_count > 0 || output.columns?.length > 0) && (
                          <div className="space-y-1 pt-2 border-t">
                            <Label className="text-xs font-semibold text-muted-foreground">File Metadata</Label>
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {output.row_count > 0 && (
                                <div>Rows: {output.row_count}</div>
                              )}
                              {output.columns?.length > 0 && (
                                <div>Columns: {output.columns.length}</div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Cancel
          </Button>
          <Button onClick={handleRunPipeline} disabled={loadingData || running || !pipelineData}>
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              'Run Pipeline'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PipelineModal;

