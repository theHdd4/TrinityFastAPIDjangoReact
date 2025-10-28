import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaChart,
  BarChart3,
  Calendar,
  Circle,
  Columns3,
  GanttChartSquare,
  LineChart,
  PieChart,
  Plus,
  Square,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ChartColorScheme, ChartConfig, ChartDataRow } from './types';
import {
  COLOR_SCHEMES,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  applyAlphaToHex,
  normalizeChartType,
} from './constants';

interface ChartDataEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: ChartDataRow[], config: ChartConfig) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onApply?: (data: ChartDataRow[], config: ChartConfig) => void;
}

const chartTypeGroups = [
  {
    label: 'Charts',
    types: [
      { id: 'verticalBar' as ChartConfig['type'], icon: Columns3, name: 'Column' },
      { id: 'horizontalBar' as ChartConfig['type'], icon: BarChart3, name: 'Bar' },
      { id: 'line' as ChartConfig['type'], icon: LineChart, name: 'Line' },
      { id: 'area' as ChartConfig['type'], icon: AreaChart, name: 'Area' },
      { id: 'pie' as ChartConfig['type'], icon: PieChart, name: 'Pie' },
      { id: 'donut' as ChartConfig['type'], icon: Circle, name: 'Donut' },
    ],
  },
  {
    label: 'Diagrams',
    types: [
      { id: 'blank' as ChartConfig['type'], icon: Square, name: 'Blank' },
      { id: 'calendar' as ChartConfig['type'], icon: Calendar, name: 'Calendar' },
      { id: 'gantt' as ChartConfig['type'], icon: GanttChartSquare, name: 'Gantt' },
    ],
  },
];

const legendPositions = [
  { id: 'top' as ChartConfig['legendPosition'], name: 'Top' },
  { id: 'bottom' as ChartConfig['legendPosition'], name: 'Bottom' },
  { id: 'left' as ChartConfig['legendPosition'], name: 'Left' },
  { id: 'right' as ChartConfig['legendPosition'], name: 'Right' },
];

const sanitiseData = (rows?: ChartDataRow[]): ChartDataRow[] => {
  const source = rows && rows.length ? rows : DEFAULT_CHART_DATA;
  return source.map(row => ({
    label: row.label ?? '',
    value:
      row.value === undefined || row.value === null || Number.isNaN(Number(row.value))
        ? 0
        : Number(row.value),
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
  const [chartData, setChartData] = useState<ChartDataRow[]>(() => sanitiseData(initialData));
  const [config, setConfig] = useState<ChartConfig>(() => sanitiseConfig(initialConfig));
  const [isInitialised, setIsInitialised] = useState(false);
  const configRef = useRef(config);
  const firstLabelInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (open && !isInitialised) {
      const nextData = sanitiseData(initialData);
      const nextConfig = sanitiseConfig(initialConfig);
      setChartData(nextData);
      setConfig(nextConfig);
      configRef.current = nextConfig;
      setIsInitialised(true);
      return;
    }

    if (!open && isInitialised) {
      setIsInitialised(false);
    }
  }, [open, initialData, initialConfig, isInitialised]);

  useEffect(() => {
    if (!open || !isInitialised) {
      return;
    }

    const timer = window.setTimeout(() => {
      const input = firstLabelInputRef.current;
      if (input) {
        input.focus({ preventScroll: true });
        input.select();
      }
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, isInitialised]);

  const colors = useMemo(() => {
    const scheme = COLOR_SCHEMES.find(s => s.id === config.colorScheme);
    return scheme?.colors ?? COLOR_SCHEMES[0].colors;
  }, [config.colorScheme]);

  const clampDiagramValue = (value: number) => {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (value < 0) {
      return 0;
    }
    if (value > 100) {
      return 100;
    }
    return value;
  };

  const diagramBackground = (color: string, value: number) => {
    const intensity = clampDiagramValue(value) / 100;
    return applyAlphaToHex(color, 0.25 + intensity * 0.5);
  };

  const colorSchemeGroups = useMemo(() => {
    const map = new Map<string, ChartColorScheme[]>();
    COLOR_SCHEMES.forEach(scheme => {
      const key = scheme.category ?? 'other';
      const existing = map.get(key);
      if (existing) {
        existing.push(scheme);
      } else {
        map.set(key, [scheme]);
      }
    });
    return Array.from(map.entries()).map(([category, schemes]) => ({ category, schemes }));
  }, []);

  const formatCategory = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

  const normalizedType = useMemo(() => normalizeChartType(config.type), [config.type]);
  const isDiagramType = normalizedType === 'blank' || normalizedType === 'calendar' || normalizedType === 'gantt';

  const emitApply = (nextData: ChartDataRow[], nextConfig: ChartConfig) => {
    onApply?.(nextData.map(item => ({ ...item })), nextConfig);
  };

  const addRow = () => {
    setChartData(prev => {
      const next = [...prev, { label: 'New Item', value: 0 }];
      emitApply(next, configRef.current);
      return next;
    });
  };

  const updateRow = (index: number, field: 'label' | 'value', value: string | number) => {
    setChartData(prev => {
      const next = prev.map((row, rowIndex) => {
        if (rowIndex !== index) {
          return row;
        }

        if (field === 'value') {
          const numericValue = typeof value === 'number' ? value : Number.parseFloat(value);
          return { ...row, value: Number.isFinite(numericValue) ? numericValue : 0 };
        }

        return { ...row, label: typeof value === 'string' ? value : String(value) };
      });

      emitApply(next, configRef.current);
      return next;
    });
  };

  const deleteRow = (index: number) => {
    setChartData(prev => {
      if (prev.length <= 1) {
        return prev;
      }
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      emitApply(next, configRef.current);
      return next;
    });
  };

  const handleConfigChange = (partial: Partial<ChartConfig>) => {
    const nextConfig = { ...config, ...partial };
    setConfig(nextConfig);
    configRef.current = nextConfig;
    emitApply(chartData, nextConfig);
  };

  const handleSave = () => {
    const normalisedConfig: ChartConfig = { ...config };
    onApply?.(chartData.map(item => ({ ...item })), normalisedConfig);
    onSave(chartData.map(item => ({ ...item })), normalisedConfig);
    onClose();
  };

  const renderChartPreview = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
          Add data to preview your chart or diagram.
        </div>
      );
    }

    const diagramData = chartData.map((item, index) => ({
      label: item.label || `Item ${index + 1}`,
      value: Number.isFinite(item.value) ? item.value : 0,
    }));

    if (normalizedType === 'blank') {
      return (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="rounded-2xl border border-dashed border-border/50 px-8 py-10 text-center">
            <p className="text-base font-semibold text-foreground">Blank diagram</p>
            <p className="mt-2 text-sm text-muted-foreground">Use the data table to plan or annotate your layout.</p>
          </div>
        </div>
      );
    }

    if (normalizedType === 'calendar') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const rowsPerDay = 4;
      const eventsByDay = days.map(() => [] as typeof diagramData);
      diagramData.forEach((entry, index) => {
        eventsByDay[index % days.length].push(entry);
      });

      return (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="grid h-full w-full max-w-[26rem] grid-cols-7 gap-1 p-4 text-[0.7rem]">
            {days.map((day, dayIndex) => (
              <div key={day} className="flex flex-col gap-1">
                <span className="text-[0.6rem] font-semibold uppercase tracking-wide text-muted-foreground">{day}</span>
                {Array.from({ length: rowsPerDay }).map((_, slotIndex) => {
                  const event = eventsByDay[dayIndex][slotIndex];
                  const color = colors[(dayIndex + slotIndex) % colors.length];
                  const background = event ? diagramBackground(color, event.value) : `${color}1a`;

                  return (
                    <div
                      key={`${day}-${slotIndex}`}
                      className="flex h-10 flex-col items-center justify-center rounded border border-border/40 px-2 text-center"
                      style={{ backgroundColor: background }}
                    >
                      {event && config.showLabels && (
                        <span className="w-full truncate text-[0.6rem] font-semibold text-foreground">{event.label}</span>
                      )}
                      {event && config.showValues && (
                        <span className="text-[0.55rem] text-muted-foreground">Value: {event.value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (normalizedType === 'gantt') {
      const maxValue = Math.max(...diagramData.map(entry => entry.value), 1);

      return (
        <div className="flex h-64 w-full items-center justify-center">
          <div className="flex w-full max-w-[28rem] flex-col gap-3 p-6">
            {diagramData.map((item, index) => {
              const ratio = maxValue === 0 ? 0 : item.value / maxValue;
              const widthPercent = `${Math.max(ratio * 100, 6)}%`;
              const offsetPercent = `${Math.min(index * 8, 80)}%`;
              const color = colors[index % colors.length];

              return (
                <div key={`${item.label}-${index}`} className="flex items-center gap-3">
                  {config.showLabels && (
                    <span className="w-20 truncate text-xs font-medium text-muted-foreground">{item.label}</span>
                  )}
                  <div className="relative h-8 flex-1 rounded-full bg-muted/40">
                    <div
                      className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full shadow-sm transition-all duration-300"
                      style={{ left: offsetPercent, width: widthPercent, backgroundColor: color }}
                    />
                  </div>
                  {config.showValues && (
                    <span className="w-12 text-right text-xs font-semibold text-foreground">{item.value}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (normalizedType === 'pie' || normalizedType === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      if (total <= 0) {
        return (
          <div className="flex h-64 w-full items-center justify-center text-sm text-muted-foreground">
            Add values above zero to preview this chart.
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

              const innerRadius = normalizedType === 'donut' ? 40 : 0;
              const innerStartX = 100 + innerRadius * Math.cos((startAngle * Math.PI) / 180);
              const innerStartY = 100 + innerRadius * Math.sin((startAngle * Math.PI) / 180);
              const innerEndX = 100 + innerRadius * Math.cos((currentAngle * Math.PI) / 180);
              const innerEndY = 100 + innerRadius * Math.sin((currentAngle * Math.PI) / 180);

              const pathData =
                normalizedType === 'donut'
                  ? `M ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStartX} ${innerStartY} Z`
                  : `M 100 100 L ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={`${item.label || 'slice'}-${index}`}
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

    if (normalizedType === 'verticalBar' || normalizedType === 'horizontalBar') {
      const maxValue = Math.max(...chartData.map(item => item.value), 0);
      const isBar = normalizedType === 'horizontalBar';

      return (
        <div
          className={cn(
            'flex h-64 w-full gap-4 p-4',
            isBar ? 'flex-col justify-center' : 'items-end justify-center',
          )}
        >
          {chartData.map((item, index) => {
            const ratio = maxValue === 0 ? 0 : (item.value / maxValue) * 100;
            return (
              <div
                key={`${item.label || 'bar'}-${index}`}
                className={cn('flex gap-2', isBar ? 'flex-row items-center' : 'flex-col items-center justify-end')}
              >
                <div
                  className="rounded-lg transition-all duration-300 hover:opacity-80"
                  style={{
                    backgroundColor: colors[index % colors.length],
                    [isBar ? 'width' : 'height']: `${ratio}%`,
                    [isBar ? 'height' : 'width']: '40px',
                    [isBar ? 'minWidth' : 'minHeight']: '20px',
                    minHeight: isBar ? undefined : '6px',
                    minWidth: isBar ? '6px' : undefined,
                  }}
                />
                {(config.showLabels || config.showValues) && (
                  <div
                    className={cn(
                      'flex flex-col items-center gap-1 text-xs text-muted-foreground',
                      isBar && 'items-start',
                    )}
                  >
                    {config.showValues && (
                      <span className="text-foreground">{Number.isFinite(item.value) ? item.value : 0}</span>
                    )}
                    {config.showLabels && <span>{item.label || 'Label'}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    if (normalizedType === 'line' || normalizedType === 'area') {
      const maxValue = Math.max(...chartData.map(item => item.value), 0);
      const points = chartData
        .map((item, index) => {
          const x = chartData.length <= 1 ? 0 : (index / (chartData.length - 1)) * 300;
          const y = 200 - (maxValue === 0 ? 0 : (item.value / maxValue) * 180);
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="flex h-64 w-full flex-col items-center justify-center gap-4">
          <svg width="320" height="220" viewBox="0 0 320 220">
            {normalizedType === 'area' && (
              <polygon points={`0,200 ${points} 300,200`} fill={`${colors[0]}33`} stroke="none" />
            )}
            <polyline points={points} fill="none" stroke={colors[0]} strokeWidth="3" className="transition-all duration-300" />
            {chartData.map((item, index) => {
              const x = chartData.length <= 1 ? 0 : (index / (chartData.length - 1)) * 300;
              const y = 200 - (maxValue === 0 ? 0 : (item.value / maxValue) * 180);
              return (
                <g key={`${item.label || 'point'}-${index}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r="5"
                    fill={colors[index % colors.length]}
                    className="transition-all duration-300 hover:r-7"
                  />
                  {config.showValues && (
                    <text x={x} y={y - 12} textAnchor="middle" className="fill-foreground text-xs font-semibold">
                      {Number.isFinite(item.value) ? item.value : 0}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {config.showLabels && (
            <div className="flex w-full justify-between px-8 text-xs text-muted-foreground">
              {chartData.map((item, index) => (
                <span key={`${item.label || 'axis'}-${index}`}>{item.label || `Item ${index + 1}`}</span>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent
        hideCloseButton
        className="h-[85vh] max-w-6xl gap-0 overflow-hidden border-2 border-border/50 bg-gradient-to-br from-background via-background/98 to-primary/5 p-0 shadow-2xl"
      >
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
                  Edit Chart or Diagram Data
                  <PaletteIcon className="h-5 w-5 text-blue-500 animate-pulse" />
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Customize your data and appearance</p>
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
                  <div key={index} className="group grid animate-fade-in grid-cols-[1fr,140px,48px] gap-3">
                    <Input
                      ref={index === 0 ? firstLabelInputRef : undefined}
                      value={row.label}
                      onChange={event => updateRow(index, 'label', event.target.value)}
                      className="h-11 rounded-xl border-2 border-border/50 bg-card/50 transition-all hover:border-primary/50 focus:border-primary"
                      placeholder="Enter label"
                    />
                    <Input
                      type="number"
                      value={row.value}
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

                  {!isDiagramType && (config.showLabels || config.showValues) && (
                    <div
                      className={cn('mt-6 flex flex-wrap gap-4 text-sm font-medium text-foreground', {
                        'justify-center': config.legendPosition === 'top' || config.legendPosition === 'bottom',
                        'flex-col items-start': config.legendPosition === 'left',
                        'flex-col items-end': config.legendPosition === 'right',
                      })}
                    >
                      {chartData.map((item, index) => (
                        <div key={`${item.label || 'legend'}-${index}`} className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />
                          <div className="flex flex-col text-xs">
                            {config.showLabels && <span className="font-medium text-foreground">{item.label || `Item ${index + 1}`}</span>}
                            {config.showValues && (
                              <span className="text-muted-foreground">{Number.isFinite(item.value) ? item.value : 0}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Chart or Diagram Type</Label>
                  <div className="flex flex-col gap-3">
                    {chartTypeGroups.map(group => (
                      <div key={group.label} className="flex flex-col gap-2">
                        <span className="text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
                          {group.label}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {group.types.map(type => {
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
                                onClick={() => handleConfigChange({ type: type.id })}
                              >
                                <Icon className="h-5 w-5" />
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold">Color Scheme</Label>
                  <Select
                    value={config.colorScheme}
                    onValueChange={value => handleConfigChange({ colorScheme: value })}
                  >
                    <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/50 hover:border-primary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {colorSchemeGroups.map((group, groupIndex) => (
                        <React.Fragment key={group.category}>
                          <SelectGroup>
                            <SelectLabel className="px-2 py-1 text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
                              {formatCategory(group.category)}
                            </SelectLabel>
                            {group.schemes.map(scheme => (
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
                          </SelectGroup>
                          {groupIndex < colorSchemeGroups.length - 1 && <SelectSeparator className="my-2" />}
                        </React.Fragment>
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
                      onCheckedChange={checked => handleConfigChange({ showLabels: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border/50 bg-gradient-to-br from-muted/40 to-muted/20 p-4">
                    <Label htmlFor="show-values-editor" className="cursor-pointer text-sm font-semibold">
                      Show Values
                    </Label>
                    <Switch
                      id="show-values-editor"
                      checked={config.showValues}
                      onCheckedChange={checked => handleConfigChange({ showValues: checked })}
                    />
                  </div>
                </div>

                {!isDiagramType && (
                  <div className="space-y-3">
                    <Label className="text-sm font-bold">Legend Position</Label>
                    <Select
                      value={config.legendPosition}
                      onValueChange={value => handleConfigChange({ legendPosition: value as ChartConfig['legendPosition'] })}
                    >
                      <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/50 hover:border-primary/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {legendPositions.map(position => (
                          <SelectItem key={position.id} value={position.id} className="rounded-lg">
                            {position.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
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
