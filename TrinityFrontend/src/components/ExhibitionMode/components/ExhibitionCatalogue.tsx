import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, FileText } from 'lucide-react';
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
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
}

interface ExhibitionCatalogueProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onDragStart?: (atom: DroppedAtom, cardId: string) => void;
  enableDragging?: boolean;
}

export const ExhibitionCatalogue: React.FC<ExhibitionCatalogueProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  onDragStart,
  enableDragging = true,
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
    <div className="w-64 h-full bg-background border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">Exhibition Catalogue</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag components to slides
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {cards.map((card, index) => (
            <div key={card.id} className="mb-2">
              <button
                type="button"
                onClick={() => onSlideSelect(index)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-lg transition-all group hover:bg-muted/50',
                  currentSlide === index && 'bg-primary/10 border border-primary/30'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 transition-transform',
                      currentSlide === index && 'rotate-90'
                    )}
                  />
                  <span className="text-sm font-medium truncate">
                    {index + 1}. {getSlideTitle(card, index)}
                  </span>
                </div>
              </button>

              {currentSlide === index && card.atoms.length > 0 && (
                <div className="ml-6 mt-2 space-y-1">
                  {card.atoms.map(atom => (
                    <div
                      key={atom.id}
                      draggable={enableDragging && Boolean(onDragStart)}
                      onDragStart={() => enableDragging && onDragStart?.(atom, card.id)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 hover:bg-muted group transition-colors',
                        enableDragging && onDragStart ? 'cursor-move' : 'cursor-not-allowed opacity-70'
                      )}
                    >
                      <div className={`w-2 h-2 ${atom.color} rounded-full flex-shrink-0`} />
                      <span className="text-xs truncate">{atom.title}</span>
                      {enableDragging && onDragStart && (
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] text-muted-foreground">Drag</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExhibitionCatalogue;
