import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Share2,
  Download,
  Code,
  Link2,
  Copy,
  ChevronDown,
  BarChart3,
  Check,
  Loader2,
  RefreshCcw,
  ImageDown,
  Monitor,
  Printer,
  Presentation,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { createExhibitionShareLink } from '@/lib/shareLinks';
import { getActiveProjectContext } from '@/utils/projectEnv';
import {
  buildPresentationExportPayload,
  downloadBlob,
  downloadSlidesAsImages,
  prepareSlidesForExport,
  requestPresentationExport,
  sanitizeFileName,
  type PdfExportMode,
} from '../utils/export';
import { useExhibitionStore } from '../store/exhibitionStore';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName?: string;
}

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

  const attemptClipboardData = () => {
    if (typeof window === 'undefined') {
      return false;
    }

    type LegacyClipboard = { setData?: (format: string, data: string) => boolean | void };
    const clipboardData = (window as typeof window & { clipboardData?: LegacyClipboard }).clipboardData;
    if (!clipboardData?.setData) {
      return false;
    }

    try {
      const result = clipboardData.setData('Text', text);
      return result !== false;
    } catch (error) {
      console.warn('window.clipboardData.setData failed', error);
      return false;
    }
  };

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
    } catch (error) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand', error);
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
    const previouslyFocused = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    if ('readOnly' in element) {
      element.readOnly = false;
    }

    if ('disabled' in element) {
      element.disabled = false;
    }

    try {
      element.focus();
    } catch (error) {
      console.warn('focus on fallback target failed', error);
    }

    element.select();

    let successful = false;

    try {
      successful = document.execCommand('copy');
    } catch (error) {
      console.warn('document.execCommand copy via fallback target failed', error);
      successful = false;
    }

    const caretPosition = element.value.length;
    try {
      element.setSelectionRange(caretPosition, caretPosition);
    } catch (error) {
      console.warn('setSelectionRange on fallback target failed', error);
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
      } catch (error) {
        console.warn('unable to restore focus after clipboard copy', error);
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
    } catch (error) {
      console.warn('document.execCommand copy failed', error);
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

  if (attemptClipboardData()) {
    return;
  }

  throw new Error('Copy not supported');
};

type DownloadKind = 'images' | 'pdf-digital' | 'pdf-print' | 'pptx';

type DownloadStatus =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'downloading'
  | 'complete'
  | 'error';

type DownloadEntry = {
  id: string;
  kind: DownloadKind;
  label: string;
  status: DownloadStatus;
  progress: number;
  message?: string;
  timestamp: number;
};

type ExportOption = {
  kind: DownloadKind;
  title: string;
  description: string;
  badge: string;
  footnote: string;
  icon: LucideIcon;
};

const DOWNLOAD_LABELS: Record<DownloadKind, string> = {
  images: 'PNG/JPEG image bundle',
  'pdf-digital': 'Digital media PDF',
  'pdf-print': 'Print-ready PDF',
  pptx: 'Editable PowerPoint deck',
};

const STATUS_LABELS: Record<DownloadStatus, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  rendering: 'Rendering',
  downloading: 'Downloading',
  complete: 'Complete',
  error: 'Failed',
};

const pdfModeByKind: Partial<Record<DownloadKind, PdfExportMode>> = {
  'pdf-digital': 'digital',
  'pdf-print': 'print',
};

const requiresImageCapture = (kind: DownloadKind): boolean => kind === 'images' || kind === 'pdf-digital';

const statusAccentClass = (status: DownloadStatus): string => {
  if (status === 'error') {
    return 'text-destructive';
  }
  if (status === 'complete') {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return 'text-muted-foreground';
};

const DownloadStatusBar: React.FC<{ downloads: DownloadEntry[] }> = ({ downloads }) => {
  const items = downloads.slice(-4).reverse();

  return (
    <div className="px-6 py-4 border-t border-border/60 bg-muted/40 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Share2 className="h-3 w-3" />
        <span>Download status</span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Export slides to monitor progress and delivery of each format in real time.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="space-y-1 rounded-md border border-border/40 bg-background/60 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{item.label}</span>
                <span className={statusAccentClass(item.status)}>{STATUS_LABELS[item.status]}</span>
              </div>
              <Progress value={item.progress} className="h-2" />
              {item.message && (
                <p
                  className={`text-[11px] leading-relaxed ${
                    item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {item.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onOpenChange,
  projectName = 'Exhibition Project',
}) => {
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [hideBadge, setHideBadge] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const generationIdRef = useRef(0);
  const isMountedRef = useRef(false);
  const shareLinkInputRef = useRef<HTMLInputElement | null>(null);
  const { exhibitedCards, slideObjectsByCardId } = useExhibitionStore(state => ({
    exhibitedCards: state.exhibitedCards,
    slideObjectsByCardId: state.slideObjectsByCardId,
  }));
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [activeDownload, setActiveDownload] = useState<{ id: string; kind: DownloadKind } | null>(null);
  const hasSlides = exhibitedCards.length > 0;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
      console.error('Failed to generate share link', error);
      const message = error instanceof Error ? error.message : 'Failed to generate share link';
      setShareLink('');
      setShareExpiresAt(null);
      setShareError(message);
      toast.error('Unable to generate share link');
    } finally {
      if (isMountedRef.current && generationId === generationIdRef.current) {
        setIsGenerating(false);
      }
    }
  }, [toast]);

  useEffect(() => {
    if (open) {
      void runShareLinkGeneration();
    }
  }, [open, runShareLinkGeneration]);

  useEffect(() => {
    if (open) {
      return;
    }

    if (shareLink !== '') {
      setShareLink('');
    }

    if (shareExpiresAt !== null) {
      setShareExpiresAt(null);
    }

    if (shareError !== null) {
      setShareError(null);
    }

    if (copied) {
      setCopied(false);
    }

    if (embedCopied) {
      setEmbedCopied(false);
    }

    if (isGenerating) {
      setIsGenerating(false);
    }
  }, [open, shareLink, shareExpiresAt, shareError, copied, embedCopied, isGenerating]);

  const handleGenerateNewLink = useCallback(() => {
    void runShareLinkGeneration();
  }, [runShareLinkGeneration]);

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

    return `<iframe src="${shareLink}" width="100%" height="600"></iframe>`;
  }, [shareLink]);

  const handleCopyLink = useCallback(async () => {
    if (!shareLink || isGenerating) {
      return;
    }

    try {
      await copyToClipboard(shareLink, { fallbackTarget: shareLinkInputRef.current });
      setCopied(true);
      toast.success('Link copied to clipboard');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          if (isMountedRef.current) {
            setCopied(false);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy share link', error);
      toast.error('Unable to copy the link. Please copy it manually.');
    }
  }, [shareLink, isGenerating, toast]);

  const handleCopyEmbed = useCallback(async () => {
    if (!embedCode || isGenerating) {
      return;
    }

    try {
      await copyToClipboard(embedCode);
      setEmbedCopied(true);
      toast.success('Embed code copied');
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          if (isMountedRef.current) {
            setEmbedCopied(false);
          }
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy embed code', error);
      toast.error('Unable to copy the embed code. Please copy it manually.');
    }
  }, [embedCode, isGenerating, toast]);

  const beginDownload = useCallback(
    (kind: DownloadKind): string => {
      const id = `${kind}-${Date.now()}`;
      const label = DOWNLOAD_LABELS[kind];
      setDownloads(prev => {
        const entry: DownloadEntry = {
          id,
          kind,
          label,
          status: 'queued',
          progress: 6,
          message: 'Queued for export…',
          timestamp: Date.now(),
        };
        const next = [...prev, entry];
        return next.slice(-8);
      });
      setActiveDownload({ id, kind });
      return id;
    },
    [],
  );

  const updateDownload = useCallback((id: string, patch: Partial<DownloadEntry>) => {
    setDownloads(prev =>
      prev.map(entry =>
        entry.id === id
          ? {
              ...entry,
              ...patch,
              timestamp: patch.timestamp ?? entry.timestamp,
            }
          : entry,
      ),
    );
  }, []);

  const completeDownload = useCallback(
    (id: string, message: string) => {
      updateDownload(id, {
        status: 'complete',
        progress: 100,
        message,
        timestamp: Date.now(),
      });
      setActiveDownload(null);
    },
    [updateDownload],
  );

  const failDownload = useCallback(
    (id: string, message: string) => {
      updateDownload(id, {
        status: 'error',
        progress: 8,
        message,
        timestamp: Date.now(),
      });
      setActiveDownload(null);
    },
    [updateDownload],
  );

  const handleExportDownload = useCallback(
    async (kind: DownloadKind) => {
      if (!hasSlides) {
        toast.error('No slides to export', {
          description: 'Add at least one exhibition slide before exporting.',
        });
        return;
      }

      if (activeDownload) {
        toast.error('Export already in progress', {
          description: 'Please wait for the current download to finish before starting another.',
        });
        return;
      }

      const downloadId = beginDownload(kind);

      try {
        updateDownload(downloadId, {
          status: 'preparing',
          progress: 14,
          message: 'Serialising slide layouts and theme data…',
        });

        const prepared = await prepareSlidesForExport(exhibitedCards, {
          captureImages: requiresImageCapture(kind),
          includeDomSnapshot: true,
          pixelRatio: requiresImageCapture(kind) ? 3 : 2,
        });

        if (!prepared) {
          throw new Error('Unable to prepare slides for export.');
        }

        if (requiresImageCapture(kind) && prepared.captures.length === 0) {
          throw new Error('Slide imagery could not be captured.');
        }

        updateDownload(downloadId, {
          status: 'rendering',
          progress: requiresImageCapture(kind) ? 36 : 32,
          message: requiresImageCapture(kind)
            ? 'Capturing high-resolution slide imagery with html2canvas…'
            : 'Normalising slide JSON for backend rendering…',
        });

        const payload = await buildPresentationExportPayload(
          exhibitedCards,
          slideObjectsByCardId,
          prepared,
          { title: projectName },
        );

        updateDownload(downloadId, {
          status: 'rendering',
          progress: 54,
          message: 'Packaging structured slide data for delivery…',
        });

        if (kind === 'images') {
          await downloadSlidesAsImages(prepared.captures, payload.title);
          completeDownload(
            downloadId,
            `Saved ${prepared.captures.length} ${prepared.captures.length === 1 ? 'image' : 'images'} to your device.`,
          );
          toast.success('Images downloaded', {
            description: 'Each slide was exported as a standalone PNG via html2canvas.',
          });
          return;
        }

        const pdfMode = pdfModeByKind[kind];
        const exportPayload = pdfMode ? { ...payload, pdfMode } : payload;

        if (kind === 'pptx') {
          updateDownload(downloadId, {
            status: 'downloading',
            progress: 72,
            message: 'Rebuilding an editable deck with python-pptx…',
          });
          const blob = await requestPresentationExport('pptx', exportPayload);
          const filename = `${sanitizeFileName(payload.title)}.pptx`;
          downloadBlob(blob, filename);
          completeDownload(downloadId, `Saved ${filename}.`);
          toast.success('PowerPoint ready', {
            description: 'Layout precision was preserved by converting pixel coordinates to inches.',
          });
          return;
        }

        updateDownload(downloadId, {
          status: 'downloading',
          progress: 72,
          message:
            pdfMode === 'print'
              ? 'Generating a vector print PDF with FastAPI + ReportLab…'
              : 'Flattening slide imagery into a digital PDF via FastAPI…',
        });

        const blob = await requestPresentationExport('pdf', exportPayload);
        const suffix = pdfMode === 'print' ? '-print' : '-digital';
        const filename = `${sanitizeFileName(payload.title)}${suffix}.pdf`;
        downloadBlob(blob, filename);
        completeDownload(
          downloadId,
          pdfMode === 'print'
            ? 'High-fidelity vector PDF ready for the press.'
            : 'Digital PDF generated from slide screenshots.',
        );
        toast.success('PDF exported', {
          description:
            pdfMode === 'print'
              ? 'ReportLab kept charts and typography crisp for print runs.'
              : 'FastAPI streamed a flattened PDF built from slide screenshots.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected export failure.';
        failDownload(downloadId, message);
        toast.error('Export failed', {
          description: message,
        });
      }
    },
    [
      activeDownload,
      beginDownload,
      completeDownload,
      exhibitedCards,
      failDownload,
      hasSlides,
      projectName,
      slideObjectsByCardId,
      toast,
      updateDownload,
    ],
  );

  const exportOptions = useMemo<ExportOption[]>(
    () => [
      {
        kind: 'images',
        title: 'Images (PNG/JPEG)',
        description:
          'Capture each slide instantly with html2canvas for quick PNG or JPEG downloads straight from the browser.',
        badge: 'Instant',
        footnote: 'Perfect for Slack threads, email recaps, and social snippets.',
        icon: ImageDown,
      },
      {
        kind: 'pdf-digital',
        title: 'PDF — Digital Media',
        description:
          'FastAPI assembles flattened PDFs from slide screenshots so every viewer sees the exact on-screen design.',
        badge: 'Digital',
        footnote: 'Optimised for devices, sharing portals, and lightweight attachments.',
        icon: Monitor,
      },
      {
        kind: 'pdf-print',
        title: 'PDF — Print',
        description:
          'ReportLab rebuilds the slide JSON as vector artwork for crisp, scalable print-ready documents.',
        badge: 'Print',
        footnote: 'Use for press proofs, large-format outputs, and production handoffs.',
        icon: Printer,
      },
      {
        kind: 'pptx',
        title: 'PowerPoint (PPTX)',
        description:
          'python-pptx reconstructs the structured layout data so charts, text, and shapes stay fully editable.',
        badge: 'Editable',
        footnote: 'Continue polishing in Microsoft PowerPoint or Google Slides without rebuilding layouts.',
        icon: Presentation,
      },
    ],
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share {projectName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="share" className="w-full">
          <div className="px-6">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger
                value="collaborate"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Users className="h-4 w-4 mr-2" />
                Collaborate
              </TabsTrigger>
              <TabsTrigger
                value="share"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </TabsTrigger>
              <TabsTrigger
                value="export"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </TabsTrigger>
              <TabsTrigger
                value="embed"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                <Code className="h-4 w-4 mr-2" />
                Embed
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="collaborate" className="px-6 py-4 mt-0">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Invite team members to collaborate on this exhibition project.
              </p>
              <Input placeholder="Enter email addresses..." />
              <Button className="w-full">Send Invitations</Button>
            </div>
          </TabsContent>

          <TabsContent value="share" className="px-6 py-4 mt-0 space-y-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/50">
                <Link2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">Anyone with the link</p>
                      <p className="text-xs text-muted-foreground">
                        {shareError ? 'Link unavailable' : 'Can view'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleGenerateNewLink}
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
                      className="flex-1 h-9 text-sm bg-background"
                      ref={shareLinkInputRef}
                    />
                    <Button
                      onClick={handleCopyLink}
                      variant="secondary"
                      className="h-9 px-4"
                      disabled={!shareLink || isGenerating}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy link
                        </>
                      )}
                    </Button>
                  </div>

                  {isGenerating && (
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Generating secure link…
                    </p>
                  )}

                  {shareError && !isGenerating && (
                    <p className="text-xs text-destructive">{shareError}</p>
                  )}

                  {!shareError && !isGenerating && shareLink && (
                    <p className="text-xs text-muted-foreground">
                      Share this read-only exhibition experience with anyone who has the link.
                    </p>
                  )}

                  {expiresLabel && !shareError && (
                    <p className="text-xs text-muted-foreground">Expires on {expiresLabel}</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  variant="ghost"
                  className="w-full justify-between p-0 h-auto hover:bg-transparent"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span className="font-medium text-sm">Advanced settings</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </Button>

                {showAdvanced && (
                  <div className="space-y-4 pt-2">
                    <Separator />

                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="hide-badge" className="text-sm font-medium">
                          Hide project badge
                        </Label>
                        <p className="text-xs text-muted-foreground">Remove branding from shared view</p>
                      </div>
                      <Switch id="hide-badge" checked={hideBadge} onCheckedChange={setHideBadge} />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="discoverable" className="text-sm font-medium">
                            Make discoverable on the web
                          </Label>
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">PRO</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Your project may appear in search results</p>
                      </div>
                      <Switch id="discoverable" checked={discoverable} onCheckedChange={setDiscoverable} />
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="password" className="text-sm font-medium">
                            Require a password to view
                          </Label>
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">PRO</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Add an extra layer of security</p>
                      </div>
                      <Switch id="password" checked={requirePassword} onCheckedChange={setRequirePassword} />
                    </div>

                    {requirePassword && <Input type="password" placeholder="Enter password..." className="h-9" />}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="export" className="px-6 py-4 mt-0 space-y-5">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground/80">
                Hybrid export pipeline
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Trinity mirrors Canva’s hybrid export architecture: html2canvas delivers instant PNG/JPEG captures in the
                browser, FastAPI streams PDFs as either flattened digital documents or vector-rich print files, and
                python-pptx rebuilds the slide JSON for fully editable decks.
              </p>
            </div>

            <div className="grid gap-3">
              {exportOptions.map(option => {
                const Icon = option.icon;
                const isActive = activeDownload?.kind === option.kind;
                const latest = (() => {
                  for (let index = downloads.length - 1; index >= 0; index -= 1) {
                    const entry = downloads[index];
                    if (entry.kind === option.kind) {
                      return entry;
                    }
                  }
                  return null;
                })();

                return (
                  <Button
                    key={option.kind}
                    variant="outline"
                    className="w-full justify-start h-auto py-4 px-4 border border-border/70 bg-card hover:bg-muted transition-colors"
                    onClick={() => handleExportDownload(option.kind)}
                    disabled={!hasSlides || Boolean(activeDownload)}
                  >
                    <div className="flex items-start gap-4 w-full">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {isActive ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 space-y-2 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-foreground">{option.title}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground/90">
                            {option.badge}
                          </span>
                          {isActive && (
                            <span className="flex items-center gap-1 text-xs text-primary">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              In progress…
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{option.description}</p>
                        <p className="text-xs text-muted-foreground/80">{option.footnote}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs">
                        <span className={latest ? statusAccentClass(latest.status) : 'text-muted-foreground'}>
                          {latest ? STATUS_LABELS[latest.status] : 'Ready'}
                        </span>
                        {latest?.message && latest.status !== 'complete' && latest.status !== 'error' && (
                          <span className="text-[11px] text-muted-foreground/80 max-w-[12rem] text-right">
                            {latest.message}
                          </span>
                        )}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>

            {!hasSlides && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>Add at least one slide to enable exports.</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="embed" className="px-6 py-4 mt-0">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Embed this exhibition on your website.</p>
              <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                {shareError
                  ? 'Embed code unavailable until a share link is generated.'
                  : embedCode || (isGenerating ? 'Generating embed code...' : 'Generate a share link to view the embed code.')}
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleCopyEmbed}
                disabled={!embedCode || isGenerating}
              >
                {embedCopied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Embed Code
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DownloadStatusBar downloads={downloads} />

        <div className="px-6 py-4 border-t bg-muted/30">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="text-xs">
              <BarChart3 className="h-3 w-3 mr-2" />
              View analytics
            </Button>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareDialog;
