import React, { useEffect, useState } from 'react';
import { Database, ChevronRight, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API } from '@/lib/api';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

const SavedDataFramesPanel: React.FC<Props> = ({ isOpen, onToggle }) => {
  const [files, setFiles] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const deleteAll = async () => {
    await fetch(`${VALIDATE_API}/delete_all_dataframes`, { method: 'DELETE' });
    setFiles([]);
  };

  const deleteOne = async (obj: string) => {
    await fetch(`${VALIDATE_API}/delete_dataframe?object_name=${encodeURIComponent(obj)}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f !== obj));
  };

  const startRename = (obj: string) => {
    setRenameTarget(obj);
    setRenameValue(obj.split('/').pop() || obj);
  };

  const commitRename = async (obj: string) => {
    if (!renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    const form = new FormData();
    form.append('object_name', obj);
    form.append('new_filename', renameValue.trim());
    const res = await fetch(`${VALIDATE_API}/rename_dataframe`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      setFiles(prev => prev.map(f => (f === obj ? data.new_name : f)));
    }
    setRenameTarget(null);
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
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={deleteAll} className="p-1 h-8 w-8" title="Delete all">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {files.length === 0 && <p className="text-sm text-gray-600">No saved dataframes</p>}
        {files.map(f => (
          <div key={f} className="flex items-center justify-between border p-2 rounded hover:bg-gray-50">
            {renameTarget === f ? (
              <Input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(f)}
                className="h-6 text-xs flex-1 mr-2"
              />
            ) : (
              <button onClick={() => handleOpen(f)} className="text-sm text-blue-600 hover:underline flex-1 text-left">
                {f.split('/').pop()}
              </button>
            )}
            <div className="flex items-center space-x-2 ml-2">
              <Pencil className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => startRename(f)} />
              <Trash2 className="w-4 h-4 text-gray-400 cursor-pointer" onClick={() => deleteOne(f)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SavedDataFramesPanel;
