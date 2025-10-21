import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { LayoutCard } from '../store/exhibitionStore';

interface SlideThumbnailsProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onClose: () => void;
}

export const SlideThumbnails: React.FC<SlideThumbnailsProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  onClose,
}) => {
  const getSlideTitle = (card: LayoutCard, index: number) => {
    if (typeof card.title === 'string' && card.title.trim().length > 0) {
      return card.title.trim();
    }
    const atoms = Array.isArray(card.catalogueAtoms) ? card.catalogueAtoms : [];
    if (card.moleculeTitle) {
      return atoms.length > 0
        ? `${card.moleculeTitle} - ${atoms[0].title}`
        : card.moleculeTitle;
    }
    return atoms.length > 0 ? atoms[0].title : `Slide ${index + 1}`;
  };

  return (
    <div className="flex h-full w-80 flex-shrink-0 flex-col border-r border-border bg-background shadow-xl animate-slide-in-right">
      <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
        <h3 className="font-semibold text-lg">Slides</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSlideSelect(index)}
              className={cn(
                'w-full text-left p-3 rounded-lg border-2 transition-all group hover:shadow-md',
                currentSlide === index
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'border-border bg-muted/30 hover:border-primary/50'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
                    currentSlide === index
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground group-hover:bg-primary/10'
                  )}
                >
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate mb-1">{getSlideTitle(card, index)}</h4>
                  <p className="text-xs text-muted-foreground">
                    {card.catalogueAtoms?.length ?? 0} {(card.catalogueAtoms?.length ?? 0) === 1 ? 'component' : 'components'}
                  </p>
                </div>
              </div>

              <div className="mt-2 aspect-video bg-background rounded border border-border overflow-hidden">
                <div className="p-2 grid grid-cols-2 gap-1">
                  {(Array.isArray(card.catalogueAtoms) ? card.catalogueAtoms : []).slice(0, 4).map(atom => (
                    <div key={atom.id} className="flex items-center gap-1 p-1 bg-muted rounded text-[10px]">
                      <div className={`w-2 h-2 ${atom.color} rounded-full flex-shrink-0`} />
                      <span className="truncate">{atom.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SlideThumbnails;
