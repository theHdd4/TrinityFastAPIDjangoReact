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
  Share2,
  Download,
  Code,
  Link2,
  Copy,
  Check,
  Loader2,
  RefreshCcw,
  ChevronDown,
  Clock,
  Mail,
  ExternalLink,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { createDashboardShareLink } from '@/lib/shareLinks';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useIsMobile } from '@/hooks/use-mobile';

interface DashboardShareDialogProps {
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
      console.warn('navigator.clipboard.writeText failed', error);
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

    if ('readOnly' in element) {
      element.readOnly = wasReadOnly;
    }

    if ('disabled' in element) {
      element.disabled = wasDisabled;
    }

    return successful;
  };

  if (await attemptNativeClipboard()) {
    return;
  }

  if (attemptWithTarget()) {
    return;
  }

  throw new Error('Copy not supported');
};

export const DashboardShareDialog: React.FC<DashboardShareDialogProps> = ({
  open,
  onOpenChange,
  projectName = 'Dashboard Project',
}) => {
  const isMobile = useIsMobile();
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customExpiration, setCustomExpiration] = useState<string>('never');
  const generationIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const shareLinkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const getExpirationSeconds = useCallback((value: string): number | null => {
    if (value === 'never') return null;
    if (value === '1h') return 3600;
    if (value === '24h') return 86400;
    if (value === '7d') return 604800;
    if (value === '30d') return 2592000;
    return null;
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
      const expiresIn = getExpirationSeconds(customExpiration);
      const response = await createDashboardShareLink({
        ...context,
        expires_in: expiresIn,
      });
      
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
  }, [toast, customExpiration, getExpirationSeconds]);

  useEffect(() => {
    if (open) {
      void runShareLinkGeneration();
    } else {
      setShareLink('');
      setShareExpiresAt(null);
      setShareError(null);
      setCopied(false);
      setEmbedCopied(false);
    }
  }, [open, runShareLinkGeneration]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-2xl p-0 gap-0 ${isMobile ? 'max-w-[95vw] max-h-[90vh] overflow-y-auto' : ''}`}>
        <DialogHeader className={`px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 ${isMobile ? 'sticky top-0 bg-background z-10 border-b' : ''}`}>
          <DialogTitle className={`text-lg sm:text-xl font-semibold flex items-center gap-2 ${isMobile ? 'text-base' : ''}`}>
            <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="truncate">Share {projectName}</span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="share" className="w-full">
          <div className={`px-4 sm:px-6 ${isMobile ? 'sticky top-[73px] bg-background z-10 border-b' : ''}`}>
            <TabsList className={`w-full ${isMobile ? 'overflow-x-auto' : 'justify-start'} border-b rounded-none h-auto p-0 bg-transparent`}>
              <TabsTrigger
                value="share"
                className={`rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none ${isMobile ? 'text-xs px-3 flex-shrink-0' : ''}`}
              >
                <Share2 className={`h-3 w-3 sm:h-4 sm:w-4 ${isMobile ? 'mr-1' : 'mr-2'}`} />
                Share
              </TabsTrigger>
              <TabsTrigger
                value="export"
                className={`rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none ${isMobile ? 'text-xs px-3 flex-shrink-0' : ''}`}
              >
                <Download className={`h-3 w-3 sm:h-4 sm:w-4 ${isMobile ? 'mr-1' : 'mr-2'}`} />
                {!isMobile && 'Export'}
              </TabsTrigger>
              <TabsTrigger
                value="embed"
                className={`rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none ${isMobile ? 'text-xs px-3 flex-shrink-0' : ''}`}
              >
                <Code className={`h-3 w-3 sm:h-4 sm:w-4 ${isMobile ? 'mr-1' : 'mr-2'}`} />
                {!isMobile && 'Embed'}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="share" className="px-4 sm:px-6 py-4 mt-0 space-y-4">
            <div className="space-y-4">
              <div className={`flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border bg-muted/50 ${isMobile ? 'flex-col' : ''}`}>
                <Link2 className={`h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground ${isMobile ? '' : 'mt-0.5'} flex-shrink-0`} />
                <div className="flex-1 space-y-3 min-w-0">
                  <div className={`flex items-center justify-between gap-2 sm:gap-3 ${isMobile ? 'flex-col items-start' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">Anyone with the link</p>
                      <p className="text-xs text-muted-foreground">
                        {shareError ? 'Link unavailable' : 'Can view'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={`${isMobile ? 'h-9 w-9' : 'h-8 w-8'} touch-manipulation flex-shrink-0`}
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

                  <div className={`flex gap-2 ${isMobile ? 'flex-col' : ''}`}>
                    <Input
                      value={shareLink}
                      readOnly
                      placeholder={isGenerating ? 'Generating link…' : 'No share link available'}
                      className={`flex-1 h-9 sm:h-10 text-xs sm:text-sm bg-background touch-manipulation ${isMobile ? 'text-xs' : ''}`}
                      ref={shareLinkInputRef}
                    />
                    <Button
                      onClick={handleCopyLink}
                      variant="secondary"
                      className={`h-9 sm:h-10 px-3 sm:px-4 touch-manipulation ${isMobile ? 'w-full' : ''}`}
                      disabled={!shareLink || isGenerating}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          {isMobile ? 'Copied' : 'Copied'}
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          {isMobile ? 'Copy' : 'Copy link'}
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
                      Share this read-only dashboard with anyone who has the link.
                    </p>
                  )}

                  {expiresLabel && !shareError && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Expires on {expiresLabel}
                    </p>
                  )}
                </div>
              </div>

              {!shareError && !isGenerating && shareLink && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <p className="text-xs font-medium text-muted-foreground">Share via</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs touch-manipulation"
                      onClick={() => {
                        const subject = encodeURIComponent(`Check out this dashboard: ${projectName}`);
                        const body = encodeURIComponent(`I'd like to share this dashboard with you:\n\n${shareLink}`);
                        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
                      }}
                    >
                      <Mail className="h-3 w-3 mr-1.5" />
                      Email
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs touch-manipulation"
                      onClick={() => {
                        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this dashboard: ${shareLink}`)}`, '_blank');
                      }}
                    >
                      <Share2 className="h-3 w-3 mr-1.5" />
                      Twitter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs touch-manipulation"
                      onClick={() => {
                        window.open(shareLink, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1.5" />
                      Open Link
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  variant="ghost"
                  className={`w-full justify-between p-0 h-auto hover:bg-transparent ${isMobile ? 'text-sm' : ''}`}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span className="font-medium text-sm">Advanced settings</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </Button>

                {showAdvanced && (
                  <div className="space-y-4 pt-2">
                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="expiration" className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Link expiration
                      </Label>
                      <Select 
                        value={customExpiration} 
                        onValueChange={(value) => {
                          setCustomExpiration(value);
                          // Regenerate link with new expiration if link already exists
                          if (shareLink && !isGenerating) {
                            setTimeout(() => {
                              void runShareLinkGeneration();
                            }, 100);
                          }
                        }} 
                        disabled={isGenerating}
                      >
                        <SelectTrigger id="expiration" className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="never">Never expires</SelectItem>
                          <SelectItem value="1h">1 hour</SelectItem>
                          <SelectItem value="24h">24 hours</SelectItem>
                          <SelectItem value="7d">7 days</SelectItem>
                          <SelectItem value="30d">30 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {customExpiration === 'never' 
                          ? 'The link will remain active indefinitely'
                          : `The link will expire ${customExpiration === '1h' ? 'in 1 hour' : customExpiration === '24h' ? 'in 24 hours' : customExpiration === '7d' ? 'in 7 days' : 'in 30 days'}`
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="export" className="px-4 sm:px-6 py-4 mt-0">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Download your dashboard in various formats.</p>
              <div className="space-y-2">
                <Button variant="outline" className="w-full justify-start touch-manipulation">
                  <Download className="h-4 w-4 mr-2" />
                  Export as PDF
                </Button>
                <Button variant="outline" className="w-full justify-start touch-manipulation">
                  <Download className="h-4 w-4 mr-2" />
                  Export as Images
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="embed" className="px-4 sm:px-6 py-4 mt-0">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Embed this dashboard on your website.</p>
              <div className={`bg-muted p-3 rounded-lg font-mono ${isMobile ? 'text-[10px] overflow-x-auto' : 'text-xs'}`}>
                {shareError
                  ? 'Embed code unavailable until a share link is generated.'
                  : embedCode || (isGenerating ? 'Generating embed code...' : 'Generate a share link to view the embed code.')}
              </div>
              <Button
                variant="secondary"
                className="w-full touch-manipulation"
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

        <div className={`px-4 sm:px-6 py-3 sm:py-4 border-t bg-muted/30 ${isMobile ? 'sticky bottom-0' : ''}`}>
          <div className={`flex items-center ${isMobile ? 'flex-col gap-2' : 'justify-end'}`}>
            <Button onClick={() => onOpenChange(false)} className={`touch-manipulation ${isMobile ? 'w-full' : ''}`}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DashboardShareDialog;
