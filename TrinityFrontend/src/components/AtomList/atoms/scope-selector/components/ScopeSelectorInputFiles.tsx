import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API, SCOPE_SELECTOR_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

interface Frame { object_name: string; csv_name: string }

const ScopeSelectorInputFiles: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const [frames, setFrames] = useState<Frame[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [lastDataSource, setLastDataSource] = useState<string>('');

  useEffect(() => {
    let query = '';
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        query =
          '?' +
          new URLSearchParams({
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || ''
          }).toString();
      } catch {
        /* ignore */
      }
    }
    fetch(`${VALIDATE_API}/list_saved_dataframes${query}`)
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files, exclude CSV and XLSX files
        let files = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = files.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        if (settings.dataSource && !arrowFiles.some(f => f.object_name === settings.dataSource)) {
          arrowFiles.push({ object_name: settings.dataSource, csv_name: settings.dataSource });
        }
        setFrames(arrowFiles);
      })
      .catch(() => {
        if (settings.dataSource) {
          setFrames([{ object_name: settings.dataSource, csv_name: settings.dataSource }]);
        } else {
          setFrames([]);
        }
      });
  }, [settings.dataSource]);

  // Auto-select identifiers based on unique values
  const runAutoSelection = async (dataSource: string, availableIdentifiers: string[]) => {
    const results: string[] = [];
    
    // Process each identifier sequentially to avoid race conditions
    for (const identifier of availableIdentifiers) {
      try {
        const res = await fetch(
          `${SCOPE_SELECTOR_API}/unique_values?object_name=${encodeURIComponent(
            dataSource
          )}&column_name=${encodeURIComponent(identifier)}`
        );
        if (res.ok) {
          const raw = await res.json();
          const json = await resolveTaskResponse<{ unique_values?: string[] }>(raw);
          if (Array.isArray(json.unique_values) && json.unique_values.length > 1) {
            results.push(identifier);
          }
        }
      } catch (err) {
        // Silent error handling
      }
    }
    
    // Update only the selectedIdentifiers
    updateSettings(atomId, {
      selectedIdentifiers: results,
    });
  };

  const handleFrameChange = async (val: string) => {
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    
    try {
      // Fetch column summary
      const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(val)}`);
      if (res.ok) {
        const raw = await res.json();
        const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
        const allColumns = Array.isArray(data.summary) ? data.summary.filter(Boolean) : [];

        // Determine all categorical identifiers
        const allCats = allColumns
          .filter(col => {
            const dataType = col.data_type?.toLowerCase() || '';
            return (dataType === 'object' || dataType === 'category') && col.column;
          })
          .map(col => col.column);

        // Fetch identifiers from column classifier configuration (file-specific)
        let classifierIdentifiers: string[] = [];
        try {
          const envStr = localStorage.getItem('env');
          if (envStr) {
            const env = JSON.parse(envStr);
            const url = `${SCOPE_SELECTOR_API}/identifier_options?` +
              new URLSearchParams({
                client_name: env.CLIENT_NAME || '',
                app_name: env.APP_NAME || '',
                project_name: env.PROJECT_NAME || '',
                file_name: val // Pass the selected file name for file-specific lookup
              }).toString();
            
            const identifierRes = await fetch(url);
            
            if (identifierRes.ok) {
              const identifierData = await identifierRes.json();
              classifierIdentifiers = Array.isArray(identifierData.identifiers) ? identifierData.identifiers : [];
            }
          }
        } catch (err) {
          // Silent error handling
        }

        // Use classifier identifiers if available, otherwise use all categorical columns
        const availableIdentifiers = classifierIdentifiers.length > 0 ? classifierIdentifiers : allCats;
        
        
        // Reset everything when file changes and update settings with available identifiers
        updateSettings(atomId, {
          dataSource: val,
          allColumns,
          availableIdentifiers,
          selectedIdentifiers: [], // Reset selected identifiers
          scopes: [], // Reset scopes
          measures: settings.measures || [],
        });

        // Only run auto-selection if no classifier identifiers were found (fallback case)
        if (classifierIdentifiers.length === 0) {
          await runAutoSelection(val, availableIdentifiers);
        } else {
          // If classifier identifiers exist, use them as selected (no auto-selection needed)
          updateSettings(atomId, {
            selectedIdentifiers: classifierIdentifiers,
          });
        }
      }
    } catch (error) {
      // Still update dataSource even if column fetch fails
      updateSettings(atomId, {
        dataSource: val,
        allColumns: [],
        availableIdentifiers: [],
        selectedIdentifiers: [],
        measures: settings.measures || [],
      });
    }
  };

  useEffect(() => {
    // Reset initialization flag when dataSource changes
    if (settings.dataSource !== lastDataSource) {
      setLastDataSource(settings.dataSource || '');
      setIsInitialized(false);
      return; // Let the next render handle initialization
    }
    
    // Trigger handleFrameChange if dataSource exists but required data is missing
    // This handles cases where a file is pre-selected (e.g., through Flight) but not initialized
    const hasAllColumns = settings.allColumns && settings.allColumns.length > 0;
    const hasSelectedIdentifiers = settings.selectedIdentifiers && settings.selectedIdentifiers.length > 0;
    const hasAvailableIdentifiers = settings.availableIdentifiers && settings.availableIdentifiers.length > 0;
    
    const needsInitialization = settings.dataSource && (!hasAllColumns || !hasSelectedIdentifiers || !hasAvailableIdentifiers);
    
    if (needsInitialization && !isInitialized) {
      // Set initialized flag immediately to prevent duplicate calls
      setIsInitialized(true);
      // Then trigger the initialization
      handleFrameChange(settings.dataSource).catch((err) => {
        // Silent error handling
      });
    } else if (settings.dataSource && hasAllColumns && hasSelectedIdentifiers && hasAvailableIdentifiers) {
      // Data is complete, mark as initialized
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource, isInitialized, lastDataSource]);

  // Auto-select identifiers based on unique values when component loads with existing data
  // COMMENTED OUT - Auto-selection in useEffect disabled to prevent overriding canvas identifiers
  /*
  useEffect(() => {
    if (settings.dataSource && settings.availableIdentifiers && settings.availableIdentifiers.length > 0) {
      // Check if we have classifier identifiers by comparing with all categorical columns
      const allCategoricalColumns = settings.allColumns?.filter(col => {
        const dataType = col.data_type?.toLowerCase() || '';
        return (dataType === 'object' || dataType === 'category') && col.column;
      }).length || 0;
      
      // If availableIdentifiers length equals all categorical columns, it means we're in fallback mode
      const isFallbackMode = settings.availableIdentifiers.length === allCategoricalColumns;
      
      // Only run auto-selection if we're in fallback mode (no classifier data)
      if (isFallbackMode) {
        runAutoSelection(settings.dataSource, settings.availableIdentifiers);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource, settings.availableIdentifiers]);
  */

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        <Select value={settings.dataSource} onValueChange={handleFrameChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
          </SelectTrigger>
          <SelectContent>
            {(Array.isArray(frames) ? frames : []).map(f => (
              <SelectItem key={f.object_name} value={f.object_name}>
                {f.csv_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

    </div>
  );
};

export default ScopeSelectorInputFiles;
