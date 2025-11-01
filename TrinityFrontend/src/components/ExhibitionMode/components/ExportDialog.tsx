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
  requestPresentationExport,
  sanitizeFileName,
  requestRenderedSlideScreenshots,
  downloadRenderedSlideScreenshots,
  renderSlidesClientSideForDownload,
  exportSlidesAsPdfClientSide,
  SlideRendererUnavailableError,
  type PreparedSlidesForExport,
  type RenderedSlideScreenshot,
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
        captureImages: false,
        includeDomSnapshot: true,
        pixelRatio: 3,
      }, slideObjectsByCardId);
    }

    return prepareSlidesForExport(exhibitedCards, {
      captureImages: true,
      includeDomSnapshot: true,
      pixelRatio: format === 'PDF' ? 3 : 2,
    }, slideObjectsByCardId);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!ensureSlidesAvailable()) {
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(`Exporting presentation as ${formatLabel(format)}...`);

    try {
      let prepared: PreparedSlidesForExport | null = null;

      prepared = await performSlidePreparation(format);

      if (!prepared) {
        throw new Error('Unable to prepare slides for export.');
      }

      if (prepared.domSnapshots.size !== exhibitedCards.length) {
        throw new Error('We could not prepare every slide for export. Please try again.');
      }

      if (format === 'Images') {
        if (!prepared.documentStyles) {
          throw new Error('We could not collect the styles required to render your slides.');
        }

        const payload = await buildPresentationExportPayload(
          exhibitedCards,
          slideObjectsByCardId,
          prepared,
          { title: presentationTitle },
        );

        let screenshots: RenderedSlideScreenshot[] | null = null;
        let usedClientFallback = false;

        try {
          screenshots = await requestRenderedSlideScreenshots(payload);
        } catch (error) {
          if (error instanceof SlideRendererUnavailableError) {
            console.warn(
              '[Exhibition Export] Server renderer unavailable, falling back to client capture',
              error,
            );
            usedClientFallback = true;
            try {
              screenshots = await renderSlidesClientSideForDownload(exhibitedCards, prepared);
            } catch (fallbackError) {
              console.error('[Exhibition Export] Client capture fallback failed', fallbackError);
              const fallbackMessage =
                fallbackError instanceof Error
                  ? fallbackError.message
                  : 'Unable to capture slides in the browser.';
              throw new Error(
                `${error.message}. Additionally, ${fallbackMessage}`,
              );
            }
          } else {
            throw error;
          }
        }

        if (!screenshots || screenshots.length === 0) {
          throw new Error('We could not generate slide images for download.');
        }

        if (screenshots.length !== exhibitedCards.length) {
          throw new Error('We were only able to render a subset of your slides.');
        }

        await downloadRenderedSlideScreenshots(screenshots, presentationTitle);

        toast.success(
          `Downloaded ${screenshots.length} PNG ${screenshots.length === 1 ? 'file' : 'files'}.`,
          {
            id: toastId,
            ...(usedClientFallback
              ? { description: 'Slides captured directly in your browser.' }
              : {}),
          },
        );
        onOpenChange(false);
        return;
      }

      const payload = await buildPresentationExportPayload(
        exhibitedCards,
        slideObjectsByCardId,
        prepared,
        { title: presentationTitle },
      );

      const presentationFormat = presentationFormatFor(format);
      if (format === 'PDF') {
        try {
          const blob = await requestPresentationExport(presentationFormat, payload);
          const filename = `${sanitizeFileName(presentationTitle)}.${presentationFormat}`;

          downloadBlob(blob, filename);

          toast.success(`${formatLabel(format)} exported successfully!`, {
            id: toastId,
            description: `Saved ${filename} to your device.`,
          });
          onOpenChange(false);
          return;
        } catch (error) {
          if (error instanceof SlideRendererUnavailableError) {
            console.warn(
              '[Exhibition Export] Server renderer unavailable for PDF, falling back to client capture',
              error,
            );
            try {
              const { fileName, slideCount } = await exportSlidesAsPdfClientSide(exhibitedCards, prepared, {
                title: presentationTitle,
              });

              toast.success(`${formatLabel(format)} exported successfully!`, {
                id: toastId,
                description:
                  slideCount > 0
                    ? `Saved ${fileName} to your device. Captured ${slideCount} ${
                        slideCount === 1 ? 'slide' : 'slides'
                      } directly in your browser.`
                    : `Saved ${fileName} to your device.`,
              });
              onOpenChange(false);
              return;
            } catch (fallbackError) {
              console.error('[Exhibition Export] Client-side PDF fallback failed', fallbackError);
              const fallbackMessage =
                fallbackError instanceof Error
                  ? fallbackError.message
                  : 'Unable to capture slides for PDF export in the browser.';
              throw new Error(`${error.message}. Additionally, ${fallbackMessage}`);
            }
          }

          throw error;
        }
      }

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
      <DialogContent className="sm:max-w-2xl border border-border/60 bg-background shadow-xl">
        <DialogHeader className="space-y-4 pb-5 border-b border-border/60">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-6 w-6" strokeWidth={2.25} />
              </div>
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/70">
                  Export options
                </span>
                <DialogTitle className="text-2xl font-semibold text-foreground">
                  Export presentation
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-foreground">
                    {totalSlides} {totalSlides === 1 ? 'slide' : 'slides'} ready
                  </span>
                </DialogDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="uppercase tracking-wide text-xs px-3 py-1 border-border/70 text-muted-foreground"
            >
              Premium
            </Badge>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-6">
          <Button
            variant="outline"
            className="justify-start h-auto py-5 px-5 border border-border/70 bg-card hover:bg-muted transition-colors"
            onClick={() => handleExport('PDF')}
            disabled={isExporting}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <FileText className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/70">
                  Portable Document Format
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">PDF document</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium px-2 py-0.5 bg-transparent text-destructive border-destructive/40"
                  >
                    Universal
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Perfect for sharing and printing with universal compatibility.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> High quality
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Print ready
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Secure output
                  </span>
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-5 px-5 border border-border/70 bg-card hover:bg-muted transition-colors"
            onClick={() => handleExport('PowerPoint')}
            disabled={isExporting}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Presentation className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/70">
                  Editable slide deck
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">PowerPoint presentation</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium px-2 py-0.5 bg-transparent text-primary border-primary/40"
                  >
                    Editable
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Export an editable .pptx deck ready for Microsoft Office or Google Slides.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Fully editable
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Chart &amp; table support
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Layout overlays
                  </span>
                </div>
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="justify-start h-auto py-5 px-5 border border-border/70 bg-card hover:bg-muted transition-colors"
            onClick={() => handleExport('Images')}
            disabled={isExporting}
          >
            <div className="flex items-center gap-4 w-full">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <Image className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="flex-1 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/70">
                  High resolution assets
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">Image files</span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-medium px-2 py-0.5 bg-transparent text-blue-600 border-blue-200"
                  >
                    PNG set
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Download each slide as a high-resolution PNG for flexible reuse.
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Retina ready
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Consistent sizing
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3" /> Slide-by-slide
                  </span>
                </div>
              </div>
            </div>
          </Button>
        </div>

        <div className="pt-4 border-t border-border/60">
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-2">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>All exports preserve your slide proportions and styling.</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
