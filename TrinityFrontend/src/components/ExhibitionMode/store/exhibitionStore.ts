
import { create } from 'zustand';
import { fetchExhibitionConfiguration, ExhibitionFeatureOverviewPayload } from '@/lib/exhibition';
import { getActiveProjectContext } from '@/utils/projectEnv';

export type CardColor = 'default' | 'blue' | 'purple' | 'green' | 'orange';
export type CardWidth = 'M' | 'L';
export type ContentAlignment = 'top' | 'center' | 'bottom';
export type CardLayout = 'blank' | 'horizontal-split' | 'vertical-split' | 'content-right' | 'full';

export interface PresentationSettings {
  cardColor: CardColor;
  cardWidth: CardWidth;
  contentAlignment: ContentAlignment;
  fullBleed: boolean;
  cardLayout: CardLayout;
}

export interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
  metadata?: Record<string, any>;
}

export interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  catalogueAtoms?: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
  presentationSettings?: PresentationSettings;
  exhibitionControlEnabled?: boolean;
}

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  loadSavedConfiguration: () => Promise<void>;
  toggleCardExhibition: (cardId: string) => void;
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => void;
  addBlankSlide: (afterSlideIndex?: number) => LayoutCard | null;
  setCards: (cards: LayoutCard[] | unknown) => void;
  reset: () => void;
}

const FALLBACK_COLOR = 'bg-gray-400';

const dedupeAtoms = (atoms: DroppedAtom[]): DroppedAtom[] => {
  const seen = new Set<string>();
  const result: DroppedAtom[] = [];

  atoms.forEach(atom => {
    const key = atom.id ?? atom.atomId;
    if (!key) {
      return;
    }
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(atom);
  });

  return result;
};

const mergeCatalogueAtoms = (
  base: DroppedAtom[] | undefined,
  additions: DroppedAtom[] | undefined = [],
): DroppedAtom[] => {
  const start = Array.isArray(base) ? base : [];
  const extra = Array.isArray(additions) ? additions : [];
  return dedupeAtoms([...start, ...extra]);
};

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  cardColor: 'default',
  cardWidth: 'L',
  contentAlignment: 'top',
  fullBleed: false,
  cardLayout: 'content-right',
};

const withPresentationDefaults = (card: LayoutCard): LayoutCard => {
  const slideAtoms = Array.isArray(card.atoms) ? card.atoms : [];
  const catalogueAtoms = mergeCatalogueAtoms(card.catalogueAtoms, slideAtoms);

  return {
    ...card,
    atoms: slideAtoms,
    catalogueAtoms,
    exhibitionControlEnabled: card.exhibitionControlEnabled ?? false,
    presentationSettings: {
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...card.presentationSettings,
    },
  };
};

const normalizeAtom = (atom: any): DroppedAtom | null => {
  if (!atom) {
    return null;
  }

  const id = atom.id ?? atom.atomId;
  if (!id) {
    return null;
  }

  return {
    id: String(id),
    atomId: String(atom.atomId ?? atom.id ?? ''),
    title: typeof atom.title === 'string' && atom.title.trim().length > 0 ? atom.title : 'Untitled Atom',
    category:
      typeof atom.category === 'string' && atom.category.trim().length > 0
        ? atom.category
        : 'General',
    color: typeof atom.color === 'string' && atom.color.trim().length > 0 ? atom.color : FALLBACK_COLOR,
    metadata: typeof atom.metadata === 'object' && atom.metadata !== null ? atom.metadata : undefined,
  };
};

const normalizeCard = (card: any): LayoutCard | null => {
  if (!card) {
    return null;
  }

  const identifier = card.id ?? card.moleculeId ?? card.moleculeTitle;
  if (!identifier) {
    return null;
  }

  const atoms = Array.isArray(card.atoms)
    ? (card.atoms.map(normalizeAtom).filter(Boolean) as DroppedAtom[])
    : [];
  const catalogueAtoms = Array.isArray(card.catalogueAtoms)
    ? (card.catalogueAtoms.map(normalizeAtom).filter(Boolean) as DroppedAtom[])
    : undefined;

  const normalized: LayoutCard = {
    id: String(identifier),
    atoms,
    catalogueAtoms,
    isExhibited: Boolean(card.isExhibited),
    moleculeId: card.moleculeId ? String(card.moleculeId) : undefined,
    moleculeTitle: typeof card.moleculeTitle === 'string' ? card.moleculeTitle : undefined,
    presentationSettings: card.presentationSettings && typeof card.presentationSettings === 'object'
      ? {
          ...DEFAULT_PRESENTATION_SETTINGS,
          ...card.presentationSettings,
        }
      : undefined,
    exhibitionControlEnabled: 'exhibitionControlEnabled' in card
      ? Boolean(card.exhibitionControlEnabled)
      : false,
  };

  return withPresentationDefaults(normalized);
};

const extractCards = (raw: unknown): LayoutCard[] => {
  if (Array.isArray(raw)) {
    return raw.map(normalizeCard).filter(Boolean) as LayoutCard[];
  }

  if (raw && typeof raw === 'object' && Array.isArray((raw as any).cards)) {
    return ((raw as any).cards as unknown[]).map(normalizeCard).filter(Boolean) as LayoutCard[];
  }

  return [];
};

const parseStoredCards = (value: string | null): LayoutCard[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return extractCards(parsed);
  } catch (error) {
    console.warn('Failed to parse stored exhibition cards', error);
    return [];
  }
};

const loadCardsFromStorage = (): LayoutCard[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const configCards = parseStoredCards(window.localStorage.getItem('laboratory-config'));
  if (configCards.length > 0) {
    return configCards;
  }

  return parseStoredCards(window.localStorage.getItem('laboratory-layout-cards'));
};

const SKU_ATOM_ID = 'feature-overview-sku';

const applyFeatureOverviewSelections = (
  cards: LayoutCard[],
  selections?: ExhibitionFeatureOverviewPayload[]
): LayoutCard[] => {
  if (!Array.isArray(selections) || selections.length === 0) {
    return cards;
  }

  const lookup = new Map<string, ExhibitionFeatureOverviewPayload>();
  selections.forEach(entry => {
    if (entry.cardId) {
      lookup.set(entry.cardId, entry);
    }
  });

  if (lookup.size === 0) {
    return cards;
  }

  return cards.map(card => {
    const config = lookup.get(card.id);
    if (!config) {
      return card;
    }

    const baseAtoms = card.atoms.filter(atom => atom.atomId !== SKU_ATOM_ID);
    const baseCatalogue = (card.catalogueAtoms ?? card.atoms).filter(
      atom => atom.atomId !== SKU_ATOM_ID,
    );
    const skuAtoms = Array.isArray(config.skus)
      ? config.skus.map((sku, index) => ({
          id: `${config.atomId}-sku-${sku.id ?? index}`,
          atomId: SKU_ATOM_ID,
          title: sku.title || `SKU ${sku.id ?? index + 1}`,
          category: 'Feature Overview',
          color: 'bg-amber-500',
          metadata: sku.details,
        }))
      : [];

    return withPresentationDefaults({
      ...card,
      atoms: baseAtoms,
      catalogueAtoms: mergeCatalogueAtoms(baseCatalogue, skuAtoms),
    });
  });
};

export const useExhibitionStore = create<ExhibitionStore>(set => ({
  cards: [],
  exhibitedCards: [],

  loadSavedConfiguration: async () => {
    let loadedCards: LayoutCard[] = [];
    const context = getActiveProjectContext();

    if (context) {
      try {
        const remote = await fetchExhibitionConfiguration(context);
        if (remote && Array.isArray(remote.cards)) {
          loadedCards = extractCards(remote.cards);
          loadedCards = applyFeatureOverviewSelections(
            loadedCards,
            Array.isArray(remote.feature_overview) ? remote.feature_overview : undefined
          );
        }
      } catch (error) {
        console.warn('Failed to fetch exhibition configuration', error);
      }
    }

    if (loadedCards.length === 0) {
      loadedCards = loadCardsFromStorage();
    }

    const cardsWithDefaults = loadedCards.map(withPresentationDefaults);
    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    set({ cards: cardsWithDefaults, exhibitedCards });
  },

  toggleCardExhibition: (cardId: string) => {
    set((state) => {
      const updatedCards = state.cards.map(card =>
        card.id === cardId
          ? !card.exhibitionControlEnabled
            ? card
            : withPresentationDefaults({ ...card, isExhibited: !card.isExhibited })
          : card
      );

      const exhibitedCards = updatedCards.filter(card => card.isExhibited);
      return {
        cards: updatedCards,
        exhibitedCards,
      };
    });
  },

  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => {
    set((state) => {
      let updatedCards = state.cards.map(card => {
        if (card.id !== cardId) {
          return card;
        }

        const nextCard: LayoutCard = {
          ...card,
          ...updatedCard,
        };

        if (updatedCard.exhibitionControlEnabled === false) {
          nextCard.isExhibited = false;
        }

        if (updatedCard.atoms) {
          nextCard.atoms = updatedCard.atoms;
          nextCard.catalogueAtoms = mergeCatalogueAtoms(nextCard.catalogueAtoms, updatedCard.atoms);
        }

        if (updatedCard.catalogueAtoms) {
          nextCard.catalogueAtoms = mergeCatalogueAtoms([], updatedCard.catalogueAtoms);
        }

        if (updatedCard.presentationSettings) {
          nextCard.presentationSettings = {
            ...DEFAULT_PRESENTATION_SETTINGS,
            ...card.presentationSettings,
            ...updatedCard.presentationSettings,
          };
        }

        return withPresentationDefaults(nextCard);
      });

      if (!updatedCards.find(card => card.id === cardId)) {
        const fallbackCard: LayoutCard = withPresentationDefaults({
          id: cardId,
          atoms: [],
          isExhibited: false,
          ...updatedCard,
        });
        updatedCards = [...updatedCards, fallbackCard];
      }

      const exhibitedCards = updatedCards.filter(card => card.isExhibited);
      return {
        cards: updatedCards,
        exhibitedCards,
      };
    });
  },

  addBlankSlide: (afterSlideIndex?: number) => {
    let createdCard: LayoutCard | null = null;

    set(state => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newCard = withPresentationDefaults({
        id: `exhibition-slide-${uniqueSuffix}`,
        atoms: [],
        catalogueAtoms: [],
        isExhibited: true,
        moleculeTitle: 'Untitled Slide',
        exhibitionControlEnabled: true,
      });

      createdCard = newCard;

      const cards = [...state.cards];

      let insertPosition = cards.length;
      if (typeof afterSlideIndex === 'number' && afterSlideIndex >= 0) {
        const referenceSlide = state.exhibitedCards[afterSlideIndex];
        if (referenceSlide) {
          const referenceIndex = cards.findIndex(card => card.id === referenceSlide.id);
          if (referenceIndex !== -1) {
            insertPosition = referenceIndex + 1;
          }
        }
      }

      cards.splice(insertPosition, 0, newCard);
      const exhibitedCards = cards.filter(card => card.isExhibited);

      return {
        cards,
        exhibitedCards,
      };
    });

    return createdCard;
  },

  setCards: (cards: LayoutCard[] | unknown) => {
    const safeCards = extractCards(cards);
    const cardsWithDefaults = safeCards.map(withPresentationDefaults);
    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    set({ cards: cardsWithDefaults, exhibitedCards });
  },
  reset: () => {
    set({ cards: [], exhibitedCards: [] });
  }
}));
