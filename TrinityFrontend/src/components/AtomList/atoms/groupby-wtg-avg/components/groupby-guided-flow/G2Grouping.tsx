import React, { useState, useEffect, useCallback } from 'react';
import { useGroupByGuidedFlow } from './useGroupByGuidedFlow';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';

interface G2GroupingProps {
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

const normalizeColumnName = (value: string | undefined | null) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

function G2Grouping({ flow, atomId, readOnly }: G2GroupingProps) {
  const { state, updateState, goToNextStage } = flow;
  const atom = useLaboratoryStore(storeState => storeState.getAtom(atomId));
  const settings = atom?.settings || {};
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelectedIdentifiers, setLocalSelectedIdentifiers] = useState<string[]>([]);

  // Initialize local selection from state if available, and clear when reset
  useEffect(() => {
    if (state.selectedIdentifiers && state.selectedIdentifiers.length > 0) {
      setLocalSelectedIdentifiers(state.selectedIdentifiers);
    } else {
      // Clear local state when flow state is cleared (reset)
      setLocalSelectedIdentifiers([]);
    }
  }, [state.selectedIdentifiers]);

  // Fetch identifiers from data source (same logic as settings tab)
  useEffect(() => {
    const fetchIdentifiers = async () => {
      const dataSource = state.dataSource || settings.dataSource || '';
      if (!dataSource) {
        setIdentifiers([]);
        setLoading(false);
        return;
      }

      // Update flow state if dataSource is not in state yet
      if (!state.dataSource && settings.dataSource) {
        updateState({ dataSource: settings.dataSource });
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
          setColumns(summary);
        }

        // Try to get identifiers from backend API
        let fetchedIdentifiers: string[] = [];
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
            fetchedIdentifiers = Array.isArray(result?.identifiers) ? result.identifiers.filter(Boolean) : [];
          }
        } catch (err) {
          console.warn('Failed to fetch identifiers from backend, using fallback', err);
        }

        // Fallback: derive identifiers from column summary (categorical columns)
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

        // Normalize identifiers
        const normalizedIdentifiers = fetchedIdentifiers.map(id => normalizeColumnName(id)).filter(Boolean);
        setIdentifiers(normalizedIdentifiers);
      } catch (error) {
        console.error('Error fetching identifiers:', error);
        setIdentifiers([]);
      } finally {
        setLoading(false);
      }
    };

    const dataSource = state.dataSource || settings.dataSource || '';
    if (dataSource) {
      fetchIdentifiers();
    } else {
      setIdentifiers([]);
      setLoading(false);
    }
  }, [state.dataSource, settings.dataSource, updateState, atomId]);

  const toggleIdentifier = useCallback((identifier: string) => {
    setLocalSelectedIdentifiers(prev => {
      if (prev.includes(identifier)) {
        return prev.filter(id => id !== identifier);
      } else {
        return [...prev, identifier];
      }
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    // Exact logic from GroupByProperties: set to all identifiers or empty array
    setLocalSelectedIdentifiers(checked ? [...identifiers] : []);
  }, [identifiers]);

  const handleSelectInformative = useCallback((checked: boolean) => {
    // Get identifiers with unique_count > 1 (exact logic from GroupByProperties)
    const informativeIds = identifiers.filter(id => {
      const colInfo = columns.find((col: any) => col.column === id);
      return colInfo && colInfo.unique_count > 1;
    });
    
    // Exact logic from GroupByProperties: set to informative IDs or empty array
    setLocalSelectedIdentifiers(checked ? informativeIds : []);
  }, [identifiers, columns]);

  // Save handler that will be called when Next button is clicked
  const saveAndProceed = useCallback(() => {
    // Save selected identifiers to flow state
    updateState({ selectedIdentifiers: localSelectedIdentifiers });
    // Proceed to next stage
    goToNextStage();
  }, [localSelectedIdentifiers, updateState, goToNextStage]);

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
      const canProceed = localSelectedIdentifiers.length > 0;
      if (state.canProceedToNext !== canProceed) {
        updateState({ canProceedToNext: canProceed });
      }
    }
  }, [localSelectedIdentifiers, readOnly, updateState, state.canProceedToNext]);

  if (readOnly) {
    return (
      <div>
        <p className="text-gray-700">
          Selected identifiers: {state.selectedIdentifiers?.join(', ') || 'None'}
        </p>
        <p className="text-sm text-gray-500 mt-2">This stage has been completed.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-gray-500">Loading identifiers...</p>
      </div>
    );
  }

  if (identifiers.length === 0) {
    return (
      <div>
        <p className="text-gray-700 mb-4">
          Choose the columns you want to group by. These will be your identifier columns.
        </p>
        <p className="text-sm text-gray-500">
          No identifiers found. Please ensure a data source is selected and contains categorical columns.
        </p>
      </div>
    );
  }

  // Get informative identifiers (unique_count > 1) - exact logic from GroupByProperties
  const informativeIds = identifiers.filter(id => {
    const colInfo = columns.find((col: any) => col.column === id);
    return colInfo && colInfo.unique_count > 1;
  });

  // Select All checked state - exact logic from GroupByProperties
  const allSelected = identifiers.length > 0 && 
    identifiers.every(id => localSelectedIdentifiers.includes(id));
  
  // Informative Columns checked state - exact logic from GroupByProperties
  const allInformativeSelected = informativeIds.length > 0 &&
    informativeIds.every(id => localSelectedIdentifiers.includes(id));

  return (
    <div className="space-y-4">
      <p className="text-gray-700">
        Choose the columns you want to group by. These will be your identifier columns.
      </p>

      {/* Select All and Informative Columns */}
      <div className="flex items-center justify-between pb-2 border-b">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="select-all-identifiers"
            checked={allSelected}
            onCheckedChange={handleSelectAll}
          />
          <Label
            htmlFor="select-all-identifiers"
            className="text-xs font-medium cursor-pointer"
          >
            Select All
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="select-informative-identifiers"
            checked={allInformativeSelected}
            onCheckedChange={handleSelectInformative}
          />
          <Label
            htmlFor="select-informative-identifiers"
            className="text-xs font-medium cursor-pointer"
          >
            Informative Columns
          </Label>
        </div>
      </div>

      {/* Identifiers Grid - 3 columns */}
      <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {identifiers.map((identifier) => {
          const isSelected = localSelectedIdentifiers.includes(identifier);
          return (
            <div
              key={identifier}
              className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded"
            >
              <Checkbox
                id={`identifier-${identifier}`}
                checked={isSelected}
                onCheckedChange={() => toggleIdentifier(identifier)}
              />
              <Label
                htmlFor={`identifier-${identifier}`}
                className="text-sm font-medium text-gray-700 cursor-pointer flex-1 truncate"
                title={identifier}
              >
                {identifier}
              </Label>
            </div>
          );
        })}
      </div>

      {localSelectedIdentifiers.length > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-gray-500">
            {localSelectedIdentifiers.length} identifier{localSelectedIdentifiers.length !== 1 ? 's' : ''} selected
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

export default G2Grouping;
