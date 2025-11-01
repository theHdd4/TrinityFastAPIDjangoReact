import type { LucideIcon } from 'lucide-react';
import type { ChartConfig, ChartDataRow } from '../charts';

export interface TemplateTextBoxDefinition {
  text: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  color?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface TemplateShapeDefinition {
  shapeId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface TemplateChartDefinition {
  position: { x: number; y: number };
  size: { width: number; height: number };
  data: ChartDataRow[];
  config: ChartConfig;
  caption?: string;
}

export interface TemplateImageDefinition {
  position: { x: number; y: number };
  size: { width: number; height: number };
  src: string;
  name?: string;
  source?: string;
  description?: string;
}

export interface TemplateSlideContent {
  textBoxes?: TemplateTextBoxDefinition[];
  shapes?: TemplateShapeDefinition[];
  charts?: TemplateChartDefinition[];
  images?: TemplateImageDefinition[];
}

export interface TemplateSlideDefinition {
  title: string;
  description?: string;
  content: TemplateSlideContent;
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  aliases?: string[];
  icon: LucideIcon;
  slides: TemplateSlideDefinition[];
}
