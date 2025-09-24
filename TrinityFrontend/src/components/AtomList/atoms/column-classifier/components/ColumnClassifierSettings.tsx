import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, CLASSIFIER_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import { cancelPrefillController } from '../prefillManager';
import type { FileClassification, ColumnData } from '../ColumnClassifierAtom';
import {
  useLaboratoryStore,
  ColumnClassifierSettings as SettingsType,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';

interface Frame { object_name: string; csv_name: string; arrow_name?: string }

interface ClassificationResponse {
  final_classification: {
    identifiers: string[];
    measures: string[];
    unclassified: string[];
  };
}

interface ColumnClassifierSettingsProps {
  atomId: string;
  onClassification: (file: FileClassification) => void;
}

const ColumnClassifierSettings: React.FC<ColumnClassifierSettingsProps> = ({ atomId, onClassification }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
    ...(atom?.settings as SettingsType)
  };

  const [frames, setFrames] = useState<Frame[]>([]);
  const [savedId, setSavedId] = useState(settings.validatorId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasExistingUpdates = Boolean(
    (settings.assignments && Object.keys(settings.assignments).length > 0) ||
    (settings.validatorId && settings.validatorId.length > 0)
  );

  const applySavedIdChange = (value: string) => {
    setSavedId(value);
  };

  const { requestChange: confirmSavedIdChange, dialog } = useDataSourceChangeWarning(async value => {
    applySavedIdChange(value);
  });

  const handleSavedIdChange = (value: string) => {
    const isDifferentSource = value !== savedId;
    confirmSavedIdChange(value, hasExistingUpdates && isDifferentSource);
  };

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


  const classify = async () => {
    if (!savedId) return;
    cancelPrefillController(atomId);
    setLoading(true);
    setError('');
    updateSettings(atomId, {
      isLoading: true,
      loadingMessage: 'Loading',
      loadingStatus: 'Fetching flight table',
    });
    try {
      const flightRes = await fetch(
        `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(savedId)}`
      );
      if (flightRes.ok) {
        await flightRes.arrayBuffer();
      }
      updateSettings(atomId, { loadingStatus: 'Prefetching Dataframe' });
      const cacheRes = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(savedId)}`
      );
      if (cacheRes.ok) {
        await cacheRes.text();
      }
      updateSettings(atomId, { loadingStatus: 'Classifying Dataframe' });
      const form = new FormData();
      form.append('dataframe', savedId);
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      const data: ClassificationResponse = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.detail || 'Failed to classify');
      }
      const cols: ColumnData[] = [
        ...data.final_classification.identifiers.map(name => ({ name, category: 'identifiers' })),
        ...data.final_classification.measures.map(name => ({ name, category: 'measures' })),
        ...data.final_classification.unclassified.map(name => ({ name, category: 'unclassified' }))
      ];
      const custom = Object.fromEntries((settings.dimensions || []).map(d => [d, []]));
      onClassification({ fileName: savedId, columns: cols, customDimensions: custom });
      updateSettings(atomId, {
        validatorId: savedId,
        assignments: {},
        isLoading: false,
        loadingStatus: '',
        loadingMessage: '',
      });
    } catch (e: any) {
      setError(e.message);
      updateSettings(atomId, { isLoading: false, loadingStatus: '', loadingMessage: '' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700 block">Data Source</label>
          <Select value={savedId} onValueChange={handleSavedIdChange}>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Choose a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {frames.map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
                  {f.arrow_name ? f.arrow_name.split('/').pop() : f.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <Button
          onClick={classify}
          disabled={loading || !savedId}
          className="w-full"
        >
          Classify Columns
        </Button>
      </Card>

      {dialog}

    </div>
  );
};

export default ColumnClassifierSettings;
