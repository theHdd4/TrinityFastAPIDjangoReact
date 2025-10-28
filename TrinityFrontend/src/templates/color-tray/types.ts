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
  /**
   * Optional grouping identifier that allows the color tray to render
   * organised families of colors. When provided for every option in the
   * current view the palette will render a labelled row per group – mirroring
   * the design in the product mockup.
   */
  groupId?: string;
  /**
   * Human friendly label for the group/family the option belongs to.
   */
  groupLabel?: string;
  /**
   * Sorting hint used when rendering grouped families. Lower values appear
   * first.
   */
  groupOrder?: number;
  /**
   * Sorting hint used within a group so tones flow from dark to light.
   */
  toneOrder?: number;
}

export interface ColorTraySection {
  id: string;
  label: string;
  description?: string;
  options: readonly ColorTrayOption[];
}

export type ColorTraySwatchSize = 'sm' | 'md' | 'lg';
