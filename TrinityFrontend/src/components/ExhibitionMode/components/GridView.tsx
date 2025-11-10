import React from 'react';
import {
  DndContext,
  PointerSensor,
  DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LayoutCard } from '../store/exhibitionStore';
import SlidePreview from './SlidePreview';

interface GridViewProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onClose: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

interface SortableSlideCardProps {
  card: LayoutCard;
  index: number;
  currentSlide: number;
  totalSlides: number;
  onSelect: (index: number) => void;
  getSlideTitle: (card: LayoutCard, index: number) => string;
}

const SortableSlideCard: React.FC<SortableSlideCardProps> = ({
  card,
  index,
  currentSlide,
  totalSlides,
  onSelect,
  getSlideTitle,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(index)}
      className={cn(
        'group relative bg-card border-2 rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1',
        currentSlide === index
          ? 'border-primary shadow-lg ring-2 ring-primary/20'
          : 'border-border hover:border-primary/50'
      )}
      {...attributes}
      {...listeners}
    >
      <div className="p-4">
        <SlidePreview card={card} index={index} totalSlides={totalSlides} />
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
            <h3 className="font-medium text-sm truncate">{getSlideTitle(card, index)}</h3>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {card.atoms.length} {card.atoms.length === 1 ? 'atom' : 'atoms'}
        </p>
      </div>

      {currentSlide === index && (
        <div className="absolute top-2 right-2 px-2 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded">
          Current
        </div>
      )}
    </button>
  );
};

export const GridView: React.FC<GridViewProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  onClose,
  onReorder,
}) => {
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const fromIndex = cards.findIndex(card => card.id === active.id);
    const toIndex = cards.findIndex(card => card.id === over.id);

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    onReorder(fromIndex, toIndex);
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={cards.map(card => card.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {cards.map((card, index) => (
                  <SortableSlideCard
                    key={card.id}
                    card={card}
                    index={index}
                    currentSlide={currentSlide}
                    totalSlides={cards.length}
                    onSelect={selectedIndex => {
                      onSlideSelect(selectedIndex);
                      onClose();
                    }}
                    getSlideTitle={getSlideTitle}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
};

export default GridView;
