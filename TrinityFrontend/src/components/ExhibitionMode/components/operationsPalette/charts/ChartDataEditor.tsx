import React, { useMemo, useState } from 'react';
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
import type { ChartConfig, ChartDataRow, EditableChartType } from './types';
import {
  COLOR_SCHEMES,
  chartTypeOptions,
  getColorSchemeColors,
  isEditableChartType,
} from './utils';

interface ChartDataEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
}

const chartTypes: { id: EditableChartType; icon: React.ComponentType<{ className?: string }>; name: string }[] = [
  { id: 'column', icon: Columns3, name: 'Column' },
  { id: 'bar', icon: BarChart3, name: 'Bar' },
  { id: 'line', icon: LineChart, name: 'Line' },
  { id: 'pie', icon: PieChart, name: 'Pie' },
  { id: 'donut', icon: Circle, name: 'Donut' },
];

const legendPositions = [
  { id: 'top', name: 'Top' },
  { id: 'bottom', name: 'Bottom' },
  { id: 'left', name: 'Left' },
  { id: 'right', name: 'Right' },
];

const ChartDataEditor: React.FC<ChartDataEditorProps> = ({
  open,
  onClose,
  onSave,
  initialData,
  initialConfig,
}) => {
  const [chartData, setChartData] = useState<ChartDataRow[]>(
    initialData && initialData.length > 0
      ? initialData.map(row => ({ ...row }))
      : [
          { label: 'Apple', value: 7 },
          { label: 'Key lime', value: 5 },
          { label: 'Cherry', value: 3 },
        ],
  );

  const [config, setConfig] = useState<ChartConfig>(() => {
    const base: ChartConfig = initialConfig
      ? { ...initialConfig }
      : {
          type: 'pie',
          colorScheme: 'default',
          showLabels: true,
          showValues: false,
          horizontalAlignment: 'center',
          axisIncludesZero: true,
        };
    if (!isEditableChartType(base.type)) {
      base.type = 'pie';
    }
    return base;
  });

  const [legendPosition, setLegendPosition] = useState('bottom');

  const addRow = () => {
    setChartData(prev => [...prev, { label: 'New Item', value: 0 }]);
  };

  const updateRow = (index: number, field: 'label' | 'value', value: string | number) => {
    setChartData(prev => {
      const next = [...prev];
      const existing = next[index] ?? { label: '', value: 0 };
      next[index] = { ...existing, [field]: value };
      return next;
    });
  };

  const deleteRow = (index: number) => {
    setChartData(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    onSave(chartData.filter(row => row.label.trim().length > 0), config);
    onClose();
  };

  const chartColors = useMemo(() => getColorSchemeColors(config.colorScheme), [config.colorScheme]);

  const renderChartPreview = () => {
    if (!chartTypeOptions.includes(config.type as any)) {
      return null;
    }

    if (config.type === 'pie' || config.type === 'donut') {
      const total = chartData.reduce((sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0), 0);
      let currentAngle = 0;

      return (
        <div className="relative w-full h-64 flex items-center justify-center">
          <svg width="200" height="200" viewBox="0 0 200 200" className="transform -rotate-90">
            {chartData.map((item, index) => {
              const value = Number.isFinite(item.value) ? item.value : 0;
              const percentage = total === 0 ? 0 : (value / total) * 100;
              const angle = (percentage / 100) * 360;
              const startAngle = currentAngle;
              currentAngle += angle;

              const startX = 100 + 80 * Math.cos((startAngle * Math.PI) / 180);
              const startY = 100 + 80 * Math.sin((startAngle * Math.PI) / 180);
              const endX = 100 + 80 * Math.cos((currentAngle * Math.PI) / 180);
              const endY = 100 + 80 * Math.sin((currentAngle * Math.PI) / 180);

              const largeArcFlag = angle > 180 ? 1 : 0;

              const innerRadius = config.type === 'donut' ? 40 : 0;
              const innerStartX = 100 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
              const innerStartY = 100 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
              const innerEndX = 100 + innerRadius * Math.cos((currentAngle * Math.PI) / 180);
              const innerEndY = 100 + innerRadius * Math.sin((currentAngle * Math.PI) / 180);

              const pathData = config.type === 'donut'
                ? `M ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`
                : `M 100 100 L ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={item.label}
                  d={pathData}
                  fill={chartColors[index % chartColors.length]}
                  className="transition-all duration-300 hover:opacity-80"
                />
              );
            })}
          </svg>
        </div>
      );
    }

    if (config.type === 'column' || config.type === 'bar') {
      const maxValue = Math.max(...chartData.map(item => (Number.isFinite(item.value) ? item.value : 0)), 0);
      const isBar = config.type === 'bar';

      return (
        <div
          className={cn(
            'w-full h-64 flex gap-4 p-4',
            isBar ? 'flex-col justify-center' : 'items-end justify-center',
          )}
        >
          {chartData.map((item, index) => {
            const value = Number.isFinite(item.value) ? item.value : 0;
            const height = maxValue === 0 ? 0 : (value / maxValue) * 100;
            return (
              <div
                key={item.label}
                className={cn(
                  'flex gap-2',
                  isBar ? 'flex-row items-center' : 'flex-col items-center justify-end',
                )}
              >
                <div
                  className="rounded-lg transition-all duration-300 hover:opacity-80"
                  style={{
                    backgroundColor: chartColors[index % chartColors.length],
                    [isBar ? 'width' : 'height']: `${height}%`,
                    [isBar ? 'height' : 'width']: '40px',
                    [isBar ? 'minWidth' : 'minHeight']: '20px',
                  }}
                />
                {config.showLabels && (
                  <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
                )}
                {config.showValues && (
                  <span className="text-xs font-semibold">{value}</span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (config.type === 'line') {
      const maxValue = Math.max(...chartData.map(item => (Number.isFinite(item.value) ? item.value : 0)), 0);
      const points = chartData
        .map((item, index) => {
          const value = Number.isFinite(item.value) ? item.value : 0;
          const x = chartData.length <= 1 ? 150 : (index / (chartData.length - 1)) * 300;
          const y = 200 - (maxValue === 0 ? 0 : (value / maxValue) * 180);
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="w-full h-64 flex items-center justify-center">
          <svg width="320" height="220" viewBox="0 0 320 220">
            <polyline
              points={points}
              fill="none"
              stroke={chartColors[0]}
              strokeWidth="3"
              className="transition-all duration-300"
            />
            {chartData.map((item, index) => {
              const value = Number.isFinite(item.value) ? item.value : 0;
              const x = chartData.length <= 1 ? 150 : (index / (chartData.length - 1)) * 300;
              const y = 200 - (maxValue === 0 ? 0 : (value / maxValue) * 180);
              return (
                <circle
                  key={item.label}
                  cx={x}
                  cy={y}
                  r="5"
                  fill={chartColors[index % chartColors.length]}
                  className="transition-all duration-300 hover:r-7"
                />
              );
            })}
          </svg>
        </div>
      );
    }

    return null;
  };
  return (
    <Dialog open={open} onOpenChange={state => { if (!state) onClose(); }}>
      <DialogContent className="max-w-7xl h-[90vh] p-0 gap-0 bg-background border border-border/60 shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-6 border-b border-border/40 bg-muted/30">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-5">
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
                <BarChart3 className="h-7 w-7 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-foreground mb-1.5">
                  Edit Chart Data
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Customise your chart data and visual appearance
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg hover:bg-muted transition-colors"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-1/2 border-r border-border/40 flex flex-col bg-muted/20">
            <div className="p-6 border-b border-border/40 bg-card">
              <h3 className="text-lg font-semibold mb-1.5 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <TableIcon className="h-4 w-4 text-primary" />
                </div>
                Chart Data
              </h3>
              <p className="text-sm text-muted-foreground">Enter your data values below</p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-3">
                <div className="grid grid-cols-[1fr,140px,48px] gap-3 pb-3 mb-2 border-b border-border/40">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Type className="h-3 w-3" />
                    Label
                  </Label>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-3 w-3" />
                    Value
                  </Label>
                  <div />
                </div>

                {chartData.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr,140px,48px] gap-3 group">
                    <Input
                      value={row.label}
                      onChange={event => updateRow(index, 'label', event.target.value)}
                      className="h-11 bg-card border border-border/60 hover:border-primary/40 focus:border-primary focus:ring-1 focus:ring-primary/20 rounded-lg transition-all"
                      placeholder="Enter label"
                    />
                    <Input
                      type="number"
                      value={row.value}
                      onChange={event => updateRow(index, 'value', Number(event.target.value) || 0)}
                      className="h-11 bg-card border border-border/60 hover:border-accent/40 focus:border-accent focus:ring-1 focus:ring-accent/20 rounded-lg transition-all"
                      placeholder="0"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRow(index)}
                      className="h-11 w-11 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      disabled={chartData.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={addRow}
                  className="w-full h-12 border border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 rounded-lg transition-all mt-4"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="font-medium">Add Row</span>
                </Button>
              </div>
            </ScrollArea>
          </div>

          <div className="w-1/2 flex flex-col">
            <div className="p-6 border-b border-border/40 bg-card">
              <h3 className="text-lg font-semibold mb-1.5 flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-accent/10 ring-1 ring-accent/20">
                  <TrendingUp className="h-4 w-4 text-accent" />
                </div>
                Live Preview
              </h3>
              <p className="text-sm text-muted-foreground">Real-time visualisation of your chart</p>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                <div className="rounded-xl border border-border/40 bg-card p-8 shadow-sm">
                  {renderChartPreview()}
                  <div className="flex flex-wrap gap-3 justify-center mt-8 pt-6 border-t border-border/20">
                    {chartData.map((item, index) => (
                      <div
                        key={`${item.label}-${index}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/50 border border-border/30"
                      >
                        <div
                          className="w-3.5 h-3.5 rounded-full"
                          style={{ backgroundColor: chartColors[index % chartColors.length] }}
                        />
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 pb-1 border-b-2 border-primary/20">
                  <h4 className="text-base font-bold text-primary flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    Chart Configuration
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Customise chart appearance and styling</p>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <div className="p-1 rounded-md bg-primary/10">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    </div>
                    Chart Type
                  </Label>
                  <div className="grid grid-cols-5 gap-2">
                    {chartTypes.map(type => {
                      const Icon = type.icon;
                      return (
                        <Button
                          key={type.id}
                          variant={config.type === type.id ? 'default' : 'outline'}
                          onClick={() => setConfig(prev => ({ ...prev, type: type.id }))}
                          className={cn(
                            'h-20 flex flex-col items-center justify-center gap-2 rounded-lg transition-all',
                            config.type === type.id
                              ? 'bg-primary text-primary-foreground shadow-md border-primary'
                              : 'hover:bg-muted border-border/60',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-xs font-medium">{type.name}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <div className="p-1 rounded-md bg-secondary/10">
                      <PaletteIcon className="h-3.5 w-3.5 text-secondary" />
                    </div>
                    Colour Scheme
                  </Label>

                  <ScrollArea className="h-80 w-full rounded-lg border border-border/60 bg-card">
                    <div className="p-3 space-y-3">
                      {Object.entries(
                        COLOR_SCHEMES.reduce<Record<string, typeof COLOR_SCHEMES>>((acc, scheme) => {
                          const group = acc[scheme.category] ?? [];
                          acc[scheme.category] = [...group, scheme];
                          return acc;
                        }, {}),
                      ).map(([category, schemes]) => (
                        <div key={category} className="mb-3">
                          <div className="px-2 py-1 mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {category}
                            </span>
                          </div>
                          <div className="space-y-1">
                            {schemes.map(scheme => (
                              <button
                                key={scheme.id}
                                onClick={() => setConfig(prev => ({ ...prev, colorScheme: scheme.id }))}
                                className={cn(
                                  'w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                                  config.colorScheme === scheme.id
                                    ? 'bg-primary/10 border border-primary/30'
                                    : 'hover:bg-muted/50',
                                )}
                                type="button"
                              >
                                <div className="flex gap-1 shrink-0">
                                  {scheme.colors.slice(0, 5).map((color, idx) => (
                                    <div
                                      key={`${scheme.id}-${idx}`}
                                      className="h-6 w-6 rounded-md border border-border/40"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                <span
                                  className={cn(
                                    'text-sm font-medium flex-1 text-left',
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
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                    <Label htmlFor="show-labels-editor" className="text-sm font-medium cursor-pointer">
                      Show Labels
                    </Label>
                    <Switch
                      id="show-labels-editor"
                      checked={config.showLabels}
                      onCheckedChange={checked => setConfig(prev => ({ ...prev, showLabels: checked }))}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border/50">
                    <Label htmlFor="show-values-editor" className="text-sm font-medium cursor-pointer">
                      Show Values
                    </Label>
                    <Switch
                      id="show-values-editor"
                      checked={config.showValues}
                      onCheckedChange={checked => setConfig(prev => ({ ...prev, showValues: checked }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Legend Position</Label>
                  <Select value={legendPosition} onValueChange={setLegendPosition}>
                    <SelectTrigger className="h-11 bg-card border border-border/60 hover:border-primary/40 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg">
                      {legendPositions.map(pos => (
                        <SelectItem key={pos.id} value={pos.id} className="rounded-md">
                          {pos.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="px-8 py-5 border-t border-border/40 bg-muted/30 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 border border-border/60 hover:bg-muted rounded-lg font-medium transition-all"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="flex-1 h-12 rounded-lg font-medium shadow-sm hover:shadow-md transition-all bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            Save Chart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChartDataEditor;
export type { ChartDataEditorProps };
