import React, { useState } from 'react';
import { X, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    <div className="flex h-full w-80 flex-shrink-0 flex-col bg-background border-l border-border shadow-xl animate-slide-in-right">
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Speaker Notes</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="text-sm text-muted-foreground">Slide {currentSlide + 1} Notes</div>
          <Textarea
            value={localNotes}
            onChange={e => setLocalNotes(e.target.value)}
            onBlur={handleBlur}
            placeholder="Add speaker notes for this slide..."
            className="min-h-[200px] resize-none"
          />
          <div className="p-3 bg-muted/50 rounded-lg border border-border">
            <h4 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Tips</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
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
