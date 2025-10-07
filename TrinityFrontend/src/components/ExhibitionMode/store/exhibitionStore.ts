import { create } from 'zustand';
import { safeStringify } from '@/utils/safeStringify';
import {
  useLaboratoryStore,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import type {
  DroppedAtom as LaboratoryDroppedAtom,
  LayoutCard as LaboratoryLayoutCard,
} from '@/components/LaboratoryMode/store/laboratoryStore';

export type DroppedAtom = LaboratoryDroppedAtom;
export type LayoutCard = LaboratoryLayoutCard;

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  hasHydrated: boolean;
  loadSavedConfiguration: () => void;
  toggleCardExhibition: (cardId: string) => void;
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => void;
  setCards: (cards: LayoutCard[] | unknown) => void;
  reset: () => void;
}

const STORAGE_KEYS = {
  layout: 'laboratory-layout-cards',
  config: 'laboratory-config',
  project: 'current-project',
} as const;

type RawLayoutCard = Partial<LayoutCard> & Record<string, unknown>;
type RawDroppedAtom = Partial<DroppedAtom> & Record<string, unknown>;

const normalizeCards = (rawCards: unknown): LayoutCard[] | null => {
  if (!Array.isArray(rawCards)) {
    return null;
  }

  return rawCards
    .map((card, cardIndex) => {
      const candidate = card as RawLayoutCard;
      const atoms = Array.isArray(candidate.atoms)
        ? candidate.atoms
            .map((atom, atomIndex) => {
              const rawAtom = atom as RawDroppedAtom;
              const atomId = typeof rawAtom.atomId === 'string' ? rawAtom.atomId : '';
              if (!atomId) {
                return null;
              }

              const identifier =
                typeof rawAtom.id === 'string' && rawAtom.id
                  ? rawAtom.id
                  : `exhibition-atom-${cardIndex}-${atomIndex}`;

              return {
                ...rawAtom,
                id: identifier,
                atomId,
                title:
                  typeof rawAtom.title === 'string' && rawAtom.title
                    ? rawAtom.title
                    : atomId,
                category:
                  typeof rawAtom.category === 'string' && rawAtom.category
                    ? rawAtom.category
                    : 'Atom',
                color:
                  typeof rawAtom.color === 'string' && rawAtom.color
                    ? rawAtom.color
                    : 'bg-muted',
              } as DroppedAtom;
            })
            .filter((atom): atom is DroppedAtom => Boolean(atom))
        : [];

      const id =
        typeof candidate.id === 'string' && candidate.id
          ? candidate.id
          : `exhibition-card-${cardIndex}`;

      return {
        ...candidate,
        id,
        atoms,
        isExhibited: Boolean(candidate.isExhibited),
        moleculeId:
          typeof candidate.moleculeId === 'string'
            ? candidate.moleculeId
            : candidate.moleculeId != null
            ? String(candidate.moleculeId)
            : undefined,
        moleculeTitle:
          typeof candidate.moleculeTitle === 'string'
            ? candidate.moleculeTitle
            : candidate.moleculeTitle != null
            ? String(candidate.moleculeTitle)
            : undefined,
      } satisfies LayoutCard;
    })
    .filter(Boolean);
};

const tryGetLaboratoryCards = (): LayoutCard[] | null => {
  try {
    const cards = useLaboratoryStore.getState().cards;
    const normalized = normalizeCards(cards);
    if (normalized && normalized.length > 0) {
      return normalized;
    }
  } catch {
    /* ignore */
  }
  return null;
};

const selectPersistedCards = (): LayoutCard[] | null => {
  if (typeof window === 'undefined') {
    return tryGetLaboratoryCards();
  }

  const fromLabStore = tryGetLaboratoryCards();
  if (fromLabStore && fromLabStore.length > 0) {
    return fromLabStore;
  }

  const layoutCache = window.localStorage.getItem(STORAGE_KEYS.layout);
  if (layoutCache && layoutCache !== 'undefined') {
    try {
      const parsed = JSON.parse(layoutCache);
      const cards = normalizeCards(parsed);
      if (cards && cards.length > 0) {
        return cards;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEYS.layout);
    }
  }

  const labConfig = window.localStorage.getItem(STORAGE_KEYS.config);
  if (labConfig && labConfig !== 'undefined') {
    try {
      const parsed = JSON.parse(labConfig);
      const cards = normalizeCards((parsed && parsed.cards) || parsed);
      if (cards && cards.length > 0) {
        return cards;
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEYS.config);
    }
  }

  const currentProject = window.localStorage.getItem(STORAGE_KEYS.project);
  if (currentProject && currentProject !== 'undefined') {
    try {
      const parsed = JSON.parse(currentProject);
      const cards = normalizeCards(parsed?.state?.laboratory_config?.cards);
      if (cards && cards.length > 0) {
        return cards;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
};

let lastSignature = safeStringify({ cards: [] as LayoutCard[], exhibitedCards: [] as LayoutCard[] });

const updateStateIfChanged = (
  set: (state: Partial<ExhibitionStore>) => void,
  get: () => ExhibitionStore,
  cards: LayoutCard[],
  extraState: Partial<ExhibitionStore> = {},
) => {
  const exhibitedCards = cards.filter(card => card.isExhibited);
  const nextState = { cards, exhibitedCards };
  const nextSignature = safeStringify(nextState);

  if (nextSignature === lastSignature) {
    if (Object.keys(extraState).length > 0) {
      const current = get();
      const shouldUpdate = Object.entries(extraState).some(
        ([key, value]) => (current as Record<string, unknown>)[key] !== value,
      );
      if (shouldUpdate) {
        set(extraState);
      }
    }
    return false;
  }

  lastSignature = nextSignature;
  set({ ...nextState, ...extraState });
  return true;
};

export const useExhibitionStore = create<ExhibitionStore>((set, get) => ({
  cards: [],
  exhibitedCards: [],
  hasHydrated: false,

  loadSavedConfiguration: () => {
    const state = get();
    if (state.hasHydrated && state.cards.length > 0) {
      return;
    }

    const cards = selectPersistedCards();
    if (!cards || cards.length === 0) {
      if (!state.hasHydrated) {
        set({ hasHydrated: true });
      }
      return;
    }

    updateStateIfChanged(set, get, cards, { hasHydrated: true });
  },

  toggleCardExhibition: (cardId: string) => {
    const { cards } = get();
    const updatedCards = cards.map(card =>
      card.id === cardId ? { ...card, isExhibited: !card.isExhibited } : card,
    );

    updateStateIfChanged(set, get, updatedCards);
  },

  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => {
    const { cards } = get();
    let updatedCards = cards.map(card =>
      card.id === cardId ? { ...card, ...updatedCard } : card,
    );

    if (!updatedCards.find(card => card.id === cardId)) {
      updatedCards = [
        ...updatedCards,
        { id: cardId, atoms: [], isExhibited: false, ...updatedCard } as LayoutCard,
      ];
    }

    updateStateIfChanged(set, get, updatedCards);
  },

  setCards: (cards: LayoutCard[] | unknown) => {
    const normalizedCards = normalizeCards(cards) ?? [];
    updateStateIfChanged(set, get, normalizedCards, { hasHydrated: true });
  },

  reset: () => {
    lastSignature = safeStringify({ cards: [] as LayoutCard[], exhibitedCards: [] as LayoutCard[] });
    set({ cards: [], exhibitedCards: [], hasHydrated: false });
  },
}));
