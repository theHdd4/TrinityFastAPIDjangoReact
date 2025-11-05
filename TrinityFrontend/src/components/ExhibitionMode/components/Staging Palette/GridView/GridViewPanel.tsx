import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { LayoutCard } from '../../../store/exhibitionStore';
import SlidePreview from '../../SlidePreview';

export interface GridViewPanelProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onClose?: () => void;
}

const getSlideTitle = (card: LayoutCard, index: number) => {
  if (typeof card.title === 'string' && card.title.trim().length > 0) {
    return card.title.trim();
  }
  if (card.moleculeTitle) {
    return card.atoms.length > 0
      ? `${card.moleculeTitle} - ${card.atoms[0].title}`
      : card.moleculeTitle;
  }
  return card.atoms.length > 0 ? card.atoms[0].title : `Slide ${index + 1}`;
};

export const GridViewPanel: React.FC<GridViewPanelProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  onClose,
}) => {
  return (
    <div className="flex h-full w-full flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Staging Palette
          </p>
          <h3 className="text-base font-semibold leading-tight">Slides Overview</h3>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close staging palette"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSlideSelect(index)}
              className={cn(
                'group rounded-xl border-2 bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg',
                currentSlide === index
                  ? 'border-primary shadow-lg ring-2 ring-primary/20'
                  : 'border-border',
              )}
            >
              <div className="relative overflow-hidden rounded-t-lg bg-background/90">
                <SlidePreview
                  card={card}
                  index={index}
                  totalSlides={cards.length}
                  className="m-3"
                />
                {currentSlide === index ? (
                  <div className="absolute top-2 right-2 rounded-full bg-primary/90 px-3 py-0.5 text-xs font-semibold text-primary-foreground shadow-sm">
                    Current
                  </div>
                ) : null}
              </div>

              <div className="border-t border-border bg-muted/40 px-3 py-2">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                      currentSlide === index
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-medium text-foreground">
                      {getSlideTitle(card, index)}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {card.atoms.length} {card.atoms.length === 1 ? 'atom' : 'atoms'}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          ))}

          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-12 text-center text-muted-foreground">
              <p className="text-sm font-medium">No slides yet</p>
              <p className="text-xs">Create a slide to see it appear in the staging palette.</p>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
};

export default GridViewPanel;
