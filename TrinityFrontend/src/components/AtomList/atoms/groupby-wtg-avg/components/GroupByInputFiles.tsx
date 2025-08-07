import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { fetchDimensionMapping } from '@/lib/dimensions';
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
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  useEffect(() => {
    if (settings.dataSource && (!settings.allColumns || settings.allColumns.length === 0)) {
      handleFrameChange(settings.dataSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

  useEffect(() => {
    if (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) {
      setColumns(settings.allColumns.filter(Boolean));
    }
  }, [settings.allColumns]);

  // --- Auto-fetch identifiers/measures when a file is already selected (e.g. after reload) ---
  const initFetchedRef = React.useRef<string>('');
  React.useEffect(() => {
    if (settings.dataSource && settings.dataSource !== initFetchedRef.current) {
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
      const data = await res.json();
      summary = (data.summary || []).filter(Boolean);
      setColumns(summary);
    }
    // Fetch identifiers/measures from backend
    let fetchedIdentifiers: string[] = [];
    let fetchedMeasures: string[] = [];
    try {
      const atom = useLaboratoryStore.getState().getAtom(atomId);
      const validator_atom_id = atom?.settings?.validator_atom_id || '';
      const file_key = val;

      // Always request identifiers/measures so Redis / Mongo logic can populate them even
      // if validator_atom_id is not yet known. Legacy fallback will use validator_atom_id
      // but the new Redis-first branch does not depend on it.
      const formData = new FormData();
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', file_key);
      formData.append('validator_atom_id', validator_atom_id);
      formData.append('file_key', file_key);
      try {
        const resp = await fetch(`${GROUPBY_API}/init`, { method: 'POST', body: formData });
        console.log('[GroupBy] /init status', resp.status);
        let data: any = {};
        try { data = await resp.clone().json(); } catch {}
        console.log('[GroupBy] /init payload', data);
        if (resp.ok) {
          // if json already parsed above use that
          if (!data || Object.keys(data).length === 0) data = await resp.json();
          fetchedIdentifiers = Array.isArray(data.identifiers) ? data.identifiers.filter(Boolean) : [];
          fetchedMeasures = Array.isArray(data.measures) ? data.measures.filter(Boolean) : [];
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

    // Set selectedMeasures to a single measure config object by default
    let defaultSelectedMeasures = [];
    const allMeasures = finalMeasures.length > 0 ? finalMeasures : summary.filter(c => c.data_type && (c.data_type.toLowerCase().includes('int') || c.data_type.toLowerCase().includes('float') || c.data_type.toLowerCase().includes('number'))).map(c => c.column);

    if (allMeasures.length > 0) {
      // Use the first available measure and default aggregator
      defaultSelectedMeasures = [{ field: allMeasures[0], aggregator: 'Sum' }];
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
            <SelectValue placeholder="Select saved dataframe" />
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
      {columns.length > 0 && (
        <Card className="p-4 space-y-3 bg-gradient-to-br from-yellow-50 to-yellow-100">
          <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <div className="overflow-auto max-h-96">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Column Name</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Unique Values</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Unique Count</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {columns.map(c => (
                    <tr key={c.column} className="hover:bg-yellow-50 transition-colors">
                      <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{c.column}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-xs">
                        <div className="max-h-20 overflow-y-auto pr-2 custom-scrollbar">
                          <div className="text-sm text-gray-600">
                            {c.unique_values?.join(', ') || 'N/A'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-gray-600">{c.unique_count}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold 
                          ${c.data_type.toLowerCase().includes('int') || c.data_type.toLowerCase().includes('float') || c.data_type.toLowerCase().includes('number') ? 'bg-blue-100 text-blue-700' :
                            c.data_type.toLowerCase().includes('object') || c.data_type.toLowerCase().includes('string') || c.data_type.toLowerCase().includes('category') ? 'bg-yellow-100 text-yellow-700' :
                            c.data_type.toLowerCase().includes('bool') ? 'bg-purple-100 text-purple-700' :
                            'bg-gray-100 text-gray-700'}
                        `}>
                          {c.data_type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default GroupByInputFiles; 