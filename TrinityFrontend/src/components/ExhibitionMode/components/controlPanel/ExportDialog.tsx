import React, { useState } from 'react';
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
import { useExhibitionStore } from '../../store/exhibitionStore';
import { exportToPowerPoint, exportToPDF, exportAsImages } from './exportUtils';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSlides: number;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  totalSlides,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const exhibitedCards = useExhibitionStore(state => state.exhibitedCards);
  const slideObjectsByCardId = useExhibitionStore(state => state.slideObjectsByCardId);

  const handleExport = async (format: 'PDF' | 'PowerPoint' | 'Images') => {
    if (exhibitedCards.length === 0) {
      toast.error('No slides to export');
      return;
    }

    setIsExporting(true);
    toast.loading(`Exporting presentation as ${format}...`);

    try {
      const slides = exhibitedCards.map(card => ({
        id: card.id,
        card,
        objects: slideObjectsByCardId[card.id] ?? [],
      }));

      switch (format) {
        case 'PowerPoint':
          await exportToPowerPoint(slides, 'Presentation');
          toast.success('PowerPoint exported successfully!');
          break;
        case 'PDF':
          await exportToPDF(slides, 'Presentation');
          toast.success('PDF exported successfully!');
          break;
        case 'Images':
          await exportAsImages(slides, 'Presentation');
          toast.success(`${slides.length} images exported successfully!`);
          break;
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(`Failed to export as ${format}. Please try again.`);
    } finally {
      setIsExporting(false);
      toast.dismiss();
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
