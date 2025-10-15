import React, { useMemo } from 'react';
import { Layers, Download, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { PaletteOperation } from './types';
import { createAiAssistantOperation } from './operations/ai-assistant';
import { createTextOperation } from './operations/text';
import { createImagesOperation } from './operations/images';
import { createTablesOperation } from './operations/tables';
import { createChartsOperation } from './operations/charts';
import { createTemplatesTool } from './tools/templates';
import { createThemesTool } from './tools/themes';
import { createSettingsTool } from './tools/settings';

interface OperationsPaletteProps {
  onFullscreen: () => void;
  onExport?: () => void;
  onGridView?: () => void;
  onCreateTextBox?: () => void;
  onCreateTable?: () => void;
  canEdit?: boolean;
}

export const OperationsPalette: React.FC<OperationsPaletteProps> = ({
  onFullscreen,
  onExport,
  onGridView,
  onCreateTextBox,
  onCreateTable,
  canEdit = true,
}) => {
  const operations = useMemo<PaletteOperation[]>(
    () => [
      createAiAssistantOperation(),
      createTextOperation({ onCreateTextBox, canEdit }),
      createImagesOperation(),
      createTablesOperation({ onCreateTable, canEdit }),
      createChartsOperation(),
    ],
    [onCreateTextBox, onCreateTable, canEdit],
  );

  const tools = useMemo<PaletteOperation[]>(
    () => [createTemplatesTool(), createThemesTool(), createSettingsTool()],
    [],
  );

  return (
    <div className="w-12 h-full bg-background border-l border-border flex flex-col items-center py-4 gap-4">
      <div className="flex flex-col items-center gap-3 w-full">
        <span className="inline-flex items-center justify-center px-1 mx-auto text-[0.55rem] font-semibold text-muted-foreground uppercase tracking-[0.08em] leading-none pb-1 border-b-2 border-yellow-400">
          Tools
        </span>
        <div className="flex flex-col items-center gap-2">
          {operations.map(operation => (
            <Button
              key={operation.label}
              variant="ghost"
              size="icon"
              className={cn(
                'w-9 h-9 rounded-lg hover:bg-muted transition-all group relative',
                'hover:scale-105 hover:shadow-lg',
                operation.isDisabled && 'opacity-50 pointer-events-none',
              )}
              title={operation.label}
              type="button"
              onClick={operation.onSelect}
            >
              <operation.icon
                className={cn('h-4 w-4', operation.colorClass ?? 'text-black dark:text-white')}
              />
              <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                {operation.label}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <Separator className="w-6" />

      <div className="flex flex-col items-center gap-3 w-full">
        <span className="inline-flex items-center justify-center px-1 mx-auto text-[0.55rem] font-semibold text-muted-foreground uppercase tracking-[0.08em] leading-none pb-1 border-b-2 border-yellow-400">
          More
        </span>
        <div className="flex flex-col items-center gap-2">
          {tools.map(tool => (
            <Button
              key={tool.label}
              variant="ghost"
              size="icon"
              className={cn(
                'w-9 h-9 rounded-lg hover:bg-muted transition-all group relative',
                'hover:scale-105 hover:shadow-lg',
                tool.isDisabled && 'opacity-50 pointer-events-none',
              )}
              title={tool.label}
              type="button"
              onClick={tool.onSelect}
            >
              <tool.icon
                className={cn('h-4 w-4', tool.colorClass ?? 'text-black dark:text-white')}
              />
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
          <Layers className="h-4 w-4 text-black dark:text-white" />
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
          <Download className="h-4 w-4 text-black dark:text-white" />
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
