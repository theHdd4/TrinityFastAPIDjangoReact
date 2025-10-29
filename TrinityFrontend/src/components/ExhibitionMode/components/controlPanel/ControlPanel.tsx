import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Save, Share2, Undo2 } from 'lucide-react';

interface ControlPanelProps {
  canEdit: boolean;
  isSaving: boolean;
  undoAvailable: boolean;
  hasSlides: boolean;
  disableDownload?: boolean;
  onUndo: () => void;
  onSave: () => void;
  onShare: () => void;
  onDownload: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  canEdit,
  isSaving,
  undoAvailable,
  hasSlides,
  disableDownload = false,
  onUndo,
  onSave,
  onShare,
  onDownload,
}) => (
  <div className="bg-white/80 backdrop-blur-sm border-b border-border/60 px-6 py-6 flex-shrink-0 shadow-sm">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-3xl font-light text-foreground mb-1">Exhibition Mode</h2>
        <p className="text-muted-foreground font-light">
          Transform laboratory insights into presentation-ready stories.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-exhibition-toolbar="true">
        <Button
          variant="outline"
          size="sm"
          className="border-border text-foreground/80 font-medium"
          onClick={onUndo}
          disabled={!canEdit || !undoAvailable}
        >
          <Undo2 className="w-4 h-4 mr-2" />
          Undo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-border text-foreground/80 font-medium"
          onClick={onSave}
          disabled={!canEdit || isSaving}
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-border text-foreground/80 font-medium"
          onClick={onShare}
          disabled={!hasSlides}
        >
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
        <Button
          size="sm"
          className="bg-blue-600 text-white font-medium hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          onClick={onDownload}
          disabled={disableDownload}
        >
          <Download className="w-4 h-4 mr-2" />
          Download
        </Button>
      </div>
    </div>
  </div>
);
