import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

interface Frame { object_name: string; csv_name: string }
interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

const GroupByInputFiles: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const [frames, setFrames] = useState<Frame[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>(Array.isArray(settings.allColumns) ? settings.allColumns.filter(Boolean) : []);
  const [identifiers, setIdentifiers] = useState<string[]>(settings.identifiers || []);
  const [identifiersLoaded, setIdentifiersLoaded] = useState(false);
  const [mappingResolved, setMappingResolved] = useState(false);
  const [catColumns, setCatColumns] = useState<string[]>([]);
  const [showCatSelector, setShowCatSelector] = useState(false);
  const [measures, setMeasures] = useState<string[]>(settings.measures || []);

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files, exclude CSV and XLSX files
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch(() => setFrames([]));
  }, []);

  useEffect(() => {
    if (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) {
      setColumns(settings.allColumns.filter(Boolean));
    }
  }, [settings.allColumns]);

  // --- Auto-fetch identifiers/measures when a file is already selected (e.g. after reload) ---
  const initFetchedRef = React.useRef<string>('');
  
  // Initialize ref if data already exists (prevents re-fetch on properties panel open)
  React.useEffect(() => {
    if (settings.dataSource && settings.allColumns && settings.allColumns.length > 0 && !initFetchedRef.current) {
      initFetchedRef.current = settings.dataSource;
    }
  }, []);
  
  React.useEffect(() => {
    if (settings.dataSource && settings.dataSource !== initFetchedRef.current && (!settings.allColumns || settings.allColumns.length === 0)) {
      console.log('[GroupBy] calling /groupby/init for', settings.dataSource);
      initFetchedRef.current = settings.dataSource;
      handleFrameChange(settings.dataSource);
    }
  }, [settings.dataSource]);

  const handleFrameChange = async (val: string) => {
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    const res = await fetch(
      `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(val)}`
    );
    let summary: ColumnInfo[] = [];
    if (res.ok) {
      const raw = await res.json();
      const data = await resolveTaskResponse<{ summary?: ColumnInfo[] }>(raw);
      summary = (data.summary || []).filter(Boolean);
      setColumns(summary);
    }
    // Fetch identifiers/measures from backend
    let fetchedIdentifiers: string[] = [];
    let fetchedMeasures: string[] = [];
    try {
      const atom = useLaboratoryStore.getState().getAtom(atomId);
      const file_key = val;

      // Extract client/app/project from file path like scope_selector does
      const pathParts = val.split('/')
      const clientName = pathParts[0] ?? ''
      const appName = pathParts[1] ?? ''
      const projectName = pathParts[2] ?? ''

      // Always request identifiers/measures using client/app/project context
      const formData = new FormData();
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', file_key);
      formData.append('client_name', clientName);
      formData.append('app_name', appName);
      formData.append('project_name', projectName);
      formData.append('file_key', file_key);
      try {
        const resp = await fetch(`${GROUPBY_API}/init`, { method: 'POST', body: formData });
        console.log('[GroupBy] /init status', resp.status);
        let payload: any = {};
        try {
          payload = await resp.json();
        } catch {}
        console.log('[GroupBy] /init payload', payload);
        if (resp.ok) {
          const result = await resolveTaskResponse(payload);
          const resolved = result || {};
          fetchedIdentifiers = Array.isArray(resolved.identifiers) ? resolved.identifiers.filter(Boolean) : [];
          fetchedMeasures = Array.isArray(resolved.measures) ? resolved.measures.filter(Boolean) : [];
          setIdentifiers(fetchedIdentifiers);
          setMeasures(fetchedMeasures);
        }
      } catch (err) {
        // Ignore network or backend errors; fallback logic will kick in
      }
    } catch (err) {
      // ignore, fallback later
    }

    // If backend provided nothing, keep previous state (empty arrays allowed)
    const finalIdentifiers = fetchedIdentifiers.length ? fetchedIdentifiers : identifiers;
    const finalMeasures = fetchedMeasures.length ? fetchedMeasures : measures;

    // Add exactly one measure configuration by default
    let defaultSelectedMeasures = [];
    const allMeasures = finalMeasures.length > 0 ? finalMeasures : summary.filter(c => c.data_type && (c.data_type.toLowerCase().includes('int') || c.data_type.toLowerCase().includes('float') || c.data_type.toLowerCase().includes('number'))).map(c => c.column);

    if (allMeasures.length > 0) {
      // Use the first available measure and default aggregator
      defaultSelectedMeasures = [{ field: allMeasures[0], aggregator: 'Sum', weight_by: '', rename_to: '' }];
    }

    updateSettings(atomId, {
      dataSource: val,
      allColumns: summary,
      identifiers: finalIdentifiers,
      measures: finalMeasures,
      selectedMeasures: defaultSelectedMeasures,
    });
  };

  return (
    <div className="space-y-4 p-2">
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
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
      {false && identifiers.length > 0 && (
        <Card className="p-4 space-y-3 bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="font-medium text-blue-700 mb-2">Identifiers (from classification)</div>
          <div className="flex flex-wrap gap-2">
            {identifiers.map(id => (
              <span key={id} className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded font-semibold text-xs">{id}</span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default GroupByInputFiles; 