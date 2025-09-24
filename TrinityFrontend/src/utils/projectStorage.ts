import { safeStringify } from './safeStringify';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { VALIDATE_API } from '@/lib/api';

const HEAVY_CACHE_KEYS = [
  'laboratory-config',
  'laboratory-layout-cards',
  'workflow-canvas-molecules',
  'workflow-selected-atoms',
  'column-classifier-config',
] as const;

function isQuotaExceededError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const { name, code } = error as { name?: unknown; code?: unknown };

  if (
    typeof name === 'string' &&
    (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED')
  ) {
    return true;
  }

  if (typeof code === 'number' && (code === 22 || code === 1014)) {
    return true;
  }

  return false;
}

function clearHeavyCacheEntries(additionalKeys: string[] = []): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const keysToClear = Array.from(new Set([...HEAVY_CACHE_KEYS, ...additionalKeys]));

  keysToClear.forEach(key => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
}

function stripCards(cards: any[]): any[] {
  return cards.map(card => ({
    ...card,
    atoms: card.atoms.map((atom: any) => {
      const info = allAtoms.find(a => a.id === atom.atomId);
      if (atom.type === 'dataframe-operations' && atom.settings) {
        const { tableData, data, ...rest } = atom.settings;
        return {
          ...atom,
          settings: rest,
          color: atom.color || info?.color || 'bg-gray-400',
        };
      }

      if (atom.atomId === 'chart-maker' && atom.settings) {
        const { charts = [], ...restSettings } = atom.settings;
        const sanitizedCharts = Array.isArray(charts)
          ? charts.map((chart: any) => {
              const { chartLoading, filteredData, lastUpdateTime, ...chartRest } = chart;
              return chartRest;
            })
          : charts;
        return {
          ...atom,
          settings: { ...restSettings, charts: sanitizedCharts },
          color: atom.color || info?.color || 'bg-gray-400',
        };
      }

      if (atom.atomId === 'data-upload-validate' && atom.settings) {
        const {
          uploadedFiles = [],
          fileMappings = {},
          filePathMap = {},
          fileSizeMap = {},
          fileKeyMap = {},
          validations,
          columnConfig,
          ...restSettings
        } = atom.settings;
        const saved = uploadedFiles.filter(name => {
          const p = filePathMap[name];
          return !p || !p.includes('/tmp/');
        });
        const filterMap = (map: Record<string, any>) =>
          Object.fromEntries(
            Object.entries(map).filter(([n]) => saved.includes(n))
          );
        return {
          ...atom,
          settings: {
            ...restSettings,
            uploadedFiles: saved,
            fileMappings: filterMap(fileMappings),
            filePathMap: filterMap(filePathMap),
            fileSizeMap: filterMap(fileSizeMap),
            fileKeyMap: filterMap(fileKeyMap),
          },
          color: atom.color || info?.color || 'bg-gray-400',
        };
      }

      return { ...atom, color: atom.color || info?.color || 'bg-gray-400' };
    }),
  }));
}

export function sanitizeLabConfig(config: any): any {
  const clone = JSON.parse(JSON.stringify(config || {}));
  if (Array.isArray(clone.cards)) {
    clone.cards = stripCards(clone.cards);
  }
  return clone;
}

// Remove large in-memory data before persisting project to localStorage
export function serializeProject(project: any): string {
  const clone = JSON.parse(JSON.stringify(project));
  const cards = clone?.state?.laboratory_config?.cards;
  if (Array.isArray(cards)) {
    clone.state.laboratory_config.cards = stripCards(cards);
  }
  return safeStringify(clone);
}

export { stripCards as sanitizeCards };

// Safely persist the current project to localStorage. If the storage
// quota is exceeded we clear large cached entries and retry once.
export function saveCurrentProject(project: any): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  const serialized = serializeProject(project);
  const setProject = () => localStorage.setItem('current-project', serialized);

  try {
    setProject();
  } catch (error: unknown) {
    if (isQuotaExceededError(error)) {
      clearHeavyCacheEntries();
      try {
        setProject();
      } catch (retryError) {
        console.warn('Unable to save current project to localStorage:', retryError);
      }
    } else {
      throw error;
    }
  }
}

export function persistLaboratoryConfig(config: any): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }

  const serializedConfig = safeStringify(config);
  const serializedCards = safeStringify(config?.cards ?? []);

  const setEntries = () => {
    localStorage.setItem('laboratory-config', serializedConfig);
    try {
      localStorage.setItem('laboratory-layout-cards', serializedCards);
    } catch (error) {
      localStorage.removeItem('laboratory-config');
      throw error;
    }
  };

  try {
    setEntries();
    return true;
  } catch (error: unknown) {
    if (isQuotaExceededError(error)) {
      clearHeavyCacheEntries();
      try {
        setEntries();
        return true;
      } catch (retryError) {
        console.warn('Unable to cache laboratory configuration in localStorage:', retryError);
        localStorage.removeItem('laboratory-config');
        localStorage.removeItem('laboratory-layout-cards');
        return false;
      }
    }

    throw error;
  }
}

// Clear all cached project-specific state from localStorage
export function clearProjectState(): void {
  const envStr = localStorage.getItem('env');
  if (envStr) {
    try {
      const env = JSON.parse(envStr);
      const params = new URLSearchParams({
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      void fetch(`${VALIDATE_API}/temp-uploads?${params.toString()}`, {
        method: 'DELETE',
        credentials: 'include'
      });
    } catch {
      /* ignore */
    }
  }

  [
    'current-project',
    'laboratory-config',
    'laboratory-layout-cards',
    'workflow-canvas-molecules',
    'workflow-selected-atoms',
    'column-classifier-config',
  ].forEach(key => localStorage.removeItem(key));

  // Reset in-memory stores so previously loaded atoms don't bleed into new projects
  useExhibitionStore.getState().reset();
  useLaboratoryStore.getState().reset();
}
