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
import {
  Users,
  Share2,
  Download,
  Code,
  Copy,
  BarChart3,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { createExhibitionShareLink } from '@/lib/shareLinks';
import { getActiveProjectContext } from '@/utils/projectEnv';

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

export const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onOpenChange,
  projectName = 'Laboratory Project',
}) => {
  const [shareLink, setShareLink] = useState('');
  const [embedCopied, setEmbedCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const generationIdRef = useRef(0);
  const isMountedRef = useRef(true);

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
    } catch (error) {
      if (!isMountedRef.current || generationId !== generationIdRef.current) {
        return;
      }
      console.error('Failed to generate share link', error);
      const message = error instanceof Error ? error.message : 'Failed to generate share link';
      setShareLink('');
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
    } else {
      setShareLink('');
      setShareError(null);
      setEmbedCopied(false);
    }
  }, [open, runShareLinkGeneration]);

  const embedCode = useMemo(() => {
    if (!shareLink) {
      return '';
    }

    return `<iframe src="${shareLink}" width="100%" height="600"></iframe>`;
  }, [shareLink]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share {projectName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="collaborate" className="w-full">
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
                Invite team members to collaborate on this laboratory project.
              </p>
              <Input placeholder="Enter email addresses..." />
              <Button className="w-full">Send Invitations</Button>
            </div>
          </TabsContent>

          <TabsContent value="export" className="px-6 py-4 mt-0">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Download your exhibition in various formats.</p>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Export as PowerPoint
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Export as PDF
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Download className="h-4 w-4 mr-2" />
                  Export as Images
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="px-6 py-4 mt-0">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Embed this laboratory project on your website.</p>
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
