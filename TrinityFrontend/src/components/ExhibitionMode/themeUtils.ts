import { useEffect } from 'react';
import type React from 'react';
import type { ExhibitionTheme } from './themes';
import type { ChartConfig } from './components/operationsPalette/charts/types';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

const parseColorToHSL = (color: string): string => {
  if (!color) {
    return color;
  }

  if (color.startsWith('hsl(')) {
    return color;
  }

  if (color.startsWith('rgb(')) {
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10) / 255;
      const g = parseInt(rgbMatch[2], 10) / 255;
      const b = parseInt(rgbMatch[3], 10) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
          default:
            h = 0;
        }
      }

      return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
    }
  }

  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length < 6) {
      return color;
    }

    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
        default:
          h = 0;
      }
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }

  return color;
};

const applyThemeColorVariables = (theme: ExhibitionTheme, targetElement: HTMLElement) => {
  if (!theme?.colors) {
    return;
  }

  Object.entries(theme.colors).forEach(([key, value]) => {
    const hslColor = parseColorToHSL(value);
    targetElement.style.setProperty(`--slide-${key}`, hslColor);
    targetElement.style.setProperty(`--theme-${key}`, hslColor);
  });
};

const applyThemeFontVariables = (theme: ExhibitionTheme, targetElement: HTMLElement) => {
  if (!theme?.fonts) {
    return;
  }

  const headingFont = `${theme.fonts.heading}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const bodyFont = `${theme.fonts.body}, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  targetElement.style.setProperty('--slide-font-heading', headingFont);
  targetElement.style.setProperty('--slide-font-body', bodyFont);
  targetElement.style.setProperty('--theme-font-heading', headingFont);
  targetElement.style.setProperty('--theme-font-body', bodyFont);
};

const applyThemeGradientVariables = (theme: ExhibitionTheme, targetElement: HTMLElement) => {
  if (!theme?.gradients) {
    return;
  }

  Object.entries(theme.gradients).forEach(([key, value]) => {
    targetElement.style.setProperty(`--slide-gradient-${key}`, value);
    targetElement.style.setProperty(`--theme-gradient-${key}`, value);
  });
};

const applyThemeEffectVariables = (theme: ExhibitionTheme, targetElement: HTMLElement) => {
  if (!theme?.effects) {
    return;
  }

  targetElement.style.setProperty('--slide-shadow', theme.effects.shadow);
  targetElement.style.setProperty('--slide-border-radius', theme.effects.borderRadius);
  targetElement.style.setProperty('--theme-shadow', theme.effects.shadow);
  targetElement.style.setProperty('--theme-border-radius', theme.effects.borderRadius);

  if (theme.effects.blur) {
    targetElement.style.setProperty('--slide-blur', theme.effects.blur);
    targetElement.style.setProperty('--theme-blur', theme.effects.blur);
  }

  if (theme.effects.glow) {
    targetElement.style.setProperty('--slide-glow', theme.effects.glow);
    targetElement.style.setProperty('--theme-glow', theme.effects.glow);
  }
};

const THEME_VARIABLES = [
  '--slide-background',
  '--slide-foreground',
  '--slide-primary',
  '--slide-secondary',
  '--slide-accent',
  '--slide-muted',
  '--slide-border',
  '--theme-background',
  '--theme-foreground',
  '--theme-primary',
  '--theme-secondary',
  '--theme-accent',
  '--theme-muted',
  '--theme-border',
  '--slide-font-heading',
  '--slide-font-body',
  '--theme-font-heading',
  '--theme-font-body',
  '--slide-gradient-primary',
  '--slide-gradient-secondary',
  '--slide-gradient-accent',
  '--slide-gradient-background',
  '--theme-gradient-primary',
  '--theme-gradient-secondary',
  '--theme-gradient-accent',
  '--theme-gradient-background',
  '--slide-shadow',
  '--slide-border-radius',
  '--slide-blur',
  '--slide-glow',
  '--theme-shadow',
  '--theme-border-radius',
  '--theme-blur',
  '--theme-glow',
];

export const applyThemeToSlide = (theme: ExhibitionTheme | null, slideElement?: HTMLElement | null) => {
  if (!isBrowser || !theme) {
    return;
  }

  const targetElement = slideElement ?? document.documentElement;
  applyThemeColorVariables(theme, targetElement);
  applyThemeFontVariables(theme, targetElement);
  applyThemeGradientVariables(theme, targetElement);
  applyThemeEffectVariables(theme, targetElement);

  targetElement.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
};

export const removeThemeFromSlide = (slideElement?: HTMLElement | null) => {
  if (!isBrowser) {
    return;
  }

  const targetElement = slideElement ?? document.documentElement;
  THEME_VARIABLES.forEach(variable => {
    targetElement.style.removeProperty(variable);
  });
  targetElement.style.removeProperty('transition');
};

export const useSlideTheme = (
  theme: ExhibitionTheme | null,
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean = true,
) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const element = ref.current;
    if (!theme) {
      removeThemeFromSlide(element ?? undefined);
      return;
    }

    applyThemeToSlide(theme, element ?? undefined);

    return () => {
      removeThemeFromSlide(element ?? undefined);
    };
  }, [enabled, ref, theme]);
};

export const getThemeValues = (
  theme: ExhibitionTheme | null,
  slideElement?: HTMLElement | null,
): Partial<Record<'background' | 'foreground' | 'primary' | 'secondary' | 'accent' | 'muted' | 'border', string>> => {
  if (!isBrowser) {
    return {};
  }

  const targetElement = slideElement ?? document.documentElement;
  const computedStyle = getComputedStyle(targetElement);

  const readVar = (primary: string, fallback: string) =>
    computedStyle.getPropertyValue(primary) || computedStyle.getPropertyValue(fallback);

  return {
    background: readVar('--slide-background', '--theme-background') || theme?.colors.background,
    foreground: readVar('--slide-foreground', '--theme-foreground') || theme?.colors.foreground,
    primary: readVar('--slide-primary', '--theme-primary') || theme?.colors.primary,
    secondary: readVar('--slide-secondary', '--theme-secondary') || theme?.colors.secondary,
    accent: readVar('--slide-accent', '--theme-accent') || theme?.colors.accent,
    muted: readVar('--slide-muted', '--theme-muted') || theme?.colors.muted,
    border: readVar('--slide-border', '--theme-border') || theme?.colors.border,
  };
};

export type ThemeChartDefaults = Pick<
  ChartConfig,
  'type' | 'colorScheme' | 'showLabels' | 'showValues' | 'legendPosition' | 'axisIncludesZero'
>;

export interface ThemeStyleDefaults {
  chart: ThemeChartDefaults;
  presentation: {
    cardColor: string;
    cardLayout: 'none' | 'top' | 'bottom' | 'right' | 'left' | 'full';
    backgroundColor: string;
  };
  tableStyleId: string;
  text: {
    bodyFontSize: number;
    headingFontSize: number;
    color: string;
    headingColor?: string;
  };
}

const BASE_THEME_DEFAULTS: ThemeStyleDefaults = {
  chart: {
    type: 'pie',
    colorScheme: 'default',
    showLabels: true,
    showValues: false,
    legendPosition: 'bottom',
    axisIncludesZero: true,
  },
  presentation: {
    cardColor: 'purple',
    cardLayout: 'right',
    backgroundColor: 'default',
  },
  tableStyleId: 'transparent',
  text: {
    bodyFontSize: 16,
    headingFontSize: 44,
    color: '#111827',
  },
};

const mergeDefaults = (overrides: Partial<ThemeStyleDefaults>): ThemeStyleDefaults => ({
  chart: {
    ...BASE_THEME_DEFAULTS.chart,
    ...(overrides.chart ?? {}),
  },
  presentation: {
    ...BASE_THEME_DEFAULTS.presentation,
    ...(overrides.presentation ?? {}),
  },
  tableStyleId: overrides.tableStyleId ?? BASE_THEME_DEFAULTS.tableStyleId,
  text: {
    ...BASE_THEME_DEFAULTS.text,
    ...(overrides.text ?? {}),
  },
});

const THEME_STYLE_DEFAULTS: Record<string, ThemeStyleDefaults> = {
  'clean-slate': mergeDefaults({
    chart: {
      type: 'pie',
      colorScheme: 'default',
      showLabels: true,
      showValues: false,
      legendPosition: 'bottom',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'purple',
      cardLayout: 'right',
      backgroundColor: 'default',
    },
    tableStyleId: 'transparent',
    text: {
      bodyFontSize: 16,
      headingFontSize: 44,
      color: '#111827',
    },
  }),
  'modern-minimal': mergeDefaults({
    chart: {
      type: 'verticalBar',
      colorScheme: 'sky',
      showLabels: true,
      showValues: true,
      legendPosition: 'right',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'blue',
      cardLayout: 'top',
      backgroundColor: 'slate',
    },
    tableStyleId: 'light-slate',
    text: {
      bodyFontSize: 15,
      headingFontSize: 42,
      color: '#0A0A0A',
    },
  }),
  'dark-elegance': mergeDefaults({
    chart: {
      type: 'donut',
      colorScheme: 'sunset',
      showLabels: true,
      showValues: true,
      legendPosition: 'left',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-midnight',
      cardLayout: 'left',
      backgroundColor: 'charcoal',
    },
    tableStyleId: 'dark-indigo',
    text: {
      bodyFontSize: 17,
      headingFontSize: 48,
      color: '#E2E8F0',
      headingColor: '#FBBF24',
    },
  }),
  'ocean-breeze': mergeDefaults({
    chart: {
      type: 'line',
      colorScheme: 'azure',
      showLabels: true,
      showValues: false,
      legendPosition: 'bottom',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-oceanic',
      cardLayout: 'full',
      backgroundColor: 'indigo',
    },
    tableStyleId: 'light-sky',
    text: {
      bodyFontSize: 16,
      headingFontSize: 42,
      color: '#0C4A6E',
    },
  }),
  'forest-natural': mergeDefaults({
    chart: {
      type: 'area',
      colorScheme: 'sage',
      showLabels: true,
      showValues: true,
      legendPosition: 'bottom',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-forest',
      cardLayout: 'left',
      backgroundColor: 'emerald',
    },
    tableStyleId: 'light-emerald',
    text: {
      bodyFontSize: 17,
      headingFontSize: 46,
      color: '#14532D',
    },
  }),
  'sunset-gradient': mergeDefaults({
    chart: {
      type: 'horizontalBar',
      colorScheme: 'sunset',
      showLabels: true,
      showValues: true,
      legendPosition: 'top',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-tropical',
      cardLayout: 'top',
      backgroundColor: 'rose',
    },
    tableStyleId: 'medium-amber',
    text: {
      bodyFontSize: 17,
      headingFontSize: 46,
      color: '#7C2D12',
    },
  }),
  'royal-purple': mergeDefaults({
    chart: {
      type: 'pie',
      colorScheme: 'lavender',
      showLabels: true,
      showValues: true,
      legendPosition: 'right',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-dusk',
      cardLayout: 'right',
      backgroundColor: 'indigo',
    },
    tableStyleId: 'light-violet',
    text: {
      bodyFontSize: 18,
      headingFontSize: 50,
      color: '#3B0764',
      headingColor: '#6B21A8',
    },
  }),
  'corporate-blue': mergeDefaults({
    chart: {
      type: 'verticalBar',
      colorScheme: 'steel',
      showLabels: true,
      showValues: true,
      legendPosition: 'top',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'blue',
      cardLayout: 'right',
      backgroundColor: 'default',
    },
    tableStyleId: 'medium-blue',
    text: {
      bodyFontSize: 15,
      headingFontSize: 42,
      color: '#1E293B',
    },
  }),
  'cyber-neon': mergeDefaults({
    chart: {
      type: 'line',
      colorScheme: 'vibrant',
      showLabels: true,
      showValues: true,
      legendPosition: 'bottom',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-aurora',
      cardLayout: 'full',
      backgroundColor: 'charcoal',
    },
    tableStyleId: 'dark-emerald',
    text: {
      bodyFontSize: 16,
      headingFontSize: 46,
      color: '#00FF88',
      headingColor: '#00FFFF',
    },
  }),
  'autumn-harvest': mergeDefaults({
    chart: {
      type: 'area',
      colorScheme: 'peach',
      showLabels: true,
      showValues: true,
      legendPosition: 'bottom',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'orange',
      cardLayout: 'top',
      backgroundColor: 'ivory',
    },
    tableStyleId: 'dark-slate',
    text: {
      bodyFontSize: 17,
      headingFontSize: 47,
      color: '#78350F',
    },
  }),
  'midnight-blue': mergeDefaults({
    chart: {
      type: 'line',
      colorScheme: 'midnight',
      showLabels: true,
      showValues: false,
      legendPosition: 'right',
      axisIncludesZero: true,
    },
    presentation: {
      cardColor: 'gradient-midnight',
      cardLayout: 'left',
      backgroundColor: 'charcoal',
    },
    tableStyleId: 'medium-teal',
    text: {
      bodyFontSize: 16,
      headingFontSize: 48,
      color: '#E0E7FF',
      headingColor: '#A5B4FC',
    },
  }),
};

export const getThemeStyleDefaults = (theme: ExhibitionTheme | null | undefined): ThemeStyleDefaults => {
  if (!theme) {
    return BASE_THEME_DEFAULTS;
  }

  return THEME_STYLE_DEFAULTS[theme.id] ?? BASE_THEME_DEFAULTS;
};
