import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';
import { CLASSIFIER_API } from '@/lib/api';
import {
  useLaboratoryStore,
  ColumnClassifierSettings as SettingsType,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS
} from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const ColumnClassifierDimensions: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS
  };

  const [options, setOptions] = useState<string[]>(
    Array.from(new Set(['market', 'product', ...(settings.dimensions || [])]))
  );
  const [selected, setSelected] = useState<string[]>(settings.dimensions || []);
  const [showInput, setShowInput] = useState(false);
  const [newDim, setNewDim] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggle = (dim: string) => {
    setSelected(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
    );
  };

  const addDimension = () => {
    const dim = newDim.trim().toLowerCase();
    if (dim && !options.includes(dim) && options.length < 4) {
      setOptions([...options, dim]);
      setSelected([...selected, dim]);
    }
    setNewDim('');
    setShowInput(false);
  };

  const save = async () => {
    if (!settings.validatorId || !settings.fileKey) {
      setError('Classify a dataframe first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('validator_atom_id', settings.validatorId);
      form.append('file_key', settings.fileKey);
      const dims = selected.map(d => ({ id: d, name: d }));
      form.append('dimensions', JSON.stringify(dims));
      const res = await fetch(`${CLASSIFIER_API}/define_dimensions`, {
        method: 'POST',
        body: form
      });
      if (!res.ok) throw new Error('Failed to save dimensions');
      updateSettings(atomId, { dimensions: selected });
      if (settings.data.files.length) {
        const updatedFiles = settings.data.files.map(file => ({
          ...file,
          customDimensions: selected.reduce((acc, d) => {
            acc[d] = file.customDimensions[d] || [];
            return acc;
          }, {} as { [key: string]: string[] })
        }));
        updateSettings(atomId, { data: { ...settings.data, files: updatedFiles } });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-4">
        <div>
          <Label className="text-sm mb-2 block">Business Dimensions</Label>
          {options.map(dim => (
            <div key={dim} className="flex items-center space-x-2 mb-1">
              <Checkbox
                id={`${atomId}-${dim}`}
                checked={selected.includes(dim)}
                onCheckedChange={() => toggle(dim)}
              />
              <label htmlFor={`${atomId}-${dim}`} className="text-sm capitalize">
                {dim}
              </label>
            </div>
          ))}
          {options.length < 4 && !showInput && (
            <Button variant="ghost" size="sm" onClick={() => setShowInput(true)} className="flex items-center mt-2">
              <Plus className="w-4 h-4 mr-1" /> Add Dimension
            </Button>
          )}
          {showInput && (
            <div className="flex items-center space-x-2 mt-2">
              <Input
                value={newDim}
                onChange={e => setNewDim(e.target.value)}
                placeholder="Dimension name"
              />
              <Button size="sm" onClick={addDimension}>Add</Button>
            </div>
          )}
        </div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button onClick={save} disabled={loading || selected.length === 0} className="w-full">
          Save Dimensions
        </Button>
      </Card>
    </div>
  );
};

export default ColumnClassifierDimensions;
