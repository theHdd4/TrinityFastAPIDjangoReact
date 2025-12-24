import React, { useRef, useEffect, useState, useCallback } from "react";
import { RotateCcw, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CheckboxTemplate } from "@/templates/checkbox";
import { useGroupByGuidedFlow } from "./useGroupByGuidedFlow";
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';

interface InlineGroupByGuidedFlowProps {
  atomId: string;
}

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

export const InlineGroupByGuidedFlow: React.FC<InlineGroupByGuidedFlowProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const dataSource = settings.dataSource || '';
  
  // Initialize flow with dataSource
  const flow = useGroupByGuidedFlow({ dataSource });
  const { restartFlow, updateState, state } = flow;
  
  // State for identifiers
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [identifierList, setIdentifierList] = useState<string[]>([]);
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<string[]>([]);
  
  // State for measures
  const [measureList, setMeasureList] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<Array<{ field: string; aggregator: string; weight_by?: string; rename_to?: string }>>([]);
  const [performLoading, setPerformLoading] = useState(false);
  
  // Step state: 1 = identifiers, 2 = measures
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  
  const { toast } = useToast();
  
  // Track previous data source to detect changes
  const prevDataSourceRef = useRef<string>('');
  
  // Helper to normalize column names
  const normalizeColumnName = (value: string | undefined | null) => {
    if (!value || typeof value !== 'string') return '';
    return value.trim().toLowerCase();
  };

  // Fetch identifiers from data source (same logic as GroupByInputFiles)
  useEffect(() => {
    const fetchIdentifiers = async () => {
      if (!dataSource) {
        setIdentifierList([]);
        setColumns([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Get column summary
        const res = await fetch(
          `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`
        );
        let summary: ColumnInfo[] = [];
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: ColumnInfo[] }>(raw);
          summary = (data.summary || []).filter(Boolean);
          setColumns(summary);
        }

        // Fetch identifiers/measures from backend (same as GroupByInputFiles)
        let fetchedIdentifiers: string[] = [];
        let fetchedMeasures: string[] = [];
        try {
          // Extract client/app/project from file path
          const pathParts = dataSource.split('/');
          const clientName = pathParts[0] ?? '';
          const appName = pathParts[1] ?? '';
          const projectName = pathParts[2] ?? '';

          // Get card_id and canvas_position for pipeline tracking
          const cards = useLaboratoryStore.getState().cards;
          const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
          const cardId = card?.id || '';
          const canvasPosition = card?.canvas_position ?? 0;

          const formData = new FormData();
          formData.append('bucket_name', 'trinity');
          formData.append('object_names', dataSource);
          formData.append('client_name', clientName);
          formData.append('app_name', appName);
          formData.append('project_name', projectName);
          formData.append('file_key', dataSource);
          formData.append('validator_atom_id', atomId);
          formData.append('card_id', cardId);
          formData.append('canvas_position', canvasPosition.toString());

          const resp = await fetch(`${GROUPBY_API}/init`, { method: 'POST', body: formData });
          console.log('[GroupBy Guided] /init status', resp.status);
          let payload: any = {};
          try {
            payload = await resp.json();
          } catch {}
          console.log('[GroupBy Guided] /init payload', payload);
          if (resp.ok) {
            const result = await resolveTaskResponse(payload);
            const resolved = result || {};
            fetchedIdentifiers = Array.isArray(resolved.identifiers) ? resolved.identifiers.filter(Boolean) : [];
            fetchedMeasures = Array.isArray(resolved.measures) ? resolved.measures.filter(Boolean) : [];
          }
        } catch (err) {
          console.warn('Failed to fetch identifiers/measures from backend, using fallback', err);
        }

        // Fallback: derive identifiers from column summary (categorical columns) if backend didn't provide any
        if (fetchedIdentifiers.length === 0 && summary.length > 0) {
          fetchedIdentifiers = summary
            .filter(
              (c) =>
                c.data_type &&
                (c.data_type.toLowerCase().includes('object') ||
                  c.data_type.toLowerCase().includes('string') ||
                  c.data_type.toLowerCase().includes('category'))
            )
            .map((c) => c.column);
        }
        
        // Fallback: derive measures from column summary (numerical columns) if backend didn't provide any
        if (fetchedMeasures.length === 0 && summary.length > 0) {
          fetchedMeasures = summary
            .filter(
              (c) =>
                c.data_type &&
                (c.data_type.toLowerCase().includes('int') ||
                  c.data_type.toLowerCase().includes('float') ||
                  c.data_type.toLowerCase().includes('number'))
            )
            .map((c) => c.column);
        }

        // Normalize identifiers and measures (same as GroupByInputFiles)
        const normalizedIdentifiers = fetchedIdentifiers.map(id => normalizeColumnName(id)).filter(Boolean);
        const normalizedMeasures = fetchedMeasures.map(m => normalizeColumnName(m)).filter(Boolean);
        setIdentifierList(normalizedIdentifiers);
        setMeasureList(normalizedMeasures);
        
        // Update settings with columns, identifierList, and measures for later use
        updateSettings(atomId, { 
          allColumns: summary,
          identifierList: normalizedIdentifiers,
          identifiers: normalizedIdentifiers,
          measures: normalizedMeasures,
          measureList: normalizedMeasures
        });
      } catch (error) {
        console.error('Error fetching identifiers:', error);
        setIdentifierList([]);
        setColumns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchIdentifiers();
  }, [dataSource, atomId, updateSettings]);
  
  // Initialize selected identifiers from flow state
  useEffect(() => {
    if (state.selectedIdentifiers && state.selectedIdentifiers.length > 0) {
      setSelectedIdentifiers(state.selectedIdentifiers);
    }
  }, [state.selectedIdentifiers]);
  
  // Update dataSource in flow state when it changes
  useEffect(() => {
    if (prevDataSourceRef.current && 
        settings.showGuidedMode && 
        dataSource && 
        dataSource !== prevDataSourceRef.current) {
      restartFlow();
      updateState({ dataSource });
    }
    
    if (dataSource && flow.state.dataSource !== dataSource) {
      updateState({ dataSource });
    }
    
    prevDataSourceRef.current = dataSource;
  }, [dataSource, settings.showGuidedMode, flow.state.dataSource, updateState, restartFlow]);

  const handleReset = () => {
    restartFlow();
    setSelectedIdentifiers([]);
    setSelectedMeasures([]);
    setCurrentStep(1);
  };

  // Toggle identifier selection
  const toggleIdentifier = useCallback((identifier: string) => {
    setSelectedIdentifiers(prev => {
      if (prev.includes(identifier)) {
        return prev.filter(id => id !== identifier);
      } else {
        return [...prev, identifier];
      }
    });
  }, []);

  // Handle Select All
  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedIdentifiers(checked ? [...identifierList] : []);
  }, [identifierList]);

  // Handle Select Informative (unique_count > 1)
  const handleSelectInformative = useCallback((checked: boolean) => {
    const informativeIds = identifierList.filter(id => {
      const colInfo = columns.find((col) => col.column === id);
      return colInfo && colInfo.unique_count > 1;
    });
    setSelectedIdentifiers(checked ? informativeIds : []);
  }, [identifierList, columns]);

  // Handle Continue - move to step 2 (measures)
  const handleContinue = useCallback(() => {
    updateState({ selectedIdentifiers });
    updateSettings(atomId, { selectedIdentifiers });
    setCurrentStep(2);
    // Initialize with one empty measure if none exist
    if (selectedMeasures.length === 0) {
      setSelectedMeasures([{ field: '', aggregator: '', weight_by: '', rename_to: '' }]);
    }
  }, [selectedIdentifiers, updateState, updateSettings, atomId, selectedMeasures.length]);

  // Get numeric columns for measures
  const numericColumns = columns
    .filter(
      (c) =>
        c.data_type &&
        (c.data_type.toLowerCase().includes('int') ||
          c.data_type.toLowerCase().includes('float') ||
          c.data_type.toLowerCase().includes('number'))
    )
    .map((c) => c.column);

  // Aggregation methods
  const aggregationMethods = ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];

  // Update measure configuration at a specific index
  const updateMeasureConfigAtIndex = useCallback((index: number, updates: Partial<{ field: string; aggregator: string; weight_by: string; rename_to: string }>) => {
    setSelectedMeasures(prev => prev.map((m, i) => (i === index ? { ...m, ...updates } : m)));
  }, []);

  // Add a new measure card
  const handleAddMeasure = useCallback(() => {
    setSelectedMeasures(prev => [...prev, { field: '', aggregator: '', weight_by: '', rename_to: '' }]);
  }, []);

  // Remove a measure card
  const handleRemoveMeasure = useCallback((index: number) => {
    setSelectedMeasures(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle Perform
  const handlePerform = async () => {
    setPerformLoading(true);
    try {
      // Collect identifiers and measures
      const identifiers = selectedIdentifiers.map((id: string) => normalizeColumnName(id)).filter(Boolean);
      
      // Filter out incomplete measures
      const measuresWithConfig = selectedMeasures
        .filter(m => m.field && m.aggregator)
        .map(m => ({
          ...m,
          aggregator: m.aggregator || 'Sum'
        }));
      
      // Build aggregations object
      const aggregations: Record<string, any> = {};
      const existingColsLower = new Set(
        columns.map((c: any) => (c.column || '').toLowerCase())
      );
      const renameSeen = new Set<string>();

      measuresWithConfig.forEach((measure: any) => {
        if (measure.field && measure.aggregator) {
          const aggRaw = (measure.aggregator || '').toLowerCase();
          let aggKey = aggRaw;
          if (aggRaw === 'weighted mean') aggKey = 'weighted_mean';
          if (aggRaw === 'rank percentile') aggKey = 'rank_pct';

          const normalizedField = normalizeColumnName(measure.field);
          if (!normalizedField) return;

          const defaultRenameTo = `${normalizedField}_${aggKey}`;
          let outputColumnName: string;

          if (measure.rename_to && measure.rename_to.trim()) {
            const renameLower = measure.rename_to.trim().toLowerCase();
            if (renameSeen.has(renameLower) || existingColsLower.has(renameLower)) {
              toast({
                title: 'Invalid rename',
                description: `Column name '${measure.rename_to}' is already used. Choose a unique name.`,
                variant: 'destructive',
              });
              setPerformLoading(false);
              throw new Error(`Duplicate or existing column name: ${measure.rename_to}`);
            }
            renameSeen.add(renameLower);
            outputColumnName = measure.rename_to.trim();
          } else {
            let finalRenameTo = defaultRenameTo;
            let counter = 1;
            while (renameSeen.has(finalRenameTo.toLowerCase())) {
              finalRenameTo = `${defaultRenameTo}_${counter}`;
              counter++;
            }
            renameSeen.add(finalRenameTo.toLowerCase());
            outputColumnName = finalRenameTo;
          }
          
          const aggObj: any = { 
            agg: aggKey,
            column: normalizedField,
            rename_to: outputColumnName
          };
          
          if (aggKey === 'weighted_mean' && measure.weight_by) {
            aggObj.weight_by = normalizeColumnName(measure.weight_by);
          }
          
          aggregations[outputColumnName] = aggObj;
        }
      });

      // Validate
      if (identifiers.length === 0) {
        toast({
          title: 'Missing Identifiers',
          description: 'Please select at least one identifier.',
          variant: 'destructive',
        });
        setPerformLoading(false);
        return;
      }
      
      if (Object.keys(aggregations).length === 0) {
        toast({
          title: 'Missing Measures',
          description: 'Please select at least one measure with an aggregation method.',
          variant: 'destructive',
        });
        setPerformLoading(false);
        return;
      }
      
      // Prepare form data
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      const formData = new FormData();
      formData.append('validator_atom_id', atomId);
      formData.append('file_key', dataSource);
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', dataSource);
      formData.append('identifiers', JSON.stringify(identifiers));
      formData.append('aggregations', JSON.stringify(aggregations));
      formData.append('card_id', cardId);
      formData.append('canvas_position', canvasPosition.toString());
      
      const res = await fetch(`${GROUPBY_API}/run`, { method: 'POST', body: formData });
      let payload: any = {};
      try {
        payload = await res.json();
      } catch {}

      if (!res.ok) {
        let detail = res.statusText;
        if (payload?.detail) {
          if (typeof payload.detail === 'string') {
            detail = payload.detail;
          } else if (Array.isArray(payload.detail)) {
            detail = payload.detail.map((err: any) => {
              const loc = err.loc ? err.loc.join(' -> ') : 'unknown';
              return `${loc}: ${err.msg}`;
            }).join(', ');
          }
        }
        throw new Error(detail || 'GroupBy run failed');
      }

      const data = (await resolveTaskResponse(payload)) || {};
      
      if (data.status === 'SUCCESS' && data.result_file) {
        if (data.results && Array.isArray(data.results)) {
          const allRows = data.results;
          const idWithVariety = selectedIdentifiers.filter((id: string) => {
            const uniq = new Set(allRows.map((r: any) => r[id])).size;
            return uniq > 1;
          });
          
          const headers = Object.keys(allRows[0]).filter((h) => {
            if (selectedIdentifiers.includes(h)) {
              return idWithVariety.includes(h);
            }
            return true;
          });
          
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
          
          // Scroll to preview table section
          setTimeout(() => {
            const previewElement = document.querySelector(`[data-groupby-preview="${atomId}"]`);
            if (previewElement) {
              previewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        } else {
          toast({
            title: 'Success',
            description: 'GroupBy operation completed successfully.',
          });
          
          // Scroll to preview table section
          setTimeout(() => {
            const previewElement = document.querySelector(`[data-groupby-preview="${atomId}"]`);
            if (previewElement) {
              previewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 100);
        }
      } else {
        toast({
          title: 'Error',
          description: data.error || 'GroupBy operation failed',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      console.error('❌ GroupBy Perform Error:', e);
      toast({
        title: 'Error',
        description: e.message || 'Error performing groupby',
        variant: 'destructive',
      });
    } finally {
      setPerformLoading(false);
    }
  };

  // Computed values
  const allSelected = identifierList.length > 0 && identifierList.every(id => selectedIdentifiers.includes(id));
  const informativeIds = identifierList.filter(id => {
    const colInfo = columns.find((col) => col.column === id);
    return colInfo && colInfo.unique_count > 1;
  });
  const allInformativeSelected = informativeIds.length > 0 && informativeIds.every(id => selectedIdentifiers.includes(id));
  const canContinue = selectedIdentifiers.length > 0;
  const canPerform = selectedIdentifiers.length > 0 && selectedMeasures.some(m => m.field && m.aggregator);

  if (loading) {
    return (
      <div className="w-full min-w-0">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading identifiers...</span>
        </div>
          </div>
        );
      }

      return (
    <div className="w-full min-w-0">
      <div className="w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-lg font-semibold text-gray-900">
            Configure GroupBy Operation
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-1 text-gray-600"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </Button>
        </div>
        
        {/* Identifiers Selection - Always visible */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Choose columns to group the data by</CardTitle>
          </CardHeader>
          <CardContent className="py-3">
            <div className="flex items-center justify-between pb-2 border-b mb-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all-identifiers"
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                />
                <label
                  htmlFor="select-all-identifiers"
                  className="text-xs font-medium cursor-pointer"
                >
                  Select All
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-informative-identifiers"
                  checked={allInformativeSelected}
                  onCheckedChange={handleSelectInformative}
                />
                <label
                  htmlFor="select-informative-identifiers"
                  className="text-xs font-medium cursor-pointer"
                >
                  Informative Columns
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {identifierList.map((identifier: string) => {
                const isSelected = selectedIdentifiers.includes(identifier);
                return (
                  <div
                    key={identifier}
                    title={identifier}
                    className="select-none"
                  >
                    <CheckboxTemplate
                      id={identifier}
                      label={identifier}
                      checked={isSelected}
                      onCheckedChange={() => toggleIdentifier(identifier)}
                      labelClassName="text-xs cursor-pointer capitalize truncate max-w-full"
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Continue Button - Only show in step 1 */}
        {currentStep === 1 && (
          <div className="mt-4">
                        <Button
              onClick={handleContinue}
              disabled={!canContinue}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </Button>
          </div>
        )}

        {/* Measures Configuration - Show below identifiers with animation */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            currentStep === 2
              ? 'max-h-[2000px] opacity-100 mt-4'
              : 'max-h-0 opacity-0 mt-0'
          }`}
        >
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Choose columns to perform aggregations on</CardTitle>
            </CardHeader>
            <CardContent className="py-3 flex flex-col">
              <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-96">
                {selectedMeasures.map((measureConfig, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg bg-gradient-to-r from-green-50/50 to-emerald-50/50 p-3"
                  >
                    {/* Single-line layout: Column | Method | Rename To | Delete */}
                    <div className="flex items-end gap-2">
                      {/* Measure Column */}
                      <div className="flex-1">
                        <Label className="text-[10px] text-gray-600 mb-1 block">Column</Label>
                        <Select
                          value={measureConfig.field || undefined}
                          onValueChange={(value) => updateMeasureConfigAtIndex(index, { field: value })}
                        >
                          <SelectTrigger className="h-8 text-[11px] bg-white">
                            <SelectValue placeholder="Select a measure" />
                          </SelectTrigger>
                          <SelectContent>
                            {numericColumns.length > 0 ? (
                              numericColumns.map((col: string) => (
                                <SelectItem key={col} value={col} className="text-[11px]">{col}</SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-[10px] text-gray-500">No numeric columns available</div>
                            )}
                          </SelectContent>
                        </Select>
                    </div>

                      {/* Method */}
                      <div className="flex-1">
                        <Label className="text-[10px] text-gray-600 mb-1 block">Method</Label>
                        <Select
                          value={measureConfig.aggregator || undefined}
                          onValueChange={(value) => updateMeasureConfigAtIndex(index, { aggregator: value })}
                        >
                          <SelectTrigger className="h-8 text-[11px] bg-white">
                            <SelectValue placeholder="Select a method" />
                          </SelectTrigger>
                          <SelectContent>
                            {aggregationMethods.map((agg: string) => (
                              <SelectItem key={agg} value={agg} className="text-[11px]">{agg}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Weight By (conditional - only show for Weighted Mean) */}
                      {measureConfig.aggregator === 'Weighted Mean' && (
                        <div className="flex-1">
                          <Label className="text-[10px] text-gray-600 mb-1 block">Weight By</Label>
                          <Select
                            value={measureConfig.weight_by || undefined}
                            onValueChange={(value) => updateMeasureConfigAtIndex(index, { weight_by: value })}
                          >
                            <SelectTrigger className="h-8 text-[11px] bg-white">
                              <SelectValue placeholder="Select weight column" />
                            </SelectTrigger>
                            <SelectContent>
                              {numericColumns.length > 0 ? (
                                numericColumns.map((col: string) => (
                                  <SelectItem key={col} value={col} className="text-[11px]">{col}</SelectItem>
                                ))
                              ) : (
                                <div className="p-2 text-[10px] text-gray-500">No numeric columns available</div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Rename To */}
                      <div className="flex-1">
                        <Label className="text-[10px] text-gray-600 mb-1 block">Rename To</Label>
                        <Input
                          placeholder="Optional"
                          value={measureConfig.rename_to || ''}
                          onChange={(e) => updateMeasureConfigAtIndex(index, { rename_to: e.target.value })}
                          className="h-8 text-[11px] bg-white placeholder:text-[10px]"
                        />
                      </div>

                      {/* Delete Button */}
                      <div className="flex items-end">
                        <button
                          onClick={() => handleRemoveMeasure(index)}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors mb-0.5"
                          title="Delete measure"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Add Measure Button - at bottom right */}
              <div className="mt-3 pt-2 border-t flex justify-end">
                <Button
                  onClick={handleAddMeasure}
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Measure
                </Button>
                </div>
            </CardContent>
          </Card>

          {/* Perform Button */}
          <div className="mt-4">
            <Button
              onClick={handlePerform}
              disabled={!canPerform || performLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {performLoading ? 'Processing...' : 'Perform'}
            </Button>
            </div>
        </div>

        {/* Custom scrollbar styles */}
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 10px;
            background: #f3f4f6;
            border-radius: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #d1d5db;
            border-radius: 8px;
            border: 2px solid #f3f4f6;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #9ca3af;
          }
          .custom-scrollbar {
            scrollbar-color: #d1d5db #f3f4f6;
            scrollbar-width: thin;
          }
        `}</style>
      </div>
    </div>
  );
};
