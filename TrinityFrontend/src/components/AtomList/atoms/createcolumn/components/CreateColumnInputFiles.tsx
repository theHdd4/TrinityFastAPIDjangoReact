import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API, CREATECOLUMN_API } from '@/lib/api';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
  selectedIdentifiers: string[];
  setSelectedIdentifiers: (ids: string[]) => void;
}

interface Frame { object_name: string; csv_name: string }
interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

const CreateColumnInputFiles: React.FC<Props> = ({ atomId, selectedIdentifiers, setSelectedIdentifiers }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  const [frames, setFrames] = useState<Frame[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>(Array.isArray(settings.allColumns) ? settings.allColumns.filter(Boolean) : []);
  const [identifiers, setIdentifiers] = useState<string[] | null>(null);
  const [identifiersLoaded, setIdentifiersLoaded] = useState(false);
  const [mappingResolved, setMappingResolved] = useState(false);
  // Load identifiers from redis/dimension mapping first
  useEffect(() => {
    const loadMapping = async () => {
      try {
        const { mapping } = await fetchDimensionMapping();
        let ids: string[] = [];
        // Prefer explicit identifiers list saved by classifier
        try {
          const cfgStr = localStorage.getItem('column-classifier-config');
          if (cfgStr) {
            const cfg = JSON.parse(cfgStr);
            if (Array.isArray(cfg.identifiers)) {
              ids = cfg.identifiers.filter(Boolean);
              // Remove common time-related columns
              ids = ids.filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
            }
          }
        } catch {/* ignore parse errors */}
        // Fallback to mapping values (dimensions) if identifiers absent
        if (ids.length === 0) {
          ids = Object.values(mapping || {}).flat().filter(Boolean);
          ids = ids.filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
        }
        if (ids.length > 0) {
          console.log('DEBUG: identifiers from dimension mapping', ids);
          setIdentifiers(ids);
          setCatColumns(ids);
          setShowCatSelector(true);
          setSelectedIdentifiers(ids);
          setIdentifiersLoaded(true);
          setMappingResolved(true);
        }
      } catch (err) {
        console.warn('identifier mapping fetch failed', err);
        setMappingResolved(true);
      }
    };
    loadMapping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [catColumns, setCatColumns] = useState<string[]>([]);
  const [showCatSelector, setShowCatSelector] = useState(false);

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

  useEffect(() => {
    if (
      mappingResolved &&
      Array.isArray(columns) &&
      columns.length > 0 &&
      (identifiers === null || identifiers.length === 0) &&
      !showCatSelector
    ) {
      const cats = columns.filter(c =>
        c.data_type &&
        (
          c.data_type.toLowerCase().includes('object') ||
          c.data_type.toLowerCase().includes('string') ||
          c.data_type.toLowerCase().includes('category')
        )
      ).map(c => c.column)
      .filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
      setCatColumns(cats);
      setShowCatSelector(true);
      setSelectedIdentifiers(cats);
      console.log('DEBUG: fallback categorical columns (useEffect)', cats);
    }
  }, [columns, identifiers, showCatSelector, mappingResolved]);

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
    // Try to fetch identifiers from backend
    if (!identifiersLoaded) {
      setIdentifiers(null);
      setShowCatSelector(false);
      setCatColumns([]);
      setSelectedIdentifiers([]);
    }
    try {
      // Extract client/app/project from file path like scope_selector does
      const pathParts = val.split('/')
      const clientName = pathParts[0] ?? ''
      const appName = pathParts[1] ?? ''
      const projectName = pathParts[2] ?? ''
      
      console.log('DEBUG: clientName', clientName, 'appName', appName, 'projectName', projectName);
      
      let identifiersFromRedis = false;
      if (clientName && appName && projectName) {
        const resp = await fetch(`${CREATECOLUMN_API}/identifier_options?client_name=${encodeURIComponent(clientName)}&app_name=${encodeURIComponent(appName)}&project_name=${encodeURIComponent(projectName)}`);
        console.log('DEBUG: /identifier_options response status', resp.status);
        if (resp.ok) {
          const data = await resp.json();
          console.log('DEBUG: /identifier_options identifiers from Redis', data.identifiers);
          if (Array.isArray(data.identifiers) && data.identifiers.length > 0) {
            console.log('DEBUG: ✅ Using identifiers from Redis/MongoDB');
            setIdentifiers(data.identifiers);
            setSelectedIdentifiers(data.identifiers);
            setIdentifiersLoaded(true);
            identifiersFromRedis = true;
          }
        }
      }
      
      // fallback to categorical columns ONLY if Redis fetch failed
      if (!identifiersFromRedis) {
        console.log('DEBUG: ❌ Redis fetch failed - using fallback categorical columns from feature overview');
        const cats = summary.filter(c =>
          c.data_type && (
            c.data_type.toLowerCase().includes('object') ||
            c.data_type.toLowerCase().includes('string') ||
            c.data_type.toLowerCase().includes('category')
          )
        ).map(c => c.column)
        .filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
        console.log('DEBUG: fallback categorical columns', cats);
        setCatColumns(cats);
        setShowCatSelector(true);
        setSelectedIdentifiers(cats);
      }
    } catch (err) {
      console.log('DEBUG: ❌ Error occurred - using fallback categorical columns from feature overview');
      // fallback to categorical columns
      const cats = summary.filter(c =>
        c.data_type && (
          c.data_type.toLowerCase().includes('object') ||
          c.data_type.toLowerCase().includes('string') ||
          c.data_type.toLowerCase().includes('category')
        )
      ).map(c => c.column)
      .filter(id => !['date','time','month','months','week','weeks','year'].includes(id.toLowerCase()));
      console.log('DEBUG: fallback categorical columns (catch)', cats);
      setCatColumns(cats);
      setShowCatSelector(true);
      setSelectedIdentifiers(cats);
    }
    updateSettings(atomId, {
      dataSource: val,
      csvDisplay:
        (Array.isArray(frames) ? frames : [])
          .find(f => f.object_name === val)?.csv_name || val,
      allColumns: summary,
    });
  };

  // Debug output in render
  console.log('RENDER DEBUG:', {
    catColumns,
    showCatSelector,
    columns,
    identifiers,
    selectedIdentifiers
  });

  return (
    <div className="space-y-4 p-2">
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
      {columns.length > 0 && (
        <Card className="p-4 space-y-3 bg-gradient-to-br from-green-50 to-green-100">
          {/* <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Columns in Data Source</span>
          </div> */}
          <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Column Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {columns.map(c => (
                  <tr key={c.column} className="hover:bg-green-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-gray-900">{c.column}{selectedIdentifiers.includes(c.column) ? ' (identifier)' : ''}</td>
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
        </Card>
      )}
    </div>
  );
};

export default CreateColumnInputFiles; 