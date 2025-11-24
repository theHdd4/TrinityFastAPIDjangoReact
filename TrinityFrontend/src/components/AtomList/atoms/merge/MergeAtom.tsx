import React, { useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import MergeCanvas from './components/MergeCanvas';

interface Props {
  atomId: string;
}

const MergeAtom: React.FC<Props> = ({ atomId }) => {
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const rawSettings = (atom?.settings as any) || {};
    const settings = {
      file1: rawSettings.file1 || '',
      file2: rawSettings.file2 || '',
      joinColumns: Array.isArray(rawSettings.joinColumns) ? rawSettings.joinColumns : [],
      joinType: rawSettings.joinType || 'inner',
      availableColumns: Array.isArray(rawSettings.availableColumns) ? rawSettings.availableColumns : [],
      mergeResults: rawSettings.mergeResults || null,
      ...rawSettings, // Preserve other settings
    };

    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
        <MergeCanvas
          atomId={atomId}
          availableColumns={settings.availableColumns}
          mergeId={settings.mergeId}
          resultFilePath={settings.mergeResults?.result_file}
          file1={settings.file1}
          file2={settings.file2}
          joinColumns={settings.joinColumns}
          joinType={settings.joinType}
          unsavedData={settings.mergeResults?.unsaved_data}
        />
      </div>
    );
  } catch (err) {
    console.error('🔧 MergeAtom: Component error:', err);
    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-yellow-800 font-medium mb-2">Merge Atom Unavailable</h3>
          <p className="text-yellow-700 text-sm mb-2">
            The merge atom is currently unavailable. This might be due to:
          </p>
          <ul className="text-yellow-700 text-sm list-disc list-inside space-y-1 mb-3">
            <li>Browser storage quota exceeded</li>
            <li>Network connectivity issues</li>
            <li>API permission problems</li>
          </ul>
          <div className="space-x-2">
            <button 
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
            >
              Reload Page
            </button>
            <button 
              onClick={() => {
                try {
                  sessionStorage.clear();
                  window.location.reload();
                } catch (e) {
                  console.error('Failed to clear storage:', e);
                }
              }}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Clear Storage & Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export default MergeAtom; 