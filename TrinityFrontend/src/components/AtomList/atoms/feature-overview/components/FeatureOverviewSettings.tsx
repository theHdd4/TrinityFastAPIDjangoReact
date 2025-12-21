import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { cancelPrefillController } from '@/components/AtomList/atoms/column-classifier/prefillManager';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

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
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
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

    let activeSource = normalized;
    let displayName =
      frameList.find(f => f.object_name === normalized)?.csv_name ||
      frameList.find(f => f.arrow_name === normalized)?.csv_name ||
      '';

    const lookupKey = normalized.split('/').pop() || normalized;
    
    // Get current project context from env
    const envStr = localStorage.getItem('env');
    let currentProjectPrefix = '';
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        const client = env.CLIENT_NAME || '';
        const app = env.APP_NAME || '';
        const project = env.PROJECT_NAME || '';
        if (client && app && project) {
          currentProjectPrefix = `${client}/${app}/${project}/`;
        }
      } catch {
        /* ignore */
      }
    }
    
    try {
      const ticketRes = await fetch(
        `${VALIDATE_API}/latest_ticket/${encodeURIComponent(lookupKey)}`,
        {
          cache: 'no-store',
          credentials: 'include',
        }
      );
      if (ticketRes.ok) {
        const ticket = await ticketRes.json();
        if (ticket?.arrow_name) {
          // Extract just the filename and construct path with current project
          const fileName = ticket.arrow_name.split('/').pop() || ticket.arrow_name;
          activeSource = currentProjectPrefix ? `${currentProjectPrefix}${fileName}` : ticket.arrow_name;
        }
        if (ticket?.csv_name) {
          displayName = ticket.csv_name;
        }
        if (ticket?.arrow_name) {
          const fileName = ticket.arrow_name.split('/').pop() || ticket.arrow_name;
          const objectNameWithCurrentProject = currentProjectPrefix ? `${currentProjectPrefix}${fileName}` : ticket.arrow_name;
          setFrames(prev => {
            const existing = Array.isArray(prev) ? prev : [];
            if (existing.some(f => f.object_name === objectNameWithCurrentProject)) {
              return existing;
            }
            const baseName = fileName;
            return [
              ...existing,
              {
                object_name: objectNameWithCurrentProject,
                arrow_name: baseName,
                csv_name: ticket.csv_name || baseName,
              },
            ];
          });
        }
      }
    } catch {
      /* ignore ticket errors so we can fall back to the selected object */
    }

    const csvDisplay =
      displayName ||
      frameList.find(f => f.object_name === activeSource)?.csv_name ||
      frameList.find(f => f.object_name === normalized)?.csv_name ||
      activeSource;

    onSettingsChange({
      dataSource: activeSource,
      csvDisplay,
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
        `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(activeSource)}`,
        {
          cache: 'no-store',
          credentials: 'include',
        }
      );
      if (ft.ok) {
        await ft.arrayBuffer();
      }
      onSettingsChange({ loadingStatus: 'Prefetching Dataframe' });
      const cache = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(activeSource)}`,
        {
          cache: 'no-store',
          credentials: 'include',
        }
      );
      if (cache.ok) {
        await cache.text();
      }
      onSettingsChange({ loadingStatus: 'Fetching column summary' });
      
      // Use create column cardinality endpoint instead of column_summary
      const url = `${GROUPBY_API}/cardinality?object_name=${encodeURIComponent(activeSource)}`;
      const res = await fetch(url);
      
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
      const { mapping: rawMapping } = await fetchDimensionMapping({ objectName: activeSource });
      const mapping = Object.fromEntries(
        Object.entries(rawMapping || {}).filter(([k]) => {
          const key = k.toLowerCase();
          return key !== 'unattributed' && key !== 'unattributed_dimensions';
        })
      );
      const activeMetric = '';
      onSettingsChange({
        dataSource: activeSource,
        csvDisplay,
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
        
        {/* Data Summary Toggle - Only when data source is selected (chartmaker pattern) */}
        {settings.dataSource && (
        <div className="flex items-center justify-between pt-4 border-t mt-4">
          <Label className="text-xs">Show Data Summary</Label>
          <Switch
            checked={settings.showDataSummary || false}
            onCheckedChange={(checked) => {
              updateSettings(atomId, { showDataSummary: !!checked });
            }}
          />
        </div>
        )}
      </Card>


    </div>
  );
};

export default FeatureOverviewSettings;