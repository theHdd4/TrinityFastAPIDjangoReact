import React from 'react';
import {
  DndContext,
  PointerSensor,
  DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clipboard, Copy, Download, EyeOff, Files, Plus, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { LayoutCard } from '../store/exhibitionStore';
import SlidePreview from './SlidePreview';

interface SortableSlideButtonProps {
  card: LayoutCard;
  index: number;
  currentSlide: number;
  totalSlides: number;
  onSelect: (index: number) => void;
  getSlideTitle: (card: LayoutCard, index: number) => string;
}

const SortableSlideButton: React.FC<SortableSlideButtonProps> = ({
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
    opacity: isDragging ? 0.6 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
  };

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(index)}
      className={cn(
        'w-full text-left p-3 rounded-lg border-2 transition-all group hover:shadow-md',
        currentSlide === index
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-border bg-muted/30 hover:border-primary/50',
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
            currentSlide === index
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground group-hover:bg-primary/10',
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

      <SlidePreview card={card} index={index} totalSlides={totalSlides} className="mt-3" />
    </button>
  );
};

interface SlideThumbnailsProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onClose: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export const SlideThumbnails: React.FC<SlideThumbnailsProps> = ({
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
    <div className="flex h-full w-80 flex-shrink-0 flex-col border-r border-border bg-background shadow-xl animate-slide-in-right">
      <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
        <h3 className="font-semibold text-lg">Slides</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={cards.map(card => card.id)} strategy={verticalListSortingStrategy}>
              {cards.map((card, index) => (
                <ContextMenu key={card.id}>
                  <ContextMenuTrigger>
                    <div className="w-full">
                      <SortableSlideButton
                        card={card}
                        index={index}
                        currentSlide={currentSlide}
                        totalSlides={cards.length}
                        onSelect={onSlideSelect}
                        getSlideTitle={getSlideTitle}
                      />
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-60">
                    <ContextMenuItem>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                      <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Clipboard className="mr-2 h-4 w-4" />
                      Paste
                      <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Files className="mr-2 h-4 w-4" />
                      Duplicate page
                      <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                      Delete page
                      <ContextMenuShortcut>Delete</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Hide page
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Plus className="mr-2 h-4 w-4" />
                      Add page
                      <ContextMenuShortcut>Ctrl+Enter</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Add transition
                    </ContextMenuItem>
                    <ContextMenuItem>
                      <Download className="mr-2 h-4 w-4" />
                      Download page
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem>
                      <StickyNote className="mr-2 h-4 w-4" />
                      Notes
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SlideThumbnails;
