import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  LineChart,
  PieChart,
  Columns3,
  Circle,
  Plus,
  Trash2,
  X,
  TrendingUp,
  Table as TableIcon,
  Palette as PaletteIcon,
  Type,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChartConfig, ChartDataRow } from './types';
import { COLOR_SCHEMES, DEFAULT_CHART_CONFIG, DEFAULT_CHART_DATA, normalizeChartType } from './constants';

interface ChartDataEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onApply?: (data: ChartDataRow[], config: ChartConfig) => void;
}

const chartTypes: { id: ChartConfig['type']; icon: LucideIcon; name: string }[] = [
  { id: 'verticalBar', icon: Columns3, name: 'Column' },
  { id: 'horizontalBar', icon: BarChart3, name: 'Bar' },
  { id: 'line', icon: LineChart, name: 'Line' },
  { id: 'pie', icon: PieChart, name: 'Pie' },
  { id: 'donut', icon: Circle, name: 'Donut' },
];

const legendPositions: { id: ChartConfig['legendPosition']; name: string }[] = [
  { id: 'top', name: 'Top' },
  { id: 'bottom', name: 'Bottom' },
  { id: 'left', name: 'Left' },
  { id: 'right', name: 'Right' },
];

const sanitiseData = (rows?: ChartDataRow[]): ChartDataRow[] => {
  const source = rows && rows.length ? rows : DEFAULT_CHART_DATA;
  return source.map(row => ({
    label: row.label ?? '',
    value: Number.isFinite(row.value) ? row.value : 0,
  }));
};

const sanitiseConfig = (value?: ChartConfig): ChartConfig => {
  const merged = { ...DEFAULT_CHART_CONFIG, ...(value ?? {}) };
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
  onApply,
  initialData,
  initialConfig,
}) => {
  const [chartData, setChartData] = useState<ChartDataRow[]>(() => sanitiseData(initialData));
  const [config, setConfig] = useState<ChartConfig>(() => sanitiseConfig(initialConfig));
  const skipNextApplyRef = useRef(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextData = sanitiseData(initialData);
    const nextConfig = sanitiseConfig(initialConfig);
    setChartData(nextData);
    setConfig(nextConfig);
    skipNextApplyRef.current = true;
  }, [open, initialData, initialConfig]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (skipNextApplyRef.current) {
      skipNextApplyRef.current = false;
      return;
    }

    onApply?.(
      chartData.map(item => ({ ...item })),
      { ...config },
    );
  }, [open, chartData, config, onApply]);

  const colors = useMemo(() => {
    const scheme = COLOR_SCHEMES.find(s => s.id === config.colorScheme);
    return scheme?.colors ?? COLOR_SCHEMES[0].colors;
  }, [config.colorScheme]);

  const addRow = () => {
    setChartData(prev => [...prev, { label: 'New Item', value: 0 }]);
  };

  const updateRow = (index: number, field: 'label' | 'value', value: string | number) => {
    setChartData(prev =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (field === 'label') {
          return {
            ...row,
            label: typeof value === 'string' ? value : String(value ?? ''),
          };
        }

        const numericValue =
          typeof value === 'number'
            ? value
            : Number.isFinite(Number.parseFloat(value))
            ? Number.parseFloat(value)
            : 0;

        return {
          ...row,
          value: numericValue,
        };
      }),
    );
  };

  const deleteRow = (index: number) => {
    setChartData(prev => {
      if (prev.length <= 1) {
        return prev;
      }
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  };

  const handleConfigChange = (partial: Partial<ChartConfig>) => {
    setConfig(prev => ({ ...prev, ...partial }));
  };

  const handleSave = () => {
    const nextData = chartData.map(item => ({ ...item }));
    const nextConfig = { ...config };
    onApply?.(nextData, nextConfig);
    onSave(nextData, nextConfig);
    onClose();
  };

  const renderChartPreview = () => {
    if (chartData.length === 0) {
      return (
        <div className="relative flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
          Add data to preview your chart
        </div>
      );
    }

    const type = normalizeChartType(config.type);

    if (type === 'pie' || type === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      if (total <= 0) {
        return (
          <div className="relative flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
            Add values above zero to preview this chart
          </div>
        );
      }

      let currentAngle = 0;

      return (
        <div className="relative flex h-64 w-full items-center justify-center">
          <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
            {chartData.map((item, index) => {
              const percentage = (item.value / total) * 100;
              const angle = (percentage / 100) * 360;
              const startAngle = currentAngle;
              currentAngle += angle;

              const startX = 100 + 80 * Math.cos((startAngle * Math.PI) / 180);
              const startY = 100 + 80 * Math.sin((startAngle * Math.PI) / 180);
              const endX = 100 + 80 * Math.cos((currentAngle * Math.PI) / 180);
              const endY = 100 + 80 * Math.sin((currentAngle * Math.PI) / 180);

              const largeArcFlag = angle > 180 ? 1 : 0;

              const innerRadius = type === 'donut' ? 40 : 0;
              const innerStartX = 100 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
              const innerStartY = 100 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
              const innerEndX = 100 + innerRadius * Math.cos((currentAngle * Math.PI) / 180);
              const innerEndY = 100 + innerRadius * Math.sin((currentAngle * Math.PI) / 180);

              const pathData =
                type === 'donut'
                  ? `M ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`
                  : `M 100 100 L ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={index}
                  d={pathData}
                  fill={colors[index % colors.length]}
                  className="transition-all duration-300 hover:opacity-80"
                />
              );
            })}
          </svg>
        </div>
      );
    }

    if (type === 'verticalBar' || type === 'horizontalBar') {
      const maxValue = Math.max(...chartData.map(item => item.value), 0);
      if (maxValue <= 0) {
        return (
          <div className="relative flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
            Add positive values to preview this chart
          </div>
        );
      }

      const isHorizontal = type === 'horizontalBar';

      return (
        <div
          className={cn(
            'flex h-64 w-full gap-4 p-4',
            isHorizontal ? 'flex-col justify-center' : 'items-end justify-center',
          )}
        >
          {chartData.map((item, index) => {
            const ratio = item.value / maxValue;
            const sizePercent = `${Math.max(ratio * 100, 2)}%`;

            return (
              <div
                key={index}
                className={cn(
                  'flex gap-2',
                  isHorizontal ? 'flex-row items-center' : 'flex-col items-center justify-end',
                )}
              >
                <div
                  className="rounded-lg transition-all duration-300 hover:opacity-80"
                  style={{
                    backgroundColor: colors[index % colors.length],
                    ...(isHorizontal
                      ? { width: sizePercent, height: '40px', minWidth: '20px' }
                      : { height: sizePercent, width: '40px', minHeight: '20px' }),
                  }}
                />
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              </div>
            );
          })}
        </div>
      );
    }

    if (type === 'line') {
      const maxValue = Math.max(...chartData.map(item => item.value), 0);
      if (maxValue <= 0) {
        return (
          <div className="relative flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
            Add positive values to preview this chart
          </div>
        );
      }

      const width = 320;
      const height = 220;

      const points = chartData
        .map((item, index) => {
          const total = chartData.length - 1;
          const x = total === 0 ? width / 2 : (index / total) * (width - 20) + 10;
          const y = height - 20 - (item.value / maxValue) * (height - 40);
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="flex h-64 w-full items-center justify-center">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <polyline
              points={points}
              fill="none"
              stroke={colors[0]}
              strokeWidth="3"
              className="transition-all duration-300"
            />
            {chartData.map((item, index) => {
              const total = chartData.length - 1;
              const x = total === 0 ? width / 2 : (index / total) * (width - 20) + 10;
              const y = height - 20 - (item.value / maxValue) * (height - 40);
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="5"
                  fill={colors[index % colors.length]}
                  className="transition-all duration-300 hover:r-7"
                />
              );
            })}
          </svg>
        </div>
      );
    }

    return (
      <div className="relative flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
        Selected chart type is not supported in this preview
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-w-7xl h-[90vh] gap-0 overflow-hidden border border-border/60 bg-background p-0 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <DialogHeader className="border-b border-border/40 bg-muted/30 px-8 pt-8 pb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <div>
                <DialogTitle className="mb-1.5 text-2xl font-bold text-foreground">
                  Edit Chart Data
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Customize your chart data and visual appearance</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg transition-colors hover:bg-muted"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-1/2 flex-col border-r border-border/40 bg-muted/20">
            <div className="border-b border-border/40 bg-card p-6">
              <h3 className="mb-1.5 flex items-center gap-2.5 text-lg font-semibold">
                <div className="rounded-lg bg-primary/10 p-1.5 ring-1 ring-primary/20">
                  <TableIcon className="h-4 w-4 text-primary" />
                </div>
                Chart Data
              </h3>
              <p className="text-sm text-muted-foreground">Enter your data values below</p>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 p-6">
                <div className="mb-2 grid grid-cols-[1fr,140px,48px] gap-3 border-b border-border/40 pb-3">
                  <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Type className="h-3 w-3" />
                    Label
                  </Label>
                  <Label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    Value
                  </Label>
                  <div />
                </div>

                {chartData.map((row, index) => (
                  <div key={index} className="group grid grid-cols-[1fr,140px,48px] gap-3 animate-fade-in">
                    <Input
                      value={row.label}
                      onChange={event => updateRow(index, 'label', event.target.value)}
                      className="h-11 rounded-lg border border-border/60 bg-card transition-all hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/20"
                      placeholder="Enter label"
                    />
                    <Input
                      type="number"
                      value={row.value}
                      onChange={event => updateRow(index, 'value', event.target.value)}
                      className="h-11 rounded-lg border border-border/60 bg-card transition-all hover:border-accent/40 focus:border-accent focus:ring-1 focus:ring-accent/20"
                      placeholder="0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRow(index)}
                      className="h-11 w-11 rounded-lg opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      disabled={chartData.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={addRow}
                  className="mt-4 h-12 w-full rounded-lg border border-dashed border-border/60 transition-all hover:border-primary/40 hover:bg-primary/5"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="font-medium">Add Row</span>
                </Button>
              </div>
            </ScrollArea>
          </div>

          <div className="flex w-1/2 flex-col">
            <div className="border-b border-border/40 bg-card p-6">
              <h3 className="mb-1.5 flex items-center gap-2.5 text-lg font-semibold">
                <div className="rounded-lg bg-accent/10 p-1.5 ring-1 ring-accent/20">
                  <TrendingUp className="h-4 w-4 text-accent" />
                </div>
                Live Preview
              </h3>
              <p className="text-sm text-muted-foreground">Real-time visualization of your chart</p>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-6 p-6">
                <div className="rounded-xl border border-border/40 bg-card p-8 shadow-sm">
                  {renderChartPreview()}

                  <div
                    className={cn(
                      'mt-8 flex flex-wrap gap-3 border-t border-border/20 pt-6',
                      config.legendPosition === 'left'
                        ? 'justify-start'
                        : config.legendPosition === 'right'
                        ? 'justify-end'
                        : 'justify-center',
                    )}
                  >
                    {chartData.map((item, index) => {
                      const scheme = COLOR_SCHEMES.find(s => s.id === config.colorScheme);
                      const legendColors = scheme?.colors ?? COLOR_SCHEMES[0].colors;

                      return (
                        <div
                          key={`${item.label}-${index}`}
                          className="group flex items-center gap-2 rounded-lg border border-border/30 bg-card/50 px-3 py-1.5 transition-all hover:scale-105 hover:border-primary/40"
                          style={{ animationDelay: `${index * 100}ms` }}
                        >
                          <div
                            className="h-3.5 w-3.5 rounded-full ring-2 ring-offset-1 ring-offset-card transition-transform group-hover:scale-125"
                            style={{
                              backgroundColor: legendColors[index % legendColors.length],
                              boxShadow: `0 0 8px ${legendColors[index % legendColors.length]}40`,
                            }}
                          />
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b-2 border-primary/20 pb-1 pt-2">
                  <h4 className="flex items-center gap-2 text-base font-bold text-primary">
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                    Chart Configuration
                  </h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">Customize chart appearance and styling</p>
                </div>

                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <div className="rounded-md bg-primary/10 p-1">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Chart Type
                  </Label>
                  <div className="grid grid-cols-5 gap-2">
                    {chartTypes.map(typeOption => {
                      const Icon = typeOption.icon;
                      const isActive = normalizeChartType(config.type) === typeOption.id;

                      return (
                        <Button
                          key={typeOption.id}
                          variant={isActive ? 'default' : 'outline'}
                          onClick={() => handleConfigChange({ type: typeOption.id })}
                          className={cn(
                            'flex h-20 flex-col items-center justify-center gap-2 rounded-lg transition-all',
                            isActive
                              ? 'border-primary bg-primary text-primary-foreground shadow-md'
                              : 'border-border/60 hover:bg-muted',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-medium">{typeOption.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <div className="rounded-md bg-secondary/10 p-1">
                      <PaletteIcon className="h-3.5 w-3.5 text-secondary" />
                    </div>
                    Color Scheme
                  </Label>

                  <ScrollArea className="h-80 w-full rounded-lg border border-border/60 bg-card">
                    <div className="space-y-3 p-3">
                      {Object.entries(
                        COLOR_SCHEMES.reduce((acc, scheme) => {
                          const category = scheme.category ?? 'other';
                          if (!acc[category]) {
                            acc[category] = [];
                          }
                          acc[category].push(scheme);
                          return acc;
                        }, {} as Record<string, typeof COLOR_SCHEMES>),
                      ).map(([category, schemes]) => (
                        <div key={category} className="mb-3">
                          <div className="mb-2 px-2 py-1">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {category}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {schemes.map(scheme => (
                              <button
                                key={scheme.id}
                                onClick={() => handleConfigChange({ colorScheme: scheme.id })}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-lg p-2.5 transition-colors',
                                  config.colorScheme === scheme.id
                                    ? 'border border-primary/30 bg-primary/10'
                                    : 'hover:bg-muted/50',
                                )}
                                type="button"
                              >
                                <div className="flex shrink-0 gap-1">
                                  {scheme.colors.slice(0, 5).map((color, colorIndex) => (
                                    <div
                                      key={colorIndex}
                                      className="h-6 w-6 rounded-md border border-border/40"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                <span
                                  className={cn(
                                    'flex-1 text-left text-sm font-medium',
                                    config.colorScheme === scheme.id ? 'text-primary' : 'text-foreground',
                                  )}
                                >
                                  {scheme.name}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/50 p-4">
                    <Label htmlFor="show-labels-editor" className="cursor-pointer text-sm font-medium">
                      Show Labels
                    </Label>
                    <Switch
                      id="show-labels-editor"
                      checked={config.showLabels}
                      onCheckedChange={checked => handleConfigChange({ showLabels: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/50 p-4">
                    <Label htmlFor="show-values-editor" className="cursor-pointer text-sm font-medium">
                      Show Values
                    </Label>
                    <Switch
                      id="show-values-editor"
                      checked={config.showValues}
                      onCheckedChange={checked => handleConfigChange({ showValues: checked })}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Legend Position</Label>
                  <Select
                    value={config.legendPosition}
                    onValueChange={value =>
                      handleConfigChange({ legendPosition: value as ChartConfig['legendPosition'] })
                    }
                  >
                    <SelectTrigger className="h-11 rounded-lg border border-border/60 bg-card transition-colors hover:border-primary/40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      {legendPositions.map(position => (
                        <SelectItem key={position.id} value={position.id} className="rounded-md">
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

        <div className="flex items-center justify-between gap-4 border-t border-border/40 bg-muted/30 px-8 py-5">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-12 flex-1 rounded-lg border border-border/60 font-medium transition-all hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="h-12 flex-1 rounded-lg bg-primary font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <TrendingUp className="mr-2 h-4 w-4" />
            Save Chart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

ChartDataEditor.displayName = 'ChartDataEditor';

export default ChartDataEditor;
