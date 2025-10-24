import type React from 'react';

export interface ColorTrayOption {
  id: string;
  value?: string;
  label?: string;
  ariaLabel?: string;
  swatchClassName?: string;
  swatchStyle?: React.CSSProperties;
  preview?: React.ReactNode;
  disabled?: boolean;
}

export interface ColorTraySection {
  id: string;
  label: string;
  description?: string;
  options: readonly ColorTrayOption[];
}

export type ColorTraySwatchSize = 'sm' | 'md' | 'lg';
