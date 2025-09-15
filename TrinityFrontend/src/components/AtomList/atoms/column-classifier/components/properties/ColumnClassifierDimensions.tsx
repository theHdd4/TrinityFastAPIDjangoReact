import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
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
  const settings: SettingsType = {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
    ...(atom?.settings as SettingsType)
  };
  const { toast } = useToast();

  const [enableMapping, setEnableMapping] = useState<boolean>(
    settings.enableDimensionMapping || false
  );
  const [options, setOptions] = useState<string[]>(
    Array.from(
      new Set([
        'unattributed',
        'market',
        'product',
        ...(settings.dimensions || [])
      ])
    )
  );
  const [selected, setSelected] = useState<string[]>(
    (settings.dimensions || []).filter(d => d !== 'unattributed')
  );
  const [showInput, setShowInput] = useState(false);
  const [newDim, setNewDim] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // list of identifier columns for potential future assignments
  const identifiers =
    settings.data.files[settings.data.activeFileIndex]?.columns
      ?.filter(c => c.category === 'identifiers')
      .map(c => c.name) || [];

  React.useEffect(() => {
    setEnableMapping(settings.enableDimensionMapping || false);
    setOptions(
      Array.from(
        new Set([
          'unattributed',
          'market',
          'product',
          ...(settings.dimensions || [])
        ])
      )
    );
    setSelected((settings.dimensions || []).filter(d => d !== 'unattributed'));
  }, [settings.dimensions, settings.enableDimensionMapping]);

  const toggle = (dim: string) => {
    setSelected(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
    );
  };

  const addDimension = () => {
    const dim = newDim.trim().toLowerCase();
    if (dim && !options.includes(dim) && options.length < 5) {
      setOptions([...options, dim]);
      setSelected([...selected, dim]);
    }
    setNewDim('');
    setShowInput(false);
  };


  const save = async () => {
    if (!settings.validatorId || settings.data.files.length === 0) {
      setError('Classify a dataframe first');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const dims = enableMapping
        ? ['unattributed', ...selected]
        : [];
      updateSettings(atomId, {
        enableDimensionMapping: enableMapping,
        dimensions: dims
      });
      if (settings.data.files.length) {
        const updatedFiles = settings.data.files.map(file => {
          if (!enableMapping) {
            return { ...file, customDimensions: {} };
          }
          const identifiers = file.columns
            .filter(c => c.category === 'identifiers')
            .map(c => c.name);
          const custom = dims.reduce((acc, d) => {
            acc[d] = d === 'unattributed' ? identifiers : [];
            return acc;
          }, {} as { [key: string]: string[] });
          return { ...file, customDimensions: custom };
        });
        updateSettings(atomId, {
          data: { ...settings.data, files: updatedFiles }
        });
      }
      toast({ title: 'Dimensions Saved Successfully' });
    } catch (e: any) {
      setError(e.message);
      toast({ title: 'Unable to Save Dimensions', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${atomId}-enable-map`} className="text-sm">
            Enable Dimension Mapping
          </Label>
          <Switch
            id={`${atomId}-enable-map`}
            checked={enableMapping}
            onCheckedChange={setEnableMapping}
          />
        </div>
        {enableMapping && (
          <div>
            <Label className="text-sm mb-2 block">Business Dimensions</Label>
            <div className="flex items-center space-x-2 mb-1">
              <Checkbox id={`${atomId}-unattributed`} checked disabled />
              <label
                htmlFor={`${atomId}-unattributed`}
                className="text-sm capitalize"
              >
                Unattributed
              </label>
            </div>
            {options
              .filter(dim => dim !== 'unattributed')
              .map(dim => (
                <div key={dim} className="flex items-center space-x-2 mb-1">
                  <Checkbox
                    id={`${atomId}-${dim}`}
                    checked={selected.includes(dim)}
                    onCheckedChange={() => toggle(dim)}
                  />
                  <label
                    htmlFor={`${atomId}-${dim}`}
                    className="text-sm capitalize"
                  >
                    {dim}
                  </label>
                </div>
              ))}
            {options.length < 5 && !showInput && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInput(true)}
                className="flex items-center mt-2"
              >
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
                <Button size="sm" onClick={addDimension}>
                  Add
                </Button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button
          onClick={save}
          disabled={loading || (enableMapping && selected.length === 0)}
          className="w-full"
        >
          Save Dimensions
        </Button>
      </Card>
    </div>
  );
};

export default ColumnClassifierDimensions;
