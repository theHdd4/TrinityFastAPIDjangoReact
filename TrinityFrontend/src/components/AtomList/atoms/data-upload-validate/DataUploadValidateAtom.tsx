import React, { useState } from 'react';
import { Database } from 'lucide-react';
import FileUploadInterface from './components/FileUploadInterface';
import { useLaboratoryStore, DEFAULT_DATAUPLOAD_SETTINGS, DataUploadSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const DataUploadValidateAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore((state) => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore((state) => state.updateAtomSettings);
  const settings: DataUploadSettings = atom?.settings || { ...DEFAULT_DATAUPLOAD_SETTINGS };

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleFileUpload = (files: File[]) => {
    setUploadedFiles(files);
    updateSettings(atomId, { uploadedFiles: files.map((f) => f.name) });
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-black" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-black">Data Upload & Validate</h2>
            <p className="text-xs text-gray-600">Upload and validate data with automatic type detection</p>
          </div>
        </div>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        <FileUploadInterface onFileUpload={handleFileUpload} uploadedFiles={uploadedFiles} />
      </div>
    </div>
  );
};

export default DataUploadValidateAtom;
