import React, { useEffect, useState } from 'react';
import { Database, ChevronRight, ChevronDown, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API } from '@/lib/api';

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

  useEffect(() => {
    if (!isOpen) return;

    const fetchAndSetFiles = async () => {
      try {
        // Prefer localStorage env vars so UI reflects most recent project selection/rename
        let env: any = {};
        const storedEnv = localStorage.getItem('env');
        if (storedEnv) {
          try {
            env = JSON.parse(storedEnv);
          } catch {
            // ignore parse errors and fall back to fetch
          }
        }

        // If a current project is stored locally, trust its slug as the project name
        const storedProject = localStorage.getItem('current-project');
        if (storedProject) {
          try {
            const proj = JSON.parse(storedProject);
            if (proj?.slug) env.PROJECT_NAME = proj.slug;
          } catch {
            // ignore parse errors
          }
        }

        // If any of the names are missing, fetch from API (redis) and merge
        if (!env?.CLIENT_NAME || !env?.APP_NAME || !env?.PROJECT_NAME) {
          const envRes = await fetch(`${VALIDATE_API}/get_environment_variables`, {
            credentials: 'include'
          });
          const fetched = await envRes.json();
          env = { ...fetched, ...env };
          try {
            localStorage.setItem('env', JSON.stringify(env));
          } catch {
            // ignore storage errors
          }
        }

        const project = (env.PROJECT_NAME || '').replace(/[-_]\d+$/, '');
        const newPrefix = `${env.CLIENT_NAME}/${env.APP_NAME}/${project}/`;
        setPrefix(newPrefix);

        const params = new URLSearchParams({
          client_name: env.CLIENT_NAME,
          app_name: env.APP_NAME,
          project_name: project
        });

        const dfRes = await fetch(
          `${VALIDATE_API}/list_saved_dataframes?${params.toString()}`,
          {
            credentials: 'include'
          }
        );
        const data = await dfRes.json();

        const filteredFiles = Array.isArray(data.files)
          ? data.files.filter(f => f.object_name.startsWith(newPrefix))
          : [];

        console.log(
          `📁 [SavedDataFramesPanel] Using prefix "${newPrefix}" from env CLIENT=${env.CLIENT_NAME} APP=${env.APP_NAME} PROJECT=${project}`
        );

        setFiles(filteredFiles);
      } catch (err) {
        console.error('❌ Error loading environment or dataframes:', err);
        setFiles([]);
      }
    };

    fetchAndSetFiles();
  }, [isOpen]);

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
