import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

  const coerceData = useCallback(
    (rows?: ChartDataRow[]): ChartDataRow[] =>
      (rows && rows.length > 0 ? rows : DEFAULT_CHART_DATA).map(entry => ({ ...entry })),
    [],
  );

  const coerceConfig = useCallback(
    (value?: ChartConfig): ChartConfig => {
      const merged = { ...DEFAULT_CHART_CONFIG, ...(value ?? {}) };
      return {
        ...merged,
        type: normalizeChartType(merged.type),
        legendPosition: merged.legendPosition ?? DEFAULT_CHART_CONFIG.legendPosition,
      };
    },
    [],
  );

  const [previewData, setPreviewData] = useState<ChartDataRow[]>(() => coerceData(data));
  const [previewConfig, setPreviewConfig] = useState<ChartConfig>(() => coerceConfig(config));

  const dataSetsEqual = useCallback((left: ChartDataRow[], right: ChartDataRow[]): boolean => {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      const a = left[index];
      const b = right[index];
      if (a.label !== b.label || a.value !== b.value) {
        return false;
      }
    }

    return true;
  }, []);

  const configShallowEqual = useCallback((a: ChartConfig, b: ChartConfig): boolean => {
    return (
      a.type === b.type &&
      a.colorScheme === b.colorScheme &&
      a.showLabels === b.showLabels &&
      a.showValues === b.showValues &&
      a.horizontalAlignment === b.horizontalAlignment &&
      a.axisIncludesZero === b.axisIncludesZero &&
      a.legendPosition === b.legendPosition
    );
  }, []);

  useEffect(() => {
    setPreviewData(coerceData(data));
  }, [coerceData, data]);

  useEffect(() => {
    setPreviewConfig(coerceConfig(config));
  }, [coerceConfig, config]);

  const pushUpdates = useCallback(
    (
      updates: { data?: ChartDataRow[]; config?: ChartConfig },
      options: { closeEditor?: boolean } = {},
    ) => {
      const { closeEditor = false } = options;
      if (!canEdit) {
        if (closeEditor) {
          setIsEditorOpen(false);
        }
        return;
      }

      const hasDataUpdate = Array.isArray(updates.data);
      const hasConfigUpdate = Boolean(updates.config);

      if (!hasDataUpdate && !hasConfigUpdate) {
        if (closeEditor) {
          setIsEditorOpen(false);
        }
        return;
      }

      let nextData: ChartDataRow[] | undefined;
      let nextConfig: ChartConfig | undefined;

      if (hasDataUpdate) {
        const candidate = coerceData(updates.data);
        if (!dataSetsEqual(previewData, candidate)) {
          nextData = candidate;
          setPreviewData(candidate);
        }
      }

      if (hasConfigUpdate) {
        const candidate = coerceConfig(updates.config);
        if (!configShallowEqual(previewConfig, candidate)) {
          nextConfig = candidate;
          setPreviewConfig(candidate);
        }
      }

      if (!nextData && !nextConfig) {
        if (closeEditor) {
          setIsEditorOpen(false);
        }
        return;
      }

      onInteract();
      onUpdate({
        data: nextData ? nextData.map(entry => ({ ...entry })) : undefined,
        config: nextConfig ? { ...nextConfig } : undefined,
      });

      if (closeEditor) {
        setIsEditorOpen(false);
      }
    },
    [
      canEdit,
      coerceConfig,
      coerceData,
      configShallowEqual,
      dataSetsEqual,
      onInteract,
      onUpdate,
      previewConfig,
      previewData,
    ],
  );

  const handleConfigChange = (partial: Partial<ChartConfig>) => {
    pushUpdates({
      config: {
        ...previewConfig,
        ...partial,
      },
    });
  };

  const handleTypeChange = (type: ChartType) => {
    handleConfigChange({ type });
  };

  const handleColorSchemeChange = (schemeId: string) => {
    handleConfigChange({ colorScheme: schemeId });
  };

  const handleAlignmentChange = (alignment: ChartConfig['horizontalAlignment']) => {
    handleConfigChange({ horizontalAlignment: alignment });
  };

  const handleDataEditorSave = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    pushUpdates(
      {
        data: rows,
        config: nextConfig,
      },
      { closeEditor: true },
    );
  };

  const handleDataEditorApply = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    pushUpdates({
      data: rows,
      config: nextConfig,
    });
  };

  const safeData = useMemo(() => previewData.map(entry => ({ ...entry })), [previewData]);
  const safeConfig = useMemo(() => ({ ...previewConfig }), [previewConfig]);

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
                  <div className="flex gap-1.5">
                    {scheme.colors.map((color, index) => (
                      <span
                        key={`${scheme.id}-${color}-${index}`}
                        className="h-3.5 w-3.5 rounded border border-border/40"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium">{scheme.name}</span>
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
