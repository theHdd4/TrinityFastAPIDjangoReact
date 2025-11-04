import React, {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Calendar, Sparkles, StickyNote, Settings, Trash2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import {
  GRADIENT_STYLE_MAP,
  isSolidToken,
  isKnownGradientId,
  isGradientToken,
  solidTokenToHex,
} from '@/templates/color-tray';
import {
  useExhibitionStore,
  CardLayout,
  CardColor,
  LayoutCard,
  DroppedAtom,
  PresentationSettings,
  DEFAULT_PRESENTATION_SETTINGS,
  type SlideBackgroundColor,
  type SlideBackgroundPreset,
  type SlideObject,
  DEFAULT_CANVAS_OBJECT_WIDTH,
  DEFAULT_CANVAS_OBJECT_HEIGHT,
  CANVAS_SNAP_GRID,
  buildSlideTitleObjectId,
  resolveCardTitle,
} from '../../store/exhibitionStore';
import ExhibitedAtomRenderer from '../ExhibitedAtomRenderer';
import { CardFormattingPanel } from '../operationsPalette/CardFormattingPanel';
import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  cloneTableHeaders,
  cloneTableMatrix,
  createDefaultHeaderCell,
  createEmptyCell,
  createEmptyTableRow,
  ensureTableStyleId,
  normaliseTableData,
  normaliseTableHeaders,
  type TableCellData,
  type TableCellFormatting,
} from '../operationsPalette/tables/constants';
import { DEFAULT_TEXT_BOX_TEXT, extractTextBoxFormatting } from '../operationsPalette/textBox/constants';
import { TextBoxPositionPanel } from '../operationsPalette/textBox/TextBoxPositionPanel';
import type { TextBoxFormatting } from '../operationsPalette/textBox/types';
import SlideObjectContextMenu, { AlignAction } from '../SlideObjectContextMenu';
import CanvasStage from './CanvasStage';
import {
  applyOpacityToHex,
  cloneValue,
  generateObjectId,
  isAtomObject,
  normaliseHexColor,
  resolveLayerValue,
  snapToGrid,
} from './utils';
import { MIN_TEXT_OBJECT_HEIGHT, MIN_TEXT_OBJECT_WIDTH } from './constants';

interface CanvasDropPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const slideBackgroundClassNames: Record<SlideBackgroundPreset, string> = {
  default: 'bg-card',
  ivory: 'bg-amber-100',
  slate: 'bg-slate-200',
  charcoal: 'bg-neutral-300',
  indigo: 'bg-indigo-100',
  emerald: 'bg-emerald-100',
  rose: 'bg-rose-100',
};

const resolveSlideBackground = (
  settings: PresentationSettings,
): { className: string; style: React.CSSProperties | undefined } => {
  const mode = settings.backgroundMode ?? 'preset';
  const opacity = Number.isFinite(settings.backgroundOpacity) ? Number(settings.backgroundOpacity) : 100;

  if (mode === 'image' && settings.backgroundImageUrl) {
    return {
      className: '',
      style: {
        backgroundImage: `url(${settings.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
      },
    };
  }

  if (mode === 'gradient') {
    const start = settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart;
    const end = settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd;
    const direction = settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection;
    const startColor = applyOpacityToHex(start, opacity);
    const endColor = applyOpacityToHex(end, opacity);
    return {
      className: '',
      style: {
        backgroundImage: `linear-gradient(${direction}, ${startColor}, ${endColor})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }

  if (mode === 'solid') {
    const color = settings.backgroundSolidColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    return {
      className: '',
      style: {
        backgroundColor: applyOpacityToHex(color, opacity),
      },
    };
  }

  const background = settings.backgroundColor;
  if (isSolidToken(background)) {
    const color = solidTokenToHex(background);
    return {
      className: '',
      style: {
        backgroundColor: opacity >= 100 ? color : applyOpacityToHex(color, opacity),
      },
    };
  }

  if (isGradientToken(background)) {
    const gradient = GRADIENT_STYLE_MAP[background] ?? null;
    if (gradient) {
      return {
        className: '',
        style: {
          backgroundImage: gradient,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        },
      };
    }
  }

  const className =
    slideBackgroundClassNames[(background as SlideBackgroundPreset) ?? 'default'] ??
    slideBackgroundClassNames.default;

  return { className, style: undefined };
};

const UNTITLED_SLIDE_TEXT = 'Untitled Slide';

const formattingShallowEqual = (a: TableCellFormatting, b: TableCellFormatting) => {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.align === b.align &&
    a.color === b.color
  );
};

export interface SlideCanvasProps {
  card: LayoutCard;
  slideNumber: number;
  totalSlides: number;
  onDrop: (
    atom: DroppedAtom,
    sourceCardId: string,
    targetCardId: string,
    origin: 'catalogue' | 'slide',
    placement: CanvasDropPlacement,
  ) => void;
  draggedAtom?: { atom: DroppedAtom; cardId: string; origin: 'catalogue' | 'slide' } | null;
  canEdit?: boolean;
  onPresentationChange?: (settings: PresentationSettings, cardId: string) => void;
  onRemoveAtom?: (atomId: string) => void;
  onShowNotes?: () => void;
  viewMode?: 'horizontal' | 'vertical';
  isActive?: boolean;
  onTitleChange?: (title: string, cardId: string) => void;
  presenterName?: string | null;
  onPositionPanelChange?: (panel: ReactNode | null) => void;
  onUndo?: () => void;
  presentationMode?: boolean;
}

export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  card,
  slideNumber,
  totalSlides,
  onDrop,
  draggedAtom,
  canEdit = true,
  onPresentationChange,
  onRemoveAtom,
  onShowNotes,
  viewMode = 'horizontal',
  isActive = false,
  onTitleChange,
  presenterName,
  onPositionPanelChange,
  onUndo,
  presentationMode = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [settings, setSettings] = useState<PresentationSettings>(() => ({
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...card.presentationSettings,
  }));
  const [activeTextToolbar, setActiveTextToolbar] = useState<ReactNode | null>(null);
  const [positionPanelTarget, setPositionPanelTarget] = useState<{ objectId: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const presentationContainerRef = useRef<HTMLDivElement | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({
    width: DEFAULT_PRESENTATION_WIDTH,
    height: CANVAS_STAGE_HEIGHT,
  });
  const latestCanvasDimensionsRef = useRef(canvasDimensions);
  const presentationModeRef = useRef(presentationMode);
  const presentationBaseDimensionsRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const [presentationScale, setPresentationScale] = useState(1);
  const effectiveGridSize = useMemo(() => {
    const candidate = Number.isFinite(settings.gridSize) ? Number(settings.gridSize) : DEFAULT_PRESENTATION_SETTINGS.gridSize;
    return Math.min(200, Math.max(4, Math.round(candidate)));
  }, [settings.gridSize]);
  const snapToGridEnabled = settings.snapToGrid !== false;
  const showGridOverlay = settings.showGrid ?? false;
  const showGuidesOverlay = settings.showGuides ?? false;
  const showSlideNumber = settings.showSlideNumber ?? true;
  const slideNumberPosition = settings.slideNumberPosition ?? DEFAULT_PRESENTATION_SETTINGS.slideNumberPosition;
  const slideNumberClass = useMemo(() => {
    switch (slideNumberPosition) {
      case 'top-left':
        return 'left-5 top-5';
      case 'top-right':
        return 'right-5 top-5';
      case 'bottom-left':
        return 'left-5 bottom-5';
      case 'bottom-right':
      default:
        return 'right-5 bottom-5';
    }
  }, [slideNumberPosition]);
  const accessibilityStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {};
    if (settings.highContrast) {
      style.filter = 'contrast(1.2)';
    }
    if (settings.largeText) {
      style.fontSize = '1.05em';
    }
    if (settings.reducedMotion) {
      style.transitionDuration = '0ms';
    }
    return style;
  }, [settings.highContrast, settings.largeText, settings.reducedMotion]);

  const slideObjects = useExhibitionStore(
    useCallback(state => state.slideObjectsByCardId[card.id] ?? [], [card.id]),
  );
  const activeTheme = useExhibitionStore(state => state.activeTheme);
  const bulkUpdateSlideObjects = useExhibitionStore(state => state.bulkUpdateSlideObjects);
  const bringSlideObjectsToFront = useExhibitionStore(state => state.bringSlideObjectsToFront);
  const bringSlideObjectsForward = useExhibitionStore(state => state.bringSlideObjectsForward);
  const sendSlideObjectsToBack = useExhibitionStore(state => state.sendSlideObjectsToBack);
  const sendSlideObjectsBackward = useExhibitionStore(state => state.sendSlideObjectsBackward);
  const groupSlideObjects = useExhibitionStore(state => state.groupSlideObjects);
  const removeSlideObject = useExhibitionStore(state => state.removeSlideObject);
  const addSlideObjectToStore = useExhibitionStore(state => state.addSlideObject);
  const updateCardInStore = useExhibitionStore(state => state.updateCard);

  const titleObjectId = useMemo(() => buildSlideTitleObjectId(card.id), [card.id]);
  const atomObjects = useMemo(() => slideObjects.filter(isAtomObject), [slideObjects]);
  const nonStructuralObjects = useMemo(
    () =>
      slideObjects.filter(object => {
        if (object.type === 'accent-image') {
          return false;
        }
        if (object.type === 'text-box' && object.id === titleObjectId) {
          return false;
        }
        return true;
      }),
    [slideObjects, titleObjectId],
  );

  const positionPanelObject = useMemo(() => {
    if (!positionPanelTarget) {
      return null;
    }
    const match = slideObjects.find(
      object => object.id === positionPanelTarget.objectId && object.type === 'text-box',
    );
    return match ?? null;
  }, [positionPanelTarget, slideObjects]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver !== 'function') {
      return;
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasDimensions(prev => {
          if (presentationModeRef.current) {
            return prev;
          }
          const nextWidth = width > 0 ? width : prev.width;
          const nextHeight = height > 0 ? height : prev.height;
          if (Math.abs(prev.width - nextWidth) < 0.5 && Math.abs(prev.height - nextHeight) < 0.5) {
            return prev;
          }
          return {
            width: nextWidth,
            height: nextHeight,
          };
        });
      }
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, [card.id]);

  useEffect(() => {
    latestCanvasDimensionsRef.current = canvasDimensions;
  }, [canvasDimensions]);

  useEffect(() => {
    presentationModeRef.current = presentationMode;
    if (presentationMode) {
      if (!presentationBaseDimensionsRef.current) {
        const { width, height } = latestCanvasDimensionsRef.current;
        presentationBaseDimensionsRef.current = {
          width: width > 0 ? width : DEFAULT_PRESENTATION_WIDTH,
          height: height > 0 ? height : CANVAS_STAGE_HEIGHT,
        };
      }
    } else {
      presentationBaseDimensionsRef.current = null;
    }
  }, [presentationMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!presentationMode) {
      setPresentationScale(1);
      return;
    }

    const updateScale = () => {
      const container = presentationContainerRef.current;
      if (!container) {
        return;
      }

      const baseDimensions = presentationBaseDimensionsRef.current ?? latestCanvasDimensionsRef.current;
      const baseWidth = baseDimensions.width || DEFAULT_PRESENTATION_WIDTH;
      const baseHeight = baseDimensions.height || CANVAS_STAGE_HEIGHT;
      if (baseWidth === 0 || baseHeight === 0) {
        return;
      }

      const availableWidth = Math.max(container.clientWidth - PRESENTATION_PADDING, 0);
      const availableHeight = Math.max(container.clientHeight - PRESENTATION_PADDING, 0);
      if (availableWidth === 0 || availableHeight === 0) {
        setPresentationScale(1);
        return;
      }

      const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight);
      setPresentationScale(scale > 0 ? scale : 1);
    };

    updateScale();

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => updateScale())
      : null;

    const container = presentationContainerRef.current;
    if (container && resizeObserver) {
      resizeObserver.observe(container);
    }

    window.addEventListener('resize', updateScale);

    return () => {
      window.removeEventListener('resize', updateScale);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [canvasDimensions.height, canvasDimensions.width, presentationMode]);

  const handleBulkUpdate = useCallback(
    (updates: Record<string, Partial<SlideObject>>) => {
      bulkUpdateSlideObjects(card.id, updates);
    },
    [bulkUpdateSlideObjects, card.id],
  );

  const handleBringToFront = useCallback(
    (objectIds: string[]) => {
      if (objectIds.length === 0) {
        return;
      }
      bringSlideObjectsToFront(card.id, objectIds);
    },
    [bringSlideObjectsToFront, card.id],
  );

  const handleSendToBack = useCallback(
    (objectIds: string[]) => {
      if (objectIds.length === 0) {
        return;
      }
      sendSlideObjectsToBack(card.id, objectIds);
    },
    [card.id, sendSlideObjectsToBack],
  );

  const handleGroupObjects = useCallback(
    (objectIds: string[], groupId: string | null) => {
      if (objectIds.length === 0) {
        return;
      }
      groupSlideObjects(card.id, objectIds, groupId);
    },
    [card.id, groupSlideObjects],
  );

  const layoutDefaultColors: Record<CardLayout, CardColor> = useMemo(
    () => ({
      none: 'default',
      top: 'blue',
      bottom: 'green',
      right: 'purple',
      left: 'orange',
      full: 'purple',
    }),
    [],
  );

  const themeContext = useMemo(() => {
    if (!activeTheme) {
      return {
        containerStyle: undefined as React.CSSProperties | undefined,
        backgroundStyle: undefined as React.CSSProperties | undefined,
        accent: undefined as string | undefined,
        borderRadius: undefined as string | undefined,
        shadow: undefined as string | undefined,
        foreground: undefined as string | undefined,
      };
    }

    const backgroundValue = activeTheme.gradients.background || activeTheme.colors.background;
    const backgroundStyle =
      typeof backgroundValue === 'string' && backgroundValue.startsWith('linear-gradient')
        ? { backgroundImage: backgroundValue }
        : { backgroundColor: backgroundValue };

    return {
      containerStyle: {
        fontFamily: activeTheme.fonts.body,
        '--exhibition-theme-primary': activeTheme.colors.primary,
        '--exhibition-theme-secondary': activeTheme.colors.secondary,
        '--exhibition-theme-accent': activeTheme.colors.accent,
        '--exhibition-theme-muted': activeTheme.colors.muted,
        '--exhibition-theme-border': activeTheme.colors.border,
        '--exhibition-theme-heading-font': activeTheme.fonts.heading,
        '--exhibition-theme-body-font': activeTheme.fonts.body,
      } as React.CSSProperties,
      backgroundStyle,
      accent: activeTheme.gradients.accent || activeTheme.colors.accent,
      borderRadius: activeTheme.effects.borderRadius,
      shadow: activeTheme.effects.shadow,
      foreground: activeTheme.colors.foreground,
    };
  }, [activeTheme]);

  const shouldApplyThemeBackground = useMemo(() => {
    const mode = settings.backgroundMode ?? 'preset';
    if (mode !== 'preset') {
      return false;
    }

    const backgroundColor =
      settings.backgroundColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundColor;

    return backgroundColor === 'default' || backgroundColor === DEFAULT_PRESENTATION_SETTINGS.backgroundColor;
  }, [settings.backgroundMode, settings.backgroundColor]);

  const themeBackgroundStyle = shouldApplyThemeBackground ? themeContext.backgroundStyle : undefined;

  const accentButtonStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!themeContext.accent) {
      return undefined;
    }
    const accent = themeContext.accent;
    if (accent.startsWith('linear-gradient')) {
      return {
        backgroundImage: accent,
        color: '#ffffff',
      };
    }
    return {
      backgroundColor: accent,
      color: '#ffffff',
    };
  }, [themeContext.accent]);

  const cardWidthClass = settings.cardWidth === 'M' ? 'max-w-4xl' : 'max-w-6xl';

  useEffect(() => {
    setSettings({
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...card.presentationSettings,
    });
  }, [card]);

  useEffect(() => {
    if (!canEdit) {
      setShowFormatPanel(false);
    }
  }, [canEdit]);

  useEffect(() => {
    setActiveTextToolbar(null);
  }, [card.id, canEdit]);

  useEffect(() => {
    if (!canEdit) {
      setPositionPanelTarget(null);
      return;
    }

    if (positionPanelTarget && !positionPanelObject) {
      setPositionPanelTarget(null);
    }
  }, [canEdit, positionPanelObject, positionPanelTarget]);

  useEffect(() => {
    if (nonStructuralObjects.length > 0) {
      setHasInteracted(true);
    } else {
      setHasInteracted(false);
    }
  }, [card.id, nonStructuralObjects.length]);

  const updateSettings = useCallback(
    (partial: Partial<PresentationSettings>) => {
      setSettings(prev => {
        if (!canEdit) {
          return prev;
        }

        const backgroundLocked = Boolean(prev.backgroundLocked);
        if (backgroundLocked && !('backgroundLocked' in partial)) {
          const restrictedKeys: (keyof PresentationSettings)[] = [
            'cardColor',
            'accentImage',
            'accentImageName',
            'backgroundColor',
            'fullBleed',
            'cardLayout',
            'backgroundMode',
            'backgroundSolidColor',
            'backgroundGradientStart',
            'backgroundGradientEnd',
            'backgroundGradientDirection',
            'backgroundImageUrl',
            'backgroundOpacity',
          ];
          const attemptingBackgroundChange = restrictedKeys.some(key => key in partial);
          if (attemptingBackgroundChange) {
            toast({
              title: 'Background locked',
              description: 'Unlock the slide background before changing these settings.',
            });
            return prev;
          }
        }

        const merged = { ...prev, ...partial } as PresentationSettings;

        if ('cardLayout' in partial && !('cardColor' in partial)) {
          const targetLayout = partial.cardLayout ?? prev.cardLayout;
          const mappedColor = layoutDefaultColors[targetLayout];
          if (!merged.accentImage && mappedColor && merged.cardColor !== mappedColor) {
            merged.cardColor = mappedColor;
          }
        }

        if ('accentImage' in partial && !partial.accentImage) {
          const fallbackColor = layoutDefaultColors[merged.cardLayout] ?? 'default';
          merged.cardColor = fallbackColor;
          merged.accentImage = null;
        }

        if ('accentImageName' in partial && !partial.accentImageName) {
          merged.accentImageName = null;
        }

        if (typeof merged.backgroundLocked !== 'boolean') {
          merged.backgroundLocked = Boolean(prev.backgroundLocked);
        }

        onPresentationChange?.(merged, card.id);
        return merged;
      });
    },
    [canEdit, card.id, layoutDefaultColors, onPresentationChange, toast],
  );

  const resetSettings = useCallback(() => {
    if (!canEdit) {
      return;
    }
    const defaults = { ...DEFAULT_PRESENTATION_SETTINGS };
    setSettings(defaults);
    onPresentationChange?.(defaults, card.id);
  }, [canEdit, card.id, onPresentationChange]);

  const layoutConfig = useMemo(() => {
    const shared = {
      showOverview: true,
      gridClass: 'grid-cols-1 md:grid-cols-2',
      wrapper: '',
      contentClass: '',
      overviewOuterClass: '',
      overviewContainerClass: '',
    } as const;

    switch (settings.cardLayout) {
      case 'none':
        return {
          ...shared,
        };
      case 'top':
      case 'bottom':
        return {
          ...shared,
        };
      case 'left':
      case 'right':
        return {
          ...shared,
          wrapper: 'lg:flex-row lg:items-stretch',
          contentClass: 'lg:w-[35%] lg:pr-8',
          overviewOuterClass: 'lg:flex-1 lg:pl-8 min-h-0',
          overviewContainerClass: 'h-full',
        };
      case 'full':
      default:
        return {
          ...shared,
          gridClass: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        };
    }
  }, [settings.cardLayout]);

  const showOverview = layoutConfig.showOverview && atomObjects.length > 1;

  const resolvedTitle = useMemo(() => resolveCardTitle(card), [card]);

  const presenterLabel = useMemo(() => {
    if (typeof presenterName === 'string' && presenterName.trim().length > 0) {
      return presenterName.trim();
    }
    return 'Unknown Presenter';
  }, [presenterName]);

  const formattedLastEdited = useMemo(() => {
    if (typeof card.lastEditedAt !== 'string') {
      return 'Not available';
    }
    const timestamp = new Date(card.lastEditedAt);
    if (Number.isNaN(timestamp.getTime())) {
      return 'Not available';
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(timestamp);
    } catch {
      return timestamp.toLocaleString();
    }
  }, [card.lastEditedAt]);

  const [hasInteracted, setHasInteracted] = useState(
    () => nonStructuralObjects.length > 0,
  );

  const handleTitleCommit = useCallback(
    (nextTitle: string) => {
      if (!canEdit) {
        return;
      }

      const trimmed = nextTitle.trim();
      const resolved = trimmed.length > 0 ? trimmed : UNTITLED_SLIDE_TEXT;

      if (resolved !== resolvedTitle) {
        onTitleChange?.(resolved, card.id);
      }
    },
    [canEdit, card.id, onTitleChange, resolvedTitle],
  );

  const handleCanvasInteraction = useCallback(() => {
    setHasInteracted(true);
  }, []);

  const handleRequestPositionPanel = useCallback(
    (objectId: string) => {
      if (!canEdit) {
        return;
      }
      setShowFormatPanel(false);
      setPositionPanelTarget({ objectId });
    },
    [canEdit],
  );

  const handleBringForwardMany = useCallback(
    (objectIds: string[]) => {
      if (objectIds.length === 0) {
        return;
      }
      bringSlideObjectsForward(card.id, objectIds);
      handleCanvasInteraction();
    },
    [bringSlideObjectsForward, card.id, handleCanvasInteraction],
  );

  const handleSendBackwardMany = useCallback(
    (objectIds: string[]) => {
      if (objectIds.length === 0) {
        return;
      }
      sendSlideObjectsBackward(card.id, objectIds);
      handleCanvasInteraction();
    },
    [card.id, handleCanvasInteraction, sendSlideObjectsBackward],
  );

  const handleBringForward = useCallback(
    (objectId: string) => {
      handleBringForwardMany([objectId]);
    },
    [handleBringForwardMany],
  );

  const handleSendBackward = useCallback(
    (objectId: string) => {
      handleSendBackwardMany([objectId]);
    },
    [handleSendBackwardMany],
  );

  const handlePanelBringToFront = useCallback(
    (objectId: string) => {
      handleBringToFront([objectId]);
      handleCanvasInteraction();
    },
    [handleBringToFront, handleCanvasInteraction],
  );

  const handlePanelSendToBack = useCallback(
    (objectId: string) => {
      handleSendToBack([objectId]);
      handleCanvasInteraction();
    },
    [handleCanvasInteraction, handleSendToBack],
  );

  const updateTextBoxGeometry = useCallback(
    (
      objectId: string,
      updates: { width?: number; height?: number; x?: number; y?: number; rotation?: number },
    ) => {
      if (!canEdit) {
        return;
      }

      const target = slideObjects.find(object => object.id === objectId && object.type === 'text-box');
      if (!target) {
        return;
      }

      const canvas = canvasRef.current;

      const rawWidth = updates.width;
      const rawHeight = updates.height;

      let nextWidth =
        typeof rawWidth === 'number' && Number.isFinite(rawWidth) ? rawWidth : target.width;
      let nextHeight =
        typeof rawHeight === 'number' && Number.isFinite(rawHeight) ? rawHeight : target.height;

      const minWidth = MIN_TEXT_OBJECT_WIDTH;
      const minHeight = MIN_TEXT_OBJECT_HEIGHT;

      nextWidth = Math.max(minWidth, nextWidth);
      nextHeight = Math.max(minHeight, nextHeight);

      if (canvas) {
        nextWidth = Math.max(minWidth, Math.min(nextWidth, canvas.clientWidth));
        nextHeight = Math.max(minHeight, Math.min(nextHeight, canvas.clientHeight));
      }

      const rawX = updates.x;
      const rawY = updates.y;

      let nextX = typeof rawX === 'number' && Number.isFinite(rawX) ? rawX : target.x;
      let nextY = typeof rawY === 'number' && Number.isFinite(rawY) ? rawY : target.y;

      if (canvas) {
        const maxX = Math.max(0, canvas.clientWidth - nextWidth);
        const maxY = Math.max(0, canvas.clientHeight - nextHeight);
        nextX = Math.min(Math.max(0, nextX), maxX);
        nextY = Math.min(Math.max(0, nextY), maxY);
      } else {
        nextX = Math.max(0, nextX);
        nextY = Math.max(0, nextY);
      }

      const currentRotation = typeof target.rotation === 'number' ? target.rotation : 0;
      let nextRotation = currentRotation;
      if (typeof updates.rotation === 'number' && Number.isFinite(updates.rotation)) {
        nextRotation = updates.rotation;
      }

      const payload: Partial<SlideObject> = {};

      if (nextWidth !== target.width) {
        payload.width = nextWidth;
      }
      if (nextHeight !== target.height) {
        payload.height = nextHeight;
      }
      if (nextX !== target.x) {
        payload.x = nextX;
      }
      if (nextY !== target.y) {
        payload.y = nextY;
      }
      if (nextRotation !== currentRotation) {
        payload.rotation = nextRotation;
      }

      if (Object.keys(payload).length === 0) {
        return;
      }

      handleCanvasInteraction();
      handleBulkUpdate({
        [objectId]: payload,
      });
    },
    [canEdit, handleBulkUpdate, handleCanvasInteraction, slideObjects],
  );

  const alignTextBoxToCanvas = useCallback(
    (objectId: string, alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const target = slideObjects.find(object => object.id === objectId && object.type === 'text-box');
      if (!target) {
        return;
      }

      const updates: { x?: number; y?: number } = {};

      if (alignment === 'top') {
        updates.y = 0;
      } else if (alignment === 'middle') {
        updates.y = (canvas.clientHeight - target.height) / 2;
      } else if (alignment === 'bottom') {
        updates.y = canvas.clientHeight - target.height;
      } else if (alignment === 'left') {
        updates.x = 0;
      } else if (alignment === 'center') {
        updates.x = (canvas.clientWidth - target.width) / 2;
      } else if (alignment === 'right') {
        updates.x = canvas.clientWidth - target.width;
      }

      if (Object.keys(updates).length === 0) {
        return;
      }

      updateTextBoxGeometry(objectId, updates);
    },
    [slideObjects, updateTextBoxGeometry],
  );

  const closePositionPanel = useCallback(() => {
    setPositionPanelTarget(null);
  }, []);

  const positionPanelNode = useMemo(() => {
    if (!canEdit || !positionPanelObject) {
      return null;
    }

    return (
      <TextBoxPositionPanel
        object={positionPanelObject}
        onClose={closePositionPanel}
        onBringForward={() => handleBringForward(positionPanelObject.id)}
        onSendBackward={() => handleSendBackward(positionPanelObject.id)}
        onBringToFront={() => handlePanelBringToFront(positionPanelObject.id)}
        onSendToBack={() => handlePanelSendToBack(positionPanelObject.id)}
        onAlign={alignment => alignTextBoxToCanvas(positionPanelObject.id, alignment)}
        onGeometryChange={updates => updateTextBoxGeometry(positionPanelObject.id, updates)}
      />
    );
  }, [
    alignTextBoxToCanvas,
    canEdit,
    closePositionPanel,
    handleBringForward,
    handlePanelBringToFront,
    handlePanelSendToBack,
    handleSendBackward,
    positionPanelObject,
    updateTextBoxGeometry,
  ]);

  const handleAtomRemove = useCallback(
    (atomId: string) => {
      if (!canEdit) {
        return;
      }
      onRemoveAtom?.(atomId);
    },
    [canEdit, onRemoveAtom],
  );

  const handleDragOver = (e: React.DragEvent) => {
    if (!canEdit || !draggedAtom) {
      return;
    }
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* ignore */
    }
    setIsDragOver(true);
    handleCanvasInteraction();
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!canEdit || !draggedAtom) {
      return;
    }
    e.preventDefault();
    setIsDragOver(false);
    handleCanvasInteraction();
    const canvas = canvasRef.current;
    const width = DEFAULT_CANVAS_OBJECT_WIDTH;
    const height = DEFAULT_CANVAS_OBJECT_HEIGHT;
    let dropX = 0;
    let dropY = 0;

    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      dropX = e.clientX - rect.left - width / 2;
      dropY = e.clientY - rect.top - height / 2;
      const maxX = Math.max(0, canvas.clientWidth - width);
      const maxY = Math.max(0, canvas.clientHeight - height);
      dropX = Math.min(Math.max(0, dropX), maxX);
      dropY = Math.min(Math.max(0, dropY), maxY);
      if (snapToGridEnabled) {
        dropX = Math.min(Math.max(0, snapToGrid(dropX, effectiveGridSize)), maxX);
        dropY = Math.min(Math.max(0, snapToGrid(dropY, effectiveGridSize)), maxY);
      }
    } else {
      if (snapToGridEnabled) {
        dropX = snapToGrid(dropX, effectiveGridSize);
        dropY = snapToGrid(dropY, effectiveGridSize);
      }
    }

    onDrop(draggedAtom.atom, draggedAtom.cardId, card.id, draggedAtom.origin, {
      x: dropX,
      y: dropY,
      width,
      height,
    });
  };

  const handleCloseFormatPanel = useCallback(() => {
    setShowFormatPanel(false);
  }, []);

  const handleShowFormatPanel = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setShowFormatPanel(true);
    setPositionPanelTarget(null);
  }, [canEdit, setPositionPanelTarget]);

  const handleToggleBackgroundLock = useCallback(() => {
    if (!canEdit) {
      toast({
        title: 'Editing disabled',
        description: 'Enable editing to modify the slide background.',
      });
      return;
    }

    const nextLocked = !Boolean(settings.backgroundLocked);
    const nextSettings: PresentationSettings = {
      ...settings,
      backgroundLocked: nextLocked,
    };

    setSettings(nextSettings);
    onPresentationChange?.(nextSettings, card.id);
    toast({
      title: nextLocked ? 'Background locked' : 'Background unlocked',
      description: nextLocked
        ? 'Slide background updates are now disabled until you unlock it.'
        : 'Background updates have been re-enabled for this slide.',
    });
  }, [canEdit, settings, onPresentationChange, card.id]);

  const formatPanelNode = useMemo(() => {
    if (!canEdit || !showFormatPanel) {
      return null;
    }

    return (
      <CardFormattingPanel
        settings={settings}
        canEdit={canEdit}
        onUpdateSettings={updateSettings}
        onReset={resetSettings}
        onClose={handleCloseFormatPanel}
      />
    );
  }, [
    canEdit,
    handleCloseFormatPanel,
    resetSettings,
    settings,
    showFormatPanel,
    updateSettings,
  ]);

  const operationsPanelNode = useMemo(
    () => formatPanelNode ?? positionPanelNode,
    [formatPanelNode, positionPanelNode],
  );

  const lastProvidedOperationsPanel = useRef<ReactNode | null>(null);

  useEffect(() => {
    if (!onPositionPanelChange) {
      return;
    }

    if (operationsPanelNode !== lastProvidedOperationsPanel.current) {
      onPositionPanelChange(operationsPanelNode);
      lastProvidedOperationsPanel.current = operationsPanelNode;
    }
  }, [onPositionPanelChange, operationsPanelNode]);

  useEffect(() => {
    return () => {
      if (onPositionPanelChange && lastProvidedOperationsPanel.current) {
        onPositionPanelChange(null);
        lastProvidedOperationsPanel.current = null;
      }
    };
  }, [onPositionPanelChange]);

  const { className: slideBackgroundClass, style: slideBackgroundStyle } = useMemo(
    () =>
      resolveSlideBackground({
        ...settings,
      }),
    [
      settings.backgroundColor,
      settings.backgroundMode,
      settings.backgroundGradientDirection,
      settings.backgroundGradientEnd,
      settings.backgroundGradientStart,
      settings.backgroundImageUrl,
      settings.backgroundOpacity,
      settings.backgroundSolidColor,
    ],
  );

  const containerClasses = presentationMode
    ? 'flex-1 h-full overflow-hidden bg-neutral-950 flex items-center justify-center'
    : viewMode === 'horizontal'
      ? 'flex-1 h-full overflow-auto bg-muted/20'
      : cn(
          'w-full overflow-hidden border rounded-3xl transition-all duration-300 shadow-sm bg-muted/20',
          isActive
            ? 'border-primary shadow-elegant ring-1 ring-primary/30'
            : 'border-border hover:border-primary/40'
        );

  const containerClassName = cn(
    containerClasses,
    settings.reducedMotion && 'transition-none motion-reduce:transition-none',
  );

  const slideThemeStyle: React.CSSProperties = useMemo(() => {
    return {
      ...(themeContext.containerStyle ?? {}),
      ...(themeBackgroundStyle ?? {}),
      ...slideBackgroundStyle,
      ...(!settings.fullBleed && themeContext.borderRadius
        ? { borderRadius: themeContext.borderRadius }
        : {}),
      ...(themeContext.foreground ? { color: themeContext.foreground } : {}),
    };
  }, [
    slideBackgroundStyle,
    themeBackgroundStyle,
    themeContext.borderRadius,
    themeContext.containerStyle,
    themeContext.foreground,
    settings.fullBleed,
  ]);

  return (
    <div className={containerClassName} style={accessibilityStyle}>
      <div
        ref={presentationMode ? presentationContainerRef : undefined}
        className={
          presentationMode
            ? 'flex h-full w-full items-center justify-center p-12 bg-neutral-950'
            : cn('mx-auto transition-all duration-300 p-8', cardWidthClass)
        }
      >
        {viewMode === 'vertical' && (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Slide {slideNumber}
            </span>
            {isActive && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                Current
              </span>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            {!presentationMode && canEdit && (
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 top-0 flex justify-center transition-all duration-200',
                  activeTextToolbar ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
                )}
              >
                {activeTextToolbar && (
                  <div className="pointer-events-auto z-30 drop-shadow-xl">{activeTextToolbar}</div>
                )}
              </div>
            )}

            <div
              className={cn(
                'flex flex-col gap-4',
                !presentationMode && canEdit ? 'pt-16' : undefined,
              )}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div
                  className={cn(
                    'relative overflow-hidden shadow-2xl transition-all duration-300',
                    presentationMode ? 'w-auto' : 'w-full',
                    slideBackgroundClass,
                    settings.fullBleed
                      ? 'rounded-none border-0'
                      : 'rounded-[28px] border border-border/60',
                    isDragOver && canEdit && draggedAtom ? 'scale-[0.98] ring-4 ring-primary/20' : undefined,
                    !canEdit && !presentationMode && 'opacity-90'
                  )}
                  data-exhibition-slide="true"
                  data-exhibition-slide-id={card.id}
                style={
                  presentationMode
                    ? {
                        ...slideThemeStyle,
                        height:
                          (presentationBaseDimensionsRef.current?.height ?? canvasDimensions.height) ||
                          CANVAS_STAGE_HEIGHT,
                        width:
                          (presentationBaseDimensionsRef.current?.width ?? canvasDimensions.width) ||
                          DEFAULT_PRESENTATION_WIDTH,
                        transform: `scale(${presentationScale})`,
                        transformOrigin: 'center center',
                        margin: '0 auto',
                      }
                    : {
                        ...slideThemeStyle,
                        height: CANVAS_STAGE_HEIGHT,
                      }
                }
                onDragOver={presentationMode ? undefined : handleDragOver}
                onDragLeave={presentationMode ? undefined : handleDragLeave}
                onDrop={presentationMode ? undefined : handleDrop}
              >
                <CanvasStage
                  ref={canvasRef}
                  canEdit={canEdit}
                  isDragOver={Boolean(isDragOver && canEdit && draggedAtom)}
                  objects={slideObjects}
                  showEmptyState={!hasInteracted && nonStructuralObjects.length === 0}
                  layout={settings.cardLayout}
                  cardColor={settings.cardColor}
                  accentImage={settings.accentImage ?? null}
                  accentImageName={settings.accentImageName ?? null}
                  titleObjectId={titleObjectId}
                  onAddObject={object => addSlideObjectToStore(card.id, object)}
                  onAddAtom={atom =>
                    updateCardInStore(card.id, {
                      atoms: [...(card.atoms ?? []), atom],
                    })
                  }
                  fullBleed={settings.fullBleed}
                  onCanvasDragLeave={handleDragLeave}
                  onCanvasDragOver={handleDragOver}
                  onCanvasDrop={handleDrop}
                  onInteract={handleCanvasInteraction}
                  onRemoveAtom={handleAtomRemove}
                  onBringToFront={handleBringToFront}
                  onBringForward={handleBringForwardMany}
                  onSendBackward={handleSendBackwardMany}
                  onSendToBack={handleSendToBack}
                  onBulkUpdate={handleBulkUpdate}
                  onGroupObjects={handleGroupObjects}
                  onTitleCommit={handleTitleCommit}
                  onRemoveObject={objectId => removeSlideObject(card.id, objectId)}
                  onTextToolbarChange={setActiveTextToolbar}
                  onRequestPositionPanel={handleRequestPositionPanel}
                  onUndo={onUndo}
                  backgroundLocked={Boolean(settings.backgroundLocked)}
                  onToggleBackgroundLock={handleToggleBackgroundLock}
                  onRequestFormatPanel={handleShowFormatPanel}
                  snapToGridEnabled={snapToGridEnabled}
                  gridSize={effectiveGridSize}
                  showGrid={showGridOverlay}
                  showGuides={showGuidesOverlay}
                />
                {showSlideNumber && (
                  <div
                    className={cn(
                      'pointer-events-none absolute z-40 rounded-full bg-neutral-900/85 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-sm',
                      slideNumberClass,
                    )}
                  >
                    Slide {slideNumber}
                  </div>
                )}

                {!presentationMode && (
                  <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-lg hover:bg-background"
                      onClick={() => {
                        setShowFormatPanel(false);
                        setPositionPanelTarget(null);
                        onShowNotes?.();
                      }}
                      type="button"
                    >
                      <StickyNote className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className={cn(
                        'h-8 w-8 bg-background/90 backdrop-blur-sm shadow-lg hover:bg-background transition-colors',
                        showFormatPanel && 'border border-primary/40 text-primary'
                      )}
                      onClick={() => setShowFormatPanel(prev => !prev)}
                      disabled={!canEdit}
                      type="button"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className={cn(
                        'h-8 w-8 shadow-lg transition-colors',
                        accentButtonStyle
                          ? 'text-white hover:opacity-95'
                          : 'bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600',
                      )}
                      type="button"
                      disabled={!canEdit}
                      style={accentButtonStyle}
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

            </div>
          </div>

          {!presentationMode && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-foreground">
                <User className="h-4 w-4" />
                <span className="font-semibold">Exhibition presenter:</span>
                <span>{presenterLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-foreground" />
                <span className="font-semibold text-foreground">Last edited:</span>
                <span>{formattedLastEdited}</span>
              </div>
            </div>
          )}
          <OverviewSection
            visible={showOverview}
            outerClassName={layoutConfig.overviewOuterClass}
            containerClassName={layoutConfig.overviewContainerClass}
            gridClassName={layoutConfig.gridClass}
            atomObjects={atomObjects}
            canEdit={canEdit}
            onRemoveAtom={handleAtomRemove}
          />

          {viewMode === 'horizontal' && !presentationMode && (
            <div className="mt-6 text-center">
              <span className="inline-block px-4 py-2 bg-muted rounded-full text-sm font-medium text-muted-foreground">
                Slide {slideNumber} of {totalSlides}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
};

const resolveCardOverlayStyle = (color: CardColor): React.CSSProperties => {
  if (isSolidToken(color)) {
    return {
      backgroundColor: solidTokenToHex(color),
    };
  }

  if (isKnownGradientId(color)) {
    const gradient = GRADIENT_STYLE_MAP[color];
    if (gradient) {
      return {
        backgroundImage: gradient,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
  }

  const fallback = GRADIENT_STYLE_MAP.default;
  return {
    backgroundImage: fallback,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
};

export const CANVAS_STAGE_HEIGHT = 520;
export const DEFAULT_PRESENTATION_WIDTH = 960;
export const PRESENTATION_PADDING = 160;
const TOP_LAYOUT_MIN_HEIGHT = 210;
const BOTTOM_LAYOUT_MIN_HEIGHT = 220;
const SIDE_LAYOUT_MIN_WIDTH = 280;
const SIDE_LAYOUT_RATIO = 0.34;

const LayoutOverlay: React.FC<{
  layout: CardLayout;
  color: CardColor;
  accentImage?: string | null;
  accentImageName?: string | null;
  fullBleed: boolean;
}> = ({ layout, color, accentImage, accentImageName, fullBleed }) => {
  if (layout === 'none') {
    return null;
  }

  const overlayStyle = useMemo(() => resolveCardOverlayStyle(color), [color]);
  const wrapperClass = cn(
    'pointer-events-none absolute inset-0 overflow-hidden transition-all duration-300 ease-out',
    'shadow-[0_32px_72px_-32px_rgba(76,29,149,0.45)]',
    fullBleed ? 'rounded-none' : 'rounded-[28px]'
  );

  const content = accentImage ? (
    <img
      src={accentImage}
      alt={accentImageName ?? 'Accent image'}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="h-full w-full" style={overlayStyle} />
  );

  if (layout === 'full') {
    return <div className={wrapperClass}>{content}</div>;
  }

  const renderVerticalOverlay = (position: 'top' | 'bottom') => {
    const minHeight = position === 'top' ? TOP_LAYOUT_MIN_HEIGHT : BOTTOM_LAYOUT_MIN_HEIGHT;
    const ratio = minHeight / CANVAS_STAGE_HEIGHT;

    return (
      <div className={wrapperClass}>
        <div className="flex h-full w-full flex-col">
          {position === 'bottom' && <div className="flex-1 min-h-0" />}
          <div
            className="relative flex-shrink-0 overflow-hidden"
            style={{ flexBasis: `${ratio * 100}%`, minHeight }}
          >
            {content}
          </div>
          {position === 'top' && <div className="flex-1 min-h-0" />}
        </div>
      </div>
    );
  };

  const renderHorizontalOverlay = (position: 'left' | 'right') => {
    return (
      <div className={wrapperClass}>
        <div className="flex h-full w-full flex-row">
          {position === 'right' && <div className="flex-1 min-w-0" />}
          <div
            className="relative flex-shrink-0 overflow-hidden"
            style={{ flexBasis: `${SIDE_LAYOUT_RATIO * 100}%`, minWidth: SIDE_LAYOUT_MIN_WIDTH }}
          >
            {content}
          </div>
          {position === 'left' && <div className="flex-1 min-w-0" />}
        </div>
      </div>
    );
  };

  switch (layout) {
    case 'top':
      return renderVerticalOverlay('top');
    case 'bottom':
      return renderVerticalOverlay('bottom');
    case 'left':
      return renderHorizontalOverlay('left');
    case 'right':
      return renderHorizontalOverlay('right');
    default:
      return <div className={wrapperClass}>{content}</div>;
  }
};

interface OverviewSectionProps {
  visible: boolean;
  outerClassName: string;
  containerClassName: string;
  gridClassName: string;
  atomObjects: (SlideObject & { props: { atom: DroppedAtom } })[];
  canEdit: boolean;
  onRemoveAtom: (atomId: string) => void;
}

const OverviewSection: React.FC<OverviewSectionProps> = ({
  visible,
  outerClassName,
  containerClassName,
  gridClassName,
  atomObjects,
  canEdit,
  onRemoveAtom,
}) => {
  if (!visible) {
    return null;
  }

  return (
    <div className={cn('px-8 pb-8 flex flex-col flex-1 min-h-0 overflow-hidden', outerClassName)}>
      <div
        className={cn(
          'bg-muted/30 rounded-xl border border-border p-6 flex-1 overflow-y-auto',
          containerClassName,
        )}
      >
        <h2 className="text-2xl font-bold text-foreground mb-6">Components Overview</h2>

        <div className={cn('grid gap-4', gridClassName)}>
          {atomObjects.map(object => {
            const atom = object.props.atom;

            return (
              <div
                key={object.id}
                className="relative group p-6 border-2 border-border bg-card rounded-xl hover:shadow-lg hover:border-primary/50 transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-3 h-3 ${atom.color} rounded-full flex-shrink-0`} />
                  <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">
                    {atom.title}
                  </h3>
                </div>
                <div className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full mb-3">
                  {atom.category}
                </div>
                <div className="text-sm text-muted-foreground space-y-3">
                  <ExhibitedAtomRenderer atom={atom} variant="compact" />
                </div>

                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-3 right-3 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveAtom(atom.id)}
                    type="button"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SlideCanvas;
