import React from 'react';
import {
  Sparkles,
  Type,
  Image,
  Table,
  BarChart3,
  Layers,
  FileText,
  Palette,
  Settings,
  Maximize2,
  StickyNote,
  Grid3x3,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface OperationsPaletteProps {
  onFullscreen: () => void;
  onShowNotes?: () => void;
  onShowThumbnails?: () => void;
  onExport?: () => void;
  onGridView?: () => void;
}

const operations = [
  { icon: Sparkles, label: 'AI Assistant', color: 'text-purple-500' },
  { icon: Type, label: 'Text', color: 'text-blue-500' },
  { icon: Image, label: 'Images', color: 'text-green-500' },
  { icon: Table, label: 'Tables', color: 'text-orange-500' },
  { icon: BarChart3, label: 'Charts', color: 'text-pink-500' },
  { icon: Layers, label: 'Layouts', color: 'text-cyan-500' },
];

const tools = [
  { icon: FileText, label: 'Templates', color: 'text-indigo-500' },
  { icon: Palette, label: 'Themes', color: 'text-rose-500' },
  { icon: Settings, label: 'Settings', color: 'text-gray-500' },
];

export const OperationsPalette: React.FC<OperationsPaletteProps> = ({
  onFullscreen,
  onShowNotes,
  onShowThumbnails,
  onExport,
  onGridView,
}) => {
  return (
    <div className="w-20 h-full bg-background border-l border-border flex flex-col items-center py-4">
      <div className="mb-6">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 text-center">
          Tools
        </h3>
        <div className="space-y-2">
          {operations.map((op, index) => (
            <Button
              key={index}
              variant="ghost"
              size="icon"
              className={cn(
                'w-12 h-12 rounded-xl hover:bg-muted transition-all group relative',
                'hover:scale-110 hover:shadow-lg'
              )}
              title={op.label}
              type="button"
            >
              <op.icon className={cn('h-5 w-5', op.color)} />
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                {op.label}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <Separator className="my-4 w-8" />

      <div className="mb-6">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 text-center">
          Views
        </h3>
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-xl hover:bg-muted transition-all group relative hover:scale-110 hover:shadow-lg"
            onClick={() => onShowThumbnails?.()}
            title="Slide thumbnails"
            type="button"
          >
            <Grid3x3 className="h-5 w-5 text-primary" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Slides
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-xl hover:bg-muted transition-all group relative hover:scale-110 hover:shadow-lg"
            onClick={() => onShowNotes?.()}
            title="Speaker notes"
            type="button"
          >
            <StickyNote className="h-5 w-5 text-amber-500" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Notes
            </span>
          </Button>
        </div>
      </div>

      <Separator className="my-4 w-8" />

      <div className="mb-auto">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 text-center">
          More
        </h3>
        <div className="space-y-2">
          {tools.map((tool, index) => (
            <Button
              key={index}
              variant="ghost"
              size="icon"
              className={cn(
                'w-12 h-12 rounded-xl hover:bg-muted transition-all group relative',
                'hover:scale-110 hover:shadow-lg'
              )}
              title={tool.label}
              type="button"
            >
              <tool.icon className={cn('h-5 w-5', tool.color)} />
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                {tool.label}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <Separator className="my-4 w-8" />

      <div className="space-y-2">
        <Button
          variant="ghost"
          size="icon"
          className="w-12 h-12 rounded-xl hover:bg-muted transition-all group relative hover:scale-110 hover:shadow-lg"
          onClick={() => onGridView?.()}
          title="Grid view"
          type="button"
        >
          <Layers className="h-5 w-5 text-cyan-500" />
          <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
            Grid View
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-12 h-12 rounded-xl hover:bg-muted transition-all group relative hover:scale-110 hover:shadow-lg"
          onClick={() => onExport?.()}
          title="Export presentation"
          type="button"
        >
          <Download className="h-5 w-5 text-emerald-500" />
          <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
            Export
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-12 h-12 rounded-xl hover:bg-muted transition-all group relative hover:scale-110 hover:shadow-lg"
          onClick={onFullscreen}
          title="Fullscreen"
          type="button"
        >
          <Maximize2 className="h-5 w-5 text-foreground" />
          <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
            Fullscreen
          </span>
        </Button>
      </div>
    </div>
  );
};

export default OperationsPalette;
