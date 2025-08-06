import React, { useEffect, useState } from 'react';
import { Database, ChevronRight, ChevronDown, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API, SESSION_API } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

const SavedDataFramesPanel: React.FC<Props> = ({ isOpen, onToggle }) => {
  interface Frame { object_name: string; csv_name: string; arrow_name?: string }
  interface TreeNode {
    name: string;
    path: string;
    children?: TreeNode[];
    frame?: Frame;
  }

  const [files, setFiles] = useState<Frame[]>([]);
  const [prefix, setPrefix] = useState('');
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { user } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        let env: any = {};
        const envStr = localStorage.getItem('env');
        if (envStr) {
          try {
            env = JSON.parse(envStr);
          } catch {
            env = {};
          }
        }

        if (user && env.CLIENT_ID && env.APP_ID && env.PROJECT_ID) {
          try {
            const redisRes = await fetch(`${SESSION_API}/init`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: env.CLIENT_ID,
                user_id: user.id,
                app_id: env.APP_ID,
                project_id: env.PROJECT_ID
              })
            });
            if (redisRes.ok) {
              const redisData = await redisRes.json();
              const redisEnv = redisData.state?.envvars;
              if (redisEnv) {
                env = { ...env, ...redisEnv };
                localStorage.setItem('env', JSON.stringify(env));
              }
            }
          } catch (err) {
            console.warn('Redis env fetch failed', err);
          }
        }

        console.log('📦 env', {
          CLIENT_NAME: env.CLIENT_NAME,
          APP_NAME: env.APP_NAME,
          PROJECT_NAME: env.PROJECT_NAME
        });

        try {
          const prefRes = await fetch(`${VALIDATE_API}/get_object_prefix`, {
            credentials: 'include'
          });
          if (prefRes.ok) {
            const prefData = await prefRes.json();
            setPrefix(prefData.prefix || '');
            if (prefData.environment) {
              env = { ...env, ...prefData.environment };
              localStorage.setItem('env', JSON.stringify(env));
            }
          }
        } catch (err) {
          console.warn('get_object_prefix failed', err);
        }

        const res = await fetch(`${VALIDATE_API}/list_saved_dataframes`, {
          credentials: 'include'
        });
        const data = await res.json();
        setPrefix(data.prefix || '');
        if (data.environment) {
          localStorage.setItem('env', JSON.stringify({ ...env, ...data.environment }));
        }
        console.log(
          `📁 SavedDataFramesPanel looking in MinIO bucket "${data.bucket}" folder "${data.prefix}" via ${data.env_source} (CLIENT_NAME=${data.environment?.CLIENT_NAME} APP_NAME=${data.environment?.APP_NAME} PROJECT_NAME=${data.environment?.PROJECT_NAME})`
        );
        setFiles(Array.isArray(data.files) ? data.files : []);
      } catch (err) {
        console.error('Failed to load saved dataframes', err);
        setFiles([]);
      }
    };
    load();
  }, [isOpen, user]);

  const handleOpen = (obj: string) => {
    window.open(`/dataframe?name=${encodeURIComponent(obj)}`, '_blank');
  };

  const deleteAll = async () => {
    await fetch(`${VALIDATE_API}/delete_all_dataframes`, { method: 'DELETE' });
    setFiles([]);
  };

  const deleteOne = async (obj: string) => {
    await fetch(`${VALIDATE_API}/delete_dataframe?object_name=${encodeURIComponent(obj)}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f.object_name !== obj));
  };

  const startRename = (obj: string, currentName: string) => {
    setRenameTarget(obj);
    setRenameValue(currentName);
  };

  const commitRename = async (obj: string) => {
    if (!renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    let filename = renameValue.trim();
    if (!filename.endsWith('.arrow')) {
      filename += '.arrow';
    }
    const form = new FormData();
    form.append('object_name', obj);
    form.append('new_filename', filename);
    const res = await fetch(`${VALIDATE_API}/rename_dataframe`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      const base = filename.replace(/\.arrow$/, '');
      setFiles(prev =>
        prev.map(f =>
          f.object_name === obj
            ? { ...f, object_name: data.new_name, csv_name: base, arrow_name: filename }
            : f
        )
      );
    }
    setRenameTarget(null);
  };

  const buildTree = (frames: Frame[], pref: string): TreeNode[] => {
    const root: any = { children: {} };
    frames.forEach(f => {
      const rel = f.object_name.startsWith(pref)
        ? f.object_name.slice(pref.length)
        : f.object_name;
      const parts = rel.split('/').filter(Boolean);
      let node = root;
      let currentPath = pref;
      parts.forEach((part, idx) => {
        currentPath += part + (idx < parts.length - 1 ? '/' : '');
        if (!node.children[part]) {
          node.children[part] = { name: part, path: currentPath, children: {} };
        }
        node = node.children[part];
        if (idx === parts.length - 1) {
          node.frame = f;
        }
      });
    });
    const toArr = (n: any): TreeNode[] =>
      Object.values(n.children || {}).map((c: any) => ({
        name: c.name,
        path: c.path,
        frame: c.frame,
        children: toArr(c)
      }));
    return toArr(root);
  };

  const tree = buildTree(files, prefix);

  const toggleDir = (path: string) => {
    setOpenDirs(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: TreeNode, level = 0): React.ReactNode => {
    if (node.frame) {
      const f = node.frame;
      return (
        <div
          key={node.path}
          style={{ marginLeft: level * 12 }}
          className="flex items-center justify-between border p-2 rounded hover:bg-gray-50 mt-1"
        >
          {renameTarget === f.object_name ? (
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => commitRename(f.object_name)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename(f.object_name);
                }
              }}
              className="h-6 text-xs flex-1 mr-2"
            />
          ) : (
            <button
              onClick={() => handleOpen(f.object_name)}
              className="text-sm text-blue-600 hover:underline flex-1 text-left"
            >
              {f.arrow_name ? f.arrow_name.split('/').pop() : f.csv_name.split('/').pop()}
            </button>
          )}
          <div className="flex items-center space-x-2 ml-2">
            <Pencil
              className="w-4 h-4 text-gray-400 cursor-pointer"
              onClick={() => startRename(f.object_name, f.arrow_name || f.csv_name)}
            />
            <Trash2
              className="w-4 h-4 text-gray-400 cursor-pointer"
              onClick={() => deleteOne(f.object_name)}
            />
          </div>
        </div>
      );
    }
    const isOpen = openDirs[node.path];
    return (
      <div key={node.path} style={{ marginLeft: level * 12 }} className="mt-1">
        <button
          onClick={() => toggleDir(node.path)}
          className="flex items-center text-sm text-gray-700"
        >
          {isOpen ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />}
          {node.name}
        </button>
        {isOpen && node.children?.map(child => renderNode(child, level + 1))}
      </div>
    );
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
      <div className="flex-1 overflow-y-auto p-4">
        {tree.length === 0 && <p className="text-sm text-gray-600">No saved dataframes</p>}
        {tree.map(node => renderNode(node))}
      </div>
    </div>
  );
};

export default SavedDataFramesPanel;
