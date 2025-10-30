import React, { useMemo, useState } from 'react';
import { Download, FileText, Image, Presentation, Sparkles, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import { useExhibitionStore, resolveCardTitle } from '../store/exhibitionStore';
import {
  prepareSlidesForExport,
  buildPresentationExportPayload,
  downloadBlob,
  downloadSlidesAsImages,
  requestPresentationExport,
  sanitizeFileName,
  type PreparedSlidesForExport,
} from '../utils/export';

type ExportFormat = 'PDF' | 'PowerPoint' | 'Images';

type PresentationFormat = 'pdf' | 'pptx';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSlides: number;
}

const formatLabel = (format: ExportFormat) => {
  switch (format) {
    case 'PDF':
      return 'PDF document';
    case 'PowerPoint':
      return 'PowerPoint presentation';
    case 'Images':
      return 'PNG image set';
    default:
      return 'export';
  }
};

const presentationFormatFor = (format: ExportFormat): PresentationFormat =>
  format === 'PDF' ? 'pdf' : 'pptx';

export const ExportDialog: React.FC<ExportDialogProps> = ({ open, onOpenChange, totalSlides }) => {
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

  const ensureSlidesAvailable = (): boolean => {
    if (exhibitedCards.length === 0) {
      toast.error('No slides to export', {
        description: 'Add a slide to your exhibition before exporting.',
      });
      onOpenChange(false);
      return false;
    }
    return true;
  };

  const performSlidePreparation = async (format: ExportFormat): Promise<PreparedSlidesForExport | null> => {
    if (format === 'Images') {
      return prepareSlidesForExport(exhibitedCards, {
        captureImages: true,
        includeDomSnapshot: false,
        pixelRatio: 3,
      });
    }

    return prepareSlidesForExport(exhibitedCards, {
      captureImages: false,
      includeDomSnapshot: true,
      pixelRatio: format === 'PDF' ? 3 : 2,
    });
  };

  const handleExport = async (format: ExportFormat) => {
    if (!ensureSlidesAvailable()) {
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(`Exporting presentation as ${formatLabel(format)}...`);

    try {
      let prepared: PreparedSlidesForExport | null = null;

      if (format === 'Images') {
        prepared = await performSlidePreparation(format);
        if (!prepared || prepared.captures.length !== exhibitedCards.length) {
          throw new Error('We could not capture every slide for export. Please try again.');
        }

        await downloadSlidesAsImages(prepared.captures, presentationTitle);

        toast.success(`Downloaded ${prepared.captures.length} PNG ${prepared.captures.length === 1 ? 'file' : 'files'}.`, {
          id: toastId,
        });
        onOpenChange(false);
        return;
      }

      prepared = await performSlidePreparation(format);

      if (!prepared) {
        throw new Error('Unable to prepare slides for export.');
      }

      if (prepared.domSnapshots.size !== exhibitedCards.length) {
        throw new Error('We could not prepare every slide for export. Please try again.');
      }

      const payload = await buildPresentationExportPayload(
        exhibitedCards,
        slideObjectsByCardId,
        prepared,
        { title: presentationTitle },
      );

      const presentationFormat = presentationFormatFor(format);
      const blob = await requestPresentationExport(presentationFormat, payload);
      const filename = `${sanitizeFileName(presentationTitle)}.${presentationFormat}`;

      downloadBlob(blob, filename);

      toast.success(`${formatLabel(format)} exported successfully!`, {
        id: toastId,
        description: `Saved ${filename} to your device.`,
      });
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
      <DialogContent className="sm:max-w-2xl border-0 bg-gradient-to-br from-background via-background to-muted/20 shadow-2xl">
        <DialogHeader className="space-y-4 pb-6 border-b border-border/50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-secondary rounded-2xl blur-xl opacity-30 animate-pulse"></div>
                <div className="relative p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 border border-primary/20 shadow-lg">
                  <Download className="h-7 w-7 text-primary" strokeWidth={2.5} />
                </div>
              </div>
              <div>
                <DialogTitle className="text-3xl font-bold bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
                  Export Presentation
                </DialogTitle>
                <DialogDescription className="text-sm mt-2 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium">
                    {totalSlides} professional {totalSlides === 1 ? 'slide' : 'slides'} ready
                  </span>
                </DialogDescription>
              </div>
            </div>
            <Badge variant="secondary" className="text-xs px-3 py-1 bg-primary/10 text-primary border-primary/20">
              Premium
            </Badge>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-6">
          <Button
            variant="outline"
            className="group relative justify-start h-auto py-6 px-6 border-2 border-border hover:border-destructive/40 hover:shadow-xl transition-all duration-500 overflow-hidden bg-card/50 backdrop-blur"
            onClick={() => handleExport('PDF')}
            disabled={isExporting}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-destructive/0 via-destructive/10 to-destructive/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="flex items-center gap-5 w-full relative z-10">
              <div className="relative">
                <div className="absolute inset-0 bg-destructive/20 rounded-2xl blur-md group-hover:blur-xl transition-all duration-500"></div>
                <div className="relative p-4 bg-gradient-to-br from-destructive/20 to-destructive/10 rounded-2xl border border-destructive/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg">
                  <FileText className="h-7 w-7 text-destructive" strokeWidth={2.5} />
                </div>
              </div>

              <div className="text-left flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-lg">PDF Document</span>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 border-destructive/30 text-destructive">
                    Universal
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Perfect for sharing and printing with universal compatibility
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> High Quality
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Print Ready
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Secure
                  </span>
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="group relative justify-start h-auto py-6 px-6 border-2 border-border hover:border-primary/40 hover:shadow-xl transition-all duration-500 overflow-hidden bg-card/50 backdrop-blur"
            onClick={() => handleExport('PowerPoint')}
            disabled={isExporting}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="flex items-center gap-5 w-full relative z-10">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-md group-hover:blur-xl transition-all duration-500"></div>
                <div className="relative p-4 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl border border-primary/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg">
                  <Presentation className="h-7 w-7 text-primary" strokeWidth={2.5} />
                </div>
              </div>

              <div className="text-left flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-lg">PowerPoint Presentation</span>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 border-primary/30 text-primary">
                    Editable
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  Export as .pptx with full Microsoft Office and Google Slides support
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Fully Editable
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Professional
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Compatible
                  </span>
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="group relative justify-start h-auto py-6 px-6 border-2 border-border hover:border-accent/40 hover:shadow-xl transition-all duration-500 overflow-hidden bg-card/50 backdrop-blur"
            onClick={() => handleExport('Images')}
            disabled={isExporting}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-accent/0 via-accent/10 to-accent/0 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="flex items-center gap-5 w-full relative z-10">
              <div className="relative">
                <div className="absolute inset-0 bg-accent/20 rounded-2xl blur-md group-hover:blur-xl transition-all duration-500"></div>
                <div className="relative p-4 bg-gradient-to-br from-accent/20 to-accent/10 rounded-2xl border border-accent/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg">
                  <Image className="h-7 w-7 text-accent" strokeWidth={2.5} />
                </div>
              </div>

              <div className="text-left flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-bold text-lg">Image Files</span>
                  <Badge variant="outline" className="text-[10px] px-2 py-0 border-accent/30 text-accent">
                    HD Quality
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                  High-resolution PNG images • One file per slide for maximum flexibility
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> High Resolution
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Transparent BG
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Web Ready
                  </span>
                </div>
              </div>
            </div>
          </Button>
        </div>

        <div className="pt-4 border-t border-border/50">
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-3 w-3" />
            All exports maintain your original design and quality
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
