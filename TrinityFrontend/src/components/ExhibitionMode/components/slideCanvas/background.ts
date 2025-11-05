import type { CSSProperties } from 'react';
import type { PresentationSettings, SlideBackgroundPreset } from '../store/exhibitionStore';
import {
  DEFAULT_PRESENTATION_SETTINGS,
  type SlideBackgroundColor,
} from '../store/exhibitionStore';
import {
  GRADIENT_STYLE_MAP,
  isGradientToken,
  isSolidToken,
  solidTokenToHex,
} from '@/templates/color-tray';
import { parseBooleanish } from './utils';

const slideBackgroundClassNames: Record<SlideBackgroundPreset, string> = {
  default: 'bg-card',
  ivory: 'bg-amber-100',
  slate: 'bg-slate-200',
  charcoal: 'bg-neutral-300',
  indigo: 'bg-indigo-100',
  emerald: 'bg-emerald-100',
  rose: 'bg-rose-100',
};

const normaliseHexColor = (value: string): string => {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^#([0-9a-fA-F]{3})$/.test(trimmed)) {
    const [, short] = /^#([0-9a-fA-F]{3})$/.exec(trimmed) ?? [];
    if (short) {
      return `#${short
        .split('')
        .map(char => char + char)
        .join('')}`.toLowerCase();
    }
  }
  return '#ffffff';
};

export const applyOpacityToHex = (value: string, opacity: number): string => {
  const safeOpacity = Math.min(100, Math.max(0, opacity));
  const normalised = normaliseHexColor(value);
  const hex = normalised.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const alpha = Math.round((safeOpacity / 100) * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const resolveSlideBackground = (
  settings: PresentationSettings,
): { className: string; style: CSSProperties | undefined } => {
  const mode = settings.backgroundMode ?? 'preset';
  const opacity = Number.isFinite(settings.backgroundOpacity) ? Number(settings.backgroundOpacity) : 100;

  if (mode === 'image' && settings.backgroundImageUrl) {
    return {
      className: '',
      style: {
        backgroundImage: `url(${settings.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
      },
    };
  }

  if (mode === 'gradient') {
    const start = settings.backgroundGradientStart ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientStart;
    const end = settings.backgroundGradientEnd ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientEnd;
    const direction = settings.backgroundGradientDirection ?? DEFAULT_PRESENTATION_SETTINGS.backgroundGradientDirection;
    const startColor = applyOpacityToHex(start, opacity);
    const endColor = applyOpacityToHex(end, opacity);
    return {
      className: '',
      style: {
        backgroundImage: `linear-gradient(${direction}, ${startColor}, ${endColor})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }

  if (mode === 'solid') {
    const color = settings.backgroundSolidColor ?? DEFAULT_PRESENTATION_SETTINGS.backgroundSolidColor;
    return {
      className: '',
      style: {
        backgroundColor: applyOpacityToHex(color, opacity),
      },
    };
  }

  const background = settings.backgroundColor as SlideBackgroundColor | SlideBackgroundPreset | undefined;
  if (isSolidToken(background)) {
    const color = solidTokenToHex(background);
    return {
      className: '',
      style: {
        backgroundColor: opacity >= 100 ? color : applyOpacityToHex(color, opacity),
      },
    };
  }

  if (isGradientToken(background)) {
    const gradient = GRADIENT_STYLE_MAP[background] ?? null;
    if (gradient) {
      return {
        className: '',
        style: {
          backgroundImage: gradient,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        },
      };
    }
  }

  const className =
    slideBackgroundClassNames[(background as SlideBackgroundPreset) ?? 'default'] ??
    slideBackgroundClassNames.default;

  return { className, style: undefined };
};

export const resolveFeatureOverviewTransparency = (
  metadata: Record<string, any> | undefined,
): boolean => {
  if (!metadata || typeof metadata !== 'object') {
    return true;
  }

  const controls = metadata.exhibitionControls;
  if (!controls || typeof controls !== 'object') {
    return true;
  }

  const preference = parseBooleanish((controls as Record<string, unknown>).transparentBackground);
  return preference ?? true;
};
