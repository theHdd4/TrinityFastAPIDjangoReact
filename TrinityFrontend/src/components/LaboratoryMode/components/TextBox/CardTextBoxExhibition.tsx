import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Copy, FileText, Image } from 'lucide-react';
import { CardTextBoxData } from './types';

interface CardTextBoxExhibitionProps {
  data: CardTextBoxData;
}

const CardTextBoxExhibition: React.FC<CardTextBoxExhibitionProps> = ({ data }) => {
  const handleCopyText = () => {
    navigator.clipboard.writeText(data.text);
  };

  const handleCopyHTML = () => {
    navigator.clipboard.writeText(data.html);
  };

  const handleExportImage = () => {
    console.log('Export as image');
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Export Text</Label>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleCopyText}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Plain Text
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleCopyHTML}
          >
            <FileText className="h-4 w-4 mr-2" />
            Copy HTML
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleExportImage}
          >
            <Image className="h-4 w-4 mr-2" />
            Export as Image
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Preview</Label>
        <div className="p-4 border border-border rounded-md bg-muted/10">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Statistics</Label>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Characters:</span>
            <span className="font-medium">{data.text.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Words:</span>
            <span className="font-medium">{data.text.split(/\s+/).filter(Boolean).length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lines:</span>
            <span className="font-medium">{data.text.split('\n').length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardTextBoxExhibition;
