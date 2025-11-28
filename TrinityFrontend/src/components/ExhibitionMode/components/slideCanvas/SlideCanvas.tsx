import React, {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  User,
  Calendar,
  Sparkles,
  StickyNote,
  Settings,
  Trash2,
  Copy,
  Clipboard,
  ClipboardPaste,
  CopyPlus,
  Scissors,
  Lock,
  Unlock,
  MessageSquarePlus,
  Edit3,
  Maximize2,
  Crop,
  ImagePlus,
} from 'lucide-react';
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
import { SlideTextBoxObject } from '../operationsPalette/textBox/TextBox';
import { DEFAULT_TEXT_BOX_TEXT, extractTextBoxFormatting } from '../operationsPalette/textBox/constants';
import { resolveFontFamily } from '../operationsPalette/textBox/fontLoading';
import type { TextBoxFormatting } from '../operationsPalette/textBox/types';
import { TextBoxPositionPanel } from '../operationsPalette/textBox/TextBoxPositionPanel';
import { CardFormattingPanel } from '../operationsPalette/CardFormattingPanel';
import { ExhibitionTable, type TableCellEditTarget } from '../operationsPalette/tables/ExhibitionTable';
import { SlideShapeObject } from '../operationsPalette/shapes';
import type { ShapeObjectProps } from '../operationsPalette/shapes/constants';
import { ChartDataEditor, parseChartObjectProps, isEditableChartType } from '../operationsPalette/charts';
import { SlideChartObject } from '../operationsPalette/charts/SlideChartObject';
import type { ChartConfig, ChartDataRow } from '../operationsPalette/charts';
import { SlideImageObject } from '../operationsPalette/images/SlideImageObject';
import {
  cloneTableHeaders,
  cloneTableMatrix,
  createDefaultHeaderCell,
  createEmptyCell,
  createEmptyTableRow,
  ensureTableStyleId,
  DEFAULT_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
  MAX_TABLE_COLUMN_WIDTH,
  DEFAULT_TABLE_ROW_HEIGHT,
  MIN_TABLE_ROW_HEIGHT,
  MAX_TABLE_ROW_HEIGHT,
  renumberDefaultTableHeaders,
  type TableCellFormatting,
} from '../operationsPalette/tables/constants';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import SlideObjectContextMenu, { AlignAction } from '../SlideObjectContextMenu';
import { COLOR_PROP_KEYS, UNTITLED_SLIDE_TEXT } from './constants';
import {
  ActiveInteraction,
  CanvasDropPlacement,
  EditingTextState,
  ResizeHandle,
  isAtomObject,
} from './types';
import {
  cloneValue,
  generateObjectId,
  isSlideObjectLocked,
  snapToGrid,
} from './utils';
import { resolveFeatureOverviewTransparency, resolveSlideBackground } from './background';
import { formattingShallowEqual, readTableState, tableStatesEqual, type TableState } from './table';
import { CropShape, ImageCropInsets, sanitizeImageCrop } from '../operationsPalette/images/toolbar/Crop';
import type { CardEditor } from '@/hooks/useCollaborativeSyncExhibition';



interface SlideCanvasProps {
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
  variant?: 'default' | 'preview';
  cardEditor?: CardEditor | null;
  onFocusCard?: (cardId: string) => void;
  onBlurCard?: (cardId: string) => void;
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
  variant = 'default',
  cardEditor = null,
  onFocusCard,
  onBlurCard,
}) => {
  const isPreview = variant === 'preview';
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
  const [canvasDimensions, setCanvasDimensions] = useState(() => {
    const cardWidth = card.presentationSettings?.cardWidth ?? DEFAULT_PRESENTATION_SETTINGS.cardWidth;
    const width = CARD_WIDTH_DIMENSIONS[cardWidth] ?? DEFAULT_PRESENTATION_WIDTH;
    return {
      width,
      height: CANVAS_STAGE_HEIGHT,
    };
  });
  const latestCanvasDimensionsRef = useRef(canvasDimensions);
  const presentationModeRef = useRef(presentationMode);
  const presentationBaseDimensionsRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const [presentationScale, setPresentationScale] = useState(1);
  const [isCanvasActive, setIsCanvasActive] = useState(false);
  const effectiveCanvasWidth = useMemo(() => {
    const cardWidth = settings.cardWidth ?? DEFAULT_PRESENTATION_SETTINGS.cardWidth;
    return CARD_WIDTH_DIMENSIONS[cardWidth] ?? DEFAULT_PRESENTATION_WIDTH;
  }, [settings.cardWidth]);
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
  const sortedSlideObjects = useMemo(() => {
    const next = [...slideObjects];
    next.sort((a, b) => {
      const aZ = typeof a.zIndex === 'number' ? a.zIndex : 0;
      const bZ = typeof b.zIndex === 'number' ? b.zIndex : 0;
      if (aZ !== bZ) {
        return aZ - bZ;
      }
      return a.id.localeCompare(b.id);
    });
    return next;
  }, [slideObjects]);
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

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) {
      return undefined;
    }

    const handleFocusIn = () => {
      setIsCanvasActive(true);
    };

    const handleFocusOut = () => {
      const activeElement = document.activeElement;
      if (!activeElement || !node.contains(activeElement)) {
        setIsCanvasActive(false);
      }
    };

    node.addEventListener('focusin', handleFocusIn);
    node.addEventListener('focusout', handleFocusOut);

    return () => {
      node.removeEventListener('focusin', handleFocusIn);
      node.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  const positionPanelObject = useMemo(() => {
    if (!positionPanelTarget) {
      return null;
    }

    const match = slideObjects.find(object => object.id === positionPanelTarget.objectId);
    if (!match) {
      return null;
    }

    if (match.type === 'text-box' || match.type === 'image') {
      return match;
    }

    return null;
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

      const availableWidth = Math.max(container.clientWidth, 0);
      const availableHeight = Math.max(container.clientHeight, 0);
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
  }, [canvasDimensions.height, canvasDimensions.width, presentationMode, isPreview]);

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

  const updateImageGeometry = useCallback(
    (
      objectId: string,
      updates: { width?: number; height?: number; x?: number; y?: number; rotation?: number },
    ) => {
      if (!canEdit) {
        return;
      }

      const target = slideObjects.find(object => object.id === objectId && object.type === 'image');
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

      nextWidth = Math.max(MIN_IMAGE_OBJECT_WIDTH, nextWidth);
      nextHeight = Math.max(MIN_IMAGE_OBJECT_HEIGHT, nextHeight);

      if (canvas) {
        nextWidth = Math.max(MIN_IMAGE_OBJECT_WIDTH, Math.min(nextWidth, canvas.clientWidth));
        nextHeight = Math.max(MIN_IMAGE_OBJECT_HEIGHT, Math.min(nextHeight, canvas.clientHeight));
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

  const alignImageToCanvas = useCallback(
    (objectId: string, alignment: 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right') => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      const target = slideObjects.find(object => object.id === objectId && object.type === 'image');
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

      updateImageGeometry(objectId, updates);
    },
    [slideObjects, updateImageGeometry],
  );

  const closePositionPanel = useCallback(() => {
    setPositionPanelTarget(null);
  }, []);

  const positionPanelNode = useMemo(() => {
    if (!canEdit || !positionPanelObject) {
      return null;
    }

    if (positionPanelObject.type === 'text-box') {
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
    }

    if (positionPanelObject.type === 'image') {
      return (
        <TextBoxPositionPanel
          object={positionPanelObject}
          onClose={closePositionPanel}
          onBringForward={() => handleBringForward(positionPanelObject.id)}
          onSendBackward={() => handleSendBackward(positionPanelObject.id)}
          onBringToFront={() => handlePanelBringToFront(positionPanelObject.id)}
          onSendToBack={() => handlePanelSendToBack(positionPanelObject.id)}
          onAlign={alignment => alignImageToCanvas(positionPanelObject.id, alignment)}
          onGeometryChange={updates => updateImageGeometry(positionPanelObject.id, updates)}
        />
      );
    }

    return null;
  }, [
    alignImageToCanvas,
    alignTextBoxToCanvas,
    canEdit,
    closePositionPanel,
    handleBringForward,
    handlePanelBringToFront,
    handlePanelSendToBack,
    handleSendBackward,
    positionPanelObject,
    updateImageGeometry,
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
    ? isPreview
      ? 'flex h-full w-full items-center justify-center bg-transparent'
      : 'flex-1 h-full overflow-hidden bg-neutral-950 flex items-center justify-center'
    : isPreview
      ? 'w-full overflow-hidden rounded-3xl border border-border bg-background'
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

  const editorColor = cardEditor?.user_color ?? '#3B82F6';
  const editorInitials = useMemo(() => {
    const source = cardEditor?.user_name || cardEditor?.user_email || '';
    if (!source) {
      return '';
    }
    return source
      .split(' ')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [cardEditor]);

  const editorDisplayName = useMemo(() => {
    return cardEditor?.user_name || cardEditor?.user_email || '';
  }, [cardEditor]);

  const slideStyle = useMemo<React.CSSProperties>(() => {
    if (presentationMode) {
      const height =
        (presentationBaseDimensionsRef.current?.height ?? canvasDimensions.height) || CANVAS_STAGE_HEIGHT;
      const width =
        (presentationBaseDimensionsRef.current?.width ?? canvasDimensions.width) || effectiveCanvasWidth;

      const base: React.CSSProperties = {
        ...slideThemeStyle,
        height,
        width,
        transform: `scale(${presentationScale})`,
        transformOrigin: 'center center',
        margin: '0 auto',
      };

      return base;
    }

    const base: React.CSSProperties = {
      ...slideThemeStyle,
      height: CANVAS_STAGE_HEIGHT,
      width: effectiveCanvasWidth,
      margin: '0 auto',
    };

    if (cardEditor) {
      const highlightShadow = `0 0 0 2px ${editorColor}33, 0 20px 45px -22px ${editorColor}66`;
      base.boxShadow = base.boxShadow ? `${base.boxShadow}, ${highlightShadow}` : highlightShadow;
      if (!settings.fullBleed) {
        base.borderColor = editorColor;
      }
    }

    return base;
  }, [
    presentationMode,
    slideThemeStyle,
    presentationScale,
    cardEditor,
    editorColor,
    settings.fullBleed,
    canvasDimensions.height,
    canvasDimensions.width,
    effectiveCanvasWidth,
  ]);

  return (
    <div className={containerClassName} style={accessibilityStyle}>
      <div
        ref={presentationMode ? presentationContainerRef : undefined}
        className={
          presentationMode
            ? isPreview
              ? 'flex h-full w-full items-center justify-center'
              : 'flex h-full w-full items-center justify-center bg-neutral-950'
            : isPreview
              ? 'flex h-full w-full items-center justify-center'
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

        <div className={cn('space-y-4', isPreview && 'space-y-0')}>
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
                      : cn(
                          'rounded-[28px] border border-border/60',
                          cardEditor && !presentationMode ? 'border-2' : undefined,
                        ),
                    isDragOver && canEdit && draggedAtom ? 'scale-[0.98] ring-4 ring-primary/20' : undefined,
                    !canEdit && !presentationMode && 'opacity-90',
                    isCanvasActive && !presentationMode
                      ? 'ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.28)] border-amber-200'
                      : undefined
                  )}
                  data-exhibition-slide="true"
                  data-exhibition-slide-id={card.id}
                  onPointerEnter={() => {
                    setIsCanvasActive(true);
                    onFocusCard?.(card.id);
                  }}
                  onPointerLeave={() => {
                    const activeElement = document.activeElement;
                    if (!activeElement || !canvasRef.current?.contains(activeElement)) {
                      setIsCanvasActive(false);
                    }
                    onBlurCard?.(card.id);
                  }}
                style={slideStyle}
                onDragOver={presentationMode ? undefined : handleDragOver}
                onDragLeave={presentationMode ? undefined : handleDragLeave}
                onDrop={presentationMode ? undefined : handleDrop}
              >
                {cardEditor && !presentationMode && editorDisplayName && (
                  <div
                    className="pointer-events-none absolute left-3 top-4 flex items-center gap-2 rounded-full border bg-white/95 px-2 py-1 text-xs font-medium shadow-sm"
                    style={{ borderColor: editorColor, color: editorColor }}
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ backgroundColor: editorColor }}
                    >
                      {editorInitials || '•'}
                    </span>
                    <span className="max-w-[140px] truncate">{editorDisplayName}</span>
                  </div>
                )}
                <CanvasStage
                  ref={canvasRef}
                  canEdit={canEdit}
                  isDragOver={Boolean(isDragOver && canEdit && draggedAtom)}
                  objects={sortedSlideObjects}
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

          {!presentationMode && !isPreview && (
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
          {!isPreview && (
            <OverviewSection
              visible={showOverview}
              outerClassName={layoutConfig.overviewOuterClass}
              containerClassName={layoutConfig.overviewContainerClass}
              gridClassName={layoutConfig.gridClass}
              atomObjects={atomObjects}
              canEdit={canEdit}
              onRemoveAtom={handleAtomRemove}
            />
          )}

          {viewMode === 'horizontal' && !presentationMode && !isPreview && (
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

const MIN_OBJECT_WIDTH = 220;
const MIN_OBJECT_HEIGHT = 120;
const MIN_TEXT_OBJECT_WIDTH = 140;
const MIN_TEXT_OBJECT_HEIGHT = 60;
const MIN_IMAGE_OBJECT_WIDTH = 160;
const MIN_IMAGE_OBJECT_HEIGHT = 120;

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

const CARD_WIDTH_DIMENSIONS = {
  M: 832,
  L: 1088,
} as const;
const TOP_LAYOUT_MIN_HEIGHT = 210;
const BOTTOM_LAYOUT_MIN_HEIGHT = 220;
const SIDE_LAYOUT_MIN_WIDTH = 280;
const SIDE_LAYOUT_RATIO = 0.34;

const resolveLayoutOverlay = (
  layout: CardLayout,
  color: CardColor,
  accentImage: string | null | undefined,
  accentImageName: string | null | undefined,
  fullBleed: boolean,
) => {
  if (layout === 'none') {
    return null;
  }

  const overlayStyle = resolveCardOverlayStyle(color);
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

  const renderHorizontalOverlay = (position: 'left' | 'right') => (
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

type CanvasStageProps = {
  canEdit: boolean;
  objects: SlideObject[];
  isDragOver: boolean;
  showEmptyState: boolean;
  layout: CardLayout;
  cardColor: CardColor;
  accentImage?: string | null;
  accentImageName?: string | null;
  titleObjectId: string | null;
  onAddObject: (object: SlideObject) => void;
  onAddAtom?: (atom: DroppedAtom) => void;
  onCanvasDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  onInteract: () => void;
  onRemoveAtom?: (atomId: string) => void;
  onBringToFront: (objectIds: string[]) => void;
  onBringForward: (objectIds: string[]) => void;
  onSendBackward: (objectIds: string[]) => void;
  onSendToBack: (objectIds: string[]) => void;
  onBulkUpdate: (updates: Record<string, Partial<SlideObject>>) => void;
  onGroupObjects: (objectIds: string[], groupId: string | null) => void;
  onTitleCommit: (nextTitle: string) => void;
  onRemoveObject?: (objectId: string) => void;
  onTextToolbarChange?: (node: ReactNode | null) => void;
  onRequestPositionPanel?: (objectId: string) => void;
  onUndo?: () => void;
  fullBleed: boolean;
  backgroundLocked: boolean;
  onToggleBackgroundLock: () => void;
  onRequestFormatPanel?: () => void;
  snapToGridEnabled: boolean;
  gridSize: number;
  showGrid: boolean;
  showGuides: boolean;
};

const CanvasStage = React.forwardRef<HTMLDivElement, CanvasStageProps>(
  (
    {
      canEdit,
      objects,
      isDragOver,
      showEmptyState,
      layout,
      cardColor,
      accentImage,
      accentImageName,
      titleObjectId,
      onAddObject,
      onAddAtom,
      onCanvasDragOver,
      onCanvasDragLeave,
      onCanvasDrop,
      onInteract,
      onRemoveAtom,
      onBringToFront,
      onBringForward,
      onSendBackward,
      onSendToBack,
      onBulkUpdate,
      onGroupObjects,
      onTitleCommit,
      onRemoveObject,
      onTextToolbarChange,
      onRequestPositionPanel,
      onUndo,
      fullBleed,
      backgroundLocked,
      onToggleBackgroundLock,
      onRequestFormatPanel,
      snapToGridEnabled,
      gridSize,
      showGrid,
      showGuides,
    },
    forwardedRef,
  ) => {
    const internalRef = useRef<HTMLDivElement | null>(null);
    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [activeImageCropId, setActiveImageCropId] = useState<string | null>(null);
    const [animatingCropResize, setAnimatingCropResize] = useState<Set<string>>(new Set());
    const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
    const [editingTextState, setEditingTextState] = useState<EditingTextState | null>(null);
    const [activeTextToolbar, setActiveTextToolbar] = useState<{ id: string; node: ReactNode } | null>(null);
    const [clipboard, setClipboard] = useState<SlideObject[]>([]);
    const [styleClipboard, setStyleClipboard] = useState<Record<string, string> | null>(null);
    const [chartEditorTarget, setChartEditorTarget] = useState<{
      objectId: string;
      data: ChartDataRow[];
      config: ChartConfig;
    } | null>(null);
    const focusCanvas = useCallback(() => {
      const node = internalRef.current;
      if (node && typeof node.focus === 'function') {
        node.focus();
      }
    }, []);

    const objectsMap = useMemo(() => new Map(objects.map(object => [object.id, object])), [objects]);
    const highestZIndex = useMemo(
      () =>
        objects.reduce((max, object) => {
          const value = typeof object.zIndex === 'number' ? object.zIndex : 0;
          return value > max ? value : max;
        }, 0),
      [objects],
    );
    const selectedOrderMap = useMemo(() => {
      const order = new Map<string, number>();
      selectedIds.forEach((id, index) => {
        order.set(id, index);
      });
      return order;
    }, [selectedIds]);
    const elevatedZIndexBase = highestZIndex + 100;
    const activeInteractionOrderMap = useMemo(() => {
      if (!activeInteraction) {
        return new Map<string, number>();
      }
      if (activeInteraction.kind === 'move') {
        return new Map(activeInteraction.objectIds.map((id, index) => [id, index]));
      }
      return new Map([[activeInteraction.objectId, 0]]);
    }, [activeInteraction]);
    useEffect(() => {
      if (!chartEditorTarget) {
        return;
      }
      if (!objectsMap.has(chartEditorTarget.objectId)) {
        setChartEditorTarget(null);
      }
    }, [chartEditorTarget, objectsMap]);

    const handleChartEditorSave = useCallback(
      (data: ChartDataRow[], updatedConfig: ChartConfig) => {
        if (!chartEditorTarget) {
          return;
        }
        const target = objectsMap.get(chartEditorTarget.objectId);
        if (!target) {
          setChartEditorTarget(null);
          return;
        }

        const nextProps = {
          ...(target.props ?? {}),
          chartData: data.map(row => ({ ...row })),
          chartConfig: { ...updatedConfig },
        } as Record<string, unknown>;

        onBulkUpdate({
          [chartEditorTarget.objectId]: {
            props: nextProps,
          },
        });
        setChartEditorTarget(null);
      },
      [chartEditorTarget, objectsMap, onBulkUpdate],
    );
    const selectedObjects = useMemo(
      () =>
        selectedIds
          .map(id => objectsMap.get(id))
          .filter((object): object is SlideObject => Boolean(object)),
      [objectsMap, selectedIds],
    );
    const unlockedSelectedObjects = useMemo(
      () => selectedObjects.filter(object => !isSlideObjectLocked(object)),
      [selectedObjects],
    );

    const resolveTargetIds = useCallback(
      (explicitIds?: string[] | null) => {
        if (explicitIds && explicitIds.length > 0) {
          return Array.from(new Set(explicitIds));
        }
        return selectedIds;
      },
      [selectedIds],
    );

    const resolveTargetObjects = useCallback(
      (explicitIds?: string[] | null) => {
        const ids = resolveTargetIds(explicitIds);
        const targets: SlideObject[] = [];
        ids.forEach(id => {
          const object = objectsMap.get(id);
          if (object) {
            targets.push(object);
          }
        });
        return targets;
      },
      [objectsMap, resolveTargetIds],
    );

    const captureColorStyle = useCallback((object: SlideObject | null | undefined) => {
      if (!object) {
        return null;
      }
      const props = (object.props ?? {}) as Record<string, unknown>;
      const palette: Record<string, string> = {};

      COLOR_PROP_KEYS.forEach(key => {
        const value = props[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          palette[key] = value;
        }
      });

      return Object.keys(palette).length > 0 ? palette : null;
    }, []);

    const handleCopySelection = useCallback(
      (explicitIds?: string[] | null) => {
        const targetIds = resolveTargetIds(explicitIds);
        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to copy',
            description: 'Select an object to copy before copying.',
          });
          return;
        }

        const snapshots = targets.map(object => ({
          ...object,
          props: cloneValue(object.props ?? {}),
        }));

        setClipboard(snapshots);
        if (explicitIds && explicitIds.length > 0) {
          setSelectedIds(targetIds);
        }
        focusCanvas();
        toast({
          title: snapshots.length === 1 ? 'Object copied' : 'Objects copied',
          description:
            snapshots.length === 1
              ? 'Copied the selected object.'
              : `Copied ${snapshots.length} objects to the clipboard.`,
        });
      },
      [focusCanvas, resolveTargetIds, resolveTargetObjects],
    );

    const handleCutSelection = useCallback(
      (explicitIds?: string[] | null) => {
        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to cut',
            description: 'Select an object before attempting to cut it.',
          });
          return;
        }

        const unlockedTargets = targets.filter(object => !isSlideObjectLocked(object));
        if (unlockedTargets.length === 0) {
          toast({
            title: 'Selection locked',
            description: 'Unlock the selected object before cutting it.',
          });
          return;
        }

        const snapshots = unlockedTargets.map(object => ({
          ...object,
          props: cloneValue(object.props ?? {}),
        }));

        setClipboard(snapshots);
        onInteract();

        const removedIds = new Set(unlockedTargets.map(object => object.id));

        unlockedTargets.forEach(object => {
          if (isAtomObject(object) && onRemoveAtom) {
            const atomId = (object.props as { atom?: DroppedAtom } | undefined)?.atom?.id;
            if (atomId) {
              onRemoveAtom(atomId);
            }
            return;
          }

          if (!onRemoveObject) {
            return;
          }

          if (object.type === 'accent-image') {
            return;
          }

          onRemoveObject(object.id);
        });

        setSelectedIds(prev => prev.filter(id => !removedIds.has(id)));
        focusCanvas();
        toast({
          title: snapshots.length === 1 ? 'Object cut' : 'Objects cut',
          description:
            snapshots.length === 1
              ? 'Moved the selected object to the clipboard.'
              : `Cut ${snapshots.length} objects to the clipboard.`,
        });
      },
      [
        focusCanvas,
        onInteract,
        onRemoveAtom,
        onRemoveObject,
        resolveTargetObjects,
        titleObjectId,
      ],
    );

    const handleCopyStyle = useCallback(() => {
      const primary = selectedObjects[0] ?? null;
      if (!primary) {
        toast({
          title: 'No object selected',
          description: 'Select an object to capture its styling.',
        });
        return;
      }

      const palette = captureColorStyle(primary);
      if (!palette) {
        toast({
          title: 'No colors to copy',
          description: 'The selected object does not expose color styling to copy.',
        });
        return;
      }

      setStyleClipboard(palette);
      toast({
        title: 'Style copied',
        description: 'Copied the selected object styling for reuse.',
      });
    }, [captureColorStyle, selectedObjects]);

    const handleDeleteSelection = useCallback(
      (explicitIds?: string[] | null) => {
        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to delete',
            description: 'Select an object to remove it from the slide.',
          });
          return;
        }

        const unlockedTargets = targets.filter(object => !isSlideObjectLocked(object));
        if (unlockedTargets.length === 0) {
          toast({
            title: 'Selection locked',
            description: 'Unlock the selected object before deleting it.',
          });
          return;
        }

        onInteract();
        const removedIds = new Set(unlockedTargets.map(object => object.id));

        unlockedTargets.forEach(object => {
          if (isAtomObject(object) && onRemoveAtom) {
            const atomId = (object.props as { atom?: DroppedAtom } | undefined)?.atom?.id;
            if (atomId) {
              onRemoveAtom(atomId);
            }
            return;
          }

          if (!onRemoveObject) {
            return;
          }

          if (object.type === 'accent-image') {
            return;
          }

          onRemoveObject(object.id);
        });

        setSelectedIds(prev => prev.filter(id => !removedIds.has(id)));
        focusCanvas();
        toast({
          title: unlockedTargets.length === 1 ? 'Object deleted' : 'Objects deleted',
          description:
            unlockedTargets.length === 1
              ? 'The selected object has been removed.'
              : `${unlockedTargets.length} objects removed from the slide.`,
        });
      },
      [focusCanvas, onInteract, onRemoveAtom, onRemoveObject, resolveTargetObjects, titleObjectId],
    );

    const handleToggleLock = useCallback(() => {
      if (selectedObjects.length === 0) {
        toast({
          title: 'No object selected',
          description: 'Select an object to lock or unlock.',
        });
        return;
      }

      const shouldLock = unlockedSelectedObjects.length > 0;
      const targets = shouldLock ? unlockedSelectedObjects : selectedObjects;
      if (targets.length === 0) {
        toast({
          title: 'Selection locked',
          description: 'All selected objects are already locked.',
        });
        return;
      }

      const updates: Record<string, Partial<SlideObject>> = {};
      targets.forEach(object => {
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (shouldLock) {
          nextProps.locked = true;
        } else {
          delete nextProps.locked;
        }
        updates[object.id] = { props: nextProps };
      });

      onInteract();
      onBulkUpdate(updates);

      toast({
        title: shouldLock ? 'Objects locked' : 'Objects unlocked',
        description: shouldLock
          ? 'Locked the selected objects to prevent accidental edits.'
          : 'Unlocked the selected objects.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects]);

    const handleLayerAction = useCallback(
      (action: 'front' | 'forward' | 'backward' | 'back', explicitIds?: string[]) => {
        const explicitTargets = Array.isArray(explicitIds) && explicitIds.length > 0
          ? explicitIds
              .map(id => objectsMap.get(id))
              .filter((object): object is SlideObject => Boolean(object))
          : null;

        const unlockedExplicitTargets = explicitTargets?.filter(object => !isSlideObjectLocked(object)) ?? [];

        const targets = unlockedExplicitTargets.length > 0
          ? unlockedExplicitTargets
          : explicitTargets && explicitTargets.length > 0
            ? []
            : unlockedSelectedObjects.length > 0
              ? unlockedSelectedObjects
              : selectedObjects;

        if (targets.length === 0) {
          toast({
            title: explicitTargets && explicitTargets.length > 0 ? 'Selection locked' : 'No objects selected',
            description:
              explicitTargets && explicitTargets.length > 0
                ? 'Unlock the selected objects to change their layer order.'
                : 'Select an object to change its layer order.',
          });
          return;
        }

        const ids = Array.from(new Set(targets.map(object => object.id))).filter(Boolean);
        if (ids.length === 0) {
          return;
        }

        onInteract();
        switch (action) {
          case 'front':
            onBringToFront(ids);
            break;
          case 'forward':
            onBringForward(ids);
            break;
          case 'backward':
            onSendBackward(ids);
            break;
          case 'back':
            onSendToBack(ids);
            break;
          default:
            break;
        }
      },
      [
        objectsMap,
        onBringForward,
        onBringToFront,
        onInteract,
        onSendBackward,
        onSendToBack,
        selectedObjects,
        unlockedSelectedObjects,
      ],
    );

    const updateImageProps = useCallback(
      (
        objectId: string,
        updater: (props: Record<string, unknown>) => Record<string, unknown> | null | undefined,
      ) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'image') {
          return;
        }

        if (isSlideObjectLocked(object)) {
          toast({
            title: 'Image locked',
            description: 'Unlock the image to modify its properties.',
          });
          return;
        }

        const nextProps = updater({ ...(object.props ?? {}) } as Record<string, unknown>);
        if (!nextProps) {
          return;
        }

        onInteract();
        onBulkUpdate({
          [objectId]: {
            props: nextProps,
          },
        });
      },
        [onBulkUpdate, onInteract, objectsMap],
    );

    const handleToggleImageFit = useCallback(
      (objectId: string) => {
        updateImageProps(objectId, props => {
          const rawFit = typeof props.fit === 'string' ? props.fit.toLowerCase() : '';
          const currentFit = rawFit === 'contain' ? 'contain' : 'cover';
          return { ...props, fit: currentFit === 'cover' ? 'contain' : 'cover' };
        });
      },
      [updateImageProps],
    );

    const handleFlipImage = useCallback(
      (objectId: string, axis: 'horizontal' | 'vertical') => {
        console.log('[SlideCanvas] handleFlipImage called', { objectId, axis });
        
        // Ensure image remains selected after flip
        if (!selectedIds.includes(objectId)) {
          setSelectedIds(prev => [...prev, objectId]);
        }
        
        updateImageProps(objectId, props => {
          // Safely read current flip state, defaulting to false if not set
          const currentFlipX = Boolean(props.flipX === true || props.flipHorizontal === true);
          const currentFlipY = Boolean(props.flipY === true || props.flipVertical === true);
          
          console.log('[SlideCanvas] handleFlipImage - current state', { 
            objectId, 
            axis, 
            currentFlipX, 
            currentFlipY,
            propsFlipX: props.flipX,
            propsFlipHorizontal: props.flipHorizontal,
            propsFlipY: props.flipY,
            propsFlipVertical: props.flipVertical,
          });

          if (axis === 'horizontal') {
            const nextFlipX = !currentFlipX;
            const updatedProps = {
              ...props,
              flipX: nextFlipX,
              flipHorizontal: nextFlipX,
              flipY: currentFlipY,
              flipVertical: currentFlipY,
            };
            console.log('[SlideCanvas] handleFlipImage - updating horizontal flip', { 
              objectId, 
              currentFlipX, 
              nextFlipX,
              updatedProps: { flipX: updatedProps.flipX, flipHorizontal: updatedProps.flipHorizontal }
            });
            return updatedProps;
          }

          const nextFlipY = !currentFlipY;
          const updatedProps = {
            ...props,
            flipX: currentFlipX,
            flipHorizontal: currentFlipX,
            flipY: nextFlipY,
            flipVertical: nextFlipY,
          };
          console.log('[SlideCanvas] handleFlipImage - updating vertical flip', { 
            objectId, 
            currentFlipY, 
            nextFlipY,
            updatedProps: { flipY: updatedProps.flipY, flipVertical: updatedProps.flipVertical }
          });
          return updatedProps;
        });
      },
      [updateImageProps, selectedIds, setSelectedIds],
    );

    const handleFlipImageHorizontal = useCallback(
      (objectId: string) => {
        handleFlipImage(objectId, 'horizontal');
      },
      [handleFlipImage],
    );

    const handleFlipImageVertical = useCallback(
      (objectId: string) => {
        handleFlipImage(objectId, 'vertical');
      },
      [handleFlipImage],
    );

    const handleSetImageOpacity = useCallback(
      (objectId: string, value: number) => {
        const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 1, 0), 1);
        updateImageProps(objectId, props => ({
          ...props,
          opacity: clamped,
        }));
      },
      [updateImageProps],
    );

    const handleSetImageCrop = useCallback(
      (objectId: string, nextCrop: ImageCropInsets) => {
        updateImageProps(objectId, props => ({
          ...props,
          crop: sanitizeImageCrop(nextCrop),
        }));
      },
      [updateImageProps],
    );

    const handleResetImageCrop = useCallback(
      (objectId: string) => {
        updateImageProps(objectId, props => ({
          ...props,
          crop: sanitizeImageCrop({ top: 0, right: 0, bottom: 0, left: 0 }),
        }));
      },
      [updateImageProps],
    );

    const handleImageCropCommit = useCallback(
      (objectId: string, finalCrop: ImageCropInsets) => {
        // Just save the crop insets - resize will happen when exiting crop mode (Enter)
        handleSetImageCrop(objectId, finalCrop);
      },
      [handleSetImageCrop],
    );

    const handleSetImageCropShape = useCallback(
      (objectId: string, shape: CropShape) => {
        updateImageProps(objectId, props => ({
          ...props,
          cropShape: shape,
        }));
      },
      [updateImageProps],
    );

    const handleToggleImageCrop = useCallback(
      (objectId: string) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'image') {
          return;
        }

        if (isSlideObjectLocked(object)) {
          toast({
            title: 'Image locked',
            description: 'Unlock the image to crop it.',
          });
          return;
        }

        const isCurrentlyCropping = activeImageCropId === objectId;
        const imageProps = object.props as Record<string, unknown> | undefined;
        const currentCrop = imageProps?.crop as ImageCropInsets | undefined;
        const hasCrop = currentCrop && (
          (typeof currentCrop.top === 'number' && currentCrop.top > 0) ||
          (typeof currentCrop.right === 'number' && currentCrop.right > 0) ||
          (typeof currentCrop.bottom === 'number' && currentCrop.bottom > 0) ||
          (typeof currentCrop.left === 'number' && currentCrop.left > 0)
        );

        if (isCurrentlyCropping) {
          // Exiting crop mode - apply resize if crop exists
          if (hasCrop && currentCrop) {
            // Mark this object as animating resize for smooth transition
            setAnimatingCropResize(prev => new Set(prev).add(objectId));
            
            // Use requestAnimationFrame to ensure transition is applied before resize
            requestAnimationFrame(() => {
              const normalizedCrop = sanitizeImageCrop(currentCrop);
              const cropWidthPercent = 100 - normalizedCrop.left - normalizedCrop.right;
              const cropHeightPercent = 100 - normalizedCrop.top - normalizedCrop.bottom;

              // Get original dimensions from props, or use current if not stored
              const originalWidth = (typeof imageProps?.originalWidth === 'number' ? imageProps.originalWidth : object.width);
              const originalHeight = (typeof imageProps?.originalHeight === 'number' ? imageProps.originalHeight : object.height);

              // Calculate new dimensions based on original dimensions
              const newWidth = (originalWidth * cropWidthPercent) / 100;
              const newHeight = (originalHeight * cropHeightPercent) / 100;

              // Calculate position offset based on crop insets
              const offsetX = (originalWidth * normalizedCrop.left) / 100;
              const offsetY = (originalHeight * normalizedCrop.top) / 100;

              // Get original position from stored props
              const originalX = (typeof imageProps?.originalX === 'number' ? imageProps.originalX : object.x);
              const originalY = (typeof imageProps?.originalY === 'number' ? imageProps.originalY : object.y);

              // Update geometry with new dimensions and adjusted position
              onBulkUpdate({
                [objectId]: {
                  width: newWidth,
                  height: newHeight,
                  x: originalX + offsetX,
                  y: originalY + offsetY,
                },
              });
              
              // Clear animation flag after transition completes (400ms)
              setTimeout(() => {
                setAnimatingCropResize(prev => {
                  const next = new Set(prev);
                  next.delete(objectId);
                  return next;
                });
              }, 400);
            });
          }
          setActiveImageCropId(prev => (prev === objectId ? null : objectId));
        } else {
          // Entering crop mode - store original dimensions and restore if re-cropping
          
          // If this is the first time cropping (no existing crop), store current dimensions as original
          // If re-cropping (has existing crop), use stored original dimensions
          let originalWidth: number;
          let originalHeight: number;
          let originalX: number;
          let originalY: number;

          if (!hasCrop) {
            // First time cropping - store current dimensions as original
            originalWidth = object.width;
            originalHeight = object.height;
            originalX = object.x;
            originalY = object.y;
            
            // Store in props for future re-crops
            updateImageProps(objectId, props => ({
              ...props,
              originalWidth,
              originalHeight,
              originalX,
              originalY,
            }));
          } else {
            // Re-cropping - use stored original dimensions
            originalWidth = (typeof imageProps?.originalWidth === 'number' ? imageProps.originalWidth : object.width);
            originalHeight = (typeof imageProps?.originalHeight === 'number' ? imageProps.originalHeight : object.height);
            originalX = (typeof imageProps?.originalX === 'number' ? imageProps.originalX : object.x);
            originalY = (typeof imageProps?.originalY === 'number' ? imageProps.originalY : object.y);

            // If original dimensions not stored (shouldn't happen, but fallback), store current as original
            if (typeof imageProps?.originalWidth !== 'number' || typeof imageProps?.originalHeight !== 'number' ||
                typeof imageProps?.originalX !== 'number' || typeof imageProps?.originalY !== 'number') {
              // This shouldn't happen, but if it does, we need to calculate original from current crop
              // For now, just use current dimensions (fallback)
              originalWidth = object.width;
              originalHeight = object.height;
              originalX = object.x;
              originalY = object.y;
            }

            // Restore to original dimensions and position for re-cropping
            onBulkUpdate({
              [objectId]: {
                width: originalWidth,
                height: originalHeight,
                x: originalX,
                y: originalY,
              },
            });
          }

          setActiveImageCropId(prev => (prev === objectId ? null : objectId));
          
          // Ensure image is selected when entering crop mode
          if (!selectedIds.includes(objectId)) {
            setSelectedIds(prev => [...prev, objectId]);
          }
        }
        
        onInteract();
      },
      [objectsMap, onInteract, activeImageCropId, selectedIds, onBulkUpdate, updateImageProps],
    );

    const handleToggleImageAnimation = useCallback(
      (objectId: string) => {
        updateImageProps(objectId, props => ({
          ...props,
          animate: !(props.animate === true),
        }));
      },
      [updateImageProps],
    );

    const handleReplaceImage = useCallback(
      (objectId: string) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'image') {
          return;
        }

        if (isSlideObjectLocked(object)) {
          toast({
            title: 'Image locked',
            description: 'Unlock the image to replace it.',
          });
          return;
        }

        if (typeof window === 'undefined') {
          toast({
            title: 'Replace image unavailable',
            description: 'Image replacement is only available in a browser environment.',
          });
          return;
        }

        const currentSrc = typeof object.props?.src === 'string' ? object.props.src : '';
        const input = window.prompt('Enter the URL of the new image', currentSrc);
        if (input === null) {
          return;
        }

        const trimmed = input.trim();
        if (trimmed.length === 0) {
          toast({
            title: 'No image provided',
            description: 'Provide an image URL to replace the current image.',
          });
          return;
        }

        updateImageProps(objectId, props => {
          const next = { ...props, src: trimmed, source: 'custom-url' } as Record<string, unknown>;
          if (typeof next.name !== 'string' || next.name.trim().length === 0) {
            next.name = 'Custom image';
          }
          return next;
        });

        toast({
          title: 'Image updated',
          description: 'Replaced the selected image.',
        });
      },
      [objectsMap, updateImageProps],
    );

    const handleToggleImageFullBleed = useCallback(
      (targetIds: string[], nextValue: boolean) => {
        if (!Array.isArray(targetIds) || targetIds.length === 0) {
          return;
        }

        const updates: Record<string, Partial<SlideObject>> = {};

        targetIds.forEach(id => {
          const object = objectsMap.get(id);
          if (!object || object.type !== 'image' || isSlideObjectLocked(object)) {
            return;
          }

          const nextProps = {
            ...(object.props ?? {}),
            fullBleed: nextValue,
          } as Record<string, unknown>;

          updates[object.id] = {
            props: nextProps,
          };
        });

        if (Object.keys(updates).length === 0) {
          return;
        }

        onInteract();
        onBulkUpdate(updates);
      },
      [objectsMap, onBulkUpdate, onInteract],
    );

    const handleLinkSelection = useCallback(() => {
      if (selectedObjects.length === 0) {
        toast({
          title: 'No object selected',
          description: 'Select an object to add a link.',
        });
        return;
      }

      if (typeof window === 'undefined') {
        toast({
          title: 'Link unavailable',
          description: 'Links can only be edited in a browser environment.',
        });
        return;
      }

      const current = (selectedObjects[0]?.props as Record<string, unknown> | undefined)?.link;
      const input = window.prompt('Enter a link URL', typeof current === 'string' ? current : '');
      if (input === null) {
        return;
      }

      const trimmed = input.trim();
      const updates: Record<string, Partial<SlideObject>> = {};
      unlockedSelectedObjects.forEach(object => {
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (trimmed.length === 0) {
          delete nextProps.link;
        } else {
          nextProps.link = trimmed;
        }
        updates[object.id] = { props: nextProps };
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Selection locked',
          description: 'Unlock the object to update its link.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: trimmed.length === 0 ? 'Link cleared' : 'Link updated',
        description:
          trimmed.length === 0
            ? 'Removed link information from the selected objects.'
            : 'Updated the selected objects with the provided link.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects]);

    const handleCommentSelection = useCallback(() => {
      if (selectedObjects.length === 0) {
        toast({
          title: 'No object selected',
          description: 'Select an object to attach a comment.',
        });
        return;
      }

      if (typeof window === 'undefined') {
        toast({
          title: 'Comment unavailable',
          description: 'Comments can only be edited in a browser environment.',
        });
        return;
      }

      const current = (selectedObjects[0]?.props as Record<string, unknown> | undefined)?.comment;
      const input = window.prompt('Add a comment', typeof current === 'string' ? current : '');
      if (input === null) {
        return;
      }

      const trimmed = input.trim();
      const updates: Record<string, Partial<SlideObject>> = {};
      unlockedSelectedObjects.forEach(object => {
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (trimmed.length === 0) {
          delete nextProps.comment;
        } else {
          nextProps.comment = trimmed;
        }
        updates[object.id] = { props: nextProps };
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Selection locked',
          description: 'Unlock the object to update comments.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: trimmed.length === 0 ? 'Comment cleared' : 'Comment added',
        description:
          trimmed.length === 0
            ? 'Removed comments from the selected objects.'
            : 'Saved the provided comment on the selection.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects, unlockedSelectedObjects]);

    const handleAltTextSelection = useCallback(() => {
      const eligible = selectedObjects.filter(object => object.type === 'image' || object.type === 'accent-image');
      if (eligible.length === 0) {
        toast({
          title: 'No image selected',
          description: 'Select an image object to edit alternative text.',
        });
        return;
      }

      if (typeof window === 'undefined') {
        toast({
          title: 'Alternative text unavailable',
          description: 'Alternative text can only be edited in a browser environment.',
        });
        return;
      }

      const current = (eligible[0].props as Record<string, unknown> | undefined)?.altText;
      const input = window.prompt('Describe this image for screen readers', typeof current === 'string' ? current : '');
      if (input === null) {
        return;
      }

      const trimmed = input.trim();
      const updates: Record<string, Partial<SlideObject>> = {};
      eligible.forEach(object => {
        if (isSlideObjectLocked(object)) {
          return;
        }
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        if (trimmed.length === 0) {
          delete nextProps.altText;
        } else {
          nextProps.altText = trimmed;
        }
        updates[object.id] = { props: nextProps };
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Images locked',
          description: 'Unlock the image to change its alternative text.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: trimmed.length === 0 ? 'Alternative text cleared' : 'Alternative text saved',
        description:
          trimmed.length === 0
            ? 'Removed alternative text from the selected images.'
            : 'Updated alternative text for the selected images.',
      });
    }, [onBulkUpdate, onInteract, selectedObjects]);

    const handleApplyColorsToAll = useCallback(() => {
      const sourcePalette = styleClipboard ?? captureColorStyle(selectedObjects[0]);
      if (!sourcePalette) {
        toast({
          title: 'No colors available',
          description: 'Copy a style or select an object with color styling.',
        });
        return;
      }

      const updates: Record<string, Partial<SlideObject>> = {};
      objects.forEach(object => {
        if (isSlideObjectLocked(object)) {
          return;
        }
        const nextProps = { ...(object.props || {}) } as Record<string, unknown>;
        let changed = false;
        Object.entries(sourcePalette).forEach(([key, value]) => {
          if (typeof value !== 'string') {
            return;
          }
          if (nextProps[key] !== value) {
            nextProps[key] = value;
            changed = true;
          }
        });
        if (changed) {
          updates[object.id] = { props: nextProps };
        }
      });

      if (Object.keys(updates).length === 0) {
        toast({
          title: 'No updates applied',
          description: 'Objects already use the selected colors.',
        });
        return;
      }

      onInteract();
      onBulkUpdate(updates);
      toast({
        title: 'Colors applied',
        description: 'Applied the captured styling across the slide.',
      });
    }, [captureColorStyle, objects, onBulkUpdate, onInteract, selectedObjects, styleClipboard]);

    const handleInfo = useCallback(() => {
      const target = selectedObjects[0] ?? null;
      if (!target) {
        toast({
          title: 'No object selected',
          description: 'Select an object to view its details.',
        });
        return;
      }

      const descriptionParts = [
        `Type: ${target.type}`,
        `Position: ${Math.round(target.x)}, ${Math.round(target.y)}`,
        `Size: ${Math.round(target.width)} × ${Math.round(target.height)}`,
      ];

      toast({
        title: 'Object details',
        description: descriptionParts.join(' • '),
      });
    }, [selectedObjects]);

    const hasSelection = selectedObjects.length > 0;
    const hasClipboardItems = clipboard.length > 0;
    const selectionLocked = hasSelection && unlockedSelectedObjects.length === 0;
    const lockLabel: 'Lock' | 'Unlock' = selectionLocked ? 'Unlock' : 'Lock';
    const selectedSupportsAltText = selectedObjects.some(
      object => object.type === 'image' || object.type === 'accent-image',
    );
    const effectiveColorPalette = styleClipboard ?? captureColorStyle(selectedObjects[0]);
    const canApplyColorsGlobally = Boolean(effectiveColorPalette);
    const canCutSelection = unlockedSelectedObjects.length > 0;

    useEffect(() => {
      setSelectedIds(prev => prev.filter(id => objectsMap.has(id)));
      setActiveTextToolbar(prev => {
        if (!prev) {
          return prev;
        }
        return objectsMap.has(prev.id) ? prev : null;
      });
    }, [objectsMap]);

    useEffect(() => {
      if (!editingTextState) {
        return;
      }

      const object = objectsMap.get(editingTextState.id);
      if (!object) {
        setEditingTextState(null);
      }
    }, [editingTextState, objectsMap]);


    useEffect(() => {
      setActiveTextToolbar(prev => {
        if (!prev) {
          return prev;
        }
        return selectedIds.includes(prev.id) ? prev : null;
      });
    }, [selectedIds]);

    useEffect(() => {
      if (!canEdit) {
        setActiveTextToolbar(null);
      }
    }, [canEdit]);

    useEffect(() => {
      onTextToolbarChange?.(activeTextToolbar?.node ?? null);
    }, [activeTextToolbar, onTextToolbarChange]);

    useEffect(() => {
      return () => {
        onTextToolbarChange?.(null);
      };
    }, [onTextToolbarChange]);

    useEffect(() => {
      if (!activeImageCropId) {
        return;
      }

      const target = objectsMap.get(activeImageCropId);
      // Only clear crop mode if the image is deleted, type changes, or editing is disabled
      // Don't clear just because the image is deselected - allow cropping even when deselected
      if (!target || target.type !== 'image' || !canEdit) {
        setActiveImageCropId(null);
      }
    }, [activeImageCropId, canEdit, objectsMap]);

    const handleTextToolbarStateChange = useCallback(
      (objectId: string, node: ReactNode | null) => {
        setActiveTextToolbar(prev => {
          if (node) {
            if (prev?.id === objectId && prev.node === node) {
              return prev;
            }
            return { id: objectId, node };
          }

          if (prev?.id === objectId) {
            return null;
          }

          return prev;
        });
      },
      [],
    );

    const updateShapeProps = useCallback(
      (objectId: string, updates: Partial<ShapeObjectProps>) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'shape') {
          return;
        }

        const currentProps = (object.props ?? {}) as Record<string, unknown>;
        const nextProps = {
          ...currentProps,
          ...updates,
        } as Record<string, unknown>;

        onBulkUpdate({
          [objectId]: {
            props: nextProps,
          },
        });
      },
      [objectsMap, onBulkUpdate],
    );

    const mutateTableState = useCallback(
      (objectId: string, mutator: (state: TableState) => TableState | null) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'table') {
          return;
        }

        const currentState = readTableState(object);
        const nextState = mutator(currentState);

        if (!nextState || tableStatesEqual(currentState, nextState)) {
          return;
        }

        onInteract();
        onBulkUpdate({
          [objectId]: {
            props: {
              ...(object.props || {}),
              data: nextState.data,
              rows: nextState.rows,
              cols: nextState.cols,
              locked: nextState.locked,
              showOutline: nextState.showOutline,
              headers: nextState.headers,
              styleId: nextState.styleId,
              columnWidths: nextState.columnWidths,
              rowHeights: nextState.rowHeights,
            },
          },
        });
      },
      [objectsMap, onBulkUpdate, onInteract],
    );

    const updateTableCellContent = useCallback(
      (objectId: string, rowIndex: number, colIndex: number, value: string) => {
        mutateTableState(objectId, state => {
          if (rowIndex < 0 || colIndex < 0 || rowIndex >= state.rows || colIndex >= state.cols) {
            return state;
          }

          const currentCell = state.data[rowIndex][colIndex];
          if (!currentCell) {
            return state;
          }

          if (currentCell.content === value) {
            return state;
          }

          const nextData = cloneTableMatrix(state.data);
          nextData[rowIndex][colIndex] = {
            ...nextData[rowIndex][colIndex],
            content: value,
          };

          return {
            ...state,
            data: nextData,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableCellFormatting = useCallback(
      (objectId: string, rowIndex: number, colIndex: number, updates: Partial<TableCellFormatting>) => {
        mutateTableState(objectId, state => {
          if (rowIndex < 0 || colIndex < 0 || rowIndex >= state.rows || colIndex >= state.cols) {
            return state;
          }

          const currentCell = state.data[rowIndex][colIndex];
          if (!currentCell) {
            return state;
          }

          const nextFormatting = { ...currentCell.formatting, ...updates };
          if (formattingShallowEqual(currentCell.formatting, nextFormatting)) {
            return state;
          }

          const nextData = cloneTableMatrix(state.data);
          nextData[rowIndex][colIndex] = {
            ...nextData[rowIndex][colIndex],
            formatting: nextFormatting,
          };

          return {
            ...state,
            data: nextData,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableHeaderContent = useCallback(
      (objectId: string, colIndex: number, value: string) => {
        mutateTableState(objectId, state => {
          if (colIndex < 0 || colIndex >= state.cols) {
            return state;
          }

          const currentHeader = state.headers[colIndex];
          if (!currentHeader || currentHeader.content === value) {
            return state;
          }

          const nextHeaders = cloneTableHeaders(state.headers);
          nextHeaders[colIndex] = {
            ...nextHeaders[colIndex],
            content: value,
          };

          return {
            ...state,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableHeaderFormatting = useCallback(
      (objectId: string, colIndex: number, updates: Partial<TableCellFormatting>) => {
        mutateTableState(objectId, state => {
          if (colIndex < 0 || colIndex >= state.cols) {
            return state;
          }

          const currentHeader = state.headers[colIndex];
          if (!currentHeader) {
            return state;
          }

          const nextFormatting = { ...currentHeader.formatting, ...updates };
          if (formattingShallowEqual(currentHeader.formatting, nextFormatting)) {
            return state;
          }

          const nextHeaders = cloneTableHeaders(state.headers);
          nextHeaders[colIndex] = {
            ...nextHeaders[colIndex],
            formatting: nextFormatting,
          };

          return {
            ...state,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableColumnWidth = useCallback(
      (objectId: string, colIndex: number, width: number) => {
        mutateTableState(objectId, state => {
          if (colIndex < 0 || colIndex >= state.cols) {
            return state;
          }

          const numericWidth = Number(width);
          const roundedWidth = Number.isFinite(numericWidth)
            ? Math.round(numericWidth)
            : DEFAULT_TABLE_COLUMN_WIDTH;
          const clampedWidth = Math.min(
            Math.max(roundedWidth, MIN_TABLE_COLUMN_WIDTH),
            MAX_TABLE_COLUMN_WIDTH,
          );

          const nextColumnWidths = Array.from({ length: state.cols }, (_, index) => {
            const existing = state.columnWidths[index];
            if (!Number.isFinite(existing)) {
              return DEFAULT_TABLE_COLUMN_WIDTH;
            }
            const rounded = Math.round(existing);
            if (!Number.isFinite(rounded)) {
              return DEFAULT_TABLE_COLUMN_WIDTH;
            }
            return Math.min(Math.max(rounded, MIN_TABLE_COLUMN_WIDTH), MAX_TABLE_COLUMN_WIDTH);
          });

          if (nextColumnWidths[colIndex] === clampedWidth) {
            return state;
          }

          nextColumnWidths[colIndex] = clampedWidth;

          return {
            ...state,
            columnWidths: nextColumnWidths,
          };
        });
      },
      [mutateTableState],
    );

    const updateTableRowHeight = useCallback(
      (objectId: string, rowIndex: number, height: number) => {
        mutateTableState(objectId, state => {
          if (rowIndex < 0 || rowIndex >= state.rows) {
            return state;
          }

          const numericHeight = Number(height);
          const roundedHeight = Number.isFinite(numericHeight)
            ? Math.round(numericHeight)
            : DEFAULT_TABLE_ROW_HEIGHT;
          const clampedHeight = Math.min(
            Math.max(roundedHeight, MIN_TABLE_ROW_HEIGHT),
            MAX_TABLE_ROW_HEIGHT,
          );

          const nextRowHeights = Array.from({ length: state.rows }, (_, index) => {
            const existing = state.rowHeights[index];
            if (!Number.isFinite(existing)) {
              return DEFAULT_TABLE_ROW_HEIGHT;
            }
            const rounded = Math.round(existing);
            if (!Number.isFinite(rounded)) {
              return DEFAULT_TABLE_ROW_HEIGHT;
            }
            return Math.min(Math.max(rounded, MIN_TABLE_ROW_HEIGHT), MAX_TABLE_ROW_HEIGHT);
          });

          if (nextRowHeights[rowIndex] === clampedHeight) {
            return state;
          }

          nextRowHeights[rowIndex] = clampedHeight;

          return {
            ...state,
            rowHeights: nextRowHeights,
          };
        });
      },
      [mutateTableState],
    );

    const toggleTableLock = useCallback(
      (objectId: string) => {
        mutateTableState(objectId, state => ({
          ...state,
          locked: !state.locked,
        }));
      },
      [mutateTableState],
    );

    const toggleTableOutline = useCallback(
      (objectId: string) => {
        mutateTableState(objectId, state => ({
          ...state,
          showOutline: !state.showOutline,
        }));
      },
      [mutateTableState],
    );

    const setTableStyle = useCallback(
      (objectId: string, nextStyleId: string) => {
        mutateTableState(objectId, state => {
          const safeStyleId = ensureTableStyleId(nextStyleId);

          if (state.styleId === safeStyleId) {
            return state;
          }

          return {
            ...state,
            styleId: safeStyleId,
          };
        });
      },
      [mutateTableState],
    );

    const addRowsToTable = useCallback(
      (objectId: string, startIndex: number, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          const columnCount = Math.max(state.cols, 1);
          const safeStart = Number.isFinite(startIndex)
            ? Math.min(Math.max(Math.floor(startIndex), 0), state.rows)
            : state.rows;
          const additions = Array.from({ length: count }, () => createEmptyTableRow(columnCount));
          const nextData = [
            ...state.data.slice(0, safeStart),
            ...additions,
            ...state.data.slice(safeStart),
          ];
          const normalisedRowHeights = Array.from({ length: state.rows }, (_, index) => {
            const existing = state.rowHeights[index];
            if (!Number.isFinite(existing)) {
              return DEFAULT_TABLE_ROW_HEIGHT;
            }
            const rounded = Math.round(existing);
            if (!Number.isFinite(rounded)) {
              return DEFAULT_TABLE_ROW_HEIGHT;
            }
            return Math.min(Math.max(rounded, MIN_TABLE_ROW_HEIGHT), MAX_TABLE_ROW_HEIGHT);
          });
          const heightInsertion = Math.min(
            Math.max(safeStart, 0),
            normalisedRowHeights.length,
          );
          const heightAdditions = Array.from({ length: count }, () => DEFAULT_TABLE_ROW_HEIGHT);
          const nextRowHeights = [
            ...normalisedRowHeights.slice(0, heightInsertion),
            ...heightAdditions,
            ...normalisedRowHeights.slice(heightInsertion),
          ];

          return {
            ...state,
            data: nextData,
            rows: nextData.length,
            rowHeights: nextRowHeights,
          };
        });
      },
      [mutateTableState],
    );

    const addColumnsToTable = useCallback(
      (objectId: string, startIndex: number, count: number) => {
        if (count <= 0) {
          return;
        }

        const object = objectsMap.get(objectId);
        const targetWidth =
          typeof object?.width === 'number' && Number.isFinite(object.width) && object.width > 0
            ? Math.round(object.width)
            : null;

        mutateTableState(objectId, state => {
          const safeStart = Number.isFinite(startIndex)
            ? Math.min(Math.max(Math.floor(startIndex), 0), state.cols)
            : state.cols;
          const nextData = state.data.map(row => {
            const before = row.slice(0, safeStart);
            const after = row.slice(safeStart);
            const additions = Array.from({ length: count }, () => createEmptyCell());
            return [...before, ...additions, ...after];
          });
          const existingHeaders = cloneTableHeaders(state.headers);
          const headerInsertion = Math.min(Math.max(safeStart, 0), existingHeaders.length);
          const headerAdditions = Array.from({ length: count }, (_, additionIndex) =>
            createDefaultHeaderCell(headerInsertion + additionIndex),
          );
          const nextHeaders = [
            ...existingHeaders.slice(0, headerInsertion),
            ...headerAdditions,
            ...existingHeaders.slice(headerInsertion),
          ];
          const renumberedHeaders = renumberDefaultTableHeaders(nextHeaders);
          const nextCols = renumberedHeaders.length;
          const widthInsertion = Math.min(Math.max(safeStart, 0), state.columnWidths.length);
          const widthAdditions = Array.from({ length: count }, () => DEFAULT_TABLE_COLUMN_WIDTH);
          let nextColumnWidths = [
            ...state.columnWidths.slice(0, widthInsertion),
            ...widthAdditions,
            ...state.columnWidths.slice(widthInsertion),
          ];

          const clampWidth = (value: number) => {
            if (!Number.isFinite(value)) {
              return DEFAULT_TABLE_COLUMN_WIDTH;
            }
            if (value < MIN_TABLE_COLUMN_WIDTH) {
              return MIN_TABLE_COLUMN_WIDTH;
            }
            if (value > MAX_TABLE_COLUMN_WIDTH) {
              return MAX_TABLE_COLUMN_WIDTH;
            }
            return Math.round(value);
          };

          const desiredTotalWidth = (() => {
            if (targetWidth && targetWidth > 0) {
              return targetWidth;
            }
            const existingTotal = state.columnWidths.reduce((sum, width) => sum + width, 0);
            return existingTotal > 0 ? existingTotal : null;
          })();

          if (desiredTotalWidth && nextColumnWidths.length > 0) {
            const currentTotal = nextColumnWidths.reduce((sum, width) => sum + width, 0);

            if (currentTotal > 0) {
              const scale = desiredTotalWidth / currentTotal;
              nextColumnWidths = nextColumnWidths.map(width => clampWidth(Math.round(width * scale)));

              let adjustedTotal = nextColumnWidths.reduce((sum, width) => sum + width, 0);
              const desiredTotal = Math.round(desiredTotalWidth);

              if (adjustedTotal !== desiredTotal && nextColumnWidths.length > 0) {
                let difference = desiredTotal - adjustedTotal;
                const step = difference > 0 ? 1 : -1;
                let index = 0;
                const maxIterations = nextColumnWidths.length * Math.abs(difference);
                let iterations = 0;

                while (difference !== 0 && iterations < maxIterations) {
                  const candidate = nextColumnWidths[index] + step;
                  if (candidate >= MIN_TABLE_COLUMN_WIDTH && candidate <= MAX_TABLE_COLUMN_WIDTH) {
                    nextColumnWidths[index] = candidate;
                    difference -= step;
                    adjustedTotal += step;
                  }
                  index = (index + 1) % nextColumnWidths.length;
                  iterations += 1;
                  if (index === 0) {
                    const canAdjust = nextColumnWidths.some(width => {
                      return step > 0 ? width < MAX_TABLE_COLUMN_WIDTH : width > MIN_TABLE_COLUMN_WIDTH;
                    });
                    if (!canAdjust) {
                      break;
                    }
                  }
                }
              }
            }
          }

          return {
            ...state,
            data: nextData,
            cols: nextCols,
            headers: renumberedHeaders,
            columnWidths: nextColumnWidths,
          };
        });
      },
      [mutateTableState, objectsMap],
    );

    const removeRowsFromTable = useCallback(
      (objectId: string, startIndex: number, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          if (state.rows <= 1) {
            return state;
          }

          const safeStart = Math.max(0, Math.min(startIndex, state.rows - 1));
          const available = state.rows - safeStart;
          const actualCount = Math.min(count, available);

          if (state.rows - actualCount < 1) {
            return state;
          }

          const nextData = state.data.filter((_, index) => index < safeStart || index >= safeStart + actualCount);
          const normalisedRowHeights = Array.from({ length: state.rows }, (_, index) => {
            const existing = state.rowHeights[index];
            if (!Number.isFinite(existing)) {
              return DEFAULT_TABLE_ROW_HEIGHT;
            }
            const rounded = Math.round(existing);
            if (!Number.isFinite(rounded)) {
              return DEFAULT_TABLE_ROW_HEIGHT;
            }
            return Math.min(Math.max(rounded, MIN_TABLE_ROW_HEIGHT), MAX_TABLE_ROW_HEIGHT);
          });
          const nextRowHeights = normalisedRowHeights.filter(
            (_, index) => index < safeStart || index >= safeStart + actualCount,
          );

          return {
            ...state,
            data: nextData,
            rows: nextData.length,
            rowHeights: nextRowHeights,
          };
        });
      },
      [mutateTableState],
    );

    const removeColumnsFromTable = useCallback(
      (objectId: string, startIndex: number, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          if (state.cols <= 1) {
            return state;
          }

          const safeStart = Math.max(0, Math.min(startIndex, state.cols - 1));
          const available = state.cols - safeStart;
          const actualCount = Math.min(count, available);

          if (state.cols - actualCount < 1) {
            return state;
          }

          const nextData = state.data.map(row => [
            ...row.slice(0, safeStart),
            ...row.slice(safeStart + actualCount),
          ]);
          const remainingHeaders = cloneTableHeaders(state.headers);
          const nextHeaders = remainingHeaders.filter(
            (_, index) => index < safeStart || index >= safeStart + actualCount,
          );
          const nextColumnWidths = state.columnWidths.filter(
            (_, index) => index < safeStart || index >= safeStart + actualCount,
          );
          const renumberedHeaders = renumberDefaultTableHeaders(nextHeaders);
          const nextCols = renumberedHeaders.length;

          return {
            ...state,
            data: nextData,
            cols: nextCols,
            headers: renumberedHeaders,
            columnWidths: nextColumnWidths,
          };
        });
      },
      [mutateTableState],
    );

    // Helper function to measure text content height
    // This function creates an unrotated, offscreen clone with identical CSS to measure accurate height
    const measureTextHeight = useCallback(
      async (
        text: string,
        formatting: {
          fontSize: number;
          fontFamily: string;
          bold: boolean;
          italic: boolean;
          underline: boolean;
          strikethrough: boolean;
          align: 'left' | 'center' | 'right';
        },
        width: number,
      ): Promise<number> => {
        if (typeof document === 'undefined') {
          return MIN_TEXT_OBJECT_HEIGHT;
        }

        // Ensure font is loaded before measuring
        const resolvedFontFamily = resolveFontFamily(formatting.fontFamily);
        if (typeof document.fonts !== 'undefined' && document.fonts.ready) {
          // Wait for fonts to be ready (especially important for custom fonts)
          try {
            await document.fonts.ready;
          } catch {
            // Ignore errors, continue with measurement
          }
        }

        const tempDiv = document.createElement('div');
        
        // Position offscreen, unrotated, invisible
        tempDiv.style.position = 'absolute';
        tempDiv.style.visibility = 'hidden';
        tempDiv.style.top = '-9999px';
        tempDiv.style.left = '-9999px';
        tempDiv.style.transform = 'none'; // Ensure no rotation
        tempDiv.style.transformOrigin = 'top left';
        
        // Match exact width (no padding, no border) - TextBox uses p-0
        tempDiv.style.width = `${width}px`;
        tempDiv.style.height = 'auto';
        tempDiv.style.minHeight = '0';
        tempDiv.style.maxHeight = 'none';
        
        // Match exact font properties
        tempDiv.style.fontSize = `${formatting.fontSize}px`;
        tempDiv.style.fontFamily = resolvedFontFamily;
        tempDiv.style.fontWeight = formatting.bold ? 'bold' : 'normal';
        tempDiv.style.fontStyle = formatting.italic ? 'italic' : 'normal';
        
        // Match text decoration
        const decorations: string[] = [];
        if (formatting.underline) decorations.push('underline');
        if (formatting.strikethrough) decorations.push('line-through');
        tempDiv.style.textDecoration = decorations.length > 0 ? decorations.join(' ') : 'none';
        
        // Match text alignment
        tempDiv.style.textAlign = formatting.align;
        
        // Match text wrapping (must be identical to TextBox component)
        tempDiv.style.whiteSpace = 'pre-wrap';
        tempDiv.style.wordBreak = 'break-word';
        tempDiv.style.overflowWrap = 'anywhere';
        
        // Match spacing - TextBox has p-0 (padding: 0) on outer div, inner div has no padding
        tempDiv.style.padding = '0';
        tempDiv.style.margin = '0';
        tempDiv.style.border = 'none';
        tempDiv.style.borderRadius = '0';
        tempDiv.style.boxSizing = 'border-box';
        
        // Don't set lineHeight explicitly - let browser use default to match TextBox behavior
        // TextBox doesn't set line-height, so browser default applies
        tempDiv.style.letterSpacing = 'normal';
        
        // Text is always stored as HTML in TextBox component (uses innerHTML)
        // Always use innerHTML to match the actual rendering
        if (text && text.trim().length > 0) {
          tempDiv.innerHTML = text;
        } else {
          tempDiv.innerHTML = '';
        }
        
        // Reset margins and padding on all child div/p elements to match TextBox behavior
        // Browsers apply default margins to div/p elements, which causes gaps
        const childElements = tempDiv.querySelectorAll('div, p');
        childElements.forEach(child => {
          (child as HTMLElement).style.margin = '0';
          (child as HTMLElement).style.padding = '0';
          (child as HTMLElement).style.boxSizing = 'border-box';
          // Ensure line-height matches parent (browser default)
          (child as HTMLElement).style.lineHeight = 'normal';
        });
        
        document.body.appendChild(tempDiv);
        
        // Force multiple reflows to ensure accurate measurement with loaded fonts
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        tempDiv.offsetHeight;
        // Force another reflow after fonts are potentially loaded
        void tempDiv.offsetHeight;
        
        // Wait a frame to ensure fonts are applied
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        // Force another reflow after animation frame and child style updates
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        tempDiv.offsetHeight;
        
        // Measure the natural height (scrollHeight includes all content)
        const height = Math.max(tempDiv.scrollHeight, MIN_TEXT_OBJECT_HEIGHT);
        
        document.body.removeChild(tempDiv);
        
        return height;
      },
      [],
    );

    // Helper function to auto-adjust textbox height based on content
    // Uses requestAnimationFrame to ensure measurement happens after React layout completes
    const adjustTextBoxHeight = useCallback(
      (objectId: string, width?: number) => {
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'text-box') {
          return;
        }

        // Use the provided width or fall back to object width
        const targetWidth = width ?? object.width;

        // Use requestAnimationFrame to ensure measurement happens after layout
        requestAnimationFrame(async () => {
          const currentObject = objectsMap.get(objectId);
          if (!currentObject || currentObject.type !== 'text-box') {
            return;
          }

          const props = currentObject.props as Record<string, unknown> | undefined;
          const formatting = extractTextBoxFormatting(props);

          // Measure with all formatting properties (now async)
          const measuredHeight = await measureTextHeight(
            formatting.text,
            {
              fontSize: formatting.fontSize,
              fontFamily: formatting.fontFamily,
              bold: formatting.bold,
              italic: formatting.italic,
              underline: formatting.underline,
              strikethrough: formatting.strikethrough,
              align: formatting.align,
            },
            targetWidth,
          );
          
          // Double-check object still exists after async operation
          const finalObject = objectsMap.get(objectId);
          if (!finalObject || finalObject.type !== 'text-box') {
            return;
          }
          
          // Only update if height changed significantly (avoid unnecessary updates)
          if (Math.abs(measuredHeight - finalObject.height) > 1) {
            onBulkUpdate({
              [objectId]: {
                height: measuredHeight,
              },
            });
          }
        });
      },
      [measureTextHeight, objectsMap, onBulkUpdate],
    );

    const commitEditingText = useCallback(() => {
      setEditingTextState(prev => {
        if (!prev) {
          return prev;
        }

        const object = objectsMap.get(prev.id);
        if (!object || object.type !== 'text-box') {
          return null;
        }

        const raw = prev.value ?? '';
        const contentWithoutTags = raw.replace(/<[^>]*>/g, '').trim();
        const isTitleTextBox = Boolean(titleObjectId && object.id === titleObjectId);
        const fallbackText = isTitleTextBox ? UNTITLED_SLIDE_TEXT : DEFAULT_TEXT_BOX_TEXT;
        const resolved = contentWithoutTags.length > 0 ? raw : fallbackText;
        const existingFormatting = extractTextBoxFormatting(object.props as Record<string, unknown> | undefined);

        if (resolved !== existingFormatting.text) {
          onInteract();
          const nextProps = { ...(object.props || {}), text: resolved };
          onBulkUpdate({
            [object.id]: {
              props: nextProps,
            },
          });
          // Auto-adjust height after text update (adjustTextBoxHeight uses requestAnimationFrame internally)
          adjustTextBoxHeight(object.id);
        }

        if (isTitleTextBox) {
          const existingPlain =
            existingFormatting.text.replace(/<[^>]*>/g, '').trim() || UNTITLED_SLIDE_TEXT;
          const plain = contentWithoutTags.length > 0 ? contentWithoutTags : UNTITLED_SLIDE_TEXT;
          if (plain !== existingPlain) {
            onTitleCommit?.(plain);
          }
        }

        return null;
      });
    }, [adjustTextBoxHeight, objectsMap, onBulkUpdate, onInteract, onTitleCommit, titleObjectId]);

    useEffect(() => {
      if (!canEdit && editingTextState) {
        commitEditingText();
      }
    }, [canEdit, commitEditingText, editingTextState]);

    const cancelEditingText = useCallback(() => {
      setEditingTextState(null);
    }, []);

    const beginEditingTextBox = useCallback(
      (objectId: string) => {
        if (!canEdit) {
          return;
        }

        if (editingTextState?.type === 'text-box' && editingTextState.id === objectId) {
          return;
        }

        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'text-box') {
          return;
        }

        const formatting = extractTextBoxFormatting(object.props as Record<string, unknown> | undefined);
        onInteract();
        focusCanvas();
        setSelectedIds([objectId]);
        setEditingTextState({
          id: objectId,
          type: 'text-box',
          value: formatting.text,
          original: formatting.text,
        });
      },
      [canEdit, editingTextState, focusCanvas, objectsMap, onInteract],
    );

    const handleEditingValueChange = useCallback(
      (value: string) => {
        setEditingTextState(prev => {
          if (!prev || prev.type !== 'text-box' || prev.value === value) {
            return prev;
          }
          onInteract();
          return { ...prev, value };
        });
      },
      [onInteract],
    );

    const beginEditingTableCell = useCallback(
      (objectId: string, target: TableCellEditTarget) => {
        if (!canEdit) {
          return;
        }

        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'table') {
          return;
        }

        onInteract();
        setSelectedIds(prev => {
          if (prev.length === 1 && prev[0] === objectId) {
            return prev;
          }
          return [objectId];
        });

        setEditingTextState(prev => {
          if (
            prev &&
            prev.type === 'table-cell' &&
            prev.id === objectId &&
            prev.region === target.region &&
            prev.row === target.row &&
            prev.col === target.col
          ) {
            return prev;
          }

          return {
            id: objectId,
            type: 'table-cell',
            region: target.region,
            row: target.row,
            col: target.col,
          };
        });
      },
      [canEdit, objectsMap, onInteract],
    );

    const endEditingTableCell = useCallback(
      (objectId: string, target: TableCellEditTarget) => {
        setEditingTextState(prev => {
          if (!prev || prev.type !== 'table-cell') {
            return prev;
          }

          if (prev.id !== objectId) {
            return prev;
          }

          if (
            prev.region !== target.region ||
            prev.row !== target.row ||
            prev.col !== target.col
          ) {
            return prev;
          }

          return null;
        });
      },
      [],
    );

    const handleObjectDoubleClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }
        const object = objectsMap.get(objectId);
        if (!object) {
          return;
        }
        if (object.type === 'text-box') {
          event.stopPropagation();
          beginEditingTextBox(objectId);
        }
      },
      [beginEditingTextBox, canEdit, objectsMap],
    );

    const handleContextMenuRequest = useCallback(
      (event: React.MouseEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }

        event.stopPropagation();

        if (editingTextState) {
          commitEditingText();
        }

        focusCanvas();
        setSelectedIds(prev => (prev.includes(objectId) ? prev : [objectId]));
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas],
    );

    const clampPosition = useCallback((x: number, y: number, width: number, height: number) => {
      const canvas = internalRef.current;
      if (!canvas) {
        return { x, y };
      }
      const maxX = Math.max(0, canvas.clientWidth - width);
      const maxY = Math.max(0, canvas.clientHeight - height);
      return {
        x: Math.min(Math.max(0, x), maxX),
        y: Math.min(Math.max(0, y), maxY),
      };
    }, []);

    const clampAndSnapPosition = useCallback(
      (x: number, y: number, width: number, height: number) => {
        const canvas = internalRef.current;
        const { x: clampedX, y: clampedY } = clampPosition(x, y, width, height);
        const maxX = canvas ? Math.max(0, canvas.clientWidth - width) : clampedX;
        const maxY = canvas ? Math.max(0, canvas.clientHeight - height) : clampedY;
        if (!snapToGridEnabled) {
          return { x: clampedX, y: clampedY };
        }
        const snappedX = Math.min(Math.max(0, snapToGrid(clampedX, gridSize)), maxX);
        const snappedY = Math.min(Math.max(0, snapToGrid(clampedY, gridSize)), maxY);
        return { x: snappedX, y: snappedY };
      },
      [clampPosition, gridSize, snapToGridEnabled],
    );

    const handlePasteClipboard = useCallback(() => {
      if (!canEdit) {
        return;
      }

      if (clipboard.length === 0) {
        toast({
          title: 'Clipboard empty',
          description: 'Copy an object before attempting to paste.',
        });
        return;
      }

      const pastedIds: string[] = [];
      clipboard.forEach((snapshot, index) => {
        const baseProps = cloneValue(snapshot.props ?? {}) as Record<string, unknown>;
        delete baseProps.locked;

        const offset = gridSize * 2 * (index + 1);
        const nextX = snapshot.x + offset;
        const nextY = snapshot.y + offset;
        const { x, y } = clampAndSnapPosition(nextX, nextY, snapshot.width, snapshot.height);
        const newId = generateObjectId(snapshot.id);

        if (snapshot.type === 'atom') {
          const atom = (snapshot.props as { atom?: DroppedAtom } | undefined)?.atom;
          if (atom) {
            const clonedAtom: DroppedAtom = { ...cloneValue(atom), id: newId };
            baseProps.atom = clonedAtom;
            onAddAtom?.(clonedAtom);
          }
        }

        const prepared: SlideObject = {
          ...snapshot,
          id: newId,
          x,
          y,
          groupId: null,
          props: baseProps,
        };

        onAddObject(prepared);
        pastedIds.push(newId);
      });

      if (pastedIds.length === 0) {
        return;
      }

      onInteract();
      onBringToFront(pastedIds);
      setSelectedIds(pastedIds);
      focusCanvas();
      toast({
        title: pastedIds.length === 1 ? 'Object pasted' : 'Objects pasted',
        description:
          pastedIds.length === 1
            ? 'Added a copy of the selected object to the slide.'
            : `Added ${pastedIds.length} copied objects to the slide.`,
      });
    }, [
      canEdit,
      clipboard,
      clampAndSnapPosition,
      focusCanvas,
      onAddAtom,
      onAddObject,
      onBringToFront,
      onInteract,
    ]);

    const handleDuplicateSelection = useCallback(
      (explicitIds?: string[] | null) => {
        if (!canEdit) {
          return;
        }

        const targets = resolveTargetObjects(explicitIds);
        if (targets.length === 0) {
          toast({
            title: 'Nothing to duplicate',
            description: 'Select at least one object before duplicating.',
          });
          return;
        }

        const duplicatedIds: string[] = [];
        targets.forEach((object, index) => {
          const baseProps = cloneValue(object.props ?? {}) as Record<string, unknown>;
          delete baseProps.locked;
          const offset = gridSize * 2 * (index + 1);
          const { x, y } = clampAndSnapPosition(
            object.x + offset,
            object.y + offset,
            object.width,
            object.height,
          );
          const newId = generateObjectId(object.id);

          if (object.type === 'atom') {
            const atom = (object.props as { atom?: DroppedAtom } | undefined)?.atom;
            if (atom) {
              const clonedAtom: DroppedAtom = { ...cloneValue(atom), id: newId };
              baseProps.atom = clonedAtom;
              onAddAtom?.(clonedAtom);
            }
          }

          const duplicate: SlideObject = {
            ...object,
            id: newId,
            x,
            y,
            groupId: null,
            props: baseProps,
          };

          onAddObject(duplicate);
          duplicatedIds.push(newId);
        });

        if (duplicatedIds.length === 0) {
          return;
        }

        onInteract();
        onBringToFront(duplicatedIds);
        setSelectedIds(duplicatedIds);
        focusCanvas();
        toast({
          title: duplicatedIds.length === 1 ? 'Object duplicated' : 'Objects duplicated',
          description:
            duplicatedIds.length === 1
              ? 'Added a copy of the selected object.'
              : `Added ${duplicatedIds.length} duplicated objects to the slide.`,
        });
      },
      [
        canEdit,
        clampAndSnapPosition,
        focusCanvas,
        onAddAtom,
        onAddObject,
        onBringToFront,
        onInteract,
        resolveTargetObjects,
      ],
    );

    const handleAlignSelection = useCallback(
      (alignment: AlignAction) => {
        if (selectedObjects.length === 0) {
          toast({
            title: 'No object selected',
            description: 'Select an object to align it on the slide.',
          });
          return;
        }
    
        const canvas = internalRef.current;
        if (!canvas) {
          toast({
            title: 'Canvas unavailable',
            description: 'Unable to align objects while the canvas is not ready.',
          });
          return;
        }
    
        const canvasW = canvas.clientWidth;
        const canvasH = canvas.clientHeight;
        const targets = unlockedSelectedObjects.length > 0 ? unlockedSelectedObjects : selectedObjects;
        const updates: Record<string, Partial<SlideObject>> = {};
    
        // Helpers --------------------------------------------------------------
        const degToRad = (d: number) => (d * Math.PI) / 180;
    
        // compute AABB of a rotated rectangle (rotation about center)
        function getAABB(obj: SlideObject) {
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          const hw = obj.width / 2;
          const hh = obj.height / 2;
          const theta = degToRad(obj.rotation ?? 0);
    
          const corners = [
            { x: -hw, y: -hh },
            { x: hw, y: -hh },
            { x: hw, y: hh },
            { x: -hw, y: hh },
          ];
    
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
    
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
    
          for (const c of corners) {
            const rx = c.x * cos - c.y * sin;
            const ry = c.x * sin + c.y * cos;
            const worldX = cx + rx;
            const worldY = cy + ry;
            if (worldX < minX) minX = worldX;
            if (worldY < minY) minY = worldY;
            if (worldX > maxX) maxX = worldX;
            if (worldY > maxY) maxY = worldY;
          }
    
          return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
        }
    
        // Build selection bounding box from AABBs of the targets
        let selMinX = Infinity;
        let selMinY = Infinity;
        let selMaxX = -Infinity;
        let selMaxY = -Infinity;
    
        const targetAABBs = targets.map(obj => {
          const aabb = getAABB(obj);
          if (aabb.minX < selMinX) selMinX = aabb.minX;
          if (aabb.minY < selMinY) selMinY = aabb.minY;
          if (aabb.maxX > selMaxX) selMaxX = aabb.maxX;
          if (aabb.maxY > selMaxY) selMaxY = aabb.maxY;
          return { obj, aabb };
        });
    
        // If selection bounds didn't change (fail-safe)
        if (!isFinite(selMinX)) {
          toast({
            title: 'Alignment failed',
            description: 'No valid bounding box for selection.',
          });
          return;
        }
    
        const selCenterX = (selMinX + selMaxX) / 2;
        const selCenterY = (selMinY + selMaxY) / 2;
    
        // For each object compute the desired AABB target, then translate the object's x,y
        for (const { obj, aabb } of targetAABBs) {
          let desiredAabbLeft = aabb.minX;
          let desiredAabbTop = aabb.minY;
    
          // Horizontal alignment
          if (alignment === 'left' || alignment === 'center' || alignment === 'right') {
            if (alignment === 'left') {
              desiredAabbLeft = selMinX;
            } else if (alignment === 'center') {
              // set object's AABB center to selection center
              desiredAabbLeft = selCenterX - aabb.width / 2;
            } else if (alignment === 'right') {
              desiredAabbLeft = selMaxX - aabb.width;
            }
          }
    
          // Vertical alignment
          if (alignment === 'top' || alignment === 'middle' || alignment === 'bottom') {
            if (alignment === 'top') {
              desiredAabbTop = selMinY;
            } else if (alignment === 'middle') {
              desiredAabbTop = selCenterY - aabb.height / 2;
            } else if (alignment === 'bottom') {
              desiredAabbTop = selMaxY - aabb.height;
            }
          }
    
          // Optionally snap the desired AABB position to grid (snap the final object's top-left after translation)
          // Compute translation delta to move AABB from current to desired
          const dx = desiredAabbLeft - aabb.minX;
          const dy = desiredAabbTop - aabb.minY;
    
          // Apply translation to the object's top-left coordinates
          let newX = obj.x + dx;
          let newY = obj.y + dy;
    
          // Snap the final object coordinates if grid is enabled (you can also snap desiredAabbLeft instead,
          // but snapping object.x/object.y is straightforward and preserves rotation offset semantics)
          if (snapToGridEnabled) {
            newX = Math.min(Math.max(0, snapToGrid(newX, gridSize)), Math.max(0, canvasW - obj.width));
            newY = Math.min(Math.max(0, snapToGrid(newY, gridSize)), Math.max(0, canvasH - obj.height));
          } else {
            // Clamp within canvas (to avoid negative or off-canvas top-left)
            newX = Math.min(Math.max(0, newX), Math.max(0, canvasW - obj.width));
            newY = Math.min(Math.max(0, newY), Math.max(0, canvasH - obj.height));
          }
    
          // Only push an update if the change is meaningful
          if (Math.abs(newX - obj.x) > 0.5 || Math.abs(newY - obj.y) > 0.5) {
            updates[obj.id] = { ...(updates[obj.id] ?? {}), x: newX, y: newY };
          }
        }
    
        if (Object.keys(updates).length === 0) {
          toast({
            title: 'No alignment changes',
            description: 'Objects already align to the requested position.',
          });
          return;
        }
    
        onInteract();
        onBulkUpdate(updates);
        toast({
          title: 'Objects aligned',
          description: 'Updated the selection alignment on the slide.',
        });
      },
      [
        onBulkUpdate,
        onInteract,
        selectedObjects,
        unlockedSelectedObjects,
        internalRef,
        snapToGridEnabled,
        snapToGrid,
        gridSize,
        toast,
      ],
    );
    

    const handleBackgroundPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if (event.button !== 0) {
          return;
        }

        const target = event.target as Element | null;
        // Don't deselect when clicking inside context menu
        if (target?.closest('[data-context-menu-root]') || 
            target?.closest('[data-radix-context-menu-content]') ||
            target?.closest('[data-radix-context-menu-sub-content]')) {
          return;
        }

        if (editingTextState) {
          commitEditingText();
        }

        onInteract();
        setSelectedIds([]);
        focusCanvas();
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas, onInteract],
    );

    const handleBackgroundContextMenu = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if (editingTextState) {
          commitEditingText();
        }

        focusCanvas();
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas],
    );

    const selectionCount = selectedIds.length;

    useEffect(() => {
      if (!canEdit || selectionCount === 0) {
        return;
      }

      const resolveTargetElement = (eventTarget: EventTarget | null): Element | null => {
        if (!eventTarget) {
          return null;
        }

        if (eventTarget instanceof Element) {
          return eventTarget;
        }

        if (eventTarget instanceof Node) {
          return eventTarget.parentElement;
        }

        return null;
      };

      const handlePointerDown = (event: MouseEvent | TouchEvent) => {
        const node = internalRef.current;

        if (!node) {
          return;
        }

        const targetElement = resolveTargetElement(event.target);

        if (targetElement) {
          if (node.contains(targetElement)) {
            return;
          }

          if (targetElement.closest('[data-text-toolbar-root]')) {
            return;
          }

          // Don't deselect when clicking inside context menu
          if (targetElement.closest('[data-context-menu-root]')) {
            return;
          }

          // Also check for Radix UI context menu portal elements
          if (targetElement.closest('[data-radix-context-menu-content]')) {
            return;
          }

          // Check for context menu sub-content (submenus)
          if (targetElement.closest('[data-radix-context-menu-sub-content]')) {
            return;
          }
        }

        if (editingTextState) {
          commitEditingText();
        }

        onInteract();
        setSelectedIds([]);
      };

      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);

      return () => {
        document.removeEventListener('mousedown', handlePointerDown);
        document.removeEventListener('touchstart', handlePointerDown);
      };
    }, [canEdit, commitEditingText, editingTextState, onInteract, selectionCount]);

    const handleObjectPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }

        const targetElement = event.target instanceof Element ? event.target : null;
        const editableTableCell = targetElement?.closest('[data-exhibition-table-cell-content="true"]');
        const tableCellContainer = targetElement?.closest('[data-exhibition-table-cell-region]');
        const cellRegionAttr = tableCellContainer?.getAttribute('data-exhibition-table-cell-region');
        const cellRowAttr = tableCellContainer?.getAttribute('data-exhibition-table-cell-row');
        const cellColAttr = tableCellContainer?.getAttribute('data-exhibition-table-cell-col');
        const parsedRow = typeof cellRowAttr === 'string' ? Number(cellRowAttr) : null;
        const parsedCol = typeof cellColAttr === 'string' ? Number(cellColAttr) : null;
        const hasValidRow = parsedRow !== null && !Number.isNaN(parsedRow);
        const hasValidCol = parsedCol !== null && !Number.isNaN(parsedCol);
        const parsedRegion = cellRegionAttr === 'header' || cellRegionAttr === 'body' ? cellRegionAttr : null;

        const targetObject = objectsMap.get(objectId);
        const isLocked = isSlideObjectLocked(targetObject);

        const isMulti = event.shiftKey || event.metaKey || event.ctrlKey;
        const resolveSelection = (): string[] => {
          const baseSelection = isMulti
            ? selectedIds.includes(objectId)
              ? selectedIds
              : [...selectedIds, objectId]
            : [objectId];
          return Array.from(new Set(baseSelection));
        };

        if (editableTableCell) {
          event.stopPropagation();
          const isEditingSameCell =
            editingTextState?.type === 'table-cell' &&
            editingTextState.id === objectId &&
            parsedRegion === editingTextState.region &&
            hasValidRow &&
            hasValidCol &&
            editingTextState.row === parsedRow &&
            editingTextState.col === parsedCol;
          if (editingTextState && !isEditingSameCell) {
            commitEditingText();
          }
          onInteract();
          const uniqueSelection = resolveSelection();
          setSelectedIds(uniqueSelection);
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (editingTextState) {
          commitEditingText();
        }
        focusCanvas();

        const uniqueSelection = resolveSelection();
        setSelectedIds(uniqueSelection);

        if (isLocked) {
          return;
        }

        onInteract();

        const initialPositions = new Map<string, { x: number; y: number }>();
        uniqueSelection.forEach(id => {
          const object = objectsMap.get(id);
          if (object) {
            initialPositions.set(id, { x: object.x, y: object.y });
          }
        });

        if (initialPositions.size === 0) {
          return;
        }

        setActiveInteraction({
          kind: 'move',
          objectIds: Array.from(initialPositions.keys()),
          startClientX: event.clientX,
          startClientY: event.clientY,
          initialPositions,
        });
      },
      [canEdit, commitEditingText, editingTextState, focusCanvas, onInteract, objectsMap, selectedIds],
    );

    const handleResizeStart = useCallback(
      (event: React.PointerEvent<HTMLSpanElement>, objectId: string, handle: ResizeHandle) => {
        if (!canEdit) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        focusCanvas();
        const target = objectsMap.get(objectId);
        if (!target) {
          return;
        }
        if (isSlideObjectLocked(target)) {
          setSelectedIds(prev => (prev.includes(objectId) ? prev : [objectId]));
          return;
        }
        onInteract();
        setSelectedIds([objectId]);
        
        // Store initial font size for textboxes
        let initialFontSize: number | undefined;
        if (target.type === 'text-box') {
          const props = target.props as Record<string, unknown> | undefined;
          const fontSize = typeof props?.fontSize === 'number' ? props.fontSize : undefined;
          if (typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0) {
            initialFontSize = fontSize;
          }
        }
        
        setActiveInteraction({
          kind: 'resize',
          objectId,
          handle,
          startClientX: event.clientX,
          startClientY: event.clientY,
          initial: {
            x: target.x,
            y: target.y,
            width: target.width,
            height: target.height,
            fontSize: initialFontSize,
          },
        });
      },
      [canEdit, focusCanvas, onInteract, objectsMap],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if ((event.key === 'z' || event.key === 'Z') && (event.metaKey || event.ctrlKey)) {
          if (editingTextState) {
            return;
          }
          event.preventDefault();
          onUndo?.();
          return;
        }

        if (event.key === 'Escape') {
          setSelectedIds([]);
          if (editingTextState) {
            cancelEditingText();
          }
          return;
        }

        if (editingTextState) {
          return;
        }

        if ((event.key === 'v' || event.key === 'V') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handlePasteClipboard();
          return;
        }

        if (selectedIds.length === 0) {
          return;
        }

        if ((event.key === 'c' || event.key === 'C') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (event.altKey) {
            handleCopyStyle();
          } else {
            handleCopySelection();
          }
          return;
        }

        if ((event.key === 'x' || event.key === 'X') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleCutSelection();
          return;
        }

        if ((event.key === 'd' || event.key === 'D') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleDuplicateSelection();
          return;
        }

        if ((event.key === 'l' || event.key === 'L') && event.altKey && event.shiftKey) {
          event.preventDefault();
          handleToggleLock();
          return;
        }

        if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleLinkSelection();
          return;
        }

        if ((event.key === 'n' || event.key === 'N') && (event.metaKey || event.ctrlKey) && event.altKey) {
          event.preventDefault();
          handleCommentSelection();
          return;
        }

        const activeTargets =
          unlockedSelectedObjects.length > 0 ? unlockedSelectedObjects : selectedObjects;

        if (activeTargets.length === 0) {
          toast({
            title: 'Selection locked',
            description: 'Unlock the selected objects to edit them.',
          });
          return;
        }

        const activeIds = activeTargets.map(object => object.id);

        const baseStep = snapToGridEnabled ? gridSize : 4;
        const step = event.shiftKey ? baseStep * 2 : baseStep;
        if (
          event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown'
        ) {
          event.preventDefault();
          const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
          const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          const updates: Record<string, Partial<SlideObject>> = {};
          activeTargets.forEach(object => {
            const { x, y } = clampAndSnapPosition(
              object.x + deltaX,
              object.y + deltaY,
              object.width,
              object.height,
            );
            if (x !== object.x || y !== object.y) {
              updates[object.id] = { x, y };
            }
          });
          if (Object.keys(updates).length > 0) {
            onInteract();
            onBulkUpdate(updates);
          }
          return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          handleDeleteSelection();
          return;
        }

        if ((event.key === 'g' || event.key === 'G') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (event.shiftKey) {
            onInteract();
            onGroupObjects(activeIds, null);
          } else {
            const groupId = `group-${Date.now()}`;
            onInteract();
            onGroupObjects(activeIds, groupId);
          }
          return;
        }

        if (event.key === ']' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleLayerAction('front');
          return;
        }

        if (event.key === '[' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleLayerAction('back');
          return;
        }
      },
      [
        canEdit,
        cancelEditingText,
        clampAndSnapPosition,
        handleCutSelection,
        handleDuplicateSelection,
        editingTextState,
        handleCommentSelection,
        handleCopySelection,
        handleCopyStyle,
        handleDeleteSelection,
        handleLayerAction,
        handleLinkSelection,
        handlePasteClipboard,
        handleToggleLock,
        onUndo,
        onBulkUpdate,
        onGroupObjects,
        onInteract,
        selectedIds,
        selectedObjects,
        unlockedSelectedObjects,
      ],
    );

    useEffect(() => {
      if (!activeInteraction) {
        return;
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!canEdit) {
          return;
        }

        if (activeInteraction.kind === 'move') {
          const deltaX = event.clientX - activeInteraction.startClientX;
          const deltaY = event.clientY - activeInteraction.startClientY;
          const updates: Record<string, Partial<SlideObject>> = {};
          activeInteraction.objectIds.forEach(id => {
            const initial = activeInteraction.initialPositions.get(id);
            const object = objectsMap.get(id);
            if (!initial || !object) {
              return;
            }
            const { x, y } = clampAndSnapPosition(initial.x + deltaX, initial.y + deltaY, object.width, object.height);
            updates[id] = { x, y };
          });
          if (Object.keys(updates).length > 0) {
            onBulkUpdate(updates);
          }
        } else if (activeInteraction.kind === 'resize') {
          const { handle, initial, objectId } = activeInteraction;
          const target = objectsMap.get(objectId);
          if (!target) {
            return;
          }

          const { minWidth, minHeight } =
            target.type === 'text-box'
              ? { minWidth: MIN_TEXT_OBJECT_WIDTH, minHeight: MIN_TEXT_OBJECT_HEIGHT }
              : { minWidth: MIN_OBJECT_WIDTH, minHeight: MIN_OBJECT_HEIGHT };

          const deltaX = event.clientX - activeInteraction.startClientX;
          const deltaY = event.clientY - activeInteraction.startClientY;

          let nextX = initial.x;
          let nextY = initial.y;
          let nextWidth = initial.width;
          let nextHeight = initial.height;

          // Textbox-specific resize logic
          if (target.type === 'text-box') {
            const props = target.props as Record<string, unknown> | undefined;
            const currentFontSize = typeof props?.fontSize === 'number' && Number.isFinite(props.fontSize) && props.fontSize > 0
              ? props.fontSize
              : 16;
            const fontFamily = typeof props?.fontFamily === 'string' && props.fontFamily.trim().length > 0
              ? props.fontFamily
              : 'Comic Sans';
            const initialFontSize = initial.fontSize ?? currentFontSize;

            // Handle side handles (l, r) - width only, no height change during drag
            if (handle === 'l') {
              nextX = initial.x + deltaX;
              nextWidth = initial.width - deltaX;
              // Height stays the same during drag, will be auto-adjusted on release
            } else if (handle === 'r') {
              nextWidth = initial.width + deltaX;
              // Height stays the same during drag, will be auto-adjusted on release
            } else {
              // Corner handles - maintain aspect ratio and uniform scaling with font size
              // Calculate scale based on the primary drag direction (use average of both)
              const scaleX = (initial.width + (handle === 'nw' || handle === 'sw' ? -deltaX : deltaX)) / initial.width;
              const scaleY = (initial.height + (handle === 'nw' || handle === 'ne' ? -deltaY : deltaY)) / initial.height;
              
              // Use average scale to maintain aspect ratio
              const uniformScale = (scaleX + scaleY) / 2;
              
              // Apply the same scale to both dimensions to maintain aspect ratio
              nextWidth = initial.width * uniformScale;
              nextHeight = initial.height * uniformScale;
              
              // Adjust position based on handle
              if (handle === 'nw' || handle === 'sw') {
                nextX = initial.x + initial.width - nextWidth;
              }
              if (handle === 'nw' || handle === 'ne') {
                nextY = initial.y + initial.height - nextHeight;
              }


              // Clamp to canvas bounds while maintaining aspect ratio
              const canvas = internalRef.current;
              if (canvas) {
                const maxWidth = canvas.clientWidth;
                const maxHeight = canvas.clientHeight;
                const aspectRatio = initial.width / initial.height;
                
                // Check if we need to constrain by width or height
                if (nextWidth > maxWidth) {
                  nextWidth = maxWidth;
                  nextHeight = nextWidth / aspectRatio;
                }
                if (nextHeight > maxHeight) {
                  nextHeight = maxHeight;
                  nextWidth = nextHeight * aspectRatio;
                }
              }

              // Ensure minimum size while maintaining aspect ratio
              if (nextWidth < minWidth) {
                nextWidth = minWidth;
                nextHeight = nextWidth / (initial.width / initial.height);
                if (handle === 'nw' || handle === 'sw') {
                  nextX = initial.x + initial.width - nextWidth;
                }
              }
              if (nextHeight < minHeight) {
                nextHeight = minHeight;
                nextWidth = nextHeight * (initial.width / initial.height);
                if (handle === 'nw' || handle === 'ne') {
                  nextY = initial.y + initial.height - nextHeight;
                }
              }

              // Recalculate final scale from clamped dimensions to maintain aspect ratio
              const finalScale = Math.min(nextWidth / initial.width, nextHeight / initial.height);
              const finalWidth = initial.width * finalScale;
              const finalHeight = initial.height * finalScale;
              
              // Adjust position for final dimensions
              if (handle === 'nw' || handle === 'sw') {
                nextX = initial.x + initial.width - finalWidth;
              }
              if (handle === 'nw' || handle === 'ne') {
                nextY = initial.y + initial.height - finalHeight;
              }

              const { x, y } = clampAndSnapPosition(nextX, nextY, finalWidth, finalHeight);
              
              // Snap to grid while maintaining aspect ratio
              let snappedWidth = snapToGridEnabled
                ? Math.max(minWidth, snapToGrid(finalWidth, gridSize))
                : Math.max(minWidth, finalWidth);
              let snappedHeight = snapToGridEnabled
                ? Math.max(minHeight, snapToGrid(finalHeight, gridSize))
                : Math.max(minHeight, finalHeight);
              
              // Maintain aspect ratio after snapping by using the average scale
              if (snapToGridEnabled) {
                const scaleFromWidth = snappedWidth / initial.width;
                const scaleFromHeight = snappedHeight / initial.height;
                const snappedScale = (scaleFromWidth + scaleFromHeight) / 2;
                snappedWidth = initial.width * snappedScale;
                snappedHeight = initial.height * snappedScale;
              }
              
              const widthLimit = canvas ? Math.max(minWidth, Math.min(snappedWidth, canvas.clientWidth)) : snappedWidth;
              const heightLimit = canvas ? Math.max(minHeight, Math.min(snappedHeight, canvas.clientHeight)) : snappedHeight;
              
              // Recalculate font size based on final scale (use average to maintain consistency with aspect ratio)
              const finalWidthScale = widthLimit / initial.width;
              const finalHeightScale = heightLimit / initial.height;
              const actualScale = (finalWidthScale + finalHeightScale) / 2;
              const newFontSize = Math.max(8, Math.min(200, initialFontSize * actualScale));
              const clampedFontSize = Math.round(newFontSize * 10) / 10;

              // Update with font size scaling
              const nextProps = { ...(props || {}) } as Record<string, unknown>;
              nextProps.fontSize = clampedFontSize;

              onBulkUpdate({
                [objectId]: {
                  x,
                  y,
                  width: widthLimit,
                  height: heightLimit,
                  props: nextProps,
                },
              });
              return;
            }

            // For side handles (l, r), only update width
            const canvas = internalRef.current;
            if (canvas) {
              nextWidth = Math.min(nextWidth, canvas.clientWidth);
            }

            if (nextWidth < minWidth) {
              if (handle === 'l') {
                nextX -= minWidth - nextWidth;
              }
              nextWidth = minWidth;
            }

            const { x, y } = clampAndSnapPosition(nextX, nextY, nextWidth, nextHeight);
            const snappedWidth = snapToGridEnabled
              ? Math.max(minWidth, snapToGrid(nextWidth, gridSize))
              : Math.max(minWidth, nextWidth);
            const widthLimit = canvas ? Math.max(minWidth, Math.min(snappedWidth, canvas.clientWidth)) : snappedWidth;

            // Store final width in activeInteraction for use in handlePointerUp
            setActiveInteraction(prev => {
              if (prev?.kind === 'resize' && prev.objectId === objectId) {
                return { ...prev, finalWidth: widthLimit };
              }
              return prev;
            });

            onBulkUpdate({
              [objectId]: {
                x,
                y,
                width: widthLimit,
                // Height will be auto-adjusted on pointer up
              },
            });
            return;
          }

          // Non-textbox resize logic (existing behavior)
          if (handle === 'nw' || handle === 'sw') {
            nextX = initial.x + deltaX;
            nextWidth = initial.width - deltaX;
          }
          if (handle === 'ne' || handle === 'se') {
            nextWidth = initial.width + deltaX;
          }
          if (handle === 'nw' || handle === 'ne') {
            nextY = initial.y + deltaY;
            nextHeight = initial.height - deltaY;
          }
          if (handle === 'sw' || handle === 'se') {
            nextHeight = initial.height + deltaY;
          }

          const canvas = internalRef.current;
          if (canvas) {
            nextWidth = Math.min(nextWidth, canvas.clientWidth);
            nextHeight = Math.min(nextHeight, canvas.clientHeight);
          }

          if (nextWidth < minWidth) {
            if (handle === 'nw' || handle === 'sw') {
              nextX -= minWidth - nextWidth;
            }
            nextWidth = minWidth;
          }

          if (nextHeight < minHeight) {
            if (handle === 'nw' || handle === 'ne') {
              nextY -= minHeight - nextHeight;
            }
            nextHeight = minHeight;
          }

          const { x, y } = clampAndSnapPosition(nextX, nextY, nextWidth, nextHeight);
          const snappedWidth = snapToGridEnabled
            ? Math.max(minWidth, snapToGrid(nextWidth, gridSize))
            : Math.max(minWidth, nextWidth);
          const snappedHeight = snapToGridEnabled
            ? Math.max(minHeight, snapToGrid(nextHeight, gridSize))
            : Math.max(minHeight, nextHeight);
          const widthLimit = canvas ? Math.max(minWidth, Math.min(snappedWidth, canvas.clientWidth)) : snappedWidth;
          const heightLimit = canvas ? Math.max(minHeight, Math.min(snappedHeight, canvas.clientHeight)) : snappedHeight;

          onBulkUpdate({
            [objectId]: {
              x,
              y,
              width: widthLimit,
              height: heightLimit,
            },
          });
        }
      };

      const handlePointerUp = () => {
        // Auto-adjust text height for textbox side handles
        if (activeInteraction?.kind === 'resize') {
          const { handle, objectId, finalWidth } = activeInteraction;
          const target = objectsMap.get(objectId);
          
          if (target && target.type === 'text-box' && (handle === 'l' || handle === 'r')) {
            // Use stored finalWidth to avoid stale state, fallback to current width if not stored
            const widthToUse = finalWidth ?? target.width;
            
            // Use adjustTextBoxHeight which handles async measurement and font loading
            adjustTextBoxHeight(objectId, widthToUse);
          }
        }
        
        setActiveInteraction(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [activeInteraction, canEdit, clampAndSnapPosition, onBulkUpdate, objectsMap, measureTextHeight, adjustTextBoxHeight, snapToGridEnabled, gridSize]);

    const handleDefinitions: Array<{ handle: ResizeHandle; className: string; cursor: string }> = useMemo(
      () => [
        { handle: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
        { handle: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
      ],
      [],
    );

    const textBoxHandleDefinitions: Array<{ handle: ResizeHandle; className: string; cursor: string }> = useMemo(
      () => [
        { handle: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
        { handle: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
        { handle: 'l', className: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
        { handle: 'r', className: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2', cursor: 'ew-resize' },
      ],
      [],
    );

    const renderObjectContent = (object: SlideObject) => {
      if (isAtomObject(object)) {
        return <ExhibitedAtomRenderer atom={object.props.atom} />;
      }

      if (object.type === 'accent-image') {
        const src = typeof object.props?.src === 'string' ? object.props.src : null;
        const name =
          typeof object.props?.name === 'string' && object.props.name.trim().length > 0
            ? object.props.name.trim()
            : 'Accent image';

        if (src) {
          return <img src={src} alt={name} className="h-full w-full object-cover" />;
        }

        return (
          <div className="flex h-full w-full items-center justify-center bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Accent image
          </div>
        );
      }

      if (object.type === 'image') {
        const src = typeof object.props?.src === 'string' ? object.props.src : null;
        const name =
          typeof object.props?.name === 'string' && object.props.name.trim().length > 0
            ? object.props.name.trim()
            : 'Slide image';

        if (src) {
          return <img src={src} alt={name} className="h-full w-full object-cover" />;
        }

        return (
          <div className="flex h-full w-full items-center justify-center bg-muted/20 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Image
          </div>
        );
      }

      if (object.type === 'text-box') {
        return null;
      }

      if (object.type === 'shape') {
        return null;
      }

      if (typeof object.props?.text === 'string') {
        return <p className="text-sm leading-relaxed text-muted-foreground">{object.props.text}</p>;
      }

      return (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
          Unsupported component type: {object.type}
        </div>
      );
    };

    const canvasCornerClass = fullBleed ? 'rounded-none' : 'rounded-[28px]';

    const layoutOverlay = useMemo(
      () => resolveLayoutOverlay(layout, cardColor, accentImage, accentImageName, fullBleed),
      [layout, cardColor, accentImage, accentImageName, fullBleed],
    );

  const canvasBorderClass = (() => {
      if (isDragOver) {
        return 'ring-2 ring-primary/20 shadow-xl scale-[0.99]';
      }

      if (showEmptyState) {
        return 'border-0';
      }

    return fullBleed ? 'border-0' : 'border-0 shadow-lg shadow-black/5';
  })();

    const backgroundLockLabel = backgroundLocked ? 'Unlock background' : 'Lock background';

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setRef}
            className={cn(
              'relative h-full w-full overflow-hidden transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 bg-transparent',
              canvasCornerClass,
              canvasBorderClass,
            )}
            tabIndex={canEdit ? 0 : -1}
            onPointerDown={handleBackgroundPointerDown}
            onKeyDown={handleKeyDown}
            onContextMenu={handleBackgroundContextMenu}
            onDragOver={onCanvasDragOver}
            onDragLeave={onCanvasDragLeave}
            onDrop={onCanvasDrop}
          >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">{layoutOverlay}</div>

        {showGrid && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              zIndex: 6,
              backgroundImage:
                'linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px)',
              backgroundSize: `${gridSize}px ${gridSize}px`,
            }}
          />
        )}

        {showGuides && (
          <div className="pointer-events-none absolute inset-0" style={{ zIndex: 7 }}>
            <div className="absolute inset-y-0 left-1/2 w-px bg-primary/40" style={{ transform: 'translateX(-0.5px)' }} />
            <div className="absolute inset-x-0 top-1/2 h-px bg-primary/40" style={{ transform: 'translateY(-0.5px)' }} />
          </div>
        )}

        {showEmptyState && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-muted/10 px-6 text-center text-sm text-muted-foreground',
              canvasCornerClass,
            )}
          >
            Add components from the catalogue to build your presentation slide.
          </div>
        )}

        <div className="relative z-20 h-full w-full">
          {objects.map(object => {
            const isSelected = selectedIds.includes(object.id);
            const baseZIndex = typeof object.zIndex === 'number' ? object.zIndex : 0;
            const selectionOrderIndex = selectedOrderMap.get(object.id);
            const interactionOrderIndex = activeInteractionOrderMap.get(object.id);
            const rotation = typeof object.rotation === 'number' ? object.rotation : 0;
            const isAccentImageObject = object.type === 'accent-image';
            const isImageObject = object.type === 'image';
            const isTextBoxObject = object.type === 'text-box';
            const isTableObject = object.type === 'table';
            const isChartObject = object.type === 'chart';
            const isShapeObject = object.type === 'shape';
            const isFullBleedImage = isImageObject
              ? Boolean((object.props as Record<string, unknown>)?.fullBleed)
              : false;
            const rawImageProps = (object.props ?? {}) as Record<string, unknown>;
            const imageFitMode =
              isImageObject && typeof rawImageProps.fit === 'string' && rawImageProps.fit.toLowerCase() === 'contain'
                ? 'contain'
                : 'cover';
            const imageFlipHorizontal =
              isImageObject && (rawImageProps.flipX === true || rawImageProps.flipHorizontal === true);
            const imageFlipVertical =
              isImageObject && (rawImageProps.flipY === true || rawImageProps.flipVertical === true);
            const imageOpacity = isImageObject && typeof rawImageProps.opacity === 'number'
              ? Math.min(Math.max(rawImageProps.opacity, 0), 1)
              : 1;
            const imageCropInsets = isImageObject
              ? sanitizeImageCrop((rawImageProps as { crop?: unknown }).crop)
              : sanitizeImageCrop(null);
            const imageCropShape: CropShape =
              isImageObject && typeof rawImageProps.cropShape === 'string' && ['rectangle', 'circle', 'rounded-rectangle'].includes(rawImageProps.cropShape)
                ? (rawImageProps.cropShape as CropShape)
                : 'rectangle';
            const imageCropBorderRadius =
              isImageObject && typeof rawImageProps.cropBorderRadius === 'number'
                ? Math.min(Math.max(rawImageProps.cropBorderRadius, 0), 50)
                : 12;
            const isImageAnimated = isImageObject && rawImageProps.animate === true;
            const isCroppingImage = isImageObject && activeImageCropId === object.id;
            const isEditingTextBox =
              isTextBoxObject &&
              editingTextState?.id === object.id &&
              editingTextState.type === 'text-box';
            const objectLocked = isSlideObjectLocked(object);
            const shouldElevate =
              isSelected ||
              isEditingTextBox ||
              typeof interactionOrderIndex === 'number';
            const elevationOrder =
              typeof selectionOrderIndex === 'number'
                ? selectionOrderIndex
                : typeof interactionOrderIndex === 'number'
                  ? interactionOrderIndex
                  : 0;
            const zIndex = shouldElevate ? elevatedZIndexBase + elevationOrder : baseZIndex;
            const textBoxFormatting = isTextBoxObject
              ? extractTextBoxFormatting(object.props as Record<string, unknown> | undefined)
              : null;
            const tableState = isTableObject ? readTableState(object) : null;
            const editingTableCell =
              isTableObject &&
              editingTextState?.type === 'table-cell' &&
              editingTextState.id === object.id
                ? {
                    region: editingTextState.region,
                    row: editingTextState.row,
                    col: editingTextState.col,
                  }
                : null;
            const chartProps = isChartObject
              ? parseChartObjectProps(object.props as Record<string, unknown> | undefined)
              : null;
            const atomId =
              isAtomObject(object) && typeof object.props.atom.atomId === 'string'
                ? object.props.atom.atomId
                : null;
            const isFeatureOverviewAtom = atomId === 'feature-overview';
            const featureOverviewMetadata =
              isFeatureOverviewAtom && object.props.atom.metadata && typeof object.props.atom.metadata === 'object'
                ? (object.props.atom.metadata as Record<string, any>)
                : undefined;
            const featureOverviewTransparentBackground =
              isFeatureOverviewAtom && resolveFeatureOverviewTransparency(featureOverviewMetadata);
            const suppressCardChrome =
              isShapeObject ||
              isTextBoxObject ||
              isTableObject ||
              isChartObject ||
              isFullBleedImage ||
              (isFeatureOverviewAtom && featureOverviewTransparentBackground);
            const isChartMakerAtom = atomId === 'chart-maker';
            const isEvaluateModelsFeatureAtom = atomId === 'evaluate-models-feature';
            const shouldShowTitle = !isFeatureOverviewAtom && !isChartMakerAtom && !isEvaluateModelsFeatureAtom;

            const renderObject = () => {
              // Add smooth transition for image objects when animating crop resize
              // This ensures smooth resize animation when exiting crop mode (Enter pressed)
              const shouldAnimateResize = isImageObject && animatingCropResize.has(object.id);
              
              return (
                <div
                  className="absolute group"
                  style={{
                    left: object.x,
                    top: object.y,
                    width: object.width,
                    height: object.height,
                    zIndex,
                    // Smooth transition for resize when exiting crop mode (similar to Canva)
                    // Only apply transition when image has crop and is not being actively cropped
                    transition: shouldAnimateResize 
                      ? 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1), left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
                      : undefined,
                    transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                    transformOrigin: rotation !== 0 ? 'center center' : undefined,
                  }}
                  data-exhibition-object-id={object.id}
                  data-exhibition-object-type={object.type}
                  onPointerDown={canEdit ? event => handleObjectPointerDown(event, object.id) : undefined}
                  onDoubleClick={canEdit ? event => handleObjectDoubleClick(event, object.id) : undefined}
                >
              {isSelected && !(isTextBoxObject && isEditingTextBox) && (
                <div
                  className="pointer-events-none absolute inset-0 z-40 border-2 border-yellow-400 transition-all duration-200"
                  aria-hidden="true"
                />
              )}
              <div
                className={cn(
                  'relative flex h-full w-full flex-col overflow-hidden rounded-3xl border-2 transition-all',
                  suppressCardChrome
                    ? 'border-transparent bg-transparent shadow-none'
                    : 'bg-background/95 shadow-xl',
                  isAccentImageObject && 'bg-muted/30 shadow-none border-transparent',
                  isShapeObject && 'border-none bg-transparent shadow-none overflow-visible',
                  (isTextBoxObject || isTableObject || isChartObject) &&
                    'overflow-hidden border-transparent bg-transparent shadow-none',
                  isFullBleedImage && 'rounded-none border-0 bg-transparent shadow-none',
                  (() => {
                    const shouldShowCardChrome =
                      !suppressCardChrome &&
                      !isAccentImageObject &&
                      !isShapeObject &&
                      !(isTextBoxObject || isTableObject || isChartObject);

                    if (!shouldShowCardChrome || isSelected) {
                      return 'border-transparent';
                    }

                    return 'border-border/70 hover:border-primary/40';
                  })(),
                )}
              >
                {isAtomObject(object) && shouldShowTitle && (
                  <div className="flex items-center gap-2 border-b border-border/60 bg-muted/10 px-4 py-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${object.props.atom.color}`} />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">{object.props.atom.title}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {object.props.atom.category}
                      </span>
                    </div>
                  </div>
                )}
                <div
                  className={cn(
                    'relative flex-1 overflow-hidden',
                    isAccentImageObject || isShapeObject || isImageObject ? undefined : 'p-4',
                    (isTextBoxObject || isTableObject || isChartObject) && 'overflow-visible p-0',
                    isShapeObject && 'flex items-center justify-center overflow-visible p-0',
                  )}
                >
                  {isTextBoxObject ? (
                    <SlideTextBoxObject
                      id={object.id}
                      canEdit={canEdit}
                      props={object.props as Record<string, unknown> | undefined}
                      isEditing={Boolean(isEditingTextBox)}
                      isSelected={isSelected}
                      editingValue={
                        isEditingTextBox ? editingTextState.value : textBoxFormatting?.text ?? DEFAULT_TEXT_BOX_TEXT
                      }
                      onBeginEditing={() => beginEditingTextBox(object.id)}
                      onCommitEditing={commitEditingText}
                      onCancelEditing={cancelEditingText}
                      onEditingChange={handleEditingValueChange}
                      onUpdateFormatting={updates => {
                        onInteract();
                        const nextProps = {
                          ...(object.props || {}),
                          ...updates,
                        } as Record<string, unknown>;
                        onBulkUpdate({
                          [object.id]: {
                            props: nextProps,
                          },
                        });
                        // Auto-adjust height after formatting update (text, fontSize, fontFamily, etc.)
                        // adjustTextBoxHeight uses requestAnimationFrame internally to ensure measurement after layout
                        adjustTextBoxHeight(object.id);
                      }}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onInteract={onInteract}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onRequestPositionPanel={
                        onRequestPositionPanel ? () => onRequestPositionPanel(object.id) : undefined
                      }
                      onContextMenu={event => handleContextMenuRequest(event, object.id)}
                    />
                  ) : isTableObject && tableState ? (
                    <ExhibitionTable
                      id={object.id}
                      headers={tableState.headers}
                      data={tableState.data}
                      rows={tableState.rows}
                      cols={tableState.cols}
                      columnWidths={tableState.columnWidths}
                      rowHeights={tableState.rowHeights}
                      locked={tableState.locked}
                      showOutline={tableState.showOutline}
                      styleId={tableState.styleId}
                      canEdit={canEdit}
                      isSelected={isSelected}
                      selectedCell={isSelected ? undefined : null}
                      onUpdateCell={(row, col, value) => updateTableCellContent(object.id, row, col, value)}
                      onUpdateCellFormatting={(row, col, updates) =>
                        updateTableCellFormatting(object.id, row, col, updates)
                      }
                      onUpdateHeader={(col, value) => updateTableHeaderContent(object.id, col, value)}
                      onUpdateHeaderFormatting={(col, updates) =>
                        updateTableHeaderFormatting(object.id, col, updates)
                      }
                      onUpdateColumnWidth={(col, width) =>
                        updateTableColumnWidth(object.id, col, width)
                      }
                      onUpdateRowHeight={(row, height) =>
                        updateTableRowHeight(object.id, row, height)
                      }
                      onToggleLock={() => toggleTableLock(object.id)}
                      onToggleOutline={() => toggleTableOutline(object.id)}
                      onStyleChange={nextStyleId => setTableStyle(object.id, nextStyleId)}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onDeleteColumn={(startIndex, count) => removeColumnsFromTable(object.id, startIndex, count)}
                      onDelete2Columns={(startIndex, count) => removeColumnsFromTable(object.id, startIndex, count)}
                      onDeleteRow={(startIndex, count) => removeRowsFromTable(object.id, startIndex, count)}
                      onDelete2Rows={(startIndex, count) => removeRowsFromTable(object.id, startIndex, count)}
                      onAddColumn={(startIndex, count) => addColumnsToTable(object.id, startIndex, count)}
                      onAdd2Columns={(startIndex, count) => addColumnsToTable(object.id, startIndex, count)}
                      onAddRow={(startIndex, count) => addRowsToTable(object.id, startIndex, count)}
                      onAdd2Rows={(startIndex, count) => addRowsToTable(object.id, startIndex, count)}
                      onToolbarStateChange={node => handleTextToolbarStateChange(object.id, node)}
                      onInteract={onInteract}
                      onBringToFront={() => handleLayerAction('front', [object.id])}
                      onBringForward={() => handleLayerAction('forward', [object.id])}
                      onSendBackward={() => handleLayerAction('backward', [object.id])}
                      onSendToBack={() => handleLayerAction('back', [object.id])}
                      onBeginCellTextEdit={target => beginEditingTableCell(object.id, target)}
                      onEndCellTextEdit={target => endEditingTableCell(object.id, target)}
                      editingCell={editingTableCell}
                      className="h-full w-full"
                    />
                  ) : isShapeObject ? (
                    <SlideShapeObject
                      id={object.id}
                      canEdit={canEdit}
                      isSelected={isSelected}
                      props={object.props as Record<string, unknown> | undefined}
                      onUpdateProps={updates => updateShapeProps(object.id, updates)}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onRequestPositionPanel={
                        onRequestPositionPanel ? () => onRequestPositionPanel(object.id) : undefined
                      }
                      onBringToFront={() => onBringToFront([object.id])}
                      onBringForward={() => handleLayerAction('forward', [object.id])}
                      onSendBackward={() => handleLayerAction('backward', [object.id])}
                      onSendToBack={() => onSendToBack([object.id])}
                      onInteract={onInteract}
                    />
                  ) : isImageObject ? (
                    <SlideImageObject
                      id={object.id}
                      canEdit={canEdit}
                      isSelected={isSelected}
                      src={typeof object.props?.src === 'string' ? object.props.src : null}
                      name={
                        typeof object.props?.name === 'string' && object.props.name.trim().length > 0
                          ? object.props.name
                          : null
                      }
                      fullBleed={isFullBleedImage}
                      fitMode={imageFitMode}
                      isCropping={isCroppingImage}
                      cropShape={imageCropShape}
                      cropBorderRadius={imageCropBorderRadius}
                      flipHorizontal={imageFlipHorizontal}
                      flipVertical={imageFlipVertical}
                      isAnimated={isImageAnimated}
                      opacity={imageOpacity}
                      cropInsets={imageCropInsets}
                      onInteract={onInteract}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onToggleFit={handleToggleImageFit}
                      onToggleCrop={handleToggleImageCrop}
                      onCropShapeChange={handleSetImageCropShape}
                      onFlipHorizontal={handleFlipImageHorizontal}
                      onFlipVertical={handleFlipImageVertical}
                      onToggleAnimate={handleToggleImageAnimation}
                      onRequestPositionPanel={onRequestPositionPanel}
                      onOpacityChange={handleSetImageOpacity}
                      onCropChange={handleSetImageCrop}
                      onCropCommit={handleImageCropCommit}
                      onResetCrop={handleResetImageCrop}
                      onDelete={onRemoveObject}
                    />
                  ) : isChartObject && chartProps ? (
                    <SlideChartObject
                      id={object.id}
                      canEdit={canEdit}
                      isSelected={isSelected}
                      data={chartProps.chartData}
                      config={chartProps.chartConfig}
                      captureId={object.id}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onBringForward={() => handleLayerAction('forward', [object.id])}
                      onSendBackward={() => handleLayerAction('backward', [object.id])}
                      onBringToFront={() => handleLayerAction('front', [object.id])}
                      onSendToBack={() => handleLayerAction('back', [object.id])}
                      onRequestEdit={
                        canEdit
                          ? () => {
                              onInteract();
                              setChartEditorTarget({
                                objectId: object.id,
                                data: chartProps.chartData,
                                config: chartProps.chartConfig,
                              });
                            }
                          : undefined
                      }
                      onInteract={onInteract}
                    />
                  ) : (
                    <div
                      className={cn(
                        'h-full w-full overflow-hidden',
                        isAccentImageObject ? undefined : 'rounded-2xl bg-background/90 p-3',
                      )}
                    >
                      {renderObjectContent(object)}
                    </div>
                  )}
                </div>
                {canEdit && isAtomObject(object) && onRemoveAtom && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      'absolute top-3 right-3 z-30 h-9 w-9 text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
                      isSelected && 'opacity-100',
                    )}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onRemoveAtom(object.props.atom.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {canEdit && isShapeObject && onRemoveObject && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      'absolute top-3 right-3 z-30 h-9 w-9 text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
                      isSelected && 'opacity-100',
                    )}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onRemoveObject(object.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {canEdit &&
                isSelected &&
                !isEditingTextBox &&
                !objectLocked &&
                !(isImageObject && activeImageCropId === object.id) &&
                (isTextBoxObject ? textBoxHandleDefinitions : handleDefinitions).map(definition => (
                  <span
                    key={definition.handle}
                    className={cn(
                      'absolute z-40 h-3 w-3 rounded-full border border-background bg-black shadow',
                      definition.className,
                    )}
                    style={{ cursor: definition.cursor }}
                    onPointerDown={event => handleResizeStart(event, object.id, definition.handle)}
                  />
                ))}
            </div>
            );
          };

          if (isTableObject) {
            return React.cloneElement(renderObject(), { key: object.id });
          }

          const contextTargetIds = isSelected ? selectedIds : [object.id];
          const contextHasSelection = contextTargetIds.length > 0;
          const contextHasUnlocked = contextTargetIds.some(id => {
            const target = objectsMap.get(id);
            return target ? !isSlideObjectLocked(target) : false;
          });
          const contextTargets = contextTargetIds
            .map(id => objectsMap.get(id))
            .filter((target): target is SlideObject => Boolean(target));
          const contextSupportsImageFullBleed =
            contextTargets.length > 0 && contextTargets.every(target => target.type === 'image');
          const contextAllImagesFullBleed =
            contextSupportsImageFullBleed &&
            contextTargets.every(target => Boolean((target.props as Record<string, unknown>).fullBleed));
          const renderPostLockContent = contextSupportsImageFullBleed
            ? (closeMenu: () => void) => (
                <ContextMenuCheckboxItem
                  checked={contextAllImagesFullBleed}
                  disabled={!canEdit || !contextHasUnlocked}
                  onCheckedChange={value => {
                    const resolved = value === true;
                    closeMenu();
                    if (resolved === contextAllImagesFullBleed) {
                      return;
                    }
                    handleToggleImageFullBleed(contextTargetIds, resolved);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Maximize2 className="h-4 w-4" />
                    <span>Full bleed card</span>
                  </div>
                </ContextMenuCheckboxItem>
              )
            : undefined;

          const additionalMenuItems: Array<{ key: string; render: (closeMenu: () => void) => React.ReactNode }> = [];

          if (isImageObject) {
            additionalMenuItems.push({
              key: 'replace-image',
              render: closeMenu => (
                <ContextMenuItem
                  disabled={!canEdit || objectLocked}
                  onSelect={event => {
                    event.preventDefault();
                    closeMenu();
                    if (!canEdit || objectLocked) {
                      return;
                    }
                    handleReplaceImage(object.id);
                  }}
                  className="gap-3"
                >
                  <ImagePlus className="h-4 w-4" />
                  Replace image
                </ContextMenuItem>
              ),
            });

            additionalMenuItems.push({
              key: 'toggle-crop',
              render: closeMenu => (
                <ContextMenuItem
                  disabled={!canEdit || objectLocked}
                  onSelect={event => {
                    event.preventDefault();
                    closeMenu();
                    handleToggleImageCrop(object.id);
                  }}
                  className="gap-3"
                >
                  <Crop className="h-4 w-4" />
                  {isCroppingImage ? 'Exit crop mode' : 'Crop image'}
                </ContextMenuItem>
              ),
            });
          }

          if (isChartObject) {
            additionalMenuItems.push({
              key: 'edit-chart',
              render: closeMenu => (
                <ContextMenuItem
                  disabled={
                    !canEdit ||
                    !chartProps ||
                    !isEditableChartType(chartProps.chartConfig.type)
                  }
                  onSelect={event => {
                    event.preventDefault();
                    const isValidTarget =
                      canEdit &&
                      chartProps &&
                      isEditableChartType(chartProps.chartConfig.type);
                    const payload = isValidTarget
                      ? {
                          objectId: object.id,
                          data: chartProps.chartData,
                          config: chartProps.chartConfig,
                        }
                      : null;
                    closeMenu();
                    if (!payload) {
                      return;
                    }
                    setTimeout(() => {
                      setChartEditorTarget(payload);
                    }, 0);
                  }}
                  className="gap-3"
                >
                  <Edit3 className="h-4 w-4" />
                  Edit chart data
                </ContextMenuItem>
              ),
            });
          }

          return (
            <SlideObjectContextMenu
              key={object.id}
              canEdit={canEdit}
              canAlign={hasSelection && !selectionLocked}
              canLayer={contextHasUnlocked}
              canApplyColors={canApplyColorsGlobally}
              canAddAltText={selectedSupportsAltText}
              hasClipboard={hasClipboardItems}
              lockLabel={lockLabel}
              onContextMenu={event => handleContextMenuRequest(event, object.id)}
              onCopy={() => handleCopySelection(contextTargetIds)}
              onCopyStyle={handleCopyStyle}
              onCut={() => handleCutSelection(contextTargetIds)}
              onPaste={handlePasteClipboard}
              onDuplicate={() => handleDuplicateSelection(contextTargetIds)}
              onDelete={() => handleDeleteSelection(contextTargetIds)}
              onToggleLock={handleToggleLock}
              onBringToFront={() => handleLayerAction('front', contextTargetIds)}
              onBringForward={() => handleLayerAction('forward', contextTargetIds)}
              onSendBackward={() => handleLayerAction('backward', contextTargetIds)}
              onSendToBack={() => handleLayerAction('back', contextTargetIds)}
              onAlign={handleAlignSelection}
              onLink={handleLinkSelection}
              onComment={handleCommentSelection}
              onAltText={handleAltTextSelection}
              onApplyColorsToAll={handleApplyColorsToAll}
              onInfo={handleInfo}
              disableDelete={!contextHasUnlocked}
              disableLock={!hasSelection}
              disableCopy={!contextHasSelection}
              disableCopyStyle={!contextHasSelection}
              disableCut={!contextHasUnlocked}
              disableDuplicate={!contextHasSelection}
              disableLink={selectionLocked}
              disableComment={selectionLocked}
              disableApplyColors={!canApplyColorsGlobally}
              renderAdditionalContent={
                additionalMenuItems.length > 0
                  ? closeMenu =>
                      additionalMenuItems.map(item => (
                        <React.Fragment key={item.key}>{item.render(closeMenu)}</React.Fragment>
                      ))
                  : undefined
              }
              renderPostLockContent={renderPostLockContent}
            >
              {renderObject()}
            </SlideObjectContextMenu>
          );
        })}
        </div>

        {isDragOver && canEdit && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary/60 bg-primary/10 text-xs font-semibold uppercase tracking-wide text-primary',
              canvasCornerClass,
            )}
          >
            Drop to add component
          </div>
        )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-64" style={{ zIndex: 10000 }}>
          <ContextMenuItem
            disabled={!canEdit || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleCopySelection();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy
            <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleCopyStyle();
            }}
          >
            <Clipboard className="mr-2 h-4 w-4" />
            Copy style
            <ContextMenuShortcut>Ctrl+Alt+C</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !canCutSelection}
            onSelect={event => {
              event.preventDefault();
              handleCutSelection();
            }}
          >
            <Scissors className="mr-2 h-4 w-4" />
            Cut
            <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !hasClipboardItems}
            onSelect={event => {
              event.preventDefault();
              handlePasteClipboard();
            }}
          >
            <ClipboardPaste className="mr-2 h-4 w-4" />
            Paste
            <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleDuplicateSelection();
            }}
          >
            <CopyPlus className="mr-2 h-4 w-4" />
            Duplicate
            <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit || selectionLocked || !hasSelection}
            onSelect={event => {
              event.preventDefault();
              handleDeleteSelection();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={event => {
              event.preventDefault();
              onToggleBackgroundLock();
            }}
          >
            {backgroundLocked ? (
              <Unlock className="mr-2 h-4 w-4" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {backgroundLockLabel}
            <ContextMenuShortcut>Alt+Shift+L</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!canEdit}
            onSelect={event => {
              event.preventDefault();
              onRequestFormatPanel?.();
              toast({
                title: 'Transition settings',
                description: 'Use the formatting panel to configure slide transitions.',
              });
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Add transition
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!canEdit || !hasSelection || selectionLocked}
            onSelect={event => {
              event.preventDefault();
              handleCommentSelection();
            }}
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            Comment
            <ContextMenuShortcut>Ctrl+Alt+N</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
        <ChartDataEditor
          open={Boolean(chartEditorTarget)}
          onClose={() => setChartEditorTarget(null)}
          onSave={handleChartEditorSave}
          initialData={chartEditorTarget?.data}
          initialConfig={chartEditorTarget?.config}
        />
      </ContextMenu>
    );
  },
);

CanvasStage.displayName = 'CanvasStage';

export type { SlideCanvasProps };
export default SlideCanvas;
