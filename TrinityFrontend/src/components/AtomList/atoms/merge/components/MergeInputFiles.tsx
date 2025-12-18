import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MERGE_API, VALIDATE_API } from '@/lib/api';

interface MergeInputFilesProps {
  settings: {
    file1: string;
    file2: string;
    joinColumns: string[];
  };
  onSettingsChange: (settings: any) => void;
  onPerformMerge?: () => void;
}

interface Frame { object_name: string; csv_name: string; }

const MergeInputFiles: React.FC<MergeInputFilesProps> = ({ settings, onSettingsChange, onPerformMerge }) => {
  const [frames, setFrames] = useState<Frame[]>([]);

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

  return (
    <div className="w-full h-full p-6 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Primary Source</label>
          <Select value={settings.file1} onValueChange={val => {
            onSettingsChange({ ...settings, file1: val });
          }}>
            <SelectTrigger className="bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
              <SelectValue placeholder="Select primary dataframe" />
            </SelectTrigger>
            <SelectContent>
              {(Array.isArray(frames) ? frames : []).map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
                  {f.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Secondary Source</label>
          <Select value={settings.file2} onValueChange={val => {
            onSettingsChange({ ...settings, file2: val });
          }}>
            <SelectTrigger className="bg-green-50 border border-green-200 hover:bg-green-100 transition-colors">
              <SelectValue placeholder="Select secondary dataframe" />
            </SelectTrigger>
            <SelectContent>
              {(Array.isArray(frames) ? frames : []).map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
                  {f.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Data Summary Toggle */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between pt-4 border-t mt-4">
            <Label className="text-xs">Show Data Summary</Label>
            <Switch
              checked={settings.showDataSummary || false}
              onCheckedChange={(checked) => {
                onSettingsChange({ ...settings, showDataSummary: !!checked });
              }}
            />
          </div>
        </Card>
        
        {/* Perform Merge Button */}
        <div className="pt-6">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={onPerformMerge}
            disabled={!settings.file1 || !settings.file2 || !settings.joinColumns || settings.joinColumns.length === 0}
          >
            Perform Merge
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MergeInputFiles; 