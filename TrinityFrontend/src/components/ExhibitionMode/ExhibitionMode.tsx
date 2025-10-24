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
  buildChartRendererPropsFromManifest,
  buildTableDataFromManifest,
  clonePlain,
} from '@/components/AtomList/atoms/feature-overview/utils/exhibitionManifest';

const NOTES_STORAGE_KEY = 'exhibition-notes';
const SLIDESHOW_ANIMATION_MS = 450;
const EXHIBITION_STORAGE_KEY = 'exhibition-layout-cache';
const LAB_STORAGE_KEY = 'laboratory-layout-cards';

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
  const [isFullscreen, setIsFullscreen] = useState(false);
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
    | null
  >(null);
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
  const [slideshowTransform, setSlideshowTransform] = useState('translateX(0px) scale(1)');
  const [slideshowOpacity, setSlideshowOpacity] = useState(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const verticalSlideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const undoStackRef = useRef<LayoutCard[][]>([]);
  const isRestoringSnapshotRef = useRef(false);
  const lastSerializedCardsRef = useRef<string | null>(null);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
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

  const clearAutoAdvanceTimer = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const clearSlideshowTimers = useCallback(() => {
    clearAutoAdvanceTimer();
    clearTransitionTimer();
  }, [clearAutoAdvanceTimer, clearTransitionTimer]);


  const getTransitionStates = useCallback(
    (transition: SlideshowTransition, direction: 'forward' | 'backward') => {
      switch (transition) {
        case 'slide': {
          const exitOffset = direction === 'forward' ? -48 : 48;
          const enterOffset = -exitOffset;
          return {
            exit: { opacity: 0, transform: `translateX(${exitOffset}px) scale(1)` },
            enter: { opacity: 0, transform: `translateX(${enterOffset}px) scale(1)` },
          };
        }
        case 'zoom':
          return {
            exit: { opacity: 0, transform: 'scale(0.96)' },
            enter: { opacity: 0, transform: 'scale(1.04)' },
          };
        case 'fade':
        default:
          return {
            exit: { opacity: 0, transform: 'translateX(0px) scale(1)' },
            enter: { opacity: 0, transform: 'translateX(0px) scale(1)' },
          };
      }
    },
    [],
  );

  const slideIndexByCardId = useMemo(() => {
    const lookup: Record<string, number> = {};
    exhibitedCards.forEach((card, index) => {
      lookup[card.id] = index;
    });
    return lookup;
  }, [exhibitedCards]);

  useEffect(() => {
    if (isFullscreen) {
      setOperationsPanelState(null);
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!canEdit) {
      setOperationsPanelState(null);
    }
  }, [canEdit]);

  const runSlideTransition = useCallback(
    (targetIndex: number, direction: 'forward' | 'backward' = 'forward') => {
      if (targetIndex === currentSlide || targetIndex < 0 || targetIndex >= exhibitedCards.length) {
        return;
      }

      const nextCard = exhibitedCards[targetIndex];
      const transitionType =
        nextCard?.presentationSettings?.slideshowTransition ??
        DEFAULT_PRESENTATION_SETTINGS.slideshowTransition;

      const { exit, enter } = getTransitionStates(transitionType, direction);
      clearSlideshowTimers();
      setSlideshowTransform(exit.transform);
      setSlideshowOpacity(exit.opacity);

      transitionTimerRef.current = window.setTimeout(() => {
        setCurrentSlide(targetIndex);
        setSlideshowTransform(enter.transform);
        setSlideshowOpacity(enter.opacity);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setSlideshowTransform('translateX(0px) scale(1)');
            setSlideshowOpacity(1);
          });
        });

        transitionTimerRef.current = null;
      }, SLIDESHOW_ANIMATION_MS);
    },
    [
      clearSlideshowTimers,
      currentSlide,
      exhibitedCards,
      getTransitionStates,
    ],
  );

  const handleStopSlideshow = useCallback(() => {
    setIsSlideshowActive(false);
    clearSlideshowTimers();
    setSlideshowTransform('translateX(0px) scale(1)');
    setSlideshowOpacity(1);
  }, [clearSlideshowTimers]);

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

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      if (prev && isSlideshowActive) {
        handleStopSlideshow();
      }
      return !prev;
    });
  }, [handleStopSlideshow, isSlideshowActive]);

  const handleStartSlideshow = useCallback(() => {
    if (exhibitedCards.length === 0) {
      return;
    }

    clearSlideshowTimers();
    setSlideshowTransform('translateX(0px) scale(1)');
    setSlideshowOpacity(1);
    setIsSlideshowActive(true);
    setShowThumbnails(false);
    setShowGridView(false);
    setOperationsPanelState(null);

    if (!isFullscreen) {
      setIsFullscreen(true);
    }

    if (viewMode !== 'horizontal') {
      setViewMode('horizontal');
    }
  }, [
    currentSlide,
    exhibitedCards,
    isFullscreen,
    clearSlideshowTimers,
    setShowGridView,
    setShowThumbnails,
    viewMode,
  ]);

  const scheduleAutoAdvance = useCallback(() => {
    if (!isSlideshowActive || exhibitedCards.length <= 1) {
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
    const serialized = JSON.stringify(cards);

    if (isRestoringSnapshotRef.current) {
      isRestoringSnapshotRef.current = false;
      lastSerializedCardsRef.current = serialized;
      return;
    }

    if (lastSerializedCardsRef.current && lastSerializedCardsRef.current !== serialized) {
      const previous = JSON.parse(lastSerializedCardsRef.current) as LayoutCard[];
      undoStackRef.current.push(previous);

      const MAX_UNDO_HISTORY = 20;
      if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
        undoStackRef.current.shift();
      }

      setUndoAvailable(undoStackRef.current.length > 0);
    }

    lastSerializedCardsRef.current = serialized;
  }, [cards]);

  useEffect(() => {
    if (currentSlide >= exhibitedCards.length) {
      setCurrentSlide(exhibitedCards.length > 0 ? exhibitedCards.length - 1 : 0);
    }
  }, [currentSlide, exhibitedCards.length]);

  useEffect(() => {
    if (!isSlideshowActive) {
      setSlideshowTransform('translateX(0px) scale(1)');
      setSlideshowOpacity(1);
    }
  }, [currentSlide, isSlideshowActive]);

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
          if (isFullscreen) {
            setIsFullscreen(false);
          }
          if (isSlideshowActive) {
            handleStopSlideshow();
          }
          break;
        case 'f':
        case 'F':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleFullscreen();
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
    isFullscreen,
    isSlideshowActive,
    handleStopSlideshow,
    toggleFullscreen,
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
    const element = containerRef.current;
    if (!element || typeof element.requestFullscreen !== 'function') {
      return;
    }

    if (isFullscreen) {
      if (!document.fullscreenElement) {
        element.requestFullscreen().catch(() => {
          setIsFullscreen(false);
        });
      }
    } else if (document.fullscreenElement === element && typeof document.exitFullscreen === 'function') {
      document.exitFullscreen().catch(() => {
        /* ignore */
      });
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        handleStopSlideshow();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [handleStopSlideshow]);

  useEffect(() => {
    if (!isFullscreen && isSlideshowActive) {
      handleStopSlideshow();
    }
  }, [handleStopSlideshow, isFullscreen, isSlideshowActive]);

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
    setCards(previous);
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

      const hasManifest =
        component.metadata &&
        typeof component.metadata === 'object' &&
        (component.metadata as Record<string, unknown>)['visualizationManifest'];
      if (hasManifest) {
        return component;
      }

      try {
        const response = await fetchExhibitionManifest({
          client_name: resolvedContext.client_name,
          app_name: resolvedContext.app_name,
          project_name: resolvedContext.project_name,
          component_id: component.id,
        });

        if (response && response.manifest) {
          const manifestClone = clonePlain(response.manifest);
          const nextMetadata: Record<string, any> = {
            ...(component.metadata || {}),
            visualizationManifest: manifestClone,
          };

          if (response.metadata && typeof response.metadata === 'object') {
            Object.entries(response.metadata).forEach(([key, value]) => {
              if (value !== undefined) {
                nextMetadata[key] = value;
              }
            });
          }

          if (response.manifest_id) {
            nextMetadata.manifestId = response.manifest_id;
          }

          const manifestChartProps = buildChartRendererPropsFromManifest(manifestClone);
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

          const manifestTable = buildTableDataFromManifest(manifestClone);
          if (manifestTable && nextMetadata.tableData == null) {
            nextMetadata.tableData = clonePlain(manifestTable);
          }

          if (!nextMetadata.statisticalDetails) {
            const summarySnapshot = manifestClone?.data?.summary
              ? clonePlain(manifestClone.data.summary)
              : undefined;
            const timeseriesSnapshot = Array.isArray(manifestClone?.data?.timeseries)
              ? clonePlain(manifestClone.data.timeseries)
              : undefined;
            const fullSnapshot = manifestClone?.data?.statisticalFull
              ? clonePlain(manifestClone.data.statisticalFull)
              : undefined;

            if (summarySnapshot || timeseriesSnapshot || fullSnapshot) {
              nextMetadata.statisticalDetails = {
                summary: summarySnapshot,
                timeseries: timeseriesSnapshot,
                full: fullSnapshot,
              };
            }
          }

          if (!nextMetadata.skuRow && manifestClone?.data?.skuRow) {
            nextMetadata.skuRow = clonePlain(manifestClone.data.skuRow);
          }

          if (!nextMetadata.featureContext && manifestClone?.featureContext) {
            nextMetadata.featureContext = clonePlain(manifestClone.featureContext);
          }

          if (!nextMetadata.metric && manifestClone?.metric) {
            nextMetadata.metric = manifestClone.metric;
          }

          if (!nextMetadata.label && manifestClone?.label) {
            nextMetadata.label = manifestClone.label;
          }

          if (!nextMetadata.capturedAt && manifestClone?.capturedAt) {
            nextMetadata.capturedAt = manifestClone.capturedAt;
          }

          if (!nextMetadata.chartState && manifestClone?.chart) {
            nextMetadata.chartState = {
              chartType: manifestClone.chart.type,
              theme: manifestClone.chart.theme,
              showDataLabels: manifestClone.chart.showDataLabels,
              showAxisLabels: manifestClone.chart.showAxisLabels,
              showGrid: manifestClone.chart.showGrid,
              showLegend: manifestClone.chart.showLegend,
              xAxisField: manifestClone.chart.xField,
              yAxisField: manifestClone.chart.yField,
              legendField: manifestClone.chart.legendField,
              colorPalette: Array.isArray(manifestClone.chart.colorPalette)
                ? [...manifestClone.chart.colorPalette]
                : manifestClone.chart.colorPalette,
            };
          }

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
      console.log('🔍 ExhibitionMode - handleDrop called with:', { atom, sourceCardId, targetCardId, origin, placement });
      const processDrop = async () => {
        const sourceCard = cards.find(card => card.id === sourceCardId);
        const destinationCard = cards.find(card => card.id === targetCardId);
        console.log('🔍 ExhibitionMode - sourceCard:', sourceCard);
        console.log('🔍 ExhibitionMode - destinationCard:', destinationCard);

        if (!sourceCard || !destinationCard) {
          setDraggedAtom(null);
          return;
        }

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

        if (origin === 'catalogue' && Array.isArray(sourceCard.catalogueAtoms)) {
          const nextCatalogueAtoms = sourceCard.catalogueAtoms.map(existing =>
            existing.id === manifestedAtom.id ? manifestedAtom : existing,
          );
          updateCard(sourceCard.id, { catalogueAtoms: nextCatalogueAtoms });
        }

        if (origin === 'slide' && sourceCard.id !== destinationCard.id) {
          const sourceAtoms = sourceCard.atoms.filter(a => a.id !== atom.id);
          updateCard(sourceCard.id, { atoms: sourceAtoms });
          removeSlideObject(sourceCard.id, atom.id);
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

  const handleOperationsPalettePanelChange = useCallback((panel: ReactNode | null) => {
    if (panel) {
      setOperationsPanelState({ type: 'custom', node: panel });
      return;
    }

    setOperationsPanelState(prev => {
      if (prev?.type === 'notes' || prev?.type === 'shapes') {
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

    setOperationsPanelState(prev => (prev?.type === 'shapes' ? null : prev));
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

    return operationsPanelState.node;
  }, [
    canEdit,
    currentSlide,
    handleCloseNotesPanel,
    handleCloseShapesPanel,
    handleNotesChange,
    handleShapeSelect,
    notes,
    operationsPanelState,
  ]);
  const slideWrapperStyle: React.CSSProperties | undefined = isSlideshowActive
    ? {
        opacity: slideshowOpacity,
        transform: slideshowTransform,
        transition: `opacity ${SLIDESHOW_ANIMATION_MS}ms ease, transform ${SLIDESHOW_ANIMATION_MS}ms ease`,
      }
    : undefined;

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
        isFullscreen ? 'fixed inset-0 z-50' : 'h-screen'
      )}
    >
      {!isFullscreen && <Header />}
      {!isFullscreen && renderHeaderSection()}

      <div className="flex-1 flex overflow-hidden">
        {!isFullscreen && (
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

        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'horizontal' ? (
            <div
              className={cn('flex-1 flex flex-col', isSlideshowActive && 'justify-center')}
              style={slideWrapperStyle}
            >
              {currentCard ? (
                <SlideCanvas
                  card={currentCard}
                  slideNumber={currentSlide + 1}
                  totalSlides={exhibitedCards.length}
                  onDrop={handleDrop}
                  draggedAtom={draggedAtom}
                  canEdit={canEdit}
                  onPresentationChange={handlePresentationChange}
                  onRemoveAtom={handleRemoveAtom}
                  onShowNotes={handleShowNotesPanel}
                  viewMode="horizontal"
                  isActive
                  onTitleChange={handleTitleChange}
                  presenterName={presenterDisplayName}
                  onPositionPanelChange={handleOperationsPalettePanelChange}
                  onUndo={handleUndo}
                />
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

        {!isFullscreen && (
          <OperationsPalette
            onFullscreen={toggleFullscreen}
            onExport={() => setIsExportOpen(true)}
            onGridView={() => setShowGridView(true)}
            onCreateTextBox={handleCreateTextBox}
            onCreateTable={handleCreateTable}
            onOpenShapesPanel={handleOpenShapesPanel}
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
        onFullscreen={toggleFullscreen}
        onExport={() => {
          if (isSlideshowActive) {
            handleStopSlideshow();
          }
          setIsExportOpen(true);
        }}
        isFullscreen={isFullscreen}
        onAddSlide={handleAddSlide}
        onToggleViewMode={handleToggleViewMode}
        viewMode={viewMode}
        canEdit={canEdit}
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
