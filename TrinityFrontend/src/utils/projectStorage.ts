import { safeStringify } from './safeStringify';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { useLaboratoryStore, LaboratorySubMode } from '@/components/LaboratoryMode/store/laboratoryStore';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { VALIDATE_API } from '@/lib/api';

const HEAVY_CACHE_KEYS = [
  'laboratory-config', // Legacy key for backward compatibility
  'laboratory-layout-cards', // Legacy key for backward compatibility
  'laboratory-analytics-config',
  'laboratory-analytics-layout-cards',
  'laboratory-dashboard-config',
  'laboratory-dashboard-layout-cards',
  'workflow-canvas-molecules',
  'workflow-selected-atoms', // Legacy - kept for migration
  'workflow-molecules', // Legacy - kept for migration
  'workflow-data', // Legacy - kept for migration
  'workflow-molecules-analytics',
  'workflow-molecules-dashboard',
  'workflow-selected-atoms-analytics',
  'workflow-selected-atoms-dashboard',
  'workflow-data-analytics',
  'workflow-data-dashboard',
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
      // Handle dataframe-operations atoms - strip large data but preserve pivotResults
      // Check both atom.type and atom.atomId for compatibility
      if ((atom.type === 'dataframe-operations' || atom.atomId === 'dataframe-operations') && atom.settings) {
        const { tableData, data, ...rest } = atom.settings;
        // Note: pivotResults is preserved in 'rest' - it's part of pivotSettings
        // pivotResults can be large but is needed for session restoration
        // If it becomes too large, we can reload from backend cache (see DataFrameOperationsCanvas)
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

      if (atom.atomId === 'data-validate' && atom.settings) {
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

// Helper functions for mode-specific localStorage keys
export function getWorkflowMoleculesKey(subMode: LaboratorySubMode): string {
  return subMode === 'analytics' 
    ? 'workflow-molecules-analytics' 
    : 'workflow-molecules-dashboard';
}

export function getWorkflowSelectedAtomsKey(subMode: LaboratorySubMode): string {
  return subMode === 'analytics'
    ? 'workflow-selected-atoms-analytics'
    : 'workflow-selected-atoms-dashboard';
}

export function getWorkflowDataKey(subMode: LaboratorySubMode): string {
  return subMode === 'analytics'
    ? 'workflow-data-analytics'
    : 'workflow-data-dashboard';
}

export function persistLaboratoryConfig(config: any, subMode: LaboratorySubMode = 'analytics'): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }

  const serializedConfig = safeStringify(config);
  const serializedCards = safeStringify(config?.cards ?? []);

  // Use mode-specific keys
  const configKey = subMode === 'analytics' ? 'laboratory-analytics-config' : 'laboratory-dashboard-config';
  const cardsKey = subMode === 'analytics' ? 'laboratory-analytics-layout-cards' : 'laboratory-dashboard-layout-cards';

  const setEntries = () => {
    localStorage.setItem(configKey, serializedConfig);
    try {
      localStorage.setItem(cardsKey, serializedCards);
    } catch (error) {
      localStorage.removeItem(configKey);
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
        localStorage.removeItem(configKey);
        localStorage.removeItem(cardsKey);
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
    'laboratory-config', // Legacy key
    'laboratory-layout-cards', // Legacy key
    'laboratory-analytics-config',
    'laboratory-analytics-layout-cards',
    'laboratory-dashboard-config',
    'laboratory-dashboard-layout-cards',
    'workflow-canvas-molecules',
    'workflow-selected-atoms',
    'column-classifier-config',
  ].forEach(key => localStorage.removeItem(key));

  // Reset in-memory stores so previously loaded atoms don't bleed into new projects
  useExhibitionStore.getState().reset();
  useLaboratoryStore.getState().reset();
}
