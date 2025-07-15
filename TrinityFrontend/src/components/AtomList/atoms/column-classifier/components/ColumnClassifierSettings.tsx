import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import type { FileClassification, ColumnData } from '../ColumnClassifierAtom';
import {
  useLaboratoryStore,
  ColumnClassifierSettings as SettingsType,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS
} from '@/components/LaboratoryMode/store/laboratoryStore';

interface Frame { object_name: string; csv_name: string; }

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
  const [fileKey, setFileKey] = useState(settings.fileKey || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  const classify = async () => {
    if (!savedId) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('validator_atom_id', savedId);
      form.append('file_key', fileKey);
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to classify');
      const data: ClassificationResponse = await res.json();
      const cols: ColumnData[] = [
        ...data.final_classification.identifiers.map(name => ({ name, category: 'identifiers' })),
        ...data.final_classification.measures.map(name => ({ name, category: 'measures' })),
        ...data.final_classification.unclassified.map(name => ({ name, category: 'unclassified' }))
      ];
      const custom = Object.fromEntries((settings.dimensions || []).map(d => [d, []]));
      onClassification({ fileName: savedId, columns: cols, customDimensions: custom });
      updateSettings(atomId, { validatorId: savedId, fileKey, assignments: {} });
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
                  {f.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-sm mb-2 block">File Key</Label>
          <Input
            value={fileKey}
            onChange={e => setFileKey(e.target.value)}
            placeholder="Optional"
          />
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
    </div>
  );
};

export default ColumnClassifierSettings;
