import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Presentation,
  StickyNote,
  LayoutGrid,
  PanelLeftClose,
  Sparkles,
} from 'lucide-react';
import Header from '@/components/Header';
import TextBoxDisplay from '@/components/AtomList/atoms/text-box/TextBoxDisplay';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  ExhibitionCatalogue,
  ExportDialog,
  GridView,
  OperationsPalette,
  SlideCanvas,
  SlideNavigation,
  SlideNotes,
  SlideThumbnails,
} from './components';
import type { DroppedAtom, LayoutCard } from './components';
import { useExhibitionStore } from './store/exhibitionStore';

const NOTES_STORAGE_KEY = 'exhibition-mode-notes';

const ExhibitionMode = () => {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('exhibition:edit');

  const { cards, exhibitedCards, loadSavedConfiguration, setCards } = useExhibitionStore(
    (state) => ({
      cards: state.cards,
      exhibitedCards: state.exhibitedCards,
      loadSavedConfiguration: state.loadSavedConfiguration,
      setCards: state.setCards,
    })
  );

  const [currentSlide, setCurrentSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [draggedAtom, setDraggedAtom] = useState<{ atom: DroppedAtom; fromCardId: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasRequestedInitialLoad = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(NOTES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setNotes(parsed);
        }
      }
    } catch (error) {
      console.warn('Failed to load exhibition notes from storage', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch (error) {
      console.warn('Failed to persist exhibition notes', error);
    }
  }, [notes]);

  useEffect(() => {
    if (localStorage.getItem('laboratory-config')) {
      toast({ title: 'Successfully Loaded Existing Project State' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasRequestedInitialLoad.current) {
      hasRequestedInitialLoad.current = true;
      loadSavedConfiguration();
    }
  }, [loadSavedConfiguration]);

  useEffect(() => {
    setCurrentSlide((previous) => {
      if (exhibitedCards.length === 0) {
        return previous === 0 ? previous : 0;
      }

      if (previous >= exhibitedCards.length) {
        return exhibitedCards.length - 1;
      }

      return previous;
    });
  }, [exhibitedCards.length]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (typeof document === 'undefined') return;
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('fullscreenchange', handleFullscreenChange);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      }
    };
  }, []);

  useEffect(() => {
    const handleDragEnd = () => setDraggedAtom(null);
    if (typeof window !== 'undefined') {
      window.addEventListener('dragend', handleDragEnd);
      return () => {
        window.removeEventListener('dragend', handleDragEnd);
      };
    }
    return undefined;
  }, []);

  const slides = useMemo(() => exhibitedCards, [exhibitedCards]);
  const activeCard = slides[currentSlide];

  const handleSlideSelect = useCallback(
    (index: number) => {
      setCurrentSlide(index);
    },
    []
  );

  const handlePrevious = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
  }, [slides.length]);

  const handleNotesChange = useCallback((slideIndex: number, value: string) => {
    setNotes((prev) => ({ ...prev, [slideIndex]: value }));
  }, []);

  const handleAtomDragStart = useCallback(
    (atom: DroppedAtom, cardId: string) => {
      if (!canEdit) {
        toast({
          title: 'Read-only exhibition mode',
          description: 'You do not have permission to rearrange exhibition slides.',
        });
        return;
      }
      setDraggedAtom({ atom, fromCardId: cardId });
    },
    [canEdit, toast]
  );

  const handleDropToCard = useCallback(
    (targetCardId: string) => {
      if (!draggedAtom) return;
      if (!canEdit) {
        toast({
          title: 'Read-only exhibition mode',
          description: 'Request edit access to rearrange slides.',
          variant: 'destructive',
        });
        setDraggedAtom(null);
        return;
      }

      if (draggedAtom.fromCardId === targetCardId) {
        setDraggedAtom(null);
        return;
      }

      const updatedCards: LayoutCard[] = cards.map((card) => {
        if (card.id === draggedAtom.fromCardId) {
          return {
            ...card,
            atoms: card.atoms.filter((atom) => atom.id !== draggedAtom.atom.id),
          };
        }
        if (card.id === targetCardId) {
          const alreadyExists = card.atoms.some((atom) => atom.id === draggedAtom.atom.id);
          return {
            ...card,
            atoms: alreadyExists ? card.atoms : [...card.atoms, draggedAtom.atom],
          };
        }
        return card;
      });

      setCards(updatedCards);
      setDraggedAtom(null);
      toast({
        title: 'Component moved',
        description: 'The slide content has been updated for exhibition.',
      });
    },
    [cards, canEdit, draggedAtom, setCards, toast]
  );

  const handleFullscreenToggle = useCallback(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!document.fullscreenElement) {
      root
        .requestFullscreen?.()
        .catch(() => setIsFullscreen((prev) => !prev));
    } else {
      document.exitFullscreen?.().catch(() => setIsFullscreen((prev) => !prev));
    }
  }, []);

  const renderAtomContent = useCallback(
    (atom: DroppedAtom) => {
      if (atom.atomId === 'text-box') {
        return <TextBoxDisplay textId={atom.id} />;
      }
      return (
        <p className="text-xs text-muted-foreground italic">
          This component type is not yet supported in exhibition view.
        </p>
      );
    },
    []
  );

  return (
    <div className={cn('h-screen bg-background flex flex-col', isFullscreen && 'bg-black')}>
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {slides.length > 0 ? (
          <ExhibitionCatalogue
            cards={slides}
            currentSlide={currentSlide}
            onSlideSelect={handleSlideSelect}
            onDragStart={handleAtomDragStart}
            disabled={!canEdit}
          />
        ) : (
          <div className="w-64 bg-background border-r border-border flex items-center justify-center">
            <div className="text-center px-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 mx-auto">
                <Presentation className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No slides available</h3>
              <p className="text-sm text-muted-foreground">
                Toggle cards for exhibition in Laboratory mode to build your presentation.
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-background/80 backdrop-blur-sm border-b border-border px-8 py-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-3xl font-semibold text-foreground leading-tight">Exhibition Mode</h2>
                  <p className="text-sm text-muted-foreground">
                    Present curated laboratory results with immersive storytelling.
                  </p>
                </div>
              </div>
              {slides.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Showing slide {currentSlide + 1} of {slides.length} with {activeCard?.atoms.length ?? 0}{' '}
                  {activeCard?.atoms.length === 1 ? 'component' : 'components'}.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowThumbnails((prev) => !prev)}
                disabled={slides.length === 0}
              >
                <PanelLeftClose className="h-4 w-4 mr-2" />
                Slides Panel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNotes((prev) => !prev)}
                disabled={slides.length === 0}
              >
                <StickyNote className="h-4 w-4 mr-2" />
                Speaker Notes
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGridView(true)}
                disabled={slides.length === 0}
              >
                <LayoutGrid className="h-4 w-4 mr-2" />
                Grid View
              </Button>
              <Button variant="default" size="sm" onClick={() => setShowExportDialog(true)} disabled={slides.length === 0}>
                Export
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden bg-muted/10">
            {activeCard ? (
              <SlideCanvas
                card={activeCard}
                slideNumber={currentSlide + 1}
                totalSlides={slides.length}
                onDrop={() => handleDropToCard(activeCard.id)}
                renderAtomContent={renderAtomContent}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-center p-12">
                <div>
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                    <Presentation className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-2xl font-semibold text-foreground mb-2">No cards to exhibit</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Go to Laboratory mode and toggle "Exhibit the Card" on the cards you want to display here, then click Save.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <OperationsPalette onFullscreen={handleFullscreenToggle} />
      </div>

      {slides.length > 0 && (
        <SlideNavigation
          currentSlide={currentSlide}
          totalSlides={slides.length}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onGridView={() => setShowGridView(true)}
          onFullscreen={handleFullscreenToggle}
          onExport={() => setShowExportDialog(true)}
          isFullscreen={isFullscreen}
        />
      )}

      {showNotes && slides.length > 0 && (
        <SlideNotes
          currentSlide={currentSlide}
          notes={notes}
          onNotesChange={handleNotesChange}
          onClose={() => setShowNotes(false)}
        />
      )}

      {showThumbnails && slides.length > 0 && (
        <SlideThumbnails
          cards={slides}
          currentSlide={currentSlide}
          onSlideSelect={(index) => {
            handleSlideSelect(index);
            setShowThumbnails(false);
          }}
          onClose={() => setShowThumbnails(false)}
        />
      )}

      {showGridView && slides.length > 0 && (
        <GridView
          cards={slides}
          currentSlide={currentSlide}
          onSlideSelect={(index) => {
            handleSlideSelect(index);
            setShowGridView(false);
          }}
          onClose={() => setShowGridView(false)}
        />
      )}

      <ExportDialog
        open={showExportDialog && slides.length > 0}
        onOpenChange={setShowExportDialog}
        totalSlides={slides.length}
      />
    </div>
  );
};

export default ExhibitionMode;
