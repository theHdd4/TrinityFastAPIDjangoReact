export type EditableChartType = 'column' | 'bar' | 'line' | 'pie' | 'donut';
export type DiagramChartType = 'blank' | 'calendar' | 'gantt';
export type ChartType = EditableChartType | DiagramChartType;

export interface ChartConfig {
  type: ChartType;
  colorScheme: string;
  showLabels: boolean;
  showValues: boolean;
  horizontalAlignment: 'left' | 'center' | 'right';
  axisIncludesZero: boolean;
}

export interface ChartDataRow {
  label: string;
  value: number;
}

export interface ChartObjectProps {
  chartData: ChartDataRow[];
  chartConfig: ChartConfig;
}
