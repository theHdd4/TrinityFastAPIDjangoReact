
import { create } from 'zustand';
import { safeStringify } from '@/utils/safeStringify';

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

export const useExhibitionStore = create<ExhibitionStore>((set, get) => ({
  cards: [],
  exhibitedCards: [],
  
  loadSavedConfiguration: () => {
    // Load from global store instead of localStorage
    set({ cards: [], exhibitedCards: [] });
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
    const safeCards = Array.isArray(cards) ? cards : [];
    const exhibitedCards = safeCards.filter(card => (card as any).isExhibited);
    const newState = { cards: safeCards, exhibitedCards };
    set(newState);
  },
  reset: () => {
    set({ cards: [], exhibitedCards: [] });
  }
}));
