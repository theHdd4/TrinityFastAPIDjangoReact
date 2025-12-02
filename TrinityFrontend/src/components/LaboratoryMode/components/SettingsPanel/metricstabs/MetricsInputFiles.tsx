import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API } from '@/lib/api';
import { useLaboratoryStore } from '../../../store/laboratoryStore';

interface Frame {
  object_name: string;
  csv_name: string;
}

interface MetricsInputFilesProps {
  cardId?: string;
}

const MetricsInputFiles: React.FC<MetricsInputFilesProps> = ({ cardId }) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  const selectedDataSource = metricsInputs.dataSource;

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        // Filter to only show Arrow files, exclude CSV and XLSX files
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter(f => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch(() => setFrames([]));
  }, []);

  const handleFrameChange = (val: string) => {
    if (!val.endsWith('.arrow')) {
      val += '.arrow';
    }
    updateMetricsInputs({ dataSource: val });
  };

  return (
    <div className="space-y-4 px-2 pb-2">
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a0aec0;
        }
      `}</style>
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        <Select value={selectedDataSource} onValueChange={handleFrameChange}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
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

export default MetricsInputFiles;

