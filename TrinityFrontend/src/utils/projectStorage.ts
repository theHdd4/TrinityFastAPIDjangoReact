import { safeStringify } from './safeStringify';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { atoms as allAtoms } from '@/components/AtomList/data';

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
  const serialized = serializeProject(project);
  try {
    localStorage.setItem('current-project', serialized);
  } catch (e: unknown) {
    if (
      e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
    ) {
      // Remove heavy cached items to free space and retry
      [
        'laboratory-config',
        'laboratory-layout-cards',
        'workflow-canvas-molecules',
        'workflow-selected-atoms',
      ].forEach(key => localStorage.removeItem(key));
      try {
        localStorage.setItem('current-project', serialized);
      } catch (err) {
        console.warn('Unable to save current project to localStorage:', err);
      }
    } else {
      throw e;
    }
  }
}

// Clear all cached project-specific state from localStorage
export function clearProjectState(): void {
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
