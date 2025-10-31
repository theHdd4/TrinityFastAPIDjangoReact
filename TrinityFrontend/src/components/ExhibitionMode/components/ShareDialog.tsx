import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Share2,
  Link2,
  Copy,
  Check,
  Loader2,
  Download,
  Image as ImageIcon,
  FileText,
  Printer,
  Presentation,
  Info,
  RefreshCcw,
  Code,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

import { createExhibitionShareLink } from '@/lib/shareLinks';
import { getActiveProjectContext } from '@/utils/projectEnv';
import {
  prepareSlidesForExport,
  buildPresentationExportPayload,
  downloadSlidesAsImages,
  requestPresentationExport,
  sanitizeFileName,
  downloadBlob,
  type PreparedSlidesForExport,
  type PdfExportMode,
} from '../utils/export';
import { useExhibitionStore, resolveCardTitle } from '../store/exhibitionStore';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName?: string;
}

type DownloadKind = 'png' | 'jpeg' | 'pdf-digital' | 'pdf-print' | 'pptx';
type DownloadPhase = 'idle' | 'preparing' | 'downloading' | 'success' | 'error';

type DownloadStatus = {
  phase: DownloadPhase;
  message?: string;
};

type DownloadMetadata = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const DOWNLOAD_METADATA: Record<DownloadKind, DownloadMetadata> = {
  png: {
    label: 'PNG image set',
    description: 'Client-side capture for quick sharing',
    icon: ImageIcon,
  },
  jpeg: {
    label: 'JPEG image set',
    description: 'Optimised for lightweight previews',
    icon: ImageIcon,
  },
  'pdf-digital': {
    label: 'Digital PDF',
    description: 'Flattened slides for on-screen viewing',
    icon: FileText,
  },
  'pdf-print': {
    label: 'Print PDF',
    description: 'Vector-rendered for high fidelity output',
    icon: Printer,
  },
  pptx: {
    label: 'PowerPoint',
    description: 'Editable deck rebuilt from slide JSON',
    icon: Presentation,
  },
};

const PHASE_LABELS: Record<DownloadPhase, string> = {
  idle: 'Ready',
  preparing: 'Preparing…',
  downloading: 'Downloading…',
  success: 'Completed',
  error: 'Retry required',
};

const PROGRESS_BY_PHASE: Record<DownloadPhase, number> = {
  idle: 0,
  preparing: 24,
  downloading: 72,
  success: 100,
  error: 100,
};

const BAR_COLOR_BY_PHASE: Record<DownloadPhase, string> = {
  idle: 'bg-primary/40',
  preparing: 'bg-primary',
  downloading: 'bg-primary',
  success: 'bg-emerald-500',
  error: 'bg-destructive',
};

const PHASE_TEXT_COLOR: Record<DownloadPhase, string> = {
  idle: 'text-muted-foreground',
  preparing: 'text-primary',
  downloading: 'text-primary',
  success: 'text-emerald-600',
  error: 'text-destructive',
};

const buildInitialDownloadState = (): Record<DownloadKind, DownloadStatus> => ({
  png: { phase: 'idle' },
  jpeg: { phase: 'idle' },
  'pdf-digital': { phase: 'idle' },
  'pdf-print': { phase: 'idle' },
  pptx: { phase: 'idle' },
});

const resolveShareLink = (link: string): string => {
  if (!link) {
    return '';
  }

  if (/^https?:\/\//i.test(link)) {
    return link;
  }

  if (typeof window !== 'undefined') {
    const prefix = link.startsWith('/') ? '' : '/';
    return `${window.location.origin}${prefix}${link}`;
  }

  return link;
};

type CopyToClipboardOptions = {
  fallbackTarget?: HTMLInputElement | HTMLTextAreaElement | null;
};

const copyToClipboard = async (text: string, options?: CopyToClipboardOptions) => {
  const fallbackTarget = options?.fallbackTarget ?? null;

  const attemptNativeClipboard = async () => {
    if (
      typeof navigator === 'undefined' ||
      typeof window === 'undefined' ||
      !window.isSecureContext ||
      !navigator.clipboard?.writeText
    ) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const attemptWithTarget = () => {
    if (!fallbackTarget) {
      return false;
    }

    const element = fallbackTarget;
    const wasReadOnly = 'readOnly' in element ? element.readOnly : false;
    const wasDisabled = 'disabled' in element ? element.disabled : false;
    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    if ('readOnly' in element) {
      element.readOnly = false;
    }
    if ('disabled' in element) {
      element.disabled = false;
    }

    try {
      element.focus();
    } catch {
      /* ignore */
    }

    element.select();
    let successful = false;

    try {
      successful = document.execCommand('copy');
    } catch {
      successful = false;
    }

    const caretPosition = element.value.length;
    try {
      element.setSelectionRange(caretPosition, caretPosition);
    } catch {
      /* ignore */
    }

    if ('readOnly' in element) {
      element.readOnly = wasReadOnly;
    }
    if ('disabled' in element) {
      element.disabled = wasDisabled;
    }

    if (previouslyFocused && previouslyFocused !== element) {
      try {
        previouslyFocused.focus();
      } catch {
        /* ignore */
      }
    } else {
      element.blur();
    }

    return successful;
  };

  const attemptExecCommand = () => {
    if (typeof document === 'undefined') {
      return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let successful = false;
    try {
      successful = document.execCommand('copy');
    } catch {
      successful = false;
    }

    document.body.removeChild(textarea);
    return successful;
  };

  if (await attemptNativeClipboard()) {
    return;
  }
  if (attemptWithTarget()) {
    return;
  }
  if (attemptExecCommand()) {
    return;
  }

  throw new Error('Copy not supported');
};

interface DownloadStatusBarProps {
  entries: Array<[DownloadKind, DownloadStatus]>;
}

const DownloadStatusBar: React.FC<DownloadStatusBarProps> = ({ entries }) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="px-6 pt-4">
      <div className="rounded-xl border border-border/60 bg-muted/40 p-4 space-y-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Info className="h-3.5 w-3.5" />
          <span>Download status</span>
        </div>
        <div className="space-y-4">
          {entries.map(([kind, status]) => {
            const metadata = DOWNLOAD_METADATA[kind];
            const Icon = metadata.icon;
            const progress = PROGRESS_BY_PHASE[status.phase];
            const barColor = BAR_COLOR_BY_PHASE[status.phase];
            const textColor = PHASE_TEXT_COLOR[status.phase];

            return (
              <div key={kind} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    <span>{metadata.label}</span>
                  </div>
                  <span className={`font-medium ${textColor}`}>{PHASE_LABELS[status.phase]}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {status.message && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{status.message}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const usePresentationTitle = (): string => {
  const exhibitedCards = useExhibitionStore(state => state.exhibitedCards);
  return useMemo(() => {
    const firstCard = exhibitedCards[0];
    if (!firstCard) {
      return 'Exhibition Presentation';
    }
    const resolved = resolveCardTitle(firstCard, firstCard.atoms ?? []);
    const trimmed = resolved?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : 'Exhibition Presentation';
  }, [exhibitedCards]);
};

const usePreparedSlides = () => {
  const exhibitedCards = useExhibitionStore(state => state.exhibitedCards);
  const slideObjectsByCardId = useExhibitionStore(state => state.slideObjectsByCardId);

  return {
    exhibitedCards,
    slideObjectsByCardId,
  };
};

export const ShareDialog: React.FC<ShareDialogProps> = ({ open, onOpenChange, projectName }) => {
  const [shareLink, setShareLink] = useState('');
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const generationIdRef = useRef(0);
  const isMountedRef = useRef(false);
  const shareLinkInputRef = useRef<HTMLInputElement | null>(null);
  const [downloadState, setDownloadState] = useState<Record<DownloadKind, DownloadStatus>>(
    () => buildInitialDownloadState(),
  );
  const downloadTimeoutsRef = useRef<Partial<Record<DownloadKind, number>>>({});

  const { exhibitedCards, slideObjectsByCardId } = usePreparedSlides();
  const presentationTitle = usePresentationTitle();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      Object.values(downloadTimeoutsRef.current).forEach(handle => {
        if (typeof handle === 'number') {
          window.clearTimeout(handle);
        }
      });
      downloadTimeoutsRef.current = {};
    };
  }, []);

  const resetDownloadState = useCallback(() => {
    setDownloadState(buildInitialDownloadState());
    Object.keys(downloadTimeoutsRef.current).forEach(key => {
      const handle = downloadTimeoutsRef.current[key as DownloadKind];
      if (typeof handle === 'number') {
        window.clearTimeout(handle);
      }
      delete downloadTimeoutsRef.current[key as DownloadKind];
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setShareLink('');
      setShareError(null);
      setShareExpiresAt(null);
      setCopied(false);
      setEmbedCopied(false);
      resetDownloadState();
    }
  }, [open, resetDownloadState]);

  const scheduleDownloadReset = useCallback(
    (kind: DownloadKind, delay = 3500) => {
      const existing = downloadTimeoutsRef.current[kind];
      if (typeof existing === 'number') {
        window.clearTimeout(existing);
      }
      downloadTimeoutsRef.current[kind] = window.setTimeout(() => {
        setDownloadState(prev => {
          if (prev[kind].phase === 'idle') {
            return prev;
          }
          return { ...prev, [kind]: { phase: 'idle' } };
        });
        delete downloadTimeoutsRef.current[kind];
      }, delay);
    },
    [],
  );

  const setDownloadPhase = useCallback(
    (kind: DownloadKind, phase: DownloadPhase, message?: string) => {
      setDownloadState(prev => ({
        ...prev,
        [kind]: { phase, message },
      }));
    },
    [],
  );

  const runShareLinkGeneration = useCallback(async () => {
    const context = getActiveProjectContext();
    const generationId = (generationIdRef.current += 1);

    setIsGenerating(true);
    setShareError(null);
    setShareExpiresAt(null);
    setCopied(false);
    setEmbedCopied(false);

    if (!context) {
      if (isMountedRef.current && generationId === generationIdRef.current) {
        setShareLink('');
        setIsGenerating(false);
        setShareError('Connect to a project to generate a share link.');
      }
      return;
    }

    try {
      const response = await createExhibitionShareLink(context);
      if (!isMountedRef.current || generationId !== generationIdRef.current) {
        return;
      }

      const resolvedLink = resolveShareLink(response.share_url);
      setShareLink(resolvedLink);
      setShareExpiresAt(response.expires_at);
    } catch (error) {
      if (!isMountedRef.current || generationId !== generationIdRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Failed to generate share link';
      setShareLink('');
      setShareExpiresAt(null);
      setShareError(message);
      toast.error('Unable to generate share link', { description: message });
    } finally {
      if (isMountedRef.current && generationId === generationIdRef.current) {
        setIsGenerating(false);
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      void runShareLinkGeneration();
    }
  }, [open, runShareLinkGeneration]);

  const expiresLabel = useMemo(() => {
    if (!shareExpiresAt) {
      return null;
    }
    try {
      return new Date(shareExpiresAt).toLocaleString();
    } catch {
      return shareExpiresAt;
    }
  }, [shareExpiresAt]);

  const embedCode = useMemo(() => {
    if (!shareLink) {
      return '';
    }
    return `<iframe src="${shareLink}" width="100%" height="600" allowfullscreen></iframe>`;
  }, [shareLink]);

  const handleCopyLink = useCallback(async () => {
    if (!shareLink || isGenerating) {
      return;
    }
    try {
      await copyToClipboard(shareLink, { fallbackTarget: shareLinkInputRef.current });
      setCopied(true);
      toast.success('Link copied to clipboard');
      window.setTimeout(() => {
        if (isMountedRef.current) {
          setCopied(false);
        }
      }, 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to copy the link.';
      toast.error('Unable to copy the link. Please copy it manually.', { description: message });
    }
  }, [shareLink, isGenerating]);

  const handleCopyEmbed = useCallback(async () => {
    if (!embedCode || isGenerating) {
      return;
    }
    try {
      await copyToClipboard(embedCode);
      setEmbedCopied(true);
      toast.success('Embed code copied');
      window.setTimeout(() => {
        if (isMountedRef.current) {
          setEmbedCopied(false);
        }
      }, 2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to copy the embed code.';
      toast.error('Unable to copy the embed code. Please copy it manually.', { description: message });
    }
  }, [embedCode, isGenerating]);

  const ensureSlidesAvailable = useCallback(() => {
    if (exhibitedCards.length === 0) {
      toast.error('Add a slide to your exhibition before exporting.');
      return false;
    }
    return true;
  }, [exhibitedCards.length]);

  const prepareSlides = useCallback(
    async (options: Parameters<typeof prepareSlidesForExport>[1]): Promise<PreparedSlidesForExport> => {
      const prepared = await prepareSlidesForExport(exhibitedCards, options);
      if (!prepared) {
        throw new Error('Unable to prepare slides for export.');
      }
      if (prepared.domSnapshots.size !== exhibitedCards.length && options?.includeDomSnapshot) {
        throw new Error('We could not prepare every slide for export. Please try again.');
      }
      return prepared;
    },
    [exhibitedCards],
  );

  const triggerImageDownload = useCallback(
    async (format: 'png' | 'jpeg') => {
      const kind: DownloadKind = format === 'png' ? 'png' : 'jpeg';
      if (!ensureSlidesAvailable()) {
        return;
      }
      setDownloadPhase(kind, 'preparing', 'Preparing slides for capture…');
      try {
        const prepared = await prepareSlides({
          captureImages: true,
          includeDomSnapshot: false,
          pixelRatio: format === 'png' ? 3 : 2,
        });

        if (prepared.captures.length === 0) {
          throw new Error('No slides were captured.');
        }

        setDownloadPhase(kind, 'downloading', 'Downloading slides to your device…');
        await downloadSlidesAsImages(prepared.captures, presentationTitle, {
          format,
          quality: format === 'jpeg' ? 0.9 : undefined,
        });

        setDownloadPhase(kind, 'success', `${prepared.captures.length} ${format.toUpperCase()} files saved.`);
        toast.success(
          `Downloaded ${prepared.captures.length} ${format.toUpperCase()} ${
            prepared.captures.length === 1 ? 'file' : 'files'
          }.`,
        );
        scheduleDownloadReset(kind);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to download slides.';
        setDownloadPhase(kind, 'error', message);
        toast.error('Image export failed', { description: message });
        scheduleDownloadReset(kind, 6000);
      }
    },
    [ensureSlidesAvailable, prepareSlides, presentationTitle, scheduleDownloadReset, setDownloadPhase],
  );

const buildExportPayload = useCallback(
  async (prepared: PreparedSlidesForExport) =>
    buildPresentationExportPayload(exhibitedCards, slideObjectsByCardId, prepared, {
      title: presentationTitle,
    }),
  [exhibitedCards, slideObjectsByCardId, presentationTitle],
);

  const triggerPdfDownload = useCallback(
    async (mode: PdfExportMode) => {
      const kind: DownloadKind = mode === 'print' ? 'pdf-print' : 'pdf-digital';
      if (!ensureSlidesAvailable()) {
        return;
      }

      setDownloadPhase(
        kind,
        'preparing',
        mode === 'print' ? 'Rendering print-optimised vectors…' : 'Preparing digital PDF…',
      );

      try {
        const prepared = await prepareSlides({
          captureImages: true,
          includeDomSnapshot: true,
          pixelRatio: mode === 'digital' ? 3 : 2,
        });
        const payload = await buildExportPayload(prepared);

        setDownloadPhase(kind, 'downloading', 'Packaging document for download…');
        const blob = await requestPresentationExport('pdf', payload, { pdfMode: mode });

        const filename = `${sanitizeFileName(presentationTitle)}-${mode}.pdf`;
        downloadBlob(blob, filename);

        setDownloadPhase(
          kind,
          'success',
          mode === 'print'
            ? 'Print-ready PDF exported with vector fidelity.'
            : 'Digital PDF exported successfully.',
        );
        toast.success('PDF export complete', { description: `Saved ${filename}` });
        scheduleDownloadReset(kind);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to export PDF.';
        setDownloadPhase(kind, 'error', message);
        toast.error('PDF export failed', { description: message });
        scheduleDownloadReset(kind, 6000);
      }
    },
    [
      buildExportPayload,
      ensureSlidesAvailable,
      presentationTitle,
      prepareSlides,
      scheduleDownloadReset,
      setDownloadPhase,
    ],
  );

  const triggerPptxDownload = useCallback(async () => {
    const kind: DownloadKind = 'pptx';
    if (!ensureSlidesAvailable()) {
      return;
    }

    setDownloadPhase(kind, 'preparing', 'Rebuilding editable slide deck…');
    try {
      const prepared = await prepareSlides({
        captureImages: true,
        includeDomSnapshot: true,
        pixelRatio: 2,
      });
      const payload = await buildExportPayload(prepared);

      setDownloadPhase(kind, 'downloading', 'Creating PowerPoint file…');
      const blob = await requestPresentationExport('pptx', payload);
      const filename = `${sanitizeFileName(presentationTitle)}.pptx`;
      downloadBlob(blob, filename);

      setDownloadPhase(kind, 'success', 'PowerPoint deck downloaded.');
      toast.success('PowerPoint export complete', { description: `Saved ${filename}` });
      scheduleDownloadReset(kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export PowerPoint deck.';
      setDownloadPhase(kind, 'error', message);
      toast.error('PowerPoint export failed', { description: message });
      scheduleDownloadReset(kind, 6000);
    }
  }, [
    buildExportPayload,
    ensureSlidesAvailable,
    presentationTitle,
    prepareSlides,
    scheduleDownloadReset,
    setDownloadPhase,
  ]);

  const activeDownloadStatuses = useMemo(
    () =>
      (Object.entries(downloadState) as Array<[DownloadKind, DownloadStatus]>).filter(
        ([, status]) => status.phase !== 'idle',
      ),
    [downloadState],
  );

  const resolvedProjectName = projectName ?? presentationTitle;

  const shareLinkUnavailable = !shareLink && !isGenerating;

  const renderExportButton = (
    kind: DownloadKind,
    onClick: () => void,
  ) => {
    const metadata = DOWNLOAD_METADATA[kind];
    const status = downloadState[kind];
    const isBusy = status.phase === 'preparing' || status.phase === 'downloading';
    const Icon = metadata.icon;
    const trailingIcon = isBusy ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : status.phase === 'success' ? (
      <Check className="h-4 w-4 text-emerald-500" />
    ) : null;

    return (
      <Button
        key={kind}
        variant="outline"
        className="w-full justify-between items-center p-4 h-auto border border-border/70 bg-card hover:bg-muted transition-colors"
        disabled={isBusy}
        onClick={onClick}
      >
        <span className="flex items-center gap-3 text-left">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <span className="space-y-1">
            <span className="text-sm font-semibold text-foreground block">{metadata.label}</span>
            <span className="text-xs text-muted-foreground block">{metadata.description}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {trailingIcon}
          <span>{PHASE_LABELS[status.phase]}</span>
        </span>
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 bg-muted/20">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share {resolvedProjectName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Publish a read-only exhibition link or export Canva-style assets across PNG, PDF, and
            PowerPoint with Trinity's hybrid renderer.
          </p>
        </DialogHeader>

        <DownloadStatusBar entries={activeDownloadStatuses} />

        <Tabs defaultValue="share" className="w-full">
          <div className="px-6 pt-4">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger
                value="share"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Share2 className="h-4 w-4 mr-2" /> Share
              </TabsTrigger>
              <TabsTrigger
                value="export"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Download className="h-4 w-4 mr-2" /> Export
              </TabsTrigger>
              <TabsTrigger
                value="embed"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Code className="h-4 w-4 mr-2" /> Embed
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="share" className="px-6 py-4 space-y-4">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a secure exhibition link that mirrors the live canvas in read-only mode.
              </p>
              <div className="flex items-start gap-3 p-4 rounded-lg border border-border/60 bg-muted/40">
                <Link2 className="h-5 w-5 text-muted-foreground mt-1" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">Anyone with the link</p>
                      <p className="text-xs text-muted-foreground">
                        {shareError ? 'Link unavailable' : 'Can view this exhibition experience'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => void runShareLinkGeneration()}
                      disabled={isGenerating}
                      title="Generate a new share link"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={shareLink}
                      readOnly
                      placeholder={isGenerating ? 'Generating link…' : 'No share link available'}
                      className="flex-1 h-10 text-sm bg-background"
                      ref={shareLinkInputRef}
                    />
                    <Button
                      onClick={handleCopyLink}
                      variant="secondary"
                      className="h-10 px-4"
                      disabled={shareLinkUnavailable || isGenerating}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" /> Copy link
                        </>
                      )}
                    </Button>
                  </div>

                  {isGenerating && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Generating secure link…
                    </p>
                  )}

                  {shareError && !isGenerating && (
                    <p className="text-xs text-destructive">{shareError}</p>
                  )}

                  {!shareError && !isGenerating && shareLink && (
                    <p className="text-xs text-muted-foreground">
                      Share this exhibition with anyone—no login required.
                    </p>
                  )}

                  {expiresLabel && !shareError && (
                    <p className="text-xs text-muted-foreground">Expires on {expiresLabel}</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="export" className="px-6 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Trinity mirrors Canva's hybrid export pipeline: instant client-side captures for speed,
              server rendering for fidelity, and editable PPTX rebuilt from structured slide JSON.
            </p>
            <div className="grid gap-3">
              {renderExportButton('png', () => {
                void triggerImageDownload('png');
              })}
              {renderExportButton('jpeg', () => {
                void triggerImageDownload('jpeg');
              })}
              {renderExportButton('pdf-digital', () => {
                void triggerPdfDownload('digital');
              })}
              {renderExportButton('pdf-print', () => {
                void triggerPdfDownload('print');
              })}
              {renderExportButton('pptx', () => {
                void triggerPptxDownload();
              })}
            </div>
          </TabsContent>

          <TabsContent value="embed" className="px-6 py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Embed this exhibition on an internal portal or customer workspace.
            </p>
            <div className="bg-muted border border-border/60 rounded-lg p-3 font-mono text-xs min-h-[96px] overflow-x-auto">
              {shareError
                ? 'Embed code unavailable until a share link is generated.'
                : embedCode || (isGenerating ? 'Generating embed code…' : 'Generate a share link to view the embed code.')}
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleCopyEmbed}
              disabled={!embedCode || isGenerating}
            >
              {embedCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" /> Copy embed code
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="px-6 py-4 border-t border-border/60 bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Exports stay resilient—even if the renderer is busy we fall back to html2canvas captures
            so exhibition mode never blocks.
          </span>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;

