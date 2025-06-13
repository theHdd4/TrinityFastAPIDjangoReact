import { create } from 'zustand';
import { safeStringify } from '@/utils/safeStringify';

export interface TextBoxSettings {
  format: 'quill-delta' | 'markdown' | 'html' | 'plain';
  content: string;
  allow_variables: boolean;
  max_chars: number;
  text_align: 'left' | 'center' | 'right' | 'justify';
  font_size: number;
  font_family: string;
  text_color: string;
  headline: string;
  slide_layout: 'full' | 'sidebar' | 'note-callout';
  transition_effect: 'none' | 'fade' | 'typewriter';
  lock_content: boolean;
}

export const DEFAULT_TEXTBOX_SETTINGS: TextBoxSettings = {
  format: 'plain',
  content: '',
  allow_variables: false,
  max_chars: 0,
  text_align: 'left',
  font_size: 14,
  font_family: 'Inter',
  text_color: '#000000',
  headline: '',
  slide_layout: 'full',
  transition_effect: 'none',
  lock_content: false,
};

export interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
  settings?: TextBoxSettings;
}

export interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
}

interface LaboratoryStore {
  cards: LayoutCard[];
  setCards: (cards: LayoutCard[]) => void;
  updateAtomSettings: (atomId: string, settings: Partial<TextBoxSettings>) => void;
  getAtom: (atomId: string) => DroppedAtom | undefined;
}

const STORAGE_KEY = 'laboratory-layout-cards';

export const useLaboratoryStore = create<LaboratoryStore>((set, get) => ({
  cards: [],
  setCards: (cards) => {
    localStorage.setItem(STORAGE_KEY, safeStringify(cards));
    set({ cards });
  },
  updateAtomSettings: (atomId, settings) => {
    const updatedCards = get().cards.map(card => ({
      ...card,
      atoms: card.atoms.map(a =>
        a.id === atomId ? { ...a, settings: { ...DEFAULT_TEXTBOX_SETTINGS, ...a.settings, ...settings } } : a
      )
    }));
    localStorage.setItem(STORAGE_KEY, safeStringify(updatedCards));
    set({ cards: updatedCards });
  },
  getAtom: (atomId) => {
    for (const card of get().cards) {
      const atom = card.atoms.find(a => a.id === atomId);
      if (atom) return atom;
    }
    return undefined;
  }
}));
