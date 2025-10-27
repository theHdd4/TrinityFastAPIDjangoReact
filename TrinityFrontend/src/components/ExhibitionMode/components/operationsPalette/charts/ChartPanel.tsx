import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Calendar,
  Database,
  GanttChartSquare,
  MousePointerClick,
  Palette,
  Sparkles,
  Square,
  TrendingUp,
  Wand2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChartDataEditor } from './ChartDataEditor';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  normalizeChartType,
} from './constants';
import type { ChartColorScheme, ChartConfig, ChartDataRow, ChartPanelResult, ChartType } from './types';

interface ChartPanelProps {
  onClose: () => void;
  onInsert: (result: ChartPanelResult) => void;
  initialData?: ChartDataRow[];
  initialConfig?: ChartConfig;
  onStateChange?: (state: { data: ChartDataRow[]; config: ChartConfig }) => void;
}

const renderSparkles = () => (
  <div className="absolute inset-0 overflow-hidden">
    <div className="absolute left-6 top-6 h-24 w-24 rounded-full bg-primary/10 blur-3xl" />
    <div className="absolute right-6 bottom-10 h-20 w-20 rounded-full bg-purple-500/20 blur-3xl" />
  </div>
);

const FREEFORM_DIAGRAMS = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Start from a clean canvas',
    icon: Square,
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Plan schedules visually',
    icon: Calendar,
  },
  {
    id: 'gantt',
    name: 'Gantt',
    description: 'Track project timelines',
    icon: GanttChartSquare,
  },
];

const sanitiseConfig = (value?: ChartConfig): ChartConfig => {
  const merged = { ...DEFAULT_CHART_CONFIG, ...(value ?? {}) };
  return {
    ...merged,
    type: normalizeChartType(merged.type),
    legendPosition: merged.legendPosition ?? DEFAULT_CHART_CONFIG.legendPosition,
  };
};

export const ChartPanel: React.FC<ChartPanelProps> = ({
  onClose,
  onInsert,
  initialData,
  initialConfig,
  onStateChange,
}) => {
  const [chartData, setChartData] = useState<ChartDataRow[]>(() =>
    (initialData ?? DEFAULT_CHART_DATA).map(entry => ({ ...entry })),
  );
  const [config, setConfig] = useState<ChartConfig>(() => sanitiseConfig(initialConfig));
  const [showDataEditor, setShowDataEditor] = useState(false);
  const [selectedDiagram, setSelectedDiagram] = useState<string>('calendar');

  const selectedType = useMemo(() => config.type, [config.type]);

  const palette = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );

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

  useEffect(() => {
    setChartData((initialData ?? DEFAULT_CHART_DATA).map(entry => ({ ...entry })));
  }, [initialData]);

  useEffect(() => {
    setConfig(sanitiseConfig(initialConfig));
  }, [initialConfig]);

  useEffect(() => {
    onStateChange?.({
      data: chartData,
      config,
    });
  }, [chartData, config, onStateChange]);

  const handleInsert = () => {
    onInsert({
      data: chartData.map(entry => ({ ...entry })),
      config: sanitiseConfig(config),
    });
  };

  const syncEditorState = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    setChartData(rows.map(entry => ({ ...entry })));
    setConfig(sanitiseConfig(nextConfig));
  };

  const handleDataEditorSave = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    syncEditorState(rows, nextConfig);
  };

  const handleDataEditorApply = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    syncEditorState(rows, nextConfig);
  };

  const renderPreview = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground">
          Add data to preview your chart
        </div>
      );
    }

    if (selectedType === 'pie' || selectedType === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      if (total === 0) {
        return (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-border/50 text-xs text-muted-foreground">
            Add non-zero values to preview your chart
          </div>
        );
      }

      let currentAngle = -90;
      return (
        <div className="flex h-56 w-full items-center justify-center">
          <svg viewBox="0 0 220 220" width={200} height={200} className="-rotate-90">
            {chartData.map((item, index) => {
              const percentage = (item.value / total) * 360;
              const start = currentAngle;
              currentAngle += percentage;
              const end = currentAngle;

              const outerRadius = 90;
              const innerRadius = selectedType === 'donut' ? 48 : 0;
              const largeArc = percentage > 180 ? 1 : 0;

              const startX = 110 + outerRadius * Math.cos((start * Math.PI) / 180);
              const startY = 110 + outerRadius * Math.sin((start * Math.PI) / 180);
              const endX = 110 + outerRadius * Math.cos((end * Math.PI) / 180);
              const endY = 110 + outerRadius * Math.sin((end * Math.PI) / 180);

              const innerStartX = 110 + innerRadius * Math.cos((start * Math.PI) / 180);
              const innerStartY = 110 + innerRadius * Math.sin((start * Math.PI) / 180);
              const innerEndX = 110 + innerRadius * Math.cos((end * Math.PI) / 180);
              const innerEndY = 110 + innerRadius * Math.sin((end * Math.PI) / 180);

              const path =
                selectedType === 'donut'
                  ? `M ${startX} ${startY} A 90 90 0 ${largeArc} 1 ${endX} ${endY} L ${innerEndX} ${innerEndY} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStartX} ${innerStartY} Z`
                  : `M 110 110 L ${startX} ${startY} A 90 90 0 ${largeArc} 1 ${endX} ${endY} Z`;

              return (
                <path
                  key={item.label}
                  d={path}
                  fill={palette.colors[index % palette.colors.length]}
                  className="transition-transform hover:scale-105"
                  style={{ transformOrigin: '50% 50%' }}
                />
              );
            })}
          </svg>
        </div>
      );
    }

    if (selectedType === 'line' || selectedType === 'area') {
      const maxValue = Math.max(...chartData.map(item => item.value), 1);
      const points = chartData
        .map((item, index) => {
          const x = (index / Math.max(chartData.length - 1, 1)) * 240;
          const y = 200 - (item.value / maxValue) * 170;
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="flex h-56 items-center justify-center">
          <svg viewBox="0 0 240 220" width={240} height={220}>
            {selectedType === 'area' && (
              <polygon points={`0,200 ${points} 240,200`} fill={`${palette.colors[0]}33`} stroke="none" />
            )}
            <polyline
              points={points}
              fill="none"
              stroke={palette.colors[0]}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chartData.map((item, index) => {
              const x = (index / Math.max(chartData.length - 1, 1)) * 240;
              const y = 200 - (item.value / maxValue) * 170;
              return <circle key={item.label} cx={x} cy={y} r={5} fill={palette.colors[index % palette.colors.length]} />;
            })}
          </svg>
        </div>
      );
    }

    const maxValue = Math.max(...chartData.map(item => item.value), 1);
    const isHorizontal = selectedType === 'horizontalBar';

    const renderVerticalBar = (item: typeof chartData[number], index: number) => {
      const ratio = maxValue === 0 ? 0 : item.value / maxValue;
      const heightPercent = `${Math.max(ratio * 100, item.value > 0 ? 6 : 0)}%`;
      return (
        <div
          key={item.label}
          className="flex flex-col items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground"
        >
          <div className="flex h-40 w-8 items-end overflow-hidden rounded-2xl bg-muted/20">
            <div
              className="w-full rounded-t-2xl transition-all duration-300"
              style={{
                backgroundColor: palette.colors[index % palette.colors.length],
                height: heightPercent,
              }}
            />
          </div>
          {config.showLabels && <span>{item.label}</span>}
          {config.showValues && <span className="font-semibold text-foreground">{item.value}</span>}
        </div>
      );
    };

    const renderHorizontalBar = (item: typeof chartData[number], index: number) => {
      const ratio = maxValue === 0 ? 0 : item.value / maxValue;
      const widthPercent = `${Math.max(ratio * 100, item.value > 0 ? 6 : 0)}%`;
      return (
        <div
          key={item.label}
          className="flex w-full flex-row items-center gap-2 text-[0.7rem] font-medium text-muted-foreground"
        >
          {config.showLabels && <span className="w-16 text-right">{item.label}</span>}
          <div className="flex h-3.5 flex-1 items-center overflow-hidden rounded-2xl bg-muted/20">
            <div
              className="h-full rounded-r-2xl transition-all duration-300"
              style={{
                backgroundColor: palette.colors[index % palette.colors.length],
                width: widthPercent,
              }}
            />
          </div>
          {config.showValues && (
            <span className="min-w-[2ch] text-right font-semibold text-foreground">{item.value}</span>
          )}
        </div>
      );
    };

    return (
      <div
        className={cn(
          'flex h-56 w-full gap-3 px-5 py-6',
          isHorizontal ? 'flex-col justify-center' : 'items-end justify-center',
        )}
      >
        {chartData.map((item, index) =>
          isHorizontal ? renderHorizontalBar(item, index) : renderVerticalBar(item, index),
        )}
      </div>
    );
  };

  const renderLegend = () => (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[0.7rem] font-medium text-muted-foreground">
      {chartData.map((item, index) => (
        <span key={item.label} className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: palette.colors[index % palette.colors.length] }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );

  const handleChartTypeChange = (type: ChartType) => {
    setConfig(prev => ({ ...prev, type }));
  };

  const toggleAlignment = (alignment: 'left' | 'center' | 'right') => {
    setConfig(prev => ({ ...prev, horizontalAlignment: alignment }));
  };

  const toggleAxisZero = (checked: boolean) => {
    setConfig(prev => ({ ...prev, axisIncludesZero: checked }));
  };

  return (
    <>
      <div className="flex h-full w-full max-w-[20rem] shrink-0 flex-col rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
        <div className="relative flex items-start justify-between border-b border-border/60 px-6 py-5">
          {renderSparkles()}
          <div className="relative flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 opacity-30 blur-xl" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 ring-2 ring-pink-500/30">
                <BarChart3 className="h-6 w-6 text-pink-500" />
              </div>
            </div>
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                Charts & diagrams
                <Sparkles className="h-4 w-4 text-yellow-400" />
              </h2>
              <p className="text-xs text-muted-foreground">Craft a beautiful data story for your slide.</p>
            </div>
          </div>
        </div>

        <ScrollArea className="h-full">
          <div className="space-y-6 p-6">
            <section className="space-y-3">
              <header className="flex items-center gap-2">
                <div className="h-7 w-1 rounded-full bg-gradient-to-b from-blue-500 to-purple-500" />
                <h3 className="text-base font-semibold text-foreground">Chart styles</h3>
              </header>
              <div className="grid grid-cols-2 gap-2">
                {CHART_TYPES.map(type => {
                  const Icon = type.icon;
                  const isSelected = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleChartTypeChange(type.id)}
                      className={cn(
                        'group relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                        isSelected
                          ? 'border-primary shadow-2xl ring-2 ring-primary/20'
                          : 'border-border/50 bg-card hover:scale-[1.03] hover:border-primary/40 hover:shadow-xl',
                      )}
                    >
                      <Icon className={cn('h-5 w-5 transition-colors duration-200', isSelected ? 'text-primary' : type.colorClass)} />
                      <span className={cn('text-xs font-semibold', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                        {type.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <header className="flex items-center gap-2">
                <div className="h-7 w-1 rounded-full bg-gradient-to-b from-amber-400 to-orange-500" />
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  Freeform diagrams
                  <Sparkles className="h-4 w-4 text-amber-400" />
                </h3>
              </header>
              <div className="grid grid-cols-2 gap-2">
                {FREEFORM_DIAGRAMS.map(diagram => {
                  const Icon = diagram.icon;
                  const isSelected = selectedDiagram === diagram.id;
                  return (
                    <button
                      key={diagram.id}
                      type="button"
                      onClick={() => setSelectedDiagram(diagram.id)}
                      className={cn(
                        'group relative flex h-24 flex-col items-start justify-between rounded-2xl border-2 p-4 text-left transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                        isSelected
                          ? 'border-amber-400 bg-amber-400/10 shadow-lg'
                          : 'border-border/40 bg-card hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-lg',
                      )}
                    >
                      {isSelected && (
                        <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-[0.7rem] font-semibold text-amber-950 shadow-md">
                          ⚡
                        </span>
                      )}
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 text-primary transition-colors',
                            isSelected ? 'bg-amber-400/20 text-amber-500' : 'group-hover:text-amber-400',
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col">
                          <span
                            className={cn('text-sm font-semibold', isSelected ? 'text-foreground' : 'text-muted-foreground')}
                          >
                            {diagram.name}
                          </span>
                          <span className="text-[0.65rem] text-muted-foreground/80">{diagram.description}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <Separator className="bg-gradient-to-r from-transparent via-border to-transparent" />

            <section className="space-y-3">
              <header className="flex items-center gap-2">
                <div className="h-7 w-1 rounded-full bg-gradient-to-b from-cyan-500 to-teal-500" />
                <h3 className="text-base font-semibold text-foreground">Preview</h3>
              </header>
              <div className="rounded-2xl border border-border/40 bg-card/70 p-4 shadow-lg">
                {renderPreview()}
                {renderLegend()}
              </div>
            </section>

            <section className="space-y-6">
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Palette className="h-4 w-4 text-primary" /> Color scheme
                </Label>
                <Select
                  value={config.colorScheme}
                  onValueChange={value => setConfig(prev => ({ ...prev, colorScheme: value }))}
                >
                  <SelectTrigger className="h-10 rounded-xl border-2 border-border/50 bg-card/70 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-border/50 bg-popover/95 backdrop-blur">
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
                                    <span
                                      key={`${scheme.id}-${color}-${index}`}
                                      className="h-4 w-4 rounded border border-border/40"
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

              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-3">
                  <Label htmlFor="chart-show-labels" className="text-xs font-medium">
                    Show labels
                  </Label>
                  <Switch
                    id="chart-show-labels"
                    checked={config.showLabels}
                    onCheckedChange={checked => setConfig(prev => ({ ...prev, showLabels: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-3">
                  <Label htmlFor="chart-show-values" className="text-xs font-medium">
                    Show values
                  </Label>
                  <Switch
                    id="chart-show-values"
                    checked={config.showValues}
                    onCheckedChange={checked => setConfig(prev => ({ ...prev, showValues: checked }))}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-semibold">Horizontal alignment</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'left', icon: AlignLeft, label: 'Left' },
                    { value: 'center', icon: AlignCenter, label: 'Center' },
                    { value: 'right', icon: AlignRight, label: 'Right' },
                  ].map(option => {
                    const Icon = option.icon;
                    const isSelected = config.horizontalAlignment === option.value;
                    return (
                      <Button
                        key={option.value}
                        variant={isSelected ? 'default' : 'outline'}
                        className={cn(
                          'h-10 rounded-xl border-2 text-xs font-medium transition-colors',
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground shadow-lg'
                            : 'border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary',
                        )}
                        onClick={() => toggleAlignment(option.value as 'left' | 'center' | 'right')}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {(selectedType === 'verticalBar' || selectedType === 'horizontalBar' || selectedType === 'line' || selectedType === 'area') && (
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-3">
                  <Label htmlFor="chart-axis-zero" className="text-xs font-medium">
                    Axis always includes zero
                  </Label>
                  <Switch
                    id="chart-axis-zero"
                    checked={config.axisIncludesZero}
                    onCheckedChange={toggleAxisZero}
                  />
                </div>
              )}
            </section>

            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 p-5 text-center">
              <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                <Wand2 className="h-5 w-5 text-primary" />
                <span>Need to fine-tune the data? Open the rich data editor for full control.</span>
              </div>
              <Button
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-105"
                onClick={() => setShowDataEditor(true)}
              >
                <Database className="mr-2 h-4 w-4" /> Edit chart data
                <MousePointerClick className="ml-2 h-4 w-4 animate-pulse" />
              </Button>
            </div>
          </div>
        </ScrollArea>

        <div className="relative flex items-center justify-between gap-3 border-t border-border/60 bg-muted/10 px-6 py-4">
          <Button variant="outline" className="h-10 flex-1 rounded-xl border-2 border-border/60 text-sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="relative h-10 flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-sm font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
            onClick={handleInsert}
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative z-10 flex items-center justify-center gap-2">
              <TrendingUp className="h-5 w-5 animate-pulse" /> Insert chart
              <Zap className="h-4 w-4" />
            </span>
          </Button>
        </div>
      </div>

      <ChartDataEditor
        open={showDataEditor}
        onClose={() => setShowDataEditor(false)}
        onSave={handleDataEditorSave}
        onApply={handleDataEditorApply}
        initialData={chartData}
        initialConfig={config}
      />
    </>
  );
};

ChartPanel.displayName = 'ChartPanel';

export default ChartPanel;
