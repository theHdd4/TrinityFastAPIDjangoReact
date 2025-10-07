import React from 'react';
import { ChevronLeft, ChevronRight, Grid3x3, Maximize2, Download, Presentation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
  onGridView: () => void;
  onFullscreen: () => void;
  onExport: () => void;
  isFullscreen: boolean;
}

export const SlideNavigation: React.FC<SlideNavigationProps> = ({
  currentSlide,
  totalSlides,
  onPrevious,
  onNext,
  onGridView,
  onFullscreen,
  onExport,
  isFullscreen,
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-background/95 backdrop-blur-lg border border-border rounded-full px-4 py-2 shadow-elegant">
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={currentSlide === 0}
        className="rounded-full h-9 w-9"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <Badge variant="secondary" className="px-4 py-1.5 font-medium">
        {currentSlide + 1} / {totalSlides}
      </Badge>

      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={currentSlide === totalSlides - 1}
        className="rounded-full h-9 w-9"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        variant="ghost"
        size="icon"
        onClick={onGridView}
        className="rounded-full h-9 w-9"
        title="Grid View"
      >
        <Grid3x3 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onFullscreen}
        className="rounded-full h-9 w-9"
        title="Fullscreen Presentation"
      >
        {isFullscreen ? <Presentation className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onExport}
        className="rounded-full h-9 w-9"
        title="Export Presentation"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default SlideNavigation;
