import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
}

interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited?: boolean;
  moleculeTitle?: string;
}

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
    if (card.moleculeTitle) {
      return card.atoms.length > 0
        ? `${card.moleculeTitle} - ${card.atoms[0].title}`
        : card.moleculeTitle;
    }
    return card.atoms.length > 0 ? card.atoms[0].title : `Slide ${index + 1}`;
  };

  return (
    <div className="fixed left-0 top-0 h-full w-80 bg-background border-r border-border shadow-xl z-40 animate-slide-in-right">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-lg">Slides</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-64px)]">
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
                    {card.atoms.length} {card.atoms.length === 1 ? 'atom' : 'atoms'}
                  </p>
                </div>
              </div>

              <div className="mt-2 aspect-video bg-background rounded border border-border overflow-hidden">
                <div className="p-2 grid grid-cols-2 gap-1">
                  {card.atoms.slice(0, 4).map(atom => (
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
