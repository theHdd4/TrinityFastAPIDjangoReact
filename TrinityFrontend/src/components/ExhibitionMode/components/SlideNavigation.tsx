import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Maximize2,
  Minimize2,
  Download,
  Plus,
  ArrowUpDown,
  ArrowLeftRight,
  MonitorPlay,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import type { SlideshowTransition } from '../store/exhibitionStore';

interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
  onGridView: () => void;
  onFullscreen: () => void;
  onExport: () => void;
  isFullscreen: boolean;
  onAddSlide: () => void;
  onToggleViewMode: () => void;
  viewMode: 'horizontal' | 'vertical';
  canEdit?: boolean;
  onDeleteSlide: () => void;
  onSlideshowStart: () => void;
  onSlideshowStop: () => void;
  isSlideshowActive: boolean;
  slideshowSettings: {
    slideshowDuration: number;
    slideshowTransition: SlideshowTransition;
  };
  onSlideshowSettingsChange: (settings: {
    slideshowDuration?: number;
    slideshowTransition?: SlideshowTransition;
  }) => void;
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
  onAddSlide,
  onToggleViewMode,
  viewMode,
  canEdit = true,
  onDeleteSlide,
  onSlideshowStart,
  onSlideshowStop,
  isSlideshowActive,
  slideshowSettings,
  onSlideshowSettingsChange,
}) => {
  const [slideshowControlsOpen, setSlideshowControlsOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const hasSlides = totalSlides > 0;
  const displayIndex = hasSlides ? currentSlide + 1 : 0;

  React.useEffect(() => {
    if (!isSlideshowActive) {
      setSlideshowControlsOpen(false);
    }
  }, [isSlideshowActive]);

  const handleSlideshowButtonClick = () => {
    if (!isSlideshowActive) {
      onSlideshowStart();
      setSlideshowControlsOpen(true);
      return;
    }
    setSlideshowControlsOpen(previous => !previous);
  };

  const handlePopoverChange = (open: boolean) => {
    if (open) {
      if (!isSlideshowActive) {
        onSlideshowStart();
      }
      setSlideshowControlsOpen(true);
    } else {
      setSlideshowControlsOpen(false);
    }
  };

  const durationSeconds = Math.max(1, Math.round(slideshowSettings.slideshowDuration));

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-background/95 backdrop-blur-lg border border-border rounded-full px-4 py-2 shadow-elegant">
      <Button
        variant="ghost"
        size="icon"
        onClick={onAddSlide}
        disabled={!canEdit || isSlideshowActive}
        className="rounded-full h-9 w-9"
        title="Add new slide"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-9 w-9"
            title="Delete current slide"
            disabled={!canEdit || !hasSlides || isSlideshowActive}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete slide {displayIndex}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will permanently remove this slide from your presentation. You cannot undo this
              deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onDeleteSlide();
                setDeleteDialogOpen(false);
              }}
            >
              Delete slide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleViewMode}
        className="rounded-full h-9 w-9"
        disabled={isSlideshowActive}
        title={viewMode === 'vertical' ? 'Switch to horizontal view' : 'Switch to vertical view'}
      >
        {viewMode === 'vertical' ? (
          <ArrowLeftRight className="h-4 w-4" />
        ) : (
          <ArrowUpDown className="h-4 w-4" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={!hasSlides || currentSlide === 0}
        className="rounded-full h-9 w-9"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <Badge variant="secondary" className="px-4 py-1.5 font-medium">
        {displayIndex} / {totalSlides}
      </Badge>

      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={!hasSlides || currentSlide === totalSlides - 1}
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
        disabled={!hasSlides || isSlideshowActive}
        title="Grid View"
      >
        <Grid3x3 className="h-4 w-4" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={onFullscreen}
        className="rounded-full h-9 w-9"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen Presentation'}
        disabled={!hasSlides && !isFullscreen}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>

      <Popover
        open={isSlideshowActive && slideshowControlsOpen}
        onOpenChange={handlePopoverChange}
      >
        <PopoverTrigger asChild>
          <Button
            variant={isSlideshowActive ? 'default' : 'ghost'}
            size="icon"
            onClick={handleSlideshowButtonClick}
            className="rounded-full h-9 w-9"
            title={isSlideshowActive ? 'Adjust slideshow' : 'Start slideshow'}
            disabled={!hasSlides}
          >
            <MonitorPlay className="h-4 w-4" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-64 space-y-4" align="end" sideOffset={12}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Slideshow</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (isSlideshowActive) {
                  onSlideshowStop();
                  setSlideshowControlsOpen(false);
                } else {
                  onSlideshowStart();
                }
              }}
            >
              {isSlideshowActive ? 'Stop' : 'Start'}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Transition
            </Label>
            <Select
              value={slideshowSettings.slideshowTransition}
              onValueChange={value =>
                onSlideshowSettingsChange({
                  slideshowTransition: value as SlideshowTransition,
                })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Transition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fade">Fade</SelectItem>
                <SelectItem value="slide">Slide</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Duration ({durationSeconds}s)
            </Label>
            <Slider
              min={3}
              max={30}
              step={1}
              value={[durationSeconds]}
              onValueChange={([value]) =>
                onSlideshowSettingsChange({ slideshowDuration: value })
              }
            />
          </div>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        onClick={onExport}
        className="rounded-full h-9 w-9"
        disabled={!hasSlides || isSlideshowActive}
        title="Export Presentation"
      >
        <Download className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default SlideNavigation;
