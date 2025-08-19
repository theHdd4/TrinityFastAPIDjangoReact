import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { VALIDATE_API } from '@/lib/api';

interface SelectModelsFeatureSettingsProps {
  data: any;
  onDataChange: (newData: Partial<any>) => void;
}

interface Frame { object_name: string; csv_name: string; }

const SelectModelsFeatureSettings: React.FC<SelectModelsFeatureSettingsProps> = ({
  data,
  onDataChange
}) => {
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
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  return (
    <div className="w-full h-full p-6 space-y-6 bg-background overflow-y-auto">
      {/* Data Source Section */}
      <Card className="p-6">
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="data-source" className="text-sm font-medium text-foreground">
              Select Data Source
            </Label>
            <Select 
              value={data.selectedDataset} 
              onValueChange={(value) => onDataChange({ selectedDataset: value })}
            >
              <SelectTrigger className="mt-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
                <SelectValue placeholder="Select dataframe" />
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
        </div>
      </Card>

      {/* Ensemble Method Section */}
      <Card className="p-6">
        <h4 className="text-md font-medium text-foreground mb-4">Model Configuration</h4>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ensemble-method"
              checked={data.ensembleMethod}
              onCheckedChange={(checked) => onDataChange({ ensembleMethod: Boolean(checked) })}
            />
            <Label 
              htmlFor="ensemble-method" 
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Ensemble Method
            </Label>
          </div>
        </div>
      </Card>


    </div>
  );
};

export default SelectModelsFeatureSettings;