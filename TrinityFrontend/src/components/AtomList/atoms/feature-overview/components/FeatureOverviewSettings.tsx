import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import { Eye, EyeOff } from 'lucide-react';
import { cancelPrefillController } from '@/components/AtomList/atoms/column-classifier/prefillManager';
import { fetchDimensionMapping } from '@/lib/dimensions';

interface FeatureOverviewSettingsProps {
  atomId: string;
  settings: any;
  onSettingsChange: (s: any) => void;
}

interface ColumnInfo {
  column: string;
  data_type: string;
  unique_count: number;
  unique_values: string[];
}

const FeatureOverviewSettings: React.FC<FeatureOverviewSettingsProps> = ({ atomId, settings, onSettingsChange }) => {
  interface Frame { object_name: string; csv_name: string; arrow_name?: string }
  const [frames, setFrames] = useState<Frame[]>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>(
    Array.isArray(settings.allColumns) ? settings.allColumns.filter(Boolean) : []
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(
    Array.isArray(settings.selectedColumns) ? settings.selectedColumns : []
  );
  const [filterUnique, setFilterUnique] = useState<boolean>(
    settings.filterUnique ?? true
  );

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
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  // fetch columns if not already available when reopening properties
  useEffect(() => {
    if (
      settings.dataSource &&
      (!settings.allColumns || settings.allColumns.length === 0)
    ) {
      handleFrameChange(settings.dataSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

  useEffect(() => {
    setFilterUnique(settings.filterUnique ?? true);
  }, [settings.filterUnique]);

  // restore dropdown state when settings come from store
  useEffect(() => {
    if (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) {
      setColumns(settings.allColumns.filter(Boolean));
    }
    setSelectedIds(Array.isArray(settings.selectedColumns) ? settings.selectedColumns : []);
  }, [settings.allColumns, settings.selectedColumns]);

  const handleFrameChange = async (val: string) => {
    cancelPrefillController(atomId);
    onSettingsChange({ isLoading: true });
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    try {
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(val)}`
      );
      let numeric: string[] = [];
      let summary: ColumnInfo[] = [];
      let xField = settings.xAxis || '';
      if (res.ok) {
        const data = await res.json();
        summary = (data.summary || []).filter(Boolean);
        setColumns(summary);
        numeric = summary
          .filter((c: ColumnInfo) => !['object', 'string'].includes(c.data_type.toLowerCase()))
          .map(c => c.column);
        const dateLike = summary.find(c => c.column.toLowerCase().includes('date'));
        if (dateLike) {
          xField = dateLike.column;
        } else if (summary.length > 0) {
          xField = summary[0].column;
        }
      }
      const filtered = filterUnique ? summary.filter(c => c.unique_count > 1) : summary;
      const selected = filtered.map(c => c.column);
      setSelectedIds(selected);
      const rawMap = await fetchDimensionMapping();
      const mapping = Object.fromEntries(
        Object.entries(rawMap).filter(([k]) => k.toLowerCase() !== 'unattributed')
      );
      onSettingsChange({
        dataSource: val,
        csvDisplay:
          (Array.isArray(frames) ? frames : [])
            .find(f => f.object_name === val)?.csv_name || val,
        selectedColumns: selected,
        columnSummary: filtered,
        allColumns: summary,
        numericColumns: numeric,
        xAxis: xField,
        filterUnique,
        dimensionMap: mapping,
        isLoading: false,
      });
    } catch {
      onSettingsChange({ isLoading: false });
    }
  };

  const handleReview = () => {
    if (!Array.isArray(columns)) return;
    const summary = columns
      .filter(c => c && selectedIds.includes(c.column))
      .map(c => c);
    onSettingsChange({ selectedColumns: selectedIds, columnSummary: summary });
  };

  const displayedColumns = React.useMemo(
    () => (filterUnique ? columns.filter(c => c.unique_count > 1) : columns),
    [columns, filterUnique]
  );

  useEffect(() => {
    if (filterUnique) {
      const allowed = displayedColumns.map(c => c.column);
      setSelectedIds(ids => ids.filter(id => allowed.includes(id)));
    }
  }, [filterUnique, displayedColumns]);

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
                {f.arrow_name ? f.arrow_name.split('/').pop() : f.csv_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {columns.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Select Columns</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Fetch columns with more than one unique value</span>
            <Switch
              checked={filterUnique}
              onCheckedChange={val => {
                setFilterUnique(val);
                onSettingsChange({ filterUnique: val });
              }}
              className="data-[state=checked]:bg-[#458EE2]"
            />
          </div>
          <select
            multiple
            value={selectedIds}
            onChange={e =>
              setSelectedIds(Array.from(e.target.selectedOptions).map(o => o.value))
            }
            className="w-full border rounded p-1 text-sm h-32"
          >
            {Array.isArray(displayedColumns) &&
              displayedColumns.filter(Boolean).map(c => (
                <option key={c.column} value={c.column}>
                  {c.column}
                </option>
              ))}
          </select>
          <Button onClick={handleReview} className="mt-3 w-full">Review Data</Button>
        </Card>
      )}

      <Card className="p-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Open Hierarchical View</span>
        <Checkbox checked={settings.hierarchicalView} onCheckedChange={val => onSettingsChange({ hierarchicalView: val })}>
        </Checkbox>
        {settings.hierarchicalView ? <Eye className="w-4 h-4 text-blue-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
      </Card>
    </div>
  );
};

export default FeatureOverviewSettings;
