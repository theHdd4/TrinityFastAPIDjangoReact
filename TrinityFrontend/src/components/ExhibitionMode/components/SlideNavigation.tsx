import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Minimize2,
  Download,
  Plus,
  ArrowUpDown,
  ArrowLeftRight,
  Trash2,
  MonitorPlay,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
  onGridView: () => void;
  onExport: () => void;
  onAddSlide: () => void;
  onToggleViewMode: () => void;
  viewMode: 'horizontal' | 'vertical';
  canEdit?: boolean;
  onDeleteSlide: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  isSlideshowActive: boolean;
}

export const SlideNavigation: React.FC<SlideNavigationProps> = ({
  currentSlide,
  totalSlides,
  onPrevious,
  onNext,
  onGridView,
  onExport,
  onAddSlide,
  onToggleViewMode,
  viewMode,
  canEdit = true,
  onDeleteSlide,
  onToggleFullscreen,
  isFullscreen,
  isSlideshowActive,
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const hasSlides = totalSlides > 0;
  const displayIndex = hasSlides ? currentSlide + 1 : 0;

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
        variant={isFullscreen ? 'default' : 'ghost'}
        size="icon"
        onClick={onToggleFullscreen}
        className="rounded-full h-9 w-9"
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        disabled={!hasSlides || isSlideshowActive}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <MonitorPlay className="h-4 w-4" />}
      </Button>

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
