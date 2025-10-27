import React, { useState } from 'react';
import { X, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { POSITION_PANEL_WIDTH } from './operationsPalette';

interface SlideNotesProps {
  currentSlide: number;
  notes: Record<number, string>;
  onNotesChange: (slideIndex: number, notes: string) => void;
  onClose: () => void;
}

export const SlideNotes: React.FC<SlideNotesProps> = ({
  currentSlide,
  notes,
  onNotesChange,
  onClose,
}) => {
  const [localNotes, setLocalNotes] = useState(notes[currentSlide] || '');

  React.useEffect(() => {
    setLocalNotes(notes[currentSlide] || '');
  }, [currentSlide, notes]);

  const handleBlur = () => {
    onNotesChange(currentSlide, localNotes);
  };

  return (
    <div
      className="flex h-full w-full max-w-[var(--notes-panel-width)] flex-shrink-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background/95 shadow-2xl"
      style={{
        // provide explicit width so the panel mirrors the other operations drawers
        // while still allowing responsive adjustments when POSITION_PANEL_WIDTH changes
        ['--notes-panel-width' as '--notes-panel-width']: POSITION_PANEL_WIDTH,
      }}
    >
      <div className="flex items-center justify-between rounded-t-3xl border-b border-border/60 bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Speaker Notes</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-5 py-4">
          <div className="text-sm font-medium text-muted-foreground/90">Slide {currentSlide + 1} Notes</div>
          <Textarea
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
            onBlur={handleBlur}
            placeholder="Add speaker notes for this slide..."
            className="min-h-[200px] resize-none"
          />
          <div className="rounded-xl border border-border bg-muted/50 p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Tips</h4>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Use notes to remember key points</li>
              <li>• Notes are visible only to you</li>
              <li>• Navigate slides to see their notes</li>
            </ul>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SlideNotes;
