import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { fetchSharedExhibitionLayout, type ExhibitionLayoutResponse } from '@/lib/exhibition';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { SlideCanvas } from '@/components/ExhibitionMode/components/slideCanvas';
import { Button } from '@/components/ui/button';
import AnimatedLogo from '@/components/PrimaryMenu/TrinityAssets/AnimatedLogo';
import { useIsMobile } from '@/hooks/use-mobile';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

type SharedMetadata = {
  client_name: string;
  app_name: string;
  project_name: string;
  updated_at?: string | null;
};

const SharedExhibition = () => {
  const { token } = useParams<{ token: string }>();
  const setCards = useExhibitionStore(state => state.setCards);
  const resetStore = useExhibitionStore(state => state.reset);
  const exhibitedCards = useExhibitionStore(state => state.exhibitedCards);
  const isMobile = useIsMobile();

  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<SharedMetadata | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  
  // Touch/swipe gesture handling
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const slideContainerRef = useRef<HTMLDivElement | null>(null);

  const handleDrop = useCallback<
    (
      atom: unknown,
      sourceCardId: string,
      targetCardId: string,
      origin: 'catalogue' | 'slide',
      placement: unknown,
    ) => void
  >(() => undefined, []);

  useEffect(() => {
    let cancelled = false;

    const prepareStore = (response: ExhibitionLayoutResponse) => {
      setCards(response.cards, response.slide_objects);
    };

    const loadSharedLayout = async () => {
      if (!token) {
        setStatus('error');
        setError('Share link is missing.');
        resetStore();
        return;
      }

      setStatus('loading');
      setError(null);
      resetStore();

      try {
        const response = await fetchSharedExhibitionLayout(token);
        if (cancelled) {
          return;
        }

        if (!response) {
          setStatus('error');
          setError('The requested exhibition could not be found.');
          resetStore();
          return;
        }

        prepareStore(response);
        setMetadata({
          client_name: response.client_name,
          app_name: response.app_name,
          project_name: response.project_name,
          updated_at: response.updated_at,
        });
        setStatus('ready');
      } catch (err) {
        if (cancelled) {
          return;
        }
        console.error('Failed to load shared exhibition', err);
        setError(err instanceof Error ? err.message : 'Unable to load exhibition.');
        setStatus('error');
        resetStore();
      }
    };

    void loadSharedLayout();

    return () => {
      cancelled = true;
      resetStore();
    };
  }, [resetStore, setCards, token]);

  useEffect(() => {
    if (status !== 'ready') {
      setActiveSlideIndex(0);
    }
  }, [status]);


  useEffect(() => {
    const totalSlides = exhibitedCards.length;
    if (totalSlides === 0) {
      setActiveSlideIndex(0);
      return;
    }

    setActiveSlideIndex(prevIndex => {
      if (prevIndex < totalSlides) {
        return prevIndex;
      }
      return Math.max(0, totalSlides - 1);
    });
  }, [exhibitedCards.length]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const originalTitle = document.title;
    if (status === 'ready' && metadata) {
      const project = metadata.project_name || 'Shared Exhibition';
      document.title = `${project} · Trinity Exhibition`;
    } else {
      document.title = 'Shared Exhibition · Trinity';
    }

    return () => {
      document.title = originalTitle;
    };
  }, [metadata, status]);

  const updatedLabel = useMemo(() => {
    if (!metadata?.updated_at) {
      return null;
    }

    try {
      return new Date(metadata.updated_at).toLocaleString();
    } catch {
      return metadata.updated_at;
    }
  }, [metadata?.updated_at]);

  const headerTitle = metadata?.project_name ?? 'Shared Exhibition';

  const totalSlides = exhibitedCards.length;
  const activeSlide = totalSlides > 0 ? exhibitedCards[Math.min(activeSlideIndex, totalSlides - 1)] : null;

  const handleAdvance = useCallback(
    (direction: 'previous' | 'next') => {
      if (totalSlides <= 1) {
        return;
      }

      setActiveSlideIndex(prevIndex => {
        if (direction === 'previous') {
          return prevIndex <= 0 ? totalSlides - 1 : prevIndex - 1;
        }
        return prevIndex >= totalSlides - 1 ? 0 : prevIndex + 1;
      });
    },
    [totalSlides],
  );

  const handleSelectSlide = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSlides) {
        return;
      }
      setActiveSlideIndex(index);
    },
    [totalSlides],
  );

  // Keyboard navigation
  useEffect(() => {
    if (status !== 'ready' || totalSlides <= 1) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle arrow keys if not typing in an input/textarea
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleAdvance('previous');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleAdvance('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [status, totalSlides, handleAdvance]);

  // Touch/swipe gesture handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // Prevent default scrolling while swiping horizontally
    if (touchStartX.current !== null && touchStartY.current !== null) {
      const deltaX = Math.abs(e.touches[0].clientX - touchStartX.current);
      const deltaY = Math.abs(e.touches[0].clientY - touchStartY.current);
      
      // If horizontal swipe is more prominent than vertical, prevent scroll
      if (deltaX > deltaY && deltaX > 10) {
        e.preventDefault();
      }
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null || totalSlides <= 1) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX.current;
      const deltaY = touchEndY - touchStartY.current;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Only trigger swipe if horizontal movement is greater than vertical and exceeds threshold
      const swipeThreshold = 50;
      if (absDeltaX > absDeltaY && absDeltaX > swipeThreshold) {
        if (deltaX > 0) {
          // Swipe right - go to previous slide
          handleAdvance('previous');
        } else {
          // Swipe left - go to next slide
          handleAdvance('next');
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [totalSlides, handleAdvance],
  );

  const renderContent = () => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-gray-600 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm">Loading exhibition…</p>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="max-w-xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-8 text-center space-y-4">
          <AlertCircle className="h-10 w-10 mx-auto text-red-500" />
          <div>
            <p className="font-semibold text-lg text-gray-900">We couldn't open this exhibition</p>
            <p className="text-sm text-gray-600 mt-2">{error ?? 'Please check the link or request a new one.'}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button variant="default" asChild>
              <Link to="/login">Sign in to Trinity</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Go back home</Link>
            </Button>
          </div>
        </div>
      );
    }

    if (totalSlides === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500 space-y-4">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">This exhibition doesn't contain any published slides yet.</p>
        </div>
      );
    }

    if (!activeSlide) {
      return null;
    }

    return (
      <div className="space-y-4">
        {/* Slide Container */}
        <div
          ref={slideContainerRef}
          className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-gray-200 bg-white shadow-md p-2 sm:p-4 touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <SlideCanvas
            key={activeSlide.id}
            card={activeSlide}
            slideNumber={activeSlideIndex + 1}
            totalSlides={totalSlides}
            onDrop={handleDrop}
            draggedAtom={null}
            canEdit={false}
            viewMode="horizontal"
            isActive
            presentationMode
          />
        </div>

        {/* Mobile: Slide indicators at bottom */}
        {isMobile && totalSlides > 1 && (
          <>
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 px-4">
              {exhibitedCards.map((card, index) => {
                const isActive = index === activeSlideIndex;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleSelectSlide(index)}
                    className={`h-2 w-6 rounded-full transition touch-manipulation ${
                      isActive ? 'bg-gray-900' : 'bg-gray-300 hover:bg-gray-400 active:bg-gray-500'
                    }`}
                    aria-label={`View slide ${index + 1}`}
                    aria-current={isActive}
                  />
                );
              })}
            </div>
            <p className="text-xs text-gray-500 text-center">
              Swipe left or right to navigate
            </p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Horizontal Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-4">
            
            {/* Left Section: Branding */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              <AnimatedLogo className="w-8 h-8 sm:w-10 sm:h-10" />
              <div className="flex flex-col justify-center">
                <span className="font-mono font-bold text-lg sm:text-xl text-gray-900 leading-tight">
                  Trinity
                </span>
                <span className="text-[10px] sm:text-xs text-gray-600 leading-tight whitespace-nowrap hidden sm:block">
                  A Quant Matrix AI Experience
                </span>
              </div>
            </div>
            
            {/* Center Section: Project Info */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 min-w-0">
              <h1 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 truncate max-w-full">
                {headerTitle}
              </h1>
              {updatedLabel && (
                <p className="text-xs text-gray-500 hidden md:block">
                  Updated {updatedLabel}
                </p>
              )}
            </div>
            
            {/* Right Section: Navigation */}
            {status === 'ready' && totalSlides > 0 && (
              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                {/* Slide indicators - desktop only */}
                {totalSlides > 1 && (
                  <div className="hidden lg:flex items-center gap-1.5">
                    {exhibitedCards.slice(0, 5).map((card, index) => (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => handleSelectSlide(index)}
                        className={`h-2 w-6 rounded-full transition-all ${
                          index === activeSlideIndex 
                            ? 'bg-gray-900' 
                            : 'bg-gray-300 hover:bg-gray-400'
                        }`}
                        aria-label={`Go to slide ${index + 1}`}
                        aria-current={index === activeSlideIndex}
                      />
                    ))}
                    {totalSlides > 5 && (
                      <span className="text-xs text-gray-500">+{totalSlides - 5}</span>
                    )}
                  </div>
                )}
                
                {/* Slide counter */}
                <span className="text-sm text-gray-600 whitespace-nowrap hidden sm:inline">
                  Slide {activeSlideIndex + 1} of {totalSlides}
                </span>
                <span className="text-xs text-gray-600 whitespace-nowrap sm:hidden">
                  {activeSlideIndex + 1}/{totalSlides}
                </span>
                
                {/* Navigation buttons */}
                {totalSlides > 1 && (
                  <div className="flex gap-1.5 sm:gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size={isMobile ? 'sm' : 'default'}
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      onClick={() => handleAdvance('previous')}
                      aria-label="Previous slide"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size={isMobile ? 'sm' : 'default'}
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      onClick={() => handleAdvance('next')}
                      aria-label="Next slide"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {renderContent()}
      </main>
    </div>
  );
};

export default SharedExhibition;
