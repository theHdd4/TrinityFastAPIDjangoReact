import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { Clipboard, Copy, Download, Eye, EyeOff, Files, Plus, Sparkles, StickyNote, Trash2, X } from 'lucide-react';
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
import { LayoutCard, useExhibitionStore, buildSlideTitleObjectId } from '../store/exhibitionStore';
import SlidePreview from './SlidePreview';
import { toast } from 'sonner';

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
        'w-full text-left p-3 rounded-lg border-2 transition-all group hover:shadow-md relative',
        currentSlide === index
          ? 'border-primary bg-primary/5 shadow-md'
          : 'border-border bg-muted/30 hover:border-primary/50',
        !card.isExhibited && 'opacity-60',
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
        {!card.isExhibited && (
          <div className="flex-shrink-0">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
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
  onOpenSettings?: () => void;
}

export const SlideThumbnails: React.FC<SlideThumbnailsProps> = ({
  cards,
  currentSlide,
  onSlideSelect,
  onClose,
  onReorder,
  onOpenSettings,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [clipboard, setClipboard] = useState<LayoutCard | null>(null);
  const { addBlankSlide, removeSlide, updateCard, slideObjectsByCardId, addSlideObject } = useExhibitionStore();

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

  // Handler functions for context menu
  const handleCopy = useCallback((card: LayoutCard) => {
    setClipboard(card);
    toast.success('Slide copied to clipboard');
  }, []);

  const handlePaste = useCallback((afterIndex: number) => {
    if (!clipboard) {
      toast.error('No slide in clipboard');
      return;
    }

    const newCard = addBlankSlide(afterIndex);
    if (newCard) {
      // Copy all properties from clipboard
      updateCard(newCard.id, {
        atoms: [...clipboard.atoms],
        catalogueAtoms: clipboard.catalogueAtoms ? [...clipboard.catalogueAtoms] : undefined,
        title: clipboard.title ? `${clipboard.title} (Copy)` : undefined,
        moleculeTitle: clipboard.moleculeTitle,
        presentationSettings: clipboard.presentationSettings ? { ...clipboard.presentationSettings } : undefined,
      });

      // Copy slide objects if they exist
      const clipboardSlideObjects = slideObjectsByCardId[clipboard.id];
      if (clipboardSlideObjects && clipboardSlideObjects.length > 0) {
        const titleObjectId = buildSlideTitleObjectId(clipboard.id);
        const filteredObjects = clipboardSlideObjects.filter(obj => {
          if (obj.id === titleObjectId) {
            return false;
          }
          if (typeof obj.id === 'string' && obj.id.endsWith('::slide-title')) {
            return false;
          }
          if (obj.type === 'atom') {
            return false;
          }
          return true;
        });
        const copiedObjects = filteredObjects.map(obj => ({
          ...obj,
          id: `${obj.id}-copy-${Date.now()}`,
        }));
        
        // Update the new card with copied slide objects
        copiedObjects.forEach(obj => {
          addSlideObject(newCard.id, obj);
        });
      }

      toast.success('Slide pasted');
      onSlideSelect(afterIndex + 1);
    }
  }, [clipboard, addBlankSlide, updateCard, slideObjectsByCardId, addSlideObject, onSlideSelect]);

  const handleDuplicate = useCallback((card: LayoutCard, index: number) => {
    const newCard = addBlankSlide(index);
    if (newCard) {
      // Copy all properties
      updateCard(newCard.id, {
        atoms: [...card.atoms],
        catalogueAtoms: card.catalogueAtoms ? [...card.catalogueAtoms] : undefined,
        title: card.title ? `${card.title} (Copy)` : undefined,
        moleculeTitle: card.moleculeTitle,
        presentationSettings: card.presentationSettings ? { ...card.presentationSettings } : undefined,
      });

      // Copy slide objects if they exist
      const originalSlideObjects = slideObjectsByCardId[card.id];
      if (originalSlideObjects && originalSlideObjects.length > 0) {
        const titleObjectId = buildSlideTitleObjectId(card.id);
        const filteredObjects = originalSlideObjects.filter(obj => {
          if (obj.id === titleObjectId) {
            return false;
          }
          if (typeof obj.id === 'string' && obj.id.endsWith('::slide-title')) {
            return false;
          }
          if (obj.type === 'atom') {
            return false;
          }
          return true;
        });
        const copiedObjects = filteredObjects.map(obj => ({
          ...obj,
          id: `${obj.id}-dup-${Date.now()}`,
        }));
        
        copiedObjects.forEach(obj => {
          addSlideObject(newCard.id, obj);
        });
      }

      toast.success('Slide duplicated');
      onSlideSelect(index + 1);
    }
  }, [addBlankSlide, updateCard, slideObjectsByCardId, addSlideObject, onSlideSelect]);

  const handleDelete = useCallback((card: LayoutCard) => {
    if (cards.length <= 1) {
      toast.error('Cannot delete the last slide');
      return;
    }

    removeSlide(card.id);
    toast.success('Slide deleted');

    // Navigate to previous slide if current was deleted
    if (cards[currentSlide]?.id === card.id && currentSlide > 0) {
      onSlideSelect(currentSlide - 1);
    }
  }, [cards, currentSlide, removeSlide, onSlideSelect]);

  const handleHide = useCallback((card: LayoutCard) => {
    updateCard(card.id, {
      isExhibited: !card.isExhibited,
    });
    toast.success(card.isExhibited ? 'Slide hidden' : 'Slide shown');
  }, [updateCard]);

  const handleAddPage = useCallback((afterIndex: number) => {
    const newCard = addBlankSlide(afterIndex);
    if (newCard) {
      toast.success('New slide added');
      onSlideSelect(afterIndex + 1);
    }
  }, [addBlankSlide, onSlideSelect]);

  const handleAddTransition = useCallback((card: LayoutCard, index: number) => {
    // Navigate to the slide and open settings panel (like Canvas)
    if (currentSlide !== index) {
      onSlideSelect(index);
    }
    
    if (onOpenSettings) {
      onOpenSettings();
      toast.success('Opening transition settings');
    } else {
      toast.error('Settings panel not available');
    }
  }, [currentSlide, onSlideSelect, onOpenSettings]);

  const handleDownload = useCallback(async (card: LayoutCard, index: number) => {
    try {
      // Create a JSON representation of the slide
      const slideData = {
        id: card.id,
        title: getSlideTitle(card, index),
        atoms: card.atoms,
        catalogueAtoms: card.catalogueAtoms,
        moleculeTitle: card.moleculeTitle,
        presentationSettings: card.presentationSettings,
        slideObjects: slideObjectsByCardId[card.id] || [],
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(slideData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${getSlideTitle(card, index).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_slide_${index + 1}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Slide downloaded');
    } catch (error) {
      console.error('Failed to download slide:', error);
      toast.error('Failed to download slide');
    }
  }, [slideObjectsByCardId, getSlideTitle]);

  const handleNotes = useCallback((card: LayoutCard) => {
    // Toggle notes visibility for this slide
    updateCard(card.id, {
      presentationSettings: {
        ...card.presentationSettings,
        slideNotesVisible: !card.presentationSettings?.slideNotesVisible,
      },
    });

    toast.success(
      card.presentationSettings?.slideNotesVisible ? 'Notes hidden' : 'Notes shown'
    );
  }, [updateCard]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!containerRef.current || !activeElement || !containerRef.current.contains(activeElement)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        const activeCard = cards[currentSlide];
        if (!activeCard) return;
        const target = event.target as HTMLElement | null;
        if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          return;
        }
        event.preventDefault();
        handleCopy(activeCard);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        const target = event.target as HTMLElement | null;
        if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          return;
        }
        event.preventDefault();
        handlePaste(currentSlide);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        const activeCard = cards[currentSlide];
        if (!activeCard) return;
        const target = event.target as HTMLElement | null;
        if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          return;
        }
        event.preventDefault();
        handleDuplicate(activeCard, currentSlide);
        return;
      }

      if (event.key === 'Delete') {
        const activeCard = cards[currentSlide];
        if (!activeCard) return;
        const target = event.target as HTMLElement | null;
        if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          return;
        }
        event.preventDefault();
        handleDelete(activeCard);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        const target = event.target as HTMLElement | null;
        if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          return;
        }
        event.preventDefault();
        handleAddPage(currentSlide);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cards,
    currentSlide,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleDelete,
    handleAddPage,
  ]);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-80 flex-shrink-0 flex-col border-r border-border bg-background shadow-xl animate-slide-in-right"
      data-slide-thumbnails="true"
    >
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
                    <ContextMenuItem onClick={() => handleCopy(card)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                      <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem 
                      onClick={() => handlePaste(index)}
                      disabled={!clipboard}
                    >
                      <Clipboard className="mr-2 h-4 w-4" />
                      Paste
                      <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleDuplicate(card, index)}>
                      <Files className="mr-2 h-4 w-4" />
                      Duplicate page
                      <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem 
                      onClick={() => handleDelete(card)}
                      disabled={cards.length <= 1}
                    >
                      <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                      Delete page
                      <ContextMenuShortcut>Delete</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => handleHide(card)}>
                      {card.isExhibited ? (
                        <EyeOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      {card.isExhibited ? 'Hide page' : 'Show page'}
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleAddPage(index)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add page
                      <ContextMenuShortcut>Ctrl+Enter</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleAddTransition(card, index)}>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Add transition
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleDownload(card, index)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download page
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => handleNotes(card)}>
                      <StickyNote className="mr-2 h-4 w-4" />
                      {card.presentationSettings?.slideNotesVisible ? 'Hide notes' : 'Show notes'}
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
