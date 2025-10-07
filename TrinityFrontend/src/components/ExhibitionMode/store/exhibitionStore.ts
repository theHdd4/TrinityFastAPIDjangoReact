
import { create } from 'zustand';

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
}

export interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
  presentationSettings?: PresentationSettings;
}

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  loadSavedConfiguration: () => void;
  toggleCardExhibition: (cardId: string) => void;
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => void;
  setCards: (cards: LayoutCard[] | unknown) => void;
  reset: () => void;
}

const FALLBACK_COLOR = 'bg-gray-400';

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  cardColor: 'default',
  cardWidth: 'L',
  contentAlignment: 'top',
  fullBleed: false,
  cardLayout: 'content-right',
};

const withPresentationDefaults = (card: LayoutCard): LayoutCard => ({
  ...card,
  presentationSettings: {
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...card.presentationSettings,
  },
});

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

  const normalized: LayoutCard = {
    id: String(identifier),
    atoms,
    isExhibited: Boolean(card.isExhibited),
    moleculeId: card.moleculeId ? String(card.moleculeId) : undefined,
    moleculeTitle: typeof card.moleculeTitle === 'string' ? card.moleculeTitle : undefined,
    presentationSettings: card.presentationSettings && typeof card.presentationSettings === 'object'
      ? {
          ...DEFAULT_PRESENTATION_SETTINGS,
          ...card.presentationSettings,
        }
      : undefined,
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

export const useExhibitionStore = create<ExhibitionStore>(set => ({
  cards: [],
  exhibitedCards: [],

  loadSavedConfiguration: () => {
    const loadedCards = loadCardsFromStorage();
    const exhibitedCards = loadedCards.filter(card => card.isExhibited);
    set({ cards: loadedCards.map(withPresentationDefaults), exhibitedCards: exhibitedCards.map(withPresentationDefaults) });
  },

  toggleCardExhibition: (cardId: string) => {
    set((state) => {
      const updatedCards = state.cards.map(card =>
        card.id === cardId
          ? withPresentationDefaults({ ...card, isExhibited: !card.isExhibited })
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

        if (updatedCard.atoms) {
          nextCard.atoms = updatedCard.atoms;
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
