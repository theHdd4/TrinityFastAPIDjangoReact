
import { create } from 'zustand';
import {
  fetchExhibitionConfiguration,
  ExhibitionFeatureOverviewPayload,
  ExhibitionSkuPayload,
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
  exhibitionControlEnabled?: boolean;
}

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  catalogueCards: LayoutCard[];
  featureOverviewConfigs: ExhibitionFeatureOverviewPayload[];
  lastLoadedContext: ProjectContext | null;
  loadSavedConfiguration: (context?: ProjectContext | null) => Promise<void>;
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

const isRecord = (value: unknown): value is Record<string, any> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normaliseSku = (
  sku: unknown,
  index: number,
  fallbackPrefix: string,
  sourceAtomTitle: string,
): ExhibitionSkuPayload | null => {
  if (!isRecord(sku)) {
    return null;
  }

  const rawId = sku.id;
  const rawTitle = sku.title;
  const id = typeof rawId === 'string' && rawId.trim().length > 0 ? rawId.trim() : `${fallbackPrefix}-${index}`;
  const title = typeof rawTitle === 'string' && rawTitle.trim().length > 0 ? rawTitle.trim() : `SKU ${index + 1}`;

  const details = isRecord(sku.details) ? { ...sku.details } : undefined;
  if (details) {
    const rawSourceTitle = details.sourceAtomTitle;
    if (typeof rawSourceTitle !== 'string' || rawSourceTitle.trim().length === 0) {
      details.sourceAtomTitle = sourceAtomTitle;
    }
  }

  return {
    id,
    title,
    details,
  };
};

const normaliseFeatureOverviewEntry = (
  entry: unknown,
): ExhibitionFeatureOverviewPayload | null => {
  if (!isRecord(entry)) {
    return null;
  }

  const atomId = typeof entry.atomId === 'string' && entry.atomId.trim().length > 0 ? entry.atomId.trim() : '';
  if (!atomId) {
    return null;
  }

  const fallbackCardId = atomId;
  const rawCardId = entry.cardId;
  const cardId = typeof rawCardId === 'string' && rawCardId.trim().length > 0 ? rawCardId.trim() : fallbackCardId;

  const componentsRecord = isRecord(entry.components) ? entry.components : {};
  const components = {
    skuStatistics: Boolean(componentsRecord.skuStatistics),
    trendAnalysis: Boolean(componentsRecord.trendAnalysis),
  };

  const deriveSourceTitle = (): string => {
    if (!Array.isArray(entry.skus)) {
      return atomId;
    }

    for (const sku of entry.skus) {
      if (isRecord(sku.details) && typeof sku.details.sourceAtomTitle === 'string' && sku.details.sourceAtomTitle.trim()) {
        return sku.details.sourceAtomTitle.trim();
      }
    }

    return atomId;
  };

  const sourceAtomTitle = deriveSourceTitle();

  const skus = Array.isArray(entry.skus)
    ? (entry.skus
        .map((sku, index) => normaliseSku(sku, index, `${cardId}-sku`, sourceAtomTitle))
        .filter(Boolean) as ExhibitionSkuPayload[])
    : [];

  const chartSettings = isRecord(entry.chartSettings)
    ? (entry.chartSettings as ExhibitionFeatureOverviewPayload['chartSettings'])
    : undefined;
  const skuStatisticsSettings = isRecord(entry.skuStatisticsSettings)
    ? (entry.skuStatisticsSettings as ExhibitionFeatureOverviewPayload['skuStatisticsSettings'])
    : undefined;

  return {
    atomId,
    cardId,
    components,
    skus,
    chartSettings,
    skuStatisticsSettings,
  };
};

const extractFeatureOverviewEntries = (raw: unknown): ExhibitionFeatureOverviewPayload[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map(normaliseFeatureOverviewEntry).filter((entry): entry is ExhibitionFeatureOverviewPayload => entry !== null);
};

const humaniseIdentifier = (value: string): string => {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const deriveSourceTitleFromConfig = (config: ExhibitionFeatureOverviewPayload): string => {
  const fromSku = config.skus
    .map(sku => sku.details?.sourceAtomTitle)
    .find(title => typeof title === 'string' && title.trim().length > 0);

  if (fromSku) {
    return fromSku.trim();
  }

  return humaniseIdentifier(config.atomId) || 'Exhibited Atom';
};

const createCatalogueAtomsFromConfig = (
  config: ExhibitionFeatureOverviewPayload,
  sourceAtomTitle: string,
): DroppedAtom[] => {
  return config.skus.map((sku, index) => {
    const metadata = sku.details ? { ...sku.details, sourceAtomTitle } : { sourceAtomTitle };

    return {
      id: sku.id || `${config.cardId}-sku-${index}`,
      atomId: SKU_ATOM_ID,
      title: sku.title || `SKU ${index + 1}`,
      category: 'Feature Overview',
      color: 'bg-amber-500',
      metadata,
    };
  });
};

const deriveCatalogueCards = (
  cards: LayoutCard[],
  featureOverview: ExhibitionFeatureOverviewPayload[],
): LayoutCard[] => {
  const catalogueMap = new Map<string, LayoutCard>();

  cards.forEach(card => {
    const entry: LayoutCard = {
      ...card,
      catalogueAtoms: Array.isArray(card.catalogueAtoms) ? [...card.catalogueAtoms] : [],
    };

    catalogueMap.set(card.id, entry);
  });

  featureOverview.forEach(config => {
    const targetId = config.cardId;
    const sourceTitle = deriveSourceTitleFromConfig(config);
    const skuAtoms = createCatalogueAtomsFromConfig(config, sourceTitle);

    if (catalogueMap.has(targetId)) {
      const existing = catalogueMap.get(targetId)!;
      catalogueMap.set(targetId, {
        ...existing,
        catalogueAtoms: mergeCatalogueAtoms(existing.catalogueAtoms, skuAtoms),
        moleculeId: existing.moleculeId || config.atomId,
        moleculeTitle:
          existing.moleculeTitle && existing.moleculeTitle.trim().length > 0
            ? existing.moleculeTitle
            : sourceTitle,
      });
      return;
    }

    const fallbackId = `${config.cardId || config.atomId}-catalogue`;
    const entry = withPresentationDefaults({
      id: fallbackId,
      atoms: [],
      catalogueAtoms: skuAtoms,
      isExhibited: false,
      moleculeId: config.atomId,
      moleculeTitle: sourceTitle,
      exhibitionControlEnabled: true,
    });

    catalogueMap.set(entry.id, entry);
  });

  return Array.from(catalogueMap.values()).filter(card => (card.catalogueAtoms?.length ?? 0) > 0);
};

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  cardColor: 'default',
  cardWidth: 'L',
  contentAlignment: 'top',
  fullBleed: false,
  cardLayout: DEFAULT_CARD_LAYOUT,
  accentImage: null,
  accentImageName: null,
  slideshowDuration: 8,
  slideshowTransition: 'fade',
};

const withPresentationDefaults = (card: LayoutCard): LayoutCard => {
  const slideAtoms = Array.isArray(card.atoms) ? card.atoms : [];
  const catalogueAtoms = Array.isArray(card.catalogueAtoms) ? [...card.catalogueAtoms] : [];
  const mergedSettings = {
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...card.presentationSettings,
  };

  mergedSettings.cardLayout = ensureCardLayout(mergedSettings.cardLayout);

  return {
    ...card,
    atoms: slideAtoms,
    catalogueAtoms,
    exhibitionControlEnabled: card.exhibitionControlEnabled ?? true,
    presentationSettings: mergedSettings,
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
          cardLayout: ensureCardLayout((card.presentationSettings as any).cardLayout),
        }
      : undefined,
    exhibitionControlEnabled: 'exhibitionControlEnabled' in card
      ? Boolean(card.exhibitionControlEnabled)
      : true,
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
    const baseCatalogue = (card.catalogueAtoms ?? []).filter(atom => atom.atomId !== SKU_ATOM_ID);

    const deriveSourceTitle = (): string => {
      if (typeof card.moleculeTitle === 'string' && card.moleculeTitle.trim().length > 0) {
        return card.moleculeTitle.trim();
      }

      const fromSku = Array.isArray(config.skus)
        ? config.skus
            .map(entry => entry.details?.sourceAtomTitle)
            .find(title => typeof title === 'string' && title.trim().length > 0)
        : undefined;

      if (typeof fromSku === 'string' && fromSku.trim().length > 0) {
        return fromSku.trim();
      }

      return config.atomId
        .split(/[-_]/g)
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ') || 'Exhibited Atom';
    };

    const sourceAtomTitle = deriveSourceTitle();

    const skuAtoms = Array.isArray(config.skus)
      ? config.skus.map((sku, index) => {
          const rawDetails = sku.details && typeof sku.details === 'object' ? sku.details : undefined;
          const metadata = {
            ...(rawDetails ?? {}),
            sourceAtomTitle:
              rawDetails && typeof rawDetails.sourceAtomTitle === 'string' && rawDetails.sourceAtomTitle.trim().length > 0
                ? rawDetails.sourceAtomTitle
                : sourceAtomTitle,
          };

          return {
            id: `${config.atomId}-sku-${sku.id ?? index}`,
            atomId: SKU_ATOM_ID,
            title: sku.title || `SKU ${sku.id ?? index + 1}`,
            category: 'Feature Overview',
            color: 'bg-amber-500',
            metadata,
          };
        })
      : [];

    return withPresentationDefaults({
      ...card,
      atoms: baseAtoms,
      catalogueAtoms: mergeCatalogueAtoms(baseCatalogue, skuAtoms),
      moleculeTitle: card.moleculeTitle && card.moleculeTitle.trim().length > 0 ? card.moleculeTitle : sourceAtomTitle,
    });
  });
};

export const useExhibitionStore = create<ExhibitionStore>(set => ({
  cards: [],
  exhibitedCards: [],
  catalogueCards: [],
  featureOverviewConfigs: [],
  lastLoadedContext: null,

  loadSavedConfiguration: async (explicitContext?: ProjectContext | null) => {
    let loadedCards: LayoutCard[] = [];
    const context = explicitContext ?? getActiveProjectContext();
    let featureOverviewConfigs: ExhibitionFeatureOverviewPayload[] = [];

    if (context) {
      try {
        const remote = await fetchExhibitionConfiguration(context);
        if (remote && Array.isArray(remote.cards)) {
          loadedCards = extractCards(remote.cards);
          featureOverviewConfigs = extractFeatureOverviewEntries(remote.feature_overview);
          loadedCards = applyFeatureOverviewSelections(loadedCards, featureOverviewConfigs);
        }
      } catch (error) {
        console.warn('Failed to fetch exhibition configuration', error);
      }
    }

    const cardsWithDefaults = loadedCards.map(withPresentationDefaults);
    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    const catalogueCards = deriveCatalogueCards(cardsWithDefaults, featureOverviewConfigs);

    set({
      cards: cardsWithDefaults,
      exhibitedCards,
      catalogueCards,
      featureOverviewConfigs,
      lastLoadedContext: context ?? null,
    });
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
        catalogueCards: deriveCatalogueCards(updatedCards, state.featureOverviewConfigs),
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
        catalogueCards: deriveCatalogueCards(updatedCards, state.featureOverviewConfigs),
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
        catalogueCards: deriveCatalogueCards(cards, state.featureOverviewConfigs),
      };
    });

    return createdCard;
  },

  setCards: (cards: LayoutCard[] | unknown) => {
    const safeCards = extractCards(cards);

    const cardsWithDefaults = safeCards.map(card => {
      const slideAtoms = Array.isArray(card.atoms) ? card.atoms : [];
      const isExhibited = Boolean(card.isExhibited);

      if (!isExhibited || slideAtoms.length === 0) {
        return withPresentationDefaults(card);
      }

      const catalogueAtoms = mergeCatalogueAtoms(card.catalogueAtoms, slideAtoms);

      return withPresentationDefaults({
        ...card,
        atoms: [],
        catalogueAtoms,
        exhibitionControlEnabled: card.exhibitionControlEnabled ?? true,
      });
    });

    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    set(state => ({
      cards: cardsWithDefaults,
      exhibitedCards,
      catalogueCards: deriveCatalogueCards(cardsWithDefaults, state.featureOverviewConfigs),
    }));
  },
  reset: () => {
    set({
      cards: [],
      exhibitedCards: [],
      catalogueCards: [],
      featureOverviewConfigs: [],
      lastLoadedContext: null,
    });
  },
}));
