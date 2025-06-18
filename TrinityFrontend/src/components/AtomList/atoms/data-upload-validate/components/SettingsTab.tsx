import React from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { DataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  settings: DataUploadSettings;
  uploadedFiles: string[];
  onSettingsChange: (settings: Partial<DataUploadSettings>) => void;
}

const SettingsTab: React.FC<Props> = ({ settings, uploadedFiles, onSettingsChange }) => {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm text-gray-600 block mb-1">Master File</label>
        <select
          className="w-full border rounded p-1 text-sm"
          value={settings.masterFile}
          onChange={e => onSettingsChange({ masterFile: e.target.value })}
        >
          <option value="">-- select --</option>
          {uploadedFiles.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox checked={settings.fileValidation} onCheckedChange={checked => onSettingsChange({ fileValidation: !!checked })} />
        <span className="text-sm text-gray-600">Enable file validation</span>
      </div>
      <div>
        <label className="text-sm text-gray-600 block mb-1">Frequency</label>
        <Input
          value={settings.frequency}
          onChange={e => onSettingsChange({ frequency: e.target.value })}
          className="text-sm"
        />
      </div>
    </div>
  );
};

export default SettingsTab;
