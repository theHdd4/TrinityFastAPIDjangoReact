import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import type { FileClassification, ColumnData } from '../ColumnClassifierAtom';
import {
  useLaboratoryStore,
  ColumnClassifierSettings as SettingsType,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS
} from '@/components/LaboratoryMode/store/laboratoryStore';

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
  const settings: SettingsType = (atom?.settings as SettingsType) || {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS
  };

  const [frames, setFrames] = useState<Frame[]>([]);
  const [savedId, setSavedId] = useState(settings.validatorId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [enableColumnView, setEnableColumnView] = useState<boolean>(
    settings.enableColumnView ?? true
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

  useEffect(() => {
    setEnableColumnView(settings.enableColumnView ?? true);
  }, [settings.enableColumnView]);

  const classify = async () => {
    if (!savedId) return;
    setLoading(true);
    setError('');
    try {
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
      updateSettings(atomId, { validatorId: savedId, assignments: {} });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-2">
      <Card className="p-4 space-y-4">
        <div>
          <Label className="text-sm mb-2 block">Saved Dataframe</Label>
          <Select value={savedId} onValueChange={setSavedId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select dataframe" />
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

      <Card className="p-4 flex items-center justify-between">
        <Label htmlFor={`${atomId}-enable-cardview`} className="text-sm">
          Enable Cardinality View
        </Label>
        <Switch
          id={`${atomId}-enable-cardview`}
          checked={enableColumnView}
          onCheckedChange={val => {
            setEnableColumnView(val);
            updateSettings(atomId, { enableColumnView: val });
          }}
        />
      </Card>
    </div>
  );
};

export default ColumnClassifierSettings;
