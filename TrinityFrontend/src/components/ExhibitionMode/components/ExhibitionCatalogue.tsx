import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DroppedAtom, LayoutCard } from '../store/exhibitionStore';

type SlideIndexLookup = ReadonlyMap<string, number> | Record<string, number>;

interface ExhibitionCatalogueProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect?: (index: number) => void;
  slideIndexByCardId?: SlideIndexLookup;
  onDragStart?: (atom: DroppedAtom, cardId: string, origin: 'catalogue' | 'slide') => void;
  onDragEnd?: () => void;
  enableDragging?: boolean;
  onCollapse?: () => void;
}

export const ExhibitionCatalogue: React.FC<ExhibitionCatalogueProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  slideIndexByCardId,
  onDragStart,
  onDragEnd,
  enableDragging = true,
  onCollapse,
}) => {
  const resolveSlideIndex = (cardId: string): number | undefined => {
    if (!slideIndexByCardId) {
      return undefined;
    }

    if (slideIndexByCardId instanceof Map) {
      const mapped = slideIndexByCardId.get(cardId);
      return typeof mapped === 'number' ? mapped : undefined;
    }

    const mapped = slideIndexByCardId[cardId];
    return typeof mapped === 'number' ? mapped : undefined;
  };

  const getCatalogueTitle = (card: LayoutCard): string => {
    if (typeof card.moleculeTitle === 'string' && card.moleculeTitle.trim().length > 0) {
      return card.moleculeTitle.trim();
    }

    const availableAtoms = Array.isArray(card.catalogueAtoms) ? card.catalogueAtoms : [];
    const fromMetadata = availableAtoms.find(atom => {
      const candidate = atom?.metadata?.sourceAtomTitle;
      return typeof candidate === 'string' && candidate.trim().length > 0;
    });

    if (fromMetadata?.metadata?.sourceAtomTitle) {
      return fromMetadata.metadata.sourceAtomTitle.trim();
    }

    if (availableAtoms.length > 0) {
      const fallbackTitle = availableAtoms.find(atom => typeof atom.title === 'string' && atom.title.trim().length > 0);
      if (fallbackTitle?.title) {
        return fallbackTitle.title.trim();
      }
    }

    return 'Exhibited Atom';
  };

  return (
    <div className="w-64 h-full bg-background border-r border-border flex flex-col">
      <div className="p-4 border-b border-border flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">Exhibition Catalogue</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Drag components to slides
          </p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            title="Collapse catalogue"
            aria-label="Collapse catalogue"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {cards.map(card => {
            const availableAtoms = Array.isArray(card.catalogueAtoms) ? card.catalogueAtoms : [];
            const catalogueTitle = getCatalogueTitle(card);
            const slideIndex = resolveSlideIndex(card.id);
            const isLinkedToSlide = typeof slideIndex === 'number';
            const isActive = isLinkedToSlide && slideIndex === currentSlide;

            return (
              <div key={card.id} className="mb-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!onSlideSelect || !isLinkedToSlide) {
                      return;
                    }
                    onSlideSelect(slideIndex);
                  }}
                  disabled={!isLinkedToSlide || !onSlideSelect}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg transition-all group hover:bg-muted/50',
                    isActive && 'bg-primary/10 border border-primary/30',
                    (!isLinkedToSlide || !onSlideSelect) && 'opacity-70 cursor-default hover:bg-transparent'
                  )}
                  title={`Select ${catalogueTitle}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 transition-transform',
                        isActive && 'rotate-90'
                      )}
                    />
                    <span className="text-sm font-semibold truncate">{catalogueTitle}</span>
                  </div>
                </button>

                <div className="ml-6 mt-2 space-y-1">
                  {availableAtoms.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No components exhibited yet.</p>
                  ) : (
                    availableAtoms.map(atom => (
                      <div
                        key={atom.id}
                        draggable={enableDragging && Boolean(onDragStart)}
                        onDragStart={event => {
                          if (!enableDragging || !onDragStart) {
                            return;
                          }
                          try {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('application/json', JSON.stringify({ atomId: atom.id }));
                          } catch {
                            /* ignore browsers without dataTransfer */
                          }
                          console.info('[Exhibition] Dragging catalogue atom', {
                            atomId: atom.id,
                            title: atom.title,
                            manifestId:
                              atom.visualisationManifest?.manifestId ?? atom.manifestRef ?? atom.metadata?.manifestRef ?? null,
                            sourceCardId: card.id,
                          });
                          onDragStart(atom, card.id, 'catalogue');
                        }}
                        onDragEnd={() => enableDragging && onDragEnd?.()}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50 hover:bg-muted group transition-colors',
                          enableDragging && onDragStart ? 'cursor-move' : 'cursor-not-allowed opacity-70'
                        )}
                      >
                        <div className={`w-2 h-2 ${atom.color} rounded-full flex-shrink-0`} />
                        <div className="flex flex-col text-left">
                          <span className="text-xs font-medium text-foreground truncate">{atom.title}</span>
                          {atom.metadata?.sourceAtomTitle && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              {atom.metadata.sourceAtomTitle}
                            </span>
                          )}
                        </div>
                        {enableDragging && onDragStart && (
                          <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-muted-foreground">Drag</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ExhibitionCatalogue;
