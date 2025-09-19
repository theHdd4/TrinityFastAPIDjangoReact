import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';
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

  const handleFrameChange = async (val: string) => {
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    
    try {
      // Fetch column summary
      const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(val)}`);
      if (res.ok) {
        const data = await res.json();
        const allColumns = Array.isArray(data.summary) ? data.summary.filter(Boolean) : [];

        // Determine all categorical identifiers
        const allCats = allColumns
          .filter(col => {
            const dataType = col.data_type?.toLowerCase() || '';
            return (dataType === 'object' || dataType === 'category') && col.column;
          })
          .map(col => col.column);

        // Preserve previously selected identifiers that still exist in this dataset
        const selectedCats = Array.isArray(settings.selectedIdentifiers)
          ? settings.selectedIdentifiers.filter((id: string) => allCats.includes(id))
          : [];

        // Update settings with all identifiers while keeping selected ones
        updateSettings(atomId, {
          dataSource: val,
          allColumns,
          availableIdentifiers: allCats,
          selectedIdentifiers: [...selectedCats],
          measures: settings.measures || [],
        });
      }
    } catch (error) {
      console.error('Error fetching column summary:', error);
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
    if (settings.dataSource && (!settings.allColumns || settings.allColumns.length === 0)) {
      handleFrameChange(settings.dataSource);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

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

    </div>
  );
};

export default ScopeSelectorInputFiles;
