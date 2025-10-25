import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BarChart3,
  Database,
  MousePointerClick,
  Palette,
  Sparkles,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { ChartDataEditor } from './ChartDataEditor';
import {
  CHART_TYPES,
  COLOR_SCHEMES,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
} from './constants';
import type { ChartConfig, ChartDataRow, ChartPanelResult, ChartType } from './types';

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
  const [config, setConfig] = useState<ChartConfig>(() => ({
    ...DEFAULT_CHART_CONFIG,
    ...(initialConfig ?? {}),
  }));
  const [showDataEditor, setShowDataEditor] = useState(false);

  const selectedType = useMemo(() => config.type, [config.type]);

  const palette = useMemo(
    () => COLOR_SCHEMES.find(scheme => scheme.id === config.colorScheme) ?? COLOR_SCHEMES[0],
    [config.colorScheme],
  );

  useEffect(() => {
    setChartData((initialData ?? DEFAULT_CHART_DATA).map(entry => ({ ...entry })));
  }, [initialData]);

  useEffect(() => {
    setConfig({
      ...DEFAULT_CHART_CONFIG,
      ...(initialConfig ?? {}),
    });
  }, [initialConfig]);

  useEffect(() => {
    onStateChange?.({
      data: chartData,
      config,
    });
  }, [chartData, config, onStateChange]);

  const handleInsert = () => {
    onInsert({ data: chartData, config });
  };

  const handleDataEditorSave = (rows: ChartDataRow[], nextConfig: ChartConfig) => {
    setChartData(rows.map(entry => ({ ...entry })));
    setConfig({ ...nextConfig });
  };

  const renderPreview = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex h-60 items-center justify-center rounded-2xl border border-dashed border-border/50 text-sm text-muted-foreground">
          Add data to preview your chart
        </div>
      );
    }

    if (selectedType === 'pie' || selectedType === 'donut') {
      const total = chartData.reduce((sum, item) => sum + item.value, 0);
      if (total === 0) {
        return (
          <div className="flex h-60 items-center justify-center rounded-2xl border border-dashed border-border/50 text-sm text-muted-foreground">
            Add non-zero values to preview your chart
          </div>
        );
      }

      let currentAngle = -90;
      return (
        <div className="flex h-60 w-full items-center justify-center">
          <svg viewBox="0 0 220 220" width={220} height={220} className="-rotate-90">
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

    if (selectedType === 'line') {
      const maxValue = Math.max(...chartData.map(item => item.value), 1);
      const points = chartData
        .map((item, index) => {
          const x = (index / Math.max(chartData.length - 1, 1)) * 320;
          const y = 200 - (item.value / maxValue) * 180;
          return `${x},${y}`;
        })
        .join(' ');

      return (
        <div className="flex h-60 items-center justify-center">
          <svg viewBox="0 0 320 220" width={320} height={220}>
            <polyline
              points={points}
              fill="none"
              stroke={palette.colors[0]}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chartData.map((item, index) => {
              const x = (index / Math.max(chartData.length - 1, 1)) * 320;
              const y = 200 - (item.value / maxValue) * 180;
              return <circle key={item.label} cx={x} cy={y} r={5} fill={palette.colors[index % palette.colors.length]} />;
            })}
          </svg>
        </div>
      );
    }

    const maxValue = Math.max(...chartData.map(item => item.value), 1);
    const isBar = selectedType === 'bar';

    return (
      <div
        className={cn(
          'flex h-60 w-full gap-4 px-6 py-8',
          isBar ? 'flex-col justify-center' : 'items-end justify-center',
        )}
      >
        {chartData.map((item, index) => {
          const size = (item.value / maxValue) * 100;
          return (
            <div
              key={item.label}
              className={cn(
                'flex text-xs font-medium text-muted-foreground',
                isBar ? 'flex-row items-center gap-3' : 'flex-col items-center gap-2',
              )}
            >
              <div
                className="rounded-xl"
                style={{
                  backgroundColor: palette.colors[index % palette.colors.length],
                  width: isBar ? `${size}%` : '36px',
                  height: isBar ? '18px' : `${size}%`,
                }}
              />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderLegend = () => (
    <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-muted-foreground">
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
      <div className="flex h-full w-full shrink-0 flex-col rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
        <div className="relative flex items-start justify-between border-b border-border/60 px-8 py-6">
          {renderSparkles()}
          <div className="relative flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 opacity-30 blur-xl" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 ring-2 ring-pink-500/30">
                <BarChart3 className="h-7 w-7 text-pink-500" />
              </div>
            </div>
            <div>
              <h2 className="flex items-center gap-3 text-2xl font-bold text-foreground">
                Charts & diagrams
                <Sparkles className="h-5 w-5 text-yellow-400" />
              </h2>
              <p className="text-sm text-muted-foreground">Craft a beautiful data story for your slide.</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="h-[620px]">
          <div className="space-y-8 p-8">
            <section className="space-y-4">
              <header className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-gradient-to-b from-blue-500 to-purple-500" />
                <h3 className="text-lg font-semibold text-foreground">Chart styles</h3>
              </header>
              <div className="grid grid-cols-5 gap-3">
                {CHART_TYPES.map(type => {
                  const Icon = type.icon;
                  const isSelected = selectedType === type.id;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => handleChartTypeChange(type.id)}
                      className={cn(
                        'group relative flex flex-col items-center gap-3 rounded-2xl border-2 p-5 transition-all duration-300',
                        isSelected
                          ? 'scale-[1.02] border-primary bg-gradient-to-br from-primary/20 to-primary/5 shadow-2xl ring-4 ring-primary/20'
                          : 'border-border/50 bg-card hover:scale-[1.03] hover:border-primary/40 hover:shadow-xl',
                      )}
                    >
                      <div
                        className={cn(
                          'relative flex h-12 w-12 items-center justify-center rounded-xl transition-transform',
                          isSelected ? 'scale-110 bg-primary/20' : 'bg-muted/40 group-hover:bg-muted/60',
                        )}
                      >
                        {isSelected && <Zap className="absolute -right-2 -top-2 h-4 w-4 text-primary" />}
                        <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : type.colorClass)} />
                      </div>
                      <span className={cn('text-sm font-semibold', isSelected ? 'text-foreground' : 'text-muted-foreground')}>
                        {type.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <Separator className="bg-gradient-to-r from-transparent via-border to-transparent" />

            <section className="space-y-4">
              <header className="flex items-center gap-3">
                <div className="h-8 w-1 rounded-full bg-gradient-to-b from-cyan-500 to-teal-500" />
                <h3 className="text-lg font-semibold text-foreground">Preview</h3>
              </header>
              <div className="rounded-2xl border border-border/40 bg-card/70 p-6 shadow-lg">
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
                  <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-card/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border border-border/50 bg-popover/95 backdrop-blur">
                    {COLOR_SCHEMES.map(scheme => (
                      <SelectItem key={scheme.id} value={scheme.id} className="rounded-lg">
                        <div className="flex items-center gap-3">
                          {scheme.icon && <span className="text-lg">{scheme.icon}</span>}
                          <div className="flex gap-1.5">
                            {scheme.colors.map(color => (
                              <span
                                key={color}
                                className="h-4 w-4 rounded border border-border/40"
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
                  <Label htmlFor="chart-show-labels" className="text-sm font-medium">
                    Show labels
                  </Label>
                  <Switch
                    id="chart-show-labels"
                    checked={config.showLabels}
                    onCheckedChange={checked => setConfig(prev => ({ ...prev, showLabels: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                  <Label htmlFor="chart-show-values" className="text-sm font-medium">
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
                          'h-12 rounded-xl border-2 font-medium transition-colors',
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

              {(selectedType === 'column' || selectedType === 'bar' || selectedType === 'line') && (
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4">
                  <Label htmlFor="chart-axis-zero" className="text-sm font-medium">
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

            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/10 p-6 text-center">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <Wand2 className="h-5 w-5 text-primary" />
                <span>Need to fine-tune the data? Open the rich data editor for full control.</span>
              </div>
              <Button
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 font-semibold text-white shadow-lg transition-transform hover:scale-105"
                onClick={() => setShowDataEditor(true)}
              >
                <Database className="mr-2 h-4 w-4" /> Edit chart data
                <MousePointerClick className="ml-2 h-4 w-4 animate-pulse" />
              </Button>
            </div>
          </div>
        </ScrollArea>

        <div className="relative flex items-center justify-between gap-4 border-t border-border/60 bg-muted/10 px-8 py-5">
          <Button variant="outline" className="h-11 flex-1 rounded-xl border-2 border-border/60" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="relative h-11 flex-1 overflow-hidden rounded-xl bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 font-semibold text-white shadow-lg transition-transform hover:scale-[1.02]"
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
        initialData={chartData}
        initialConfig={config}
      />
    </>
  );
};

ChartPanel.displayName = 'ChartPanel';

export default ChartPanel;
