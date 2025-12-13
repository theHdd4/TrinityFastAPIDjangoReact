/**
 * TypeScript types for Conditional Formatting
 */

export type Operator = 
  | 'gt' 
  | 'lt' 
  | 'eq' 
  | 'ne' 
  | 'contains' 
  | 'starts_with' 
  | 'ends_with' 
  | 'between' 
  | 'top_n' 
  | 'bottom_n' 
  | 'above_average' 
  | 'below_average';

export interface FormatStyle {
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: 'bold' | 'normal';
  fontSize?: number;
}

export interface ConditionalFormatRule {
  type: 'highlight' | 'color_scale' | 'data_bar' | 'icon_set';
  id: string;
  enabled: boolean;
  priority: number;
  column: string;
  operator?: Operator;
  value1?: any;
  value2?: any;
  style?: FormatStyle;
  min_color?: string;
  max_color?: string;
  mid_color?: string;
  color?: string;
  show_value?: boolean;
  icon_set?: 'arrows' | 'traffic_lights' | 'stars' | 'checkmarks';
  thresholds?: Record<string, number>;
}



