import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  COLOR_SCHEMES,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  LEGEND_POSITIONS,
  normalizeChartType,
} from './constants';
import type { ChartConfig, ChartDataRow, ChartType } from './types';

interface ChartDataEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rows: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onApply?: (rows: ChartDataRow[], config: ChartConfig) => void;
}

const chartTypeOptions: { id: ChartType; name: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'verticalBar', name: 'Vertical bar', icon: Columns3 },
  { id: 'horizontalBar', name: 'Horizontal bar', icon: BarChart3 },
  { id: 'line', name: 'Line', icon: LineChart },
  { id: 'area', name: 'Area', icon: AreaChart },
  { id: 'pie', name: 'Pie', icon: PieChart },
  { id: 'donut', name: 'Donut', icon: Circle },
];

const cloneRows = (rows: ChartDataRow[]): ChartDataRow[] => rows.map(row => ({ ...row }));

const sanitiseRowValue = (value: string): number => {
  if (value.trim() === '') {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ensureRows = (rows?: ChartDataRow[]): ChartDataRow[] => {
  const source = rows && rows.length > 0 ? rows : DEFAULT_CHART_DATA;
  return source.map(row => ({
    label: row.label ?? '',
    value: Number.isFinite(row.value) ? row.value : 0,
  }));
};

const ensureConfig = (config?: ChartConfig): ChartConfig => {
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

export const ChartDataEditor: React.FC<ChartDataEditorProps> = ({
  open,
  onClose,
  onSave,
  initialData,
  initialConfig,
  onApply,
}) => {
  const [rows, setRows] = useState<ChartDataRow[]>(() => ensureRows(initialData));
  const [config, setConfig] = useState<ChartConfig>(() => ensureConfig(initialConfig));

  const palette = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setRows(ensureRows(initialData));
    setConfig(ensureConfig(initialConfig));
  }, [open, initialData, initialConfig]);

  const handleAddRow = useCallback(() => {
    setRows(current => [...current, { label: `Item ${current.length + 1}`, value: 0 }]);
  }, []);

  const handleRowChange = useCallback((index: number, key: keyof ChartDataRow, value: string) => {
    setRows(current =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (key === 'value') {
          return { ...row, value: sanitiseRowValue(value) };
        }

        return { ...row, label: value };
      }),
    );
  }, []);

  const handleDeleteRow = useCallback((index: number) => {
    setRows(current => (current.length <= 1 ? current : current.filter((_, rowIndex) => rowIndex !== index)));
  }, []);

  const handleConfigChange = useCallback((patch: Partial<ChartConfig>) => {
    setConfig(current => ({
      ...current,
      ...patch,
      type: patch.type ? normalizeChartType(patch.type) : current.type,
    }));
  }, []);

  const commit = useCallback(
    (callback?: (nextRows: ChartDataRow[], nextConfig: ChartConfig) => void, shouldClose?: boolean) => {
      if (!callback) {
        if (shouldClose) {
          onClose();
        }
        return;
      }

      const payloadRows = cloneRows(rows);
      const payloadConfig: ChartConfig = { ...config, type: normalizeChartType(config.type) };
      callback(payloadRows, payloadConfig);

      if (shouldClose) {
        onClose();
      }
    },
    [rows, config, onClose],
  );

  const handleApply = useCallback(() => {
    commit(onApply);
  }, [commit, onApply]);

  const handleSave = useCallback(() => {
    commit(onSave, true);
  }, [commit, onSave]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const renderPreview = () => {
    const type = normalizeChartType(config.type);

    if (type === 'pie' || type === 'donut') {
      const total = rows.reduce((sum, item) => sum + item.value, 0) || 1;
      let currentAngle = -90;

      return (
        <div className="relative flex h-64 w-full items-center justify-center">
          <svg width="220" height="220" viewBox="0 0 220 220" className="-rotate-90">
            {rows.map((item, index) => {
              const percentage = (item.value / total) * 360;
              const startAngle = currentAngle;
              currentAngle += percentage;
              const endAngle = currentAngle;
              const outerRadius = 90;
              const innerRadius = type === 'donut' ? 48 : 0;
              const largeArc = percentage > 180 ? 1 : 0;

              const startX = 110 + outerRadius * Math.cos((startAngle * Math.PI) / 180);
              const startY = 110 + outerRadius * Math.sin((startAngle * Math.PI) / 180);
              const endX = 110 + outerRadius * Math.cos((endAngle * Math.PI) / 180);
              const endY = 110 + outerRadius * Math.sin((endAngle * Math.PI) / 180);

              const innerStartX = 110 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
              const innerStartY = 110 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
              const innerEndX = 110 + innerRadius * Math.cos((endAngle * Math.PI) / 180);
              const innerEndY = 110 + innerRadius * Math.sin((endAngle * Math.PI) / 180);

              const path =
                type === 'donut'
                  ? `M ${startX} ${startY} A 90 90 0 ${largeArc} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`
                  : `M 110 110 L ${startX} ${startY} A 90 90 0 ${largeArc} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={`${item.label}-${index}`}
                  d={path}
                  fill={palette.colors[index % palette.colors.length]}
                  className="transition-all duration-300 hover:opacity-80"
                />
              );
            })}
          </svg>
        </div>
      );
    }

    if (type === 'verticalBar' || type === 'horizontalBar') {
      const maxValue = Math.max(...rows.map(item => item.value), 1);
      const isHorizontal = type === 'horizontalBar';

      return (
        <div
          className={cn(
            'flex h-64 w-full gap-4 p-4',
            isHorizontal ? 'flex-col justify-center' : 'items-end justify-center',
          )}
        >
          {rows.map((item, index) => {
            const ratio = maxValue === 0 ? 0 : item.value / maxValue;
            const sizePercent = `${Math.max(ratio * 100, item.value > 0 ? 6 : 0)}%`;

            if (isHorizontal) {
              return (
                <div key={`${item.label}-${index}`} className="flex w-full items-center gap-3">
                  {config.showLabels && <span className="w-20 text-sm font-medium text-muted-foreground">{item.label}</span>}
                  <div className="flex h-4 flex-1 items-center overflow-hidden rounded-2xl bg-muted/20">
                    <div
                      className="h-full rounded-r-2xl transition-all duration-300"
                      style={{
                        backgroundColor: palette.colors[index % palette.colors.length],
                        width: sizePercent,
                      }}
                    />
                  </div>
                  {config.showValues && (
                    <span className="min-w-[2ch] text-right text-sm font-semibold text-foreground">{item.value}</span>
                  )}
                </div>
              );
            }

            return (
              <div key={`${item.label}-${index}`} className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <div className="flex h-44 w-10 items-end overflow-hidden rounded-2xl bg-muted/20">
                  <div
                    className="w-full rounded-t-2xl transition-all duration-300"
                    style={{
                      backgroundColor: palette.colors[index % palette.colors.length],
                      height: sizePercent,
                    }}
                  />
                </div>
                {config.showLabels && <span className="font-medium">{item.label}</span>}
                {config.showValues && <span className="font-semibold text-foreground">{item.value}</span>}
              </div>
            );
          })}
        </div>
      );
    }

    if (type === 'line' || type === 'area') {
      const maxValue = Math.max(...rows.map(item => item.value), 1);
      const points = rows
        .map((item, index) => {
          const x = (index / Math.max(rows.length - 1, 1)) * 300;
          const y = 200 - (item.value / maxValue) * 180;
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="flex h-64 w-full items-center justify-center">
          <svg width="320" height="220" viewBox="0 0 320 220">
            {type === 'area' && (
              <polygon points={`0,200 ${points} 320,200`} fill={`${palette.colors[0]}33`} stroke="none" />
            )}
            <polyline
              points={points}
              fill="none"
              stroke={palette.colors[0]}
              strokeWidth={3}
              className="transition-all duration-300"
            />
            {rows.map((item, index) => {
              const x = (index / Math.max(rows.length - 1, 1)) * 300;
              const y = 200 - (item.value / maxValue) * 180;
              return (
                <g key={`${item.label}-${index}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={5}
                    fill={palette.colors[index % palette.colors.length]}
                    className="transition-all duration-300 hover:r-7"
                  />
                  {config.showValues && (
                    <text x={x} y={y - 12} textAnchor="middle" className="fill-foreground text-xs font-semibold">
                      {item.value}
                    </text>
                  )}
                  {config.showLabels && (
                    <text x={x} y={210} textAnchor="middle" className="fill-muted-foreground text-xs">
                      {item.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
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
                  {React.createElement(
                    chartTypeOptions.find(option => option.id === normalizeChartType(config.type))?.icon ?? Columns3,
                    { className: 'h-5 w-5 text-primary' },
                  )}
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
                  {renderPreview()}
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
                    {chartTypeOptions.map(type => {
                      const Icon = type.icon;
                      const isSelected = normalizeChartType(config.type) === type.id;
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
                    value={config.colorScheme}
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
                      checked={config.showLabels}
                      onCheckedChange={checked => handleConfigChange({ showLabels: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                    <Label htmlFor="show-values" className="text-sm font-medium">
                      Show values
                    </Label>
                    <Switch
                      id="show-values"
                      checked={config.showValues}
                      onCheckedChange={checked => handleConfigChange({ showValues: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Legend position</Label>
                  <Select
                    value={config.legendPosition}
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
          {typeof onApply === 'function' && (
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl border-2 border-border/40 bg-card/40 hover:bg-card/60"
              onClick={handleApply}
            >
              Apply
            </Button>
          )}
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
