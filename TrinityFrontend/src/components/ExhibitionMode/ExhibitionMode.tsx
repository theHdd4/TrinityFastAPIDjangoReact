import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileText, Grid3x3, Presentation, Save, Share2, Undo2 } from 'lucide-react';
import Header from '@/components/Header';
import { useExhibitionStore } from './store/exhibitionStore';
import type { DroppedAtom, PresentationSettings, LayoutCard } from './store/exhibitionStore';
import { ExhibitionCatalogue } from './components/ExhibitionCatalogue';
import { SlideCanvas } from './components/SlideCanvas';
import { OperationsPalette } from './components/OperationsPalette';
import { SlideNavigation } from './components/SlideNavigation';
import { SlideThumbnails } from './components/SlideThumbnails';
import { SlideNotes } from './components/SlideNotes';
import { GridView } from './components/GridView';
import { ExportDialog } from './components/ExportDialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { saveExhibitionConfiguration } from '@/lib/exhibition';
import { getActiveProjectContext } from '@/utils/projectEnv';

const NOTES_STORAGE_KEY = 'exhibition-notes';

const ExhibitionMode = () => {
  const { exhibitedCards, cards, loadSavedConfiguration, updateCard, addBlankSlide, setCards } =
    useExhibitionStore();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('exhibition:edit');

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedAtom, setDraggedAtom] = useState<
    { atom: DroppedAtom; cardId: string; origin: 'catalogue' | 'slide' }
    | null
  >(null);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'horizontal' | 'vertical'>('horizontal');
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const verticalSlideRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const undoStackRef = useRef<LayoutCard[][]>([]);
  const isRestoringSnapshotRef = useRef(false);
  const lastSerializedCardsRef = useRef<string | null>(null);

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
    if (cards.length === 0) {
      void loadSavedConfiguration();
    }
  }, [cards.length, loadSavedConfiguration]);

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
    const handleKeyPress = (e: KeyboardEvent) => {
      if (exhibitedCards.length === 0) return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
          setCurrentSlide(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ': {
          e.preventDefault();
          setCurrentSlide(prev => Math.min(exhibitedCards.length - 1, prev + 1));
          break;
        }
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false);
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
  }, [exhibitedCards.length, isFullscreen]);

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
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

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
      window.localStorage.setItem('laboratory-layout-cards', JSON.stringify(payloadCards));
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
      await saveExhibitionConfiguration({
        client_name: context.client_name,
        app_name: context.app_name,
        project_name: context.project_name,
        cards: cardsToPersist,
      });
      persistCardsLocally(cardsToPersist);
      toast({ title: 'Exhibition saved', description: 'Your exhibition updates have been saved.' });
    } catch (error) {
      console.error('Failed to save exhibition configuration', error);
      toast({
        title: 'Save failed',
        description:
          error instanceof Error ? error.message : 'Unable to save your exhibition configuration right now.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [canEdit, cards, isSaving, persistCardsLocally, toast]);

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

  const handleDrop = useCallback(
    (
      atom: DroppedAtom,
      sourceCardId: string,
      targetCardId: string,
      origin: 'catalogue' | 'slide' = 'catalogue',
    ) => {
      const sourceCard = cards.find(card => card.id === sourceCardId);
      const destinationCard = cards.find(card => card.id === targetCardId);

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

      const destinationAtoms = [...destinationCard.atoms, atom];

      updateCard(destinationCard.id, { atoms: destinationAtoms });

      if (origin === 'slide' && sourceCard.id !== destinationCard.id) {
        const sourceAtoms = sourceCard.atoms.filter(a => a.id !== atom.id);
        updateCard(sourceCard.id, { atoms: sourceAtoms });
      }

      const targetIndex = exhibitedCards.findIndex(card => card.id === destinationCard.id);
      if (targetIndex !== -1) {
        toast({
          title: 'Component added',
          description: `${atom.title} moved to slide ${targetIndex + 1}.`,
        });
        setCurrentSlide(targetIndex);
      } else {
        toast({
          title: 'Component added',
          description: `${atom.title} moved to a slide.`,
        });
      }

      setDraggedAtom(null);
    },
    [cards, exhibitedCards, toast, updateCard]
  );

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
      toast({
        title: 'Component removed',
        description: 'The component has been removed from this slide.',
      });
    },
    [cards, currentSlide, exhibitedCards, toast, updateCard]
  );

  const handleNotesChange = (slideIndex: number, value: string) => {
    setNotes(prev => {
      const next = { ...prev };
      if (!value.trim()) {
        delete next[slideIndex];
      } else {
        next[slideIndex] = value;
      }
      return next;
    });
  };

  const handleAddSlide = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const created = addBlankSlide(exhibitedCards.length > 0 ? currentSlide : undefined);
    if (!created) {
      return;
    }

    const nextCards = useExhibitionStore.getState().exhibitedCards;
    const newIndex = nextCards.findIndex(card => card.id === created.id);
    if (newIndex !== -1) {
      setCurrentSlide(newIndex);
    }

    toast({
      title: 'Blank slide added',
      description: 'A new slide has been added to your presentation.',
    });
  }, [addBlankSlide, canEdit, currentSlide, exhibitedCards.length, toast]);

  const handleToggleViewMode = useCallback(() => {
    setViewMode(prev => (prev === 'horizontal' ? 'vertical' : 'horizontal'));
  }, []);

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

  if (exhibitedCards.length === 0) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <Header />
        {renderHeaderSection()}

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6 mx-auto">
              <Presentation className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold text-foreground mb-3">No Slides to Present</h3>
            <p className="text-muted-foreground mb-6">
              Go to Laboratory mode and toggle "Exhibit the Card" on the cards you want to display here, then click Save.
            </p>
            <div className="p-4 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm text-muted-foreground">
                💡 Exhibition mode transforms your cards into professional presentation slides
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentCard = exhibitedCards[currentSlide];

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

      <div className="flex-1 flex overflow-hidden relative">
        {!isFullscreen && (
          isCatalogueOpen ? (
            <ExhibitionCatalogue
              cards={exhibitedCards}
              currentSlide={currentSlide}
              onSlideSelect={setCurrentSlide}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              enableDragging={canEdit}
              onCollapse={() => setIsCatalogueOpen(false)}
            />
          ) : (
            <div className="bg-background border-r border-border transition-all duration-300 flex flex-col h-full w-12">
              <div className="p-3 border-b border-border flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsCatalogueOpen(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  title="Open exhibition catalogue"
                  aria-label="Open exhibition catalogue"
                  data-exhibition-catalogue-toggle="true"
                >
                  <FileText className="h-4 w-4" />
                </button>
              </div>
              <div className="p-3 border-b border-border flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowGridView(false);
                    setShowThumbnails(true);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  title="Open slides view"
                  aria-label="Open slides view"
                  data-exhibition-slides-toggle="true"
                >
                  <Grid3x3 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'horizontal' ? (
            <SlideCanvas
              card={currentCard}
              slideNumber={currentSlide + 1}
              totalSlides={exhibitedCards.length}
              onDrop={handleDrop}
              draggedAtom={draggedAtom}
              canEdit={canEdit}
              onPresentationChange={handlePresentationChange}
              onRemoveAtom={handleRemoveAtom}
              viewMode="horizontal"
              isActive
            />
          ) : (
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
                    viewMode="vertical"
                    isActive={currentSlide === index}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {!isFullscreen && (
          <OperationsPalette
            onFullscreen={toggleFullscreen}
            onShowNotes={() => setShowNotes(true)}
            onShowThumbnails={() => setShowThumbnails(true)}
            onExport={() => setIsExportOpen(true)}
            onGridView={() => setShowGridView(true)}
          />
        )}

        {showThumbnails && (
          <SlideThumbnails
            cards={exhibitedCards}
            currentSlide={currentSlide}
            onSlideSelect={index => {
              setCurrentSlide(index);
              setShowThumbnails(false);
            }}
            onClose={() => setShowThumbnails(false)}
          />
        )}
      </div>

      {exhibitedCards.length > 0 && (
        <SlideNavigation
          currentSlide={currentSlide}
          totalSlides={exhibitedCards.length}
          onPrevious={() => setCurrentSlide(prev => Math.max(0, prev - 1))}
          onNext={() => setCurrentSlide(prev => Math.min(exhibitedCards.length - 1, prev + 1))}
          onGridView={() => setShowGridView(true)}
          onFullscreen={toggleFullscreen}
          onExport={() => setIsExportOpen(true)}
          isFullscreen={isFullscreen}
          onAddSlide={handleAddSlide}
          onToggleViewMode={handleToggleViewMode}
          viewMode={viewMode}
          canEdit={canEdit}
        />
      )}

      {showNotes && (
        <SlideNotes
          currentSlide={currentSlide}
          notes={notes}
          onNotesChange={handleNotesChange}
          onClose={() => setShowNotes(false)}
        />
      )}

      {showGridView && (
        <GridView
          cards={exhibitedCards}
          currentSlide={currentSlide}
          onSlideSelect={index => {
            setCurrentSlide(index);
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
