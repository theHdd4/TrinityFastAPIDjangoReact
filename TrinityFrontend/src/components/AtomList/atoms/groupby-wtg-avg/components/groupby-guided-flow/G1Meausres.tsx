import React, { useState, useEffect, useCallback } from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGroupByGuidedFlow } from './useGroupByGuidedFlow';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';

interface G1MeasuresProps {
  flow: ReturnType<typeof useGroupByGuidedFlow>;
  atomId: string;
  readOnly?: boolean;
}

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

function G1Measures({ flow, atomId, readOnly }: G1MeasuresProps) {
  const { state, updateState, goToNextStage } = flow;
  const atom = useLaboratoryStore(storeState => storeState.getAtom(atomId));
  const settings = atom?.settings || {};
  const [measures, setMeasures] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelectedMeasures, setLocalSelectedMeasures] = useState<string[]>([]);

  // Initialize local selection from state if available, and clear when reset
  useEffect(() => {
    if (state.selectedMeasures && state.selectedMeasures.length > 0) {
      setLocalSelectedMeasures(state.selectedMeasures);
    } else {
      // Clear local state when flow state is cleared (reset)
      setLocalSelectedMeasures([]);
    }
  }, [state.selectedMeasures]);

  // Fetch measures from data source
  useEffect(() => {
    const fetchMeasures = async () => {
      if (!state.dataSource) {
        // Try to get from settings as fallback
        const dataSource = settings.dataSource || '';
        if (!dataSource) {
          setMeasures([]);
          return;
        }
        updateState({ dataSource });
      }

      const dataSource = state.dataSource || settings.dataSource || '';
      if (!dataSource) {
        setMeasures([]);
        return;
      }

      setLoading(true);
      try {
        // First, get column summary
        const res = await fetch(
          `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`
        );
        let summary: ColumnInfo[] = [];
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: ColumnInfo[] }>(raw);
          summary = (data.summary || []).filter(Boolean);
        }

        // Try to get measures from backend API
        let fetchedMeasures: string[] = [];
        try {
          const pathParts = dataSource.split('/');
          const clientName = pathParts[0] ?? '';
          const appName = pathParts[1] ?? '';
          const projectName = pathParts[2] ?? '';

          const formData = new FormData();
          formData.append('bucket_name', 'trinity');
          formData.append('object_names', dataSource);
          formData.append('client_name', clientName);
          formData.append('app_name', appName);
          formData.append('project_name', projectName);
          formData.append('file_key', dataSource);

          const resp = await fetch(`${GROUPBY_API}/init`, { method: 'POST', body: formData });
          if (resp.ok) {
            const payload = await res.json();
            const result = await resolveTaskResponse(payload);
            fetchedMeasures = Array.isArray(result?.measures) ? result.measures.filter(Boolean) : [];
          }
        } catch (err) {
          console.warn('Failed to fetch measures from backend, using fallback', err);
        }

        // Fallback: derive measures from column summary (numerical columns)
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

        setMeasures(fetchedMeasures);
      } catch (error) {
        console.error('Error fetching measures:', error);
        setMeasures([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMeasures();
  }, [state.dataSource, settings.dataSource, updateState]);

  const toggleMeasure = useCallback((measure: string) => {
    setLocalSelectedMeasures(prev => {
      if (prev.includes(measure)) {
        return prev.filter(m => m !== measure);
      } else {
        return [...prev, measure];
      }
    });
  }, []);

  // Save handler that will be called when Next button is clicked
  const saveAndProceed = useCallback(() => {
    // Save selected measures to flow state
    updateState({ selectedMeasures: localSelectedMeasures });
    // Proceed to next stage
    goToNextStage();
  }, [localSelectedMeasures, updateState, goToNextStage]);

  // Expose save handler to parent via flow object
  useEffect(() => {
    if (!readOnly) {
      (flow as any).handleStageNext = saveAndProceed;
    }
    return () => {
      delete (flow as any).handleStageNext;
    };
  }, [saveAndProceed, readOnly, flow]);

  // Update canProceedToNext in flow state when selection changes
  useEffect(() => {
    if (!readOnly) {
      const canProceed = localSelectedMeasures.length > 0;
      if (state.canProceedToNext !== canProceed) {
        updateState({ canProceedToNext: canProceed });
      }
    }
  }, [localSelectedMeasures, readOnly, updateState, state.canProceedToNext]);

  if (readOnly) {
    return (
      <div>
        <p className="text-gray-700">
          Selected measures: {state.selectedMeasures?.join(', ') || 'None'}
        </p>
        <p className="text-sm text-gray-500 mt-2">This stage has been completed.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-500">Loading measures...</p>
      </div>
    );
  }

  if (measures.length === 0) {
    return (
      <div>
        <p className="text-sm text-gray-500">
          No measures found. Please ensure a data source is selected and contains numerical columns.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Info Icon */}
      <div className="flex items-start justify-between">
        <div className="flex-1"></div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-gray-400 hover:text-gray-600 transition-colors">
                <Info className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                Select the measures (numeric/text columns) you want to aggregate in your group by operation.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {/* Measures Grid - 3 columns */}
      <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {measures.map((measure) => {
          const isSelected = localSelectedMeasures.includes(measure);
          return (
            <div
              key={measure}
              className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded"
            >
              <Checkbox
                id={`measure-${measure}`}
                checked={isSelected}
                onCheckedChange={() => toggleMeasure(measure)}
              />
              <Label
                htmlFor={`measure-${measure}`}
                className="text-sm font-medium text-gray-700 cursor-pointer flex-1 truncate"
                title={measure}
              >
                {measure}
              </Label>
            </div>
          );
        })}
      </div>

      {localSelectedMeasures.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-500">
            {localSelectedMeasures.length} measure{localSelectedMeasures.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}

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

export default G1Measures;