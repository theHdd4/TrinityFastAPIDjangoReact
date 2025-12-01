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

type ExportFormat = 'PDF' | 'PowerPoint' | 'PowerPointHighFidelity' | 'Images';

type PresentationFormat = 'pdf' | 'pptx';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSlides: number;
  viewMode?: 'horizontal' | 'vertical';
  setViewMode?: (mode: 'horizontal' | 'vertical') => void;
}

const formatLabel = (format: ExportFormat) => {
  switch (format) {
    case 'PDF':
      return 'PDF document';
    case 'PowerPoint':
      return 'PowerPoint presentation (Low Fidelity)';
    case 'PowerPointHighFidelity':
      return 'PowerPoint presentation (High Fidelity)';
    case 'Images':
      return 'PNG image set';
    default:
      return 'export';
  }
};

const presentationFormatFor = (format: ExportFormat): PresentationFormat =>
  format === 'PDF' ? 'pdf' : 'pptx';

const getFidelityForFormat = (format: ExportFormat): 'low' | 'high' | undefined => {
  if (format === 'PowerPointHighFidelity') {
    return 'high';
  }
  if (format === 'PowerPoint') {
    return 'low';
  }
  return undefined;
};

export const ExportDialog: React.FC<ExportDialogProps> = ({ 
  open, 
  onOpenChange, 
  totalSlides,
  viewMode = 'horizontal',
  setViewMode,
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
    // NEW APPROACH: Always capture images directly from visible exhibition
    // This ensures charts are fully rendered before capture
    const pixelRatio = format === 'PDF' ? 3 : format === 'Images' ? 3 : 2;
    
    return prepareSlidesForExport(exhibitedCards, {
      captureImages: true, // Always capture images from visible exhibition
      includeDomSnapshot: format === 'Images', // Only need DOM snapshot for server-side fallback in Images format
      pixelRatio,
    }, slideObjectsByCardId);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!ensureSlidesAvailable()) {
      return;
    }

    setIsExporting(true);
    const toastId = toast.loading(`Capturing slides from exhibition...`);

    // CRITICAL: Temporarily switch to vertical view for export
    // This ensures consistent capture regardless of current navigation mode
    const originalViewMode = viewMode;
    let viewModeChanged = false;
    
    try {
      // Switch to vertical view if currently in horizontal mode
      if (viewMode === 'horizontal' && setViewMode) {
        console.log('[Exhibition Export] Switching to vertical view for export');
        setViewMode('vertical');
        viewModeChanged = true;
        
        // Wait for view mode change to take effect and slides to re-render
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Wait for slides to be visible in vertical view
        await new Promise(resolve => {
          const checkSlides = () => {
            const verticalSlides = document.querySelectorAll('[data-exhibition-slide-id]');
            if (verticalSlides.length > 0) {
              resolve(undefined);
            } else {
              setTimeout(checkSlides, 100);
            }
          };
          checkSlides();
        });
        
        // Additional wait for layout to stabilize
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // CRITICAL: Disable chart animations when export starts
      // This ensures charts render immediately without animation effects
      if (typeof window !== 'undefined') {
        (window as any).__disableChartAnimations = true;
        // Dispatch event to notify all charts
        window.dispatchEvent(new CustomEvent('disable-chart-animations'));
        console.log('[Exhibition Export] Chart animations disabled for export');
      }

      let prepared: PreparedSlidesForExport | null = null;

      // NEW APPROACH: Capture visible exhibition slides directly as images
      // Charts will render immediately without animations
      toast.loading(`Capturing visible exhibition slides as images...`, { id: toastId });
      prepared = await performSlidePreparation(format);

      if (!prepared) {
        throw new Error('Unable to prepare slides for export.');
      }

      // NEW APPROACH: Check captures length when using direct image capture
      // OLD APPROACH: Check domSnapshots size when using server-side rendering
      const hasCaptures = prepared.captures && prepared.captures.length > 0;
      const hasDomSnapshots = prepared.domSnapshots && prepared.domSnapshots.size > 0;
      
      if (hasCaptures) {
        // Using new approach: check captures
        if (prepared.captures.length !== exhibitedCards.length) {
          throw new Error(`We could not capture every slide for export. Captured ${prepared.captures.length} of ${exhibitedCards.length} slides. Please try again.`);
        }
      } else if (hasDomSnapshots) {
        // Using old approach: check domSnapshots
        if (prepared.domSnapshots.size !== exhibitedCards.length) {
          throw new Error('We could not prepare every slide for export. Please try again.');
        }
      } else {
        // Neither approach worked
        throw new Error('We could not prepare any slides for export. Please try again.');
      }

      if (format === 'Images') {
        // NEW APPROACH: If we have direct captures, use them immediately
        if (hasCaptures && prepared.captures.length === exhibitedCards.length) {
          console.log('[Exhibition Export] Using direct captures for Images export');
          const screenshots = prepared.captures.map(capture => ({
            id: capture.cardId,
            index: exhibitedCards.findIndex(card => card.id === capture.cardId),
            dataUrl: capture.dataUrl,
            width: capture.imageWidth,
            height: capture.imageHeight,
            cssWidth: capture.cssWidth,
            cssHeight: capture.cssHeight,
            pixelRatio: capture.pixelRatio,
          }));

          await downloadRenderedSlideScreenshots(screenshots, presentationTitle);

          toast.success(
            `Downloaded ${screenshots.length} PNG ${screenshots.length === 1 ? 'file' : 'files'}.`,
            {
              id: toastId,
              description: 'Slides captured directly from exhibition.',
            },
          );
          onOpenChange(false);
          return;
        }

        // Fallback: Use server-side rendering or hidden container method
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
      const fidelity = getFidelityForFormat(format);
      
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

      const blob = await requestPresentationExport(presentationFormat, payload, fidelity);
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
      
      // CRITICAL: Restore original view mode if it was changed
      if (viewModeChanged && setViewMode && originalViewMode) {
        console.log(`[Exhibition Export] Restoring view mode to ${originalViewMode}`);
        // Use setTimeout to restore view mode asynchronously (can't use await in finally)
        setTimeout(() => {
          setViewMode(originalViewMode);
        }, 100);
      }
      
      // CRITICAL: Re-enable chart animations after export completes
      if (typeof window !== 'undefined') {
        (window as any).__disableChartAnimations = false;
        // Dispatch event to notify all charts
        window.dispatchEvent(new CustomEvent('enable-chart-animations'));
        console.log('[Exhibition Export] Chart animations re-enabled after export');
      }
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

          {/* PowerPoint Section with Container Box and 1x2 Grid */}
          <div className="border border-border/70 bg-card rounded-lg py-5 px-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Presentation className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground/70">
                  Editable slide deck
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-base font-semibold text-foreground">PowerPoint presentation</span>
                </div>
              </div>
            </div>

            {/* PowerPoint Options - 1x2 Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* High Fidelity - First Position */}
              <Button
                variant="outline"
                className="justify-start h-auto py-4 px-3 border border-border/70 bg-background hover:bg-muted transition-colors text-left"
                onClick={() => handleExport('PowerPointHighFidelity')}
                disabled={isExporting}
              >
                <div className="flex flex-col gap-2 w-full" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      High Fidelity (PPTX)
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-medium px-1.5 py-0.5 bg-transparent text-primary border-primary/40 flex-shrink-0 flex items-center justify-center"
                    >
                      Pixel-perfect
                    </Badge>
                  </div>
                  <p 
                    className="text-xs text-muted-foreground text-left" 
                    style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}
                  >
                    Charts as images. Matches web version exactly.
                  </p>
                  <div className="mt-1 flex flex-col gap-1 text-[10px] text-muted-foreground">
                    <span className="flex items-start gap-1">
                      <Check className="h-3 w-3 flex-shrink-0 mt-0.5" /> 
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>Pixel-perfect charts</span>
                    </span>
                    <span className="flex items-start gap-1">
                      <Check className="h-3 w-3 flex-shrink-0 mt-0.5" /> 
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>High-quality images</span>
                    </span>
                    <span className="flex items-start gap-1">
                      <Check className="h-3 w-3 flex-shrink-0 mt-0.5" /> 
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>Web-accurate</span>
                    </span>
                  </div>
                </div>
              </Button>

              {/* Low Fidelity - Second Position */}
              <Button
                variant="outline"
                className="justify-start h-auto py-4 px-3 border border-border/70 bg-background hover:bg-muted transition-colors text-left"
                onClick={() => handleExport('PowerPoint')}
                disabled={isExporting}
              >
                <div className="flex flex-col gap-2 w-full" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                      Low Fidelity (PPTX)
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-medium px-1.5 py-0.5 bg-transparent text-primary border-primary/40 flex-shrink-0 flex items-center justify-center"
                    >
                      Fully editable
                    </Badge>
                  </div>
                  <p 
                    className="text-xs text-muted-foreground text-left" 
                    style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'normal' }}
                  >
                    Fully editable charts and text. Best for customization.
                  </p>
                  <div className="mt-1 flex flex-col gap-1 text-[10px] text-muted-foreground">
                    <span className="flex items-start gap-1">
                      <Check className="h-3 w-3 flex-shrink-0 mt-0.5" /> 
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>Editable charts</span>
                    </span>
                    <span className="flex items-start gap-1">
                      <Check className="h-3 w-3 flex-shrink-0 mt-0.5" /> 
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>Editable text</span>
                    </span>
                    <span className="flex items-start gap-1">
                      <Check className="h-3 w-3 flex-shrink-0 mt-0.5" /> 
                      <span style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>Full customization</span>
                    </span>
                  </div>
                </div>
              </Button>
            </div>
          </div>

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
