import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  Columns3,
  Circle,
  LayoutGrid,
  Calendar,
  GanttChart,
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
import type { ChartConfig, ChartDataRow, EditableChartType, DiagramChartType } from './types';
import {
  COLOR_SCHEMES,
  chartTypeOptions,
  diagramTypeOptions,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  isEditableChartType,
} from './utils';
import SlideChart from './SlideChart';

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

const diagramTypes: { id: DiagramChartType; icon: React.ComponentType<{ className?: string }>; name: string }[] = [
  { id: 'blank', icon: LayoutGrid, name: 'Blank' },
  { id: 'calendar', icon: Calendar, name: 'Calendar' },
  { id: 'gantt', icon: GanttChart, name: 'Gantt' },
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
      : [...DEFAULT_CHART_DATA],
  );

  const [config, setConfig] = useState<ChartConfig>(() => {
    const fallback: ChartConfig = { ...DEFAULT_CHART_CONFIG };
    const candidate: ChartConfig = initialConfig ? { ...fallback, ...initialConfig } : { ...fallback };
    const allowedTypes = new Set<string>([...chartTypeOptions, ...diagramTypeOptions]);
    if (!allowedTypes.has(candidate.type)) {
      candidate.type = fallback.type;
    }
    return candidate;
  });

  const [legendPosition, setLegendPosition] = useState<ChartConfig['legendPosition']>(
    () => config.legendPosition ?? DEFAULT_CHART_CONFIG.legendPosition,
  );

  useEffect(() => {
    setLegendPosition(config.legendPosition ?? DEFAULT_CHART_CONFIG.legendPosition);
  }, [config.legendPosition]);

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

  const colorSchemeGroups = useMemo(() => {
    return COLOR_SCHEMES.reduce<Record<string, typeof COLOR_SCHEMES[number][]>>((acc, scheme) => {
      const current = acc[scheme.category] ?? [];
      acc[scheme.category] = [...current, scheme];
      return acc;
    }, {});
  }, []);
  const selectedScheme = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );
  const isDiagramTypeSelected = useMemo(
    () => (diagramTypeOptions as readonly string[]).includes(config.type),
    [config.type],
  );
  const showDataTable = isEditableChartType(config.type) || config.type === 'gantt';
  const dataPanelTitle = showDataTable
    ? isDiagramTypeSelected
      ? 'Diagram data'
      : 'Chart data'
    : 'Diagram data';
  const dataPanelDescription = showDataTable
    ? isDiagramTypeSelected
      ? 'Update the data used to render this diagram.'
      : 'Enter your data values below'
    : config.type === 'blank'
      ? 'Blank diagrams do not require tabular data.'
      : 'Calendar diagrams generate their layout automatically.';
  const colors = useMemo(() => selectedScheme.colors, [selectedScheme]);

  const renderChartLegend = () => {
    if (!config.showLabels || !isEditableChartType(config.type) || chartData.length === 0) {
      return null;
    }

    const orientation = config.legendPosition === 'left' || config.legendPosition === 'right' ? 'vertical' : 'horizontal';

    return (
      <div
        className={cn(
          orientation === 'vertical'
            ? 'flex flex-col gap-3 items-start'
            : 'flex flex-wrap gap-3 justify-center',
        )}
      >
        {chartData.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/50 border border-border/30 hover:border-primary/40 transition-all hover:scale-105 group"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <span
              className="w-3.5 h-3.5 rounded-full ring-2 ring-offset-1 ring-offset-card group-hover:scale-125 transition-transform"
              style={{
                backgroundColor: colors[index % colors.length],
                boxShadow: `0 0 8px ${colors[index % colors.length]}40`,
              }}
            />
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderEditableChartPreview = () => {
    if (!isEditableChartType(config.type)) {
      return null;
    }

    if (chartData.length === 0) {
      return (
        <div className="w-full h-64 flex items-center justify-center text-sm text-muted-foreground">
          Add chart data to see the preview
        </div>
      );
    }

    if (config.type === 'pie' || config.type === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      let currentAngle = -90;

      return (
        <div className="relative w-full h-64 flex items-center justify-center">
          <svg width="220" height="220" viewBox="0 0 220 220" className="transform -rotate-90">
            {chartData.map((item, index) => {
              const percentage = total === 0 ? 0 : (item.value / total) * 360;
              const startAngle = currentAngle;
              const endAngle = currentAngle + percentage;
              currentAngle = endAngle;

              const radius = 90;
              const innerRadius = config.type === 'donut' ? 50 : 0;

              const startX = 110 + radius * Math.cos((startAngle * Math.PI) / 180);
              const startY = 110 + radius * Math.sin((startAngle * Math.PI) / 180);
              const endX = 110 + radius * Math.cos((endAngle * Math.PI) / 180);
              const endY = 110 + radius * Math.sin((endAngle * Math.PI) / 180);

              const innerStartX = 110 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
              const innerStartY = 110 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
              const innerEndX = 110 + innerRadius * Math.cos((endAngle * Math.PI) / 180);
              const innerEndY = 110 + innerRadius * Math.sin((endAngle * Math.PI) / 180);

              const largeArcFlag = percentage > 180 ? 1 : 0;

              const pathData = config.type === 'donut'
                ? `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`
                : `M 110 110 L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

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
    }

    if (config.type === 'bar') {
      const maxValue = Math.max(...chartData.map(item => item.value), 0);
      const safeMax = maxValue === 0 ? 1 : maxValue;

      return (
        <div className="w-full h-64 flex flex-col gap-3 justify-center p-6">
          {chartData.map((item, index) => {
            const percentage = (item.value / safeMax) * 100;

            return (
              <div
                key={`${item.label}-${index}`}
                className="flex w-full items-center gap-3 animate-fade-in"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                {config.showLabels && (
                  <span className="text-xs text-muted-foreground font-medium min-w-[64px] text-right">
                    {item.label}
                  </span>
                )}
                <div className="flex-1 h-10 rounded-lg bg-muted/40">
                  <div
                    className="h-full rounded-lg transition-all duration-300 hover:opacity-80"
                    style={{
                      backgroundColor: colors[index % colors.length],
                      width: `${Math.max(0, percentage)}%`,
                      minWidth: item.value > 0 ? '4px' : '0',
                    }}
                  />
                </div>
                {config.showValues && (
                  <span className="text-xs font-semibold text-foreground min-w-[36px] text-right">{item.value}</span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (config.type === 'column') {
      const maxValue = Math.max(...chartData.map(item => Math.abs(item.value)), 0);
      const safeMax = maxValue === 0 ? 1 : maxValue;

      return (
        <div className="w-full h-64 flex items-end justify-center gap-4 p-6">
          {chartData.map((item, index) => {
            const ratio = Math.max(0, Math.abs(item.value)) / safeMax;
            const percentage = ratio * 100;

            return (
              <div
                key={`${item.label}-${index}`}
                className="flex h-full flex-1 max-w-[60px] flex-col items-center justify-end gap-2 animate-fade-in"
                style={{ animationDelay: `${index * 120}ms` }}
              >
                <div
                  className="w-full rounded-t-lg transition-all duration-300 hover:scale-105 hover:opacity-90"
                  style={{
                    height: `${percentage}%`,
                    minHeight: Math.abs(item.value) > 0 ? '4px' : '0',
                    backgroundColor: colors[index % colors.length],
                  }}
                />
                {config.showLabels && (
                  <span className="text-xs text-muted-foreground text-center font-medium">{item.label}</span>
                )}
                {config.showValues && (
                  <span className="text-xs font-semibold text-foreground">{item.value}</span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    const maxValue = Math.max(...chartData.map(item => item.value), 0);
    const safeMax = maxValue === 0 ? 1 : maxValue;
    const points = chartData
      .map((item, index) => {
        const x = chartData.length <= 1 ? 160 : (index / (chartData.length - 1)) * 320;
        const y = 200 - (item.value / safeMax) * 180;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <div className="w-full h-64 flex items-center justify-center">
        <svg width="340" height="220" viewBox="0 0 340 220">
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
            const x = chartData.length <= 1 ? 160 : (index / (chartData.length - 1)) * 320;
            const y = 200 - (item.value / safeMax) * 180;
            return (
              <g key={`${item.label}-${index}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  fill={colors[index % colors.length]}
                  className="transition-all duration-300 hover:r-7"
                />
                {config.showValues && (
                  <text x={x} y={y - 12} textAnchor="middle" fontSize={12} fontWeight="bold">
                    {item.value}
                  </text>
                )}
                {config.showLabels && (
                  <text x={x} y={212} textAnchor="middle" fontSize={12}>
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const renderPreviewCard = () => {
    if (!isEditableChartType(config.type)) {
      return (
        <div className="rounded-xl border border-border/40 bg-card p-6 shadow-sm">
          <div className="w-full h-64 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center overflow-hidden">
            <SlideChart data={chartData} config={config} className="w-full h-full max-w-full" />
          </div>
        </div>
      );
    }

    const chartContent = renderEditableChartPreview();
    const legend = renderChartLegend();

    if (!legend) {
      return (
        <div className="rounded-xl border border-border/40 bg-card p-8 shadow-sm">
          {chartContent}
        </div>
      );
    }

    if (config.legendPosition === 'left') {
      return (
        <div className="rounded-xl border border-border/40 bg-card p-8 shadow-sm">
          <div className="flex items-stretch gap-6">
            <div className="pr-6 border-r border-border/20 flex flex-col justify-center">{legend}</div>
            <div className="flex-1">{chartContent}</div>
          </div>
        </div>
      );
    }

    if (config.legendPosition === 'right') {
      return (
        <div className="rounded-xl border border-border/40 bg-card p-8 shadow-sm">
          <div className="flex items-stretch gap-6">
            <div className="flex-1">{chartContent}</div>
            <div className="pl-6 border-l border-border/20 flex flex-col justify-center">{legend}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-border/40 bg-card p-8 shadow-sm">
        {config.legendPosition === 'top' && (
          <div className="pb-6 mb-6 border-b border-border/20">{legend}</div>
        )}
        {chartContent}
        {config.legendPosition === 'bottom' && (
          <div className="mt-8 pt-6 border-t border-border/20">{legend}</div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={state => { if (!state) onClose(); }}>
      <DialogContent
        hideCloseButton
        className="max-w-7xl h-[90vh] p-0 gap-0 bg-background border border-border/60 shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden"
      >
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
                {dataPanelTitle}
              </h3>
              <p className="text-sm text-muted-foreground">{dataPanelDescription}</p>
            </div>

            <ScrollArea className="flex-1">
              {showDataTable ? (
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
              ) : (
                <div className="h-full flex items-center justify-center px-8 text-sm text-muted-foreground text-center">
                  <p>{dataPanelDescription}</p>
                </div>
              )}
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
                {renderPreviewCard()}

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
                      <LayoutGrid className="h-3.5 w-3.5 text-secondary" />
                    </div>
                    Freeform Diagrams
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {diagramTypes.map(type => {
                      const Icon = type.icon;
                      const selected = config.type === type.id;
                      return (
                        <Button
                          key={type.id}
                          variant={selected ? 'default' : 'outline'}
                          onClick={() => setConfig(prev => ({ ...prev, type: type.id }))}
                          className={cn(
                            'h-20 flex flex-col items-center justify-center gap-2 rounded-lg transition-all',
                            selected
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
                    Colour scheme
                  </Label>

                  <ScrollArea className="h-80 w-full rounded-lg border border-border/60 bg-card">
                    <div className="p-3 space-y-3">
                      {Object.entries(colorSchemeGroups).map(([category, schemes]) => (
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
                                type="button"
                                onClick={() => setConfig(prev => ({ ...prev, colorScheme: scheme.id }))}
                                className={cn(
                                  'w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors',
                                  config.colorScheme === scheme.id
                                    ? 'bg-primary/10 border border-primary/30'
                                    : 'hover:bg-muted/50',
                                )}
                              >
                                <div className="flex gap-1 shrink-0">
                                  {scheme.colors.slice(0, 5).map(color => (
                                    <div
                                      key={`${scheme.id}-${color}`}
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
                  <Select
                    value={legendPosition}
                    onValueChange={value => {
                      setLegendPosition(value as ChartConfig['legendPosition']);
                      setConfig(prev => ({ ...prev, legendPosition: value as ChartConfig['legendPosition'] }));
                    }}
                  >
                    <SelectTrigger className="h-11 bg-card border border-border/60 hover:border-primary/40 rounded-lg">
                      <SelectValue placeholder="Select position" />
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
