import React, { useState } from 'react';
import BackToAppsIcon from '../TrinityAssets/BackToAppsIcon';
import { Pencil } from 'lucide-react';
import { REGISTRY_API } from '@/lib/api';

interface AppIdentityProps {
  projectName: string | null;
  onGoBack: () => void;
  onRename?: (name: string) => void;
}

const AppIdentity: React.FC<AppIdentityProps> = ({ projectName, onGoBack, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName || '');

  const startEdit = () => {
    setName(projectName || '');
    setEditing(true);
  };

  const submit = async () => {
    if (!editing) return;
    setEditing(false);
    if (!name.trim() || !projectName) return;
    try {
      const saved = localStorage.getItem('current-project');
      if (saved) {
        const proj = JSON.parse(saved);
        const res = await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name })
        });
        if (res.ok) {
          const updated = await res.json();
          localStorage.setItem('current-project', JSON.stringify(updated));
          onRename?.(updated.name);
          return;
        }
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {projectName && (
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          {editing ? (
            <input
              className="border rounded px-1 py-0.5 text-sm"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
                e.stopPropagation();
              }}
              autoFocus
            />
          ) : (
            <span>{projectName}</span>
          )}
          <button type="button" onClick={startEdit} className="p-1" title="Rename project">
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onGoBack}
            className="p-2 text-black"
            title="Go back to projects menu"
          >
            <BackToAppsIcon className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
};

export default AppIdentity;
