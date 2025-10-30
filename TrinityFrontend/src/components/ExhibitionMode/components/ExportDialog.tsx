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
import { useExhibitionStore } from '../store/exhibitionStore';
import {
  captureSlidesAsImages,
  exportAsImages,
  exportToPDF,
  exportToPowerPoint,
  hydrateSlidesWithAssets,
  prepareSlidesForExport,
  type SlideScreenshot,
} from '../utils/exportUtils';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSlides: number;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ open, onOpenChange, totalSlides }) => {
  const [isExporting, setIsExporting] = useState(false);
  const exhibitedCards = useExhibitionStore(state => state.exhibitedCards);
  const slideObjectsByCardId = useExhibitionStore(state => state.slideObjectsByCardId);
  const activeTheme = useExhibitionStore(state => state.activeTheme);

  const exportTitle = useMemo(() => {
    const firstTitledCard = exhibitedCards.find(
      card => typeof card.title === 'string' && card.title.trim().length > 0,
    );
    return firstTitledCard?.title?.trim() ?? 'Exhibition Presentation';
  }, [exhibitedCards]);

  const handleExport = async (format: 'PDF' | 'PowerPoint' | 'Images') => {
    if (exhibitedCards.length === 0) {
      toast.error('No slides to export');
      return;
    }

    setIsExporting(true);
    toast.loading(`Exporting presentation as ${format}...`);

    try {
      const slides = prepareSlidesForExport(exhibitedCards, slideObjectsByCardId, activeTheme);
      const hydratedSlides = await hydrateSlidesWithAssets(slides);
      const captures = await captureSlidesAsImages(
        hydratedSlides.map(slide => slide.id),
        { backgroundColor: '#ffffff' },
      );

      const captureMap = new Map<string, SlideScreenshot>(
        captures.map(capture => [capture.id, capture]),
      );

      const orderedScreenshots: SlideScreenshot[] = hydratedSlides.map(slide =>
        captureMap.get(slide.id) ?? {
          id: slide.id,
          dataUrl: '',
          base64: '',
          mimeType: 'image/png',
          width: 0,
          height: 0,
          scale: 1,
        },
      );

      switch (format) {
        case 'PowerPoint':
          await exportToPowerPoint(hydratedSlides, exportTitle, orderedScreenshots);
          toast.dismiss();
          toast.success('PowerPoint exported successfully!');
          break;
        case 'PDF':
          await exportToPDF(hydratedSlides, exportTitle, orderedScreenshots);
          toast.dismiss();
          toast.success('PDF exported successfully!');
          break;
        case 'Images': {
          await exportAsImages(orderedScreenshots, exportTitle);
          toast.dismiss();
          toast.success(`${captures.length} images exported successfully!`);
          break;
        }
        default:
          toast.dismiss();
          toast.error('Unsupported export format.');
          return;
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.dismiss();
      toast.error(`Failed to export as ${format}. Please try again.`);
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
            onClick={() => handleExport('PDF')}
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
            onClick={() => handleExport('PowerPoint')}
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
            onClick={() => handleExport('Images')}
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
