import React from 'react';
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
  const handleExport = (format: string) => {
    toast.success(`Exporting presentation as ${format}...`);
    onOpenChange(false);
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
