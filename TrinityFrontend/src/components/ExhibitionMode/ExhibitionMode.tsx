import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Presentation } from 'lucide-react';
import Header from '@/components/Header';
import { useExhibitionStore, DroppedAtom, PresentationSettings } from './store/exhibitionStore';
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

const NOTES_STORAGE_KEY = 'exhibition-notes';

const ExhibitionMode = () => {
  const { exhibitedCards, cards, loadSavedConfiguration, updateCard } = useExhibitionStore();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('exhibition:edit');

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggedAtom, setDraggedAtom] = useState<{ atom: DroppedAtom; cardId: string } | null>(null);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
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

  const handleDragStart = (atom: DroppedAtom, cardId: string) => {
    if (!canEdit) return;
    setDraggedAtom({ atom, cardId });
  };

  const handleDragEnd = () => {
    setDraggedAtom(null);
  };

  useEffect(() => {
    setDraggedAtom(null);
  }, [currentSlide]);

  const handleDrop = useCallback(
    (atom: DroppedAtom, sourceCardId: string) => {
      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        setDraggedAtom(null);
        return;
      }

      if (sourceCardId === targetCard.id) {
        setDraggedAtom(null);
        return;
      }

      const sourceCard = cards.find(card => card.id === sourceCardId);
      const destinationCard = cards.find(card => card.id === targetCard.id);

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

      const sourceAtoms = sourceCard.atoms.filter(a => a.id !== atom.id);
      const destinationAtoms = [...destinationCard.atoms, atom];

      updateCard(sourceCard.id, { atoms: sourceAtoms });
      updateCard(destinationCard.id, { atoms: destinationAtoms });
      toast({
        title: 'Component added',
        description: `${atom.title} moved to slide ${currentSlide + 1}.`,
      });
      setDraggedAtom(null);
    },
    [cards, currentSlide, exhibitedCards, toast, updateCard]
  );

  const handlePresentationChange = useCallback(
    (settings: PresentationSettings) => {
      const targetCard = exhibitedCards[currentSlide];
      if (!targetCard) {
        return;
      }
      updateCard(targetCard.id, { presentationSettings: settings });
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

  if (exhibitedCards.length === 0) {
    return (
      <div className="h-screen bg-background flex flex-col">
        <Header />

        <div className="bg-muted/30 border-b border-border px-6 py-6">
          <h2 className="text-3xl font-semibold text-foreground mb-2">Exhibition Mode</h2>
          <p className="text-muted-foreground">Present your laboratory results with PowerPoint-like features</p>
        </div>

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

      <div className="flex-1 flex overflow-hidden">
        {!isFullscreen && (
          <ExhibitionCatalogue
            cards={exhibitedCards}
            currentSlide={currentSlide}
            onSlideSelect={setCurrentSlide}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            enableDragging={canEdit}
          />
        )}

        <SlideCanvas
          card={currentCard}
          slideNumber={currentSlide + 1}
          totalSlides={exhibitedCards.length}
          onDrop={handleDrop}
          draggedAtom={draggedAtom}
          canEdit={canEdit}
          onPresentationChange={handlePresentationChange}
          onRemoveAtom={handleRemoveAtom}
        />

        {!isFullscreen && (
          <OperationsPalette
            onFullscreen={toggleFullscreen}
            onShowNotes={() => setShowNotes(true)}
            onShowThumbnails={() => setShowThumbnails(true)}
            onExport={() => setIsExportOpen(true)}
            onGridView={() => setShowGridView(true)}
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
