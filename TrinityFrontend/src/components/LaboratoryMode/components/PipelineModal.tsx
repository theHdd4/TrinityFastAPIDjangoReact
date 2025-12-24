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
import { PIPELINE_API, VALIDATE_API, FEATURE_OVERVIEW_API, GROUPBY_API, CHART_MAKER_API, LABORATORY_PROJECT_STATE_API } from '@/lib/api';
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
  const subMode = useLaboratoryStore(state => state.subMode);
  const setCards = useLaboratoryStore(state => state.setCards);
  const cards = useLaboratoryStore(state => state.cards);
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
      // Add timestamp to ensure we always fetch fresh data from MongoDB
      const params = new URLSearchParams({
        client_name: ctx.client_name || '',
        app_name: ctx.app_name || '',
        project_name: ctx.project_name || '',
        mode: mode,
        _t: Date.now().toString(), // Cache-busting parameter
      });

      const response = await fetch(`${PIPELINE_API}/get?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        cache: 'no-store', // Ensure we always fetch fresh data
      });
      const result = await response.json();

      if (result.status === 'success' && result.data) {
        console.log('📦 [PIPELINE] Loaded pipeline data:', {
          total_atoms: result.data?.summary?.total_atoms,
          execution_graph_length: result.data?.pipeline?.execution_graph?.length,
          execution_graph: result.data?.pipeline?.execution_graph?.map((step: any) => ({
            atom_type: step.atom_type,
            atom_title: step.atom_title,
            atom_instance_id: step.atom_instance_id,
            card_id: step.card_id,
            step_index: step.step_index,
            has_outputs: !!step.outputs?.length,
            outputs_count: step.outputs?.length || 0
          }))
        });
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
      // PRIORITY 1: First try data_summary (original columns when file was first added to pipeline)
      let originalColumns: string[] = [];
      const dataSummary = pipelineData?.pipeline?.data_summary || [];
      const summaryEntry = dataSummary.find((ds: any) => (ds.file_key || ds.file_path) === originalFile);
      if (summaryEntry?.columns && Array.isArray(summaryEntry.columns) && summaryEntry.columns.length > 0) {
        originalColumns = summaryEntry.columns;
      }

      // PRIORITY 2: If data_summary doesn't have columns, fetch from current file (fallback)
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

      // ========================================================================
      // EXCLUDE COLUMNS CREATED BY COLUMN OPERATIONS
      // ========================================================================
      // Get column operations from pipeline data that target the original file
      const columnOperations = pipelineData?.pipeline?.column_operations || [];
      const columnsToExclude = new Set<string>();
      
      // Find all column operations that target the original file
      for (const colOp of columnOperations) {
        if (colOp.input_file === originalFile) {
          // Add all created columns to exclusion set (case-insensitive)
          const createdColumns = colOp.created_columns || [];
          createdColumns.forEach((col: string) => {
            if (col) {
              const colLower = String(col).toLowerCase().trim();
              columnsToExclude.add(colLower);
              
              // Also add normalized versions to handle naming convention mismatches
              // Backend uses _x_ for multiply, _div_ for divide
              // Frontend might have saved _times_ or _dividedby_ in old records
              const normalized = colLower
                .replace(/_times_/g, '_x_')
                .replace(/_dividedby_/g, '_div_');
              if (normalized !== colLower) {
                columnsToExclude.add(normalized);
              }
              
              // Also add reverse normalization (in case backend naming is in MongoDB)
              const reverseNormalized = colLower
                .replace(/_x_/g, '_times_')
                .replace(/_div_/g, '_dividedby_');
              if (reverseNormalized !== colLower) {
                columnsToExclude.add(reverseNormalized);
              }
            }
          });
          
          // Also check operations to derive column names if created_columns is missing
          const operations = colOp.operations || [];
          operations.forEach((op: any) => {
            if (op.created_column_name) {
              const colLower = String(op.created_column_name).toLowerCase().trim();
              columnsToExclude.add(colLower);
              
              // Normalize naming conventions
              const normalized = colLower
                .replace(/_times_/g, '_x_')
                .replace(/_dividedby_/g, '_div_');
              if (normalized !== colLower) {
                columnsToExclude.add(normalized);
              }
              
              const reverseNormalized = colLower
                .replace(/_x_/g, '_times_')
                .replace(/_div_/g, '_dividedby_');
              if (reverseNormalized !== colLower) {
                columnsToExclude.add(reverseNormalized);
              }
            }
          });
        }
      }
      
      // Filter out columns that will be created by column operations
      const originalColsFiltered = originalCols.filter((col: string) => {
        const colLower = String(col).toLowerCase().trim();
        return !columnsToExclude.has(colLower);
      });
      
      const replacementColsFiltered = replacementCols.filter((col: string) => {
        const colLower = String(col).toLowerCase().trim();
        return !columnsToExclude.has(colLower);
      });

      // Compare columns: replacement file must have all original columns (but can have extra columns)
      // Use filtered columns that exclude column operation-created columns
      const originalSet = new Set(originalColsFiltered.map((c: string) => String(c).toLowerCase().trim()));
      const replacementSet = new Set(replacementColsFiltered.map((c: string) => String(c).toLowerCase().trim()));

      // Check if all original columns exist in replacement file
      const missingColumns = Array.from(originalSet).filter((col: string) => !replacementSet.has(col));
      
      const isValid = 
        originalColsFiltered.length > 0 &&
        replacementColsFiltered.length > 0 &&
        missingColumns.length === 0;

      // Find the actual column names (with original case) for missing columns
      const missingColumnsWithCase = missingColumns.map((missingColLower: string) => {
        return originalColsFiltered.find((col: string) => 
          String(col).toLowerCase().trim() === missingColLower
        ) || missingColLower;
      });

      setFileColumnValidation((prev) => ({
        ...prev,
        [originalFile]: {
          isValid,
          error: isValid 
            ? undefined 
            : missingColumnsWithCase.length > 0
              ? `Missing required columns in replacement file: ${missingColumnsWithCase.join(', ')}. Replacement file must contain all original columns but can have additional columns.`
              : `Column validation failed: Original has ${originalColsFiltered.length} columns (excluding ${columnsToExclude.size} column operation columns), replacement has ${replacementColsFiltered.length} columns`,
          originalColumns: originalColsFiltered,
          replacementColumns: replacementColsFiltered,
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

  // Helper function to update atom settings for a specific mode without switching modes
  const updateAtomForMode = async (targetMode: 'analytics' | 'dashboard', atomInstanceId: string, settings: any) => {
    try {
      // If it's the current mode, update directly in the store
      if (targetMode === subMode) {
        updateAtomSettings(atomInstanceId, settings);
        return;
      }

      // For the other mode, fetch cards with mode-specific parameter, update atom, and save back
      const modeParam = targetMode === 'analytics' ? 'laboratory' : 'laboratory-dashboard';
      const getUrl = `${LABORATORY_PROJECT_STATE_API}/get/${projectContext?.client_name}/${projectContext?.app_name}/${projectContext?.project_name}?mode=${modeParam}`;
      const getResponse = await fetch(getUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!getResponse.ok) {
        console.warn(`Failed to fetch cards for ${targetMode} mode`);
        return;
      }

      const data = await getResponse.json();
      let modeCards = data.cards || [];

      // Filter cards based on mode (dashboard mode filters atoms)
      if (targetMode === 'dashboard') {
        const DASHBOARD_ALLOWED_ATOMS = ['dataframe-operations', 'chart-maker', 'correlation', 'table'];
        const allowedAtomIdsSet = new Set(DASHBOARD_ALLOWED_ATOMS);
        modeCards = modeCards.map((card: any) => ({
          ...card,
          atoms: (card.atoms || []).filter((atom: any) => allowedAtomIdsSet.has(atom.atomId))
        })).filter((card: any) => (card.atoms || []).length > 0);
      }

      // Find and update the atom in the cards
      let updated = false;
      const updatedCards = modeCards.map((card: any) => {
        const updatedAtoms = (card.atoms || []).map((atom: any) => {
          if (atom.id === atomInstanceId) {
            updated = true;
            return {
              ...atom,
              settings: { ...atom.settings, ...settings }
            };
          }
          return atom;
        });
        return { ...card, atoms: updatedAtoms };
      });

      if (!updated) {
        console.warn(`Atom ${atomInstanceId} not found in ${targetMode} mode cards`);
        return;
      }

      // Save updated cards back to MongoDB with the correct mode
      const saveUrl = `${LABORATORY_PROJECT_STATE_API}/save`;
      const savePayload = {
        client_name: projectContext?.client_name || '',
        app_name: projectContext?.app_name || '',
        project_name: projectContext?.project_name || '',
        cards: updatedCards,
        mode: modeParam,
      };

      await fetch(saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(savePayload),
      });

      console.log(`✅ Updated atom ${atomInstanceId} for ${targetMode} mode`);
    } catch (error) {
      console.error(`Error updating atom for ${targetMode} mode:`, error);
    }
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

      // Run pipeline for both modes simultaneously
      const modes: ('analytics' | 'dashboard')[] = ['analytics', 'dashboard'];
      const results = await Promise.all(
        modes.map(async (currentMode) => {
          const requestBody = {
            client_name: projectContext.client_name || '',
            app_name: projectContext.app_name || '',
            project_name: projectContext.project_name || '',
            mode: currentMode,
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
          return { mode: currentMode, result };
        })
      );

      // Combine results from both modes
      const combinedResult = {
        status: results.every(r => r.result.status === 'success') ? 'success' : 'error',
        executed_atoms: results.reduce((sum, r) => sum + (r.result.executed_atoms || 0), 0),
        successful_atoms: results.reduce((sum, r) => sum + (r.result.successful_atoms || 0), 0),
        failed_atoms: results.reduce((sum, r) => sum + (r.result.failed_atoms || 0), 0),
        execution_log: results.flatMap(r => r.result.execution_log || []),
        message: `Pipeline executed for both modes: ${results.map(r => `${r.mode} (${r.result.executed_atoms || 0} atoms)`).join(', ')}`
      };

      if (combinedResult.status === 'success') {
        toast({
          title: 'Pipeline Started',
          description: `Executing ${combinedResult.executed_atoms} atoms across both modes. Processing results...`,
          variant: 'default',
        });
        
        // Process each mode's execution log separately
        let totalProcessedCount = 0;
        let totalSuccessCount = 0;
        let totalFailedCount = 0;

        // Process each mode's results
        for (const { mode: executionMode, result: modeResult } of results) {
          if (modeResult.status === 'success' && modeResult.execution_log) {
            const executionLog = modeResult.execution_log || [];
            let processedCount = 0;
            let successCount = 0;
            let failedCount = 0;
            
            // Process each atom execution for this mode
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
              
              // Get current atom to preserve existing settings (from current mode's store)
              const currentAtom = executionMode === subMode ? getAtom(atomInstanceId) : undefined;
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
                    
                    // Update atom settings for the specific mode (include init and config updates)
                    await updateAtomForMode(executionMode, atomInstanceId, {
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
                      
                      // Update atom settings for the specific mode (include init and config updates)
                      await updateAtomForMode(executionMode, atomInstanceId, {
                        ...settingsUpdate,
                        groupbyResults: resultData,
                      });
                    } catch (fetchError) {
                      console.error('Error fetching cached dataframe:', fetchError);
                      // Still update with what we have
                      await updateAtomForMode(executionMode, atomInstanceId, {
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
                    await updateAtomForMode(executionMode, atomInstanceId, settingsUpdate);
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
                  updateData.dataSource = String(stepConfig.file_key);
                } else if (stepConfig.object_names) {
                  // If file_key not available, try object_names
                  const objectNames = Array.isArray(stepConfig.object_names) 
                    ? stepConfig.object_names[0] 
                    : stepConfig.object_names;
                  if (objectNames && objectNames !== currentSettings.dataSource) {
                    updateData.dataSource = String(objectNames);
                  }
                }
                
                // Clear cached results to force re-fetch
                updateData.skuTable = [];
                updateData.statDataMap = {};
                
                // Update atom settings to trigger re-render and re-fetch
                await updateAtomForMode(executionMode, atomInstanceId, updateData);
                
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
                await updateAtomForMode(executionMode, atomInstanceId, updateData);
                
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
                await updateAtomForMode(executionMode, atomInstanceId, updateData);
                
                successCount++;
                processedCount++;
              } else if (atomType === 'table') {
                // Handle table atom updates
                // Force re-render by updating timestamp (like pivot-table)
                const stepConfig = logEntry.configuration || {};
                
                // CRITICAL FIX: If atomInstanceId is 'unknown', try to find the atom by card_id and canvas_position
                // This matches how other atoms work - they all need a valid atomInstanceId
                let resolvedAtomInstanceId = atomInstanceId;
                if (atomInstanceId === 'unknown' || !atomInstanceId) {
                  const cards = useLaboratoryStore.getState().cards;
                  const logCardId = logEntry.card_id;
                  const logCanvasPosition = logEntry.canvas_position ?? 0;
                  
                  // Try to find atom by card_id and canvas_position
                  if (logCardId) {
                    const card = cards.find(c => c.id === logCardId);
                    if (card && Array.isArray(card.atoms)) {
                      // Find table atom in this card
                      const tableAtom = card.atoms.find(a => a.atomId === 'table');
                      if (tableAtom) {
                        resolvedAtomInstanceId = tableAtom.id;
                        console.log('🔍 [PIPELINE] Table atom: Found atom by card_id', {
                          cardId: logCardId,
                          atomId: resolvedAtomInstanceId
                        });
                      }
                    }
                  }
                  
                  // If still not found, try to find by matching configuration (object_name/sourceFile)
                  if (resolvedAtomInstanceId === 'unknown' || !resolvedAtomInstanceId) {
                    const objectName = stepConfig.object_name || logEntry.input_files?.[0];
                    if (objectName) {
                      for (const card of cards) {
                        if (Array.isArray(card.atoms)) {
                          const matchingAtom = card.atoms.find(a => 
                            a.atomId === 'table' && 
                            (a.settings?.sourceFile === objectName || a.settings?.object_name === objectName)
                          );
                          if (matchingAtom) {
                            resolvedAtomInstanceId = matchingAtom.id;
                            console.log('🔍 [PIPELINE] Table atom: Found atom by object_name match', {
                              objectName,
                              atomId: resolvedAtomInstanceId
                            });
                            break;
                          }
                        }
                      }
                    }
                  }
                  
                  // If still not found, try to find by canvas_position match
                  if (resolvedAtomInstanceId === 'unknown' || !resolvedAtomInstanceId) {
                    const card = cards.find(c => c.canvas_position === logCanvasPosition);
                    if (card && Array.isArray(card.atoms)) {
                      const tableAtom = card.atoms.find(a => a.atomId === 'table');
                      if (tableAtom) {
                        resolvedAtomInstanceId = tableAtom.id;
                        console.log('🔍 [PIPELINE] Table atom: Found atom by canvas_position', {
                          canvasPosition: logCanvasPosition,
                          atomId: resolvedAtomInstanceId
                        });
                      }
                    }
                  }
                  
                  if (resolvedAtomInstanceId === 'unknown' || !resolvedAtomInstanceId) {
                    console.warn('⚠️ [PIPELINE] Table atom: Could not resolve atom_instance_id, skipping update', {
                      logEntry: {
                        atom_instance_id: logEntry.atom_instance_id,
                        card_id: logEntry.card_id,
                        canvas_position: logEntry.canvas_position,
                        configuration: stepConfig
                      }
                    });
                    processedCount++;
                    continue; // Skip this atom if we can't find it
                  }
                }
                
                // Get current atom with resolved ID
                const currentAtom = getAtom(resolvedAtomInstanceId);
                const currentSettings = currentAtom?.settings || {};
                
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render by changing timestamp
                  mode: 'load', // CRITICAL: Ensure mode is set to 'load' for table atom
                };
                
                // Get additional_results from execution
                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};
                
                // Get table data from multiple sources (executor returns final state after ALL operations)
                const tableData = logEntry.table_data 
                  || logEntryAdditionalResults.table_data 
                  || additionalResults.table_data 
                  || taskResponse 
                  || taskResult;
                
                // Check if we have final tableData from executor (with all operations applied)
                const hasFinalTableData = tableData && tableData.rows && Array.isArray(tableData.rows) && tableData.table_id;
                
                // 1. Update sourceFile to replacement file (if it was replaced)
                // CRITICAL: Table atom uses sourceFile, not object_name or dataSource
                // Always update even if same, to ensure consistency and trigger reload
                // 🔧 CRITICAL: Use configuration.object_name as source of truth (it's the last loaded file)
                // Only fall back to input_files[0] if configuration doesn't have it
                let replacementFile = null;
                if (stepConfig.object_name) {
                  // Configuration has the last loaded file (after all operations) - use this!
                  replacementFile = stepConfig.object_name;
                } else if (stepConfig.file_key) {
                  replacementFile = stepConfig.file_key;
                } else if (logEntry.input_files && logEntry.input_files.length > 0) {
                  // Fallback: Use the first input file (original file)
                  replacementFile = logEntry.input_files[0];
                }
                
                // ALWAYS update sourceFile if we have a replacement file
                // This ensures the file is updated even if it's the same (for consistency)
                if (replacementFile) {
                  // CRITICAL: Check if sourceFile is actually changing
                  const currentSourceFile = currentSettings.sourceFile || '';
                  const isFileChanging = replacementFile !== currentSourceFile;
                  
                  // Update sourceFile to replacement file (for display purposes)
                  updateData.sourceFile = replacementFile;
                  
                  // CRITICAL: If executor returned final tableData (with all operations applied),
                  // we should use it directly instead of clearing and forcing a reload.
                  // The executor has already:
                  // 1. Loaded the replacement file
                  // 2. Applied all operations (sort, rename, etc.)
                  // 3. Returned the final state
                  // So we should use that result, not reload from sourceFile
                  if (!hasFinalTableData) {
                    // No final tableData from executor - clear to force reload from sourceFile
                    updateData.tableData = null;
                    updateData.tableId = undefined;
                    // Set reloadTrigger to force reload (TableAtom checks this)
                    updateData.reloadTrigger = Date.now();
                    console.log('🔄 [PIPELINE] Table atom: Clearing tableData to force reload (no executor data)', {
                      from: currentSourceFile,
                      to: replacementFile,
                      isFileChanging
                    });
                  } else {
                    // Executor returned final tableData with all operations - use it directly
                    // Don't clear tableData - it will be set below in step 2
                    // CRITICAL: Don't set reloadTrigger - we have executor data, so don't trigger reload
                    // Clear reloadTrigger if it exists to prevent TableAtom from reloading
                    updateData.reloadTrigger = undefined;
                    console.log('✅ [PIPELINE] Table atom: Using executor tableData (all operations applied)', {
                      from: currentSourceFile,
                      to: replacementFile,
                      hasTableData: true,
                      rowCount: tableData.rows.length,
                      tableId: tableData.table_id,
                      reloadTriggerCleared: true,
                      message: 'Will use executor data instead of reloading'
                    });
                  }
                  
                  // CRITICAL: Ensure mode is 'load' so TableAtom knows to load from sourceFile
                  // But if we have executor data, TableAtom won't reload (because tableData is set)
                  updateData.mode = 'load';
                  
                  console.log('🔄 [PIPELINE] Table atom: Updating sourceFile', {
                    from: currentSourceFile,
                    to: replacementFile,
                    isFileChanging,
                    reloadTrigger: updateData.reloadTrigger,
                    tableDataCleared: !hasFinalTableData,
                    hasExecutorTableData: hasFinalTableData,
                    mode: updateData.mode
                  });
                } else {
                  // No replacement file, but still update reloadTrigger to force refresh
                  updateData.reloadTrigger = Date.now();
                }
                
                // 1a. ALWAYS load column summary (like pivot-table columns)
                // Priority: logEntry (from backend) > logEntryAdditionalResults > additionalResults
                // This ensures columns are always up-to-date, even if filename is the same
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
                
                // Always update columns (like pivot-table always updates columns)
                if (extractedColumns && Array.isArray(extractedColumns) && extractedColumns.length > 0) {
                  updateData.columns = extractedColumns;
                }
                
                // 2. Update table data if available (from executor after ALL operations)
                // CRITICAL: Use tableData from executor which includes ALL operations (load, sort, rename, etc.)
                // This is especially important when there's a replacement file - the executor has already
                // applied all operations to the replacement file, so we should use that result
                // ALWAYS use executor tableData if available (whether replacement file or not)
                // The executor has already executed all operations in sequence, so this is the final state
                if (hasFinalTableData) {
                  // Use tableData from executor (includes all operations applied)
                  updateData.tableData = {
                    table_id: tableData.table_id,
                    columns: tableData.columns || extractedColumns || [],
                    rows: tableData.rows,
                    row_count: tableData.row_count || tableData.rows.length || 0,
                    column_types: tableData.column_types || {},
                    object_name: tableData.object_name || replacementFile,
                  };
                  // Also set visibleColumns and columnOrder
                  if (tableData.columns && Array.isArray(tableData.columns)) {
                    updateData.visibleColumns = tableData.columns;
                    updateData.columnOrder = tableData.columns;
                  }
                  if (tableData.table_id) {
                    updateData.tableId = tableData.table_id;
                  }
                  
                  console.log('✅ [PIPELINE] Table atom: Using tableData from executor (all operations applied)', {
                    tableId: tableData.table_id,
                    rowCount: tableData.rows.length,
                    columnCount: tableData.columns?.length,
                    replacementFile: replacementFile || 'none (using original)',
                    operationsApplied: 'load, update, rename, etc. (all from api_calls)'
                  });
                } else {
                  // No executor tableData - TableAtom will reload from sourceFile
                  console.log('⚠️ [PIPELINE] Table atom: No executor tableData, TableAtom will reload from sourceFile', {
                    replacementFile: replacementFile || 'none',
                    hasTableData: false
                  });
                }
                
                // 3. Apply stored configuration from MongoDB
                // CRITICAL: Extract filters and sort_config from stepConfig.settings and apply at top level
                // TableAtom expects filters and sortConfig at top level, not nested in settings.settings
                if (stepConfig.settings) {
                  const storedSettings = stepConfig.settings;
                  
                  // Apply filters (convert snake_case to camelCase if needed)
                  if (storedSettings.filters !== undefined) {
                    updateData.filters = storedSettings.filters;
                  }
                  if (storedSettings.sort_config !== undefined) {
                    updateData.sortConfig = storedSettings.sort_config;
                  }
                  // Also support camelCase versions
                  if (storedSettings.sortConfig !== undefined) {
                    updateData.sortConfig = storedSettings.sortConfig;
                  }
                  
                  // Apply other settings (visible_columns, column_order, etc.)
                  if (storedSettings.visible_columns !== undefined) {
                    updateData.visibleColumns = storedSettings.visible_columns;
                  }
                  if (storedSettings.column_order !== undefined) {
                    updateData.columnOrder = storedSettings.column_order;
                  }
                  if (storedSettings.show_row_numbers !== undefined) {
                    updateData.showRowNumbers = storedSettings.show_row_numbers;
                  }
                  if (storedSettings.show_summary_row !== undefined) {
                    updateData.showSummaryRow = storedSettings.show_summary_row;
                  }
                  if (storedSettings.frozen_columns !== undefined) {
                    updateData.frozenColumns = storedSettings.frozen_columns;
                  }
                  if (storedSettings.row_height !== undefined) {
                    updateData.rowHeight = storedSettings.row_height;
                  }
                  
                  // Also preserve any nested settings structure for backward compatibility
                  updateData.settings = {
                    ...(currentSettings.settings || {}),
                    ...storedSettings,
                  };
                }
                
                // 4. Update saved file if available
                const savedFile = logEntry.saved_file 
                  || logEntryAdditionalResults.saved_file 
                  || additionalResults.saved_file;
                if (savedFile) {
                  updateData.savedFile = savedFile;  // Note: camelCase, not snake_case
                }
                
                // 5. Update status
                updateData.status = 'success';
                updateData.error = null;
                
                // Update atom settings
                // CRITICAL: Log what we're updating to debug
                console.log('🔄 [PIPELINE] Table atom: Updating settings', {
                  originalAtomInstanceId: atomInstanceId,
                  resolvedAtomInstanceId: resolvedAtomInstanceId,
                  updateData: {
                    sourceFile: updateData.sourceFile,
                    mode: updateData.mode,
                    reloadTrigger: updateData.reloadTrigger,
                    tableData: updateData.tableData === null ? 'null (cleared)' : updateData.tableData ? 'exists' : 'undefined',
                    tableId: updateData.tableId,
                    pipelineExecutionTimestamp: updateData.pipelineExecutionTimestamp
                  },
                  currentSettings: {
                    sourceFile: currentSettings.sourceFile,
                    mode: currentSettings.mode,
                    tableData: currentSettings.tableData ? 'exists' : 'null/undefined',
                    reloadTrigger: currentSettings.reloadTrigger,
                    pipelineExecutionTimestamp: currentSettings.pipelineExecutionTimestamp
                  }
                });
                
                // CRITICAL: Update settings - this should trigger TableAtom useEffect
                updateAtomSettings(resolvedAtomInstanceId, updateData);
                
                // Verify the update was applied
                const updatedAtom = getAtom(resolvedAtomInstanceId);
                console.log('✅ [PIPELINE] Table atom: Settings updated', {
                  originalAtomInstanceId: atomInstanceId,
                  resolvedAtomInstanceId: resolvedAtomInstanceId,
                  newSourceFile: updatedAtom?.settings?.sourceFile,
                  newMode: updatedAtom?.settings?.mode,
                  newPipelineTimestamp: updatedAtom?.settings?.pipelineExecutionTimestamp,
                  newReloadTrigger: updatedAtom?.settings?.reloadTrigger,
                  tableDataAfterUpdate: updatedAtom?.settings?.tableData === null ? 'null (cleared)' : updatedAtom?.settings?.tableData ? 'exists' : 'undefined',
                  message: 'TableAtom should detect pipelineExecutionTimestamp change and reload'
                });
                
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

                await updateAtomForMode(executionMode, atomInstanceId, updateData);
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

                await updateAtomForMode(executionMode, atomInstanceId, updateData);
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
                await updateAtomForMode(executionMode, atomInstanceId, updateData);
                
                // 🔧 CRITICAL: Immediately trigger auto-render by updating charts array with pipelineAutoRender flag
                // This ensures the useEffect in ChartMakerAtom detects the change and renders
                setTimeout(async () => {
                  const currentAtom = executionMode === subMode 
                    ? useLaboratoryStore.getState().getAtom(atomInstanceId)
                    : undefined;
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
                    
                    await updateAtomForMode(executionMode, atomInstanceId, {
                      charts: chartsToRender, // Update charts array to trigger useEffect
                      pipelineAutoRender: true, // Set atom-level flag
                      autoRenderAfterPipeline: true, // Set flag for useEffect dependency
                    });
                  } else {
                    // Fallback: just set the flag
                    await updateAtomForMode(executionMode, atomInstanceId, {
                      autoRenderAfterPipeline: true,
                      pipelineAutoRender: true,
                    });
                  }
                }, 500);
                
                successCount++;
                processedCount++;
              } else if (atomType === 'kpi-dashboard') {
                // Handle kpi-dashboard atom updates
                console.log('🔄 [PIPELINE] KPIDashboard restoration started', {
                  atomInstanceId,
                  logEntry: logEntry.configuration,
                });
                
                const additionalResults = taskResult.additional_results || taskResult.result?.additional_results || {};
                const logEntryAdditionalResults = logEntry.additional_results || {};
                
                // Get updated layouts from execution results
                const updatedLayouts = additionalResults.layouts || logEntryAdditionalResults.layouts;
                const kpiData = additionalResults.kpi_data || logEntryAdditionalResults.kpi_data;
                const filesReplaced = additionalResults.files_replaced || logEntryAdditionalResults.files_replaced || [];
                const chartsRegenerated = additionalResults.charts_regenerated || logEntryAdditionalResults.charts_regenerated || [];
                const tablesReloaded = additionalResults.tables_reloaded || logEntryAdditionalResults.tables_reloaded || [];
                
                console.log('📦 [PIPELINE] KPIDashboard execution results', {
                  has_updatedLayouts: !!updatedLayouts,
                  layouts_count: updatedLayouts?.length || 0,
                  files_replaced: filesReplaced.length,
                  charts_regenerated: chartsRegenerated.length,
                  tables_reloaded: tablesReloaded.length,
                });
                
                const updateData: any = {
                  pipelineExecutionTimestamp: Date.now(), // Force re-render
                };
                
                // Update layouts with regenerated charts and reloaded tables
                if (updatedLayouts && Array.isArray(updatedLayouts) && updatedLayouts.length > 0) {
                  updateData.layouts = updatedLayouts;
                  console.log('✅ [PIPELINE] KPIDashboard layouts updated', {
                    layouts_count: updatedLayouts.length,
                    boxes_count: updatedLayouts.reduce((sum: number, layout: any) => sum + (layout.boxes?.length || 0), 0),
                  });
                }
                
                // Update title if available
                if (kpiData?.title) {
                  updateData.title = kpiData.title;
                }
                
                // Update selectedFile and dataSource for settings tab (chart maker element)
                if (kpiData?.selectedFile) {
                  updateData.selectedFile = kpiData.selectedFile;
                  console.log('✅ [PIPELINE] KPIDashboard selectedFile updated:', kpiData.selectedFile);
                }
                if (kpiData?.dataSource) {
                  updateData.dataSource = kpiData.dataSource;
                  console.log('✅ [PIPELINE] KPIDashboard dataSource updated:', kpiData.dataSource);
                }
                
                // Update atom settings
                await updateAtomForMode(executionMode, atomInstanceId, updateData);
                
                // Trigger variables refresh in KPIDashboardCanvas
                // This ensures metric-cards reload their values from MongoDB
                useLaboratoryStore.getState().updateMetricsInputs({
                  variablesRefreshTrigger: Date.now()
                });
                
                console.log('✅ [PIPELINE] KPIDashboard atom settings updated', {
                  atomInstanceId,
                  files_replaced: filesReplaced.length,
                  charts_regenerated: chartsRegenerated.length,
                  tables_reloaded: tablesReloaded.length,
                });
                
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
            
            // Accumulate counts for this mode
            totalProcessedCount += processedCount;
            totalSuccessCount += successCount;
            totalFailedCount += failedCount;
          }
        }
        
        toast({
          title: 'Pipeline Completed',
          description: `Processed ${totalProcessedCount} atoms across both modes. ${totalSuccessCount} successful, ${totalFailedCount} failed.`,
          variant: totalSuccessCount > 0 ? 'default' : 'destructive',
        });
        
        onOpenChange(false);
      } else {
        toast({
          title: 'Error',
          description: combinedResult.message || 'Failed to run pipeline',
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
  
  // Helper function to check if a string is a UUID (chartmaker creates these but doesn't save them as files)
  const isUUID = (str: string): boolean => {
    if (!str || typeof str !== 'string') return false;
    // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (8-4-4-4-12 hex characters)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(str);
  };
  
  // Extract root file keys for display (exclude UUIDs)
  const rootFileKeys = rootFiles
    .map((rf: any) => rf.file_key || rf)
    .filter((fileKey: string) => !isUUID(fileKey));
  
  // Extract derived files with their execution details (only .arrow files, exclude CSV temp files and UUIDs)
  const derivedFilesMap = new Map<string, {
    file_key: string;
    save_as_name?: string;
    is_default_name?: boolean;
    step: any;
    output: any;
  }>();
  
  executionGraph.forEach((step: any) => {
    step.outputs?.forEach((output: any) => {
      if (output.file_key && output.file_key.endsWith('.arrow') && !isUUID(output.file_key)) {
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
                ) : (() => {
                  const filesWithOperations = rootFileKeys.filter((file: string) => {
                    // Only show files that have operations
                    const executionSteps = executionGraph.filter((step: any) => 
                      step.inputs?.some((input: any) => input.file_key === file)
                    );
                    return executionSteps.length > 0;
                  });
                  
                  if (filesWithOperations.length === 0) {
                    return <p className="text-sm text-muted-foreground">No root files with operations found.</p>;
                  }
                  
                  return filesWithOperations.map((file: string) => {
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
                          {executionSteps.length > 0 && (
                            <div className="flex-1 min-w-0">
                              <Label className="text-sm font-medium mb-1 block">Replacement File</Label>
                              <Select
                                value={replacement?.replacement_file || ''}
                                onValueChange={async (value) => {
                                    handleKeepOriginalToggle(file, false);
                                    await handleFileChange(file, value);
                                }}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue placeholder="Select replacement file" />
                                </SelectTrigger>
                                <SelectContent className="z-[20000] max-h-[300px]">
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
                          )}
                          <Badge variant="outline" className="text-xs shrink-0">
                            Root
                          </Badge>
                        </div>
                        
                        {/* Column validation status */}
                        {executionSteps.length > 0 && fileColumnValidation[file] && (
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
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Atoms Performed ({executionSteps.length})
                            </Label>
                            <div className="space-y-2">
                              {executionSteps.map((step: any, idx: number) => {
                                const exec = step.execution || {};
                                const status = exec.status || 'pending';
                                const duration = exec.duration_ms || 0;
                                const startedAt = exec.started_at ? new Date(exec.started_at).toLocaleString() : 'N/A';
                                const apiCalls = step.api_calls || [];
                                
                                return (
                                  <div key={idx} className="bg-muted/30 rounded-md p-2 space-y-1.5 border border-muted">
                                    {/* Atom Header */}
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        {status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                        {status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                                        {status === 'pending' && <Clock className="h-3 w-3 text-yellow-500" />}
                                        <span className="font-medium text-xs">{step.atom_title || step.atom_type}</span>
                                        <Badge variant="outline" className="text-[9px]">
                                          {step.atom_type}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                                        <Clock className="h-2.5 w-2.5" />
                                        <span>{duration}ms</span>
                                      </div>
                                    </div>
                                    
                                    {/* Execution Metadata */}
                                    <div className="text-[10px] text-muted-foreground pl-4">
                                      <div>Started: {startedAt}</div>
                                    {exec.error && (
                                        <div className="text-red-500">
                                        Error: {exec.error}
                                      </div>
                                    )}
                                    </div>
                                    
                                    {/* API Calls Section - Collapsible */}
                                    {apiCalls.length > 0 && (
                                      <details className="pl-4 pt-1 border-t border-muted-foreground/20">
                                        <summary className="text-[9px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground list-none">
                                          <div className="flex items-center gap-1">
                                            <span>Endpoints ({apiCalls.length})</span>
                                            <span className="text-[8px]">▼</span>
                                        </div>
                                        </summary>
                                        <div className="mt-1 space-y-0.5">
                                          {apiCalls.map((apiCall: any, apiIdx: number) => {
                                            const apiMethod = apiCall.method || 'N/A';
                                            const apiEndpoint = apiCall.endpoint || 'N/A';
                                            const apiStatus = apiCall.response_status || 0;
                                            const isSuccess = apiStatus >= 200 && apiStatus < 300;
                                            
                                            return (
                                              <div key={apiIdx} className="bg-background/50 rounded px-1.5 py-0.5 text-[9px] border border-muted/30">
                                                <div className="flex items-center gap-1.5">
                                                  <span className={`font-mono font-medium ${
                                                    isSuccess ? 'text-green-600' 
                                                    : apiStatus >= 400 ? 'text-red-600' 
                                                    : 'text-yellow-600'
                                                  }`}>
                                                    {apiMethod}
                                                  </span>
                                                  <span className="text-muted-foreground truncate flex-1 font-mono">
                                                    {apiEndpoint}
                                                  </span>
                                                  {apiStatus > 0 && (
                                                    <span className={`text-[8px] px-1 py-0.5 rounded ${
                                                      isSuccess ? 'text-green-600 bg-green-50' 
                                                      : apiStatus >= 400 ? 'text-red-600 bg-red-50' 
                                                      : 'text-yellow-600 bg-yellow-50'
                                                    }`}>
                                                      {apiStatus}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
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
                  });
                })()}
              </div>
            </div>

            {/* Derived Files with Execution Details - Collapsible */}
            {derivedFiles.length > 0 && (
              <details className="space-y-4">
                <summary className="flex items-center gap-2 cursor-pointer hover:text-foreground list-none">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Derived Files ({derivedFiles.length})</h3>
                  <span className="text-xs text-muted-foreground">▼</span>
                </summary>
                <div className="space-y-4 max-h-[400px] overflow-y-auto mt-4">
                  {derivedFiles.map((derivedFile: any) => {
                    const file = derivedFile.file_key;
                    const output = derivedFile.output;
                    const fileName = derivedFile.save_as_name || file.split('/').pop() || file;
                    
                    // Find execution steps that used this derived file as input (operations performed on it)
                    const executionSteps = executionGraph.filter((step: any) => 
                      step.inputs?.some((input: any) => input.file_key === file)
                    );
                    
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
                        
                        {/* Execution details - operations performed on this derived file */}
                        {executionSteps.length > 0 ? (
                        <div className="space-y-2 pt-2 border-t">
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Atoms Performed ({executionSteps.length})
                            </Label>
                            <div className="space-y-2">
                              {executionSteps.map((step: any, idx: number) => {
                                const exec = step.execution || {};
                                const status = exec.status || 'pending';
                                const duration = exec.duration_ms || 0;
                                const startedAt = exec.started_at ? new Date(exec.started_at).toLocaleString() : 'N/A';
                                const apiCalls = step.api_calls || [];
                                
                                return (
                                  <div key={idx} className="bg-muted/30 rounded-md p-2 space-y-1.5 border border-muted">
                                    {/* Atom Header */}
                            <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                {status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                                {status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
                                {status === 'pending' && <Clock className="h-3 w-3 text-yellow-500" />}
                                        <span className="font-medium text-xs">{step.atom_title || step.atom_type}</span>
                                        <Badge variant="outline" className="text-[9px]">
                                  {step.atom_type}
                                </Badge>
                              </div>
                                      <div className="flex items-center gap-1 text-muted-foreground text-[10px]">
                                        <Clock className="h-2.5 w-2.5" />
                                <span>{duration}ms</span>
                              </div>
                            </div>
                                    
                                    {/* Execution Metadata */}
                                    <div className="text-[10px] text-muted-foreground pl-4">
                                      <div>Started: {startedAt}</div>
                            {exec.error && (
                                        <div className="text-red-500">
                                Error: {exec.error}
                              </div>
                            )}
                                    </div>
                            
                                    {/* API Calls Section - Collapsible */}
                            {apiCalls.length > 0 && (
                                      <details className="pl-4 pt-1 border-t border-muted-foreground/20">
                                        <summary className="text-[9px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground list-none">
                                          <div className="flex items-center gap-1">
                                            <span>Endpoints ({apiCalls.length})</span>
                                            <span className="text-[8px]">▼</span>
                                </div>
                                        </summary>
                                        <div className="mt-1 space-y-0.5">
                                  {apiCalls.map((apiCall: any, apiIdx: number) => {
                                    const apiMethod = apiCall.method || 'N/A';
                                    const apiEndpoint = apiCall.endpoint || 'N/A';
                                    const apiStatus = apiCall.response_status || 0;
                                    const isSuccess = apiStatus >= 200 && apiStatus < 300;
                                    
                                    return (
                                              <div key={apiIdx} className="bg-background/50 rounded px-1.5 py-0.5 text-[9px] border border-muted/30">
                                                <div className="flex items-center gap-1.5">
                                                  <span className={`font-mono font-medium ${
                                                    isSuccess ? 'text-green-600' 
                                                    : apiStatus >= 400 ? 'text-red-600' 
                                                    : 'text-yellow-600'
                                                  }`}>
                                            {apiMethod}
                                          </span>
                                                  <span className="text-muted-foreground truncate flex-1 font-mono">
                                            {apiEndpoint}
                                          </span>
                                          {apiStatus > 0 && (
                                                    <span className={`text-[8px] px-1 py-0.5 rounded ${
                                                      isSuccess ? 'text-green-600 bg-green-50' 
                                                      : apiStatus >= 400 ? 'text-red-600 bg-red-50' 
                                                      : 'text-yellow-600 bg-yellow-50'
                                                    }`}>
                                              {apiStatus}
                                                    </span>
                                          )}
                                        </div>
                                          </div>
                                            );
                                          })}
                                        </div>
                                          </details>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                        ) : (
                          <div className="space-y-2 pt-2 border-t">
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Atoms Performed
                            </Label>
                            <div className="text-[10px] text-muted-foreground italic">
                              No operations performed on this file yet.
                          </div>
                        </div>
                        )}
                        
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
              </details>
            )}

            {/* Other Atoms (without root file inputs) - like KPI Dashboard with internal file refs */}
            {(() => {
              // Find atoms that don't have inputs matching root files
              // These could be atoms with no inputs, or atoms with inputs that are internal/derived
              const rootFileKeysSet = new Set(rootFileKeys);
              const derivedFileKeysSet = new Set(Array.from(derivedFilesMap.keys()));
              
              const otherAtoms = executionGraph.filter((step: any) => {
                // Check if any input matches a root file
                const hasRootFileInput = step.inputs?.some((input: any) => 
                  input.file_key && rootFileKeysSet.has(input.file_key)
                );
                // Check if any input matches a derived file
                const hasDerivedFileInput = step.inputs?.some((input: any) => 
                  input.file_key && derivedFileKeysSet.has(input.file_key)
                );
                // Show in "Other Atoms" if it doesn't have root or derived file inputs
                return !hasRootFileInput && !hasDerivedFileInput;
              });
              
              if (otherAtoms.length === 0) return null;
              
              return (
                <details className="space-y-4">
                  <summary className="flex items-center gap-2 cursor-pointer hover:text-foreground list-none">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Other Atoms ({otherAtoms.length})</h3>
                    <span className="text-xs text-muted-foreground">▼</span>
                  </summary>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto mt-4">
                    {otherAtoms.map((step: any, idx: number) => {
                      const exec = step.execution || {};
                      const status = exec.status || 'pending';
                      const duration = exec.duration_ms || 0;
                      const startedAt = exec.started_at ? new Date(exec.started_at).toLocaleString() : 'N/A';
                      const apiCalls = step.api_calls || [];
                      
                      return (
                        <div key={idx} className="border rounded-lg p-4 space-y-3">
                          {/* Atom Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {status === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                              {status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                              {status === 'pending' && <Clock className="h-4 w-4 text-yellow-500" />}
                              <span className="font-medium text-sm">{step.atom_title || step.atom_type}</span>
                              <Badge variant="outline" className="text-xs">
                                {step.atom_type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1 text-muted-foreground text-xs">
                              <Clock className="h-3 w-3" />
                              <span>{duration}ms</span>
                            </div>
                          </div>
                          
                          {/* Execution Metadata */}
                          <div className="text-xs text-muted-foreground">
                            <div>Started: {startedAt}</div>
                            {exec.error && (
                              <div className="text-red-500">
                                Error: {exec.error}
                              </div>
                            )}
                          </div>
                          
                          {/* Input files (if any - these are internal/embedded file refs) */}
                          {step.inputs && step.inputs.length > 0 && (
                            <div className="space-y-1 pt-2 border-t">
                              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                Referenced Files ({step.inputs.length})
                              </Label>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {step.inputs.map((input: any, inputIdx: number) => (
                                  <div key={inputIdx} className="font-mono truncate" title={input.file_key}>
                                    {input.file_key?.split('/').pop() || input.file_key || 'Unknown'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* API Calls Section - Collapsible */}
                          {apiCalls.length > 0 && (
                            <details className="pt-2 border-t">
                              <summary className="text-[10px] font-semibold text-muted-foreground cursor-pointer hover:text-foreground list-none">
                                <div className="flex items-center gap-1">
                                  <span>Endpoints ({apiCalls.length})</span>
                                  <span className="text-[8px]">▼</span>
                                </div>
                              </summary>
                              <div className="mt-1 space-y-0.5">
                                {apiCalls.map((apiCall: any, apiIdx: number) => {
                                  const apiMethod = apiCall.method || 'N/A';
                                  const apiEndpoint = apiCall.endpoint || 'N/A';
                                  const apiStatus = apiCall.response_status || 0;
                                  const isSuccess = apiStatus >= 200 && apiStatus < 300;
                                  
                                  return (
                                    <div key={apiIdx} className="bg-background/50 rounded px-1.5 py-0.5 text-[9px] border border-muted/30">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`font-mono font-medium ${
                                          isSuccess ? 'text-green-600' 
                                          : apiStatus >= 400 ? 'text-red-600' 
                                          : 'text-yellow-600'
                                        }`}>
                                          {apiMethod}
                                        </span>
                                        <span className="text-muted-foreground truncate flex-1 font-mono">
                                          {apiEndpoint}
                                        </span>
                                        {apiStatus > 0 && (
                                          <span className={`text-[8px] px-1 py-0.5 rounded ${
                                            isSuccess ? 'text-green-600 bg-green-50' 
                                            : apiStatus >= 400 ? 'text-red-600 bg-red-50' 
                                            : 'text-yellow-600 bg-yellow-50'
                                          }`}>
                                            {apiStatus}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })()}
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

