import type React from 'react';

export interface ColorTrayOption {
  id: string;
  value?: string;
  label?: string;
  ariaLabel?: string;
  tooltip?: string;
  swatchClassName?: string;
  swatchStyle?: React.CSSProperties;
  preview?: React.ReactNode;
  disabled?: boolean;
  keywords?: readonly string[];
}

export interface ColorTraySection {
  id: string;
  label: string;
  description?: string;
  options: readonly ColorTrayOption[];
}

export type ColorTraySwatchSize = 'sm' | 'md' | 'lg';
