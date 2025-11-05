import React, { ReactNode, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { PaletteOperation } from './types';
import { createAiAssistantOperation } from './operations/ai-assistant';
import { createTextOperation } from './operations/text';
import { createImagesOperation } from './operations/images';
import { createTablesOperation } from './operations/tables';
import { createShapesOperation } from './operations/shapes';
import { createChartsOperation } from './operations/charts';
import { createTemplatesTool } from './tools/templates';
import { createThemesTool } from './tools/themes';
import { createSettingsTool } from './tools/settings';
import type { StagingPaletteFeature } from '../Staging Palette/types';
import { createGridViewFeature } from '../Staging Palette/GridView';
import { createExportFeature } from '../Staging Palette/Export';
export const POSITION_PANEL_WIDTH = '22rem';

interface OperationsPaletteProps {
  onExport?: () => void;
  onGridView?: () => void;
  onCreateTextBox?: () => void;
  onCreateTable?: () => void;
  onOpenShapesPanel?: () => void;
  onOpenImagesPanel?: () => void;
  onOpenChartPanel?: () => void;
  onOpenTemplatesPanel?: () => void;
  onOpenThemesPanel?: () => void;
  onOpenSettingsPanel?: () => void;
  canEdit?: boolean;
  positionPanel?: ReactNode | null;
}

export const OperationsPalette: React.FC<OperationsPaletteProps> = ({
  onExport,
  onGridView,
  onCreateTextBox,
  onCreateTable,
  onOpenShapesPanel,
  onOpenImagesPanel,
  onOpenChartPanel,
  onOpenTemplatesPanel,
  onOpenThemesPanel,
  onOpenSettingsPanel,
  canEdit = true,
  positionPanel = null,
}) => {
  const handleChartPanelRequest = useCallback(() => {
    if (canEdit === false || typeof onOpenChartPanel !== 'function') {
      return;
    }
    onOpenChartPanel();
  }, [canEdit, onOpenChartPanel]);

  const operations = useMemo<PaletteOperation[]>(
    () => [
      createAiAssistantOperation(),
      createTextOperation({ onCreateTextBox, canEdit }),
      createImagesOperation({ onOpenImagesPanel, canEdit }),
      createTablesOperation({ onCreateTable, canEdit }),
      createShapesOperation({ onOpenShapesPanel, canEdit }),
      createChartsOperation({
        canEdit,
        onOpenChartPanel:
          canEdit !== false && typeof onOpenChartPanel === 'function' ? handleChartPanelRequest : undefined,
      }),
    ],
    [
      canEdit,
      handleChartPanelRequest,
      onOpenChartPanel,
      onCreateTable,
      onCreateTextBox,
      onOpenImagesPanel,
      onOpenShapesPanel,
    ],
  );

  const tools = useMemo<PaletteOperation[]>(
    () => [
      createTemplatesTool({ onOpenTemplatesPanel, canEdit }),
      createThemesTool({ onOpenThemesPanel, canEdit }),
      createSettingsTool({ onOpenSettingsPanel, canEdit }),
    ],
    [canEdit, onOpenSettingsPanel, onOpenTemplatesPanel, onOpenThemesPanel],
  );

  const stagingFeatures = useMemo<StagingPaletteFeature[]>(
    () => [
      createGridViewFeature({
        onActivate: typeof onGridView === 'function' ? onGridView : undefined,
        isDisabled: typeof onGridView !== 'function',
      }),
      createExportFeature({
        onActivate: typeof onExport === 'function' ? onExport : undefined,
        isDisabled: typeof onExport !== 'function',
      }),
    ],
    [onExport, onGridView],
  );

  const isPanelVisible = Boolean(positionPanel);

  return (
    <>
      <div className="flex h-full items-stretch">
        <div
          className={cn(
            'flex h-full items-start justify-end overflow-y-auto border-l border-border bg-background transition-all duration-200',
            isPanelVisible ? 'opacity-100 py-4 pl-4 pr-0' : 'pointer-events-none opacity-0 py-0 pl-0 pr-0',
          )}
          aria-hidden={!isPanelVisible}
          style={{ width: isPanelVisible ? POSITION_PANEL_WIDTH : 0 }}
        >
          {isPanelVisible && (
            <div className="flex h-full w-full justify-end">
              {positionPanel}
            </div>
          )}
        </div>
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
            {stagingFeatures.map(feature => (
              <Button
                key={feature.id}
                variant="ghost"
                size="icon"
                className={cn(
                  'w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg',
                  feature.isDisabled && 'pointer-events-none opacity-50',
                )}
                onClick={() => feature.onActivate?.()}
                title={feature.label}
                type="button"
              >
                <feature.icon className="h-4 w-4 text-black dark:text-white" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                  {feature.label}
                </span>
              </Button>
            ))}
          </div>
        </div>
      </div>

    </>
  );
};

export default OperationsPalette;
