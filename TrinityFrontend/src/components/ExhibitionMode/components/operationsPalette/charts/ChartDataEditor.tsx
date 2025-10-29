import React, { useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    return COLOR_SCHEMES.reduce<Record<string, typeof COLOR_SCHEMES>>((acc, scheme) => {
      const group = acc[scheme.category] ?? [];
      acc[scheme.category] = [...group, scheme];
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
  const legendPositionLabel = useMemo(() => {
    const match = legendPositions.find(option => option.id === config.legendPosition);
    return match ? match.name : legendPositions[1]?.name ?? 'Bottom';
  }, [config.legendPosition]);

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
                <div className="rounded-xl border border-border/40 bg-card p-6 shadow-sm">
                  <div className="w-full h-64 rounded-lg bg-muted/20 border border-border/30 flex items-center justify-center overflow-hidden">
                    <SlideChart data={chartData} config={config} className="w-full h-full max-w-full" />
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
                  <Select
                    value={config.colorScheme}
                    onValueChange={value => setConfig(prev => ({ ...prev, colorScheme: value }))}
                  >
                    <SelectTrigger className="h-12 rounded-xl border border-border/60 bg-gradient-to-r from-primary/5 via-card to-secondary/5 px-4 shadow-sm hover:border-primary/40">
                      <SelectValue asChild>
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-3">
                            <span className="flex gap-1.5">
                              {selectedScheme.colors.slice(0, 5).map(color => (
                                <span
                                  key={`${selectedScheme.id}-${color}`}
                                  className="h-5 w-5 rounded-md border border-border/40"
                                  style={{ backgroundColor: color }}
                                />
                              ))}
                            </span>
                            <span className="text-sm font-semibold text-foreground">{selectedScheme.name}</span>
                          </div>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm">
                      {Object.entries(colorSchemeGroups).map(([category, schemes]) => (
                        <SelectGroup key={category}>
                          <SelectLabel className="px-2 pt-2 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                            {category}
                          </SelectLabel>
                          {schemes.map(scheme => (
                            <SelectItem key={scheme.id} value={scheme.id} className="rounded-lg">
                              <div className="flex items-center gap-3">
                                <span className="flex gap-1.5">
                                  {scheme.colors.slice(0, 5).map(color => (
                                    <span
                                      key={`${scheme.id}-${color}`}
                                      className="h-5 w-5 rounded-md border border-border/40"
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </span>
                                <span className="text-sm font-medium text-foreground">{scheme.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
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
                    value={config.legendPosition}
                    onValueChange={value =>
                      setConfig(prev => ({ ...prev, legendPosition: value as ChartConfig['legendPosition'] }))
                    }
                  >
                    <SelectTrigger className="h-12 rounded-xl border border-border/60 bg-card/70 px-4 hover:border-primary/40">
                      <SelectValue asChild>
                        <div className="flex items-center justify-between w-full text-sm font-semibold">
                          <span>{legendPositionLabel}</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-border/60 bg-popover/95 backdrop-blur-sm">
                      {legendPositions.map(pos => (
                        <SelectItem key={pos.id} value={pos.id} className="rounded-lg">
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
