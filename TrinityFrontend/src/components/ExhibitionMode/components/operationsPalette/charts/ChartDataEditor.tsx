import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import {
  AreaChart,
  BarChart3,
  Circle,
  Columns3,
  LineChart,
  PieChart,
  Plus,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  LEGEND_POSITIONS,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  normalizeChartType,
} from './constants';
import type { ChartConfig, ChartDataRow } from './types';
import { SlideChart } from './SlideChart';

interface ChartDataEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rows: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onApply?: (rows: ChartDataRow[], config: ChartConfig) => void;
}

type DraftState = {
  rows: ChartDataRow[];
  config: ChartConfig;
};

type DraftAction =
  | { type: 'reset'; payload: DraftState }
  | { type: 'addRow' }
  | { type: 'updateRow'; index: number; field: keyof ChartDataRow; value: string }
  | { type: 'deleteRow'; index: number }
  | { type: 'updateConfig'; patch: Partial<ChartConfig> };

const iconByChartType = {
  verticalBar: Columns3,
  horizontalBar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: Circle,
} as const;

const cloneRows = (rows: ChartDataRow[]): ChartDataRow[] => rows.map(row => ({ ...row }));

const sanitiseRowValue = (value: string): number => {
  if (value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const generateRowLabel = (rows: ChartDataRow[]): string => {
  const existingLabels = new Set(rows.map(row => row.label));
  let counter = rows.length + 1;
  let candidate = `Item ${counter}`;

  while (existingLabels.has(candidate)) {
    counter += 1;
    candidate = `Item ${counter}`;
  }

  return candidate;
};

const buildRows = (rows?: ChartDataRow[]): ChartDataRow[] => {
  const source = rows && rows.length > 0 ? rows : DEFAULT_CHART_DATA;
  return source.map(row => ({
    label: row.label ?? '',
    value: Number.isFinite(row.value) ? row.value : 0,
  }));
};

const buildConfig = (config?: ChartConfig): ChartConfig => {
  const merged = { ...DEFAULT_CHART_CONFIG, ...(config ?? {}) };
  return {
    ...merged,
    type: normalizeChartType(merged.type),
    colorScheme: merged.colorScheme ?? DEFAULT_CHART_CONFIG.colorScheme,
    showLabels: merged.showLabels ?? DEFAULT_CHART_CONFIG.showLabels,
    showValues: merged.showValues ?? DEFAULT_CHART_CONFIG.showValues,
    horizontalAlignment: merged.horizontalAlignment ?? DEFAULT_CHART_CONFIG.horizontalAlignment,
    axisIncludesZero: merged.axisIncludesZero ?? DEFAULT_CHART_CONFIG.axisIncludesZero,
    legendPosition: merged.legendPosition ?? DEFAULT_CHART_CONFIG.legendPosition,
  };
};

const buildState = (rows?: ChartDataRow[], config?: ChartConfig): DraftState => ({
  rows: buildRows(rows),
  config: buildConfig(config),
});

const reducer = (state: DraftState, action: DraftAction): DraftState => {
  switch (action.type) {
    case 'reset':
      return {
        rows: cloneRows(action.payload.rows),
        config: { ...action.payload.config },
      };
    case 'addRow': {
      return {
        ...state,
        rows: [...state.rows, { label: generateRowLabel(state.rows), value: 0 }],
      };
    }
    case 'updateRow': {
      const { index, field, value } = action;
      return {
        ...state,
        rows: state.rows.map((row, rowIndex) => {
          if (rowIndex !== index) {
            return row;
          }

          if (field === 'value') {
            return { ...row, value: sanitiseRowValue(value) };
          }

          return { ...row, label: value };
        }),
      };
    }
    case 'deleteRow': {
      if (state.rows.length <= 1) {
        return state;
      }

      return {
        ...state,
        rows: state.rows.filter((_, rowIndex) => rowIndex !== action.index),
      };
    }
    case 'updateConfig': {
      const next = { ...state.config, ...action.patch };
      if (action.patch.type) {
        next.type = normalizeChartType(action.patch.type);
      }
      return {
        ...state,
        config: next,
      };
    }
    default:
      return state;
  }
};

export const ChartDataEditor: React.FC<ChartDataEditorProps> = ({
  open,
  onClose,
  onSave,
  initialData,
  initialConfig,
  onApply,
}) => {
  const hasApply = typeof onApply === 'function';

  const [state, dispatch] = useReducer(reducer, undefined, () => buildState(initialData, initialConfig));

  const { rows, config } = state;

  const normalizedConfig = useMemo(() => ({
    ...config,
    type: normalizeChartType(config.type),
  }), [config]);

  const palette = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === normalizedConfig.colorScheme) ?? COLOR_SCHEMES[0],
    [normalizedConfig.colorScheme],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    dispatch({ type: 'reset', payload: buildState(initialData, initialConfig) });
  }, [open, initialData, initialConfig]);

  const handleAddRow = useCallback(() => dispatch({ type: 'addRow' }), []);

  const handleRowChange = useCallback(
    (index: number, field: keyof ChartDataRow, value: string) => {
      dispatch({ type: 'updateRow', index, field, value });
    },
    [],
  );

  const handleDeleteRow = useCallback((index: number) => dispatch({ type: 'deleteRow', index }), []);

  const handleConfigChange = useCallback((patch: Partial<ChartConfig>) => {
    dispatch({ type: 'updateConfig', patch });
  }, []);

  const commitChanges = useCallback(
    (callback: (rows: ChartDataRow[], config: ChartConfig) => void) => {
      const payloadRows = cloneRows(rows);
      const payloadConfig: ChartConfig = { ...normalizedConfig };
      callback(payloadRows, payloadConfig);
    },
    [rows, normalizedConfig],
  );

  const handleApply = useCallback(() => {
    if (!hasApply) {
      return;
    }

    commitChanges((nextRows, nextConfig) => {
      onApply?.(nextRows, nextConfig);
    });
  }, [commitChanges, hasApply, onApply]);

  const handleSave = useCallback(() => {
    commitChanges(onSave);
    onClose();
  }, [commitChanges, onSave, onClose]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'reset', payload: buildState(initialData, initialConfig) });
    onClose();
  }, [initialData, initialConfig, onClose]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="h-[85vh] max-w-5xl gap-0 overflow-hidden border-2 border-border/50 bg-gradient-to-br from-background via-background/95 to-primary/5 p-0">
        <DialogHeader className="relative border-b border-border/50 px-8 py-6">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 opacity-30 blur-xl" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-2 ring-blue-500/30">
                  <TrendingUp className="h-7 w-7 text-blue-500" />
                </div>
              </div>
              <div>
                <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
                  Edit chart data
                  {React.createElement(iconByChartType[normalizedConfig.type], { className: 'h-5 w-5 text-primary' })}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Update your dataset and visual settings</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={handleCancel}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex h-full divide-x divide-border/50">
          <div className="flex w-1/2 flex-col">
            <div className="border-b border-border/50 bg-muted/10 p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" /> Dataset
              </h3>
              <p className="text-sm text-muted-foreground">Edit the values that power your chart</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-6">
                <div className="grid grid-cols-[1fr,120px,48px] items-center gap-3 border-b border-border/40 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Label</span>
                  <span className="text-right">Value</span>
                  <span className="text-center">Actions</span>
                </div>
                {rows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="grid grid-cols-[1fr,120px,48px] items-center gap-3">
                    <Input
                      value={row.label}
                      onChange={event => handleRowChange(index, 'label', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/60 focus:border-primary"
                    />
                    <Input
                      type="number"
                      value={row.value}
                      onChange={event => handleRowChange(index, 'value', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/60 text-right focus:border-primary"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteRow(index)}
                      disabled={rows.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-xl border-2 border-dashed border-border/60"
                  onClick={handleAddRow}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add row
                </Button>
              </div>
            </ScrollArea>
          </div>

          <div className="flex w-1/2 flex-col">
            <div className="border-b border-border/50 bg-muted/10 p-6">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" /> Preview
              </h3>
              <p className="text-sm text-muted-foreground">Visualise how your chart will look</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-6 p-6">
                <div className="rounded-2xl border border-border/40 bg-card/60 p-6 shadow-inner">
                  <SlideChart data={rows} config={normalizedConfig} className="h-64 w-full" />
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-muted-foreground">
                    {rows.map((row, index) => (
                      <span key={`${row.label}-${index}`} className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: palette.colors[index % palette.colors.length] }}
                        />
                        {row.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Chart type</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {CHART_TYPES.map(type => {
                      const Icon = type.icon;
                      const isSelected = normalizedConfig.type === type.id;
                      return (
                        <Button
                          key={type.id}
                          variant={isSelected ? 'default' : 'outline'}
                          size="icon"
                          className={cn(
                            'h-12 w-12 rounded-xl border-2',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground shadow-lg'
                              : 'border-border/50 text-muted-foreground hover:border-primary/50 hover:text-primary',
                          )}
                          onClick={() => handleConfigChange({ type: type.id })}
                        >
                          <Icon className="h-5 w-5" />
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Color scheme</Label>
                  <Select
                    value={normalizedConfig.colorScheme}
                    onValueChange={value => handleConfigChange({ colorScheme: value })}
                  >
                    <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border/40 bg-popover/90 backdrop-blur">
                      {COLOR_SCHEMES.map(scheme => (
                        <SelectItem key={scheme.id} value={scheme.id} className="rounded-lg">
                          <div className="flex items-center gap-3">
                            {scheme.icon && <span className="text-lg">{scheme.icon}</span>}
                            <div className="flex gap-1.5">
                              {scheme.colors.map(color => (
                                <span
                                  key={color}
                                  className="h-4 w-4 rounded border border-border/50"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </div>
                            <span className="font-medium">{scheme.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                    <Label htmlFor="show-labels" className="text-sm font-medium">
                      Show labels
                    </Label>
                    <Switch
                      id="show-labels"
                      checked={normalizedConfig.showLabels}
                      onCheckedChange={checked => handleConfigChange({ showLabels: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                    <Label htmlFor="show-values" className="text-sm font-medium">
                      Show values
                    </Label>
                    <Switch
                      id="show-values"
                      checked={normalizedConfig.showValues}
                      onCheckedChange={checked => handleConfigChange({ showValues: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Legend position</Label>
                  <Select
                    value={normalizedConfig.legendPosition}
                    onValueChange={value =>
                      handleConfigChange({ legendPosition: value as ChartConfig['legendPosition'] })
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border/40 bg-popover/90 backdrop-blur">
                      {LEGEND_POSITIONS.map(position => (
                        <SelectItem key={position.id} value={position.id} className="rounded-lg">
                          {position.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border/50 bg-muted/10 px-8 py-5">
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-xl border-2 border-border/50"
            onClick={handleCancel}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            className={cn(
              'h-11 flex-1 rounded-xl border-2 border-border/40 bg-card/40 hover:bg-card/60',
              !hasApply && 'cursor-not-allowed opacity-50 hover:bg-card/40',
            )}
            onClick={handleApply}
            disabled={!hasApply}
          >
            Apply
          </Button>
          <Button
            className="relative h-11 flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
            onClick={handleSave}
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 hover:translate-x-full" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              <TrendingUp className="h-4 w-4" /> Save data
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

ChartDataEditor.displayName = 'ChartDataEditor';

export default ChartDataEditor;
