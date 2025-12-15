import React from 'react';
import { Upload, Info, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLaboratoryStore, DataUploadSettings, createDefaultDataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const DataUploadProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const settings = (atom?.settings as DataUploadSettings) || createDefaultDataUploadSettings();

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <Upload className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold text-gray-800">Data Upload Settings</h3>
      </div>

      {/* Info Card */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Guided Upload Flow</p>
            <p className="text-blue-700">
              Use the "Start Guided Upload" button in the atom to upload and prime your data files.
              The guided workflow will help you:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-blue-700">
              <li>Upload CSV, Excel, or JSON files</li>
              <li>Select and configure headers</li>
              <li>Review and edit column names</li>
              <li>Set data types for each column</li>
              <li>Handle missing values</li>
              <li>Preview and save your primed data</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Uploaded Files Summary */}
      {settings.uploadedFiles && settings.uploadedFiles.length > 0 && (
        <Card className="p-4">
          <h4 className="font-medium text-gray-700 mb-2">Primed Files</h4>
          <div className="space-y-2">
            {settings.uploadedFiles.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">
                <Sparkles className="w-4 h-4 text-green-500" />
                <span>{file}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Empty State */}
      {(!settings.uploadedFiles || settings.uploadedFiles.length === 0) && (
        <div className="text-center py-6 text-gray-500">
          <Upload className="w-10 h-10 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No files uploaded yet</p>
          <p className="text-xs mt-1">Use the guided upload flow to get started</p>
        </div>
      )}
    </div>
  );
};

export default DataUploadProperties;

