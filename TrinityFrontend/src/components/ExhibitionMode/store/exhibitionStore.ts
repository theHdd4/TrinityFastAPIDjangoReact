
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
}

export const useExhibitionStore = create<ExhibitionStore>((set, get) => ({
  cards: [],
  exhibitedCards: [],
  
  loadSavedConfiguration: () => {
    const savedConfig = localStorage.getItem('laboratory-config');
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      const exhibitedCards = config.cards.filter((card: LayoutCard) => card.isExhibited);
      
      set({
        cards: config.cards,
        exhibitedCards
      });
    }
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
      localStorage.setItem(
        'laboratory-config',
        safeStringify({
          cards: updatedCards,
          exhibitedCards,
          timestamp: new Date().toISOString()
        })
      );
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
      localStorage.setItem(
        'laboratory-config',
        safeStringify({
          cards: updatedCards,
          exhibitedCards,
          timestamp: new Date().toISOString()
        })
      );
      return newState;
    });
  },

  setCards: (cards: LayoutCard[]) => {
    const exhibitedCards = cards.filter(card => card.isExhibited);
    const newState = { cards, exhibitedCards };
    localStorage.setItem(
      'laboratory-config',
      safeStringify({ cards, exhibitedCards, timestamp: new Date().toISOString() })
    );
    set(newState);
  }
}));
