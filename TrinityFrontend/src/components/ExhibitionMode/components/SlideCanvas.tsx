import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, Calendar, Sparkles, StickyNote, Settings, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  useExhibitionStore,
  CardLayout,
  CardColor,
  LayoutCard,
  DroppedAtom,
  PresentationSettings,
  DEFAULT_PRESENTATION_SETTINGS,
  type SlideObject,
  DEFAULT_CANVAS_OBJECT_WIDTH,
  DEFAULT_CANVAS_OBJECT_HEIGHT,
  CANVAS_SNAP_GRID,
  buildSlideTitleObjectId,
  resolveCardTitle,
} from '../store/exhibitionStore';
import ExhibitedAtomRenderer from './ExhibitedAtomRenderer';
import { SlideTextBoxObject } from './operationsPalette/textBox/TextBox';
import { DEFAULT_TEXT_BOX_TEXT, extractTextBoxFormatting } from './operationsPalette/textBox/constants';
import type { TextBoxFormatting } from './operationsPalette/textBox/types';
import { TextBoxPositionPanel } from './operationsPalette/textBox/TextBoxPositionPanel';
import { CardFormattingPanel } from './operationsPalette/CardFormattingPanel';
import { ExhibitionTable } from './operationsPalette/tables/ExhibitionTable';
import { SlideShapeObject } from './operationsPalette/shapes';
import type { ShapeObjectProps } from './operationsPalette/shapes/constants';
import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  cloneTableHeaders,
  cloneTableMatrix,
  createDefaultHeaderCell,
  createEmptyCell,
  createEmptyTableRow,
  normaliseTableData,
  normaliseTableHeaders,
  ensureTableStyleId,
  type TableCellData,
  type TableCellFormatting,
} from './operationsPalette/tables/constants';

interface CanvasDropPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

const snapToGrid = (value: number) => Math.round(value / CANVAS_SNAP_GRID) * CANVAS_SNAP_GRID;

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

type ActiveInteraction =
  | {
      kind: 'move';
      objectIds: string[];
      startClientX: number;
      startClientY: number;
      initialPositions: Map<string, { x: number; y: number }>;
      scale: number;
    }
  | {
      kind: 'resize';
      objectId: string;
      handle: ResizeHandle;
      startClientX: number;
      startClientY: number;
      initial: { x: number; y: number; width: number; height: number };
      scale: number;
    };

type CanvasStageProps = {
  canEdit: boolean;
  objects: SlideObject[];
  isDragOver: boolean;
  showEmptyState: boolean;
  layout: CardLayout;
  cardColor: CardColor;
  accentImage: string | null;
  accentImageName: string | null;
  titleObjectId: string;
  onCanvasDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onCanvasDragLeave: () => void;
  onCanvasDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onInteract: () => void;
  onRemoveAtom?: (atomId: string) => void;
  onBringToFront: (objectIds: string[]) => void;
  onSendToBack: (objectIds: string[]) => void;
  onBulkUpdate: (updates: Record<string, Partial<SlideObject>>) => void;
  onGroupObjects: (objectIds: string[], groupId: string | null) => void;
  onTitleCommit?: (nextTitle: string) => void;
  onRemoveObject?: (objectId: string) => void;
  onTextToolbarChange?: (node: ReactNode | null) => void;
  onRequestPositionPanel?: (objectId: string) => void;
  canvasScale: number;
};

interface EditingTextState {
  id: string;
  type: 'text-box';
  value: string;
  original: string;
}

const isAtomObject = (
  object: SlideObject,
): object is SlideObject & { props: { atom: DroppedAtom } } => {
  if (object.type !== 'atom') {
    return false;
  }
  const payload = object.props as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const candidate = payload.atom as DroppedAtom | undefined;
  return Boolean(candidate && typeof candidate.id === 'string');
};

const UNTITLED_SLIDE_TEXT = 'Untitled Slide';

const FULLSCREEN_VIEWPORT_PADDING = 64;

type TableState = {
  data: TableCellData[][];
  rows: number;
  cols: number;
  locked: boolean;
  showOutline: boolean;
  headers: TableCellData[];
  styleId: string;
};

const coercePositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const integer = Math.floor(numeric);
  return integer > 0 ? integer : fallback;
};

const extractTableHeaders = (value: unknown, fallbackCount: number): TableCellData[] => {
  return normaliseTableHeaders(value, fallbackCount);
};

const readTableState = (object: SlideObject): TableState => {
  const props = (object.props ?? {}) as Record<string, unknown> | undefined;
  const fallbackRows = coercePositiveInteger(props?.rows, DEFAULT_TABLE_ROWS);
  const fallbackCols = coercePositiveInteger(props?.cols, DEFAULT_TABLE_COLS);
  const data = normaliseTableData(props?.data, fallbackRows, fallbackCols);
  const colCount = data[0]?.length ?? 0;
  const headers = extractTableHeaders(props?.headers, colCount);
  const styleId = ensureTableStyleId(props?.styleId);

  return {
    data,
    rows: data.length,
    cols: colCount,
    locked: Boolean(props?.locked),
    showOutline: props?.showOutline !== false,
    headers,
    styleId,
  };
};

const tableStatesEqual = (a: TableState, b: TableState) => {
  return (
    a.data === b.data &&
    a.rows === b.rows &&
    a.cols === b.cols &&
    a.locked === b.locked &&
    a.showOutline === b.showOutline &&
    a.headers === b.headers &&
    a.styleId === b.styleId
  );
};

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
  mode?: 'editor' | 'presentation';
  presentationVariant?: 'default' | 'cover';
  isFullscreen?: boolean;
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
  mode = 'editor',
  presentationVariant = 'default',
  isFullscreen = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [settings, setSettings] = useState<PresentationSettings>(() => ({
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...card.presentationSettings,
  }));
  const [activeTextToolbar, setActiveTextToolbar] = useState<ReactNode | null>(null);
  const [positionPanelTarget, setPositionPanelTarget] = useState<{ objectId: string } | null>(null);
  const accentImageInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [baseCanvasSize, setBaseCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [fullscreenMetrics, setFullscreenMetrics] = useState<{
    width: number;
    height: number;
    scale: number;
  } | null>(null);
  const isFullscreenEditor = isFullscreen && mode === 'editor' && viewMode === 'horizontal';
  const canvasScale = useMemo(
    () => (isFullscreenEditor && fullscreenMetrics ? fullscreenMetrics.scale : 1),
    [fullscreenMetrics, isFullscreenEditor],
  );
  const fullscreenWidthConstraint = `min(100vw - ${FULLSCREEN_VIEWPORT_PADDING * 2}px, (100vh - ${FULLSCREEN_VIEWPORT_PADDING * 2}px) * 16 / 9)`;
  const fullscreenHeightConstraint = `min(100vh - ${FULLSCREEN_VIEWPORT_PADDING * 2}px, (100vw - ${FULLSCREEN_VIEWPORT_PADDING * 2}px) * 9 / 16)`;

  const slideObjects = useExhibitionStore(
    useCallback(state => state.slideObjectsByCardId[card.id] ?? [], [card.id]),
  );
  const bulkUpdateSlideObjects = useExhibitionStore(state => state.bulkUpdateSlideObjects);
  const bringSlideObjectsToFront = useExhibitionStore(state => state.bringSlideObjectsToFront);
  const bringSlideObjectsForward = useExhibitionStore(state => state.bringSlideObjectsForward);
  const sendSlideObjectsToBack = useExhibitionStore(state => state.sendSlideObjectsToBack);
  const sendSlideObjectsBackward = useExhibitionStore(state => state.sendSlideObjectsBackward);
  const groupSlideObjects = useExhibitionStore(state => state.groupSlideObjects);
  const removeSlideObject = useExhibitionStore(state => state.removeSlideObject);

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

        onPresentationChange?.(merged, card.id);
        return merged;
      });
    },
    [canEdit, card.id, layoutDefaultColors, onPresentationChange],
  );

  const resetSettings = useCallback(() => {
    if (!canEdit) {
      return;
    }
    const defaults = { ...DEFAULT_PRESENTATION_SETTINGS };
    setSettings(defaults);
    onPresentationChange?.(defaults, card.id);
  }, [canEdit, card.id, onPresentationChange]);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateBaseSize = () => {
      const node = canvasRef.current;
      if (!node) {
        return;
      }

      const width = node.clientWidth;
      const height = node.clientHeight;

      if (width === 0 || height === 0) {
        return;
      }

      setBaseCanvasSize(prev => {
        if (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
          return prev;
        }
        return { width, height };
      });
    };

    updateBaseSize();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!isFullscreenEditor) {
        updateBaseSize();
      }
    });

    const node = canvasRef.current;
    if (node) {
      observer.observe(node);
    }

    return () => {
      observer.disconnect();
    };
  }, [isFullscreenEditor, card.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isFullscreenEditor) {
      setFullscreenMetrics(null);
      return;
    }

    const base =
      baseCanvasSize ??
      (canvasRef.current
        ? {
            width: canvasRef.current.clientWidth,
            height: canvasRef.current.clientHeight,
          }
        : null);

    if (!base || base.width === 0 || base.height === 0) {
      return;
    }

    const computeMetrics = () => {
      const viewportWidth = Math.max(window.innerWidth - FULLSCREEN_VIEWPORT_PADDING * 2, 320);
      const viewportHeight = Math.max(window.innerHeight - FULLSCREEN_VIEWPORT_PADDING * 2, 320);
      const scale = Math.min(viewportWidth / base.width, viewportHeight / base.height);
      const width = base.width * scale;
      const height = base.height * scale;

      setFullscreenMetrics(prev => {
        if (
          prev &&
          Math.abs(prev.width - width) < 0.5 &&
          Math.abs(prev.height - height) < 0.5 &&
          Math.abs(prev.scale - scale) < 0.001
        ) {
          return prev;
        }
        return { width, height, scale };
      });
    };

    computeMetrics();

    window.addEventListener('resize', computeMetrics);
    return () => {
      window.removeEventListener('resize', computeMetrics);
    };
  }, [isFullscreenEditor, baseCanvasSize]);

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

  const handleBringForward = useCallback(
    (objectId: string) => {
      bringSlideObjectsForward(card.id, [objectId]);
      handleCanvasInteraction();
    },
    [bringSlideObjectsForward, card.id, handleCanvasInteraction],
  );

  const handleSendBackward = useCallback(
    (objectId: string) => {
      sendSlideObjectsBackward(card.id, [objectId]);
      handleCanvasInteraction();
    },
    [card.id, handleCanvasInteraction, sendSlideObjectsBackward],
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

      nextWidth = Math.max(MIN_OBJECT_WIDTH, nextWidth);
      nextHeight = Math.max(MIN_OBJECT_HEIGHT, nextHeight);

      if (canvas) {
        nextWidth = Math.min(nextWidth, canvas.clientWidth);
        nextHeight = Math.min(nextHeight, canvas.clientHeight);
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

  const handleAtomRemove = (atomId: string) => {
    if (!canEdit) {
      return;
    }
    onRemoveAtom?.(atomId);
  };

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
      const effectiveScale = canvasScale === 0 ? 1 : canvasScale;
      const relativeX = (e.clientX - rect.left) / effectiveScale;
      const relativeY = (e.clientY - rect.top) / effectiveScale;
      dropX = relativeX - width / 2;
      dropY = relativeY - height / 2;
      const maxX = Math.max(0, canvas.clientWidth - width);
      const maxY = Math.max(0, canvas.clientHeight - height);
      dropX = Math.min(Math.max(0, dropX), maxX);
      dropY = Math.min(Math.max(0, dropY), maxY);
      dropX = Math.min(Math.max(0, snapToGrid(dropX)), maxX);
      dropY = Math.min(Math.max(0, snapToGrid(dropY)), maxY);
    } else {
      dropX = snapToGrid(dropX);
      dropY = snapToGrid(dropY);
    }

    onDrop(draggedAtom.atom, draggedAtom.cardId, card.id, draggedAtom.origin, {
      x: dropX,
      y: dropY,
      width,
      height,
    });
  };

  const handleAccentImageChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!canEdit) {
        return;
      }

      const file = event.target.files?.[0];
      event.target.value = '';

      if (!file) {
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string' || reader.result.length === 0) {
          return;
        }

        updateSettings({ accentImage: reader.result, accentImageName: file.name });
      };

      reader.readAsDataURL(file);
    },
    [canEdit, updateSettings],
  );

  const handleCloseFormatPanel = useCallback(() => {
    setShowFormatPanel(false);
  }, []);

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
        onAccentImageChange={handleAccentImageChange}
        accentImageInputRef={accentImageInputRef}
        onClose={handleCloseFormatPanel}
      />
    );
  }, [
    accentImageInputRef,
    canEdit,
    handleAccentImageChange,
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

  const containerClasses =
    viewMode === 'horizontal'
      ? cn(
          'flex-1 h-full bg-muted/20 overflow-auto',
          isFullscreenEditor && 'flex items-center justify-center bg-background'
        )
      : cn(
          'w-full bg-muted/20 overflow-hidden border rounded-3xl transition-all duration-300 shadow-sm',
          isActive
            ? 'border-primary shadow-elegant ring-1 ring-primary/30'
            : 'border-border hover:border-primary/40'
        );

  if (mode === 'presentation') {
    const noop = () => {};

    const presentationWrapperClasses = cn(
      'mx-auto transition-all duration-300',
      presentationVariant === 'cover' ? 'p-0' : 'p-8',
      cardWidthClass,
    );

    const stageClasses = cn(
      'relative h-[520px] w-full overflow-hidden bg-card shadow-2xl transition-all duration-300',
      settings.fullBleed ? 'rounded-none' : 'rounded-2xl border-2 border-border',
    );

    return (
      <div className={presentationWrapperClasses} data-exhibition-slide-mode="presentation">
        <div className={stageClasses}>
          <CanvasStage
            ref={canvasRef}
            canEdit={false}
            isDragOver={false}
            showEmptyState={false}
            objects={slideObjects}
            layout={settings.cardLayout}
            cardColor={settings.cardColor}
            accentImage={settings.accentImage ?? null}
            accentImageName={settings.accentImageName ?? null}
            titleObjectId={titleObjectId}
            onCanvasDragLeave={noop}
            onCanvasDragOver={noop}
            onCanvasDrop={noop}
            onInteract={handleCanvasInteraction}
            onRemoveAtom={noop}
            onBringToFront={noop}
            onSendToBack={noop}
            onBulkUpdate={noop}
            onGroupObjects={noop}
            onTitleCommit={noop}
            onRemoveObject={noop}
            onTextToolbarChange={noop}
            onRequestPositionPanel={noop}
            canvasScale={canvasScale}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <div
        className={
          isFullscreenEditor
            ? 'flex h-full w-full items-center justify-center p-6 sm:p-10 lg:p-16 transition-all duration-300'
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

        <div className={cn('space-y-4', isFullscreenEditor && 'w-full')}>
          {canEdit && activeTextToolbar && (
            <div className="relative mb-4 flex w-full justify-center">
              <div className="z-30 drop-shadow-xl">{activeTextToolbar}</div>
            </div>
          )}

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

          <div className="flex flex-col gap-4">
            <div
              className={cn(
                'flex flex-col gap-6 lg:flex-row lg:items-start',
                isFullscreenEditor && 'w-full'
              )}
            >
              <div
                className={cn(
                  'relative w-full overflow-hidden bg-card shadow-2xl transition-all duration-300',
                  settings.fullBleed ? 'rounded-none' : 'rounded-2xl border-2 border-border',
                  isDragOver && canEdit && draggedAtom ? 'scale-[0.98] ring-4 ring-primary/20' : undefined,
                  !canEdit && 'opacity-90',
                  isFullscreenEditor ? 'h-auto max-h-full' : 'h-[520px]'
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={
                  isFullscreenEditor
                    ? fullscreenMetrics
                      ? {
                          width: `${fullscreenMetrics.width}px`,
                          height: `${fullscreenMetrics.height}px`,
                          maxWidth: fullscreenWidthConstraint,
                          maxHeight: fullscreenHeightConstraint,
                        }
                      : {
                          width: fullscreenWidthConstraint,
                          height: fullscreenHeightConstraint,
                          aspectRatio: '16 / 9',
                        }
                    : undefined
                }
              >
                {isFullscreenEditor ? (
                  <div
                    className="h-full w-full origin-top-left"
                    style={
                      baseCanvasSize
                        ? {
                            width: baseCanvasSize.width,
                            height: baseCanvasSize.height,
                            transform: `scale(${canvasScale})`,
                            transformOrigin: 'top left',
                          }
                        : undefined
                    }
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
                      onCanvasDragLeave={handleDragLeave}
                      onCanvasDragOver={handleDragOver}
                      onCanvasDrop={handleDrop}
                      onInteract={handleCanvasInteraction}
                      onRemoveAtom={handleAtomRemove}
                      onBringToFront={handleBringToFront}
                      onSendToBack={handleSendToBack}
                      onBulkUpdate={handleBulkUpdate}
                      onGroupObjects={handleGroupObjects}
                    onTitleCommit={handleTitleCommit}
                    onRemoveObject={objectId => removeSlideObject(card.id, objectId)}
                    onTextToolbarChange={setActiveTextToolbar}
                    onRequestPositionPanel={handleRequestPositionPanel}
                    canvasScale={canvasScale}
                  />
                </div>
              ) : (
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
                    onCanvasDragLeave={handleDragLeave}
                    onCanvasDragOver={handleDragOver}
                    onCanvasDrop={handleDrop}
                    onInteract={handleCanvasInteraction}
                    onRemoveAtom={handleAtomRemove}
                    onBringToFront={handleBringToFront}
                    onSendToBack={handleSendToBack}
                    onBulkUpdate={handleBulkUpdate}
                    onGroupObjects={handleGroupObjects}
                    onTitleCommit={handleTitleCommit}
                    onRemoveObject={objectId => removeSlideObject(card.id, objectId)}
                    onTextToolbarChange={setActiveTextToolbar}
                    onRequestPositionPanel={handleRequestPositionPanel}
                    canvasScale={canvasScale}
                  />
                )}

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
                    className="h-8 w-8 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg hover:from-purple-600 hover:to-pink-600"
                    type="button"
                    disabled={!canEdit}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </div>
              </div>

            </div>
          </div>

          {viewMode === 'horizontal' && (
            <div className="mt-6 text-center">
              <span className="inline-block px-4 py-2 bg-muted rounded-full text-sm font-medium text-muted-foreground">
                Slide {slideNumber} of {totalSlides}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MIN_OBJECT_WIDTH = 220;
const MIN_OBJECT_HEIGHT = 120;

const layoutOverlayBackgrounds: Record<CardColor, string> = {
  default: 'from-purple-500 via-pink-500 to-orange-400',
  blue: 'from-blue-500 via-cyan-500 to-teal-400',
  purple: 'from-violet-500 via-purple-500 to-fuchsia-400',
  green: 'from-emerald-500 via-green-500 to-lime-400',
  orange: 'from-orange-500 via-amber-500 to-yellow-400',
};

const LayoutOverlay: React.FC<{
  layout: CardLayout;
  color: CardColor;
  accentImage?: string | null;
  accentImageName?: string | null;
}> = ({ layout, color, accentImage, accentImageName }) => {
  if (layout === 'none') {
    return null;
  }

  const gradient = layoutOverlayBackgrounds[color] ?? layoutOverlayBackgrounds.default;
  const sharedClass = cn(
    'pointer-events-none absolute overflow-hidden transition-all duration-300 ease-out',
    'shadow-[0_32px_72px_-32px_rgba(76,29,149,0.45)]',
  );

  const content = accentImage ? (
    <img
      src={accentImage}
      alt={accentImageName ?? 'Accent image'}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className={cn('h-full w-full bg-gradient-to-br', gradient)} />
  );

  switch (layout) {
    case 'top':
      return (
        <div className={cn(sharedClass, 'left-0 right-0 top-0 h-[210px] rounded-t-[28px]')}>
          {content}
        </div>
      );
    case 'bottom':
      return (
        <div className={cn(sharedClass, 'bottom-0 left-0 right-0 h-[220px] rounded-b-[28px]')}>
          {content}
        </div>
      );
    case 'left':
      return (
        <div className={cn(sharedClass, 'bottom-0 left-0 top-0 w-[34%] min-w-[280px] rounded-l-[28px]')}>
          {content}
        </div>
      );
    case 'right':
      return (
        <div className={cn(sharedClass, 'bottom-0 right-0 top-0 w-[34%] min-w-[280px] rounded-r-[28px]')}>
          {content}
        </div>
      );
    case 'full':
    default:
      return (
        <div className={cn(sharedClass, 'inset-0 rounded-[28px]')}>
          {content}
        </div>
      );
  }
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
      onCanvasDragOver,
      onCanvasDragLeave,
      onCanvasDrop,
      onInteract,
      onRemoveAtom,
      onBringToFront,
      onSendToBack,
      onBulkUpdate,
      onGroupObjects,
      onTitleCommit,
      onRemoveObject,
      onTextToolbarChange,
      onRequestPositionPanel,
      canvasScale = 1,
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
    const [activeInteraction, setActiveInteraction] = useState<ActiveInteraction | null>(null);
    const [editingTextState, setEditingTextState] = useState<EditingTextState | null>(null);
    const [activeTextToolbar, setActiveTextToolbar] = useState<{ id: string; node: ReactNode } | null>(null);

    const focusCanvas = useCallback(() => {
      const node = internalRef.current;
      if (node && typeof node.focus === 'function') {
        node.focus();
      }
    }, []);

    const objectsMap = useMemo(() => new Map(objects.map(object => [object.id, object])), [objects]);

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

    const handleTextToolbarStateChange = useCallback(
      (objectId: string, node: ReactNode | null) => {
        setActiveTextToolbar(prev => {
          if (node) {
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
      (objectId: string, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          const columnCount = Math.max(state.cols, 1);
          const additions = Array.from({ length: count }, () => createEmptyTableRow(columnCount));
          const nextData = [...state.data, ...additions];

          return {
            ...state,
            data: nextData,
            rows: nextData.length,
          };
        });
      },
      [mutateTableState],
    );

    const addColumnsToTable = useCallback(
      (objectId: string, count: number) => {
        if (count <= 0) {
          return;
        }

        mutateTableState(objectId, state => {
          const nextData = state.data.map(row => [
            ...row,
            ...Array.from({ length: count }, () => createEmptyCell()),
          ]);
          const existingHeaders = cloneTableHeaders(state.headers);
          const headerAdditions = Array.from({ length: count }, (_, additionIndex) =>
            createDefaultHeaderCell(existingHeaders.length + additionIndex),
          );
          const nextHeaders = [...existingHeaders, ...headerAdditions];
          const nextCols = nextHeaders.length;

          return {
            ...state,
            data: nextData,
            cols: nextCols,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
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

          return {
            ...state,
            data: nextData,
            rows: nextData.length,
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
          const nextCols = nextHeaders.length;

          return {
            ...state,
            data: nextData,
            cols: nextCols,
            headers: nextHeaders,
          };
        });
      },
      [mutateTableState],
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
    }, [objectsMap, onBulkUpdate, onInteract, onTitleCommit, titleObjectId]);

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
      [canEdit, focusCanvas, objectsMap, onInteract],
    );

    const handleEditingValueChange = useCallback(
      (value: string) => {
        setEditingTextState(prev => {
          if (!prev || prev.value === value) {
            return prev;
          }
          onInteract();
          return { ...prev, value };
        });
      },
      [onInteract],
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
        const snappedX = Math.min(Math.max(0, snapToGrid(clampedX)), maxX);
        const snappedY = Math.min(Math.max(0, snapToGrid(clampedY)), maxY);
        return { x: snappedX, y: snappedY };
      },
      [clampPosition],
    );

    const handleBackgroundPointerDown = useCallback(() => {
        if (!canEdit) {
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

        const isMulti = event.shiftKey || event.metaKey || event.ctrlKey;
        const resolveSelection = () => {
          const baseSelection = isMulti
            ? selectedIds.includes(objectId)
              ? selectedIds
              : [...selectedIds, objectId]
            : [objectId];
          return Array.from(new Set(baseSelection));
        };

        if (editableTableCell) {
          event.stopPropagation();
          if (editingTextState) {
            commitEditingText();
          }
          onInteract();
          const uniqueSelection = resolveSelection();
          setSelectedIds(uniqueSelection);
          onBringToFront(uniqueSelection);
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (editingTextState) {
          commitEditingText();
        }
        onInteract();
        focusCanvas();

        const uniqueSelection = resolveSelection();
        setSelectedIds(uniqueSelection);

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

        onBringToFront(uniqueSelection);
        setActiveInteraction({
          kind: 'move',
          objectIds: Array.from(initialPositions.keys()),
          startClientX: event.clientX,
          startClientY: event.clientY,
          initialPositions,
          scale: canvasScale,
        });
      },
      [
        canEdit,
        commitEditingText,
        editingTextState,
        focusCanvas,
        onInteract,
        objectsMap,
        onBringToFront,
        selectedIds,
        canvasScale,
      ],
    );

    const handleResizeStart = useCallback(
      (event: React.PointerEvent<HTMLSpanElement>, objectId: string, handle: ResizeHandle) => {
        if (!canEdit) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onInteract();
        focusCanvas();
        const target = objectsMap.get(objectId);
        if (!target) {
          return;
        }
        setSelectedIds([objectId]);
        onBringToFront([objectId]);
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
          },
          scale: canvasScale,
        });
      },
      [canEdit, focusCanvas, onInteract, objectsMap, onBringToFront, canvasScale],
    );

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }

        if (event.key === 'Escape') {
          setSelectedIds([]);
          if (editingTextState) {
            cancelEditingText();
          }
          return;
        }

        if (selectedIds.length === 0) {
          return;
        }

        const step = event.shiftKey ? CANVAS_SNAP_GRID * 2 : CANVAS_SNAP_GRID;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
          const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
          const updates: Record<string, Partial<SlideObject>> = {};
          selectedIds.forEach(id => {
            const object = objectsMap.get(id);
            if (!object) {
              return;
            }
            const { x, y } = clampAndSnapPosition(object.x + deltaX, object.y + deltaY, object.width, object.height);
            updates[id] = { x, y };
          });
          if (Object.keys(updates).length > 0) {
            onInteract();
            onBulkUpdate(updates);
          }
          return;
        }

        if (event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault();
          onInteract();
          selectedIds.forEach(id => {
            const object = objectsMap.get(id);
            if (!object) {
              return;
            }
            if (isAtomObject(object) && onRemoveAtom) {
              onRemoveAtom(object.props.atom.id);
            } else if (
              (object.type === 'text-box' || object.type === 'table' || object.type === 'shape') &&
              onRemoveObject
            ) {
              onRemoveObject(id);
            }
          });
          return;
        }

        if ((event.key === 'g' || event.key === 'G') && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (event.shiftKey) {
            onInteract();
            onGroupObjects(selectedIds, null);
          } else {
            const groupId = `group-${Date.now()}`;
            onInteract();
            onGroupObjects(selectedIds, groupId);
          }
          return;
        }

        if (event.key === ']' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onInteract();
          onBringToFront(selectedIds);
          return;
        }

        if (event.key === '[' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onInteract();
          onSendToBack(selectedIds);
          return;
        }
      },
      [
        canEdit,
        cancelEditingText,
        clampAndSnapPosition,
        editingTextState,
        onBulkUpdate,
        onRemoveAtom,
        onRemoveObject,
        onGroupObjects,
        onBringToFront,
        onSendToBack,
        onInteract,
        objectsMap,
        selectedIds,
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
          const scale = activeInteraction.scale === 0 ? 1 : activeInteraction.scale;
          const deltaX = (event.clientX - activeInteraction.startClientX) / scale;
          const deltaY = (event.clientY - activeInteraction.startClientY) / scale;
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

          const scale = activeInteraction.scale === 0 ? 1 : activeInteraction.scale;
          const deltaX = (event.clientX - activeInteraction.startClientX) / scale;
          const deltaY = (event.clientY - activeInteraction.startClientY) / scale;

          let nextX = initial.x;
          let nextY = initial.y;
          let nextWidth = initial.width;
          let nextHeight = initial.height;

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

          if (nextWidth < MIN_OBJECT_WIDTH) {
            if (handle === 'nw' || handle === 'sw') {
              nextX -= MIN_OBJECT_WIDTH - nextWidth;
            }
            nextWidth = MIN_OBJECT_WIDTH;
          }

          if (nextHeight < MIN_OBJECT_HEIGHT) {
            if (handle === 'nw' || handle === 'ne') {
              nextY -= MIN_OBJECT_HEIGHT - nextHeight;
            }
            nextHeight = MIN_OBJECT_HEIGHT;
          }

          const { x, y } = clampAndSnapPosition(nextX, nextY, nextWidth, nextHeight);
          const snappedWidth = Math.max(MIN_OBJECT_WIDTH, snapToGrid(nextWidth));
          const snappedHeight = Math.max(MIN_OBJECT_HEIGHT, snapToGrid(nextHeight));
          const widthLimit = canvas ? Math.max(MIN_OBJECT_WIDTH, Math.min(snappedWidth, canvas.clientWidth)) : snappedWidth;
          const heightLimit = canvas ? Math.max(MIN_OBJECT_HEIGHT, Math.min(snappedHeight, canvas.clientHeight)) : snappedHeight;

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
        setActiveInteraction(null);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [activeInteraction, canEdit, clampAndSnapPosition, onBulkUpdate, objectsMap]);

    const handleDefinitions: Array<{ handle: ResizeHandle; className: string; cursor: string }> = useMemo(
      () => [
        { handle: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2', cursor: 'nwse-resize' },
        { handle: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2', cursor: 'nesw-resize' },
        { handle: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2', cursor: 'nwse-resize' },
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

    return (
      <div
        ref={setRef}
        className={cn(
          'relative h-full w-full overflow-hidden rounded-3xl border-2 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
          canEdit ? 'bg-background/95' : 'bg-background/80',
          showEmptyState ? 'border-dashed border-border/70' : 'border-border/60',
          isDragOver ? 'border-primary/60 ring-2 ring-primary/20 shadow-xl scale-[0.99]' : undefined,
        )}
        tabIndex={canEdit ? 0 : -1}
        onPointerDown={handleBackgroundPointerDown}
        onKeyDown={handleKeyDown}
        onDragOver={onCanvasDragOver}
        onDragLeave={onCanvasDragLeave}
        onDrop={onCanvasDrop}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <LayoutOverlay
            layout={layout}
            color={cardColor}
            accentImage={accentImage}
            accentImageName={accentImageName}
          />
        </div>

        {showEmptyState && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl border-2 border-dashed border-border/60 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            Add components from the catalogue to build your presentation slide.
          </div>
        )}

        <div className="relative z-20 h-full w-full">
          {objects.map(object => {
            const isSelected = selectedIds.includes(object.id);
            const zIndex = typeof object.zIndex === 'number' ? object.zIndex : 1;
            const rotation = typeof object.rotation === 'number' ? object.rotation : 0;
            const isAccentImageObject = object.type === 'accent-image';
            const isTextBoxObject = object.type === 'text-box';
            const isTableObject = object.type === 'table';
            const isShapeObject = object.type === 'shape';
            const isEditingTextBox =
              isTextBoxObject &&
              editingTextState?.id === object.id &&
              editingTextState.type === 'text-box';
            const textBoxFormatting = isTextBoxObject
              ? extractTextBoxFormatting(object.props as Record<string, unknown> | undefined)
              : null;
            const tableState = isTableObject ? readTableState(object) : null;
            const featureOverviewAtomId =
              isAtomObject(object) && typeof object.props.atom.atomId === 'string'
                ? object.props.atom.atomId
                : null;
            const isFeatureOverviewAtom = featureOverviewAtomId === 'feature-overview';

          return (
            <div
              key={object.id}
              className="absolute group"
              style={{
                left: object.x,
                top: object.y,
                width: object.width,
                height: object.height,
                zIndex: isSelected ? zIndex + 100 : zIndex,
              }}
              onPointerDown={canEdit ? event => handleObjectPointerDown(event, object.id) : undefined}
              onDoubleClick={canEdit ? event => handleObjectDoubleClick(event, object.id) : undefined}
            >
              <div
                className={cn(
                  'relative flex h-full w-full flex-col overflow-hidden rounded-3xl border-2 shadow-xl transition-all',
                  isShapeObject
                    ? 'border-none bg-transparent shadow-none overflow-visible'
                    : isAccentImageObject
                    ? 'bg-muted/30'
                    : 'bg-background/95',
                  isFeatureOverviewAtom
                    ? isSelected
                      ? 'border-primary shadow-2xl'
                      : 'border-transparent'
                    : !isShapeObject &&
                      (isSelected
                        ? 'border-primary shadow-2xl'
                        : 'border-border/70 hover-border-primary/40'),
                  (isTextBoxObject || isTableObject) &&
                    'overflow-visible border-transparent bg-transparent shadow-none',
                )}
                style={{
                  transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: rotation !== 0 ? 'center center' : undefined,
                }}
              >
                {isAtomObject(object) && !isFeatureOverviewAtom && (
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
                    isAccentImageObject || isShapeObject ? undefined : 'p-4',
                    (isTextBoxObject || isTableObject) && 'overflow-visible p-0',
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
                      }}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onInteract={onInteract}
                      onToolbarStateChange={handleTextToolbarStateChange}
                      onRequestPositionPanel={
                        onRequestPositionPanel ? () => onRequestPositionPanel(object.id) : undefined
                      }
                    />
                  ) : isTableObject && tableState ? (
                    <ExhibitionTable
                      id={object.id}
                      headers={tableState.headers}
                      data={tableState.data}
                      rows={tableState.rows}
                      cols={tableState.cols}
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
                      onToggleLock={() => toggleTableLock(object.id)}
                      onToggleOutline={() => toggleTableOutline(object.id)}
                      onStyleChange={nextStyleId => setTableStyle(object.id, nextStyleId)}
                      onDelete={onRemoveObject ? () => onRemoveObject(object.id) : undefined}
                      onDeleteColumn={(startIndex, count) => removeColumnsFromTable(object.id, startIndex, count)}
                      onDelete2Columns={(startIndex, count) => removeColumnsFromTable(object.id, startIndex, count)}
                      onDeleteRow={(startIndex, count) => removeRowsFromTable(object.id, startIndex, count)}
                      onDelete2Rows={(startIndex, count) => removeRowsFromTable(object.id, startIndex, count)}
                      onAddColumn={() => addColumnsToTable(object.id, 1)}
                      onAdd2Columns={() => addColumnsToTable(object.id, 2)}
                      onAddRow={() => addRowsToTable(object.id, 1)}
                      onAdd2Rows={() => addRowsToTable(object.id, 2)}
                      onToolbarStateChange={node => handleTextToolbarStateChange(object.id, node)}
                      onInteract={onInteract}
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
                      onSendToBack={() => onSendToBack([object.id])}
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

              {canEdit && isSelected && !isEditingTextBox &&
                handleDefinitions.map(definition => (
                  <span
                    key={definition.handle}
                    className={cn(
                      'absolute z-40 h-3 w-3 rounded-full border border-background bg-primary shadow',
                      definition.className,
                    )}
                    style={{ cursor: definition.cursor }}
                    onPointerDown={event => handleResizeStart(event, object.id, definition.handle)}
                  />
                ))}
            </div>
          );
        })}
        </div>

        {isDragOver && canEdit && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/60 bg-primary/10 text-xs font-semibold uppercase tracking-wide text-primary">
            Drop to add component
          </div>
        )}
      </div>
    );
  },
);

CanvasStage.displayName = 'CanvasStage';

export default SlideCanvas;
