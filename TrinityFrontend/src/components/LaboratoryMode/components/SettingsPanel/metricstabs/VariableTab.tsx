import React, { useState, useEffect, useMemo } from 'react';
import { LayoutCard, CardVariable, VariableOperation, ConstantAssignment } from '../../../store/laboratoryStore';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLaboratoryStore } from '../../../store/laboratoryStore';
import { FEATURE_OVERVIEW_API, CREATECOLUMN_API, LABORATORY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';

interface VariableTabProps {
  card: LayoutCard;
  onAddVariable: (cardId: string, variable: CardVariable) => void;
  onUpdateVariable: (
    cardId: string,
    variableId: string,
    update: Partial<Omit<CardVariable, 'id' | 'originCardId'>>
  ) => void;
  onDeleteVariable: (cardId: string, variableId: string) => void;
  onToggleVariable: (cardId: string, variableId: string, appended: boolean) => void;
}

const VariableTab: React.FC<VariableTabProps> = ({
  card,
  onAddVariable,
  onUpdateVariable,
  onDeleteVariable,
  onToggleVariable,
}) => {
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  
  // Get values from store with defaults
  const variableType = metricsInputs.variableType || 'dataframe'; // 'dataframe' or 'constant'
  const computeWithinGroup = metricsInputs.computeWithinGroup || false;
  // Derive computeMode from variableType and computeWithinGroup
  const computeMode = variableType === 'dataframe' 
    ? (computeWithinGroup ? 'within-group' : 'whole-dataframe')
    : 'whole-dataframe'; // constant mode doesn't use computeMode
  const identifiers = metricsInputs.variableIdentifiers || [];
  const selectedVariableIdentifiers = metricsInputs.selectedVariableIdentifiers || [];
  const operations = metricsInputs.variableOperations || [{ id: '1', numericalColumn: '', method: 'sum', secondColumn: '', secondInputType: 'column', secondValue: '', customName: '' }];
  const constantAssignments = metricsInputs.constantAssignments || [{ id: '1', variableName: '', value: '' }];
  const identifiersListOpen = metricsInputs.variableIdentifiersListOpen || false;
  
  // Convert selectedVariableIdentifiers array to Set for easier manipulation
  const selectedIdentifiers = useMemo(() => new Set(selectedVariableIdentifiers), [selectedVariableIdentifiers]);
  
  // Local state for loading and derived data
  const [loadingIdentifiers, setLoadingIdentifiers] = useState(false);
  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [loadingNumericalColumns, setLoadingNumericalColumns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedVariables, setSavedVariables] = useState<any[]>([]);
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [savedVariablesOpen, setSavedVariablesOpen] = useState(false);
  const [createVariablesOpen, setCreateVariablesOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [identifierUniqueCounts, setIdentifierUniqueCounts] = useState<Record<string, number>>({});
  const [informativeColumnChecked, setInformativeColumnChecked] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [existingVariables, setExistingVariables] = useState<string[]>([]);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const { toast } = useToast();
  
  // Filter saved variables based on search query
  const filteredSavedVariables = useMemo(() => {
    if (!searchQuery.trim()) {
      return savedVariables;
    }
    const query = searchQuery.toLowerCase();
    return savedVariables.filter((variable) => {
      const name = (variable.variableName || '').toLowerCase();
      const value = (variable.value || '').toLowerCase();
      const description = (variable.description || '').toLowerCase();
      return name.includes(query) || value.includes(query) || description.includes(query);
    });
  }, [savedVariables, searchQuery]);

  // Extract variable names from saved variables
  const variableNames = useMemo(() => {
    return savedVariables.map((v) => v.variableName || '').filter(Boolean);
  }, [savedVariables]);

  // Handle collapsible state - only one can be open at a time
  const handleSavedVariablesOpenChange = (open: boolean) => {
    setSavedVariablesOpen(open);
    if (open) {
      setCreateVariablesOpen(false);
    }
  };

  const handleCreateVariablesOpenChange = (open: boolean) => {
    setCreateVariablesOpen(open);
    if (open) {
      setSavedVariablesOpen(false);
    }
  };

  // Helper function to check if a method requires a second column
  const requiresSecondColumn = (method: string) => ['add', 'subtract', 'multiply', 'divide'].includes(method);

  // Add a new operation
  const addOperation = () => {
    const newId = String(Date.now());
    const newOperations = [...operations, { id: newId, numericalColumn: '', method: 'sum', secondColumn: '', secondInputType: 'column', secondValue: '', customName: '' }];
    updateMetricsInputs({ variableOperations: newOperations });
  };

  // Add a new constant assignment
  const addConstantAssignment = () => {
    const newId = String(Date.now());
    const newAssignments = [...constantAssignments, { id: newId, variableName: '', value: '' }];
    updateMetricsInputs({ constantAssignments: newAssignments });
  };

  // Update a constant assignment
  const updateConstantAssignment = (id: string, update: Partial<ConstantAssignment>) => {
    const newAssignments = constantAssignments.map(assignment =>
      assignment.id === id ? { ...assignment, ...update } : assignment
    );
    updateMetricsInputs({ constantAssignments: newAssignments });
  };

  // Delete a constant assignment
  const deleteConstantAssignment = (id: string) => {
    if (constantAssignments.length > 1) {
      const newAssignments = constantAssignments.filter(assignment => assignment.id !== id);
      updateMetricsInputs({ constantAssignments: newAssignments });
    }
  };

  // Update an operation
  const updateOperation = (id: string, update: Partial<Omit<VariableOperation, 'id'>>) => {
    const newOperations = operations.map(op => 
      op.id === id ? { ...op, ...update } : op
    );
    updateMetricsInputs({ variableOperations: newOperations });
  };

  // Delete an operation
  const deleteOperation = (id: string) => {
    if (operations.length > 1) {
      const newOperations = operations.filter(op => op.id !== id);
      updateMetricsInputs({ variableOperations: newOperations });
    }
  };

  // Fetch saved variables from backend
  const fetchSavedVariables = async () => {
    const envStr = localStorage.getItem('env');
    let client_name = '';
    let app_name = '';
    let project_name = '';
    
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        client_name = env.CLIENT_NAME || '';
        app_name = env.APP_NAME || '';
        project_name = env.PROJECT_NAME || '';
      } catch {
        // Ignore parse errors
      }
    }

    if (!client_name || !app_name || !project_name) {
      return;
    }

    setLoadingVariables(true);
    try {
      const params = new URLSearchParams({
        clientId: client_name,
        appId: app_name,
        projectId: project_name,
      });
      
      const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setSavedVariables(data.variables || []);
      }
    } catch (error) {
      console.error('Failed to fetch saved variables', error);
    } finally {
      setLoadingVariables(false);
    }
  };

  // Fetch variables on mount
  useEffect(() => {
    fetchSavedVariables();
  }, []);

  // Handle confirmed overwrite
  const handleConfirmOverwrite = async () => {
    if (!pendingPayload) return;
    
    setSaving(true);
    setShowOverwriteConfirm(false);
    
    try {
      const payloadWithConfirm = { ...pendingPayload, confirmOverwrite: true };
      
      // Determine endpoint based on payload structure
      const endpoint = payloadWithConfirm.assignments 
        ? `${LABORATORY_API}/variables/assign`
        : `${LABORATORY_API}/variables/compute`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payloadWithConfirm),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: `Successfully updated ${result.newColumns?.length || result.newVariables?.length || 0} variable(s).`,
        });
        // Refresh saved variables
        await fetchSavedVariables();
      } else {
        throw new Error(result.error || 'Failed to save variables');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to compute variables. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setPendingPayload(null);
      setExistingVariables([]);
    }
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteConfirm(false);
    setPendingPayload(null);
    setExistingVariables([]);
  };

  // Save variables to backend
  const handleSave = async () => {
    // Note: dataSource is optional for variable-only operations
    // Validation will happen in backend if columns are used

    // Handle constant assignments
    if (variableType === 'constant') {
      const validAssignments = constantAssignments.filter(assignment => 
        assignment.variableName && assignment.variableName.trim() && assignment.value && assignment.value.trim()
      );
      if (validAssignments.length === 0) {
        toast({
          title: "Error",
          description: "Please configure at least one constant assignment with a variable name and value.",
          variant: "destructive",
        });
        return;
      }

      // Get client/app/project from environment
      const envStr = localStorage.getItem('env');
      let client_name = '';
      let app_name = '';
      let project_name = '';
      
      if (envStr) {
        try {
          const env = JSON.parse(envStr);
          client_name = env.CLIENT_NAME || '';
          app_name = env.APP_NAME || '';
          project_name = env.PROJECT_NAME || '';
        } catch {
          // Ignore parse errors
        }
      }

      if (!client_name || !app_name || !project_name) {
        toast({
          title: "Error",
          description: "Project context not available. Please ensure you're in a valid project.",
          variant: "destructive",
        });
        return;
      }

      setSaving(true);
      
      try {
        const payload = {
          assignments: validAssignments.map(assignment => ({
            variableName: assignment.variableName.trim(),
            value: assignment.value.trim(),
          })),
          dataSource: metricsInputs.dataSource,
          clientName: client_name,
          appName: app_name,
          projectName: project_name,
          confirmOverwrite: false,
        };

        const response = await fetch(`${LABORATORY_API}/variables/assign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.success) {
          toast({
            title: "Success",
            description: `Successfully saved ${result.newVariables?.length || validAssignments.length} constant variable(s).`,
          });
          // Refresh saved variables
          fetchSavedVariables();
        } else if (result.existingVariables && result.existingVariables.length > 0) {
          // Show confirmation dialog for overwriting
          setExistingVariables(result.existingVariables);
          setPendingPayload(payload);
          setShowOverwriteConfirm(true);
          setSaving(false);
          return;
        } else {
          throw new Error(result.error || 'Failed to save variables');
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to save constant variables. Please try again.",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    // Handle dataframe operations (existing logic)
    // Validate operations
    const validOperations = operations.filter(op => {
      if (!op.numericalColumn || !op.method) return false;
      // For arithmetic operations, ensure either secondColumn or secondValue is provided
      if (requiresSecondColumn(op.method)) {
        if (op.secondInputType === 'column') {
          return !!op.secondColumn;
        } else if (op.secondInputType === 'number') {
          return !!op.secondValue && !isNaN(parseFloat(op.secondValue));
        }
        return false;
      }
      return true;
    });
    if (validOperations.length === 0) {
      toast({
        title: "Error",
        description: "Please configure at least one operation with a numerical column and method. For arithmetic operations, please select a column or enter a number.",
        variant: "destructive",
      });
      return;
    }

    // Validate identifiers for within-group mode
    if (computeMode === 'within-group' && selectedVariableIdentifiers.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one identifier for within-group computation.",
        variant: "destructive",
      });
      return;
    }

    // Get client/app/project from environment
    const envStr = localStorage.getItem('env');
    let client_name = '';
    let app_name = '';
    let project_name = '';
    
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        client_name = env.CLIENT_NAME || '';
        app_name = env.APP_NAME || '';
        project_name = env.PROJECT_NAME || '';
      } catch {
        // Ignore parse errors
      }
    }

    if (!client_name || !app_name || !project_name) {
      toast({
        title: "Error",
        description: "Project context not available. Please ensure you're in a valid project.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    
    try {
      const payload = {
        dataSource: metricsInputs.dataSource,
        computeMode: variableType === 'dataframe' ? (computeWithinGroup ? 'within-group' : 'whole-dataframe') : 'whole-dataframe',
        identifiers: variableType === 'dataframe' && computeWithinGroup ? selectedVariableIdentifiers : undefined,
        operations: validOperations.map(op => ({
          id: op.id,
          numericalColumn: op.numericalColumn,
          method: op.method,
          secondColumn: op.secondInputType === 'column' ? (op.secondColumn || undefined) : undefined,
          secondValue: op.secondInputType === 'number' && op.secondValue ? parseFloat(op.secondValue) : undefined,
          customName: op.customName || undefined,
        })),
        clientName: client_name,
        appName: app_name,
        projectName: project_name,
      };

      const response = await fetch(`${LABORATORY_API}/variables/compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: `Successfully created ${result.newColumns?.length || 0} variable(s).`,
        });
        // Refresh saved variables after successful save
        await fetchSavedVariables();
      } else if (result.existingVariables && result.existingVariables.length > 0) {
        // Show confirmation dialog for overwriting
        setExistingVariables(result.existingVariables);
        setPendingPayload(payload);
        setShowOverwriteConfirm(true);
        setSaving(false);
        return;
      } else {
        throw new Error(result.error || 'Failed to save variables');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save variables. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Fetch identifiers for filtering numerical columns (always fetch when dataSource is available)
  useEffect(() => {
    async function fetchIdentifiers() {
      const dataSource = metricsInputs.dataSource;
      if (!dataSource) {
        updateMetricsInputs({ variableIdentifiers: [] });
        return;
      }

      // Only show loading state when within-group mode is selected
      if (computeMode === 'within-group') {
        setLoadingIdentifiers(true);
      }
      
      // Extract client/app/project and file_name from file path (same as MetricsColOps)
      const pathParts = dataSource.split('/');
      const clientName = pathParts[0] ?? '';
      const appName = pathParts[1] ?? '';
      const projectName = pathParts[2] ?? '';
      // Extract file_name (everything after project_name)
      const fileName = pathParts.slice(3).join('/') || null;
      
      try {
        if (clientName && appName && projectName) {
          // Build URL with optional file_name parameter (same pattern as MetricsColOps)
          const urlParams = new URLSearchParams({
            client_name: clientName,
            app_name: appName,
            project_name: projectName,
          });
          if (fileName) {
            urlParams.append('file_name', fileName);
          }
          const resp = await fetch(`${CREATECOLUMN_API}/identifier_options?${urlParams.toString()}`);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.identifiers) && data.identifiers.length > 0) {
              // Store unfiltered identifiers (same as compute_metrics_within_group in MetricsColOps)
              const allIds = data.identifiers || [];
              
              // Fetch unique counts for identifiers from column_summary
              try {
                const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
                if (res.ok) {
                  const raw = await res.json();
                  const summaryData = await resolveTaskResponse<{ summary?: any[] }>(raw);
                  const summary = (summaryData.summary || []).filter(Boolean);
                  const uniqueCountsMap: Record<string, number> = {};
                  summary.forEach((c: any) => {
                    const colName = (c.column || '').trim();
                    if (allIds.includes(colName) && c.unique_count !== undefined) {
                      uniqueCountsMap[colName] = c.unique_count || 0;
                    }
                  });
                  setIdentifierUniqueCounts(uniqueCountsMap);
                }
              } catch {}
              
              updateMetricsInputs({ variableIdentifiers: allIds });
              // Set all identifiers as selected by default (only for within-group mode)
              if (computeMode === 'within-group') {
                updateMetricsInputs({ selectedVariableIdentifiers: allIds });
              }
              if (computeMode === 'within-group') {
                setLoadingIdentifiers(false);
              }
              return;
            }
          }
        }
      } catch {}
      
      // Fallback: fetch columns and filter categorical
      try {
        const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          // Get categorical columns (unfiltered, same as compute_metrics_within_group in MetricsColOps)
          const cats = summary.filter((c: any) =>
            c.data_type && (
              c.data_type.toLowerCase().includes('object') ||
              c.data_type.toLowerCase().includes('string') ||
              c.data_type.toLowerCase().includes('category')
            )
          ).map((c: any) => (c.column || '').trim());
          
          // Store unique counts for identifiers
          const uniqueCountsMap: Record<string, number> = {};
          summary.forEach((c: any) => {
            const colName = (c.column || '').trim();
            if (cats.includes(colName) && c.unique_count !== undefined) {
              uniqueCountsMap[colName] = c.unique_count || 0;
            }
          });
          setIdentifierUniqueCounts(uniqueCountsMap);
          
          // Store unfiltered categorical columns
          updateMetricsInputs({ variableIdentifiers: cats });
          // Set all categorical columns as selected by default (only for within-group mode)
          if (variableType === 'dataframe' && computeWithinGroup) {
            updateMetricsInputs({ selectedVariableIdentifiers: cats });
          }
        }
      } catch {}
      
      if (computeMode === 'within-group') {
        setLoadingIdentifiers(false);
      }
    }
    fetchIdentifiers();
  }, [computeMode, metricsInputs.dataSource, updateMetricsInputs]);

  // Fetch numerical columns when dataSource is available
  useEffect(() => {
    async function fetchNumericalColumns() {
      const dataSource = metricsInputs.dataSource;
      if (!dataSource) {
        setNumericalColumns([]);
        return;
      }

      setLoadingNumericalColumns(true);
      
      try {
        const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          
          // Get numerical columns (excluding identifiers) and convert to lowercase
          const nums = summary.filter((c: any) =>
            c && typeof c.data_type === 'string' &&
            ['int', 'float', 'number', 'double', 'numeric'].some(type => c.data_type.toLowerCase().includes(type))
          ).map((c: any) => (c.column || '').trim().toLowerCase()).filter((col: string) => {
            // Exclude identifiers from numerical columns
            return !identifiers.includes(col);
          });
          
          setNumericalColumns(nums);
        }
      } catch {}
      
      setLoadingNumericalColumns(false);
    }
    fetchNumericalColumns();
  }, [metricsInputs.dataSource, identifiers]);

  return (
    <div className="space-y-4 pb-20">
      {/* Saved Variables Section */}
      <Card className="p-4 space-y-2">
        <Collapsible open={savedVariablesOpen} onOpenChange={handleSavedVariablesOpenChange}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <Label className="text-sm font-medium text-gray-900">Saved Variables</Label>
              <div className="flex items-center gap-2">
                {savedVariables.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {savedVariables.length} variable{savedVariables.length !== 1 ? 's' : ''}
                  </span>
                )}
                {savedVariablesOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                )}
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {loadingVariables ? (
              <p className="text-xs text-gray-500 mt-2">Loading variables...</p>
            ) : savedVariables.length > 0 ? (
              <div className="space-y-2 mt-2">
                <Input
                  type="text"
                  placeholder="Search variables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 text-xs"
                />
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {filteredSavedVariables.length > 0 ? (
                    filteredSavedVariables.map((variable) => {
                  const metadata = variable.metadata || {};
                  const tooltipContent = (
                    <div className="text-xs space-y-1">
                      <div><strong>Value:</strong> {variable.value || 'N/A'}</div>
                      {variable.description && <div><strong>Description:</strong> {variable.description}</div>}
                      {variable.usageSummary && <div><strong>Usage:</strong> {variable.usageSummary}</div>}
                      {metadata.data_source && <div><strong>Data Source:</strong> {metadata.data_source}</div>}
                      {metadata.compute_mode && <div><strong>Compute Mode:</strong> {metadata.compute_mode}</div>}
                      {metadata.operation && (
                        <div>
                          <strong>Operation:</strong> {metadata.operation.method} on {metadata.operation.numericalColumn}
                          {metadata.operation.secondColumn && ` and ${metadata.operation.secondColumn}`}
                        </div>
                      )}
                      {metadata.identifiers && Object.keys(metadata.identifiers).length > 0 && (
                        <div>
                          <strong>Identifiers:</strong> {JSON.stringify(metadata.identifiers)}
                        </div>
                      )}
                      {variable.createdAt && <div><strong>Created:</strong> {new Date(variable.createdAt).toLocaleString()}</div>}
                      {variable.updatedAt && <div><strong>Updated:</strong> {new Date(variable.updatedAt).toLocaleString()}</div>}
                    </div>
                  );
                  
                  return (
                    <TooltipProvider key={variable.id || variable.variableName} delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-xs text-gray-700 p-1 hover:bg-gray-50 rounded cursor-pointer truncate" title={variable.variableName}>
                            {variable.variableName}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md text-xs">
                          {tooltipContent}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                    })
                  ) : (
                    <p className="text-xs text-gray-500">No variables match your search.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-2">No variables saved yet.</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Create Variables Section */}
      <Card className="p-4 space-y-2">
        <Collapsible open={createVariablesOpen} onOpenChange={handleCreateVariablesOpenChange}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer">
              <Label className="text-sm font-medium text-gray-900">Create Variables</Label>
              {createVariablesOpen ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4 mt-2">
              <div className="space-y-3">
                <RadioGroup value={variableType} onValueChange={(value) => {
                  updateMetricsInputs({ 
                    variableType: value as 'dataframe' | 'constant',
                    computeWithinGroup: false // Reset checkbox when switching types
                  });
                }}>
                  <div className="flex items-center space-x-4">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="dataframe" id="dataframe" />
                            <Label htmlFor="dataframe" className="text-sm font-normal cursor-pointer">
                              Compute
                            </Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Compute from Dataframe or Other Variable
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="constant" id="constant" />
                            <Label htmlFor="constant" className="text-sm font-normal cursor-pointer">
                              Assign
                            </Label>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Assign Constant Value
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </RadioGroup>
              </div>

              {variableType === 'dataframe' && (
                <>
                  {/* Divider line */}
                  <div className="border-t border-gray-300 my-2"></div>
                  
                  {/* Compute within group checkbox */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="compute-within-group"
                      checked={computeWithinGroup}
                      onChange={(e) => {
                        updateMetricsInputs({ computeWithinGroup: e.target.checked });
                      }}
                      className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                    />
                    <Label htmlFor="compute-within-group" className="text-sm font-normal cursor-pointer">
                      Compute within Group
                    </Label>
                  </div>

                  {computeWithinGroup && (
                <Card className={`${identifiersListOpen ? 'p-4 space-y-3' : 'p-2'}`}>
                  <Collapsible open={identifiersListOpen} onOpenChange={(open) => updateMetricsInputs({ variableIdentifiersListOpen: open })}>
                    <CollapsibleTrigger asChild>
                      <div className="flex items-center justify-between cursor-pointer">
                        <Label className="text-sm font-medium text-gray-900">Identifiers</Label>
                        <div className="flex items-center gap-2">
                          {identifiers.length > 0 && (
                            <span className="text-xs text-gray-500">
                              {selectedIdentifiers.size} of {identifiers.length} selected
                            </span>
                          )}
                          {identifiersListOpen ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {loadingIdentifiers ? (
                        <p className="text-xs text-gray-500 mt-2">Loading identifiers...</p>
                      ) : identifiers.length > 0 ? (
                        <div className="space-y-2 mt-2">
                          {/* All and Informative Column checkboxes */}
                          <div className="flex items-center justify-between p-1 hover:bg-gray-50 rounded cursor-pointer border-b border-gray-200 pb-2 mb-2">
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={selectedIdentifiers.size === identifiers.length && identifiers.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    // Select all
                                    updateMetricsInputs({ selectedVariableIdentifiers: [...identifiers] });
                                  } else {
                                    // Deselect all
                                    updateMetricsInputs({ selectedVariableIdentifiers: [] });
                                  }
                                  setInformativeColumnChecked(false);
                                }}
                                className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                              />
                              <label 
                                className="text-xs font-medium text-gray-700 cursor-pointer"
                                onClick={() => {
                                  if (selectedIdentifiers.size === identifiers.length) {
                                    // Deselect all
                                    updateMetricsInputs({ selectedVariableIdentifiers: [] });
                                  } else {
                                    // Select all
                                    updateMetricsInputs({ selectedVariableIdentifiers: [...identifiers] });
                                  }
                                  setInformativeColumnChecked(false);
                                }}
                              >
                                All
                              </label>
                            </div>
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="checkbox"
                                      checked={informativeColumnChecked}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setInformativeColumnChecked(checked);
                                        if (checked) {
                                          // Select identifiers with unique_count > 1
                                          const informativeIds = identifiers.filter(id => 
                                            identifierUniqueCounts[id] !== undefined && identifierUniqueCounts[id] > 1
                                          );
                                          updateMetricsInputs({ selectedVariableIdentifiers: informativeIds });
                                        }
                                      }}
                                      className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                                    />
                                    <label 
                                      className="text-xs font-medium text-gray-700 cursor-pointer"
                                      onClick={() => {
                                        const newChecked = !informativeColumnChecked;
                                        setInformativeColumnChecked(newChecked);
                                        if (newChecked) {
                                          // Select identifiers with unique_count > 1
                                          const informativeIds = identifiers.filter(id => 
                                            identifierUniqueCounts[id] !== undefined && identifierUniqueCounts[id] > 1
                                          );
                                          updateMetricsInputs({ selectedVariableIdentifiers: informativeIds });
                                        }
                                      }}
                                    >
                                      Informative Column
                                    </label>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  <p>Selects columns that have more than 1 unique value (unique_count &gt; 1)</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2">
                            <div className="grid grid-cols-2 gap-1">
                              {identifiers.map((identifier, idx) => {
                                const isSelected = selectedIdentifiers.has(identifier);
                                return (
                                  <div key={idx} className="flex items-center space-x-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        const newSet = new Set(selectedVariableIdentifiers);
                                        if (e.target.checked) {
                                          newSet.add(identifier);
                                        } else {
                                          newSet.delete(identifier);
                                        }
                                        updateMetricsInputs({ selectedVariableIdentifiers: Array.from(newSet) });
                                      }}
                                      className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                                    />
                                    <label 
                                      className="text-xs text-gray-700 cursor-pointer flex-1 truncate" 
                                      title={identifier}
                                      onClick={() => {
                                        const newSet = new Set(selectedVariableIdentifiers);
                                        if (isSelected) {
                                          newSet.delete(identifier);
                                        } else {
                                          newSet.add(identifier);
                                        }
                                        updateMetricsInputs({ selectedVariableIdentifiers: Array.from(newSet) });
                                      }}
                                    >
                                      {identifier}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : metricsInputs.dataSource ? (
                        <p className="text-xs text-gray-500 mt-2">No identifiers found for the selected file.</p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-2">Please select a data source in the Input tab first.</p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
                  )}

                  {/* Numerical Column & Method Selection - shown for dataframe mode */}
                  <div className="space-y-2">
        {operations.map((operation, index) => (
          <div key={operation.id} className="space-y-1.5">
            {/* First row: Method, First Column, Delete Icon */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={operation.method} onValueChange={(value) => updateOperation(operation.id, { method: value, secondColumn: requiresSecondColumn(value) ? operation.secondColumn : '', secondInputType: requiresSecondColumn(value) ? (operation.secondInputType || 'column') : undefined, secondValue: requiresSecondColumn(value) ? (operation.secondValue || '') : '' })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sum" className="text-xs">Sum</SelectItem>
                    <SelectItem value="mean" className="text-xs">Mean</SelectItem>
                    <SelectItem value="median" className="text-xs">Median</SelectItem>
                    <SelectItem value="max" className="text-xs">Max</SelectItem>
                    <SelectItem value="min" className="text-xs">Min</SelectItem>
                    <SelectItem value="count" className="text-xs">Count</SelectItem>
                    <SelectItem value="nunique" className="text-xs">Nunique</SelectItem>
                    <SelectItem value="rank_pct" className="text-xs">Rank Percentile</SelectItem>
                    <SelectItem value="add" className="text-xs">Addition</SelectItem>
                    <SelectItem value="subtract" className="text-xs">Subtraction</SelectItem>
                    <SelectItem value="multiply" className="text-xs">Multiplication</SelectItem>
                    <SelectItem value="divide" className="text-xs">Division</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-0">
                <Select value={operation.numericalColumn} onValueChange={(value) => updateOperation(operation.id, { numericalColumn: value })}>
                  <SelectTrigger className="h-7 text-xs truncate" title={operation.numericalColumn || 'Select numerical column'}>
                    <SelectValue placeholder="Select numerical column" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingNumericalColumns ? (
                      <div className="px-2 py-1.5 text-xs text-gray-500">Loading...</div>
                    ) : (numericalColumns.length > 0 || (!computeWithinGroup && requiresSecondColumn(operation.method) && variableNames.length > 0)) ? (
                      <>
                        {numericalColumns.map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">
                            <span className="block" title={col}>
                              {col}
                            </span>
                          </SelectItem>
                        ))}
                        {!computeWithinGroup && requiresSecondColumn(operation.method) && variableNames.map((varName) => (
                          <SelectItem key={`var_${varName}`} value={varName} className="text-xs">
                            <span className="block text-blue-600 font-medium" title={varName}>
                              {varName}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    ) : (
                      <div className="px-2 py-1.5 text-xs text-gray-500">No numerical columns found</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {operations.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteOperation(operation.id)}
                  className="h-5 w-5 p-0 flex-shrink-0 text-gray-500 hover:text-red-600"
                  title="Delete operation"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </Button>
              )}
            </div>
            
            {/* Second row: Column/Number selection for arithmetic operations */}
            {requiresSecondColumn(operation.method) && (
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Select 
                    value={operation.secondInputType || 'column'} 
                    onValueChange={(value) => updateOperation(operation.id, { 
                      secondInputType: value as 'column' | 'number',
                      secondColumn: value === 'column' ? operation.secondColumn : '',
                      secondValue: value === 'number' ? operation.secondValue : ''
                    })}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="column" className="text-xs">Column</SelectItem>
                      <SelectItem value="number" className="text-xs">Number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {operation.secondInputType === 'number' ? (
                  <div className="flex-1 min-w-0">
                    <Input
                      type="number"
                      step="any"
                      placeholder="Enter number"
                      value={operation.secondValue || ''}
                      onChange={(e) => updateOperation(operation.id, { secondValue: e.target.value })}
                      className="h-7 text-xs"
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <Select value={operation.secondColumn} onValueChange={(value) => updateOperation(operation.id, { secondColumn: value })}>
                      <SelectTrigger className="h-7 text-xs truncate" title={operation.secondColumn || 'Select second column'}>
                        <SelectValue placeholder="Select second column" />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingNumericalColumns ? (
                          <div className="px-2 py-1.5 text-xs text-gray-500">Loading...</div>
                        ) : (numericalColumns.length > 0 || variableNames.length > 0) ? (
                          <>
                            {numericalColumns
                              .filter((col) => col !== operation.numericalColumn)
                              .map((col) => (
                                <SelectItem key={col} value={col} className="text-xs">
                                  <span className="block" title={col}>
                                    {col}
                                  </span>
                                </SelectItem>
                              ))}
                            {variableNames
                              .filter((varName) => varName !== operation.numericalColumn)
                              .map((varName) => (
                                <SelectItem key={`var_${varName}`} value={varName} className="text-xs">
                                  <span className="block text-blue-600 font-medium" title={varName}>
                                    {varName}
                                  </span>
                                </SelectItem>
                              ))}
                          </>
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-gray-500">No numerical columns found</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            
            {/* Third row: Rename input - shown when compute within group is false */}
            {!computeWithinGroup && (
              <div>
                <Input
                  type="text"
                  placeholder={`${operation.numericalColumn}_${operation.method}${operation.secondColumn ? `_${operation.secondColumn}` : operation.secondValue ? `_${operation.secondValue}` : ''}`}
                  value={operation.customName || ''}
                  onChange={(e) => updateOperation(operation.id, { customName: e.target.value })}
                  className="h-6 text-[10px] placeholder:text-[10px]"
                  title="Custom variable name (optional)"
                />
              </div>
            )}
            {/* Add button below the last operation */}
            {index === operations.length - 1 && (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOperation}
                  className="h-6 text-xs px-2"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            )}
          </div>
        ))}
                  </div>
                </>
              )}

              {variableType === 'constant' && (
                <div className="space-y-2 mt-2">
                  {constantAssignments.map((assignment, index) => (
                    <div key={assignment.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Input
                            type="text"
                            placeholder="Variable name"
                            value={assignment.variableName}
                            onChange={(e) => updateConstantAssignment(assignment.id, { variableName: e.target.value })}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <Input
                            type="text"
                            placeholder="Constant value"
                            value={assignment.value}
                            onChange={(e) => updateConstantAssignment(assignment.id, { value: e.target.value })}
                            className="h-7 text-xs"
                          />
                        </div>
                        {constantAssignments.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteConstantAssignment(assignment.id)}
                            className="h-5 w-5 p-0 flex-shrink-0 text-gray-500 hover:text-red-600"
                            title="Delete assignment"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </Button>
                        )}
                      </div>
                      {/* Add button below the last assignment */}
                      {index === constantAssignments.length - 1 && (
                        <div className="flex justify-center pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addConstantAssignment}
                            className="h-6 text-xs px-2"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Save Button - Sticky at bottom */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-2 mt-4 z-10">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-8 text-xs px-4 w-full"
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* Overwrite Confirmation Dialog */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Overwrite Existing Variables?</h3>
              <p className="text-sm text-gray-600 mt-2">
                The following variable(s) already exist and will be overwritten:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-700 mt-2 max-h-40 overflow-y-auto">
                {existingVariables.map((varName, idx) => (
                  <li key={idx} className="truncate" title={varName}>{varName}</li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 mt-2">
                Are you sure you want to continue?
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleCancelOverwrite}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmOverwrite}
                className="bg-red-600 hover:bg-red-700"
              >
                Overwrite
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default VariableTab;

