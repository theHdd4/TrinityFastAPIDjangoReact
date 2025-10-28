import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Download, FileText, Grid3x3, Save, Share2, Undo2 } from 'lucide-react';
import Header from '@/components/Header';
import {
  useExhibitionStore,
  DEFAULT_PRESENTATION_SETTINGS,
  type DroppedAtom,
  type PresentationSettings,
  type LayoutCard,
  type SlideObject,
  type SlideshowTransition,
  createSlideObjectFromAtom,
  DEFAULT_CANVAS_OBJECT_WIDTH,
  DEFAULT_CANVAS_OBJECT_HEIGHT,
} from './store/exhibitionStore';
import { ExhibitionCatalogue } from './components/ExhibitionCatalogue';
import { SlideCanvas } from './components/SlideCanvas';
import { OperationsPalette } from './components/operationsPalette';
import { SlideNavigation } from './components/SlideNavigation';
import { SlideThumbnails } from './components/SlideThumbnails';
import { SlideNotes } from './components/SlideNotes';
import { GridView } from './components/GridView';
import { ExportDialog } from './components/ExportDialog';
import { ImagePanel, type ImageSelectionRequest } from './components/Images';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  saveExhibitionLayout,
  fetchExhibitionManifest,
} from '@/lib/exhibition';
import { getActiveProjectContext, type ProjectContext } from '@/utils/projectEnv';
import { createTextBoxSlideObject } from './components/operationsPalette/textBox/constants';
import { createTableSlideObject } from './components/operationsPalette/tables/constants';
import { ShapesPanel, createShapeSlideObject, type ShapeDefinition } from './components/operationsPalette/shapes';
import {
  createImageSlideObject,
  generateImageObjectId,
} from './components/operationsPalette/images/constants';
import {
  ChartPanel,
  createChartSlideObject,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  type ChartConfig,
  type ChartDataRow,
  type ChartPanelResult,
} from './components/operationsPalette/charts';
import { ThemesPanel } from './components/operationsPalette/themes';
import {
  buildChartRendererPropsFromManifest,
  buildTableDataFromManifest,
  clonePlain,
} from '@/components/AtomList/atoms/feature-overview/utils/exhibitionManifest';

const NOTES_STORAGE_KEY = 'exhibition-notes';
const SLIDESHOW_ANIMATION_MS = 450;
const EXHIBITION_STORAGE_KEY = 'exhibition-layout-cache';
const LAB_STORAGE_KEY = 'laboratory-layout-cards';

type TransitionPhase = 'prepare' | 'active';

type PresentationTransitionState = {
  fromIndex: number;
  toIndex: number;
  direction: 'forward' | 'backward';
  transition: SlideshowTransition;
  phase: TransitionPhase;
};

type TransitionFrames = {
  outgoing: { initial: React.CSSProperties; final: React.CSSProperties };
  incoming: { initial: React.CSSProperties; final: React.CSSProperties };
};

type ExhibitionSnapshot = {
  cards: LayoutCard[];
  slideObjects: Record<string, SlideObject[]>;
};

const TRANSITION_LAYER_BASE_STYLE: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `opacity ${SLIDESHOW_ANIMATION_MS}ms ease, transform ${SLIDESHOW_ANIMATION_MS}ms ease`,
  willChange: 'opacity, transform',
};

const getTransitionFrames = (
  transition: SlideshowTransition,
  direction: 'forward' | 'backward',
): TransitionFrames => {
  switch (transition) {
    case 'slide': {
      const offset = direction === 'forward' ? -48 : 48;
      const enteringOffset = -offset;
      return {
        outgoing: {
          initial: { opacity: 1, transform: 'translateX(0px) scale(1)' },
          final: { opacity: 0, transform: `translateX(${offset}px) scale(1)` },
        },
        incoming: {
          initial: { opacity: 0, transform: `translateX(${enteringOffset}px) scale(1)` },
          final: { opacity: 1, transform: 'translateX(0px) scale(1)' },
        },
      };
    }
    case 'zoom':
      return {
        outgoing: {
          initial: { opacity: 1, transform: 'scale(1)' },
          final: { opacity: 0, transform: 'scale(0.96)' },
        },
        incoming: {
          initial: { opacity: 0, transform: 'scale(1.04)' },
          final: { opacity: 1, transform: 'scale(1)' },
        },
      };
    case 'fade':
    default:
      return {
        outgoing: {
          initial: { opacity: 1, transform: 'translateX(0px) scale(1)' },
          final: { opacity: 0, transform: 'translateX(0px) scale(1)' },
        },
        incoming: {
          initial: { opacity: 0, transform: 'translateX(0px) scale(1)' },
          final: { opacity: 1, transform: 'translateX(0px) scale(1)' },
        },
      };
  }
};

const contextsEqual = (a: ProjectContext | null, b: ProjectContext | null): boolean => {
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

const ExhibitionMode = () => {
  const {
    exhibitedCards,
    cards,
    catalogueCards,
    loadSavedConfiguration,
    updateCard,
    addBlankSlide,
    setCards,
    lastLoadedContext,
    addSlideObject,
    removeSlideObject,
    removeSlide,
    slideObjectsByCardId,
  } = useExhibitionStore();
  const { toast } = useToast();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('exhibition:edit');
  const [projectContext, setProjectContext] = useState<ProjectContext | null>(() => getActiveProjectContext());

  const presenterDisplayName = useMemo(() => {
    const username = typeof user?.username === 'string' ? user.username.trim() : '';
    if (username.length > 0) {
      return username;
    }

    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    if (email.length > 0) {
      return email;
    }

    return 'Unknown Presenter';
  }, [user]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPresentationView, setIsPresentationView] = useState(false);
  const [draggedAtom, setDraggedAtom] = useState<
    { atom: DroppedAtom; cardId: string; origin: 'catalogue' | 'slide' }
    | null
  >(null);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [isSaving, setIsSaving] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [isCatalogueCollapsed, setIsCatalogueCollapsed] = useState(false);
  const [operationsPanelState, setOperationsPanelState] = useState<
    | { type: 'custom'; node: ReactNode }
    | { type: 'notes' }
    | { type: 'shapes' }
    | { type: 'images' }
    | { type: 'charts' }
    | { type: 'themes' }
    | null
  >(null);
  const [chartPanelData, setChartPanelData] = useState<ChartDataRow[]>(DEFAULT_CHART_DATA);
  const [chartPanelConfig, setChartPanelConfig] = useState<ChartConfig>(DEFAULT_CHART_CONFIG);
  const [notes, setNotes] = useState<Record<number, string>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const stored = window.localStorage.getItem(NOTES_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Record<number, string>) : {};
    } catch (error) {
      console.warn('Failed to load exhibition notes from storage', error);
      return {};
    }
  });

  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [presentationTransition, setPresentationTransition] =
    useState<PresentationTransitionState | null>(null);

  const presentationTransitionRef = useRef<PresentationTransitionState | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const verticalSlideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const undoStackRef = useRef<ExhibitionSnapshot[]>([]);
  const isRestoringSnapshotRef = useRef(false);
  const lastSerializedSnapshotRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const hasRequestedInitialLoadRef = useRef(false);

  const generateTextBoxId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
      return (crypto as Crypto).randomUUID();
    }
    return `textbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const generateTableId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
      return (crypto as Crypto).randomUUID();
    }
    return `table-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const generateShapeId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
      return (crypto as Crypto).randomUUID();
    }
    return `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const generateChartId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof (crypto as Crypto).randomUUID === 'function') {
      return (crypto as Crypto).randomUUID();
    }
    return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const clearSlideshowTimers = useCallback(() => {
    clearAutoAdvanceTimer();
  }, [clearAutoAdvanceTimer]);


  const slideIndexByCardId = useMemo(() => {
    const lookup: Record<string, number> = {};
    exhibitedCards.forEach((card, index) => {
      lookup[card.id] = index;
    });
    return lookup;
  }, [exhibitedCards]);

  useEffect(() => {
    presentationTransitionRef.current = presentationTransition;
  }, [presentationTransition]);

  useEffect(() => {
    if (isPresentationView) {
      setOperationsPanelState(null);
    }
  }, [isPresentationView]);

  useEffect(() => {
    if (!presentationTransition) {
      return;
    }

    if (presentationTransition.phase === 'prepare') {
      const frame = window.requestAnimationFrame(() => {
        setPresentationTransition(state =>
          state ? { ...state, phase: 'active' } : null,
        );
      });

      return () => window.cancelAnimationFrame(frame);
    }

    const timeout = window.setTimeout(() => {
      setPresentationTransition(null);
    }, SLIDESHOW_ANIMATION_MS);

    return () => window.clearTimeout(timeout);
  }, [presentationTransition]);

  useEffect(() => {
    if (!canEdit) {
      setOperationsPanelState(null);
    }
  }, [canEdit]);

  const runSlideTransition = useCallback(
    (targetIndex: number, direction: 'forward' | 'backward' = 'forward') => {
      if (
        targetIndex === currentSlide ||
        targetIndex < 0 ||
        targetIndex >= exhibitedCards.length ||
        presentationTransitionRef.current
      ) {
        return;
      }

      const transitionType =
        exhibitedCards[targetIndex]?.presentationSettings?.slideshowTransition ??
        DEFAULT_PRESENTATION_SETTINGS.slideshowTransition;

      clearSlideshowTimers();

      setPresentationTransition({
        fromIndex: currentSlide,
        toIndex: targetIndex,
        direction,
        transition: transitionType,
        phase: 'prepare',
      });

      setCurrentSlide(targetIndex);
    },
    [
      clearSlideshowTimers,
      currentSlide,
      exhibitedCards,
    ],
  );

  const handleStopSlideshow = useCallback(() => {
    setIsSlideshowActive(false);
    clearSlideshowTimers();
    setPresentationTransition(null);
    setIsPresentationView(false);
  }, [clearSlideshowTimers, setIsPresentationView]);

  const goToSlide = useCallback(
    (targetIndex: number, direction: 'forward' | 'backward' = 'forward') => {
      if (targetIndex < 0 || targetIndex >= exhibitedCards.length) {
        return;
      }

      if (!isSlideshowActive) {
        setCurrentSlide(targetIndex);
        return;
      }

      runSlideTransition(targetIndex, direction);
    },
    [exhibitedCards.length, isSlideshowActive, runSlideTransition],
  );

  const handleSlideSelection = useCallback(
    (index: number) => {
      if (isSlideshowActive) {
        handleStopSlideshow();
      }

      if (index === currentSlide) {
        return;
      }

      const direction = index > currentSlide ? 'forward' : 'backward';
      goToSlide(index, direction);
    },
    [currentSlide, goToSlide, handleStopSlideshow, isSlideshowActive],
  );

  const handleStartSlideshow = useCallback(() => {
    if (exhibitedCards.length === 0) {
      return;
    }

    clearSlideshowTimers();
    setPresentationTransition(null);
    setIsSlideshowActive(true);
    setShowThumbnails(false);
    setShowGridView(false);
    setOperationsPanelState(null);

    if (!isPresentationView) {
      setIsPresentationView(true);
    }

    if (viewMode !== 'horizontal') {
      setViewMode('horizontal');
    }
  }, [
    currentSlide,
    exhibitedCards,
    isPresentationView,
    clearSlideshowTimers,
    setShowGridView,
    setShowThumbnails,
    viewMode,
  ]);

  const scheduleAutoAdvance = useCallback(() => {
    if (!isSlideshowActive || exhibitedCards.length <= 1 || presentationTransition) {
      clearAutoAdvanceTimer();
      return;
    }

    const activeSlide = exhibitedCards[currentSlide];
    const durationSeconds =
      activeSlide?.presentationSettings?.slideshowDuration ??
      DEFAULT_PRESENTATION_SETTINGS.slideshowDuration;
    const normalizedSeconds = Number(durationSeconds);
    const safeSeconds = Number.isFinite(normalizedSeconds)
      ? normalizedSeconds
      : DEFAULT_PRESENTATION_SETTINGS.slideshowDuration;
    const delay = Math.max(1, safeSeconds) * 1000;

    clearAutoAdvanceTimer();

    autoAdvanceTimerRef.current = window.setTimeout(() => {
      const nextIndex = (currentSlide + 1) % exhibitedCards.length;
      runSlideTransition(nextIndex, 'forward');
    }, delay);
  }, [
    clearAutoAdvanceTimer,
    currentSlide,
    exhibitedCards,
    isSlideshowActive,
    presentationTransition,
    runSlideTransition,
  ]);

  const handlePresentationChange = useCallback(
    (settings: PresentationSettings, cardId?: string) => {
      let targetId = cardId;

      if (!targetId) {
        const targetCard = exhibitedCards[currentSlide];
        targetId = targetCard?.id;
      }

      if (!targetId) {
        return;
      }

      updateCard(targetId, { presentationSettings: settings });
    },
    [currentSlide, exhibitedCards, updateCard]
  );

  const handleTitleChange = useCallback(
    (title: string, cardId: string) => {
      updateCard(cardId, { title });
    },
    [updateCard],
  );

  const handleSlideshowSettingsChange = useCallback(
    (partial: { slideshowDuration?: number; slideshowTransition?: SlideshowTransition }) => {
      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        return;
      }

      const merged: PresentationSettings = {
        ...DEFAULT_PRESENTATION_SETTINGS,
        ...targetCard.presentationSettings,
      };

      if (partial.slideshowDuration !== undefined) {
        merged.slideshowDuration = Math.max(1, partial.slideshowDuration);
      }

      if (partial.slideshowTransition) {
        merged.slideshowTransition = partial.slideshowTransition;
      }

      handlePresentationChange(merged, targetCard.id);

      if (isSlideshowActive) {
        clearAutoAdvanceTimer();
      }
    },
    [
      clearAutoAdvanceTimer,
      currentSlide,
      exhibitedCards,
      handlePresentationChange,
      isSlideshowActive,
    ],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (error) {
      console.warn('Failed to persist exhibition notes', error);
    }
  }, [notes]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage.getItem('laboratory-config')) {
      console.log('Successfully Loaded Existing Project State');
      toast({ title: 'Successfully Loaded Existing Project State' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncContext = () => {
      setProjectContext(prev => {
        const next = getActiveProjectContext();
        if (contextsEqual(prev, next)) {
          return prev;
        }
        return next;
      });
    };

    syncContext();

    window.addEventListener('storage', syncContext);
    window.addEventListener('focus', syncContext);

    return () => {
      window.removeEventListener('storage', syncContext);
      window.removeEventListener('focus', syncContext);
    };
  }, []);

  useEffect(() => {
    if (!hasRequestedInitialLoadRef.current) {
      hasRequestedInitialLoadRef.current = true;
      if (projectContext) {
        void loadSavedConfiguration(projectContext);
      } else {
        void loadSavedConfiguration(null);
      }
      return;
    }

    if (projectContext) {
      if (!lastLoadedContext || !contextsEqual(projectContext, lastLoadedContext)) {
        void loadSavedConfiguration(projectContext);
      }
      return;
    }

    if (!projectContext && lastLoadedContext) {
      void loadSavedConfiguration(null);
    }
  }, [projectContext, lastLoadedContext, loadSavedConfiguration]);

  useEffect(() => {
    const snapshot: ExhibitionSnapshot = {
      cards,
      slideObjects: slideObjectsByCardId,
    };

    const serialized = JSON.stringify(snapshot);

    if (isRestoringSnapshotRef.current) {
      isRestoringSnapshotRef.current = false;
      lastSerializedSnapshotRef.current = serialized;
      return;
    }

    if (lastSerializedSnapshotRef.current && lastSerializedSnapshotRef.current !== serialized) {
      const previous = JSON.parse(lastSerializedSnapshotRef.current) as ExhibitionSnapshot;
      undoStackRef.current.push(previous);

      const MAX_UNDO_HISTORY = 20;
      if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
        undoStackRef.current.shift();
      }

      setUndoAvailable(undoStackRef.current.length > 0);
    }

    lastSerializedSnapshotRef.current = serialized;
  }, [cards, slideObjectsByCardId]);

  useEffect(() => {
    if (currentSlide >= exhibitedCards.length) {
      setCurrentSlide(exhibitedCards.length > 0 ? exhibitedCards.length - 1 : 0);
    }
  }, [currentSlide, exhibitedCards.length]);

  useEffect(() => {
    const isEditableKeyboardEvent = (event: KeyboardEvent): boolean => {
      const isEditableTarget = (target: EventTarget | null | undefined): boolean => {
        if (!target || !(target instanceof HTMLElement)) {
          return false;
        }

        const tagName = target.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return true;
        }

        if (target.isContentEditable) {
          return true;
        }

        if (target.dataset?.textboxEditable === 'true' || target.dataset?.exhibitionTableCellContent === 'true') {
          return true;
        }

        if (target.closest('[contenteditable="true"]')) {
          return true;
        }

        if (target.closest('[data-textbox-editable="true"]')) {
          return true;
        }

        if (target.closest('[data-exhibition-table-cell-content="true"]')) {
          return true;
        }

        return false;
      };

      if (isEditableTarget(event.target)) {
        return true;
      }

      if (typeof event.composedPath === 'function') {
        const path = event.composedPath();
        for (const node of path) {
          if (isEditableTarget(node)) {
            return true;
          }
        }
      }

      return false;
    };

    const handleKeyPress = (e: KeyboardEvent) => {
      if (exhibitedCards.length === 0) return;

      if (isEditableKeyboardEvent(e)) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp': {
          const previousIndex = Math.max(0, currentSlide - 1);
          goToSlide(previousIndex, 'backward');
          break;
        }
        case 'ArrowRight':
        case 'PageDown':
        case ' ': {
          if (e.key === ' ') {
            e.preventDefault();
          }
          const nextIndex = Math.min(exhibitedCards.length - 1, currentSlide + 1);
          goToSlide(nextIndex, 'forward');
          break;
        }
        case 'Escape':
          if (isPresentationView || isSlideshowActive) {
            handleStopSlideshow();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    currentSlide,
    exhibitedCards.length,
    goToSlide,
    isPresentationView,
    isSlideshowActive,
    handleStopSlideshow,
  ]);

  useEffect(() => {
    scheduleAutoAdvance();
    return () => {
      clearAutoAdvanceTimer();
    };
  }, [clearAutoAdvanceTimer, scheduleAutoAdvance]);

  useEffect(() => {
    return () => {
      clearSlideshowTimers();
    };
  }, [clearSlideshowTimers]);

  useEffect(() => {
    if (!isPresentationView && isSlideshowActive) {
      handleStopSlideshow();
    }
  }, [handleStopSlideshow, isPresentationView, isSlideshowActive]);

  const handleUndo = useCallback(() => {
    if (!canEdit) {
      toast({
        title: 'Insufficient permissions',
        description: 'You need edit access to undo exhibition changes.',
        variant: 'destructive',
      });
      return;
    }

    const previous = undoStackRef.current.pop();
    if (!previous) {
      toast({
        title: 'Nothing to undo',
        description: 'There are no more exhibition changes to revert.',
      });
      setUndoAvailable(false);
      return;
    }

    isRestoringSnapshotRef.current = true;
    setCards(previous.cards, previous.slideObjects);
    setUndoAvailable(undoStackRef.current.length > 0);
    toast({ title: 'Undo', description: 'Reverted the last change to your exhibition.' });
  }, [canEdit, setCards, toast]);

  const persistCardsLocally = useCallback((payloadCards: LayoutCard[]) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const serializedPayload = JSON.stringify(payloadCards);

      const possibleLabCache = window.localStorage.getItem(LAB_STORAGE_KEY);
      if (possibleLabCache) {
        try {
          const parsed = JSON.parse(possibleLabCache);
          const containsExhibitionFields = Array.isArray(parsed)
            && parsed.some(card => card && typeof card === 'object'
              && ('presentationSettings' in card || 'catalogueAtoms' in card));

          if (containsExhibitionFields) {
            window.localStorage.removeItem(LAB_STORAGE_KEY);
          }
        } catch (parseError) {
          console.warn('Failed to inspect laboratory cache before saving exhibition layout', parseError);
        }
      }

      window.localStorage.setItem(EXHIBITION_STORAGE_KEY, serializedPayload);
    } catch (error) {
      console.warn('Failed to cache exhibition layout locally', error);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!canEdit) {
      toast({
        title: 'Insufficient permissions',
        description: 'You need edit access to save exhibition updates.',
        variant: 'destructive',
      });
      return;
    }

    if (isSaving) {
      return;
    }

    const context = getActiveProjectContext();
    if (!context) {
      toast({
        title: 'Project details missing',
        description: 'Select a project before saving your exhibition.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      const cardsToPersist = JSON.parse(JSON.stringify(cards)) as LayoutCard[];

      const slideObjectsToPersist = cards.reduce<Record<string, any[]>>((acc, card) => {
        const objects = slideObjectsByCardId[card.id] ?? [];
        acc[card.id] = JSON.parse(JSON.stringify(objects));
        return acc;
      }, {} as Record<string, any[]>);

      await saveExhibitionLayout({
        client_name: context.client_name,
        app_name: context.app_name,
        project_name: context.project_name,
        cards: cardsToPersist,
        slide_objects: slideObjectsToPersist,
      });
      persistCardsLocally(cardsToPersist);
      toast({ title: 'Exhibition saved', description: 'Your exhibition updates have been saved.' });
    } catch (error) {
      console.error('Failed to save exhibition layout', error);
      toast({
        title: 'Save failed',
        description:
          error instanceof Error ? error.message : 'Unable to save your exhibition layout right now.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, cards, isSaving, persistCardsLocally, slideObjectsByCardId, toast]);

  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const shareUrl = window.location.href;
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; url?: string; text?: string }) => Promise<void>;
      clipboard?: Clipboard;
    };

    try {
      if (typeof nav.share === 'function') {
        await nav.share({ title: 'Exhibition Mode', url: shareUrl });
        toast({ title: 'Share', description: 'Opened the share dialog for your exhibition.' });
        return;
      }

      if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        await nav.clipboard.writeText(shareUrl);
        toast({ title: 'Link copied', description: 'Copied the exhibition link to your clipboard.' });
        return;
      }

      throw new Error('Sharing not supported');
    } catch (error) {
      console.warn('Share action unavailable', error);
      toast({
        title: 'Share unavailable',
        description: 'Your browser does not support sharing from this page.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleDragStart = (atom: DroppedAtom, cardId: string, origin: 'catalogue' | 'slide' = 'catalogue') => {
    if (!canEdit) return;
    setDraggedAtom({ atom, cardId, origin });
  };

  const handleDragEnd = () => {
    setDraggedAtom(null);
  };

  useEffect(() => {
    setDraggedAtom(null);
  }, [currentSlide]);

  const ensureAtomManifest = useCallback(
    async (component: DroppedAtom): Promise<DroppedAtom> => {
      if (!component?.id) {
        return component;
      }

      const resolvedContext = projectContext ?? getActiveProjectContext();
      if (!resolvedContext || !resolvedContext.client_name || !resolvedContext.app_name || !resolvedContext.project_name) {
        return component;
      }

      const enhanceMetadataWithManifest = (
        manifestInput: unknown,
        baseMetadata?: Record<string, any>,
        responseMetadata?: Record<string, any> | null,
        manifestId?: string | null,
      ): Record<string, any> | undefined => {
        const manifest = manifestInput && typeof manifestInput === 'object' ? clonePlain(manifestInput) : undefined;
        if (!manifest && !responseMetadata && !manifestId && !baseMetadata) {
          return baseMetadata;
        }

        const nextMetadata: Record<string, any> = { ...(baseMetadata || {}) };

        if (manifest) {
          nextMetadata.visualizationManifest = manifest;

          const manifestChartProps = buildChartRendererPropsFromManifest(manifest);
          if (manifestChartProps) {
            if (nextMetadata.chartRendererProps == null) {
              nextMetadata.chartRendererProps = clonePlain(manifestChartProps);
            }

            const existingChartData = nextMetadata.chartData;
            const hasExistingChartData = Array.isArray(existingChartData)
              ? existingChartData.length > 0
              : Boolean(existingChartData);

            if (!hasExistingChartData) {
              nextMetadata.chartData = clonePlain(manifestChartProps.data);
            }
          }

          const manifestTable = buildTableDataFromManifest(manifest);
          if (manifestTable && nextMetadata.tableData == null) {
            nextMetadata.tableData = clonePlain(manifestTable);
          }

          if (!nextMetadata.statisticalDetails) {
            const summarySnapshot = manifest?.data?.summary ? clonePlain(manifest.data.summary) : undefined;
            const timeseriesSnapshot = Array.isArray(manifest?.data?.timeseries)
              ? clonePlain(manifest.data.timeseries)
              : undefined;
            const fullSnapshot = manifest?.data?.statisticalFull
              ? clonePlain(manifest.data.statisticalFull)
              : undefined;

            if (summarySnapshot || timeseriesSnapshot || fullSnapshot) {
              nextMetadata.statisticalDetails = {
                summary: summarySnapshot,
                timeseries: timeseriesSnapshot,
                full: fullSnapshot,
              };
            }
          }

          if (!nextMetadata.skuRow && manifest?.data?.skuRow) {
            nextMetadata.skuRow = clonePlain(manifest.data.skuRow);
          }

          if (!nextMetadata.featureContext && manifest?.featureContext) {
            nextMetadata.featureContext = clonePlain(manifest.featureContext);
          }

          if (!nextMetadata.metric && manifest?.metric) {
            nextMetadata.metric = manifest.metric;
          }

          if (!nextMetadata.label && manifest?.label) {
            nextMetadata.label = manifest.label;
          }

          if (!nextMetadata.capturedAt && manifest?.capturedAt) {
            nextMetadata.capturedAt = manifest.capturedAt;
          }

          if (!nextMetadata.chartState && manifest?.chart) {
            nextMetadata.chartState = {
              chartType: manifest.chart.type,
              theme: manifest.chart.theme,
              showDataLabels: manifest.chart.showDataLabels,
              showAxisLabels: manifest.chart.showAxisLabels,
              showGrid: manifest.chart.showGrid,
              showLegend: manifest.chart.showLegend,
              xAxisField: manifest.chart.xField,
              yAxisField: manifest.chart.yField,
              legendField: manifest.chart.legendField,
              colorPalette: Array.isArray(manifest.chart.colorPalette)
                ? [...manifest.chart.colorPalette]
                : manifest.chart.colorPalette,
            };
          }
        }

        if (responseMetadata && typeof responseMetadata === 'object') {
          Object.entries(responseMetadata).forEach(([key, value]) => {
            if (value !== undefined) {
              nextMetadata[key] = value;
            }
          });
        }

        if (manifestId) {
          nextMetadata.manifestId = manifestId;
        }

        return nextMetadata;
      };

      const metadataRecord =
        component.metadata && typeof component.metadata === 'object'
          ? (component.metadata as Record<string, any>)
          : undefined;
      const manifestFromMetadata = metadataRecord?.visualizationManifest ?? metadataRecord?.visualisationManifest;

      if (manifestFromMetadata) {
        const enhancedMetadata = enhanceMetadataWithManifest(manifestFromMetadata, metadataRecord);
        return {
          ...component,
          metadata: enhancedMetadata,
        };
      }

      try {
        const response = await fetchExhibitionManifest({
          client_name: resolvedContext.client_name,
          app_name: resolvedContext.app_name,
          project_name: resolvedContext.project_name,
          component_id: component.id,
        });

        if (response && response.manifest) {
          const nextMetadata = enhanceMetadataWithManifest(
            response.manifest,
            metadataRecord,
            response.metadata,
            response.manifest_id,
          );

          return {
            ...component,
            metadata: nextMetadata,
          };
        }
      } catch (error) {
        console.warn(`[Exhibition] Unable to fetch manifest for component ${component.id}`, error);
      }

      return component;
    },
    [projectContext],
  );

  const handleDrop = useCallback(
    (
      atom: DroppedAtom,
      sourceCardId: string,
      targetCardId: string,
      origin: 'catalogue' | 'slide' = 'catalogue',
      placement?: { x: number; y: number; width: number; height: number },
    ) => {
      const processDrop = async () => {
        const primarySourceCard = cards.find(card => card.id === sourceCardId) ?? null;
        const catalogueSourceCard =
          origin === 'catalogue'
            ? catalogueCards.find(card => card.id === sourceCardId) ?? null
            : null;
        const destinationCard = cards.find(card => card.id === targetCardId) ?? null;

        if (!destinationCard) {
          setDraggedAtom(null);
          return;
        }

        const resolvedSourceCard = primarySourceCard ?? catalogueSourceCard;
        const destinationAlreadyHasAtom = destinationCard.atoms.some(a => a.id === atom.id);
        if (destinationAlreadyHasAtom) {
          toast({
            title: 'Component already on slide',
            description: `${atom.title} is already part of this slide.`,
          });
          setDraggedAtom(null);
          return;
        }

        const manifestedAtom = await ensureAtomManifest({
          ...atom,
          metadata: atom.metadata ? { ...atom.metadata } : undefined,
        });

        const destinationAtoms = [...destinationCard.atoms, manifestedAtom];

        updateCard(destinationCard.id, { atoms: destinationAtoms });
        addSlideObject(
          destinationCard.id,
          createSlideObjectFromAtom(manifestedAtom, {
            id: manifestedAtom.id,
            x: placement?.x ?? 96,
            y: placement?.y ?? 96,
            width: placement?.width ?? DEFAULT_CANVAS_OBJECT_WIDTH,
            height: placement?.height ?? DEFAULT_CANVAS_OBJECT_HEIGHT,
          }),
        );

        if (origin === 'catalogue' && resolvedSourceCard && Array.isArray(resolvedSourceCard.catalogueAtoms)) {
          const nextCatalogueAtoms = resolvedSourceCard.catalogueAtoms.map(existing =>
            existing.id === manifestedAtom.id ? manifestedAtom : existing,
          );
          updateCard(resolvedSourceCard.id, { catalogueAtoms: nextCatalogueAtoms });
        }

        if (
          origin === 'slide' &&
          primarySourceCard &&
          primarySourceCard.id !== destinationCard.id &&
          Array.isArray(primarySourceCard.atoms)
        ) {
          const sourceAtoms = primarySourceCard.atoms.filter(a => a.id !== atom.id);
          updateCard(primarySourceCard.id, { atoms: sourceAtoms });
          removeSlideObject(primarySourceCard.id, atom.id);
        }

        const targetIndex = exhibitedCards.findIndex(card => card.id === destinationCard.id);
        if (targetIndex !== -1) {
          toast({
            title: 'Component added',
            description: `${manifestedAtom.title} moved to slide ${targetIndex + 1}.`,
          });
          setCurrentSlide(targetIndex);
        } else {
          toast({
            title: 'Component added',
            description: `${manifestedAtom.title} moved to a slide.`,
          });
        }

        setDraggedAtom(null);
      };

      void processDrop();
    },
    [
      addSlideObject,
      cards,
      catalogueCards,
      ensureAtomManifest,
      exhibitedCards,
      removeSlideObject,
      toast,
      updateCard,
    ]
  );

  const handleRemoveAtom = useCallback(
    (atomId: string) => {
      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        return;
      }

      const latestCard = cards.find(card => card.id === targetCard.id);
      if (!latestCard) {
        return;
      }

      if (!latestCard.atoms.some(atom => atom.id === atomId)) {
        return;
      }

      const nextAtoms = latestCard.atoms.filter(atom => atom.id !== atomId);
      updateCard(latestCard.id, { atoms: nextAtoms });
      removeSlideObject(latestCard.id, atomId);
      toast({
        title: 'Component removed',
        description: 'The component has been removed from this slide.',
      });
    },
    [cards, currentSlide, exhibitedCards, removeSlideObject, toast, updateCard]
  );

  const handleNotesChange = useCallback((slideIndex: number, value: string) => {
    setNotes(prev => {
      const next = { ...prev };
      if (!value.trim()) {
        delete next[slideIndex];
      } else {
        next[slideIndex] = value;
      }
      return next;
    });
  }, []);

  const handleAddSlide = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const created = addBlankSlide(exhibitedCards.length > 0 ? currentSlide : undefined);
    if (!created) {
      return;
    }

    const newIndex =
      exhibitedCards.length > 0 ? Math.min(currentSlide + 1, exhibitedCards.length) : 0;

    setCurrentSlide(newIndex);

    toast({
      title: 'Blank slide added',
      description: 'A new slide has been added to your presentation.',
    });
  }, [addBlankSlide, canEdit, currentSlide, exhibitedCards.length, toast]);

  const handleDeleteSlide = useCallback(() => {
    const targetCard = exhibitedCards[currentSlide];
    if (!targetCard) {
      return;
    }

    if (isSlideshowActive) {
      handleStopSlideshow();
    }

    const nextIndex = currentSlide >= exhibitedCards.length - 1 ? Math.max(0, currentSlide - 1) : currentSlide;

    setNotes(prev => {
      if (!prev || Object.keys(prev).length === 0) {
        return prev;
      }

      const updated: Record<number, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const numericKey = Number(key);
        if (!Number.isFinite(numericKey)) {
          return;
        }

        if (numericKey === currentSlide) {
          return;
        }

        const adjustedIndex = numericKey > currentSlide ? numericKey - 1 : numericKey;
        updated[adjustedIndex] = value as string;
      });

      return updated;
    });

    removeSlide(targetCard.id);
    setCurrentSlide(nextIndex);
    toast({
      title: 'Slide deleted',
      description: 'The slide and its contents have been removed from your presentation.',
    });
  }, [
    currentSlide,
    exhibitedCards,
    handleStopSlideshow,
    isSlideshowActive,
    removeSlide,
    setNotes,
    toast,
  ]);

  const handleOperationsPalettePanelChange = useCallback((panel: ReactNode | null) => {
    if (panel) {
      setOperationsPanelState({ type: 'custom', node: panel });
      return;
    }

    setOperationsPanelState(prev => {
      if (
        prev?.type === 'notes' ||
        prev?.type === 'shapes' ||
        prev?.type === 'images' ||
        prev?.type === 'themes'
      ) {
        return prev;
      }
      return null;
    });
  }, []);

  const handleShowNotesPanel = useCallback(() => {
    setOperationsPanelState({ type: 'notes' });
  }, []);

  const handleCloseNotesPanel = useCallback(() => {
    setOperationsPanelState(null);
  }, []);

  const handleOpenShapesPanel = useCallback(() => {
    setOperationsPanelState(prev => (prev?.type === 'shapes' ? null : { type: 'shapes' }));
  }, []);

  const handleCloseShapesPanel = useCallback(() => {
    setOperationsPanelState(null);
  }, []);

  const handleOpenChartsPanel = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setOperationsPanelState(prev => (prev?.type === 'charts' ? null : { type: 'charts' }));
  }, [canEdit]);

  const handleCloseChartsPanel = useCallback(() => {
    setOperationsPanelState(prev => (prev?.type === 'charts' ? null : prev));
  }, []);

  const handleOpenImagesPanel = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const targetCard = exhibitedCards[currentSlide];
    if (!targetCard) {
      return;
    }

    setOperationsPanelState(prev => (prev?.type === 'images' ? null : { type: 'images' }));
  }, [canEdit, currentSlide, exhibitedCards]);

  const handleCloseImagesPanel = useCallback(() => {
    setOperationsPanelState(prev => (prev?.type === 'images' ? null : prev));
  }, []);

  const handleOpenThemesPanel = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setOperationsPanelState(prev => (prev?.type === 'themes' ? null : { type: 'themes' }));
  }, [canEdit]);

  const handleCloseThemesPanel = useCallback(() => {
    setOperationsPanelState(prev => (prev?.type === 'themes' ? null : prev));
  }, []);

  const handleImagePanelSelect = useCallback(
    (selections: ImageSelectionRequest[]) => {
      if (!canEdit || selections.length === 0) {
        return;
      }

      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        return;
      }

      const slideObjects = slideObjectsByCardId[targetCard.id] ?? [];
      const nextZIndex = slideObjects.reduce((max, object) => {
        const value = typeof object.zIndex === 'number' ? object.zIndex : 1;
        return value > max ? value : max;
      }, 1);

      const baseZIndex = nextZIndex + 1;

      selections.forEach((selection, index) => {
        const imageObject = createImageSlideObject(
          generateImageObjectId(),
          selection.imageUrl,
          {
            name: selection.metadata.title ?? null,
            source: selection.metadata.source,
          },
          {
            zIndex: baseZIndex + index,
          },
        );

        if (index > 0) {
          imageObject.x += 28 * index;
          imageObject.y += 28 * index;
        }

        addSlideObject(targetCard.id, imageObject);
      });

      setOperationsPanelState(prev => (prev?.type === 'images' ? null : prev));
    },
    [
      addSlideObject,
      canEdit,
      currentSlide,
      exhibitedCards,
      generateImageObjectId,
      slideObjectsByCardId,
    ],
  );

  const handleRemoveAccentImage = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const targetCard = exhibitedCards[currentSlide];
    if (!targetCard) {
      return;
    }

    const merged: PresentationSettings = {
      ...DEFAULT_PRESENTATION_SETTINGS,
      ...targetCard.presentationSettings,
      accentImage: null,
      accentImageName: null,
    };

    handlePresentationChange(merged, targetCard.id);
  }, [canEdit, currentSlide, exhibitedCards, handlePresentationChange]);

  const handleToggleViewMode = useCallback(() => {
    if (isSlideshowActive) {
      handleStopSlideshow();
    }
    setViewMode(prev => (prev === 'horizontal' ? 'vertical' : 'horizontal'));
  }, [handleStopSlideshow, isSlideshowActive]);

  useEffect(() => {
    if (viewMode !== 'vertical') {
      return;
    }

    const activeCard = exhibitedCards[currentSlide];
    if (!activeCard) {
      return;
    }

    const element = verticalSlideRefs.current[activeCard.id];
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentSlide, exhibitedCards, viewMode]);

  useEffect(() => {
    if (canEdit) {
      return;
    }

    setOperationsPanelState(prev => (prev?.type === 'shapes' || prev?.type === 'images' ? null : prev));
  }, [canEdit]);

  const hasSlides = exhibitedCards.length > 0;
  const disableDownload = exhibitedCards.length === 0;

  const renderHeaderSection = () => (
    <div className="bg-white/80 backdrop-blur-sm border-b border-border/60 px-6 py-6 flex-shrink-0 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-light text-foreground mb-1">Exhibition Mode</h2>
          <p className="text-muted-foreground font-light">
            Transform laboratory insights into presentation-ready stories.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-exhibition-toolbar="true">
          <Button
            variant="outline"
            size="sm"
            className="border-border text-foreground/80 font-medium"
            onClick={handleUndo}
            disabled={!canEdit || !undoAvailable}
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border text-foreground/80 font-medium"
            onClick={handleSave}
            disabled={!canEdit || isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-border text-foreground/80 font-medium"
            onClick={handleShare}
            disabled={!hasSlides}
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 text-white font-medium hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            onClick={() => setIsExportOpen(true)}
            disabled={disableDownload}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    </div>
  );

  const currentCard = exhibitedCards[currentSlide] ?? null;
  const currentPresentationSettings: PresentationSettings = {
    ...DEFAULT_PRESENTATION_SETTINGS,
    ...currentCard?.presentationSettings,
  };

  const transitionFrames = presentationTransition
    ? getTransitionFrames(presentationTransition.transition, presentationTransition.direction)
    : null;

  const outgoingCard =
    presentationTransition && presentationTransition.fromIndex >= 0
      ? exhibitedCards[presentationTransition.fromIndex] ?? null
      : null;

  const incomingCard =
    presentationTransition && presentationTransition.toIndex >= 0
      ? exhibitedCards[presentationTransition.toIndex] ?? null
      : null;

  const renderPresentationSlide = (card: LayoutCard, index: number, keySuffix: string) => (
    <SlideCanvas
      key={`${card.id}-${keySuffix}`}
      card={card}
      slideNumber={index + 1}
      totalSlides={exhibitedCards.length}
      onDrop={handleDrop}
      canEdit={false}
      onPresentationChange={handlePresentationChange}
      onRemoveAtom={handleRemoveAtom}
      onTitleChange={handleTitleChange}
      presenterName={presenterDisplayName}
      viewMode="horizontal"
      presentationMode
    />
  );

  const handleCreateTextBox = useCallback(() => {
    const targetCard = exhibitedCards[currentSlide];
    if (!targetCard) {
      return;
    }

    const existingObjects = slideObjectsByCardId[targetCard.id] ?? [];
    const existingTextBoxes = existingObjects.filter(object => object.type === 'text-box').length;
    const offset = existingTextBoxes * 32;

    addSlideObject(
      targetCard.id,
      createTextBoxSlideObject(generateTextBoxId(), {
        x: 120 + offset,
        y: 120 + offset,
      }),
    );
  }, [addSlideObject, currentSlide, exhibitedCards, generateTextBoxId, slideObjectsByCardId]);

  const handleCreateTable = useCallback(() => {
    const targetCard = exhibitedCards[currentSlide];
    if (!targetCard) {
      return;
    }

    const existingObjects = slideObjectsByCardId[targetCard.id] ?? [];
    const existingTables = existingObjects.filter(object => object.type === 'table').length;
    const offset = existingTables * 32;

    addSlideObject(
      targetCard.id,
      createTableSlideObject(generateTableId(), {
        x: 144 + offset,
        y: 144 + offset,
      }),
    );
  }, [addSlideObject, currentSlide, exhibitedCards, generateTableId, slideObjectsByCardId]);

  const handleCreateChart = useCallback(
    (result: ChartPanelResult) => {
      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        return;
      }

      const existingObjects = slideObjectsByCardId[targetCard.id] ?? [];
      const existingCharts = existingObjects.filter(object => object.type === 'chart').length;
      const offset = existingCharts * 32;

      addSlideObject(
        targetCard.id,
        createChartSlideObject(
          generateChartId(),
          {
            x: 160 + offset,
            y: 160 + offset,
          },
          {
            data: result.data,
            config: result.config,
          },
        ),
      );
    },
    [addSlideObject, currentSlide, exhibitedCards, generateChartId, slideObjectsByCardId],
  );

  const handleShapeSelect = useCallback(
    (shape: ShapeDefinition) => {
      if (!canEdit) {
        return;
      }

      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        return;
      }

      const existingObjects = slideObjectsByCardId[targetCard.id] ?? [];
      const existingShapes = existingObjects.filter(object => object.type === 'shape').length;
      const offset = existingShapes * 28;

      addSlideObject(
        targetCard.id,
        createShapeSlideObject(generateShapeId(), shape, {
          x: 160 + offset,
          y: 160 + offset,
        }),
      );
    },
    [
      addSlideObject,
      canEdit,
      currentSlide,
      exhibitedCards,
      generateShapeId,
      slideObjectsByCardId,
    ],
  );

  const operationsPalettePanel = useMemo(() => {
    if (!operationsPanelState) {
      return null;
    }

    if (operationsPanelState.type === 'notes') {
      return (
        <SlideNotes
          currentSlide={currentSlide}
          notes={notes}
          onNotesChange={handleNotesChange}
          onClose={handleCloseNotesPanel}
        />
      );
    }

    if (operationsPanelState.type === 'shapes') {
      return (
        <ShapesPanel
          onSelectShape={handleShapeSelect}
          onClose={handleCloseShapesPanel}
          canEdit={canEdit}
        />
      );
    }

    if (operationsPanelState.type === 'images') {
      return (
        <ImagePanel
          currentImage={currentPresentationSettings.accentImage ?? null}
          currentImageName={currentPresentationSettings.accentImageName ?? null}
          onClose={handleCloseImagesPanel}
          onImageSelect={handleImagePanelSelect}
          onRemoveImage={
            currentPresentationSettings.accentImage ? handleRemoveAccentImage : undefined
          }
          canEdit={canEdit}
        />
      );
    }

    if (operationsPanelState.type === 'themes') {
      return <ThemesPanel onClose={handleCloseThemesPanel} />;
    }

    if (operationsPanelState.type === 'charts') {
      return (
        <ChartPanel
          onClose={handleCloseChartsPanel}
          onInsert={result => {
            setChartPanelData(result.data);
            setChartPanelConfig(result.config);
            handleCreateChart(result);
            setOperationsPanelState(null);
          }}
          initialData={chartPanelData}
          initialConfig={chartPanelConfig}
          onStateChange={({ data, config }) => {
            setChartPanelData(data);
            setChartPanelConfig(config);
          }}
        />
      );
    }

    return operationsPanelState.node;
  }, [
    canEdit,
    currentSlide,
    handleCloseNotesPanel,
    handleCloseShapesPanel,
    handleCloseChartsPanel,
    handleCloseImagesPanel,
    handleCloseThemesPanel,
    handleImagePanelSelect,
    handleNotesChange,
    handleShapeSelect,
    handleRemoveAccentImage,
    handleCreateChart,
    currentPresentationSettings.accentImage,
    currentPresentationSettings.accentImageName,
    notes,
    chartPanelData,
    chartPanelConfig,
    operationsPanelState,
  ]);
  const emptyCanvas = (
    <div className="flex-1 flex items-center justify-center bg-muted/10">
      <div className="max-w-md text-center space-y-3 px-6">
        <h3 className="text-2xl font-semibold text-foreground">Create your first slide</h3>
        <p className="text-muted-foreground">
          Use the <span className="font-medium text-foreground">+</span> button below to create a slide, then drag exhibited
          components from the catalogue to start building your presentation.
        </p>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-background transition-all duration-300',
        isPresentationView ? 'fixed inset-0 z-50' : 'h-screen'
      )}
    >
      {!isPresentationView && <Header />}
      {!isPresentationView && renderHeaderSection()}

      <div className="flex-1 flex overflow-hidden">
        {!isPresentationView && (
          <div className="flex h-full flex-shrink-0">
            <div className="bg-background border-r border-border transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
              <div className="p-3 border-b border-border flex items-center justify-center">
                {isCatalogueCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setIsCatalogueCollapsed(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Expand catalogue"
                    aria-label="Expand catalogue"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <div
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground"
                    aria-hidden="true"
                  >
                    <FileText className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="p-3 border-b border-border flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowGridView(false);
                    setShowThumbnails(current => !current);
                  }}
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted',
                    showThumbnails ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  title="Open slides view"
                  aria-label="Open slides view"
                  data-exhibition-slides-toggle="true"
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!isCatalogueCollapsed && !showThumbnails && (
              <ExhibitionCatalogue
                cards={catalogueCards}
                currentSlide={currentSlide}
                onSlideSelect={handleSlideSelection}
                slideIndexByCardId={slideIndexByCardId}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                enableDragging={canEdit}
                onCollapse={() => setIsCatalogueCollapsed(true)}
              />
            )}

            {showThumbnails && (
              <SlideThumbnails
                cards={exhibitedCards}
                currentSlide={currentSlide}
                onSlideSelect={index => {
                  handleSlideSelection(index);
                  setShowThumbnails(false);
                }}
                onClose={() => setShowThumbnails(false)}
              />
            )}
          </div>
        )}

        <div
          className={cn(
            'flex-1 flex flex-col overflow-hidden bg-background',
            isPresentationView && 'bg-neutral-950',
          )}
        >
          {viewMode === 'horizontal' ? (
            <div className={cn('flex-1 flex flex-col', isSlideshowActive && 'justify-center')}>
              {currentCard ? (
                isPresentationView ? (
                  <div className="relative flex-1">
                    {presentationTransition && transitionFrames && outgoingCard && incomingCard ? (
                      <>
                        <div
                          style={{
                            ...TRANSITION_LAYER_BASE_STYLE,
                            ...(presentationTransition.phase === 'prepare'
                              ? transitionFrames.outgoing.initial
                              : transitionFrames.outgoing.final),
                            zIndex: 2,
                          }}
                        >
                          {renderPresentationSlide(
                            outgoingCard,
                            presentationTransition.fromIndex,
                            'outgoing',
                          )}
                        </div>
                        <div
                          style={{
                            ...TRANSITION_LAYER_BASE_STYLE,
                            ...(presentationTransition.phase === 'prepare'
                              ? transitionFrames.incoming.initial
                              : transitionFrames.incoming.final),
                            zIndex: 3,
                          }}
                        >
                          {renderPresentationSlide(
                            incomingCard,
                            presentationTransition.toIndex,
                            'incoming',
                          )}
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          ...TRANSITION_LAYER_BASE_STYLE,
                          transition: 'none',
                          zIndex: 1,
                        }}
                      >
                        {renderPresentationSlide(currentCard, currentSlide, 'active')}
                      </div>
                    )}
                  </div>
                ) : (
                  <SlideCanvas
                    card={currentCard}
                    slideNumber={currentSlide + 1}
                    totalSlides={exhibitedCards.length}
                    onDrop={handleDrop}
                    draggedAtom={draggedAtom}
                    canEdit={canEdit && !isPresentationView}
                    onPresentationChange={handlePresentationChange}
                    onRemoveAtom={handleRemoveAtom}
                    onShowNotes={handleShowNotesPanel}
                    viewMode="horizontal"
                    isActive
                    onTitleChange={handleTitleChange}
                    presenterName={presenterDisplayName}
                    onPositionPanelChange={handleOperationsPalettePanelChange}
                    onUndo={handleUndo}
                    presentationMode={isPresentationView}
                  />
                )
              ) : (
                emptyCanvas
              )}
            </div>
          ) : exhibitedCards.length > 0 ? (
            <div className="flex-1 overflow-y-auto bg-muted/10 px-6 py-6 space-y-6">
              {exhibitedCards.map((card, index) => (
                <div
                  key={card.id}
                  ref={element => {
                    verticalSlideRefs.current[card.id] = element;
                  }}
                >
                  <SlideCanvas
                    card={card}
                    slideNumber={index + 1}
                    totalSlides={exhibitedCards.length}
                    onDrop={handleDrop}
                    draggedAtom={draggedAtom}
                    canEdit={canEdit}
                    onPresentationChange={handlePresentationChange}
                    onRemoveAtom={handleRemoveAtom}
                    onShowNotes={handleShowNotesPanel}
                    viewMode="vertical"
                    isActive={currentSlide === index}
                    onTitleChange={handleTitleChange}
                    presenterName={presenterDisplayName}
                    onPositionPanelChange={handleOperationsPalettePanelChange}
                    onUndo={handleUndo}
                  />
                </div>
              ))}
            </div>
          ) : (
            emptyCanvas
          )}
        </div>

        {!isPresentationView && (
          <OperationsPalette
            onExport={() => setIsExportOpen(true)}
            onGridView={() => setShowGridView(true)}
            onCreateTextBox={handleCreateTextBox}
            onCreateTable={handleCreateTable}
            onOpenShapesPanel={handleOpenShapesPanel}
            onOpenImagesPanel={handleOpenImagesPanel}
            onOpenChartPanel={handleOpenChartsPanel}
            onOpenThemesPanel={handleOpenThemesPanel}
            canEdit={canEdit}
            positionPanel={operationsPalettePanel}
          />
        )}
      </div>

      <SlideNavigation
        currentSlide={currentSlide}
        totalSlides={exhibitedCards.length}
        onPrevious={() => goToSlide(currentSlide - 1, 'backward')}
        onNext={() => goToSlide(currentSlide + 1, 'forward')}
        onGridView={() => {
          if (isSlideshowActive) {
            handleStopSlideshow();
          }
          setShowGridView(true);
        }}
        onExport={() => {
          if (isSlideshowActive) {
            handleStopSlideshow();
          }
          setIsExportOpen(true);
        }}
        onAddSlide={handleAddSlide}
        onToggleViewMode={handleToggleViewMode}
        viewMode={viewMode}
        canEdit={canEdit}
        onDeleteSlide={handleDeleteSlide}
        onSlideshowStart={handleStartSlideshow}
        onSlideshowStop={handleStopSlideshow}
        isSlideshowActive={isSlideshowActive}
        slideshowSettings={{
          slideshowDuration: currentPresentationSettings.slideshowDuration,
          slideshowTransition: currentPresentationSettings.slideshowTransition,
        }}
        onSlideshowSettingsChange={handleSlideshowSettingsChange}
      />

      {showGridView && (
        <GridView
          cards={exhibitedCards}
          currentSlide={currentSlide}
          onSlideSelect={index => {
            handleSlideSelection(index);
            setShowGridView(false);
          }}
          onClose={() => setShowGridView(false)}
        />
      )}

      <ExportDialog
        open={isExportOpen}
        onOpenChange={setIsExportOpen}
        totalSlides={exhibitedCards.length}
      />
    </div>
  );
};

export default ExhibitionMode;
