import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

import { fetchSharedExhibitionLayout, type ExhibitionLayoutResponse } from '@/lib/exhibition';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { SlideCanvas } from '@/components/ExhibitionMode/components/SlideCanvas';
import { Button } from '@/components/ui/button';

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

  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<SharedMetadata | null>(null);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

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
  const subheading = metadata
    ? `${metadata.client_name} · ${metadata.app_name}`
    : 'Trinity Exhibition Mode';

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

  const renderContent = () => {
    if (status === 'loading' || status === 'idle') {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-white/80 space-y-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading exhibition…</p>
        </div>
      );
    }

    if (status === 'error') {
      return (
        <div className="max-w-xl mx-auto bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center space-y-4 text-red-100">
          <AlertCircle className="h-10 w-10 mx-auto" />
          <div>
            <p className="font-semibold text-lg">We couldn’t open this exhibition</p>
            <p className="text-sm text-red-100/80 mt-2">{error ?? 'Please check the link or request a new one.'}</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button variant="secondary" className="bg-white text-slate-900" asChild>
              <Link to="/login">Sign in to Trinity</Link>
            </Button>
            <Button variant="ghost" className="text-white" asChild>
              <Link to="/">Go back home</Link>
            </Button>
          </div>
        </div>
      );
    }

    if (totalSlides === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-white/70 space-y-4">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">This exhibition doesn’t contain any published slides yet.</p>
        </div>
      );
    }

    if (!activeSlide) {
      return null;
    }

    return (
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2 text-white/70">
            <span className="tracking-[0.4em] uppercase text-xs">Slide {activeSlideIndex + 1}</span>
            <span className="text-xs text-white/40">of {totalSlides}</span>
          </div>
          {totalSlides > 1 && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                className="bg-white/5 text-white hover:bg-white/10"
                onClick={() => handleAdvance('previous')}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous slide</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="bg-white/5 text-white hover:bg-white/10"
                onClick={() => handleAdvance('next')}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next slide</span>
              </Button>
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-[40px] border border-white/10 bg-white/5 p-4">
          <div className="rounded-[32px] bg-black/60 p-4">
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
        </div>

        {totalSlides > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {exhibitedCards.map((card, index) => {
              const isActive = index === activeSlideIndex;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSelectSlide(index)}
                  className={`h-2.5 w-8 rounded-full transition ${
                    isActive ? 'bg-white' : 'bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`View slide ${index + 1}`}
                  aria-current={isActive}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
        <header className="space-y-4 text-center">
          <div className="flex items-center justify-center gap-3 text-sm text-white/60">
            <span className="tracking-[0.4em] uppercase text-xs">Trinity Exhibition</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-white">{headerTitle}</h1>
          <p className="text-sm text-white/60">{subheading}</p>
          {updatedLabel && <p className="text-xs text-white/50">Last updated {updatedLabel}</p>}
        </header>

        {renderContent()}
      </div>
    </div>
  );
};

export default SharedExhibition;
