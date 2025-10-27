import React, { useEffect, useMemo, useState } from 'react';
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
  Table as TableIcon,
  Palette as PaletteIcon,
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
  onSave: (data: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onApply?: (data: ChartDataRow[], config: ChartConfig) => void;
}

const chartTypes: { id: ChartType; icon: React.ComponentType<{ className?: string }>; name: string }[] = [
  { id: 'verticalBar', icon: Columns3, name: 'Column' },
  { id: 'horizontalBar', icon: BarChart3, name: 'Bar' },
  { id: 'line', icon: LineChart, name: 'Line' },
  { id: 'area', icon: AreaChart, name: 'Area' },
  { id: 'pie', icon: PieChart, name: 'Pie' },
  { id: 'donut', icon: Circle, name: 'Donut' },
];

const sanitiseRows = (rows?: ChartDataRow[]): ChartDataRow[] => {
  const source = rows && rows.length > 0 ? rows : DEFAULT_CHART_DATA;
  return source.map(row => ({
    label: row.label ?? '',
    value: Number.isFinite(row.value) ? row.value : 0,
  }));
};

const sanitiseConfig = (config?: ChartConfig): ChartConfig => {
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
  const [chartData, setChartData] = useState<ChartDataRow[]>(() => sanitiseRows(initialData));
  const [config, setConfig] = useState<ChartConfig>(() => sanitiseConfig(initialConfig));

  useEffect(() => {
    if (!open) {
      return;
    }

    setChartData(sanitiseRows(initialData));
    setConfig(sanitiseConfig(initialConfig));
  }, [open, initialData, initialConfig]);

  useEffect(() => {
    if (!open || !onApply) {
      return;
    }

    const payloadRows = chartData.map(row => ({ label: row.label, value: Number(row.value) || 0 }));
    const payloadConfig: ChartConfig = { ...config, type: normalizeChartType(config.type) };
    onApply(payloadRows, payloadConfig);
  }, [chartData, config, onApply, open]);

  const palette = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );

  const addRow = () => {
    setChartData(current => [...current, { label: 'New Item', value: 0 }]);
  };

  const updateRow = (index: number, field: keyof ChartDataRow, value: string) => {
    setChartData(current =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (field === 'value') {
          const parsed = Number(value);
          return { ...row, value: Number.isFinite(parsed) ? parsed : 0 };
        }

        return { ...row, label: value };
      }),
    );
  };

  const deleteRow = (index: number) => {
    setChartData(current => (current.length <= 1 ? current : current.filter((_, rowIndex) => rowIndex !== index)));
  };

  const handleSave = () => {
    const payloadRows = chartData.map(row => ({
      label: row.label,
      value: Number.isFinite(row.value) ? row.value : 0,
    }));
    const payloadConfig: ChartConfig = { ...config, type: normalizeChartType(config.type) };

    onApply?.(payloadRows, payloadConfig);
    onSave(payloadRows, payloadConfig);
    onClose();
  };

  const handleLegendChange = (value: ChartConfig['legendPosition']) => {
    setConfig(current => ({ ...current, legendPosition: value }));
  };

  const renderLegendWithChart = (chart: React.ReactNode) => {
    const legend = (
      <div
        className={cn('flex flex-wrap gap-4 text-sm font-medium text-foreground', {
          'justify-center': config.legendPosition === 'top' || config.legendPosition === 'bottom',
          'flex-col items-start': config.legendPosition === 'left',
          'flex-col items-end': config.legendPosition === 'right',
        })}
      >
        {chartData.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: palette.colors[index % palette.colors.length] ?? COLOR_SCHEMES[0].colors[0] }}
            />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    );

    if (config.legendPosition === 'left' || config.legendPosition === 'right') {
      return (
        <div className="flex w-full items-center justify-center gap-6">
          {config.legendPosition === 'left' && legend}
          {chart}
          {config.legendPosition === 'right' && legend}
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-center">
        {config.legendPosition === 'top' && <div className="mb-6 w-full">{legend}</div>}
        {chart}
        {config.legendPosition === 'bottom' && <div className="mt-6 w-full">{legend}</div>}
      </div>
    );
  };

  const renderChartPreview = () => {
    const colors = palette.colors.length > 0 ? palette.colors : COLOR_SCHEMES[0].colors;
    const type = normalizeChartType(config.type);

    if (type === 'pie' || type === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0) || 1;
      let currentAngle = 0;

      const chart = (
        <div className="relative flex h-64 w-full items-center justify-center">
          <svg width="200" height="200" viewBox="0 0 200 200" className="-rotate-90">
            {chartData.map((item, index) => {
              const percentage = (item.value / total) * 360;
              const startAngle = currentAngle;
              currentAngle += percentage;
              const endAngle = currentAngle;

              const outerRadius = 80;
              const innerRadius = type === 'donut' ? 40 : 0;
              const largeArcFlag = percentage > 180 ? 1 : 0;

              const startX = 100 + outerRadius * Math.cos((startAngle * Math.PI) / 180);
              const startY = 100 + outerRadius * Math.sin((startAngle * Math.PI) / 180);
              const endX = 100 + outerRadius * Math.cos((endAngle * Math.PI) / 180);
              const endY = 100 + outerRadius * Math.sin((endAngle * Math.PI) / 180);

              const innerStartX = 100 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
              const innerStartY = 100 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
              const innerEndX = 100 + innerRadius * Math.cos((endAngle * Math.PI) / 180);
              const innerEndY = 100 + innerRadius * Math.sin((endAngle * Math.PI) / 180);

              const pathData =
                type === 'donut'
                  ? `M ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`
                  : `M 100 100 L ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={`${item.label}-${index}`}
                  d={pathData}
                  fill={colors[index % colors.length]}
                  className="transition-all duration-300 hover:opacity-80"
                />
              );
            })}
          </svg>
        </div>
      );

      return renderLegendWithChart(chart);
    }

    if (type === 'verticalBar' || type === 'horizontalBar') {
      const maxValue = Math.max(...chartData.map(item => item.value), 1);
      const isHorizontal = type === 'horizontalBar';

      const chart = (
        <div
          className={cn(
            'flex h-64 w-full gap-4 p-4',
            isHorizontal ? 'flex-col justify-center' : 'items-end justify-center',
          )}
        >
          {chartData.map((item, index) => {
            const ratio = maxValue === 0 ? 0 : item.value / maxValue;
            return (
              <div
                key={`${item.label}-${index}`}
                className={cn(
                  'flex gap-2',
                  isHorizontal ? 'flex-row items-center' : 'flex-col items-center justify-end',
                )}
              >
                <div
                  className="rounded-lg transition-all duration-300 hover:opacity-80"
                  style={{
                    backgroundColor: colors[index % colors.length],
                    [isHorizontal ? 'width' : 'height']: `${Math.max(ratio * 100, 0)}%`,
                    [isHorizontal ? 'height' : 'width']: '40px',
                    [isHorizontal ? 'minWidth' : 'minHeight']: '20px',
                  }}
                />
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              </div>
            );
          })}
        </div>
      );

      return renderLegendWithChart(chart);
    }

    if (type === 'line' || type === 'area') {
      const maxValue = Math.max(...chartData.map(item => item.value), 1);
      const points = chartData
        .map((item, index) => {
          const x = chartData.length <= 1 ? 0 : (index / (chartData.length - 1)) * 300;
          const y = 200 - (maxValue === 0 ? 0 : (item.value / maxValue) * 180);
          return `${x},${y}`;
        })
        .join(' ');

      const chart = (
        <div className="flex h-64 w-full items-center justify-center">
          <svg width="320" height="220" viewBox="0 0 320 220">
            {type === 'area' && (
              <polygon points={`0,200 ${points} 300,200`} fill={`${colors[0]}33`} stroke="none" />
            )}
            <polyline
              points={points}
              fill="none"
              stroke={colors[0]}
              strokeWidth={3}
              className="transition-all duration-300"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chartData.map((item, index) => {
              const x = chartData.length <= 1 ? 0 : (index / (chartData.length - 1)) * 300;
              const y = 200 - (maxValue === 0 ? 0 : (item.value / maxValue) * 180);
              return (
                <circle
                  key={`${item.label}-${index}`}
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

      return renderLegendWithChart(chart);
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="h-[85vh] max-w-6xl gap-0 overflow-hidden border-2 border-border/50 bg-gradient-to-br from-background via-background/98 to-primary/5 p-0 shadow-2xl">
        <DialogHeader className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-primary/5 via-transparent to-transparent px-8 pb-6 pt-8">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]" />
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 opacity-30 blur-xl" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 ring-2 ring-blue-500/30 backdrop-blur-xl">
                  <TableIcon className="h-7 w-7 text-blue-500" />
                </div>
              </div>
              <div>
                <DialogTitle className="mb-1 flex items-center gap-3 text-2xl font-bold">
                  Edit Chart Data
                  <PaletteIcon className="h-5 w-5 text-blue-500 animate-pulse" />
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Customize your chart data and appearance</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl transition-all hover:bg-destructive/10 hover:text-destructive"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-1/2 flex-col border-r border-border/50">
            <div className="border-b border-border/50 bg-gradient-to-br from-muted/20 to-transparent p-6">
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <TableIcon className="h-5 w-5 text-primary" />
                Chart Data
              </h3>
              <p className="text-sm text-muted-foreground">Enter your data values below</p>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3 p-6">
                <div className="grid grid-cols-[1fr,140px,48px] gap-3 border-b-2 border-border/50 pb-2">
                  <Label className="text-sm font-bold text-foreground">Label</Label>
                  <Label className="text-sm font-bold text-foreground">Value</Label>
                  <div />
                </div>

                {chartData.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="group grid animate-fade-in grid-cols-[1fr,140px,48px] gap-3">
                    <Input
                      value={row.label}
                      onChange={event => updateRow(index, 'label', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/50 transition-all hover:border-primary/50 focus:border-primary"
                      placeholder="Enter label"
                    />
                    <Input
                      type="number"
                      value={Number.isFinite(row.value) ? row.value : 0}
                      onChange={event => updateRow(index, 'value', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/50 transition-all hover:border-primary/50 focus:border-primary"
                      placeholder="0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRow(index)}
                      className="h-11 w-11 rounded-xl opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      disabled={chartData.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={addRow}
                  className="mt-2 h-12 w-full rounded-xl border-2 border-dashed border-border/50 transition-all hover:border-primary/50 hover:bg-primary/5"
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Add Row
                </Button>
              </div>
            </ScrollArea>
          </div>

          <div className="flex w-1/2 flex-col">
            <div className="border-b border-border/50 bg-gradient-to-br from-muted/20 to-transparent p-6">
              <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
                <TrendingUp className="h-5 w-5 text-primary" />
                Preview
              </h3>
              <p className="text-sm text-muted-foreground">Live preview of your chart</p>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-6 p-6">
                <div className="rounded-2xl border-2 border-border/50 bg-gradient-to-br from-card/50 to-muted/20 p-6">
                  {renderChartPreview()}
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Chart Type</Label>
                  <div className="flex gap-2">
                    {chartTypes.map(type => {
                      const Icon = type.icon;
                      const isSelected = config.type === type.id;
                      return (
                        <Button
                          key={type.id}
                          variant={isSelected ? 'default' : 'outline'}
                          size="icon"
                          className={cn(
                            'h-12 w-12 rounded-xl border-2 transition-all',
                            isSelected
                              ? 'scale-110 border-primary bg-primary text-primary-foreground shadow-lg'
                              : 'border-border/50 hover:border-primary/30 hover:bg-muted',
                          )}
                          onClick={() => setConfig(current => ({ ...current, type: type.id }))}
                        >
                          <Icon className="h-5 w-5" />
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Color Scheme</Label>
                  <Select
                    value={config.colorScheme}
                    onValueChange={value => setConfig(current => ({ ...current, colorScheme: value }))}
                  >
                    <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/50 hover:border-primary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {COLOR_SCHEMES.map(scheme => (
                        <SelectItem key={scheme.id} value={scheme.id} className="rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="flex gap-1.5">
                              {scheme.colors.map((color, index) => (
                                <div
                                  key={`${scheme.id}-${color}-${index}`}
                                  className="h-4 w-4 rounded-md border-2 border-border/50"
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
                  <div className="flex items-center justify-between rounded-xl border border-border/50 bg-gradient-to-br from-muted/40 to-muted/20 p-4">
                    <Label htmlFor="show-labels-editor" className="cursor-pointer text-sm font-semibold">
                      Show Labels
                    </Label>
                    <Switch
                      id="show-labels-editor"
                      checked={config.showLabels}
                      onCheckedChange={checked => setConfig(current => ({ ...current, showLabels: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border/50 bg-gradient-to-br from-muted/40 to-muted/20 p-4">
                    <Label htmlFor="show-values-editor" className="cursor-pointer text-sm font-semibold">
                      Show Values
                    </Label>
                    <Switch
                      id="show-values-editor"
                      checked={config.showValues}
                      onCheckedChange={checked => setConfig(current => ({ ...current, showValues: checked }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Legend Position</Label>
                  <Select value={config.legendPosition} onValueChange={value => handleLegendChange(value as ChartConfig['legendPosition'])}>
                    <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/50 hover:border-primary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
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

        <div className="flex items-center justify-between gap-4 border-t border-border/50 bg-gradient-to-r from-muted/5 via-transparent to-primary/5 px-8 py-5">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl border-2 border-border/50 font-semibold transition-all hover:border-border hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="group relative h-12 flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 font-semibold shadow-lg transition-all hover:from-blue-600 hover:to-purple-600 hover:shadow-2xl hover:scale-105"
          >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Save Chart
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

ChartDataEditor.displayName = 'ChartDataEditor';

export default ChartDataEditor;
