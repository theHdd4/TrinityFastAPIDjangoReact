import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { cn } from '@/lib/utils';
import { LayoutCard, useExhibitionStore, buildSlideTitleObjectId } from '../store/exhibitionStore';
import SlidePreview from './SlidePreview';
import { toast } from 'sonner';

interface GridViewProps {
  cards: LayoutCard[];
  currentSlide: number;
  onSlideSelect: (index: number) => void;
  onClose: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onOpenSettings?: () => void;
}

interface SortableSlideCardProps {
  card: LayoutCard;
  index: number;
  currentSlide: number;
  totalSlides: number;
  onSelect: (index: number) => void;
  getSlideTitle: (card: LayoutCard, index: number) => string;
  clipboard: LayoutCard | null;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHide: () => void;
  onAddPage: () => void;
  onAddTransition: () => void;
  onDownload: () => void;
  onNotes: () => void;
  canDelete: boolean;
}

const SortableSlideCard: React.FC<SortableSlideCardProps> = ({
  card,
  index,
  currentSlide,
  totalSlides,
  onSelect,
  getSlideTitle,
  clipboard,
  onCopy,
  onPaste,
  onDuplicate,
  onDelete,
  onHide,
  onAddPage,
  onAddTransition,
  onDownload,
  onNotes,
  canDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    cursor: isDragging ? 'grabbing' : 'pointer',
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(index)}
      className={cn(
        'group relative bg-card border-2 rounded-xl overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1',
        currentSlide === index
          ? 'border-primary shadow-lg ring-2 ring-primary/20'
              : 'border-border hover:border-primary/50',
            !card.isExhibited && 'opacity-60'
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
              {!card.isExhibited && (
                <div className="flex-shrink-0 ml-2">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
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
          
          {!card.isExhibited && (
            <div className="absolute top-2 left-2 px-2 py-1 bg-muted/90 backdrop-blur-sm text-muted-foreground text-xs font-semibold rounded flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Hidden
            </div>
          )}
    </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuItem onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onPaste} disabled={!clipboard}>
          <Clipboard className="mr-2 h-4 w-4" />
          Paste
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Files className="mr-2 h-4 w-4" />
          Duplicate page
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} disabled={!canDelete}>
          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
          Delete page
          <ContextMenuShortcut>Delete</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onHide}>
          {card.isExhibited ? (
            <EyeOff className="mr-2 h-4 w-4" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          {card.isExhibited ? 'Hide page' : 'Show page'}
        </ContextMenuItem>
        <ContextMenuItem onClick={onAddPage}>
          <Plus className="mr-2 h-4 w-4" />
          Add page
          <ContextMenuShortcut>Ctrl+Enter</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={onAddTransition}>
          <Sparkles className="mr-2 h-4 w-4" />
          Add transition
        </ContextMenuItem>
        <ContextMenuItem onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" />
          Download page
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onNotes}>
          <StickyNote className="mr-2 h-4 w-4" />
          {card.presentationSettings?.slideNotesVisible ? 'Hide notes' : 'Show notes'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const GridView: React.FC<GridViewProps> = ({
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
      updateCard(newCard.id, {
        atoms: [...clipboard.atoms],
        catalogueAtoms: clipboard.catalogueAtoms ? [...clipboard.catalogueAtoms] : undefined,
        title: clipboard.title ? `${clipboard.title} (Copy)` : undefined,
        moleculeTitle: clipboard.moleculeTitle,
        presentationSettings: clipboard.presentationSettings ? { ...clipboard.presentationSettings } : undefined,
      });

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
      updateCard(newCard.id, {
        atoms: [...card.atoms],
        catalogueAtoms: card.catalogueAtoms ? [...card.catalogueAtoms] : undefined,
        title: card.title ? `${card.title} (Copy)` : undefined,
        moleculeTitle: card.moleculeTitle,
        presentationSettings: card.presentationSettings ? { ...card.presentationSettings } : undefined,
      });

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
    if (currentSlide !== index) {
      onSlideSelect(index);
    }
    onClose();
    
    if (onOpenSettings) {
      onOpenSettings();
      toast.success('Opening transition settings');
    } else {
      toast.error('Settings panel not available');
    }
  }, [currentSlide, onSlideSelect, onClose, onOpenSettings]);

  const handleDownload = useCallback(async (card: LayoutCard, index: number) => {
    try {
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
  }, [slideObjectsByCardId]);

  const handleNotes = useCallback((card: LayoutCard) => {
    updateCard(card.id, {
      presentationSettings: {
        ...card.presentationSettings,
        slideNotesVisible: !card.presentationSettings?.slideNotesVisible,
      },
    });

    toast.success(
      card.presentationSettings?.slideNotesVisible ? 'Notes hidden' : 'Notes shown'
    );
    onClose();
  }, [updateCard, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (!containerRef.current || !activeElement || !containerRef.current.contains(activeElement)) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
        return;
      }

      const activeCard = cards[currentSlide];

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        if (!activeCard) return;
        event.preventDefault();
        handleCopy(activeCard);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        handlePaste(currentSlide);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        if (!activeCard) return;
        event.preventDefault();
        handleDuplicate(activeCard, currentSlide);
        return;
      }

      if (event.key === 'Delete') {
        if (!activeCard) return;
        event.preventDefault();
        handleDelete(activeCard);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
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
      className="fixed inset-0 bg-background z-50 animate-fade-in"
      data-grid-view="true"
    >
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
                    clipboard={clipboard}
                    onCopy={() => handleCopy(card)}
                    onPaste={() => handlePaste(index)}
                    onDuplicate={() => handleDuplicate(card, index)}
                    onDelete={() => handleDelete(card)}
                    onHide={() => handleHide(card)}
                    onAddPage={() => handleAddPage(index)}
                    onAddTransition={() => handleAddTransition(card, index)}
                    onDownload={() => handleDownload(card, index)}
                    onNotes={() => handleNotes(card)}
                    canDelete={cards.length > 1}
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
