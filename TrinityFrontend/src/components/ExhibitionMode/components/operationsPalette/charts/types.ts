import type { LucideIcon } from 'lucide-react';

export type ChartType =
  | 'verticalBar'
  | 'horizontalBar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut';

export interface ChartDataRow {
  label: string;
  value: number;
}

export interface ChartConfig {
  type: ChartType;
  colorScheme: string;
  showLabels: boolean;
  showValues: boolean;
  horizontalAlignment: 'left' | 'center' | 'right';
  axisIncludesZero: boolean;
  legendPosition: 'top' | 'bottom' | 'left' | 'right';
}

export interface ChartColorScheme {
  id: string;
  name: string;
  colors: string[];
  category?: string;
}

export interface ChartTypeDefinition {
  id: ChartType;
  name: string;
  icon: LucideIcon;
  colorClass: string;
  gradient: string;
}

export interface ChartPanelResult {
  data: ChartDataRow[];
  config: ChartConfig;
}
