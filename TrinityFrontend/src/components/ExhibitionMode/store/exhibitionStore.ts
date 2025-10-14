
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
const CARD_COLORS: readonly CardColor[] = ['default', 'blue', 'purple', 'green', 'orange'] as const;
const CARD_WIDTHS: readonly CardWidth[] = ['M', 'L'] as const;
const CONTENT_ALIGNMENTS: readonly ContentAlignment[] = ['top', 'center', 'bottom'] as const;
const SLIDESHOW_TRANSITIONS: readonly SlideshowTransition[] = ['fade', 'slide', 'zoom'] as const;

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

export const DEFAULT_PRESENTATION_SETTINGS: PresentationSettings = {
  cardColor: 'purple',
  cardWidth: 'M',
  contentAlignment: 'center',
  fullBleed: false,
  cardLayout: DEFAULT_CARD_LAYOUT,
  accentImage: null,
  accentImageName: null,
  slideshowDuration: 8,
  slideshowTransition: 'fade',
};

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

export interface SlideObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  groupId?: string | null;
  props: Record<string, unknown>;
}

export const DEFAULT_CANVAS_OBJECT_WIDTH = 420;
export const DEFAULT_CANVAS_OBJECT_HEIGHT = 320;
const DEFAULT_TITLE_OBJECT_WIDTH = 560;
const DEFAULT_TITLE_OBJECT_HEIGHT = 120;
const DEFAULT_ACCENT_IMAGE_OBJECT_WIDTH = 360;
const DEFAULT_ACCENT_IMAGE_OBJECT_HEIGHT = 240;
export const CANVAS_SNAP_GRID = 8;

export const buildSlideTitleObjectId = (cardId: string) => `${cardId}::slide-title`;
export const buildSlideAccentImageObjectId = (cardId: string) => `${cardId}::accent-image`;

export const createSlideObjectFromAtom = (
  atom: DroppedAtom,
  overrides: Partial<SlideObject> = {},
): SlideObject => ({
  id: atom.id,
  type: 'atom',
  x: 96,
  y: 192,
  width: DEFAULT_CANVAS_OBJECT_WIDTH,
  height: DEFAULT_CANVAS_OBJECT_HEIGHT,
  zIndex: 1,
  groupId: null,
  props: { atom } as Record<string, unknown>,
  ...overrides,
});

export interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  catalogueAtoms?: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
  title?: string;
  lastEditedAt?: string;
  presentationSettings?: PresentationSettings;
}

interface ExhibitionStore {
  cards: LayoutCard[];
  exhibitedCards: LayoutCard[];
  catalogueCards: LayoutCard[];
  catalogueEntries: ExhibitionAtomPayload[];
  lastLoadedContext: ProjectContext | null;
  slideObjectsByCardId: Record<string, SlideObject[]>;
  loadSavedConfiguration: (context?: ProjectContext | null) => Promise<void>;
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => void;
  addBlankSlide: (afterSlideIndex?: number) => LayoutCard | null;
  setCards: (cards: LayoutCard[] | unknown) => void;
  addSlideObject: (cardId: string, object: SlideObject) => void;
  bulkUpdateSlideObjects: (cardId: string, updates: Record<string, Partial<SlideObject>>) => void;
  removeSlideObject: (cardId: string, objectId: string) => void;
  bringSlideObjectsToFront: (cardId: string, objectIds: string[]) => void;
  sendSlideObjectsToBack: (cardId: string, objectIds: string[]) => void;
  groupSlideObjects: (cardId: string, objectIds: string[], groupId: string | null) => void;
  reset: () => void;
}

const FALLBACK_COLOR = 'bg-gray-400';

const isRecord = (value: unknown): value is Record<string, any> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseMetadataRecord = (value: unknown): Record<string, any> | undefined => {
  if (isRecord(value)) {
    return { ...value };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (isRecord(parsed)) {
          return { ...parsed };
        }
      } catch (error) {
        console.warn('[Exhibition] Unable to parse feature overview metadata payload', error);
      }
    }
  }

  return undefined;
};

const looksLikeFeatureOverviewMetadata = (metadata: Record<string, any> | undefined): boolean => {
  if (!metadata) {
    return false;
  }

  const viewType = metadata.viewType ?? metadata.view_type;
  if (typeof viewType === 'string') {
    const normalised = viewType.toLowerCase();
    if (normalised === 'statistical_summary' || normalised === 'statistical-summary') {
      return true;
    }
    if (normalised === 'trend_analysis' || normalised === 'trend-analysis') {
      return true;
    }
  }

  const hasMetric =
    typeof metadata.metric === 'string' || typeof metadata.dependent_variable === 'string';
  const hasDimensions = Array.isArray(metadata.dimensions) || Array.isArray(metadata.dimension_combinations);
  const hasStatistics =
    metadata.statisticalDetails != null ||
    metadata.statistical_details != null ||
    metadata.summary != null ||
    metadata.statistical_summary != null;
  const hasChartConfig =
    metadata.chartState != null ||
    metadata.chart_state != null ||
    metadata.chartRendererProps != null ||
    metadata.chart_renderer_props != null ||
    metadata.chartRendererConfig != null ||
    metadata.chart_renderer_config != null ||
    metadata.chartConfig != null ||
    metadata.chart_config != null;

  return Boolean(hasMetric && (hasDimensions || hasStatistics || hasChartConfig));
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isValidDateString = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
};

const isValidCardColor = (value: unknown): value is CardColor =>
  typeof value === 'string' && (CARD_COLORS as readonly string[]).includes(value);

const isValidCardWidth = (value: unknown): value is CardWidth =>
  typeof value === 'string' && (CARD_WIDTHS as readonly string[]).includes(value);

const isValidContentAlignment = (value: unknown): value is ContentAlignment =>
  typeof value === 'string' && (CONTENT_ALIGNMENTS as readonly string[]).includes(value);

const isValidSlideshowTransition = (value: unknown): value is SlideshowTransition =>
  typeof value === 'string' && (SLIDESHOW_TRANSITIONS as readonly string[]).includes(value);

const ensurePresentationSettings = (
  settings: PresentationSettings | Partial<PresentationSettings> | null | undefined,
): PresentationSettings => {
  const candidate = isRecord(settings) ? settings : {};

  const cardColor = isValidCardColor(candidate.cardColor)
    ? candidate.cardColor
    : DEFAULT_PRESENTATION_SETTINGS.cardColor;

  const cardWidth = isValidCardWidth(candidate.cardWidth)
    ? candidate.cardWidth
    : DEFAULT_PRESENTATION_SETTINGS.cardWidth;

  const contentAlignment = isValidContentAlignment(candidate.contentAlignment)
    ? candidate.contentAlignment
    : DEFAULT_PRESENTATION_SETTINGS.contentAlignment;

  const fullBleed = typeof candidate.fullBleed === 'boolean'
    ? candidate.fullBleed
    : DEFAULT_PRESENTATION_SETTINGS.fullBleed;

  const cardLayout = ensureCardLayout(candidate.cardLayout);

  const accentImage = isNonEmptyString(candidate.accentImage) ? candidate.accentImage : null;
  const accentImageName = isNonEmptyString(candidate.accentImageName) ? candidate.accentImageName : null;

  const slideshowDuration =
    typeof candidate.slideshowDuration === 'number' && Number.isFinite(candidate.slideshowDuration)
      ? Math.max(1, candidate.slideshowDuration)
      : DEFAULT_PRESENTATION_SETTINGS.slideshowDuration;

  const slideshowTransition = isValidSlideshowTransition(candidate.slideshowTransition)
    ? candidate.slideshowTransition
    : DEFAULT_PRESENTATION_SETTINGS.slideshowTransition;

  return {
    cardColor,
    cardWidth,
    contentAlignment,
    fullBleed,
    cardLayout,
    accentImage,
    accentImageName,
    slideshowDuration,
    slideshowTransition,
  };
};

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

const normaliseZIndices = (objects: SlideObject[]): SlideObject[] =>
  objects.map((object, index) => ({ ...object, zIndex: index + 1 }));

export const resolveCardTitle = (card: LayoutCard, fallbackAtoms: DroppedAtom[] = []): string => {
  if (typeof card.title === 'string' && card.title.trim().length > 0) {
    return card.title.trim();
  }

  if (typeof card.moleculeTitle === 'string' && card.moleculeTitle.trim().length > 0) {
    return card.moleculeTitle.trim();
  }

  const atoms = Array.isArray(card.atoms) && card.atoms.length > 0 ? card.atoms : fallbackAtoms;
  if (atoms.length > 0) {
    const firstTitle = atoms[0]?.title;
    if (typeof firstTitle === 'string' && firstTitle.trim().length > 0) {
      return firstTitle.trim();
    }
  }

  return 'Untitled Slide';
};

const synchroniseSlideObjects = (
  existing: SlideObject[] | undefined,
  card: LayoutCard,
): SlideObject[] => {
  const atoms = Array.isArray(card.atoms) ? card.atoms : [];
  const atomMap = new Map(atoms.map(atom => [atom.id, atom]));
  const used = new Set<string>();
  let next: SlideObject[] = [];

  if (Array.isArray(existing)) {
    existing.forEach(object => {
      if (object.type === 'atom') {
        const props = object.props as Record<string, unknown> | undefined;
        const atomId = typeof props?.atom === 'object' && props?.atom
          ? (props.atom as DroppedAtom).id
          : object.id;
        const atom = atomMap.get(atomId);
        if (!atom) {
          return;
        }
        used.add(atom.id);
        next.push({
          ...object,
          type: 'atom',
          props: { ...(object.props || {}), atom },
        });
      } else if (object.type === 'title') {
        next.push({
          ...object,
          id: buildSlideTitleObjectId(card.id),
          type: 'title',
          props: {
            ...(object.props || {}),
            text: resolveCardTitle(card, atoms),
          },
        });
      } else if (object.type === 'accent-image') {
        const accentImage = card.presentationSettings?.accentImage;
        if (!accentImage) {
          return;
        }
        next.push({
          ...object,
          id: buildSlideAccentImageObjectId(card.id),
          type: 'accent-image',
          props: {
            ...(object.props || {}),
            src: accentImage,
            name: card.presentationSettings?.accentImageName ?? null,
          },
        });
      } else {
        next.push({ ...object });
      }
    });
  }

  if (atoms.length > 0) {
    atoms.forEach((atom, index) => {
      if (used.has(atom.id)) {
        return;
      }
      const fallbackY = 192 + (next.length + index) * 40;
      next.push(
        createSlideObjectFromAtom(atom, {
          id: atom.id,
          x: 96,
          y: fallbackY,
          zIndex: next.length + index + 1,
        }),
      );
    });
  }

  const accentId = buildSlideAccentImageObjectId(card.id);
  const titleId = buildSlideTitleObjectId(card.id);

  const accentImage = card.presentationSettings?.accentImage;
  if (accentImage) {
    const accentIndex = next.findIndex(object => object.id === accentId || object.type === 'accent-image');
    const accentName = card.presentationSettings?.accentImageName ?? null;
    const accentObject: SlideObject = accentIndex !== -1
      ? {
          ...next[accentIndex],
          id: accentId,
          type: 'accent-image',
          props: {
            ...(next[accentIndex].props || {}),
            src: accentImage,
            name: accentName,
          },
        }
      : {
          id: accentId,
          type: 'accent-image',
          x: 48,
          y: 160,
          width: DEFAULT_ACCENT_IMAGE_OBJECT_WIDTH,
          height: DEFAULT_ACCENT_IMAGE_OBJECT_HEIGHT,
          zIndex: 1,
          groupId: null,
          props: {
            src: accentImage,
            name: accentName,
          },
        };

    next = next.filter(object => object.id !== accentId && object.type !== 'accent-image');
    next = [accentObject, ...next];
  } else {
    next = next.filter(object => object.id !== accentId && object.type !== 'accent-image');
  }

  const resolvedTitle = resolveCardTitle(card, atoms);
  const titleIndex = next.findIndex(object => object.id === titleId || object.type === 'title');
  const titleObject: SlideObject = titleIndex !== -1
    ? {
        ...next[titleIndex],
        id: titleId,
        type: 'title',
        props: {
          ...(next[titleIndex].props || {}),
          text: resolvedTitle,
        },
      }
    : {
        id: titleId,
        type: 'title',
        x: 64,
        y: 48,
        width: DEFAULT_TITLE_OBJECT_WIDTH,
        height: DEFAULT_TITLE_OBJECT_HEIGHT,
        zIndex: next.length + 1,
        groupId: null,
        props: {
          text: resolvedTitle,
        },
      };

  next = next.filter(object => object.id !== titleId && object.type !== 'title');
  next = [...next, titleObject];

  return normaliseZIndices(next);
};

const normalizeAtom = (component: unknown): DroppedAtom | null => {
  if (!component || typeof component !== 'object') {
    return null;
  }

  const candidate = component as Partial<DroppedAtom & ExhibitionComponentPayload>;

  const resolvedId = isNonEmptyString(candidate.id) ? candidate.id.trim() : undefined;
  const resolvedAtomId = isNonEmptyString(candidate.atomId)
    ? candidate.atomId.trim()
    : isNonEmptyString(candidate.id)
      ? candidate.id.trim()
      : undefined;

  const title = isNonEmptyString(candidate.title)
    ? candidate.title.trim()
    : 'Untitled Component';

  const category = isNonEmptyString(candidate.category)
    ? candidate.category.trim()
    : 'General';

  const color = isNonEmptyString(candidate.color)
    ? candidate.color.trim()
    : FALLBACK_COLOR;

  const metadata = parseMetadataRecord(candidate.metadata);

  const id = resolvedId ?? resolvedAtomId ?? `atom-${Math.random().toString(36).slice(2, 10)}`;
  let atomId = resolvedAtomId ?? id;

  if (
    looksLikeFeatureOverviewMetadata(metadata) &&
    (!resolvedAtomId ||
      atomId === id ||
      atomId.toLowerCase().includes('feature-overview') ||
      category.toLowerCase().includes('feature overview'))
  ) {
    atomId = 'feature-overview';
  }

  return {
    id,
    atomId,
    title,
    category,
    color,
    metadata,
  };
};

const normaliseAtomList = (atoms: unknown): DroppedAtom[] => {
  if (!Array.isArray(atoms)) {
    return [];
  }

  return dedupeAtoms(
    atoms
      .map(atom => normalizeAtom(atom))
      .filter((atom): atom is DroppedAtom => atom !== null),
  );
};

const contextsMatch = (a: ProjectContext | null, b: ProjectContext | null): boolean => {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return (
    a.client_name === b.client_name &&
    a.app_name === b.app_name &&
    a.project_name === b.project_name
  );
};

const withPresentationDefaults = (card: Partial<LayoutCard>): LayoutCard => {
  const atoms = normaliseAtomList(card.atoms);
  const catalogueAtoms = mergeCatalogueAtoms(normaliseAtomList(card.catalogueAtoms), atoms);

  const id = isNonEmptyString(card.id)
    ? card.id.trim()
    : `exhibition-slide-${Math.random().toString(36).slice(2, 10)}`;

  const moleculeId = isNonEmptyString(card.moleculeId) ? card.moleculeId.trim() : undefined;
  const moleculeTitle = isNonEmptyString(card.moleculeTitle) ? card.moleculeTitle.trim() : undefined;
  const nowIso = new Date().toISOString();

  const resolvedTitle = isNonEmptyString(card.title)
    ? card.title.trim()
    : moleculeTitle
      ? moleculeTitle
      : atoms.length > 0
        ? atoms[0].title
        : 'Untitled Slide';

  const resolvedLastEditedAt = isValidDateString(card.lastEditedAt)
    ? new Date(card.lastEditedAt).toISOString()
    : nowIso;

  return {
    id,
    atoms,
    catalogueAtoms,
    isExhibited: typeof card.isExhibited === 'boolean' ? card.isExhibited : true,
    moleculeId,
    moleculeTitle,
    title: resolvedTitle,
    lastEditedAt: resolvedLastEditedAt,
    presentationSettings: ensurePresentationSettings(card.presentationSettings),
  };
};

const extractCards = (cards: LayoutCard[] | unknown): LayoutCard[] => {
  if (!Array.isArray(cards)) {
    return [];
  }

  return cards
    .map((card, index) => {
      if (!card || typeof card !== 'object') {
        return null;
      }

      const partial = card as Partial<LayoutCard>;
      const baseId = isNonEmptyString(partial.id)
        ? partial.id.trim()
        : isNonEmptyString(partial.moleculeId)
          ? `exhibition-slide-${partial.moleculeId.trim()}`
          : `exhibition-slide-${index + 1}`;

      return withPresentationDefaults({
        ...partial,
        id: baseId,
      });
    })
    .filter((card): card is LayoutCard => card !== null);
};

const createBlankSlide = (): LayoutCard =>
  withPresentationDefaults({
    id: `exhibition-slide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    atoms: [],
    catalogueAtoms: [],
    isExhibited: true,
    moleculeTitle: 'Untitled Slide',
  });

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
  slideObjectsByCardId: {},

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

    set(state => {
      const shouldResetSlides = resolvedContext
        ? !contextsMatch(state.lastLoadedContext, resolvedContext)
        : false;

      const remoteCards = loadedCards.map(withPresentationDefaults);
      const hasRemoteCards = remoteCards.length > 0;
      const preservedCards = state.cards.map(withPresentationDefaults);
      const baseCards = shouldResetSlides ? [] : preservedCards;

      let ensuredCards: LayoutCard[] = [];
      let insertedBlankSlide = false;

      if (baseCards.length > 0) {
        ensuredCards = baseCards;
      } else if (hasRemoteCards) {
        ensuredCards = [];
      } else {
        ensuredCards = [createBlankSlide()];
        insertedBlankSlide = true;
      }

      const nextExhibitedCards = ensuredCards.filter(card => card.isExhibited);
      const nextCatalogueCards = hasRemoteCards
        ? computeCatalogueCards(remoteCards)
        : computeCatalogueCards(ensuredCards);

      const nextSlideObjects: Record<string, SlideObject[]> = {};
      ensuredCards.forEach(card => {
        nextSlideObjects[card.id] = synchroniseSlideObjects(state.slideObjectsByCardId[card.id], card);
      });

      console.info(
        `[Exhibition] Exhibition catalogue ready with ${nextCatalogueCards.length} catalogue card(s)` +
          (resolvedContext ? ` for ${contextLabel}` : ' without a remote context'),
      );

      if (nextCatalogueCards.length > 0) {
        nextCatalogueCards.forEach(card => {
          const availableCount = card.catalogueAtoms?.length ?? 0;
          console.info(
            `[Exhibition] Catalogue entry ${card.id} resolved with ${availableCount} exhibited component(s)` +
              (card.moleculeTitle ? ` (${card.moleculeTitle})` : ''),
          );
        });
      } else {
        console.info(
          '[Exhibition] Exhibition catalogue has no components to display after processing remote data',
        );
      }

      if (shouldResetSlides && state.cards.length > 0) {
        console.info(
          '[Exhibition] Cleared existing exhibition slides to reflect the new project context',
        );
      }

      if (insertedBlankSlide) {
        console.info('[Exhibition] Inserted a blank slide to initialise exhibition mode');
      } else if (hasRemoteCards && ensuredCards.length === 0) {
        console.info(
          '[Exhibition] Loaded catalogue components without slides so the canvas will start empty until a slide is created',
        );
      }

      console.info(
        `[Exhibition] Exhibition slides ready with ${ensuredCards.length} slide card(s) and ${nextExhibitedCards.length} active slide(s)` +
          (resolvedContext ? ` for ${contextLabel}` : ''),
      );

      return {
        cards: ensuredCards,
        exhibitedCards: nextExhibitedCards,
        catalogueCards: nextCatalogueCards,
        catalogueEntries,
        lastLoadedContext: resolvedContext,
        slideObjectsByCardId: nextSlideObjects,
      };
    });
  },

  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => {
    set(state => {
      const shouldRefreshTimestamp = Object.keys(updatedCard).some(key => key !== 'lastEditedAt');
      const timestamp = new Date().toISOString();

      let updatedCards = state.cards.map(card => {
        if (card.id !== cardId) {
          return card;
        }

        const nextCard: LayoutCard = {
          ...card,
          ...updatedCard,
        };

        if (shouldRefreshTimestamp) {
          nextCard.lastEditedAt = timestamp;
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
          isExhibited: true,
          lastEditedAt: timestamp,
          ...updatedCard,
        });
        updatedCards = [...updatedCards, fallbackCard];
      }

      const exhibitedCards = updatedCards.filter(card => card.isExhibited);
      const nextSlideObjects: Record<string, SlideObject[]> = {};
      updatedCards.forEach(card => {
        nextSlideObjects[card.id] = synchroniseSlideObjects(state.slideObjectsByCardId[card.id], card);
      });
      return {
        cards: updatedCards,
        exhibitedCards,
        catalogueCards: state.catalogueCards,
        catalogueEntries: state.catalogueEntries,
        slideObjectsByCardId: nextSlideObjects,
      };
    });
  },

  addBlankSlide: (afterSlideIndex?: number) => {
    let createdCard: LayoutCard | null = null;

    set(state => {
      const newCard = createBlankSlide();

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

      const slideObjectsByCardId = {
        ...state.slideObjectsByCardId,
        [newCard.id]: synchroniseSlideObjects([], newCard),
      };

      return {
        cards,
        exhibitedCards,
        catalogueCards: state.catalogueCards,
        catalogueEntries: state.catalogueEntries,
        slideObjectsByCardId,
      };
    });

    return createdCard;
  },

  setCards: (cards: LayoutCard[] | unknown) => {
    const safeCards = extractCards(cards);

    const cardsWithDefaults = safeCards.map(withPresentationDefaults);

    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    set(state => {
      const nextSlideObjects: Record<string, SlideObject[]> = {};
      cardsWithDefaults.forEach(card => {
        nextSlideObjects[card.id] = synchroniseSlideObjects(state.slideObjectsByCardId[card.id], card);
      });

      return {
        cards: cardsWithDefaults,
        exhibitedCards,
        catalogueCards: state.catalogueCards,
        catalogueEntries: state.catalogueEntries,
        slideObjectsByCardId: nextSlideObjects,
      };
    });
  },
  addSlideObject: (cardId: string, object: SlideObject) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      const maxZ = existing.reduce((acc, entry) => Math.max(acc, entry.zIndex ?? 0), 0);
      const prepared: SlideObject = {
        ...object,
        zIndex: typeof object.zIndex === 'number' ? object.zIndex : maxZ + 1,
      };
      const index = existing.findIndex(entry => entry.id === prepared.id);
      const nextList =
        index === -1
          ? [...existing, prepared]
          : existing.map(entry => (entry.id === prepared.id ? { ...entry, ...prepared } : entry));

      return {
        slideObjectsByCardId: {
          ...state.slideObjectsByCardId,
          [cardId]: normaliseZIndices(nextList),
        },
      };
    });
  },
  bulkUpdateSlideObjects: (cardId: string, updates: Record<string, Partial<SlideObject>>) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      let changed = false;
      const next = existing.map(object => {
        const patch = updates[object.id];
        if (!patch) {
          return object;
        }
        changed = true;
        return { ...object, ...patch };
      });

      if (!changed) {
        return {};
      }

      return {
        slideObjectsByCardId: {
          ...state.slideObjectsByCardId,
          [cardId]: next,
        },
      };
    });
  },
  removeSlideObject: (cardId: string, objectId: string) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      const filtered = existing.filter(object => object.id !== objectId);
      if (filtered.length === existing.length) {
        return {};
      }

      return {
        slideObjectsByCardId: {
          ...state.slideObjectsByCardId,
          [cardId]: filtered,
        },
      };
    });
  },
  bringSlideObjectsToFront: (cardId: string, objectIds: string[]) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      if (existing.length === 0 || objectIds.length === 0) {
        return {};
      }

      const targetSet = new Set(objectIds);
      const next = existing.filter(object => !targetSet.has(object.id)).concat(
        existing.filter(object => targetSet.has(object.id)),
      );

      return {
        slideObjectsByCardId: {
          ...state.slideObjectsByCardId,
          [cardId]: normaliseZIndices(next),
        },
      };
    });
  },
  sendSlideObjectsToBack: (cardId: string, objectIds: string[]) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      if (existing.length === 0 || objectIds.length === 0) {
        return {};
      }

      const targetSet = new Set(objectIds);
      const next = existing
        .filter(object => targetSet.has(object.id))
        .concat(existing.filter(object => !targetSet.has(object.id)));

      return {
        slideObjectsByCardId: {
          ...state.slideObjectsByCardId,
          [cardId]: normaliseZIndices(next),
        },
      };
    });
  },
  groupSlideObjects: (cardId: string, objectIds: string[], groupId: string | null) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      if (existing.length === 0 || objectIds.length === 0) {
        return {};
      }

      const targetSet = new Set(objectIds);
      const next = existing.map(object =>
        targetSet.has(object.id) ? { ...object, groupId: groupId ?? null } : object,
      );

      return {
        slideObjectsByCardId: {
          ...state.slideObjectsByCardId,
          [cardId]: next,
        },
      };
    });
  },
  reset: () => {
    set({
      cards: [],
      exhibitedCards: [],
      catalogueCards: [],
      catalogueEntries: [],
      lastLoadedContext: null,
      slideObjectsByCardId: {},
    });
  },
}));
