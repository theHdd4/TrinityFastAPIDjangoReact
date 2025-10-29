import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  LineChart,
  PieChart,
  Columns3,
  Circle,
  Zap,
  TrendingUp,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Database,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ChartConfig, ChartDataRow, EditableChartType } from './types';
import {
  COLOR_SCHEMES,
  DEFAULT_CHART_CONFIG,
  DEFAULT_CHART_DATA,
  getColorSchemeColors,
} from './utils';
import ChartDataEditor from './ChartDataEditor';
import SlideChart from './SlideChart';

interface ChartPanelProps {
  onInsertChart: (data: ChartDataRow[], config: ChartConfig) => void;
  onClose: () => void;
  canEdit?: boolean;
}

const chartTypeDefinitions: { id: EditableChartType; name: string; icon: React.ComponentType<{ className?: string }>; }[] = [
  { id: 'column', name: 'Column', icon: Columns3 },
  { id: 'bar', name: 'Bar', icon: BarChart3 },
  { id: 'line', name: 'Line', icon: LineChart },
  { id: 'pie', name: 'Pie', icon: PieChart },
  { id: 'donut', name: 'Donut', icon: Circle },
];

const ChartPanel: React.FC<ChartPanelProps> = ({ onInsertChart, onClose, canEdit = true }) => {
  const [chartData, setChartData] = useState<ChartDataRow[]>(() => DEFAULT_CHART_DATA.map(row => ({ ...row })));
  const [config, setConfig] = useState<ChartConfig>({ ...DEFAULT_CHART_CONFIG });
  const [showEditor, setShowEditor] = useState(false);

  const previewKey = useMemo(
    () => `${config.type}-${config.colorScheme}-${chartData.length}`,
    [config.type, config.colorScheme, chartData.length],
  );
  const colorPreview = useMemo(() => getColorSchemeColors(config.colorScheme), [config.colorScheme]);

  const handleInsert = () => {
    if (!canEdit) {
      return;
    }
    onInsertChart(chartData, config);
  };

  const handleEditorSave = (data: ChartDataRow[], updatedConfig: ChartConfig) => {
    setChartData(data.map(row => ({ ...row })));
    setConfig(prev => ({ ...prev, ...updatedConfig }));
    setShowEditor(false);
  };

  const toggleAlignment = (alignment: 'left' | 'center' | 'right') => {
    setConfig(prev => ({ ...prev, horizontalAlignment: alignment }));
  };

  const alignmentButtons = [
    { id: 'left', icon: AlignLeft, label: 'Left' },
    { id: 'center', icon: AlignCenter, label: 'Centre' },
    { id: 'right', icon: AlignRight, label: 'Right' },
  ] as const;

  const axisToggleVisible = config.type === 'column' || config.type === 'bar' || config.type === 'line';

  return (
    <div className="w-full h-full flex flex-col rounded-3xl border border-border/70 bg-background/95 shadow-2xl overflow-hidden">
      <div className="flex items-start justify-between px-6 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-xl bg-primary/20 blur-lg" />
            <div className="relative h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/30">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
              Charts
              <Zap className="h-4 w-4 text-primary" />
            </h3>
            <p className="text-xs text-muted-foreground">Create polished visualisations for your slide</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Live preview</p>
                  <p className="text-xs text-muted-foreground">Preview updates as you adjust settings</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {colorPreview.slice(0, 5).map(color => (
                  <span key={`${previewKey}-${color}`} className="h-3 w-3 rounded-full border border-border/50" style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <div className="h-72 p-4 bg-muted/20 flex items-center justify-center">
              <SlideChart data={chartData} config={config} className="w-full h-full" />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <div className="p-1 rounded-md bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              Chart type
            </Label>
            <div className="grid grid-cols-3 gap-3">
              {chartTypeDefinitions.map(type => {
                const Icon = type.icon;
                const selected = config.type === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, type: type.id }))}
                    className={cn(
                      'group flex flex-col gap-2 items-center justify-center p-4 rounded-2xl border transition-all',
                      selected
                        ? 'bg-primary text-primary-foreground border-primary shadow-lg'
                        : 'border-border/60 bg-card hover:border-primary/40 hover:bg-muted/50',
                    )}
                  >
                    <Icon className={cn('h-6 w-6', selected ? 'text-primary-foreground' : 'text-primary')} />
                    <span className="text-xs font-semibold">{type.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <div className="p-1 rounded-md bg-secondary/10">
                <Palette className="h-4 w-4 text-secondary" />
              </div>
              Colour palette
            </Label>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {Object.entries(
                COLOR_SCHEMES.reduce<Record<string, typeof COLOR_SCHEMES>>((acc, scheme) => {
                  const group = acc[scheme.category] ?? [];
                  acc[scheme.category] = [...group, scheme];
                  return acc;
                }, {}),
              ).map(([category, schemes]) => (
                <div key={category} className="space-y-1">
                  <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground font-semibold px-1">{category}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {schemes.map(scheme => (
                      <button
                        key={scheme.id}
                        type="button"
                        onClick={() => setConfig(prev => ({ ...prev, colorScheme: scheme.id }))}
                        className={cn(
                          'flex items-center gap-2 rounded-xl border px-3 py-2 transition-all text-left',
                          config.colorScheme === scheme.id
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border/60 bg-card hover:border-primary/40',
                        )}
                      >
                        <span className="flex gap-1">
                          {scheme.colors.slice(0, 4).map((color, idx) => (
                            <span key={`${scheme.id}-${idx}`} className="h-5 w-5 rounded-md border border-border/50" style={{ backgroundColor: color }} />
                          ))}
                        </span>
                        <span className="text-xs font-medium flex-1">{scheme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border/60">
              <Label htmlFor="chart-show-labels" className="text-sm font-medium cursor-pointer">
                Show labels
              </Label>
              <Switch
                id="chart-show-labels"
                checked={config.showLabels}
                onCheckedChange={value => setConfig(prev => ({ ...prev, showLabels: value }))}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border/60">
              <Label htmlFor="chart-show-values" className="text-sm font-medium cursor-pointer">
                Show values
              </Label>
              <Switch
                id="chart-show-values"
                checked={config.showValues}
                onCheckedChange={value => setConfig(prev => ({ ...prev, showValues: value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">Horizontal alignment</Label>
            <div className="grid grid-cols-3 gap-2">
              {alignmentButtons.map(button => {
                const Icon = button.icon;
                const selected = config.horizontalAlignment === button.id;
                return (
                  <Button
                    key={button.id}
                    type="button"
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => toggleAlignment(button.id)}
                    className={cn(
                      'h-11 rounded-xl flex items-center justify-center gap-2 border-2',
                      selected
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'border-border/60 hover:border-primary/40',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-semibold">{button.label}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          {axisToggleVisible && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border/60">
              <Label htmlFor="chart-axis-zero" className="text-sm font-medium cursor-pointer">
                Axis includes zero
              </Label>
              <Switch
                id="chart-axis-zero"
                checked={config.axisIncludesZero}
                onCheckedChange={value => setConfig(prev => ({ ...prev, axisIncludesZero: value }))}
              />
            </div>
          )}

          <div className="pt-2">
            <Button
              type="button"
              onClick={() => setShowEditor(true)}
              className="w-full h-12 rounded-xl font-semibold shadow hover:shadow-md transition-all bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white"
            >
              <Database className="h-4 w-4 mr-2" />
              Edit chart data
            </Button>
          </div>
        </div>
      </ScrollArea>

      <div className="px-6 py-4 border-t border-border/60 bg-muted/20 flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="flex-1 h-11 rounded-xl border border-border/60 hover:bg-muted"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleInsert}
          disabled={!canEdit}
          className={cn(
            'flex-1 h-11 rounded-xl font-semibold shadow transition-all',
            canEdit
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed opacity-60',
          )}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          Insert chart
        </Button>
      </div>

      <ChartDataEditor
        open={showEditor}
        onClose={() => setShowEditor(false)}
        onSave={handleEditorSave}
        initialData={chartData}
        initialConfig={config}
      />
    </div>
  );
};

export default ChartPanel;
export type { ChartPanelProps };
