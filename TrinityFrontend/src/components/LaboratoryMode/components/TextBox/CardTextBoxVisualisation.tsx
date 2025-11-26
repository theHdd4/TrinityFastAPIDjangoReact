import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sparkles, Zap, Wand2 } from 'lucide-react';
import { CardTextBoxSettings } from './types';

interface CardTextBoxVisualisationProps {
  settings: CardTextBoxSettings;
}

const CardTextBoxVisualisation: React.FC<CardTextBoxVisualisationProps> = () => {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Text Effects</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs">Shadow</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1">
            <Zap className="h-4 w-4" />
            <span className="text-xs">Glow</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1">
            <Wand2 className="h-4 w-4" />
            <span className="text-xs">Outline</span>
          </Button>
          <Button variant="outline" className="h-auto py-3 flex flex-col gap-1">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs">Gradient</span>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Animation</Label>
        <div className="grid grid-cols-1 gap-2">
          <Button variant="outline" className="justify-start">
            <span className="text-sm">Fade In</span>
          </Button>
          <Button variant="outline" className="justify-start">
            <span className="text-sm">Slide In</span>
          </Button>
          <Button variant="outline" className="justify-start">
            <span className="text-sm">Bounce</span>
          </Button>
          <Button variant="outline" className="justify-start">
            <span className="text-sm">Type Writer</span>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Position</Label>
        <div className="space-y-2">
          <Button variant="outline" className="w-full justify-start">
            Rotate
          </Button>
          <Button variant="outline" className="w-full justify-start">
            Flip Horizontal
          </Button>
          <Button variant="outline" className="w-full justify-start">
            Flip Vertical
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CardTextBoxVisualisation;
