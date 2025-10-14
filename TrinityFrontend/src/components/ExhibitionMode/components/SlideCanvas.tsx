import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  User,
  Calendar,
  Sparkles,
  StickyNote,
  Image as ImageIcon,
  Palette,
  Layout,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Maximize2,
  RotateCcw,
  Settings,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
    }
  | {
      kind: 'resize';
      objectId: string;
      handle: ResizeHandle;
      startClientX: number;
      startClientY: number;
      initial: { x: number; y: number; width: number; height: number };
    };

interface EditingTextState {
  id: string;
  type: 'title' | 'text-box';
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

const STRUCTURAL_OBJECT_TYPES = new Set(['title', 'accent-image']);
const UNTITLED_SLIDE_TEXT = 'Untitled Slide';

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
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFormatPanel, setShowFormatPanel] = useState(false);
  const [settings, setSettings] = useState<PresentationSettings>(() => ({
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...card.presentationSettings,
  }));
  const [activeTextToolbar, setActiveTextToolbar] = useState<ReactNode | null>(null);
  const accentImageInputRef = useRef<HTMLInputElement | null>(null);
  const formatPanelRef = useRef<HTMLDivElement | null>(null);
  const formatToggleRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const slideObjects = useExhibitionStore(
    useCallback(state => state.slideObjectsByCardId[card.id] ?? [], [card.id]),
  );
  const bulkUpdateSlideObjects = useExhibitionStore(state => state.bulkUpdateSlideObjects);
  const bringSlideObjectsToFront = useExhibitionStore(state => state.bringSlideObjectsToFront);
  const sendSlideObjectsToBack = useExhibitionStore(state => state.sendSlideObjectsToBack);
  const groupSlideObjects = useExhibitionStore(state => state.groupSlideObjects);
  const removeSlideObject = useExhibitionStore(state => state.removeSlideObject);

  const atomObjects = useMemo(() => slideObjects.filter(isAtomObject), [slideObjects]);
  const nonStructuralObjects = useMemo(
    () => slideObjects.filter(object => !STRUCTURAL_OBJECT_TYPES.has(object.type)),
    [slideObjects],
  );

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
    if (!showFormatPanel) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (formatPanelRef.current?.contains(target)) {
        return;
      }

      if (formatToggleRef.current?.contains(target)) {
        return;
      }

      setShowFormatPanel(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [showFormatPanel]);

  useEffect(() => {
    if (nonStructuralObjects.length > 0) {
      setHasInteracted(true);
    } else {
      setHasInteracted(false);
    }
  }, [card.id, nonStructuralObjects.length]);

  const updateSettings = (partial: Partial<PresentationSettings>) => {
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
  };

  const resetSettings = () => {
    if (!canEdit) {
      return;
    }
    const defaults = { ...DEFAULT_PRESENTATION_SETTINGS };
    setSettings(defaults);
    onPresentationChange?.(defaults, card.id);
  };

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

  const handleCanvasInteraction = () => {
    setHasInteracted(true);
  };

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
      dropX = e.clientX - rect.left - width / 2;
      dropY = e.clientY - rect.top - height / 2;
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

  const handleAccentImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  const cardColorClasses = {
    default: 'from-purple-500 via-pink-500 to-orange-400',
    blue: 'from-blue-500 via-cyan-500 to-teal-400',
    purple: 'from-violet-500 via-purple-500 to-fuchsia-400',
    green: 'from-emerald-500 via-green-500 to-lime-400',
    orange: 'from-orange-500 via-amber-500 to-yellow-400',
  };

  const containerClasses =
    viewMode === 'horizontal'
      ? 'flex-1 h-full bg-muted/20 overflow-auto'
      : cn(
          'w-full bg-muted/20 overflow-hidden border rounded-3xl transition-all duration-300 shadow-sm',
          isActive
            ? 'border-primary shadow-elegant ring-1 ring-primary/30'
            : 'border-border hover:border-primary/40'
        );

  return (
    <div className={containerClasses}>
      <div
        className={cn(
          'mx-auto transition-all duration-300 p-8',
          cardWidthClass
        )}
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
                'relative h-[520px] w-full overflow-hidden bg-card shadow-2xl transition-all duration-300',
                settings.fullBleed ? 'rounded-none' : 'rounded-2xl border-2 border-border',
                isDragOver && canEdit && draggedAtom ? 'scale-[0.98] ring-4 ring-primary/20' : undefined,
                !canEdit && 'opacity-90'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <CanvasStage
                ref={canvasRef}
                canEdit={canEdit}
                isDragOver={Boolean(isDragOver && canEdit && draggedAtom)}
                objects={slideObjects}
                showEmptyState={!hasInteracted && nonStructuralObjects.length === 0}
                layout={settings.cardLayout}
                cardColor={settings.cardColor}
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
              />

              <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-lg hover:bg-background"
                  onClick={() => onShowNotes?.()}
                  type="button"
                >
                  <StickyNote className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-lg hover:bg-background"
                  onClick={() => setShowFormatPanel(!showFormatPanel)}
                  disabled={!canEdit}
                  type="button"
                  ref={formatToggleRef}
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

          {showOverview && (
            <div className={cn('px-8 pb-8 flex flex-col flex-1 min-h-0 overflow-hidden', layoutConfig.overviewOuterClass)}>
              <div
                className={cn(
                  'bg-muted/30 rounded-xl border border-border p-6 flex-1 overflow-y-auto',
                  layoutConfig.overviewContainerClass
                )}
              >
                <h2 className="text-2xl font-bold text-foreground mb-6">Components Overview</h2>

                <div className={cn('grid gap-4', layoutConfig.gridClass)}>
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
                            onClick={() => handleAtomRemove(atom.id)}
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
          )}

          {showFormatPanel && (
            <div
              ref={formatPanelRef}
              className="absolute right-0 top-12 z-30 w-80 rounded-xl border-2 border-border bg-background p-4 shadow-2xl sm:right-3"
            >
              <h3 className="mb-4 text-sm font-semibold">Card Formatting</h3>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Layout</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'none' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'none' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <span className="sr-only">No layout</span>
                      <div className="flex h-6 w-6 items-center justify-center">
                        <div className="h-6 w-6 rounded border-2 border-current" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'top' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'top' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <span className="sr-only">Top layout</span>
                      <div className="flex h-6 w-6 flex-col">
                        <div className="h-2 rounded-t border-2 border-current bg-current/20" />
                        <div className="flex-1 rounded-b border-2 border-current" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'bottom' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'bottom' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <span className="sr-only">Bottom layout</span>
                      <div className="flex h-6 w-6 flex-col">
                        <div className="flex-1 rounded-t border-2 border-current" />
                        <div className="h-2 rounded-b border-2 border-current bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'right' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'right' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <span className="sr-only">Right layout</span>
                      <div className="flex h-6 w-6">
                        <div className="flex-1 rounded-l border-2 border-current" />
                        <div className="w-2 rounded-r border-2 border-current bg-current/20" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'left' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'left' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <span className="sr-only">Left layout</span>
                      <div className="flex h-6 w-6">
                        <div className="w-2 rounded-l border-2 border-current bg-current/20" />
                        <div className="flex-1 rounded-r border-2 border-current" />
                      </div>
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.cardLayout === 'full' ? 'default' : 'outline'}
                      className="h-12 w-12 rounded-lg"
                      onClick={() => updateSettings({ cardLayout: 'full' })}
                      type="button"
                      disabled={!canEdit}
                    >
                      <span className="sr-only">Entire background layout</span>
                      <div className="h-6 w-6 rounded border-2 border-current bg-current/20" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Accent image</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.accentImage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive"
                        onClick={() => updateSettings({ accentImage: null, accentImageName: null })}
                        disabled={!canEdit}
                        type="button"
                      >
                        Remove
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-primary"
                      onClick={() => accentImageInputRef.current?.click()}
                      disabled={!canEdit}
                      type="button"
                    >
                      {settings.accentImage ? 'Change' : 'Upload'}
                    </Button>
                  </div>
                </div>

                {settings.accentImage && (
                  <div className="space-y-2">
                    <div className="relative h-24 overflow-hidden rounded-lg border border-border">
                      <img
                        src={settings.accentImage}
                        alt="Accent"
                        className="h-full w-full object-cover"
                      />
                      {settings.accentImageName && (
                        <div className="absolute bottom-0 left-0 right-0 bg-background/90 px-2 py-1 text-[11px] truncate">
                          {settings.accentImageName}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Accent images replace the card color for this slide layout.
                    </p>
                  </div>
                )}

                <input
                  ref={accentImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAccentImageChange}
                  className="hidden"
                />

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Card color</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs capitalize"
                        disabled={!canEdit || Boolean(settings.accentImage)}
                      >
                        {settings.cardColor}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-background">
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'default' })}>Default</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'blue' })}>Blue</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'purple' })}>Purple</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'green' })}>Green</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => updateSettings({ cardColor: 'orange' })}>Orange</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layout className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Full-bleed card</span>
                  </div>
                  <Switch
                    checked={settings.fullBleed}
                    onCheckedChange={value => updateSettings({ fullBleed: value })}
                    disabled={!canEdit}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlignCenter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Content alignment</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant={settings.contentAlignment === 'top' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => updateSettings({ contentAlignment: 'top' })}
                      disabled={!canEdit}
                    >
                      <AlignLeft className="h-3 w-3 rotate-90" />
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.contentAlignment === 'center' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => updateSettings({ contentAlignment: 'center' })}
                      disabled={!canEdit}
                    >
                      <AlignCenter className="h-3 w-3 rotate-90" />
                    </Button>
                    <Button
                      size="icon"
                      variant={settings.contentAlignment === 'bottom' ? 'default' : 'outline'}
                      className="h-7 w-7"
                      onClick={() => updateSettings({ contentAlignment: 'bottom' })}
                      disabled={!canEdit}
                    >
                      <AlignRight className="h-3 w-3 rotate-90" />
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Maximize2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Card width</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={settings.cardWidth === 'M' ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => updateSettings({ cardWidth: 'M' })}
                      disabled={!canEdit}
                    >
                      M
                    </Button>
                    <Button
                      size="sm"
                      variant={settings.cardWidth === 'L' ? 'default' : 'outline'}
                      className="h-7 px-3 text-xs"
                      onClick={() => updateSettings({ cardWidth: 'L' })}
                      disabled={!canEdit}
                    >
                      L
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-sm">Backdrop</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-sm">Card headers & footers</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-primary">
                    Edit
                  </Button>
                </div>

                <Separator />

                <Button
                  variant="outline"
                  className="w-full justify-start text-sm"
                  onClick={resetSettings}
                  type="button"
                  disabled={!canEdit}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset styling
                </Button>
              </div>
            </div>
          )}
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
  );
};

interface CanvasStageProps {
  canEdit: boolean;
  objects: SlideObject[];
  isDragOver: boolean;
  showEmptyState: boolean;
  layout: CardLayout;
  cardColor: CardColor;
  onCanvasDragOver: (event: React.DragEvent) => void;
  onCanvasDragLeave: () => void;
  onCanvasDrop: (event: React.DragEvent) => void;
  onInteract: () => void;
  onRemoveAtom?: (atomId: string) => void;
  onBringToFront: (objectIds: string[]) => void;
  onSendToBack: (objectIds: string[]) => void;
  onBulkUpdate: (updates: Record<string, Partial<SlideObject>>) => void;
  onGroupObjects: (objectIds: string[], groupId: string | null) => void;
  onTitleCommit?: (text: string) => void;
  onRemoveObject?: (objectId: string) => void;
  onTextToolbarChange?: (toolbar: ReactNode | null) => void;
}

const MIN_OBJECT_WIDTH = 220;
const MIN_OBJECT_HEIGHT = 120;

const layoutOverlayBackgrounds: Record<CardColor, string> = {
  default: 'from-purple-500 via-pink-500 to-orange-400',
  blue: 'from-blue-500 via-cyan-500 to-teal-400',
  purple: 'from-violet-500 via-purple-500 to-fuchsia-400',
  green: 'from-emerald-500 via-green-500 to-lime-400',
  orange: 'from-orange-500 via-amber-500 to-yellow-400',
};

const LayoutOverlay: React.FC<{ layout: CardLayout; color: CardColor }> = ({ layout, color }) => {
  if (layout === 'none') {
    return null;
  }

  const gradient = layoutOverlayBackgrounds[color] ?? layoutOverlayBackgrounds.default;
  const baseClass = cn(
    'pointer-events-none absolute bg-gradient-to-br transition-all duration-300 ease-out',
    'shadow-[0_32px_72px_-32px_rgba(76,29,149,0.45)]',
    gradient,
  );

  switch (layout) {
    case 'top':
      return <div className={cn(baseClass, 'left-0 right-0 top-0 h-[190px] rounded-t-[28px]')} />;
    case 'bottom':
      return <div className={cn(baseClass, 'bottom-0 left-0 right-0 h-[200px] rounded-b-[28px]')} />;
    case 'left':
      return <div className={cn(baseClass, 'bottom-0 left-0 top-0 w-[32%] min-w-[260px] rounded-l-[28px]')} />;
    case 'right':
      return <div className={cn(baseClass, 'bottom-0 right-0 top-0 w-[32%] min-w-[260px] rounded-r-[28px]')} />;
    case 'full':
    default:
      return <div className={cn(baseClass, 'inset-0 rounded-[28px]')} />;
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
    const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
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
      if (editingTextState?.type === 'title' && editingTextareaRef.current) {
        const area = editingTextareaRef.current;
        area.focus({ preventScroll: true });
        area.select();
      }
    }, [editingTextState]);

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

    const commitEditingText = useCallback(() => {
      setEditingTextState(prev => {
        if (!prev) {
          return prev;
        }

        const object = objectsMap.get(prev.id);
        if (!object) {
          return null;
        }

        if (prev.type === 'title') {
          if (object.type !== 'title') {
            return null;
          }

          const raw = prev.value ?? '';
          const trimmed = raw.trim();
          const resolved = trimmed.length > 0 ? trimmed : UNTITLED_SLIDE_TEXT;
          const existing = typeof object.props?.text === 'string' ? object.props.text : '';

          if (resolved !== existing) {
            onInteract();
            const nextProps = { ...(object.props || {}), text: resolved };
            onBulkUpdate({
              [object.id]: {
                props: nextProps,
              },
            });
            onTitleCommit?.(resolved);
          }

          return null;
        }

        if (prev.type === 'text-box') {
          if (object.type !== 'text-box') {
            return null;
          }

          const raw = prev.value ?? '';
          const contentWithoutTags = raw.replace(/<[^>]*>/g, '').trim();
          const resolved = contentWithoutTags.length > 0 ? raw : DEFAULT_TEXT_BOX_TEXT;
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

          return null;
        }

        return null;
      });
    }, [objectsMap, onBulkUpdate, onInteract, onTitleCommit]);

    useEffect(() => {
      if (!canEdit && editingTextState) {
        commitEditingText();
      }
    }, [canEdit, commitEditingText, editingTextState]);

    const cancelEditingText = useCallback(() => {
      setEditingTextState(null);
    }, []);

    const beginEditingTitle = useCallback(
      (objectId: string) => {
        if (!canEdit) {
          return;
        }
        const object = objectsMap.get(objectId);
        if (!object || object.type !== 'title') {
          return;
        }
        const currentText = typeof object.props?.text === 'string' ? object.props.text : '';
        onInteract();
        focusCanvas();
        setSelectedIds([objectId]);
        setEditingTextState({
          id: objectId,
          type: 'title',
          value: currentText,
          original: currentText,
        });
      },
      [canEdit, focusCanvas, objectsMap, onInteract],
    );

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
        if (object.type === 'title') {
          event.stopPropagation();
          beginEditingTitle(objectId);
        } else if (object.type === 'text-box') {
          event.stopPropagation();
          beginEditingTextBox(objectId);
        }
      },
      [beginEditingTextBox, beginEditingTitle, canEdit, objectsMap],
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

    const handleBackgroundPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!canEdit) {
          return;
        }
        if (event.target !== event.currentTarget) {
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

    const handleObjectPointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>, objectId: string) => {
        if (!canEdit) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (editingTextState) {
          commitEditingText();
        }
        onInteract();
        focusCanvas();

        const isMulti = event.shiftKey || event.metaKey || event.ctrlKey;
        const baseSelection = isMulti
          ? selectedIds.includes(objectId)
            ? selectedIds
            : [...selectedIds, objectId]
          : [objectId];
        const uniqueSelection = Array.from(new Set(baseSelection));
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
        });
      },
      [canEdit, focusCanvas, onInteract, objectsMap, onBringToFront],
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
            } else if (object.type === 'text-box' && onRemoveObject) {
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

          const deltaX = event.clientX - activeInteraction.startClientX;
          const deltaY = event.clientY - activeInteraction.startClientY;

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

      if (object.type === 'title') {
        const rawText = typeof object.props?.text === 'string' ? object.props.text : '';
        const text = rawText.trim().length > 0 ? rawText : UNTITLED_SLIDE_TEXT;
        return (
          <div className="flex h-full w-full items-center justify-start px-6">
            <h2 className="text-4xl font-bold leading-tight text-foreground">{text}</h2>
          </div>
        );
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
        <div className="pointer-events-none absolute inset-0 z-0">
          <LayoutOverlay layout={layout} color={cardColor} />
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
            const isAccentImageObject = object.type === 'accent-image';
            const isTitleObject = object.type === 'title';
            const isTextBoxObject = object.type === 'text-box';
          const isEditingTitle =
            isTitleObject && editingTextState?.id === object.id && editingTextState.type === 'title';
          const isEditingTextBox =
            isTextBoxObject &&
            editingTextState?.id === object.id &&
            editingTextState.type === 'text-box';
          const textBoxFormatting = isTextBoxObject
            ? extractTextBoxFormatting(object.props as Record<string, unknown> | undefined)
            : null;

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
                  isAccentImageObject ? 'bg-muted/30' : 'bg-background/95',
                  isSelected ? 'border-primary shadow-2xl' : 'border-border/70 hover:border-primary/40',
                  isTextBoxObject && 'overflow-visible border-transparent bg-transparent shadow-none',
                )}
              >
                {isAtomObject(object) && (
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
                    isAccentImageObject || isTitleObject ? undefined : 'p-4',
                    isTextBoxObject && 'overflow-visible p-0',
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
                    />
                  ) : (
                    <div
                      className={cn(
                        'h-full w-full overflow-hidden',
                        isAccentImageObject
                          ? undefined
                          : isTitleObject
                          ? 'bg-transparent'
                          : 'rounded-2xl bg-background/90 p-3',
                      )}
                    >
                      {isEditingTitle ? (
                        <textarea
                          ref={editingTextareaRef}
                          value={editingTextState.value}
                          onChange={event => handleEditingValueChange(event.target.value)}
                          onBlur={commitEditingText}
                          onKeyDown={event => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              commitEditingText();
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              cancelEditingText();
                            }
                          }}
                          placeholder={UNTITLED_SLIDE_TEXT}
                          className="h-full w-full resize-none bg-transparent px-6 py-4 text-4xl font-bold leading-tight text-foreground outline-none focus:outline-none focus:ring-0"
                          spellCheck={false}
                          onPointerDown={event => event.stopPropagation()}
                        />
                      ) : (
                        renderObjectContent(object)
                      )}
                    </div>
                  )}
                </div>
                {canEdit && isAtomObject(object) && onRemoveAtom && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-3 right-3 z-30 h-9 w-9 text-muted-foreground hover:text-destructive"
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => onRemoveAtom(object.props.atom.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {canEdit && isSelected && !isEditingTitle && !isEditingTextBox &&
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
