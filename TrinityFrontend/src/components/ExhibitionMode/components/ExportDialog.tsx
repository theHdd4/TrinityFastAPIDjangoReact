import React, { useMemo, useState } from 'react';
import { FileText, Image, Presentation } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import { useExhibitionStore, resolveCardTitle } from '../store/exhibitionStore';
import {
  buildPresentationExportPayload,
  captureSlidesForExport,
  downloadBlob,
  downloadSlidesAsImages,
  requestPresentationExport,
  sanitizeFileName,
} from '../utils/export';

type ExportFormat = 'pdf' | 'pptx' | 'images';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSlides: number;
}

const formatLabel = (format: ExportFormat) => {
  switch (format) {
    case 'pdf':
      return 'PDF';
    case 'pptx':
      return 'PowerPoint';
    case 'images':
      return 'image set';
    default:
      return 'export';
  }
};

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  totalSlides,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const exhibitedCards = useExhibitionStore(state => state.exhibitedCards);
  const slideObjectsByCardId = useExhibitionStore(state => state.slideObjectsByCardId);

  const presentationTitle = useMemo(() => {
    const firstCard = exhibitedCards[0];
    if (!firstCard) {
      return 'Exhibition Presentation';
    }
    const resolved = resolveCardTitle(firstCard, firstCard.atoms ?? []);
    const trimmed = resolved?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : 'Exhibition Presentation';
  }, [exhibitedCards]);

  const handleExport = async (format: ExportFormat) => {
    if (exhibitedCards.length === 0) {
      toast.error('No slides to export', {
        description: 'Add a slide to your exhibition before exporting.',
      });
      onOpenChange(false);
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(`Preparing ${formatLabel(format)} export...`);

    try {
      const pixelRatio = format === 'pdf' ? 3 : 2;
      const captures = await captureSlidesForExport(exhibitedCards, { pixelRatio });

      if (captures.length !== exhibitedCards.length) {
        throw new Error('We could not capture every slide for export. Please try again.');
      }

      if (format === 'images') {
        await downloadSlidesAsImages(captures, presentationTitle);
        toast.success(`Downloaded ${captures.length} PNG ${captures.length === 1 ? 'file' : 'files'}.`, {
          id: toastId,
        });
      } else {
        const payload = buildPresentationExportPayload(
          exhibitedCards,
          slideObjectsByCardId,
          captures,
          { title: presentationTitle },
        );

        const blob = await requestPresentationExport(format, payload);
        const extension = format === 'pdf' ? 'pdf' : 'pptx';
        const filename = `${sanitizeFileName(presentationTitle)}.${extension}`;
        downloadBlob(blob, filename);

        toast.success(`${formatLabel(format)} exported successfully!`, {
          id: toastId,
          description: `Saved ${filename} to your device.`,
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      const description =
        error instanceof Error ? error.message : 'Please try again or contact support.';
      toast.error(`Failed to export ${formatLabel(format).toLowerCase()}`, {
        id: toastId,
        description,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Presentation</DialogTitle>
          <DialogDescription>
            Choose a format to export your {totalSlides} slide presentation
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4">
          <Button
            variant="outline"
            className="justify-start h-auto py-4"
            onClick={() => handleExport('pdf')}
            disabled={isExporting}
          >
            <div className="flex items-start gap-3 w-full">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-red-600" />
              </div>
              <div className="text-left">
                <div className="font-semibold">PDF Document</div>
                <div className="text-xs text-muted-foreground">
                  Export as a PDF file for sharing and printing
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-4"
            onClick={() => handleExport('pptx')}
            disabled={isExporting}
          >
            <div className="flex items-start gap-3 w-full">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Presentation className="h-5 w-5 text-orange-600" />
              </div>
              <div className="text-left">
                <div className="font-semibold">PowerPoint (.pptx)</div>
                <div className="text-xs text-muted-foreground">
                  Export as Microsoft PowerPoint presentation
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-4"
            onClick={() => handleExport('images')}
            disabled={isExporting}
          >
            <div className="flex items-start gap-3 w-full">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Image className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-left">
                <div className="font-semibold">Image Files (PNG)</div>
                <div className="text-xs text-muted-foreground">
                  Export each slide as separate PNG images
                </div>
              </div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
