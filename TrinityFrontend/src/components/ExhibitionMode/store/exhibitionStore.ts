
import { create } from 'zustand';
import {
  fetchExhibitionConfiguration,
  ExhibitionAtomPayload,
  ExhibitionComponentPayload,
  fetchExhibitionLayout,
  type ExhibitionLayoutResponse,
} from '@/lib/exhibition';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';
import type {
  GradientColorId,
  GradientColorToken,
  SolidColorToken,
} from '@/templates/color-tray';
import {
  isKnownGradientId,
  isSolidToken,
  isGradientToken,
} from '@/templates/color-tray';
import {
  DEFAULT_EXHIBITION_THEME,
  type ExhibitionTheme,
} from '../themes';
import { getThemeStyleDefaults } from '../themeUtils';
import { DEFAULT_CHART_CONFIG } from '../components/operationsPalette/charts/constants';
import type { ChartConfig } from '../components/operationsPalette/charts/types';

export type CardColor = GradientColorId | SolidColorToken;
export type SlideBackgroundPreset =
  | 'default'
  | 'ivory'
  | 'slate'
  | 'charcoal'
  | 'indigo'
  | 'emerald'
  | 'rose';
export type SlideBackgroundColor = SlideBackgroundPreset | SolidColorToken | GradientColorToken;
export type CardWidth = 'M' | 'L';
export type ContentAlignment = 'top' | 'center' | 'bottom';
export type CardLayout = 'none' | 'top' | 'bottom' | 'right' | 'left' | 'full';

const DEFAULT_CARD_LAYOUT: CardLayout = 'right';
const TABLE_DEFAULT_STYLE_ID = 'transparent';

const CARD_LAYOUTS: readonly CardLayout[] = ['none', 'top', 'bottom', 'right', 'left', 'full'] as const;
const SLIDE_BACKGROUND_PRESETS: readonly SlideBackgroundPreset[] = [
  'default',
  'ivory',
  'slate',
  'charcoal',
  'indigo',
  'emerald',
  'rose',
] as const;
const CARD_WIDTHS: readonly CardWidth[] = ['M', 'L'] as const;
const CONTENT_ALIGNMENTS: readonly ContentAlignment[] = ['top', 'center', 'bottom'] as const;
const SLIDESHOW_TRANSITIONS: readonly SlideshowTransition[] = ['fade', 'slide', 'zoom'] as const;

const EXHIBITION_LOCAL_STORAGE_KEYS: readonly string[] = [
  'exhibition-layout-cache',
  'exhibition-layout',
  'exhibition-layout-cards',
  'exhibition-catalogue',
  'exhibition_catalogue',
  'exhibition-catalogue-cache',
  'exhibitionCatalogue',
];

const EXHIBITION_LOCAL_STORAGE_PREFIXES: readonly string[] = ['exhibition::'];
const CATALOGUE_STORAGE_NAMESPACE = 'exhibition::catalogue::';

const PERSISTENT_EXHIBITION_KEYS = new Set<string>(['exhibition-notes']);

const purgeLegacyExhibitionCache = (): void => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return;
  }

  try {
    const { localStorage } = window;

    EXHIBITION_LOCAL_STORAGE_KEYS.forEach(key => {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    });

    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key || PERSISTENT_EXHIBITION_KEYS.has(key)) {
        continue;
      }

      if (EXHIBITION_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('[Exhibition] Unable to purge legacy exhibition cache entries', error);
  }
};

const normaliseStorageSegment = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
};

const buildCatalogueStorageKey = (context: ProjectContext | null): string => {
  if (!context) {
    return `${CATALOGUE_STORAGE_NAMESPACE}local-cache`;
  }

  const parts = [context.client_name, context.app_name, context.project_name]
    .map(part => (typeof part === 'string' ? normaliseStorageSegment(part) : ''))
    .filter(Boolean);

  if (parts.length === 0) {
    return `${CATALOGUE_STORAGE_NAMESPACE}local-cache`;
  }

  return `${CATALOGUE_STORAGE_NAMESPACE}${parts.join('::')}`;
};

const refreshCatalogueLocalCache = (
  context: ProjectContext | null,
  entries: ExhibitionAtomPayload[],
  contextLabel: string,
): void => {
  if (typeof window === 'undefined' || !window?.localStorage) {
    return;
  }

  const storageKey = buildCatalogueStorageKey(context);

  try {
    if (!entries || entries.length === 0) {
      if (window.localStorage.getItem(storageKey) !== null) {
        window.localStorage.removeItem(storageKey);
        console.info(
          `[Exhibition] Cleared cached exhibition catalogue for ${contextLabel}`,
        );
      }
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(entries));
    console.info(
      `[Exhibition] Cached ${entries.length} exhibition catalogue entr${entries.length === 1 ? 'y' : 'ies'} for ${contextLabel}`,
    );
  } catch (error) {
    console.warn('[Exhibition] Unable to refresh exhibition catalogue local cache', error);
  }
};

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
  cardWidth: 'L',
  contentAlignment: 'center',
  fullBleed: false,
  cardLayout: DEFAULT_CARD_LAYOUT,
  accentImage: null,
  accentImageName: null,
  backgroundColor: 'default',
  slideshowDuration: 8,
  slideshowTransition: 'fade',
  backgroundLocked: false,
};

export interface PresentationSettings {
  cardColor: CardColor;
  cardWidth: CardWidth;
  contentAlignment: ContentAlignment;
  fullBleed: boolean;
  cardLayout: CardLayout;
  accentImage?: string | null;
  accentImageName?: string | null;
  backgroundColor: SlideBackgroundColor;
  slideshowDuration: number;
  slideshowTransition: SlideshowTransition;
  backgroundLocked?: boolean;
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
  rotation: number;
  groupId?: string | null;
  props: Record<string, unknown>;
}

export const DEFAULT_CANVAS_OBJECT_WIDTH = 420;
export const DEFAULT_CANVAS_OBJECT_HEIGHT = 320;
const DEFAULT_TITLE_OBJECT_WIDTH = 560;
const DEFAULT_TITLE_OBJECT_HEIGHT = 120;
export const CANVAS_SNAP_GRID = 8;

export const buildSlideTitleObjectId = (cardId: string) => `${cardId}::slide-title`;

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
  rotation: 0,
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
  activeTheme: ExhibitionTheme;
  loadSavedConfiguration: (context?: ProjectContext | null) => Promise<void>;
  updateCard: (cardId: string, updatedCard: Partial<LayoutCard>) => void;
  addBlankSlide: (afterSlideIndex?: number) => LayoutCard | null;
  setCards: (
    cards: LayoutCard[] | unknown,
    slideObjects?: Record<string, SlideObject[] | undefined>,
  ) => void;
  addSlideObject: (cardId: string, object: SlideObject) => void;
  bulkUpdateSlideObjects: (cardId: string, updates: Record<string, Partial<SlideObject>>) => void;
  removeSlideObject: (cardId: string, objectId: string) => void;
  removeSlide: (cardId: string) => void;
  bringSlideObjectsToFront: (cardId: string, objectIds: string[]) => void;
  bringSlideObjectsForward: (cardId: string, objectIds: string[]) => void;
  sendSlideObjectsToBack: (cardId: string, objectIds: string[]) => void;
  sendSlideObjectsBackward: (cardId: string, objectIds: string[]) => void;
  groupSlideObjects: (cardId: string, objectIds: string[], groupId: string | null) => void;
  applyTheme: (theme: ExhibitionTheme) => void;
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

const parseManifestRecord = (value: unknown): Record<string, any> | undefined => {
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
        console.warn('[Exhibition] Unable to parse manifest payload', error);
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

const looksLikeChartMakerMetadata = (metadata: Record<string, any> | undefined): boolean => {
  if (!metadata) {
    return false;
  }

  const hasChartId = typeof metadata.chartId === 'string' || typeof metadata.chart_id === 'string';
  const hasChartTitle = typeof metadata.chartTitle === 'string' || typeof metadata.chart_title === 'string';
  const hasChartState = metadata.chartState != null || metadata.chart_state != null;
  const hasChartContext = metadata.chartContext != null || metadata.chart_context != null;

  return Boolean(hasChartId && hasChartTitle && (hasChartState || hasChartContext));
};

const looksLikeEvaluateModelsFeatureMetadata = (metadata: Record<string, any> | undefined): boolean => {
  if (!metadata) {
    return false;
  }

  const hasGraphId = typeof metadata.graphId === 'string' || typeof metadata.graph_id === 'string';
  const hasGraphTitle = typeof metadata.graphTitle === 'string' || typeof metadata.graph_title === 'string';
  const hasGraphState = metadata.graphState != null || metadata.graph_state != null;
  const hasGraphContext = metadata.graphContext != null || metadata.graph_context != null;

  return Boolean(hasGraphId && hasGraphTitle && (hasGraphState || hasGraphContext));
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

const isValidCardColor = (value: unknown): value is CardColor => {
  if (typeof value !== 'string') {
    return false;
  }

  if (isSolidToken(value)) {
    return true;
  }

  if (isKnownGradientId(value)) {
    return true;
  }

  return false;
};

const isValidBackgroundColor = (value: unknown): value is SlideBackgroundColor => {
  if (typeof value !== 'string') {
    return false;
  }

  if ((SLIDE_BACKGROUND_PRESETS as readonly string[]).includes(value)) {
    return true;
  }

  if (isSolidToken(value)) {
    return true;
  }

  if (isGradientToken(value)) {
    return true;
  }

  return false;
};

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
  const backgroundColor = isValidBackgroundColor(candidate.backgroundColor)
    ? candidate.backgroundColor
    : DEFAULT_PRESENTATION_SETTINGS.backgroundColor;

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
    backgroundColor,
    slideshowDuration,
    slideshowTransition,
  };
};

const dedupeAtoms = (atoms: DroppedAtom[]): DroppedAtom[] => {
  const seen = new Set<string>();
  const result: DroppedAtom[] = [];

  console.log('🔍 ExhibitionStore - dedupeAtoms input:', atoms);
  atoms.forEach(atom => {
    // For EvaluateModelsFeature, just use the id since it's already unique (graph.id-combinationName)
    const key = atom.id ?? atom.atomId;
    console.log('🔍 ExhibitionStore - dedupeAtoms processing atom:', atom.atomId, 'id:', atom.id, 'title:', atom.title, 'key:', key);
    if (!key) {
      console.log('🔍 ExhibitionStore - dedupeAtoms skipping atom (no key):', atom);
      return;
    }
    if (seen.has(key)) {
      console.log('🔍 ExhibitionStore - dedupeAtoms DUPLICATE FOUND! Skipping:', atom.atomId, 'key:', key);
      return;
    }
    seen.add(key);
    result.push(atom);
    console.log('🔍 ExhibitionStore - dedupeAtoms ADDED:', atom.atomId, 'key:', key);
  });

  console.log('🔍 ExhibitionStore - dedupeAtoms result:', result);
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
  const titleId = buildSlideTitleObjectId(card.id);
  const resolvedTitle = resolveCardTitle(card, atoms);

  const ensureTitleProps = (props: Record<string, unknown> | undefined): Record<string, unknown> => {
    const nextProps: Record<string, unknown> = { ...(props || {}) };
    nextProps.text = resolvedTitle;
    const fontSize = Number(nextProps.fontSize);
    nextProps.fontSize = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 36;
    nextProps.fontFamily =
      typeof nextProps.fontFamily === 'string' && nextProps.fontFamily.trim().length > 0
        ? nextProps.fontFamily
        : 'Comic Sans';
    nextProps.bold = typeof nextProps.bold === 'boolean' ? nextProps.bold : true;
    nextProps.italic = Boolean(nextProps.italic);
    nextProps.underline = Boolean(nextProps.underline);
    nextProps.strikethrough = Boolean(nextProps.strikethrough);
    nextProps.align =
      nextProps.align === 'center' || nextProps.align === 'right' ? nextProps.align : 'left';
    nextProps.color =
      typeof nextProps.color === 'string' && nextProps.color.trim().length > 0
        ? nextProps.color
        : '#111827';
    return nextProps;
  };

  const createTitleObject = (base?: SlideObject | null): SlideObject => {
    const baseProps = base?.props as Record<string, unknown> | undefined;
    const resolvedZIndex = typeof base?.zIndex === 'number' ? base.zIndex : next.length + 1;

    return {
      id: titleId,
      type: 'text-box',
      x: typeof base?.x === 'number' ? base.x : 64,
      y: typeof base?.y === 'number' ? base.y : 48,
      width: typeof base?.width === 'number' ? base.width : DEFAULT_TITLE_OBJECT_WIDTH,
      height: typeof base?.height === 'number' ? base.height : DEFAULT_TITLE_OBJECT_HEIGHT,
      zIndex: resolvedZIndex,
      rotation: typeof base?.rotation === 'number' ? base.rotation : 0,
      groupId: base?.groupId ?? null,
      props: ensureTitleProps(baseProps),
    };
  };

  let titleSource: SlideObject | null = null;

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
        titleSource = { ...object };
      } else if (object.type === 'text-box' && object.id === titleId) {
        titleSource = { ...object };
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

  next = next.filter(object => object.type !== 'accent-image');

  const titleObject = createTitleObject(titleSource);

  next = next.filter(object => object.id !== titleId);
  const finalTitleObject: SlideObject = {
    ...titleObject,
    zIndex: typeof titleObject.zIndex === 'number' ? titleObject.zIndex : next.length + 1,
  };
  next = [...next, finalTitleObject];

  return normaliseZIndices(next);
};

const normalizeAtom = (component: unknown): DroppedAtom | null => {
  if (!component || typeof component !== 'object') {
    return null;
  }

  console.log('🔍 ExhibitionStore - normalizeAtom input:', component);
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

  const metadata = parseMetadataRecord(candidate.metadata) ?? {};
  const manifest = parseManifestRecord((candidate as Record<string, unknown>).manifest);
  const manifestIdRaw = (candidate as Record<string, unknown>).manifest_id;
  const manifestId = isNonEmptyString(manifestIdRaw) ? manifestIdRaw.trim() : undefined;

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

  if (
    looksLikeChartMakerMetadata(metadata) &&
    (!resolvedAtomId ||
      atomId === id ||
      atomId.toLowerCase().includes('chart-maker') ||
      category.toLowerCase().includes('chart maker'))
  ) {
    atomId = 'chart-maker';
  }

  if (
    looksLikeEvaluateModelsFeatureMetadata(metadata) &&
    (!resolvedAtomId ||
      atomId === id ||
      atomId.toLowerCase().includes('evaluate-models-feature') ||
      category.toLowerCase().includes('evaluate models feature'))
  ) {
    atomId = 'evaluate-models-feature';
  }

  if (manifest && metadata.visualizationManifest == null) {
    metadata.visualizationManifest = manifest;
  }

  if (manifestId && typeof manifestId === 'string') {
    metadata.manifestId = manifestId;
  }

  const result = {
    id,
    atomId,
    title,
    category,
    color,
    metadata,
  };
  console.log('🔍 ExhibitionStore - normalizeAtom result:', result);
  return result;
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

const normaliseSavedSlideObject = (value: unknown): SlideObject | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = isNonEmptyString(value.id) ? value.id.trim() : null;
  if (!id) {
    return null;
  }

  const type = isNonEmptyString(value.type) ? value.type.trim() : 'atom';
  const toNumber = (input: unknown, fallback: number): number => {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const props = isRecord(value.props) ? { ...value.props } : {};

  const groupId = isNonEmptyString(value.groupId) ? value.groupId.trim() : null;

  return {
    id,
    type,
    x: toNumber(value.x, 0),
    y: toNumber(value.y, 0),
    width: toNumber(value.width, DEFAULT_CANVAS_OBJECT_WIDTH),
    height: toNumber(value.height, DEFAULT_CANVAS_OBJECT_HEIGHT),
    zIndex: toNumber(value.zIndex, 1),
    rotation: toNumber(value.rotation, 0),
    groupId,
    props,
  };
};

const normaliseLayoutSlideObjects = (
  raw: Record<string, unknown> | undefined,
): Record<string, SlideObject[]> => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, SlideObject[]>>((acc, [cardId, value]) => {
    if (!isNonEmptyString(cardId) || !Array.isArray(value)) {
      return acc;
    }

    const objects = value
      .map(entry => normaliseSavedSlideObject(entry))
      .filter((entry): entry is SlideObject => entry !== null);

    acc[cardId] = objects;
    return acc;
  }, {} as Record<string, SlideObject[]>);
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
  console.log('🔍 ExhibitionStore - normaliseCatalogueComponent input:', component);
  const normalised = normalizeAtom(component);
  console.log('🔍 ExhibitionStore - normaliseCatalogueComponent normalized:', normalised);
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

  const extractedComponents = extractExhibitedComponents(entry as AtomEntryLike);
  console.log('🔍 ExhibitionStore - buildCardFromEntry for:', atomName, 'extracted components:', extractedComponents);

  const components = extractedComponents
    .map((component, index) => {
      console.log(`🔍 ExhibitionStore - Processing component ${index}:`, component);
      const normalized = normaliseCatalogueComponent(component, atomName);
      console.log(`🔍 ExhibitionStore - Normalized component ${index}:`, normalized);
      return normalized;
    })
    .filter((component): component is DroppedAtom => component !== null);

  console.log('🔍 ExhibitionStore - buildCardFromEntry normalized components:', components);

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
  activeTheme: DEFAULT_EXHIBITION_THEME,

  loadSavedConfiguration: async (explicitContext?: ProjectContext | null) => {
    let loadedCards: LayoutCard[] = [];
    let catalogueEntries: ExhibitionAtomPayload[] = [];
    let remoteCatalogueResolved = false;
    let layoutCards: LayoutCard[] = [];
    let layoutSlideObjects: Record<string, SlideObject[]> = {};
    const resolvedContext = normaliseProjectContext(explicitContext ?? getActiveProjectContext());
    const contextLabel = resolvedContext
      ? `${resolvedContext.client_name}/${resolvedContext.app_name}/${resolvedContext.project_name}`
      : 'local-cache';

    purgeLegacyExhibitionCache();

    if (resolvedContext) {
      console.info(
        `[Exhibition] Fetching exhibition catalogue from trinity_db.exhibition_catalogue for ${contextLabel}`,
      );
      try {
        const remote = await fetchExhibitionConfiguration(resolvedContext);
        remoteCatalogueResolved = true;
        const remoteAtoms = remote && Array.isArray(remote.atoms) ? remote.atoms : [];
        catalogueEntries = remoteAtoms;
        refreshCatalogueLocalCache(resolvedContext, remoteAtoms, contextLabel);

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

        try {
          const layoutResponse: ExhibitionLayoutResponse | null = await fetchExhibitionLayout(resolvedContext);
          if (layoutResponse) {
            layoutCards = extractCards(layoutResponse.cards);
            layoutSlideObjects = normaliseLayoutSlideObjects(layoutResponse.slide_objects);
            console.info(
              `[Exhibition] Retrieved exhibition layout with ${layoutCards.length} slide card(s) from trinity_db.exhibition_list_configuration for ${contextLabel}`,
            );
          } else {
            console.info(
              `[Exhibition] No exhibition layout entry found for ${contextLabel} in trinity_db.exhibition_list_configuration`,
            );
          }
        } catch (error) {
          console.warn(
            `[Exhibition] Failed to fetch exhibition layout for ${contextLabel} from trinity_db.exhibition_list_configuration`,
            error,
          );
        }
      } catch (error) {
        console.warn(
          `[Exhibition] Failed to fetch exhibition catalogue for ${contextLabel} from trinity_db.exhibition_catalogue`,
          error,
        );
        refreshCatalogueLocalCache(resolvedContext, [], contextLabel);
      }
    } else {
      console.info(
        '[Exhibition] Skipping exhibition catalogue fetch because no active project context was resolved',
      );
      refreshCatalogueLocalCache(null, [], contextLabel);
    }

    set(state => {
      const shouldResetSlides = resolvedContext
        ? !contextsMatch(state.lastLoadedContext, resolvedContext)
        : false;

      const remoteCards = loadedCards.map(withPresentationDefaults);
      const hasRemoteCards = remoteCards.length > 0;
      const shouldUseRemoteCatalogue = remoteCatalogueResolved;
      const hasLayoutCards = layoutCards.length > 0;
      const preparedLayoutCards = hasLayoutCards ? layoutCards.map(withPresentationDefaults) : [];
      const preservedCards = state.cards.map(withPresentationDefaults);
      const baseCards = shouldResetSlides ? [] : preservedCards;

      let ensuredCards: LayoutCard[] = [];
      let insertedBlankSlide = false;

      if (hasLayoutCards) {
        ensuredCards = preparedLayoutCards;
      } else if (baseCards.length > 0) {
        ensuredCards = baseCards;
      } else if (hasRemoteCards) {
        ensuredCards = [];
      } else {
        ensuredCards = [createBlankSlide()];
        insertedBlankSlide = true;
      }

      const nextExhibitedCards = ensuredCards.filter(card => card.isExhibited);
      const nextCatalogueCards = shouldUseRemoteCatalogue
        ? computeCatalogueCards(remoteCards)
        : computeCatalogueCards(ensuredCards);

      const nextSlideObjects: Record<string, SlideObject[]> = {};
      ensuredCards.forEach(card => {
        const savedObjects = layoutSlideObjects[card.id] ?? state.slideObjectsByCardId[card.id];
        nextSlideObjects[card.id] = synchroniseSlideObjects(savedObjects, card);
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
      } else if (shouldUseRemoteCatalogue) {
        console.info(
          '[Exhibition] Exhibition catalogue has no components to display after processing remote data',
        );
      } else {
        console.info('[Exhibition] Exhibition catalogue has no exhibited components available in local cache');
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
        catalogueEntries: shouldUseRemoteCatalogue ? catalogueEntries : [],
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
      const baseCard = createBlankSlide();
      const themeDefaults = getThemeStyleDefaults(state.activeTheme ?? DEFAULT_EXHIBITION_THEME);

      const newCard: LayoutCard = {
        ...baseCard,
        presentationSettings: {
          ...baseCard.presentationSettings,
          cardColor: themeDefaults.presentation.cardColor as CardColor,
          cardLayout: themeDefaults.presentation.cardLayout,
          backgroundColor: themeDefaults.presentation.backgroundColor as SlideBackgroundColor,
        },
      };

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

  setCards: (cards: LayoutCard[] | unknown, slideObjects?: Record<string, SlideObject[] | undefined>) => {
    const safeCards = extractCards(cards);

    const cardsWithDefaults = safeCards.map(withPresentationDefaults);

    const exhibitedCards = cardsWithDefaults.filter(card => card.isExhibited);
    set(state => {
      const nextSlideObjects: Record<string, SlideObject[]> = {};
      cardsWithDefaults.forEach(card => {
        const provided = slideObjects?.[card.id];
        if (provided) {
          nextSlideObjects[card.id] = synchroniseSlideObjects(provided, card);
          return;
        }

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
  removeSlide: (cardId: string) => {
    set(state => {
      if (!state.cards.some(card => card.id === cardId)) {
        return {};
      }

      const cards = state.cards.filter(card => card.id !== cardId);
      const exhibitedCards = cards.filter(card => card.isExhibited);
      const { [cardId]: _removed, ...remainingObjects } = state.slideObjectsByCardId;

      return {
        cards,
        exhibitedCards,
        slideObjectsByCardId: remainingObjects,
        catalogueCards: state.catalogueCards,
        catalogueEntries: state.catalogueEntries,
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
  bringSlideObjectsForward: (cardId: string, objectIds: string[]) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      if (existing.length === 0 || objectIds.length === 0) {
        return {};
      }

      const targetSet = new Set(objectIds);
      const next = [...existing];

      for (let index = next.length - 1; index > 0; index -= 1) {
        const previous = next[index - 1];
        const current = next[index];

        if (!targetSet.has(previous.id)) {
          continue;
        }

        if (targetSet.has(current.id)) {
          continue;
        }

        next[index - 1] = current;
        next[index] = previous;
      }

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
  sendSlideObjectsBackward: (cardId: string, objectIds: string[]) => {
    set(state => {
      const existing = state.slideObjectsByCardId[cardId] ?? [];
      if (existing.length === 0 || objectIds.length === 0) {
        return {};
      }

      const targetSet = new Set(objectIds);
      const next = [...existing];

      for (let index = 0; index < next.length - 1; index += 1) {
        const current = next[index + 1];
        const previous = next[index];

        if (!targetSet.has(current.id)) {
          continue;
        }

        if (targetSet.has(previous.id)) {
          continue;
        }

        next[index] = current;
        next[index + 1] = previous;
      }

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
  applyTheme: (theme: ExhibitionTheme) => {
    set(state => {
      const previousTheme = state.activeTheme ?? DEFAULT_EXHIBITION_THEME;
      const previousDefaults = getThemeStyleDefaults(previousTheme);
      const nextDefaults = getThemeStyleDefaults(theme);

      const defaultFonts = new Set(
        [
          'Comic Sans',
          previousTheme.fonts.heading,
          previousTheme.fonts.body,
        ].filter((value): value is string => Boolean(value)),
      );

      const defaultTextColors = new Set(
        [
          '#111827',
          previousTheme.colors.foreground,
          previousDefaults.text.color,
          previousDefaults.text.headingColor,
        ].filter((value): value is string => Boolean(value)),
      );

      const sanitiseChartConfig = (value: unknown): ChartConfig => {
        const candidate = isRecord(value) ? (value as Partial<ChartConfig>) : {};

        const type = typeof candidate.type === 'string' ? candidate.type : DEFAULT_CHART_CONFIG.type;
        const colorScheme = typeof candidate.colorScheme === 'string'
          ? candidate.colorScheme
          : DEFAULT_CHART_CONFIG.colorScheme;
        const legendPosition =
          candidate.legendPosition && typeof candidate.legendPosition === 'string'
            ? candidate.legendPosition
            : DEFAULT_CHART_CONFIG.legendPosition;

        return {
          ...DEFAULT_CHART_CONFIG,
          ...candidate,
          type: type as ChartConfig['type'],
          colorScheme,
          showLabels:
            typeof candidate.showLabels === 'boolean'
              ? candidate.showLabels
              : DEFAULT_CHART_CONFIG.showLabels,
          showValues:
            typeof candidate.showValues === 'boolean'
              ? candidate.showValues
              : DEFAULT_CHART_CONFIG.showValues,
          legendPosition,
          axisIncludesZero:
            typeof candidate.axisIncludesZero === 'boolean'
              ? candidate.axisIncludesZero
              : DEFAULT_CHART_CONFIG.axisIncludesZero,
          horizontalAlignment:
            candidate.horizontalAlignment ?? DEFAULT_CHART_CONFIG.horizontalAlignment,
        };
      };

      const slideObjectsByCardId = Object.entries(state.slideObjectsByCardId).reduce(
        (acc, [cardId, objects]) => {
          if (!Array.isArray(objects) || objects.length === 0) {
            acc[cardId] = objects ?? [];
            return acc;
          }

          const titleId = buildSlideTitleObjectId(cardId);
          acc[cardId] = objects.map(object => {
            if (object.type === 'text-box') {
              const props = { ...(object.props ?? {}) } as Record<string, any>;
              const isTitle = object.id === titleId;

              const targetFont = isTitle ? theme.fonts.heading : theme.fonts.body;
              const previousFont = isTitle ? previousTheme.fonts.heading : previousTheme.fonts.body;
              const currentFont = typeof props.fontFamily === 'string' ? props.fontFamily : '';

              if (!currentFont || currentFont === previousFont || defaultFonts.has(currentFont)) {
                props.fontFamily = targetFont;
              }

              const targetFontSize = isTitle
                ? nextDefaults.text.headingFontSize
                : nextDefaults.text.bodyFontSize;
              const previousFontSize = isTitle
                ? previousDefaults.text.headingFontSize
                : previousDefaults.text.bodyFontSize;
              const numericFontSize = Number(props.fontSize);

              if (!Number.isFinite(numericFontSize) || numericFontSize === previousFontSize) {
                props.fontSize = targetFontSize;
              }

              const previousColor = isTitle
                ? previousDefaults.text.headingColor ?? previousTheme.colors.foreground
                : previousDefaults.text.color ?? previousTheme.colors.foreground;
              const targetColor = isTitle
                ? nextDefaults.text.headingColor ?? theme.colors.foreground
                : nextDefaults.text.color ?? theme.colors.foreground;
              const currentColor = typeof props.color === 'string' ? props.color : '';

              if (!currentColor || currentColor === previousColor || defaultTextColors.has(currentColor)) {
                props.color = targetColor;
              }

              return {
                ...object,
                props,
              };
            }

            if (object.type === 'chart') {
              const props = { ...(object.props ?? {}) } as Record<string, unknown>;
              const config = sanitiseChartConfig(props.config);

              const matchesPreviousDefaults =
                config.type === previousDefaults.chart.type &&
                config.colorScheme === previousDefaults.chart.colorScheme &&
                config.showLabels === previousDefaults.chart.showLabels &&
                config.showValues === previousDefaults.chart.showValues &&
                config.legendPosition === previousDefaults.chart.legendPosition;

              const matchesBaseline =
                config.type === DEFAULT_CHART_CONFIG.type &&
                config.colorScheme === DEFAULT_CHART_CONFIG.colorScheme &&
                config.showLabels === DEFAULT_CHART_CONFIG.showLabels &&
                config.showValues === DEFAULT_CHART_CONFIG.showValues &&
                config.legendPosition === DEFAULT_CHART_CONFIG.legendPosition;

              if (matchesPreviousDefaults || matchesBaseline) {
                props.config = {
                  ...config,
                  ...nextDefaults.chart,
                };
              } else {
                props.config = config;
              }

              return {
                ...object,
                props,
              };
            }

            if (object.type === 'table') {
              const props = { ...(object.props ?? {}) } as Record<string, unknown>;
              const currentStyleId =
                typeof props.styleId === 'string' ? props.styleId : TABLE_DEFAULT_STYLE_ID;
              const previousStyleId = previousDefaults.tableStyleId ?? TABLE_DEFAULT_STYLE_ID;

              if (
                currentStyleId === previousStyleId ||
                currentStyleId === TABLE_DEFAULT_STYLE_ID ||
                !props.styleId
              ) {
                props.styleId = nextDefaults.tableStyleId;
              }

              return {
                ...object,
                props,
              };
            }

            return { ...object };
          });

          return acc;
        },
        {} as Record<string, SlideObject[]>,
      );

      const cards = state.cards.map(card => {
        const presentation = ensurePresentationSettings(card.presentationSettings);
        let changed = false;
        const nextPresentation = { ...presentation };

        const previousPresentation = previousDefaults.presentation;

        if (
          presentation.cardColor === previousPresentation.cardColor ||
          presentation.cardColor === DEFAULT_PRESENTATION_SETTINGS.cardColor
        ) {
          nextPresentation.cardColor = nextDefaults.presentation.cardColor as CardColor;
          changed = true;
        }

        if (
          presentation.cardLayout === previousPresentation.cardLayout ||
          presentation.cardLayout === DEFAULT_PRESENTATION_SETTINGS.cardLayout
        ) {
          nextPresentation.cardLayout = nextDefaults.presentation.cardLayout;
          changed = true;
        }

        if (
          presentation.backgroundColor === previousPresentation.backgroundColor ||
          presentation.backgroundColor === DEFAULT_PRESENTATION_SETTINGS.backgroundColor
        ) {
          nextPresentation.backgroundColor =
            nextDefaults.presentation.backgroundColor as SlideBackgroundColor;
          changed = true;
        }

        if (!changed) {
          return card;
        }

        return {
          ...card,
          presentationSettings: nextPresentation,
        };
      });

      const exhibitedCards = cards.filter(card => card.isExhibited);

      return {
        activeTheme: theme,
        slideObjectsByCardId,
        cards,
        exhibitedCards,
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
      activeTheme: DEFAULT_EXHIBITION_THEME,
    });
  },
}));
