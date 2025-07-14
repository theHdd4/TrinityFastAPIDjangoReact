import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { VALIDATE_API, CLASSIFIER_API } from '@/lib/api';
import type { FileClassification, ColumnData } from '../ColumnClassifierAtom';

interface Frame { object_name: string; csv_name: string; }

interface ClassificationResponse {
  final_classification: {
    identifiers: string[];
    measures: string[];
    unclassified: string[];
  };
}

interface ColumnClassifierSettingsProps {
  onClassification: (file: FileClassification) => void;
}

const dimensionOptions = ['market', 'brand', 'time', 'channel'];

const ColumnClassifierSettings: React.FC<ColumnClassifierSettingsProps> = ({ onClassification }) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [savedId, setSavedId] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [selectedDims, setSelectedDims] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  const toggleDim = (dim: string) => {
    setSelectedDims(prev => prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]);
  };

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
      const custom = Object.fromEntries(selectedDims.map(d => [d, []]));
      onClassification({ fileName: savedId, columns: cols, customDimensions: custom });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-2">
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">Saved Dataframe</label>
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
        <label className="text-sm font-medium text-gray-700 block mb-2">File Key</label>
        <Input value={fileKey} onChange={e => setFileKey(e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Business Dimensions</p>
        {dimensionOptions.map(dim => (
          <div key={dim} className="flex items-center space-x-2 mb-1">
            <Checkbox id={dim} checked={selectedDims.includes(dim)} onCheckedChange={() => toggleDim(dim)} />
            <label htmlFor={dim} className="text-sm capitalize">{dim}</label>
          </div>
        ))}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <Button onClick={classify} disabled={loading || !savedId} className="w-full">
        Classify Columns
      </Button>
    </div>
  );
};

export default ColumnClassifierSettings;
