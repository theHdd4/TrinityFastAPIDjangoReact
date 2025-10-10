
import { create } from 'zustand';
import {
  fetchExhibitionConfiguration,
  ExhibitionAtomPayload,
  ExhibitionComponentPayload,
} from '@/lib/exhibition';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';

export type CardColor = 'default' | 'blue' | 'purple' | 'green' | 'orange';
export type CardWidth = 'M' | 'L';
export type ContentAlignment = 'top' | 'center' | 'bottom';
export type CardLayout = 'none' | 'top' | 'bottom' | 'right' | 'left' | 'full';

const DEFAULT_CARD_LAYOUT: CardLayout = 'right';

const CARD_LAYOUTS: readonly CardLayout[] = ['none', 'top', 'bottom', 'right', 'left', 'full'] as const;

const LEGACY_CARD_LAYOUTS: Record<string, CardLayout> = {
  blank: 'none',
  'horizontal-split': 'top',
  'vertical-split': 'left',
  'content-right': 'right',
  full: 'full',
};

const ensureCardLayout = (layout: unknown): CardLayout => {
  if (typeof layout === 'string') {
    if ((CARD_LAYOUTS as readonly string[]).includes(layout)) {
      return layout as CardLayout;
    }

    const legacyLayout = LEGACY_CARD_LAYOUTS[layout];
    if (legacyLayout) {
      return legacyLayout;
    }
  }

  return DEFAULT_CARD_LAYOUT;
};

export type SlideshowTransition = 'fade' | 'slide' | 'zoom';

export interface PresentationSettings {
  cardColor: CardColor;
  cardWidth: CardWidth;
  contentAlignment: ContentAlignment;
  fullBleed: boolean;
  cardLayout: CardLayout;
  accentImage?: string | null;
  accentImageName?: string | null;
  slideshowDuration: number;
  slideshowTransition: SlideshowTransition;
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
  placeholderDismissed?: boolean;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
}

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  catalogueCards: LayoutCard[];
  catalogueEntries: ExhibitionAtomPayload[];
  lastLoadedContext: ProjectContext | null;
  loadSavedConfiguration: (context?: ProjectContext | null) => Promise<void>;
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

const isRecord = (value: unknown): value is Record<string, any> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normaliseProjectContext = (context?: ProjectContext | null): ProjectContext | null => {
  if (!context) {
    return null;
  }

  const client = typeof context.client_name === 'string' ? context.client_name.trim() : '';
  const app = typeof context.app_name === 'string' ? context.app_name.trim() : '';
  const project = typeof context.project_name === 'string' ? context.project_name.trim() : '';

  if (!client || !app || !project) {
    return null;
  }

  return {
    client_name: client,
    app_name: app,
    project_name: project,
  };
};

const computeCatalogueCards = (cards: LayoutCard[]): LayoutCard[] => {
  if (!Array.isArray(cards) || cards.length === 0) {
    return [];
  }

  return cards
    .map(withPresentationDefaults)
    .filter(card => {
      const catalogueCount = card.catalogueAtoms?.length ?? card.atoms.length ?? 0;
      return catalogueCount > 0;
    });
};

const normaliseCatalogueComponent = (component: ExhibitionComponentPayload, atomName: string): DroppedAtom | null => {
  const normalised = normalizeAtom(component);
  if (!normalised) {
    return null;
  }

  if (!normalised.metadata || typeof normalised.metadata !== 'object') {
    normalised.metadata = {};
  }

  if (
    typeof normalised.metadata.sourceAtomTitle !== 'string' ||
    normalised.metadata.sourceAtomTitle.trim().length === 0
  ) {
    normalised.metadata.sourceAtomTitle = atomName;
  }

  return normalised;
};

type AtomEntryLike = ExhibitionAtomPayload & {
  exhibited_cards?: ExhibitionComponentPayload[];
  exhibitedCards?: ExhibitionComponentPayload[];
  exhibitedComponents?: ExhibitionComponentPayload[];
  ['exhibited components']?: ExhibitionComponentPayload[];
};

const extractExhibitedComponents = (entry: AtomEntryLike): ExhibitionComponentPayload[] => {
  const candidates = [
    entry?.exhibited_components,
    entry?.exhibited_cards,
    entry?.exhibitedCards,
    entry?.exhibitedComponents,
    entry?.['exhibited components'],
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
};

const buildCardFromEntry = (entry: ExhibitionAtomPayload, index: number): LayoutCard | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const rawId = typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : '';
  const identifier = rawId || `catalogue-entry-${index + 1}`;

  const rawName = typeof entry.atom_name === 'string' && entry.atom_name.trim().length > 0 ? entry.atom_name.trim() : '';
  const atomName = rawName || identifier;

  const components = extractExhibitedComponents(entry as AtomEntryLike)
    .map(component => normaliseCatalogueComponent(component, atomName))
    .filter((component): component is DroppedAtom => component !== null);

  if (components.length === 0) {
    return null;
  }

  return withPresentationDefaults({
    id: identifier,
    atoms: [],
    catalogueAtoms: components,
    isExhibited: true,
    moleculeId: atomName,
    moleculeTitle: atomName,
  });
};

export const useExhibitionStore = create<ExhibitionStore>(set => ({
  cards: [],
  exhibitedCards: [],
  catalogueCards: [],
  catalogueEntries: [],
  lastLoadedContext: null,

  loadSavedConfiguration: async (explicitContext?: ProjectContext | null) => {
    let loadedCards: LayoutCard[] = [];
    let catalogueEntries: ExhibitionAtomPayload[] = [];
    const resolvedContext = normaliseProjectContext(explicitContext ?? getActiveProjectContext());
    const contextLabel = resolvedContext
      ? `${resolvedContext.client_name}/${resolvedContext.app_name}/${resolvedContext.project_name}`
      : 'local-cache';

    if (resolvedContext) {
      console.info(
        `[Exhibition] Fetching exhibition catalogue from trinity_db.exhibition_catalogue for ${contextLabel}`,
      );
      try {
        const remote = await fetchExhibitionConfiguration(resolvedContext);
        const remoteAtoms = remote && Array.isArray(remote.atoms) ? remote.atoms : [];
        catalogueEntries = remoteAtoms;

        if (remoteAtoms.length === 0) {
          console.info(
            `[Exhibition] No exhibition catalogue entry found for ${contextLabel} in trinity_db.exhibition_catalogue`,
          );
        } else {
          console.info(
            `[Exhibition] Retrieved ${remoteAtoms.length} catalogue entr${remoteAtoms.length === 1 ? 'y' : 'ies'} from trinity_db.exhibition_catalogue for ${contextLabel}`,
          );
          loadedCards = remoteAtoms
            .map((entry, index) => {
              const card = buildCardFromEntry(entry, index);
              if (!card) {
                const entryId =
                  entry && typeof entry.id === 'string' && entry.id.trim().length > 0
                    ? entry.id.trim()
                    : `entry-${index + 1}`;
                console.info(
                  `[Exhibition] Skipped catalogue entry ${entryId} because it has no exhibited components`,
                );
              }
              return card;
            })
            .filter((card): card is LayoutCard => card !== null);
        }
      } catch (error) {
        console.warn(
          `[Exhibition] Failed to fetch exhibition catalogue for ${contextLabel} from trinity_db.exhibition_catalogue`,
          error,
        );
      }
    } else {
      console.info(
        '[Exhibition] Skipping exhibition catalogue fetch because no active project context was resolved',
      );
    }

    const catalogueCards = computeCatalogueCards(loadedCards);

    console.info(
      `[Exhibition] Exhibition catalogue ready with ${catalogueCards.length} catalogue card(s)` +
        (resolvedContext ? ` for ${contextLabel}` : ' without a remote context'),
    );

    if (catalogueCards.length > 0) {
      catalogueCards.forEach(card => {
        const availableCount = card.catalogueAtoms?.length ?? 0;
        console.info(
          `[Exhibition] Catalogue entry ${card.id} resolved with ${availableCount} exhibited component(s)` +
            (card.moleculeTitle ? ` (${card.moleculeTitle})` : ''),
        );
      });
    } else {
      console.info('[Exhibition] Exhibition catalogue has no components to display after processing remote data');
    }

    set(state => {
      const shouldResetSlides = resolvedContext
        ? !contextsMatch(state.lastLoadedContext, resolvedContext)
        : false;

      const nextCards = shouldResetSlides
        ? []
        : state.cards.map(withPresentationDefaults);
      const nextExhibitedCards = nextCards.filter(card => card.isExhibited);

      if (shouldResetSlides && state.cards.length > 0) {
        console.info(
          '[Exhibition] Cleared existing exhibition slides to reflect the new project context',
        );
      }

      console.info(
        `[Exhibition] Exhibition slides ready with ${nextCards.length} slide card(s) and ${nextExhibitedCards.length} active slide(s)` +
          (resolvedContext ? ` for ${contextLabel}` : ''),
      );

      return {
        cards: nextCards,
        exhibitedCards: nextExhibitedCards,
        catalogueCards,
        catalogueEntries,
        lastLoadedContext: resolvedContext,
      };
    });
  },

  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => {
    set(state => {
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
        catalogueCards: state.catalogueCards,
        catalogueEntries: state.catalogueEntries,
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
        placeholderDismissed: false,
        lastEditedBy: null,
        lastEditedAt: new Date().toISOString(),
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
        catalogueCards: state.catalogueCards,
        catalogueEntries: state.catalogueEntries,
      };
    });

    return createdCard;
  },

  setCards: (cards: LayoutCard[] | unknown) => {
    const safeCards = extractCards(cards);

    const cardsWithDefaults = safeCards.map(withPresentationDefaults);

    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    set(state => ({
      cards: cardsWithDefaults,
      exhibitedCards,
      catalogueCards: state.catalogueCards,
      catalogueEntries: state.catalogueEntries,
    }));
  },
  reset: () => {
    set({
      cards: [],
      exhibitedCards: [],
      catalogueCards: [],
      catalogueEntries: [],
      lastLoadedContext: null,
    });
  },
}));
