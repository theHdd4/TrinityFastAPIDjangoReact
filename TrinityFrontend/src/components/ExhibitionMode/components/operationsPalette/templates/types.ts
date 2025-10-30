import type { LucideIcon } from 'lucide-react';

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

export interface TemplateSlideDefinition {
  title: string;
  description?: string;
  content: {
    textBoxes?: TemplateTextBoxDefinition[];
    shapes?: TemplateShapeDefinition[];
  };
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  icon: LucideIcon;
  slides: TemplateSlideDefinition[];
}
