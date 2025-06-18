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
    <div className="w-full h-full bg-gradient-to-br from-gray-50 via-white to-gray-50 rounded-xl border border-gray-200 shadow-lg overflow-hidden flex flex-col">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Data Upload & Validate</h2>
            <p className="text-blue-100 text-sm">Upload and validate data with automatic type detection</p>
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
