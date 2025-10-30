import React from 'react';
import { Download, Save, Share2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ControlPanelProps {
  title: string;
  description: string;
  onUndo?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  disableUndo?: boolean;
  disableSave?: boolean;
  disableShare?: boolean;
  disableDownload?: boolean;
  isSaving?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  title,
  description,
  onUndo,
  onSave,
  onShare,
  onDownload,
  disableUndo,
  disableSave,
  disableShare,
  disableDownload,
  isSaving,
}) => {
  return (
    <div className="bg-white/80 backdrop-blur-sm border-b border-border/60 px-6 py-6 flex-shrink-0 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-light text-foreground mb-1">{title}</h2>
          <p className="text-muted-foreground font-light">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-exhibition-toolbar="true">
          {onUndo && (
            <Button
              variant="outline"
              size="sm"
              className="border-border text-foreground/80 font-medium"
              onClick={onUndo}
              disabled={disableUndo}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Undo
            </Button>
          )}

          {onSave && (
            <Button
              variant="outline"
              size="sm"
              className="border-border text-foreground/80 font-medium"
              onClick={onSave}
              disabled={disableSave}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          )}

          {onShare && (
            <Button
              variant="outline"
              size="sm"
              className="border-border text-foreground/80 font-medium"
              onClick={onShare}
              disabled={disableShare}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          )}

          {onDownload && (
            <Button
              size="sm"
              className="bg-blue-600 text-white font-medium hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              onClick={onDownload}
              disabled={disableDownload}
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
