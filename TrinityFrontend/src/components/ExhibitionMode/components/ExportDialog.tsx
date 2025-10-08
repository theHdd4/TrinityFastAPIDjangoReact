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

const PDF_PLACEHOLDER_BASE64 = [
  'JVBERi0xLjMKMyAwIG9iago8PC9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyAyIDAgUgovQ29udGVudHMg',
  'NCAwIFI+PgplbmRvYmoKNCAwIG9iago8PC9GaWx0ZXIgL0ZsYXRlRGVjb2RlIC9MZW5ndGggODk+PgpzdHJlYW0KeJwzUvDi',
  'MtAzNVco53IKUdB3M1QwNNMzMFAISVNwDQEJGRvqGVoqmFuagBSFpChouFZkZCZllmTm5ymkVhTkF5UoFOQkJqdm5OekpBZp',
  'KoRkgTQCAI7lF5IKZW5kc3RyZWFtCmVuZG9iagoxIDAgb2JqCjw8L1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUiBdCi9Db3Vu',
  'dCAxCi9NZWRpYUJveCBbMCAwIDU5NS4yOCA4NDEuODldCj4+CmVuZG9iago1IDAgb2JqCjw8L1R5cGUgL0ZvbnQKL0Jhc2VG',
  'b250IC9IZWx2ZXRpY2EtQm9sZAovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2Jq',
  'CjIgMCBvYmoKPDwKL1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldCi9Gb250IDw8Ci9GMSA1',
  'IDAgUgo+PgovWE9iamVjdCA8PAo+Pgo+PgplbmRvYmoKNiAwIG9iago8PAovUHJvZHVjZXIgKFB5RlBERiAxLjcuMiBodHRw',
  'Oi8vcHlmcGRmLmdvb2dsZWNvZGUuY29tLykKL0NyZWF0aW9uRGF0ZSAoRDoyMDI1MTAwODEwNTQwMykKPj4KZW5kb2JqCjcg',
  'MCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCi9PcGVuQWN0aW9uIFszIDAgUiAvRml0SCBudWxsXQovUGFn',
  'ZUxheW91dCAvT25lQ29sdW1uCj4+CmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAyNDUgMDAw',
  'MDAgbiAKMDAwMDAwMDQzMyAwMDAwMCBuIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwODcgMDAwMDAgbiAKMDAwMDAw',
  'MDMzMiAwMDAwMCBuIAowMDAwMDAwNTM3IDAwMDAwIG4gCjAwMDAwMDA2NDYgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA4',
  'Ci9Sb290IDcgMCBSCi9JbmZvIDYgMCBSCj4+CnN0YXJ0eHJlZgo3NDkKJSVFT0YK',
].join('');

const PPTX_PLACEHOLDER_BASE64 = [
  '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',
  'tHeLv+BN30uBOyMuCnX4cIX6SXZ44D6gi1juBgwMZuFiIk8jH+hXs+LvZm9Oz/TlUdLF36sHUEsDBBQAAAAIANxWSFvQglnF',
  'RAEAABsDAAAhAAAAcHB0L3NsaWRlTWFzdGVycy9zbGlkZU1hc3RlcjEueG1sjVLJbsIwEL3zFZbvxdBDVUVJOHQTEhQk6AdY',
  'trNI8aKxScPf104IARohLpbnzbw3a7xoZIVqAbbUKsHz6QwjoZjmpcoT/LP/fHrFi3QSm8hWfE2tE4A8Q9mIJrhwzkSEWFYI',
  'Se1UG6G8L9MgqfMm5IQD/fVKsiLPs9kLkbRU+MQ3j/ANCCuUo85XNyYCj4joLCuZeNfsIL1WJwKiakVtURqL0wlCvkW2q3j4',
  'toY1exCiM1tA1V9gdmYLPdZxvustoJL72WGkqBQJxuQ24kS8xlV9gcRkJIEPyv+lpFGTgRyAFvItoibBfnnH8JIbt2gcYp2f',
  'jQawYnNfgRUfdzRicl1V6Oaq8gAMAw1WP+swoArW1GzqPpZGsj20txY3/n7ImXUZ2h3lih71wS35yrphdwPcrwai8IEln+Oz',
  '2i37hHVnnv4BUEsDBBQAAAAIANxWSFsBiniSvwAAALMBAAAsAAAAcHB0L3NsaWRlTWFzdGVycy9fcmVscy9zbGlkZU1hc3Rl',
  'cjEueG1sLnJlbHOtUEsKwjAQ3fcUYfYmbRci0rQbEQRXogcI6bQNNh+SKHp7g4K0oODCzcC8eT+mam56JFf0QVnDoaA5EDTS',
  'tsr0HE7H7WIFTZ1VBxxFTJQwKBdI0pjAYYjRrRkLckAtArUOTbp01msR0+p75oQ8ix5ZmedL5qceUGeEzGzJruXgd20B5Hh3',
  '+Iu97TolcWPlRaOJH1JYGFWLe3G3l5hshe8xcqB0is9IBU0RwL6WK/9ZLiYtzmo9kdd8N6nY7Pn1A1BLAwQUAAAACADcVkhb',
  'CUNJgDoBAADiAgAAIQAAAHBwdC9zbGlkZUxheW91dHMvc2xpZGVMYXlvdXQxLnhtbI2Sy27CMBBF93yF5X0xdFFVUQKLvjZt',
  'QYJ+gOVMEkt+aWzS8Pe1E1IKRYhNlLkz98yM7XzZaUVaQC+tKeh8OqMEjLClNHVBv7avd490uZjkLvOqfOd7uwskOozPeEGb',
  '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',
  'aW9uLnhtbFBLAQIUAxQAAAAIANxWSFuLCy0UugAAAK4BAAAfAAAAAAAAAAAAAACAAf8FAABwcHQvX3JlbHMvcHJlc2VudGF0',
  'aW9uLnhtbC5yZWxzUEsBAhQDFAAAAAgA3FZIW9CCWcVEAQAAGwMAACEAAAAAAAAAAAAAAIAB9gYAAHBwdC9zbGlkZU1hc3Rl',
  'cnMvc2xpZGVNYXN0ZXIxLnhtbFBLAQIUAxQAAAAIANxWSFsBiniSvwAAALMBAAAsAAAAAAAAAAAAAACAAXkIAABwcHQvc2xp',
  'ZGVNYXN0ZXJzL19yZWxzL3NsaWRlTWFzdGVyMS54bWwucmVsc1BLAQIUAxQAAAAIANxWSFsJQ0mAOgEAAOICAAAhAAAAAAAA',
  'AAAAAACAAYIJAABwcHQvc2xpZGVMYXlvdXRzL3NsaWRlTGF5b3V0MS54bWxQSwECFAMUAAAACADcVkhb4EXqmKkAAAAWAQAA',
  'LAAAAAAAAAAAAAAAgAH7CgAAcHB0L3NsaWRlTGF5b3V0cy9fcmVscy9zbGlkZUxheW91dDEueG1sLnJlbHNQSwECFAMUAAAA',
  'CADcVkhbDTu7E3sBAABNBAAAFAAAAAAAAAAAAAAAgAHuCwAAcHB0L3RoZW1lL3RoZW1lMS54bWxQSwECFAMUAAAACADcVkhb',
  'qLDxZOABAABZBQAAFQAAAAAAAAAAAAAAgAGbDQAAcHB0L3NsaWRlcy9zbGlkZTEueG1sUEsFBgAAAAAMAAwAXQMAAK4PAAAA',
  'AA==',
].join('');

const decodeBase64ToBlob = (base64: string, mimeType: string) => {
  const normalized = base64.replace(/\s+/g, '');
  if (typeof window === 'undefined') {
    throw new Error('Cannot decode base64 blobs without a window context.');
  }
  const byteCharacters = window.atob(normalized);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
};

const triggerDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

type ExportFormat = 'pdf' | 'pptx' | 'images';

export const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onOpenChange,
  totalSlides,
}) => {
  const handleExport = (format: ExportFormat) => {
    if (typeof window === 'undefined') {
      onOpenChange(false);
      return;
    }

    if (format === 'images') {
      toast.info('Images export coming soon', {
        description: 'Use the PDF or PowerPoint options while we finish the image workflow.',
      });
      onOpenChange(false);
      return;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `exhibition-${timestamp}.${format === 'pdf' ? 'pdf' : 'pptx'}`;
      const blob =
        format === 'pdf'
          ? decodeBase64ToBlob(PDF_PLACEHOLDER_BASE64, 'application/pdf')
          : decodeBase64ToBlob(
              PPTX_PLACEHOLDER_BASE64,
              'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            );

      triggerDownload(blob, filename);
      toast.success(`${format === 'pdf' ? 'PDF' : 'PowerPoint'} downloaded`, {
        description: `Saved ${filename} to your device.`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to export exhibition presentation', error);
      toast.error('Download failed', {
        description: 'We could not prepare the export. Please try again.',
      });
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
            onClick={() => handleExport('pdf')}
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
            onClick={() => handleExport('pptx')}
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
            onClick={() => handleExport('images')}
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
