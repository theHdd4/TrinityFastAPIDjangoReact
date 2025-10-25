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

interface ChartDataEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (rows: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onApply?: (rows: ChartDataRow[], config: ChartConfig) => void;
}

const iconByChartType = {
  verticalBar: Columns3,
  horizontalBar: BarChart3,
  line: LineChart,
  area: AreaChart,
  pie: PieChart,
  donut: Circle,
} as const;

export const ChartDataEditor: React.FC<ChartDataEditorProps> = ({
  open,
  onClose,
  onSave,
  initialData,
  initialConfig,
  onApply,
}) => {
  const [chartData, setChartData] = useState<ChartDataRow[]>(() =>
    (initialData ?? DEFAULT_CHART_DATA).map(row => ({ ...row })),
  );
  const [config, setConfig] = useState<ChartConfig>(() => ({
    ...DEFAULT_CHART_CONFIG,
    ...(initialConfig ?? {}),
    type: normalizeChartType(initialConfig?.type),
  }));
  const [legendPosition, setLegendPosition] = useState<string>('bottom');

  useEffect(() => {
    if (!open) {
      return;
    }

    setChartData((initialData ?? DEFAULT_CHART_DATA).map(row => ({ ...row })));
    setConfig({
      ...DEFAULT_CHART_CONFIG,
      ...(initialConfig ?? {}),
      type: normalizeChartType(initialConfig?.type),
    });
    setLegendPosition('bottom');
  }, [open, initialData, initialConfig]);

  const colorScheme = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );

  const cloneRows = () => chartData.map(row => ({ ...row }));
  const cloneConfig = () => ({ ...config });

  const addRow = () => {
    setChartData(prev => [...prev, { label: `Item ${prev.length + 1}`, value: 0 }]);
  };

  const updateRow = (index: number, field: keyof ChartDataRow, value: string) => {
    setChartData(prev =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }
        if (field === 'value') {
          const numeric = Number(value);
          return { ...row, value: Number.isFinite(numeric) ? numeric : 0 };
        }
        return { ...row, label: value };
      }),
    );
  };

  const deleteRow = (index: number) => {
    setChartData(prev => (prev.length > 1 ? prev.filter((_, rowIndex) => rowIndex !== index) : prev));
  };

  const renderPreview = () => {
    const palette = colorScheme.colors;

    if (config.type === 'pie' || config.type === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      if (total === 0) {
        return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Add values to preview</div>;
      }

      let currentAngle = -90;
      return (
        <div className="relative flex h-64 w-full items-center justify-center">
          <svg viewBox="0 0 200 200" width={220} height={220} className="-rotate-90">
            {chartData.map((item, index) => {
              const percentage = (item.value / total) * 360;
              const start = currentAngle;
              currentAngle += percentage;
              const end = currentAngle;

              const largeArc = percentage > 180 ? 1 : 0;
              const outerRadius = 90;
              const innerRadius = config.type === 'donut' ? 48 : 0;

              const startX = 100 + outerRadius * Math.cos((start * Math.PI) / 180);
              const startY = 100 + outerRadius * Math.sin((start * Math.PI) / 180);
              const endX = 100 + outerRadius * Math.cos((end * Math.PI) / 180);
              const endY = 100 + outerRadius * Math.sin((end * Math.PI) / 180);

              const innerStartX = 100 + innerRadius * Math.cos((start * Math.PI) / 180);
              const innerStartY = 100 + innerRadius * Math.sin((start * Math.PI) / 180);
              const innerEndX = 100 + innerRadius * Math.cos((end * Math.PI) / 180);
              const innerEndY = 100 + innerRadius * Math.sin((end * Math.PI) / 180);

              const path =
                config.type === 'donut'
                  ? `M ${startX} ${startY} A 90 90 0 ${largeArc} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`
                  : `M 100 100 L ${startX} ${startY} A 90 90 0 ${largeArc} 1 ${endX} ${endY} Z`;

              return <path key={item.label} d={path} fill={palette[index % palette.length]} className="transition-opacity hover:opacity-80" />;
            })}
          </svg>
        </div>
      );
    }

    if (config.type === 'line' || config.type === 'area') {
      const maxValue = Math.max(...chartData.map(row => row.value), 1);
      const points = chartData
        .map((row, index) => {
          const x = (index / Math.max(chartData.length - 1, 1)) * 260;
          const y = 200 - (row.value / maxValue) * 170;
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="flex h-64 w-full items-center justify-center">
          <svg viewBox="0 0 260 220" width={280} height={220}>
            {config.type === 'area' && (
              <polygon
                points={`0,200 ${points} 260,200`}
                fill={`${colorScheme.colors[0]}33`}
                stroke="none"
              />
            )}
            <polyline points={points} fill="none" stroke={palette[0]} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {chartData.map((row, index) => {
              const x = (index / Math.max(chartData.length - 1, 1)) * 260;
              const y = 200 - (row.value / maxValue) * 170;
              return <circle key={row.label} cx={x} cy={y} r={5} fill={palette[index % palette.length]} className="transition-transform hover:scale-125" />;
            })}
          </svg>
        </div>
      );
    }

    const maxValue = Math.max(...chartData.map(row => row.value), 1);
    const isBar = config.type === 'horizontalBar';

    return (
      <div
        className={cn(
          'flex h-64 w-full gap-3 p-5',
          isBar ? 'flex-col justify-center' : 'items-end justify-center',
        )}
      >
        {chartData.map((row, index) => {
          const size = (row.value / maxValue) * 100;
          return (
            <div
              key={row.label}
              className={cn(
                'flex gap-1.5 text-xs font-medium text-muted-foreground',
                isBar ? 'flex-row items-center' : 'flex-col items-center justify-end',
              )}
            >
              <div
                className="rounded-lg transition-all"
                style={{
                  backgroundColor: palette[index % palette.length],
                  width: isBar ? `${size}%` : '28px',
                  height: isBar ? '18px' : `${size}%`,
                }}
              />
              <span>{row.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const handleApply = () => {
    onApply?.(cloneRows(), { ...cloneConfig(), type: normalizeChartType(config.type) });
  };

  const handleSave = () => {
    onSave(cloneRows(), { ...cloneConfig(), type: normalizeChartType(config.type) });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 gap-0 overflow-hidden border-2 border-border/50 bg-gradient-to-br from-background via-background/95 to-primary/5">
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
                  {React.createElement(iconByChartType[config.type], { className: 'h-5 w-5 text-primary' })}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Update your dataset and visual settings</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onClose}>
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
                {chartData.map((row, index) => (
                  <div key={row.label + index} className="grid grid-cols-[1fr,120px,48px] items-center gap-3">
                    <Input
                      value={row.label}
                      onChange={event => updateRow(index, 'label', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/60 focus:border-primary"
                    />
                    <Input
                      type="number"
                      value={row.value}
                      onChange={event => updateRow(index, 'value', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/60 text-right focus:border-primary"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteRow(index)}
                      disabled={chartData.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-xl border-2 border-dashed border-border/60"
                  onClick={addRow}
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
                    {chartData.map((row, index) => (
                      <span key={row.label + index} className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: colorScheme.colors[index % colorScheme.colors.length] }}
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
                      const isSelected = config.type === type.id;
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
                          onClick={() => setConfig(prev => ({ ...prev, type: type.id }))}
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
                    onValueChange={value => setConfig(prev => ({ ...prev, colorScheme: value }))}
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
                      onCheckedChange={checked => setConfig(prev => ({ ...prev, showLabels: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                    <Label htmlFor="show-values" className="text-sm font-medium">
                      Show values
                    </Label>
                    <Switch
                      id="show-values"
                      checked={config.showValues}
                      onCheckedChange={checked => setConfig(prev => ({ ...prev, showValues: checked }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Legend position</Label>
                  <Select value={legendPosition} onValueChange={setLegendPosition}>
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
            onClick={() => {
              setChartData((initialData ?? DEFAULT_CHART_DATA).map(row => ({ ...row })));
              setConfig({
                ...DEFAULT_CHART_CONFIG,
                ...(initialConfig ?? {}),
              });
              onClose();
            }}
          >
            Cancel
          </Button>
          {onApply && (
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
