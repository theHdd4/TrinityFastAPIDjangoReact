import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API } from '@/lib/api';

interface Frame { object_name: string; arrow_name: string }

const DataFrameOperationsInputs = ({ data, settings, selectedFile, onFileSelect }: any) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d =>
        setFrames(
          Array.isArray(d.files)
            ? d.files
                .filter((f: any) => !!f.arrow_name)
                .map((f: any) => ({ object_name: f.object_name, arrow_name: f.arrow_name }))
            : []
        )
      )
      .catch(() => setFrames([]));
  }, []);

  const handleFileChange = (val: string) => {
    setError(null);
    const fileId = val;
    const frame = frames.find(f => f.object_name === fileId) || null;
    setSelectedFrame(frame);
    if (!fileId || !frame) {
      setError('Please select a valid file.');
      setSelectedFrame(null);
      return;
    }
    onFileSelect(fileId);
  };

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Input File</label>
        <Select value={selectedFile} onValueChange={handleFileChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Select saved dataframe" />
          </SelectTrigger>
          <SelectContent>
            {(Array.isArray(frames) ? frames : []).map(f => (
              <SelectItem key={f.object_name} value={f.object_name}>
                {f.arrow_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <div className="text-red-600 text-xs p-2">{error}</div>}
      </Card>
    </div>
  );
};

export default DataFrameOperationsInputs; 

