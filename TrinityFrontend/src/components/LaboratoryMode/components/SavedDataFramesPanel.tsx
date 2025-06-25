import React, { useEffect, useState } from 'react';
import { Database, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VALIDATE_API } from '@/lib/api';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

const SavedDataFramesPanel: React.FC<Props> = ({ isOpen, onToggle }) => {
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(res => res.json())
      .then(data => setFiles(data.files || []))
      .catch(() => setFiles([]));
  }, [isOpen]);

  const handleOpen = async (obj: string) => {
    const res = await fetch(`${VALIDATE_API}/download_dataframe?object_name=${encodeURIComponent(obj)}`);
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, '_blank');
    }
  };

  if (!isOpen) {
    return (
      <div className="w-12 bg-white border-l border-gray-200 flex flex-col h-full">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
            <Database className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center space-x-2">
          <Database className="w-4 h-4" />
          <span>Saved DataFrames</span>
        </h3>
        <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {files.length === 0 && <p className="text-sm text-gray-600">No saved dataframes</p>}
        {files.map(f => (
          <button
            key={f}
            onClick={() => handleOpen(f)}
            className="block text-left w-full text-sm text-blue-600 hover:underline"
          >
            {f.split('/').pop()}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SavedDataFramesPanel;
