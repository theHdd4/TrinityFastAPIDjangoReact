import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { cancelPrefillController } from '@/components/AtomList/atoms/column-classifier/prefillManager';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';

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
      applyFrameChange(settings.dataSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

  // restore dropdown state when settings come from store
  useEffect(() => {
    if (Array.isArray(settings.allColumns) && settings.allColumns.length > 0) {
      setColumns(settings.allColumns.filter(Boolean));
    }
  }, [settings.allColumns]);

  const applyFrameChange = async (value: string) => {
    cancelPrefillController(atomId);
    const normalized = value.endsWith('.arrow') ? value : `${value}.arrow`;
    const frameList = Array.isArray(frames) ? frames : [];

    onSettingsChange({
      dataSource: normalized,
      csvDisplay:
        frameList.find(f => f.object_name === normalized)?.csv_name || '',
      selectedColumns: [],
      columnSummary: [],
      allColumns: [],
      numericColumns: [],
      yAxes: [],
      xAxis: '',
      skuTable: [],
      statDataMap: {},
      activeRow: null,
      activeMetric: '',
      dimensionMap: {},
      isLoading: true,
      loadingMessage: 'Loading',
      loadingStatus: 'Fetching flight table',
    });

    try {
      const ft = await fetch(
        `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(normalized)}`
      );
      if (ft.ok) {
        await ft.arrayBuffer();
      }
      onSettingsChange({ loadingStatus: 'Prefetching Dataframe' });
      const cache = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(normalized)}`
      );
      if (cache.ok) {
        await cache.text();
      }
      onSettingsChange({ loadingStatus: 'Fetching column summary' });
      
      // Use create column cardinality endpoint instead of column_summary
      const formData = new FormData();
      formData.append('validator_atom_id', atomId);
      formData.append('file_key', normalized);
      formData.append('bucket_name', 'trinity');
      formData.append('object_names', normalized);
      
      const res = await fetch(`${GROUPBY_API}/cardinality`, {
        method: 'POST',
        body: formData,
      });
      
      let numeric: string[] = [];
      let summary: ColumnInfo[] = [];
      let xField = settings.xAxis || '';
      if (res.ok) {
        const data = await res.json();
        summary = (data.cardinality || []).filter(Boolean);
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
      const filtered = summary.filter(c => c.unique_count > 1);
      const selected = filtered.map(c => c.column);
      const rawMap = await fetchDimensionMapping();
      const mapping = Object.fromEntries(
        Object.entries(rawMap).filter(([k]) => k.toLowerCase() !== 'unattributed')
      );
      const activeMetric = '';
      onSettingsChange({
        dataSource: normalized,
        csvDisplay:
          frameList.find(f => f.object_name === normalized)?.csv_name || normalized,
        selectedColumns: selected,
        columnSummary: filtered,
        allColumns: summary,
        numericColumns: numeric,
        xAxis: xField,
        dimensionMap: mapping,
        yAxes: [],
        skuTable: [],
        statDataMap: {},
        activeRow: null,
        activeMetric,
        isLoading: false,
        loadingStatus: '',
        loadingMessage: '',
      });
    } catch {
      setColumns([]);
      onSettingsChange({
        isLoading: false,
        loadingStatus: '',
        loadingMessage: '',
        skuTable: [],
        statDataMap: {},
        activeRow: null,
        activeMetric: '',
      });
    }
  };


  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        <Select value={settings.dataSource} onValueChange={applyFrameChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
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


    </div>
  );
};

export default FeatureOverviewSettings;