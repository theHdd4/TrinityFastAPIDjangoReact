import React, { useEffect, useCallback } from 'react';
import { useGroupByGuidedFlow, MeasureConfig } from './useGroupByGuidedFlow';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface G3OperationsProps {
  flow: ReturnType<typeof useGroupByGuidedFlow>;
  atomId: string;
  readOnly?: boolean;
}

const AGGREGATION_METHODS = ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];

const normalizeColumnName = (value: string | undefined | null) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

function G3Operations({ flow, atomId, readOnly }: G3OperationsProps) {
  const { state, updateState, restartFlow } = flow;
  const atom = useLaboratoryStore(storeState => storeState.getAtom(atomId));
  const updateSettings = useLaboratoryStore(storeState => storeState.updateAtomSettings);
  const settings = atom?.settings || {};
  const { toast } = useToast();

  // Get measure configs from flow state (no local state)
  const measureConfigs = state.measureConfigs || [];

  // Get numeric columns for Weight By dropdown
  const numericColumns = (settings.allColumns || []).filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('int') ||
      c.data_type.toLowerCase().includes('float') ||
      c.data_type.toLowerCase().includes('number')
    )
  ).map((c: any) => c.column);

  // Initialize measure configs from selectedMeasures if not already set
  useEffect(() => {
    if ((!state.measureConfigs || state.measureConfigs.length === 0) && 
        state.selectedMeasures && state.selectedMeasures.length > 0) {
      // Create default configs with empty aggregator (placeholder)
      const defaultConfigs = state.selectedMeasures.map(measure => ({
        field: measure,
        aggregator: '',
        weight_by: '',
        rename_to: ''
      }));
      updateState({ measureConfigs: defaultConfigs });
    }
  }, [state.selectedMeasures, state.measureConfigs, updateState]);

  // Update a specific measure config directly in flow state
  const updateMeasureConfig = useCallback((measureField: string, field: keyof MeasureConfig, value: string) => {
    const updatedConfigs = measureConfigs.map(config => {
      if (config.field === measureField) {
        return { ...config, [field]: value };
      }
      return config;
    });
    updateState({ measureConfigs: updatedConfigs });
  }, [measureConfigs, updateState]);

  // Check if all measures have aggregators selected
  const allConfigured = measureConfigs.length > 0 && measureConfigs.every(config => 
    config.aggregator && config.aggregator.trim() !== ''
  );

  // Handler for Perform button
  const handlePerform = async () => {
    updateState({ isPerforming: true });
    
    try {
      // Collect identifiers
      const identifiers = (state.selectedIdentifiers || []).map((id: string) => normalizeColumnName(id)).filter(Boolean);
      
      // Build aggregations object from measure configs
      const aggregations: Record<string, any> = {};
      const existingColsLower = new Set(
        (settings.allColumns || []).map((c: any) => (c.column || '').toLowerCase())
      );
      const renameSeen = new Set<string>();

      for (const config of measureConfigs) {
        if (config.field && config.aggregator) {
          const aggRaw = (config.aggregator || '').toLowerCase();
          let aggKey = aggRaw;
          if (aggRaw === 'weighted mean') aggKey = 'weighted_mean';
          if (aggRaw === 'rank percentile') aggKey = 'rank_pct';

          const normalizedField = normalizeColumnName(config.field);
          if (!normalizedField) continue;

          const aggObj: any = { agg: aggKey };
          
          // Validate rename uniqueness
          if (config.rename_to && config.rename_to.trim()) {
            const renameLower = config.rename_to.trim().toLowerCase();
            if (renameSeen.has(renameLower) || existingColsLower.has(renameLower)) {
              toast({
                title: 'Invalid rename',
                description: `Column name '${config.rename_to}' is already used. Choose a unique name.`,
                variant: 'destructive',
              });
              updateState({ isPerforming: false });
              return;
            }
            renameSeen.add(renameLower);
            aggObj.rename_to = config.rename_to.trim();
          }
          
          if (aggKey === 'weighted_mean' && config.weight_by) {
            aggObj.weight_by = normalizeColumnName(config.weight_by);
          }
          aggregations[normalizedField] = aggObj;
        }
      }

      // Validate we have data to send
      if (identifiers.length === 0) {
        toast({
          title: 'Missing Identifiers',
          description: 'Please go back and select at least one identifier.',
          variant: 'destructive',
        });
        updateState({ isPerforming: false });
        return;
      }
      
      if (Object.keys(aggregations).length === 0) {
        toast({
          title: 'Missing Measures',
          description: 'Please configure at least one measure with an aggregation method.',
          variant: 'destructive',
        });
        updateState({ isPerforming: false });
        return;
      }
      
      // Prepare form data
      const formData = new FormData();
      formData.append('validator_atom_id', atomId);
      formData.append('file_key', settings.dataSource || '');
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', settings.dataSource || '');
      formData.append('identifiers', JSON.stringify(identifiers));
      formData.append('aggregations', JSON.stringify(aggregations));
      
      console.log('🚀 GroupBy Guided Flow - Performing:', {
        identifiers,
        aggregations,
        dataSource: settings.dataSource
      });
      
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
          
          const idWithVariety = (state.selectedIdentifiers || []).filter((id: string) => {
            const uniq = new Set(allRows.map((r: any) => r[id])).size;
            return uniq > 1;
          });
          
          const headers = Object.keys(allRows[0]).filter((h) => {
            if ((state.selectedIdentifiers || []).includes(h)) {
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
        } else {
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
            console.error('Error fetching cached results:', fetchError);
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
        
        updateState({ 
          performCompleted: true,
          isPerforming: false
        });
        
        // Clear flow state and close guided mode after successful perform
        setTimeout(() => {
          restartFlow();
          updateSettings(atomId, { showGuidedMode: false });
        }, 500); // Small delay to ensure success toast is visible
      } else {
        toast({
          title: 'Error',
          description: data.error || 'GroupBy operation failed',
          variant: 'destructive',
        });
        updateState({ isPerforming: false });
      }
    } catch (e: any) {
      console.error('GroupBy Perform Error:', e);
      toast({
        title: 'Error',
        description: e.message || 'Error performing groupby',
        variant: 'destructive',
      });
      updateState({ isPerforming: false });
    }
  };

  // Clear handleStageNext since we handle Perform differently
  useEffect(() => {
    if (!readOnly) {
      delete (flow as any).handleStageNext;
    }
    return () => {
      delete (flow as any).handleStageNext;
    };
  }, [readOnly, flow]);

  if (readOnly) {
    return (
      <div>
        <p className="text-gray-700">Configured measures with aggregations.</p>
        <p className="text-sm text-gray-500 mt-2">This stage has been completed.</p>
      </div>
    );
  }

  if (!state.selectedMeasures || state.selectedMeasures.length === 0) {
    return (
      <div>
        <p className="text-gray-700 mb-4">Configure the aggregation operations for your selected measures.</p>
        <p className="text-sm text-gray-500">No measures selected. Please go back to Step 1 and select measures.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-700 text-sm">
        Configure the aggregation method for each measure.
      </p>

      {/* Measures Configuration List - Each row: Measure Name | Operation | Rename */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
        {measureConfigs.map((config) => (
          <div
            key={config.field}
            className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50"
          >
            {/* Measure name */}
            <div className="flex-shrink-0 w-32 font-medium text-sm text-gray-900 truncate" title={config.field}>
              {config.field}
            </div>
            
            {/* Aggregation Method */}
            <Select 
              value={config.aggregator || ''} 
              onValueChange={(value) => updateMeasureConfig(config.field, 'aggregator', value)}
            >
              <SelectTrigger className="h-8 text-xs bg-white flex-1 min-w-[120px]">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                {AGGREGATION_METHODS.map((agg: string) => (
                  <SelectItem key={agg} value={agg} className="text-xs">{agg}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Weight By (only for Weighted Mean) */}
            {config.aggregator === 'Weighted Mean' && (
              <Select 
                value={config.weight_by || ''} 
                onValueChange={(value) => updateMeasureConfig(config.field, 'weight_by', value)}
              >
                <SelectTrigger className="h-8 text-xs bg-white flex-1 min-w-[100px]">
                  <SelectValue placeholder="Weight by" />
                </SelectTrigger>
                <SelectContent>
                  {numericColumns.length > 0 ? (
                    numericColumns.map((col: string) => (
                      <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-gray-500">No numeric columns</div>
                  )}
                </SelectContent>
              </Select>
            )}

            {/* Rename To */}
            <Input
              placeholder="New column name"
              value={config.rename_to || ''}
              onChange={(e) => updateMeasureConfig(config.field, 'rename_to', e.target.value)}
              className="h-8 text-xs bg-white flex-1 min-w-[120px]"
            />
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="pt-2 border-t">
        <p className="text-xs text-gray-500">
          {measureConfigs.filter(c => c.aggregator).length}/{measureConfigs.length} configured
          {state.selectedIdentifiers && state.selectedIdentifiers.length > 0 && (
            <span> • {state.selectedIdentifiers.length} identifier{state.selectedIdentifiers.length !== 1 ? 's' : ''}</span>
          )}
        </p>
      </div>

      {/* Perform Button - Always render but disable when not configured */}
      <div className="pt-4 border-t">
        <Button
          onClick={handlePerform}
          disabled={!allConfigured || state.isPerforming}
          className="w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.isPerforming ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Perform GroupBy'
          )}
        </Button>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }
      `}</style>
    </div>
  );
}

export default G3Operations;
