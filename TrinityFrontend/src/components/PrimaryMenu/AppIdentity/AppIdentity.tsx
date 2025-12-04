import React, { useState, useEffect } from 'react';
import BackToAppsIcon from '../TrinityAssets/BackToAppsIcon';
import { REGISTRY_API } from '@/lib/api';
import { saveCurrentProject } from '@/utils/projectStorage';

interface AppIdentityProps {
  projectName: string | null;
  onGoBack: () => void;
  onRename?: (name: string) => void;
}

const AppIdentity: React.FC<AppIdentityProps> = ({ projectName, onGoBack, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(projectName || '');
  const [appName, setAppName] = useState<string | null>(null);

  useEffect(() => {
    // Get app name from env or current-app
    try {
      const envStr = localStorage.getItem('env');
      if (envStr) {
        const env = JSON.parse(envStr);
        if (env.APP_NAME) {
          setAppName(env.APP_NAME);
          return;
        }
      }
      const appStr = localStorage.getItem('current-app');
      if (appStr) {
        const app = JSON.parse(appStr);
        if (app.name) {
          setAppName(app.name);
        }
      }
    } catch {
      // ignore
    }
  }, []);

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
          console.log('Project renamed from primary menu', updated);
          saveCurrentProject(updated);
          try {
            const envRes = await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
              credentials: 'include'
            });
            if (envRes.ok) {
              const envData = await envRes.json();
              if (envData.environment) {
                console.log('Environment after project rename', envData.environment, 'source', envData.env_source);
                localStorage.setItem('env', JSON.stringify(envData.environment));
              }
            }
          } catch (err) {
            console.log('Rename env fetch error', err);
          }
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
          {appName && (
            <span className="text-gray-500">
              {appName}
            </span>
          )}
          {appName && <span className="text-gray-400">/</span>}
          {editing ? (
            <input
              className="border rounded px-2 py-1 text-sm"
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
            <span onClick={startEdit} className="cursor-pointer hover:underline">
              {projectName}
            </span>
          )}
          <button
            type="button"
            onClick={onGoBack}
            className="p-1.5 text-black"
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
