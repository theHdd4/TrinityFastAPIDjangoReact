import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CLASSIFIER_API } from '@/lib/api';

interface ClassificationResponse {
  final_classification: {
    identifiers: string[];
    measures: string[];
    unclassified: string[];
  };
  auto_classification: {
    confidence_scores: Record<string, number>;
  };
}

interface Dimension { id: string; name: string }

const ColumnClassifierAtom: React.FC = () => {
  const [savedId, setSavedId] = useState('');
  const [fileKey, setFileKey] = useState('');
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [newDim, setNewDim] = useState<Dimension>({ id: '', name: '' });
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadClassification = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('validator_atom_id', savedId);
      form.append('file_key', fileKey);
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to classify');
      const data: ClassificationResponse = await res.json();
      const allCols: Record<string, string> = {};
      data.final_classification.identifiers.forEach(c => (allCols[c] = 'identifiers'));
      data.final_classification.measures.forEach(c => (allCols[c] = 'measures'));
      data.final_classification.unclassified.forEach(c => (allCols[c] = 'unclassified'));
      setColumns(allCols);
      setConfidence(data.auto_classification.confidence_scores);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveClassification = async () => {
    setLoading(true);
    setError('');
    try {
      const identifiers = Object.keys(columns).filter(c => columns[c] === 'identifiers');
      const measures = Object.keys(columns).filter(c => columns[c] === 'measures');
      const unclassified = Object.keys(columns).filter(c => columns[c] === 'unclassified');
      const form = new FormData();
      form.append('validator_atom_id', savedId);
      form.append('file_key', fileKey);
      form.append('identifiers', JSON.stringify(identifiers));
      form.append('measures', JSON.stringify(measures));
      form.append('unclassified', JSON.stringify(unclassified));
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to save classification');
      await res.json();
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const addDimension = () => {
    if (!newDim.id || !newDim.name || dimensions.length >= 4) return;
    if (dimensions.some(d => d.id === newDim.id || d.name === newDim.name)) return;
    setDimensions([...dimensions, newDim]);
    setNewDim({ id: '', name: '' });
  };

  const saveDimensions = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('validator_atom_id', savedId);
      form.append('file_key', fileKey);
      form.append('dimensions', JSON.stringify(dimensions));
      const res = await fetch(`${CLASSIFIER_API}/define_dimensions`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to save dimensions');
      await res.json();
      const assignInit: Record<string, string[]> = {};
      dimensions.forEach(d => (assignInit[d.id] = []));
      setAssignments(assignInit);
      setStep(3);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const assign = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('validator_atom_id', savedId);
      form.append('file_key', fileKey);
      form.append('identifier_assignments', JSON.stringify(assignments));
      const res = await fetch(`${CLASSIFIER_API}/assign_identifiers_to_dimensions`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Failed to assign identifiers');
      await res.json();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const identifierOptions = Object.keys(columns).filter(c => columns[c] === 'identifiers');

  return (
    <div className="p-6 space-y-6">
      <Card className="p-4 space-y-4">
        <Input placeholder="Saved Dataframe ID" value={savedId} onChange={e => setSavedId(e.target.value)} />
        <Input placeholder="File Key" value={fileKey} onChange={e => setFileKey(e.target.value)} className="mt-2" />
        <Button onClick={loadClassification} disabled={loading || !savedId}>Load Columns</Button>
      </Card>

      {error && <p className="text-red-500">{error}</p>}

      {Object.keys(columns).length > 0 && step === 1 && (
        <Card className="p-4 space-y-4">
          {Object.keys(columns).map(col => (
            <div key={col} className="flex items-center justify-between">
              <span className="font-medium">{col}</span>
              <div className="flex items-center space-x-2">
                <Badge variant="outline">{confidence[col]?.toFixed(2)}</Badge>
                <Select value={columns[col]} onValueChange={val => setColumns({ ...columns, [col]: val })}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="identifiers">Identifier</SelectItem>
                    <SelectItem value="measures">Measure</SelectItem>
                    <SelectItem value="unclassified">Unclassified</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          <Button onClick={saveClassification} disabled={loading}>Save Classification</Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-4 space-y-4">
          {dimensions.map(d => (
            <Badge key={d.id} className="mr-2">{d.name}</Badge>
          ))}
          {dimensions.length < 4 && (
            <div className="flex space-x-2">
              <Input placeholder="id" value={newDim.id} onChange={e => setNewDim({ ...newDim, id: e.target.value })} />
              <Input placeholder="name" value={newDim.name} onChange={e => setNewDim({ ...newDim, name: e.target.value })} />
              <Button onClick={addDimension}>Add</Button>
            </div>
          )}
          <Button onClick={saveDimensions} disabled={loading || dimensions.length === 0}>Define Dimensions</Button>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-4 space-y-4">
          {dimensions.map(dim => (
            <div key={dim.id} className="space-y-2">
              <p className="font-medium">{dim.name}</p>
              <select
                multiple
                className="w-full border rounded p-2"
                value={assignments[dim.id] || []}
                onChange={e => {
                  const options = Array.from(e.target.selectedOptions).map(o => o.value);
                  setAssignments({ ...assignments, [dim.id]: options });
                }}
              >
                {identifierOptions.map(id => (
                  <option key={id} value={id} disabled={Object.entries(assignments).some(([k,v]) => k!==dim.id && v.includes(id))}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button onClick={assign} disabled={loading}>Assign Identifiers</Button>
        </Card>
      )}
    </div>
  );
};

export default ColumnClassifierAtom;
