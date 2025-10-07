
import { create } from 'zustand';

interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
}

interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
}

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  loadSavedConfiguration: () => void;
  toggleCardExhibition: (cardId: string) => void;
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => void;
  setCards: (cards: LayoutCard[]) => void;
  reset: () => void;
}

const FALLBACK_COLOR = 'bg-gray-400';

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

  return {
    id: String(identifier),
    atoms,
    isExhibited: Boolean(card.isExhibited),
    moleculeId: card.moleculeId ? String(card.moleculeId) : undefined,
    moleculeTitle: typeof card.moleculeTitle === 'string' ? card.moleculeTitle : undefined,
  };
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
    set({ cards: loadedCards, exhibitedCards });
  },
  
  toggleCardExhibition: (cardId: string) => {
    set((state) => {
      const updatedCards = state.cards.map(card =>
        card.id === cardId
          ? { ...card, isExhibited: !card.isExhibited }
          : card
      );

      const exhibitedCards = updatedCards.filter(card => card.isExhibited);
      const newState = {
        cards: updatedCards,
        exhibitedCards
      };
      return newState;
    });
  },
  
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => {
    set((state) => {
      let updatedCards = state.cards.map(card =>
        card.id === cardId ? { ...card, ...updatedCard } : card
      );

      if (!updatedCards.find(card => card.id === cardId)) {
        updatedCards = [
          ...updatedCards,
          { id: cardId, atoms: [], isExhibited: false, ...updatedCard }
        ];
      }

      const exhibitedCards = updatedCards.filter(card => card.isExhibited);
      const newState = {
        cards: updatedCards,
        exhibitedCards
      };
      return newState;
    });
  },

  setCards: (cards: LayoutCard[] | unknown) => {
    const safeCards = extractCards(cards);
    const exhibitedCards = safeCards.filter(card => card.isExhibited);
    const newState = { cards: safeCards, exhibitedCards };
    set(newState);
  },
  reset: () => {
    set({ cards: [], exhibitedCards: [] });
  }
}));
