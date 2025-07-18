import React, { useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import MergeCanvas from './components/MergeCanvas';

interface Props {
  atomId: string;
}

const MergeAtom: React.FC<Props> = ({ atomId }) => {
  console.log('🔧 MergeAtom: Component rendered with atomId:', atomId);
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const settings = (atom?.settings as any) || {
      file1: '',
      file2: '',
      joinColumns: [] as string[],
      joinType: 'inner',
      availableColumns: [] as string[],
      mergeResults: null,
    };

    // Add useEffect to track settings changes
    useEffect(() => {
      console.log('🔧 MergeAtom: Settings changed for atomId', atomId, ':', settings);
      console.log('🔧 MergeAtom: mergeResults?.result_file:', settings.mergeResults?.result_file);
    }, [settings, atomId]);

    // Force re-render when atom changes
    useEffect(() => {
      console.log('🔧 MergeAtom: Atom object changed:', atom);
    }, [atom]);

    console.log('🔧 MergeAtom: Settings for atomId', atomId, ':', settings);
    console.log('🔧 MergeAtom: mergeResults:', settings.mergeResults);
    console.log('🔧 MergeAtom: mergeResults?.result_file:', settings.mergeResults?.result_file);
    console.log('🔧 MergeAtom: atom object:', atom);

    // Force re-render when settings change
    const settingsKey = JSON.stringify(settings);

    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
        <MergeCanvas
          key={settingsKey} // Force re-render when settings change
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