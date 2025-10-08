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
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface OperationsPaletteProps {
  onFullscreen: () => void;
  onExport?: () => void;
  onGridView?: () => void;
}

const operations = [
  { icon: Sparkles, label: 'AI Assistant', color: 'text-purple-500' },
  { icon: Type, label: 'Text', color: 'text-blue-500' },
  { icon: Image, label: 'Images', color: 'text-green-500' },
  { icon: Table, label: 'Tables', color: 'text-orange-500' },
  { icon: BarChart3, label: 'Charts', color: 'text-pink-500' },
];

const tools = [
  { icon: FileText, label: 'Templates', color: 'text-indigo-500' },
  { icon: Palette, label: 'Themes', color: 'text-rose-500' },
  { icon: Settings, label: 'Settings', color: 'text-gray-500' },
];

export const OperationsPalette: React.FC<OperationsPaletteProps> = ({
  onFullscreen,
  onExport,
  onGridView,
}) => {
  return (
    <div className="w-12 h-full bg-background border-l border-border flex flex-col items-center py-4 gap-4">
      <div className="flex flex-col items-center gap-3">
        <span className="block whitespace-nowrap text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.3em] -rotate-45 origin-center leading-none">
          Tools
        </span>
        <div className="flex flex-col items-center gap-2">
          {operations.map((op, index) => (
            <Button
              key={index}
              variant="ghost"
              size="icon"
              className={cn(
                'w-9 h-9 rounded-lg hover:bg-muted transition-all group relative',
                'hover:scale-105 hover:shadow-lg'
              )}
              title={op.label}
              type="button"
            >
              <op.icon className={cn('h-4 w-4', op.color)} />
              <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                {op.label}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <Separator className="w-6" />

      <div className="flex flex-col items-center gap-3">
        <span className="block whitespace-nowrap text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.3em] -rotate-45 origin-center leading-none">
          More
        </span>
        <div className="flex flex-col items-center gap-2">
          {tools.map((tool, index) => (
            <Button
              key={index}
              variant="ghost"
              size="icon"
              className={cn(
                'w-9 h-9 rounded-lg hover:bg-muted transition-all group relative',
                'hover:scale-105 hover:shadow-lg'
              )}
              title={tool.label}
              type="button"
            >
              <tool.icon className={cn('h-4 w-4', tool.color)} />
              <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                {tool.label}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <Separator className="w-6" />

      <div className="flex flex-col items-center gap-2 mt-auto">
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg"
          onClick={() => onGridView?.()}
          title="Grid view"
          type="button"
        >
          <Layers className="h-4 w-4 text-cyan-500" />
          <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
            Grid View
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg"
          onClick={() => onExport?.()}
          title="Export presentation"
          type="button"
        >
          <Download className="h-4 w-4 text-emerald-500" />
          <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
            Export
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg"
          onClick={onFullscreen}
          title="Fullscreen"
          type="button"
        >
          <Maximize2 className="h-4 w-4 text-foreground" />
          <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
            Fullscreen
          </span>
        </Button>
      </div>
    </div>
  );
};

export default OperationsPalette;
