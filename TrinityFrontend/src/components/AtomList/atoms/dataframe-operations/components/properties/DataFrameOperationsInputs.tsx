import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, DATAFRAME_OPERATIONS_API } from '@/lib/api';

interface Frame { object_name: string; csv_name: string; }

const DataFrameOperationsInputs = ({ data, settings, selectedFile, onFileSelect }: any) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  const handleFileChange = async (val: string) => {
    setError(null);
    const fileId = val;
    const frame = frames.find(f => f.object_name === fileId) || null;
    setSelectedFrame(frame);
    if (!fileId || !frame) {
      setError('Please select a valid file.');
      setSelectedFrame(null);
      return; // Do NOT call onFileSelect
    }
    try {
      // Try fetching the dataframe to check if it exists and is valid
      const res = await fetch(`${DATAFRAME_OPERATIONS_API}/cached_dataframe?object_name=${encodeURIComponent(fileId)}`);
      if (!res.ok) throw new Error('Failed to fetch dataframe');
      onFileSelect(fileId); // Only call if valid
    } catch (err: any) {
      setError('Failed to fetch dataframe. Please ensure the file exists and is accessible.');
      setSelectedFrame(null);
      // Do NOT call onFileSelect with empty string here, just leave selection as is
    }
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
                {f.csv_name.split('/').pop()}
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