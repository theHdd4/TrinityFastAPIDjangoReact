import type { ColorTrayOption, ColorTraySection } from './types';

export type SolidColorToken = `solid-${string}`;
export type PresetGradientId = 'default' | 'blue' | 'purple' | 'green' | 'orange';
export type GradientColorToken = `gradient-${string}`;
export type GradientColorId = PresetGradientId | GradientColorToken;

const SOLID_TOKEN_REGEX = /^solid-([0-9a-f]{6})$/i;

const NORMALISED_SOLID_CACHE = new Map<string, SolidColorToken>();

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toHex = (value: number) => {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, '0');
};

const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  const red = 255 * f(0);
  const green = 255 * f(8);
  const blue = 255 * f(4);

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
};

const SOLID_HUES: readonly number[] = [260, 240, 220, 200, 190, 170, 150, 130, 110, 90, 70, 50, 30, 10, 350];
const SOLID_HUE_NAMES: readonly string[] = [
  'Violet',
  'Indigo',
  'Azure',
  'Cerulean',
  'Cyan',
  'Teal',
  'Emerald',
  'Jade',
  'Chartreuse',
  'Lime',
  'Amber',
  'Golden',
  'Coral',
  'Rose',
  'Magenta',
];
const SOLID_LIGHTNESS_LEVELS: readonly number[] = [18, 26, 34, 42, 50, 58, 66, 74, 82, 90];
const SOLID_LIGHTNESS_DESCRIPTORS: readonly string[] = [
  'Deep',
  'Bold',
  'Rich',
  'Vibrant',
  'Radiant',
  'Bright',
  'Soft',
  'Pastel',
  'Airy',
  'Feather',
];
const SOLID_SATURATION = 85;

const NEUTRAL_HEXES: readonly string[] = [
  '#000000',
  '#111827',
  '#1f2937',
  '#374151',
  '#4b5563',
  '#6b7280',
  '#9ca3af',
  '#d1d5db',
  '#e5e7eb',
  '#f3f4f6',
  '#ffffff',
];
const NEUTRAL_LABELS: readonly string[] = [
  'Absolute Black',
  'Midnight Slate',
  'Graphite',
  'Iron Slate',
  'Lead Grey',
  'Misty Smoke',
  'Soft Silver',
  'Pale Frost',
  'Morning Mist',
  'Cloud Veil',
  'Pure White',
];

const normaliseHex = (value: string): string => {
  const hex = value.trim().replace(/^#/, '');
  if (hex.length === 3) {
    return hex
      .split('')
      .map(character => character.repeat(2))
      .join('')
      .toLowerCase();
  }
  return hex.slice(0, 6).toLowerCase();
};

export const createSolidToken = (hex: string): SolidColorToken => {
  const normalised = normaliseHex(hex);
  if (NORMALISED_SOLID_CACHE.has(normalised)) {
    return NORMALISED_SOLID_CACHE.get(normalised)!;
  }
  const token = `solid-${normalised}` as const;
  NORMALISED_SOLID_CACHE.set(normalised, token);
  return token;
};

export const isSolidToken = (value: unknown): value is SolidColorToken =>
  typeof value === 'string' && SOLID_TOKEN_REGEX.test(value);

export const solidTokenToHex = (token: SolidColorToken): string => `#${token.slice(6)}`;

interface GradientPreset {
  id: GradientColorId;
  label: string;
  stops: readonly string[];
  angle?: number;
}

const GRADIENT_PRESETS: readonly GradientPreset[] = [
  { id: 'default', label: 'Aurora', stops: ['#7c3aed', '#ec4899', '#f97316'] },
  { id: 'blue', label: 'Azure', stops: ['#1d4ed8', '#2563eb', '#0ea5e9', '#14b8a6'] },
  { id: 'purple', label: 'Velvet', stops: ['#5b21b6', '#7c3aed', '#a855f7', '#ec4899'] },
  { id: 'green', label: 'Verdant', stops: ['#047857', '#10b981', '#22c55e', '#bef264'] },
  { id: 'orange', label: 'Sunrise', stops: ['#c2410c', '#ea580c', '#f97316', '#facc15'] },
  { id: 'gradient-aurora', label: 'Cosmic', stops: ['#312e81', '#7c3aed', '#ec4899', '#f97316'] },
  { id: 'gradient-dusk', label: 'Dusk', stops: ['#1e3a8a', '#6366f1', '#a855f7', '#f472b6'] },
  { id: 'gradient-oceanic', label: 'Oceanic', stops: ['#0f172a', '#1d4ed8', '#38bdf8', '#2dd4bf'] },
  { id: 'gradient-forest', label: 'Forest', stops: ['#064e3b', '#047857', '#22c55e', '#a3e635'] },
  { id: 'gradient-tropical', label: 'Tropical', stops: ['#0ea5e9', '#22d3ee', '#34d399', '#fde68a'] },
  { id: 'gradient-blush', label: 'Blush', stops: ['#f472b6', '#fb7185', '#f97316', '#fde68a'] },
  { id: 'gradient-midnight', label: 'Midnight', stops: ['#0f172a', '#312e81', '#6d28d9', '#a855f7'] },
];

const buildGradientString = (preset: GradientPreset): string => {
  const angle = typeof preset.angle === 'number' ? preset.angle : 135;
  const stops = preset.stops.join(', ');
  return `linear-gradient(${angle}deg, ${stops})`;
};

const buildSolidPalette = (): readonly ColorTrayOption[] => {
  const options: ColorTrayOption[] = [];
  const seen = new Set<string>();

  SOLID_HUES.forEach((hue, hueIndex) => {
    SOLID_LIGHTNESS_LEVELS.forEach((lightness, lightnessIndex) => {
      const hex = hslToHex(hue, SOLID_SATURATION, lightness);
      const token = createSolidToken(hex);
      if (seen.has(token)) {
        continue;
      }
      seen.add(token);
      const hueName = SOLID_HUE_NAMES[hueIndex] ?? 'Spectrum';
      const toneName = SOLID_LIGHTNESS_DESCRIPTORS[lightnessIndex] ?? 'Tone';
      const label = `${toneName} ${hueName}`;
      const tooltip = `${label} (${hex.toUpperCase()})`;
      options.push({
        id: token,
        value: hex,
        label,
        tooltip,
        swatchStyle: { backgroundColor: hex },
        ariaLabel: `Select ${tooltip}`,
        keywords: [label, hex.toUpperCase(), hex.toLowerCase()],
      });
    });
  });

  NEUTRAL_HEXES.forEach((neutral, index) => {
    const token = createSolidToken(neutral);
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    const label = NEUTRAL_LABELS[index] ?? `Neutral ${index + 1}`;
    const tooltip = `${label} (${neutral.toUpperCase()})`;
    options.push({
      id: token,
      value: neutral,
      label,
      tooltip,
      swatchStyle: { backgroundColor: neutral },
      ariaLabel: `Select ${tooltip}`,
      keywords: [label, neutral.toUpperCase(), neutral.toLowerCase()],
    });
  });

  return options;
};

const buildGradientOptions = (): readonly ColorTrayOption[] => {
  return GRADIENT_PRESETS.map(preset => {
    const gradientStyle = buildGradientString(preset);
    const stopsLabel = preset.stops.map(stop => stop.toUpperCase()).join(', ');
    const tooltip = `${preset.label} (${stopsLabel})`;
    return {
      id: preset.id,
      value: preset.id,
      label: preset.label,
      tooltip,
      swatchStyle: { backgroundImage: gradientStyle },
      ariaLabel: `Select ${preset.label} gradient`,
      keywords: [preset.label, ...preset.stops],
    } satisfies ColorTrayOption;
  });
};

export const DEFAULT_SOLID_COLOR_OPTIONS = buildSolidPalette();
export const DEFAULT_GRADIENT_COLOR_OPTIONS = buildGradientOptions();

export const DEFAULT_SOLID_SECTION: ColorTraySection = {
  id: 'solids',
  label: 'Solid colors',
  options: DEFAULT_SOLID_COLOR_OPTIONS,
};

export const DEFAULT_GRADIENT_SECTION: ColorTraySection = {
  id: 'gradients',
  label: 'Gradients',
  options: DEFAULT_GRADIENT_COLOR_OPTIONS,
};

export const DEFAULT_COLOR_SECTIONS: readonly ColorTraySection[] = [
  DEFAULT_SOLID_SECTION,
  DEFAULT_GRADIENT_SECTION,
];

export const GRADIENT_STYLE_MAP: Record<GradientColorId, string> = GRADIENT_PRESETS.reduce<
  Record<GradientColorId, string>
>((accumulator, preset) => {
  accumulator[preset.id] = buildGradientString(preset);
  return accumulator;
}, {} as Record<GradientColorId, string>);

export const isGradientToken = (value: unknown): value is GradientColorToken =>
  typeof value === 'string' && value.startsWith('gradient-');

export const isKnownGradientId = (value: unknown): value is GradientColorId =>
  typeof value === 'string' && (value in GRADIENT_STYLE_MAP);
