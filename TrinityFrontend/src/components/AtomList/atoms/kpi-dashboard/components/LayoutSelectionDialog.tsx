import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Grid3x3, Grid2x2, LayoutGrid, Square } from 'lucide-react';

type LayoutType = '4-box' | '3-box' | '2-box' | '1-box';

interface LayoutSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onSelectLayout: (layoutType: LayoutType) => void;
}

const LayoutSelectionDialog: React.FC<LayoutSelectionDialogProps> = ({
  open,
  onClose,
  onSelectLayout
}) => {
  const layouts = [
    {
      type: '4-box' as LayoutType,
      label: '4-Box Layout',
      description: 'Four boxes in a grid',
      icon: Grid3x3,
      preview: (
        <div className="grid grid-cols-2 gap-1 w-full h-12">
          <div className="bg-primary/20 rounded"></div>
          <div className="bg-primary/20 rounded"></div>
          <div className="bg-primary/20 rounded"></div>
          <div className="bg-primary/20 rounded"></div>
        </div>
      )
    },
    {
      type: '3-box' as LayoutType,
      label: '3-Box Layout',
      description: 'Three boxes in a row',
      icon: LayoutGrid,
      preview: (
        <div className="grid grid-cols-3 gap-1 w-full h-12">
          <div className="bg-primary/20 rounded"></div>
          <div className="bg-primary/20 rounded"></div>
          <div className="bg-primary/20 rounded"></div>
        </div>
      )
    },
    {
      type: '2-box' as LayoutType,
      label: '2-Box Layout',
      description: 'Two boxes side by side',
      icon: Grid2x2,
      preview: (
        <div className="grid grid-cols-2 gap-1 w-full h-12">
          <div className="bg-primary/20 rounded"></div>
          <div className="bg-primary/20 rounded"></div>
        </div>
      )
    },
    {
      type: '1-box' as LayoutType,
      label: '1-Box Layout',
      description: 'Single full-width box',
      icon: Square,
      preview: (
        <div className="w-full h-12 bg-primary/20 rounded"></div>
      )
    }
  ];

  const handleSelect = (layoutType: LayoutType) => {
    onSelectLayout(layoutType);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Layout Type</DialogTitle>
          <DialogDescription>
            Choose how many boxes you want in this layout section
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {layouts.map((layout) => {
            const Icon = layout.icon;
            return (
              <Button
                key={layout.type}
                variant="outline"
                className="h-auto flex-col items-start p-4 hover:bg-primary/5 hover:border-primary transition-all"
                onClick={() => handleSelect(layout.type)}
              >
                <div className="flex items-center gap-3 mb-3 w-full">
                  <Icon className="w-5 h-5 text-primary" />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">{layout.label}</p>
                    <p className="text-xs text-muted-foreground">{layout.description}</p>
                  </div>
                </div>
                {layout.preview}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LayoutSelectionDialog;
