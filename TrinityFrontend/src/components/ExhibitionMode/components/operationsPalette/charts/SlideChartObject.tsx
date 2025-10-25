import React, { useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Copy,
  Edit3,
  Palette as PaletteIcon,
  Scissors,
  Trash,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ChartDataEditor } from './ChartDataEditor';
import { SlideChart as ChartDisplay } from './SlideChart';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  normalizeChartType,
} from './constants';
import type { ChartConfig, ChartDataRow, ChartType } from './types';

interface SlideChartObjectProps {
  data?: ChartDataRow[];
  config?: ChartConfig;
  canEdit: boolean;
  className?: string;
  onUpdate: (updates: { data?: ChartDataRow[]; config?: ChartConfig }) => void;
  onDelete?: () => void;
  onInteract: () => void;
}

const ALIGNMENT_OPTIONS: { value: ChartConfig['horizontalAlignment']; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
];

export const SlideChartObject: React.FC<SlideChartObjectProps> = ({
  data = DEFAULT_CHART_DATA,
  config = DEFAULT_CHART_CONFIG,
  canEdit,
  className,
  onUpdate,
  onDelete,
  onInteract,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const safeData = useMemo(
    () => (data.length > 0 ? data : DEFAULT_CHART_DATA).map(entry => ({ ...entry })),
    [data],
  );

  const safeConfig = useMemo<ChartConfig>(
    () => ({
      ...DEFAULT_CHART_CONFIG,
      ...config,
      type: normalizeChartType(config?.type),
    }),
    [config],
  );

  const handleConfigChange = (nextConfig: ChartConfig) => {
    if (!canEdit) {
      return;
    }
    onInteract();
    onUpdate({ config: { ...nextConfig } });
  };

  const handleTypeChange = (type: ChartType) => {
    handleConfigChange({
      ...safeConfig,
      type,
    });
  };

  const handleColorSchemeChange = (schemeId: string) => {
    handleConfigChange({
      ...safeConfig,
      colorScheme: schemeId,
    });
  };

  const handleAlignmentChange = (alignment: ChartConfig['horizontalAlignment']) => {
    handleConfigChange({
      ...safeConfig,
      horizontalAlignment: alignment,
    });
  };

  const handleDataEditorSave = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    if (!canEdit) {
      return;
    }
    onInteract();
    onUpdate({
      data: rows.map(entry => ({ ...entry })),
      config: { ...nextConfig, type: normalizeChartType(nextConfig.type) },
    });
    setIsEditorOpen(false);
  };

  const handleDataEditorApply = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    if (!canEdit) {
      return;
    }
    onInteract();
    onUpdate({
      data: rows.map(entry => ({ ...entry })),
      config: { ...nextConfig, type: normalizeChartType(nextConfig.type) },
    });
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className={cn('h-full w-full', className)}>
            <ChartDisplay data={safeData} config={safeConfig} className="h-full w-full" />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-60 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
          <ContextMenuItem onSelect={() => canEdit && setIsEditorOpen(true)} disabled={!canEdit} className="rounded-lg gap-3">
            <Edit3 className="h-4 w-4" />
            <span>Edit chart data</span>
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-border/50" />
          <ContextMenuSub>
            <ContextMenuSubTrigger className="rounded-lg gap-3">
              <PaletteIcon className="h-4 w-4" />
              <span>Color scheme</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
              {COLOR_SCHEMES.map(scheme => (
                <ContextMenuItem
                  key={scheme.id}
                  onSelect={() => handleColorSchemeChange(scheme.id)}
                  disabled={!canEdit}
                  className={cn('rounded-lg gap-3', safeConfig.colorScheme === scheme.id && 'bg-muted/60 text-foreground')}
                >
                  <span className="text-lg">{scheme.icon}</span>
                  <div className="flex gap-1.5">
                    {scheme.colors.map(color => (
                      <span
                        key={color}
                        className="h-3.5 w-3.5 rounded border border-border/40"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="font-medium text-sm">{scheme.name}</span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="rounded-lg gap-3">
              <AlignCenter className="h-4 w-4" />
              <span>Align</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-52 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
              {ALIGNMENT_OPTIONS.map(option => {
                const Icon = option.icon;
                return (
                  <ContextMenuItem
                    key={option.value}
                    onSelect={() => handleAlignmentChange(option.value)}
                    disabled={!canEdit}
                    className={cn(
                      'rounded-lg gap-3',
                      safeConfig.horizontalAlignment === option.value && 'bg-muted/60 text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{option.label}</span>
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="rounded-lg gap-3">
              <BarChart3 className="h-4 w-4" />
              <span>Switch type</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-52 rounded-xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl">
              {CHART_TYPES.map(type => {
                const Icon = type.icon;
                return (
                  <ContextMenuItem
                    key={type.id}
                    onSelect={() => handleTypeChange(type.id)}
                    disabled={!canEdit}
                    className={cn(
                      'rounded-lg gap-3',
                      safeConfig.type === type.id && 'bg-muted/60 text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{type.name}</span>
                  </ContextMenuItem>
                );
              })}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator className="bg-border/50" />
          <ContextMenuItem disabled className="rounded-lg gap-3">
            <Scissors className="h-4 w-4" />
            <span>Cut (coming soon)</span>
          </ContextMenuItem>
          <ContextMenuItem disabled className="rounded-lg gap-3">
            <Copy className="h-4 w-4" />
            <span>Copy (coming soon)</span>
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-border/50" />
          <ContextMenuItem
            onSelect={() => {
              if (!canEdit) {
                return;
              }
              onInteract();
              onDelete?.();
            }}
            disabled={!canEdit || !onDelete}
            className="rounded-lg gap-3 text-destructive focus:text-destructive"
          >
            <Trash className="h-4 w-4" />
            <span>Delete</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <ChartDataEditor
        open={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleDataEditorSave}
        onApply={handleDataEditorApply}
        initialData={safeData}
        initialConfig={safeConfig}
      />
    </>
  );
};

SlideChartObject.displayName = 'SlideChartObject';

export default SlideChartObject;
