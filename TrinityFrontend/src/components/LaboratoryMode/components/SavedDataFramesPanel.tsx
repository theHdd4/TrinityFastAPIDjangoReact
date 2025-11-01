import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, ChevronRight, ChevronDown, ChevronUp, Trash2, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API, SESSION_API, CLASSIFIER_API } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Plus } from 'lucide-react';
import ColumnClassifierDimensionMapping from '@/components/AtomList/atoms/column-classifier/components/ColumnClassifierDimensionMapping';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
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
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [classifyLoading, setClassifyLoading] = useState<Record<string, boolean>>({});
  const [classifyError, setClassifyError] = useState<Record<string, string>>({});
  const [classifyData, setClassifyData] = useState<Record<string, {
    identifiers: string[];
    measures: string[];
    unclassified: string[];
  }>>({});
  const [columnsByObject, setColumnsByObject] = useState<Record<string, { name: string; category: 'identifiers' | 'measures' | 'unclassified' }[]>>({});
  const [dimensionsByObject, setDimensionsByObject] = useState<Record<string, Record<string, string[]>>>({});
  const [savingByObject, setSavingByObject] = useState<Record<string, boolean>>({});
  const [saveErrorByObject, setSaveErrorByObject] = useState<Record<string, string>>({});
  const [dimensionOptionsByObject, setDimensionOptionsByObject] = useState<Record<string, string[]>>({});
  const [dimensionSelectedByObject, setDimensionSelectedByObject] = useState<Record<string, string[]>>({});
  const [showAddDimInputByObject, setShowAddDimInputByObject] = useState<Record<string, boolean>>({});
  const [newDimInputByObject, setNewDimInputByObject] = useState<Record<string, string>>({});
  const [showDimensionTableByObject, setShowDimensionTableByObject] = useState<Record<string, boolean>>({});
  const [columnDimensionByObject, setColumnDimensionByObject] = useState<Record<string, Record<string, string>>>({});
  const [businessOpenByObject, setBusinessOpenByObject] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const getDimensionTextClass = (dimensionName: string, orderedDims: string[]): string => {
    if (dimensionName === 'unattributed') return 'text-gray-600';
    const palette = [
      'text-purple-600',
      'text-orange-600',
      'text-pink-600',
      'text-cyan-600',
      'text-indigo-600',
      'text-teal-600',
      'text-rose-600',
      'text-amber-600',
      'text-lime-600',
      'text-fuchsia-600',
    ];
    const idx = Math.max(0, orderedDims.indexOf(dimensionName));
    return palette[idx % palette.length];
  };

  const syncColumnsWithConfig = (
    objectName: string,
    base: { identifiers: string[]; measures: string[]; unclassified: string[] },
    cfg?: { identifiers?: string[]; measures?: string[] }
  ) => {
    const idSet = new Set<string>(cfg?.identifiers || base.identifiers || []);
    const msSet = new Set<string>(cfg?.measures || base.measures || []);
    const all = Array.from(new Set<string>([...base.identifiers, ...base.measures, ...base.unclassified]));
    const merged = all.map(name => {
      const category: 'identifiers' | 'measures' | 'unclassified' = idSet.has(name)
        ? 'identifiers'
        : msSet.has(name)
        ? 'measures'
        : 'unclassified';
      return { name, category };
    });
    setColumnsByObject(prev => ({ ...prev, [objectName]: merged }));
  };

  const runClassification = async (objectName: string): Promise<{ identifiers: string[]; measures: string[]; unclassified: string[] } | null> => {
    setClassifyError(prev => ({ ...prev, [objectName]: '' }));
    setClassifyLoading(prev => ({ ...prev, [objectName]: true }));
    try {
      const form = new FormData();
      form.append('dataframe', objectName);
      form.append('identifiers', '[]');
      form.append('measures', '[]');
      form.append('unclassified', '[]');
      form.append('bypass_cache', 'true');
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.detail) || 'Failed to classify');
      }
      const fc = data?.final_classification || {};
      setClassifyData(prev => ({
        ...prev,
        [objectName]: {
          identifiers: Array.isArray(fc.identifiers) ? fc.identifiers : [],
          measures: Array.isArray(fc.measures) ? fc.measures : [],
          unclassified: Array.isArray(fc.unclassified) ? fc.unclassified : []
        }
      }));
      // Prefill per-column table using classification (may be overridden by saved config loaded separately)
      syncColumnsWithConfig(objectName, {
        identifiers: Array.isArray(fc.identifiers) ? fc.identifiers : [],
        measures: Array.isArray(fc.measures) ? fc.measures : [],
        unclassified: Array.isArray(fc.unclassified) ? fc.unclassified : []
      });
      // Initialize dimension options and defaults
      setDimensionOptionsByObject(prev => ({
        ...prev,
        [objectName]: Array.from(new Set(['unattributed', 'market', 'product', ...((prev[objectName] || []))]))
      }));
      setDimensionSelectedByObject(prev => ({
        ...prev,
        [objectName]: (prev[objectName] || []).filter(d => d !== 'unattributed').slice(0, 10)
      }));
      // Default identifier columns to 'unattributed' in mapping table
      setColumnDimensionByObject(prev => ({
        ...prev,
        [objectName]: Object.fromEntries(
          ((fc.identifiers || []) as string[]).map((c: string) => [c, 'unattributed'])
        )
      }));
      return {
        identifiers: Array.isArray(fc.identifiers) ? fc.identifiers : [],
        measures: Array.isArray(fc.measures) ? fc.measures : [],
        unclassified: Array.isArray(fc.unclassified) ? fc.unclassified : []
      };
    } catch (e: any) {
      setClassifyError(prev => ({ ...prev, [objectName]: e.message || 'Failed to classify' }));
      return null;
    } finally {
      setClassifyLoading(prev => ({ ...prev, [objectName]: false }));
    }
  };

  const loadSavedMapping = async (objectName: string, base?: { identifiers: string[]; measures: string[]; unclassified: string[] }) => {
    try {
      const { mapping, config } = await fetchDimensionMapping({ objectName });
      if (mapping) {
        setDimensionsByObject(prev => ({ ...prev, [objectName]: mapping }));
        const keys = Object.keys(mapping);
        setDimensionOptionsByObject(prev => ({ ...prev, [objectName]: Array.from(new Set(['unattributed', 'market', 'product', ...keys])) }));
        setDimensionSelectedByObject(prev => ({ ...prev, [objectName]: keys.filter(k => k !== 'unattributed') }));
        // Invert mapping to column->dimension for the table
        const colToDim: Record<string, string> = {};
        Object.entries(mapping).forEach(([dim, cols]) => {
          (cols || []).forEach((col: string) => { colToDim[col] = dim; });
        });
        // Ensure all known identifier columns set
        const allCols = (columnsByObject[objectName] || [])
          .filter(c => c.category === 'identifiers')
          .map(c => c.name);
        allCols.forEach(c => { if (!colToDim[c]) colToDim[c] = 'unattributed'; });
        setColumnDimensionByObject(prev => ({ ...prev, [objectName]: colToDim }));
        setShowDimensionTableByObject(prev => ({ ...prev, [objectName]: true }));
        // If a mapping exists, default the Business Dimensions section to minimized
        setBusinessOpenByObject(prev => ({ ...prev, [objectName]: false }));
      }
      if (config) {
        const baseSet = base || classifyData[objectName] || { identifiers: [], measures: [], unclassified: [] };
        syncColumnsWithConfig(objectName, baseSet as any, {
          identifiers: Array.isArray(config.identifiers) ? config.identifiers : [],
          measures: Array.isArray(config.measures) ? config.measures : []
        });
        // If a saved config exists, minimize the Business Dimensions section by default
        setBusinessOpenByObject(prev => ({ ...prev, [objectName]: false }));
      }
    } catch (err) {
      // ignore if none
    }
  };

  const onToggleExpand = async (objName: string) => {
    setExpandedRows(prev => (prev[objName] ? {} : { [objName]: true }));
    // Ensure default dimension options and selection are present immediately
    setDimensionOptionsByObject(prev => ({
      ...prev,
      [objName]: Array.from(new Set(['unattributed', 'market', 'product', ...((prev[objName] || []))]))
    }));
    setDimensionSelectedByObject(prev => ({
      ...prev,
      [objName]: prev[objName] && prev[objName].length ? prev[objName] : []
    }));
    // Kick off classification and saved mapping load
    let base: { identifiers: string[]; measures: string[]; unclassified: string[] } | null = null;
    if (!classifyData[objName]) {
      base = await runClassification(objName);
    } else {
      base = classifyData[objName];
    }
    await loadSavedMapping(objName, base || undefined);
    setBusinessOpenByObject(prev => ({ ...prev, [objName]: true }));
  };

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
    
    // Remove the prefix (client/app/project) from the object path
    // and preserve only the folder structure after the prefix
    const relativePath = obj.startsWith(prefix) ? obj.substring(prefix.length) : obj;
    const lastSlashIndex = relativePath.lastIndexOf('/');
    const folderPath = lastSlashIndex !== -1 ? relativePath.substring(0, lastSlashIndex + 1) : '';
    const newFilePath = folderPath + filename;
    
    const form = new FormData();
    form.append('object_name', obj);
    form.append('new_filename', newFilePath);
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

  const handleContextMenuAction = (action: 'edit' | 'delete' | 'classify') => {
    if (!contextMenu) return;
    
    if (action === 'edit') {
      startRename(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    } else if (action === 'delete') {
      promptDeleteOne(contextMenu.target);
    } else if (action === 'classify') {
      void onToggleExpand(contextMenu.target);
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
        <>
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
            <button
              type="button"
              title="For Classificaition"
              onClick={() => onToggleExpand(f.object_name)}
              className="p-0"
            >
              {expandedRows[f.object_name] ? (
                <ChevronUp className="w-4 h-4 text-gray-400 cursor-pointer" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 cursor-pointer" />
              )}
            </button>
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
        {expandedRows[f.object_name] && (
          <div
            style={{ marginLeft: level * 12 }}
            className="border rounded p-2 bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">(1/3) Column Classifier</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!!classifyLoading[f.object_name]}
                  onClick={() => runClassification(f.object_name)}
                >
                  {classifyLoading[f.object_name] ? 'Refresh' : 'Reclassify'}
                </Button>
              </div>
            </div>
            {classifyError[f.object_name] && (
              <div className="text-red-500 text-xs mt-2">{classifyError[f.object_name]}</div>
            )}
            {saveErrorByObject[f.object_name] && (
              <div className="text-red-500 text-xs mt-2">{saveErrorByObject[f.object_name]}</div>
            )}

            {/* Columns table */}
            {columnsByObject[f.object_name]?.length ? (
              <div className="mt-2">
                <div className="grid grid-cols-2 text-[11px] font-semibold text-gray-600 px-1 py-1">
                  <div>Column</div>
                  <div>Classification</div>
                </div>
                <div className="max-h-48 overflow-auto border rounded bg-white">
                  {columnsByObject[f.object_name]
                    .slice()
                    .sort((a, b) => {
                      const rank = { identifiers: 0, measures: 1, unclassified: 2 } as const;
                      return rank[a.category] - rank[b.category];
                    })
                    .map(col => (
                    <div key={col.name} className="grid grid-cols-2 items-center px-2 py-1 text-xs border-b last:border-b-0">
                      <div
                        className={`truncate pr-2 ${col.category === 'identifiers' ? 'text-blue-600' : col.category === 'measures' ? 'text-green-600' : 'text-yellow-600'}`}
                        title={col.name}
                      >
                        {col.name}
                      </div>
                      <div>
                        <Select
                          value={col.category}
                          onValueChange={(val: any) => {
                            setColumnsByObject(prev => ({
                              ...prev,
                              [f.object_name]: (prev[f.object_name] || []).map(c => c.name === col.name ? { ...c, category: val } : c)
                            }));
                          }}
                        >
                          <SelectTrigger className="h-7 py-0 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="identifiers">Identifiers</SelectItem>
                            <SelectItem value="measures">Measures</SelectItem>
                            <SelectItem value="unclassified">Unclassified</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Business Dimensions (compact) */}
            <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-gray-700">(2/3) Business Dimensions</div>
                <button
                  type="button"
                    className="text-[11px] text-gray-600 hover:underline"
                  onClick={() => setBusinessOpenByObject(prev => ({ ...prev, [f.object_name]: !prev[f.object_name] }))}
                >
                  {businessOpenByObject[f.object_name] ? 'Hide' : 'Show'}
                </button>
              </div>
              {/* Creation UI (compact, mirrors settings tab behavior) */}
              {businessOpenByObject[f.object_name] && (
              <div className="border rounded bg-white p-1">
                <div className="mb-1">
                  <Label className="text-[10px]">Select dimensions</Label>
                </div>
                <div className="space-y-1">
                  <div className="text-xs leading-tight">
                    <label className="flex items-center gap-1 cursor-not-allowed opacity-70 select-none">
                      <input type="checkbox" checked readOnly className="h-3 w-3 accent-black" />
                      <span className="text-xs">Unattributed</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {(dimensionOptionsByObject[f.object_name] || ['unattributed','market','product'])
                      .filter(d => d !== 'unattributed')
                      .map(dim => {
                        const checked = (dimensionSelectedByObject[f.object_name] || []).includes(dim);
                        return (
                          <label
                            key={dim}
                            className="flex items-center gap-1 text-xs leading-tight cursor-pointer select-none"
                            title={dim}
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 accent-black"
                              checked={checked}
                              onChange={() => {
                                setDimensionSelectedByObject(prev => {
                                  const cur = prev[f.object_name] || [];
                                  const next = cur.includes(dim) ? cur.filter(d => d !== dim) : [...cur, dim];
                                  return { ...prev, [f.object_name]: next.slice(0, 10) };
                                });
                              }}
                            />
                            <span className="truncate max-w-[8rem] text-ellipsis whitespace-nowrap text-xs">{dim}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {((dimensionOptionsByObject[f.object_name] || []).length < 11) && !showAddDimInputByObject[f.object_name] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddDimInputByObject(prev => ({ ...prev, [f.object_name]: true }))}
                        className="flex items-center h-6 px-1 text-[10px]"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Dimension
                      </Button>
                    )}
                    {showAddDimInputByObject[f.object_name] && (
                      <div className="flex items-center gap-2 p-1">
                        <Input
                          value={newDimInputByObject[f.object_name] || ''}
                          onChange={e => setNewDimInputByObject(prev => ({ ...prev, [f.object_name]: e.target.value }))}
                          placeholder=""
                          className="h-6 text-[10px]"
                        />
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            const raw = (newDimInputByObject[f.object_name] || '').trim().toLowerCase();
                            if (!raw) { setShowAddDimInputByObject(prev => ({ ...prev, [f.object_name]: false })); return; }
                            setDimensionOptionsByObject(prev => {
                              const cur = prev[f.object_name] || ['unattributed','market','product'];
                              if (cur.includes(raw)) return prev;
                              return { ...prev, [f.object_name]: [...cur, raw] };
                            });
                            setDimensionSelectedByObject(prev => {
                              const cur = prev[f.object_name] || [];
                              if (cur.includes(raw)) return prev;
                              return { ...prev, [f.object_name]: [...cur, raw].slice(0, 10) };
                            });
                            setNewDimInputByObject(prev => ({ ...prev, [f.object_name]: '' }));
                            setShowAddDimInputByObject(prev => ({ ...prev, [f.object_name]: false }));
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={(dimensionSelectedByObject[f.object_name] || []).length === 0}
                      onClick={() => {
                        const dims = ['unattributed', ...((dimensionSelectedByObject[f.object_name] || []).slice(0,10))];
                        const cols = (columnsByObject[f.object_name] || []).filter(c => c.category==='identifiers');
                        // Initialize mapping: all to unattributed by default
                        const nextMap: Record<string, string[]> = dims.reduce((acc, d) => ({ ...acc, [d]: [] }), {} as Record<string,string[]>);
                        cols.forEach(c => { nextMap['unattributed'].push(c.name); });
                        setDimensionsByObject(prev => ({ ...prev, [f.object_name]: nextMap }));
                        setColumnDimensionByObject(prev => ({
                          ...prev,
                          [f.object_name]: Object.fromEntries(cols.map(c => [c.name, 'unattributed']))
                        }));
                        setShowDimensionTableByObject(prev => ({ ...prev, [f.object_name]: true }));
                        // Minimize after saving dimensions
                        setBusinessOpenByObject(prev => ({ ...prev, [f.object_name]: false }));
                      }}
                    >
                      Save Dimensions
                    </Button>
                  </div>
                </div>
              </div>
              )}

              {/* Dimension mapping table (tabular) */}
              {showDimensionTableByObject[f.object_name] && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-700 mb-1">(3/3) Assign Columns to Dimensions</div>
                  <div className="grid grid-cols-2 text-[11px] font-semibold text-gray-600 px-1 py-1">
                    <div>Column</div>
                    <div>Dimension</div>
                  </div>
                  <div className="max-h-48 overflow-auto border rounded bg-white">
                    {(columnsByObject[f.object_name] || []).filter(c => c.category==='identifiers').map(col => (
                      <div key={`map-${col.name}`} className="grid grid-cols-2 items-center px-2 py-1 text-xs border-b last:border-b-0">
                        <div
                          className={`truncate pr-2 ${getDimensionTextClass((columnDimensionByObject[f.object_name] || {})[col.name] || 'unattributed', (dimensionSelectedByObject[f.object_name] || []))}`}
                          title={col.name}
                        >
                          {col.name}
                        </div>
                        <div>
                          <Select
                            value={(columnDimensionByObject[f.object_name] || {})[col.name] || 'unattributed'}
                            onValueChange={(val: string) => {
                              setColumnDimensionByObject(prev => ({
                                ...prev,
                                [f.object_name]: { ...(prev[f.object_name] || {}), [col.name]: val }
                              }));
                              setDimensionsByObject(prev => {
                                const cur = { ...(prev[f.object_name] || {}) } as Record<string,string[]>;
                                const allDims = ['unattributed', ...((dimensionSelectedByObject[f.object_name] || []))];
                                // Remove from every dim first
                                allDims.forEach(d => { if (cur[d]) cur[d] = cur[d].filter(cn => cn !== col.name); });
                                if (!cur[val]) cur[val] = [];
                                cur[val].push(col.name);
                                return { ...prev, [f.object_name]: cur };
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 py-0 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['unattributed', ...((dimensionSelectedByObject[f.object_name] || []))].map(d => (
                                <SelectItem key={`opt-${d}`} value={d}>{d}</SelectItem>
                              )))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="default"
                      className="h-7 w-full"
                      disabled={!!savingByObject[f.object_name] || !columnsByObject[f.object_name]?.length}
                      onClick={async () => {
                        setSaveErrorByObject(prev => ({ ...prev, [f.object_name]: '' }));
                        setSavingByObject(prev => ({ ...prev, [f.object_name]: true }));
                        try {
                          const cols = columnsByObject[f.object_name] || [];
                          const identifiers = cols.filter(c => c.category==='identifiers').map(c => c.name);
                          const measures = cols.filter(c => c.category==='measures').map(c => c.name);
                          const stored = localStorage.getItem('current-project');
                          const envStr = localStorage.getItem('env');
                          const project = stored ? JSON.parse(stored) : {};
                          const env = envStr ? JSON.parse(envStr) : {};
                          const payload: any = {
                            project_id: project.id || null,
                            client_name: env.CLIENT_NAME || '',
                            app_name: env.APP_NAME || '',
                            project_name: env.PROJECT_NAME || '',
                            identifiers,
                            measures,
                            dimensions: dimensionsByObject[f.object_name] || {},
                            file_name: f.object_name
                          };
                          const res = await fetch(`${CLASSIFIER_API}/save_config`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            credentials: 'include'
                          });
                          if (!res.ok) {
                            const txt = await res.text().catch(()=> '');
                            throw new Error(txt || 'Save failed');
                          }
                          toast({ title: 'Configuration Saved Successfully' });
                        } catch (err: any) {
                          setSaveErrorByObject(prev => ({ ...prev, [f.object_name]: err.message || 'Save failed' }));
                        } finally {
                          setSavingByObject(prev => ({ ...prev, [f.object_name]: false }));
                        }
                      }}
                    >
                      {savingByObject[f.object_name] ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </>
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
            onClick={() => handleContextMenuAction('classify')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <ChevronDown className="w-4 h-4" />
            <span>Classification</span>
          </button>
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
