import React, { useState } from 'react';
import { Database } from 'lucide-react';
import FileUploadInterface from './components/FileUploadInterface';
import { useLaboratoryStore, DEFAULT_DATAUPLOAD_SETTINGS, DataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const DataUploadValidateAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: DataUploadSettings = atom?.settings || { ...DEFAULT_DATAUPLOAD_SETTINGS };

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleFileUpload = (files: File[]) => {
    setUploadedFiles(files);
    updateSettings(atomId, { uploadedFiles: files.map(f => f.name) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
          <Database className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">Data Upload &amp; Validate</h2>
          <p className="text-xs text-gray-500">Upload and validate data automatically</p>
        </div>
      </div>

      <FileUploadInterface
        onFileUpload={handleFileUpload}
        uploadedFiles={uploadedFiles}
        settings={settings}
        atomId={atomId}
      />
    </div>
  );
};

export default DataUploadValidateAtom;
