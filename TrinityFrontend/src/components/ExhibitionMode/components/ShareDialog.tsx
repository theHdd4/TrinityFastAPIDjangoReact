import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName?: string;
}

const SHARE_PATH = '/exhibition/shared/';

const generateShareLink = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}${SHARE_PATH}${Date.now()}`;
};

const copyToClipboard = async (text: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    if (successful) {
      return;
    }
  }

  throw new Error('Copy not supported');
};

export const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onOpenChange,
  projectName = 'Exhibition Project',
}) => {
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [permission, setPermission] = useState('view');
  const [hideBadge, setHideBadge] = useState(false);
  const [discoverable, setDiscoverable] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setShareLink(generateShareLink());
      setCopied(false);
      setEmbedCopied(false);
    }
  }, [open]);

  const embedCode = useMemo(() => {
    if (!shareLink) {
      return '';
    }

    return `<iframe src="${shareLink}" width="100%" height="600"></iframe>`;
  }, [shareLink]);

  const handleCopyLink = useCallback(async () => {
    if (!shareLink) {
      return;
    }

    try {
      await copyToClipboard(shareLink);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy share link', error);
      toast.error('Unable to copy the link. Please copy it manually.');
    }
  }, [shareLink]);

  const handleCopyEmbed = useCallback(async () => {
    if (!embedCode) {
      return;
    }

    try {
      await copyToClipboard(embedCode);
      setEmbedCopied(true);
      toast.success('Embed code copied');
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy embed code', error);
      toast.error('Unable to copy the embed code. Please copy it manually.');
    }
  }, [embedCode]);

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
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Anyone with the link</p>
                      <p className="text-xs text-muted-foreground">Can {permission}</p>
                    </div>
                    <Select value={permission} onValueChange={setPermission}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="view">View</SelectItem>
                        <SelectItem value="comment">Comment</SelectItem>
                        <SelectItem value="edit">Edit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Input value={shareLink} readOnly className="flex-1 h-9 text-sm bg-background" />
                    <Button onClick={handleCopyLink} variant="secondary" className="h-9 px-4" disabled={!shareLink}>
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
              <p className="text-sm text-muted-foreground">Embed this exhibition on your website.</p>
              <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                {embedCode || 'Generating embed code...'}
              </div>
              <Button variant="secondary" className="w-full" onClick={handleCopyEmbed} disabled={!embedCode}>
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
