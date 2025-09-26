import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, ChevronRight, ChevronDown, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API, SESSION_API } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
}

const SavedDataFramesPanel: React.FC<Props> = ({ isOpen, onToggle }) => {
  interface Frame {
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
    size?: number;
  }
  interface TreeNode {
    name: string;
    path: string;
    children?: TreeNode[];
    frame?: Frame;
  }

  interface EnvTarget {
    client: string;
    app: string;
    project: string;
  }

  const [files, setFiles] = useState<Frame[]>([]);
  const [prefix, setPrefix] = useState('');
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<
    { type: 'one'; target: string } | { type: 'all' } | null
  >(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: string;
    frame: Frame;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const { user } = useAuth();

  const normalizeName = (value: unknown): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  const extractDisplayContext = (source?: Record<string, any>) => ({
    client:
      typeof source?.CLIENT_NAME === 'string'
        ? source.CLIENT_NAME
        : typeof source?.client_name === 'string'
        ? source.client_name
        : '',
    app:
      typeof source?.APP_NAME === 'string'
        ? source.APP_NAME
        : typeof source?.app_name === 'string'
        ? source.app_name
        : '',
    project:
      typeof source?.PROJECT_NAME === 'string'
        ? source.PROJECT_NAME
        : typeof source?.project_name === 'string'
        ? source.project_name
        : '',
  });

  const formatContext = (ctx: Partial<EnvTarget>) =>
    `CLIENT_NAME=${ctx.client || '∅'} APP_NAME=${ctx.app || '∅'} PROJECT_NAME=${ctx.project || '∅'}`;

  const contextsMatch = (expected: EnvTarget, candidate?: Record<string, any>) => {
    if (!candidate) return false;
    const actual = extractDisplayContext(candidate);
    const actualNorm = {
      client: normalizeName(actual.client),
      app: normalizeName(actual.app),
      project: normalizeName(actual.project),
    };
    const expectedNorm = {
      client: normalizeName(expected.client),
      app: normalizeName(expected.app),
      project: normalizeName(expected.project),
    };
    if (expectedNorm.client) {
      if (!actualNorm.client || actualNorm.client !== expectedNorm.client) {
        return false;
      }
    }
    if (expectedNorm.app) {
      if (!actualNorm.app || actualNorm.app !== expectedNorm.app) {
        return false;
      }
    }
    if (expectedNorm.project) {
      if (!actualNorm.project || actualNorm.project !== expectedNorm.project) {
        return false;
      }
    }
    return true;
  };

  const buildPrefixFromTarget = (target: EnvTarget) => {
    const parts = [target.client, target.app, target.project]
      .map(part => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean) as string[];
    return parts.length ? `${parts.join('/')}/` : '';
  };

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      window.setTimeout(resolve, ms);
    });

  const readExpectedContext = (): { env: Record<string, any>; target: EnvTarget } => {
    let parsedEnv: Record<string, any> = {};
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        parsedEnv = JSON.parse(envStr);
      } catch {
        parsedEnv = {};
      }
    }

    let currentProjectName = '';
    const currentStr = localStorage.getItem('current-project');
    if (currentStr) {
      try {
        const current = JSON.parse(currentStr);
        if (current && typeof current.name === 'string') {
          currentProjectName = current.name;
        }
      } catch {
        /* ignore */
      }
    }

    const pickValue = (...values: (string | undefined)[]) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return '';
    };

    const target: EnvTarget = {
      client: pickValue(parsedEnv.CLIENT_NAME, parsedEnv.client_name),
      app: pickValue(parsedEnv.APP_NAME, parsedEnv.app_name),
      project: pickValue(parsedEnv.PROJECT_NAME, parsedEnv.project_name, currentProjectName),
    };

    return { env: parsedEnv, target };
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        let attempt = 0;
        while (!cancelled) {
          attempt += 1;
          const { env: storedEnv, target } = readExpectedContext();
          const waitForNextPoll = async () => {
            const delay = Math.min(2000, 200 + attempt * 200);
            if (!cancelled) {
              await sleep(delay);
            }
          };

          if (!target.project) {
            await waitForNextPoll();
            continue;
          }

          let env: Record<string, any> = { ...storedEnv };
          if (target.client) env.CLIENT_NAME = target.client;
          if (target.app) env.APP_NAME = target.app;
          if (target.project) env.PROJECT_NAME = target.project;

          const query = new URLSearchParams({
            client_name: target.client || '',
            app_name: target.app || '',
            project_name: target.project || '',
          }).toString();

          if (user) {
            try {
              const payload: any = {
                user_id: user.id,
                client_id: env.CLIENT_ID || '',
                app_id: env.APP_ID || '',
                project_id: env.PROJECT_ID || '',
                client_name: target.client || env.CLIENT_NAME || '',
                app_name: target.app || env.APP_NAME || '',
                project_name: target.project || env.PROJECT_NAME || '',
              };
              const redisRes = await fetch(`${SESSION_API}/init`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (redisRes.ok) {
                const redisData = await redisRes.json();
                const redisEnv = redisData.state?.envvars;
                if (redisEnv) {
                  const merged = { ...env, ...redisEnv };
                  if (contextsMatch(target, merged)) {
                    env = merged;
                    localStorage.setItem('env', JSON.stringify(env));
                  } else {
                    console.warn(
                      `SavedDataFramesPanel session env mismatch expected ${formatContext(target)} but received ${formatContext(extractDisplayContext(merged))}`
                    );
                  }
                }
              }
            } catch (err) {
              console.warn('Redis env fetch failed', err);
            }
          }

          let resolvedPrefix = '';
          try {
            const prefRes = await fetch(
              `${VALIDATE_API}/get_object_prefix?${query}`,
              { credentials: 'include' }
            );
            if (prefRes.ok) {
              const prefData = await prefRes.json();
              resolvedPrefix = prefData.prefix || '';
              if (prefData.environment) {
                const merged = { ...env, ...prefData.environment };
                if (contextsMatch(target, merged)) {
                  env = merged;
                  localStorage.setItem('env', JSON.stringify(env));
                } else {
                  console.warn(
                    `SavedDataFramesPanel prefix env mismatch expected ${formatContext(target)} but received ${formatContext(extractDisplayContext(merged))}`
                  );
                  await waitForNextPoll();
                  continue;
                }
              }
            } else {
              console.warn('get_object_prefix failed', prefRes.status);
            }
          } catch (err) {
            console.warn('get_object_prefix failed', err);
          }

          let data: any = null;
          try {
            const listRes = await fetch(
              `${VALIDATE_API}/list_saved_dataframes?${query}`,
              { credentials: 'include' }
            );
            if (!listRes.ok) {
              console.warn('list_saved_dataframes failed', listRes.status);
              await waitForNextPoll();
              continue;
            }
            try {
              data = await listRes.json();
            } catch (e) {
              console.warn('Failed to parse list_saved_dataframes response', e);
              await waitForNextPoll();
              continue;
            }
          } catch (err) {
            console.warn('list_saved_dataframes request failed', err);
            await waitForNextPoll();
            continue;
          }

          if (!data) {
            await waitForNextPoll();
            continue;
          }

          if (data && data.environment) {
            const merged = { ...env, ...data.environment };
            if (contextsMatch(target, merged)) {
              env = merged;
              localStorage.setItem('env', JSON.stringify(env));
            } else {
              console.warn(
                `SavedDataFramesPanel list env mismatch expected ${formatContext(target)} but received ${formatContext(extractDisplayContext(merged))}`
              );
              await waitForNextPoll();
              continue;
            }
          }

          const effectivePrefix =
            (data?.prefix || resolvedPrefix || buildPrefixFromTarget(target)) ?? '';
          if (!cancelled) {
            setPrefix(effectivePrefix);
          }

          const filtered = Array.isArray(data?.files)
            ? data.files.filter((f: Frame) => {
                if (!f?.arrow_name) return false;
                if (!effectivePrefix) return true;
                return f.object_name?.startsWith(effectivePrefix);
              })
            : [];

          if (!cancelled) {
            setFiles(filtered);
            setOpenDirs({});
            setContextMenu(null);
            setRenameTarget(null);
          }

          console.log(
            `📁 SavedDataFramesPanel looking in MinIO folder "${effectivePrefix}" (expected ${formatContext(target)} resolved ${formatContext(extractDisplayContext(env))})`
          );

          return;
        }
      } catch (err) {
        console.error('Failed to load saved dataframes', err);
        if (!cancelled) {
          setFiles([]);
          setPrefix('');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, user]);

  const handleOpen = (obj: string) => {
    window.open(`/dataframe?name=${encodeURIComponent(obj)}`, '_blank');
  };

  const promptDeleteAll = () => setConfirmDelete({ type: 'all' });

  const promptDeleteOne = (obj: string) =>
    setConfirmDelete({ type: 'one', target: obj });

  const performDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'all') {
      await fetch(`${VALIDATE_API}/delete_all_dataframes`, { method: 'DELETE' });
      setFiles([]);
    } else {
      const obj = confirmDelete.target;
      await fetch(
        `${VALIDATE_API}/delete_dataframe?object_name=${encodeURIComponent(obj)}`,
        { method: 'DELETE' }
      );
      setFiles(prev => prev.filter(f => f.object_name !== obj));
    }
    setConfirmDelete(null);
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

  const handleContextMenu = (e: React.MouseEvent, frame: Frame) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: frame.object_name,
      frame: frame
    });
  };

  const handleContextMenuAction = (action: 'edit' | 'delete') => {
    if (!contextMenu) return;
    
    if (action === 'edit') {
      startRename(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    } else if (action === 'delete') {
      promptDeleteOne(contextMenu.target);
    }
    
    setContextMenu(null);
  };

  const buildTree = (frames: Frame[], pref: string): TreeNode[] => {
    const root: any = { children: {} };
    frames.forEach(f => {
      if (!f.arrow_name) return; // skip placeholder objects like directories
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
              onContextMenu={(e) => handleContextMenu(e, f)}
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
              onClick={() => promptDeleteOne(f.object_name)}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={promptDeleteAll}
            className="p-1 h-8 w-8"
            title="Delete all"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-700">
            <div className="w-20 h-20 rounded-full bg-white/60 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Loading your dataframes</h3>
            <p className="text-sm text-gray-500">Fetching the latest saved files…</p>
          </div>
        ) : (
          <>
            {tree.length === 0 && <p className="text-sm text-gray-600">No saved dataframes</p>}
            {tree.map(node => renderNode(node))}
          </>
        )}
      </div>
      <ConfirmationDialog
        open={!!confirmDelete}
        onOpenChange={open => {
          if (!open) setConfirmDelete(null);
        }}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
        title={
          confirmDelete?.type === 'all' ? 'Delete All DataFrames' : 'Delete DataFrame'
        }
        description={
          confirmDelete?.type === 'all'
            ? 'Delete all saved dataframes? This may impact existing projects.'
            : 'Are you sure you want to delete this dataframe? This may impact existing projects.'
        }
        icon={<Trash2 className="w-5 h-5 text-white" />}
        confirmLabel="Yes, Delete"
        iconBgClass="bg-red-500"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
      />
      
      {/* Context Menu - Using Portal */}
      {contextMenu && createPortal(
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            minWidth: '120px'
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            onClick={() => handleContextMenuAction('edit')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <Pencil className="w-4 h-4" />
            <span>Rename</span>
          </button>
          <button
            onClick={() => handleContextMenuAction('delete')}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SavedDataFramesPanel;
