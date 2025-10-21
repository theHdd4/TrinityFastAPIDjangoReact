import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LayoutCard } from '../store/exhibitionStore';

interface GridViewProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onClose: () => void;
}

export const GridView: React.FC<GridViewProps> = ({
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
    <div className="fixed inset-0 bg-background z-50 animate-fade-in">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-semibold">All Slides</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {cards.map((card, index) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  onSlideSelect(index);
                  onClose();
                }}
                className={cn(
                  'group relative bg-card border-2 rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1',
                  currentSlide === index
                    ? 'border-primary shadow-lg ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="aspect-video bg-muted/30 p-4">
                  <div className="grid grid-cols-2 gap-2 h-full">
                    {(Array.isArray(card.catalogueAtoms) ? card.catalogueAtoms : []).slice(0, 4).map(atom => (
                      <div
                        key={atom.id}
                        className="flex items-center gap-2 p-2 bg-background rounded border border-border"
                      >
                        <div className={`w-3 h-3 ${atom.color} rounded-full flex-shrink-0`} />
                        <span className="text-xs truncate">{atom.title}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-muted/50 border-t border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div
                        className={cn(
                          'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                          currentSlide === index
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {index + 1}
                      </div>
                      <h3 className="font-medium text-sm truncate">
                        {getSlideTitle(card, index)}
                      </h3>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.catalogueAtoms?.length ?? 0} {(card.catalogueAtoms?.length ?? 0) === 1 ? 'component' : 'components'}
                  </p>
                </div>

                {currentSlide === index && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded">
                    Current
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GridView;
