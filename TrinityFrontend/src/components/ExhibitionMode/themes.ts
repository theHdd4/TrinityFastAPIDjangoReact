const normaliseHex = (hex: string): string => {
  const trimmed = hex.trim();
  if (!trimmed) {
    return '';
  }

  const prefixed = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (prefixed.length === 3) {
    return prefixed
      .split('')
      .map(char => char + char)
      .join('')
      .toLowerCase();
  }

  return prefixed.slice(0, 6).toLowerCase();
};

const toSolidToken = (hex: string): `solid-${string}` => {
  const normalised = normaliseHex(hex);
  return `solid-${normalised}` as const;
};

const clamp01 = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
};

const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp01(saturation / 100);
  const l = clamp01(lightness / 100);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toChannel = (channel: number): string => {
    const value = Math.round((channel + m) * 255);
    return value.toString(16).padStart(2, '0');
  };

  return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
};

const HEX_COLOR_REGEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HSL_COLOR_REGEX = /^hsla?\(\s*([0-9.]+)(?:deg)?\s*,\s*([0-9.]+)%\s*,\s*([0-9.]+)%/i;

const parseColorToHex = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (HEX_COLOR_REGEX.test(trimmed)) {
    return `#${normaliseHex(trimmed)}`;
  }

  const hslMatch = trimmed.match(HSL_COLOR_REGEX);
  if (hslMatch) {
    const hue = Number(hslMatch[1]);
    const saturation = Number(hslMatch[2]);
    const lightness = Number(hslMatch[3]);

    if ([hue, saturation, lightness].every(component => Number.isFinite(component))) {
      return hslToHex(hue, saturation, lightness);
    }
  }

  return null;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalised = normaliseHex(hex);
  const r = parseInt(normalised.slice(0, 2), 16);
  const g = parseInt(normalised.slice(2, 4), 16);
  const b = parseInt(normalised.slice(4, 6), 16);
  return [r, g, b];
};

const calculateLuminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(channel => {
    const normalised = channel / 255;
    return normalised <= 0.03928
      ? normalised / 12.92
      : Math.pow((normalised + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const resolveThemePresentationDefaults = (
  theme: ExhibitionTheme,
): NonNullable<ExhibitionTheme['presentation']> => {
  const overrides: NonNullable<ExhibitionTheme['presentation']> = { ...(theme.presentation ?? {}) };

  const backgroundHex = parseColorToHex(theme.colors.background) ?? '#ffffff';
  const accentHex =
    parseColorToHex(theme.colors.accent) ??
    parseColorToHex(theme.colors.primary) ??
    backgroundHex;

  if (!overrides.cardColor && accentHex) {
    overrides.cardColor = toSolidToken(accentHex);
  }

  if (!overrides.cardLayout) {
    const luminance = calculateLuminance(backgroundHex);
    overrides.cardLayout = luminance < 0.32 ? 'full' : 'right';
  }

  if (!overrides.cardWidth) {
    overrides.cardWidth = 'L';
  }

  if (!overrides.contentAlignment) {
    overrides.contentAlignment = 'center';
  }

  if (typeof overrides.fullBleed !== 'boolean') {
    overrides.fullBleed = overrides.cardLayout === 'full';
  }

  if (!overrides.backgroundMode) {
    overrides.backgroundMode = 'solid';
  }

  if (!overrides.backgroundColor && backgroundHex) {
    overrides.backgroundColor = toSolidToken(backgroundHex);
  }

  if (!overrides.backgroundSolidColor && backgroundHex) {
    overrides.backgroundSolidColor = backgroundHex;
  }

  if (overrides.backgroundMode === 'gradient') {
    if (!overrides.backgroundGradientStart) {
      overrides.backgroundGradientStart = backgroundHex;
    }

    if (!overrides.backgroundGradientEnd) {
      const mutedHex = parseColorToHex(theme.colors.muted) ?? backgroundHex;
      overrides.backgroundGradientEnd = mutedHex;
    }

    if (!overrides.backgroundGradientDirection) {
      overrides.backgroundGradientDirection = '135deg';
    }
  }

  if (typeof overrides.backgroundOpacity !== 'number') {
    overrides.backgroundOpacity = 100;
  }

  if (!('accentImage' in overrides)) {
    overrides.accentImage = null;
  }

  if (!('accentImageName' in overrides)) {
    overrides.accentImageName = null;
  }

  return overrides;
};

export interface ExhibitionTheme {
  id: string;
  name: string;
  description: string;
  colors: {
    background: string;
    foreground: string;
    primary: string;
    secondary: string;
    accent: string;
    muted: string;
    border: string;
  };
  gradients: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  effects: {
    shadow: string;
    borderRadius: string;
    blur?: string;
    glow?: string;
  };
  presentation?: {
    cardColor?: string;
    cardWidth?: 'M' | 'L';
    contentAlignment?: 'top' | 'center' | 'bottom';
    fullBleed?: boolean;
    cardLayout?: 'none' | 'top' | 'bottom' | 'right' | 'left' | 'full';
    backgroundMode?: 'preset' | 'solid' | 'gradient' | 'image';
    backgroundColor?: string;
    backgroundSolidColor?: string;
    backgroundGradientStart?: string;
    backgroundGradientEnd?: string;
    backgroundGradientDirection?: string;
    backgroundOpacity?: number;
    accentImage?: string | null;
    accentImageName?: string | null;
  };
}

export const DEFAULT_EXHIBITION_THEME: ExhibitionTheme = {
  id: 'clean-slate',
  name: 'Clean Slate',
  description: 'Minimal, neutral canvas ready for your story',
  colors: {
    background: '#FFFFFF',
    foreground: '#111827',
    primary: '#2563EB',
    secondary: '#64748B',
    accent: '#0EA5E9',
    muted: '#F3F4F6',
    border: '#E5E7EB',
  },
  gradients: {
    primary: 'linear-gradient(135deg, #2563EB 0%, #60A5FA 100%)',
    secondary: 'linear-gradient(135deg, #64748B 0%, #94A3B8 100%)',
    accent: 'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
    background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
  },
  effects: {
    shadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
    borderRadius: '28px',
  },
  presentation: {
    cardColor: 'purple',
    cardLayout: 'none',
    cardWidth: 'L',
    contentAlignment: 'center',
    fullBleed: false,
    backgroundMode: 'gradient',
    backgroundColor: toSolidToken('#f8fafc'),
    backgroundGradientStart: '#FFFFFF',
    backgroundGradientEnd: '#F8FAFC',
    backgroundGradientDirection: '180deg',
    backgroundOpacity: 100,
  },
};

export const EXHIBITION_THEME_PRESETS: ExhibitionTheme[] = [
  DEFAULT_EXHIBITION_THEME,
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'Clean and sophisticated with subtle accents',
    colors: {
      background: 'hsl(0, 0%, 100%)',
      foreground: 'hsl(0, 0%, 4%)',
      primary: 'hsl(217, 91%, 60%)',
      secondary: 'hsl(215, 20%, 65%)',
      accent: 'hsl(217, 91%, 60%)',
      muted: 'hsl(210, 40%, 96%)',
      border: 'hsl(214, 32%, 91%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(217, 91%, 60%) 0%, hsl(217, 91%, 70%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(215, 20%, 65%) 0%, hsl(215, 20%, 75%) 100%)',
      accent: 'linear-gradient(135deg, hsl(217, 91%, 70%) 0%, hsl(217, 91%, 80%) 100%)',
      background: 'linear-gradient(180deg, hsl(0, 0%, 100%) 0%, hsl(210, 40%, 98%) 100%)',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    effects: {
      shadow: '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)',
      borderRadius: '0.5rem',
      blur: 'blur(8px)',
      glow: 'drop-shadow(0 0 8px hsla(217, 91%, 60%, 0.3))',
    },
    presentation: {
      cardColor: toSolidToken('#e2e8f0'),
      cardLayout: 'right',
      cardWidth: 'L',
      contentAlignment: 'center',
      fullBleed: false,
      backgroundMode: 'solid',
      backgroundColor: toSolidToken('#ffffff'),
      backgroundSolidColor: '#ffffff',
      backgroundOpacity: 100,
    },
  },
  {
    id: 'dark-elegance',
    name: 'Dark Elegance',
    description: 'Sophisticated dark theme with golden accents',
    colors: {
      background: 'hsl(222, 47%, 11%)',
      foreground: 'hsl(210, 40%, 98%)',
      primary: 'hsl(38, 92%, 50%)',
      secondary: 'hsl(215, 20%, 65%)',
      accent: 'hsl(45, 93%, 58%)',
      muted: 'hsl(217, 33%, 17%)',
      border: 'hsl(215, 28%, 30%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(38, 92%, 50%) 0%, hsl(45, 93%, 58%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(215, 20%, 65%) 0%, hsl(214, 32%, 91%) 100%)',
      accent: 'linear-gradient(135deg, hsl(45, 93%, 58%) 0%, hsl(54, 91%, 68%) 100%)',
      background: 'linear-gradient(180deg, hsl(222, 47%, 11%) 0%, hsl(217, 33%, 17%) 100%)',
    },
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    effects: {
      shadow: '0 10px 30px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)',
      borderRadius: '0.75rem',
      blur: 'blur(12px)',
      glow: 'drop-shadow(0 0 20px hsla(38, 92%, 50%, 0.4))',
    },
    presentation: {
      cardColor: toSolidToken('#1f2937'),
      cardLayout: 'full',
      cardWidth: 'L',
      contentAlignment: 'center',
      fullBleed: true,
      backgroundMode: 'solid',
      backgroundColor: toSolidToken('#0f172a'),
      backgroundSolidColor: '#0f172a',
      backgroundOpacity: 96,
    },
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Calming blues and aqua tones',
    colors: {
      background: 'hsl(199, 89%, 97%)',
      foreground: 'hsl(198, 82%, 22%)',
      primary: 'hsl(199, 89%, 48%)',
      secondary: 'hsl(187, 95%, 43%)',
      accent: 'hsl(186, 90%, 55%)',
      muted: 'hsl(199, 95%, 94%)',
      border: 'hsl(199, 95%, 88%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(199, 89%, 48%) 0%, hsl(186, 90%, 55%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(187, 95%, 43%) 0%, hsl(186, 90%, 55%) 100%)',
      accent: 'linear-gradient(135deg, hsl(186, 90%, 55%) 0%, hsl(186, 88%, 65%) 100%)',
      background: 'linear-gradient(180deg, hsl(199, 89%, 97%) 0%, hsl(199, 95%, 94%) 100%)',
    },
    fonts: { heading: 'Montserrat', body: 'Open Sans' },
    effects: {
      shadow: '0 4px 16px rgba(14,165,233,0.2), 0 2px 8px rgba(14,165,233,0.15)',
      borderRadius: '1rem',
      blur: 'blur(10px)',
      glow: 'drop-shadow(0 0 12px hsla(199, 89%, 48%, 0.35))',
    },
    presentation: {
      cardColor: 'gradient-oceanic',
      cardLayout: 'left',
      cardWidth: 'L',
      contentAlignment: 'center',
      fullBleed: false,
      backgroundMode: 'gradient',
      backgroundColor: 'gradient-oceanic',
      backgroundGradientStart: '#ecfeff',
      backgroundGradientEnd: '#bae6fd',
      backgroundGradientDirection: '135deg',
      backgroundOpacity: 100,
    },
  },
  {
    id: 'forest-natural',
    name: 'Forest Natural',
    description: 'Earthy greens with organic feel',
    colors: {
      background: 'hsl(80, 89%, 95%)',
      foreground: 'hsl(140, 61%, 17%)',
      primary: 'hsl(142, 71%, 45%)',
      secondary: 'hsl(76, 75%, 44%)',
      accent: 'hsl(142, 72%, 55%)',
      muted: 'hsl(80, 94%, 90%)',
      border: 'hsl(84, 90%, 80%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(142, 71%, 45%) 0%, hsl(142, 72%, 55%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(76, 75%, 44%) 0%, hsl(76, 79%, 54%) 100%)',
      accent: 'linear-gradient(135deg, hsl(142, 72%, 55%) 0%, hsl(142, 77%, 65%) 100%)',
      background: 'linear-gradient(180deg, hsl(80, 89%, 95%) 0%, hsl(80, 94%, 90%) 100%)',
    },
    fonts: { heading: 'Merriweather', body: 'Lato' },
    effects: {
      shadow: '0 4px 14px rgba(22,163,74,0.15), 0 2px 8px rgba(22,163,74,0.1)',
      borderRadius: '0.5rem',
      blur: 'blur(8px)',
      glow: 'drop-shadow(0 0 10px hsla(142, 71%, 45%, 0.3))',
    },
    presentation: {
      cardColor: 'gradient-forest',
      cardLayout: 'left',
      cardWidth: 'L',
      contentAlignment: 'center',
      fullBleed: false,
      backgroundMode: 'gradient',
      backgroundColor: 'gradient-forest',
      backgroundGradientStart: '#f7fee7',
      backgroundGradientEnd: '#dcfce7',
      backgroundGradientDirection: '135deg',
      backgroundOpacity: 100,
    },
  },
  {
    id: 'sunset-gradient',
    name: 'Sunset Gradient',
    description: 'Warm gradients from orange to pink',
    colors: {
      background: 'hsl(24, 100%, 97%)',
      foreground: 'hsl(17, 76%, 27%)',
      primary: 'hsl(24, 95%, 53%)',
      secondary: 'hsl(27, 96%, 61%)',
      accent: 'hsl(30, 97%, 72%)',
      muted: 'hsl(24, 100%, 93%)',
      border: 'hsl(24, 100%, 88%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(24, 95%, 53%) 0%, hsl(27, 96%, 61%) 50%, hsl(330, 81%, 70%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(27, 96%, 61%) 0%, hsl(30, 97%, 72%) 100%)',
      accent: 'linear-gradient(135deg, hsl(30, 97%, 72%) 0%, hsl(45, 97%, 75%) 100%)',
      background: 'linear-gradient(180deg, hsl(24, 100%, 97%) 0%, hsl(24, 100%, 93%) 50%, hsl(349, 100%, 96%) 100%)',
    },
    fonts: { heading: 'Poppins', body: 'Roboto' },
    effects: {
      shadow: '0 8px 20px rgba(249,115,22,0.25), 0 4px 12px rgba(249,115,22,0.15)',
      borderRadius: '1rem',
      blur: 'blur(12px)',
      glow: 'drop-shadow(0 0 16px hsla(24, 95%, 53%, 0.35))',
    },
    presentation: {
      cardColor: 'gradient-blush',
      cardLayout: 'top',
      cardWidth: 'L',
      contentAlignment: 'center',
      fullBleed: false,
      backgroundMode: 'gradient',
      backgroundColor: 'gradient-tropical',
      backgroundGradientStart: '#fff7ed',
      backgroundGradientEnd: '#ffe4e6',
      backgroundGradientDirection: '135deg',
      backgroundOpacity: 100,
    },
  },
  {
    id: 'royal-purple',
    name: 'Royal Purple',
    description: 'Luxurious purple with rich tones',
    colors: {
      background: '#FAF5FF',
      foreground: '#3B0764',
      primary: '#9333EA',
      secondary: '#A855F7',
      accent: '#C084FC',
      muted: '#F3E8FF',
      border: '#E9D5FF',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #9333EA 0%, #A855F7 100%)',
      secondary: 'linear-gradient(135deg, #A855F7 0%, #C084FC 100%)',
      accent: 'linear-gradient(135deg, #C084FC 0%, #D8B4FE 100%)',
      background: 'linear-gradient(180deg, #FAF5FF 0%, #F3E8FF 100%)',
    },
    fonts: { heading: 'Cormorant Garamond', body: 'Lora' },
    effects: { shadow: '0 4px 12px rgba(147,51,234,0.3)', borderRadius: '0.75rem' },
  },
  {
    id: 'corporate-blue',
    name: 'Corporate Blue',
    description: 'Professional and trustworthy',
    colors: {
      background: '#F8FAFC',
      foreground: '#1E293B',
      primary: '#1E40AF',
      secondary: '#3B82F6',
      accent: '#60A5FA',
      muted: '#F1F5F9',
      border: '#CBD5E1',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      secondary: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
      accent: 'linear-gradient(135deg, #60A5FA 0%, #93C5FD 100%)',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
    },
    fonts: { heading: 'IBM Plex Sans', body: 'IBM Plex Sans' },
    effects: { shadow: '0 1px 4px rgba(30,64,175,0.1)', borderRadius: '0.375rem' },
  },
  {
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    description: 'Soft pinks with delicate beauty',
    colors: {
      background: '#FFF1F2',
      foreground: '#881337',
      primary: '#E11D48',
      secondary: '#F43F5E',
      accent: '#FB7185',
      muted: '#FFE4E6',
      border: '#FECDD3',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #E11D48 0%, #F43F5E 100%)',
      secondary: 'linear-gradient(135deg, #F43F5E 0%, #FB7185 100%)',
      accent: 'linear-gradient(135deg, #FB7185 0%, #FDA4AF 100%)',
      background: 'linear-gradient(180deg, #FFF1F2 0%, #FFE4E6 100%)',
    },
    fonts: { heading: 'Dancing Script', body: 'Quicksand' },
    effects: { shadow: '0 3px 10px rgba(225,29,72,0.2)', borderRadius: '1.25rem' },
  },
  {
    id: 'monochrome-pro',
    name: 'Monochrome Pro',
    description: 'Timeless black and white',
    colors: {
      background: '#FFFFFF',
      foreground: '#000000',
      primary: '#18181B',
      secondary: '#52525B',
      accent: '#71717A',
      muted: '#F4F4F5',
      border: '#D4D4D8',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #18181B 0%, #52525B 100%)',
      secondary: 'linear-gradient(135deg, #52525B 0%, #71717A 100%)',
      accent: 'linear-gradient(135deg, #71717A 0%, #A1A1AA 100%)',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 100%)',
    },
    fonts: { heading: 'Bebas Neue', body: 'Source Sans Pro' },
    effects: { shadow: '0 2px 6px rgba(0,0,0,0.15)', borderRadius: '0.25rem' },
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    description: 'Futuristic with neon highlights',
    colors: {
      background: '#050505',
      foreground: '#00FF88',
      primary: '#00FFFF',
      secondary: '#FF00FF',
      accent: '#FFFF00',
      muted: '#1A1A1A',
      border: '#333333',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #00FFFF 0%, #00FF88 50%, #FF00FF 100%)',
      secondary: 'linear-gradient(135deg, #FF00FF 0%, #FFFF00 100%)',
      accent: 'linear-gradient(135deg, #FFFF00 0%, #00FFFF 100%)',
      background: 'linear-gradient(180deg, #050505 0%, #1A1A1A 100%)',
    },
    fonts: { heading: 'Orbitron', body: 'Rajdhani' },
    effects: { shadow: '0 0 20px rgba(0,255,255,0.5)', borderRadius: '0.25rem' },
  },
  {
    id: 'autumn-harvest',
    name: 'Autumn Harvest',
    description: 'Warm autumn colors',
    colors: {
      background: '#FFFBEB',
      foreground: '#78350F',
      primary: '#D97706',
      secondary: '#F59E0B',
      accent: '#FBBF24',
      muted: '#FEF3C7',
      border: '#FDE68A',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
      secondary: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
      accent: 'linear-gradient(135deg, #FBBF24 0%, #FDE68A 100%)',
      background: 'linear-gradient(180deg, #FFFBEB 0%, #FEF3C7 100%)',
    },
    fonts: { heading: 'Abril Fatface', body: 'Nunito' },
    effects: { shadow: '0 3px 10px rgba(217,119,6,0.2)', borderRadius: '0.625rem' },
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    description: 'Cool icy blues and whites',
    colors: {
      background: '#F0FDFA',
      foreground: '#134E4A',
      primary: '#14B8A6',
      secondary: '#2DD4BF',
      accent: '#5EEAD4',
      muted: '#CCFBF1',
      border: '#99F6E4',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #14B8A6 0%, #2DD4BF 100%)',
      secondary: 'linear-gradient(135deg, #2DD4BF 0%, #5EEAD4 100%)',
      accent: 'linear-gradient(135deg, #5EEAD4 0%, #99F6E4 100%)',
      background: 'linear-gradient(180deg, #F0FDFA 0%, #CCFBF1 100%)',
    },
    fonts: { heading: 'Raleway', body: 'Nunito Sans' },
    effects: { shadow: '0 2px 8px rgba(20,184,166,0.15)', borderRadius: '0.5rem' },
  },
  {
    id: 'vintage-sepia',
    name: 'Vintage Sepia',
    description: 'Classic retro with sepia tones',
    colors: {
      background: '#FEF3C7',
      foreground: '#451A03',
      primary: '#92400E',
      secondary: '#B45309',
      accent: '#D97706',
      muted: '#FDE68A',
      border: '#FCD34D',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #92400E 0%, #B45309 100%)',
      secondary: 'linear-gradient(135deg, #B45309 0%, #D97706 100%)',
      accent: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
      background: 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%)',
    },
    fonts: { heading: 'Crimson Text', body: 'EB Garamond' },
    effects: { shadow: '0 4px 8px rgba(146,64,14,0.25)', borderRadius: '0.25rem' },
  },
  {
    id: 'mint-fresh',
    name: 'Mint Fresh',
    description: 'Refreshing mint greens',
    colors: {
      background: '#F0FDF4',
      foreground: '#14532D',
      primary: '#10B981',
      secondary: '#34D399',
      accent: '#6EE7B7',
      muted: '#D1FAE5',
      border: '#A7F3D0',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
      secondary: 'linear-gradient(135deg, #34D399 0%, #6EE7B7 100%)',
      accent: 'linear-gradient(135deg, #6EE7B7 0%, #A7F3D0 100%)',
      background: 'linear-gradient(180deg, #F0FDF4 0%, #D1FAE5 100%)',
    },
    fonts: { heading: 'Comfortaa', body: 'Karla' },
    effects: { shadow: '0 2px 8px rgba(16,185,129,0.2)', borderRadius: '0.875rem' },
  },
  {
    id: 'midnight-blue',
    name: 'Midnight Blue',
    description: 'Deep blues with silver accents',
    colors: {
      background: '#0C1835',
      foreground: '#E0E7FF',
      primary: '#4F46E5',
      secondary: '#6366F1',
      accent: '#818CF8',
      muted: '#1E293B',
      border: '#475569',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 100%)',
      secondary: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
      accent: 'linear-gradient(135deg, #818CF8 0%, #A5B4FC 100%)',
      background: 'linear-gradient(180deg, #0C1835 0%, #1E293B 100%)',
    },
    fonts: { heading: 'Cinzel', body: 'Libre Baskerville' },
    effects: { shadow: '0 4px 16px rgba(79,70,229,0.4)', borderRadius: '0.5rem' },
  },
  {
    id: 'peach-cream',
    name: 'Peach Cream',
    description: 'Soft peach with creamy tones',
    colors: {
      background: '#FFF7ED',
      foreground: '#7C2D12',
      primary: '#FB923C',
      secondary: '#FDBA74',
      accent: '#FED7AA',
      muted: '#FFEDD5',
      border: '#FED7AA',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #FB923C 0%, #FDBA74 100%)',
      secondary: 'linear-gradient(135deg, #FDBA74 0%, #FED7AA 100%)',
      accent: 'linear-gradient(135deg, #FED7AA 0%, #FFEDD5 100%)',
      background: 'linear-gradient(180deg, #FFF7ED 0%, #FFEDD5 100%)',
    },
    fonts: { heading: 'Pacifico', body: 'Outfit' },
    effects: { shadow: '0 3px 10px rgba(251,146,60,0.2)', borderRadius: '1rem' },
  },
  {
    id: 'slate-modern',
    name: 'Slate Modern',
    description: 'Contemporary slate grays',
    colors: {
      background: '#F8FAFC',
      foreground: '#0F172A',
      primary: '#475569',
      secondary: '#64748B',
      accent: '#94A3B8',
      muted: '#F1F5F9',
      border: '#CBD5E1',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #475569 0%, #64748B 100%)',
      secondary: 'linear-gradient(135deg, #64748B 0%, #94A3B8 100%)',
      accent: 'linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)',
      background: 'linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)',
    },
    fonts: { heading: 'Work Sans', body: 'Inter' },
    effects: { shadow: '0 1px 3px rgba(71,85,105,0.1)', borderRadius: '0.5rem' },
  },
  {
    id: 'lavender-dream',
    name: 'Lavender Dream',
    description: 'Dreamy lavender purples',
    colors: {
      background: '#FAF5FF',
      foreground: '#4C1D95',
      primary: '#7C3AED',
      secondary: '#8B5CF6',
      accent: '#A78BFA',
      muted: '#F3E8FF',
      border: '#DDD6FE',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
      secondary: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 100%)',
      accent: 'linear-gradient(135deg, #A78BFA 0%, #C4B5FD 100%)',
      background: 'linear-gradient(180deg, #FAF5FF 0%, #F3E8FF 100%)',
    },
    fonts: { heading: 'Satisfy', body: 'Manrope' },
    effects: { shadow: '0 3px 12px rgba(124,58,237,0.25)', borderRadius: '1rem' },
  },
  {
    id: 'terracotta-warm',
    name: 'Terracotta Warm',
    description: 'Earthy terracotta tones',
    colors: {
      background: '#FFF8F3',
      foreground: '#57190C',
      primary: '#C2410C',
      secondary: '#EA580C',
      accent: '#F97316',
      muted: '#FFEDD5',
      border: '#FDBA74',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #C2410C 0%, #EA580C 100%)',
      secondary: 'linear-gradient(135deg, #EA580C 0%, #F97316 100%)',
      accent: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
      background: 'linear-gradient(180deg, #FFF8F3 0%, #FFEDD5 100%)',
    },
    fonts: { heading: 'Righteous', body: 'Hind' },
    effects: { shadow: '0 3px 10px rgba(194,65,12,0.2)', borderRadius: '0.625rem' },
  },
  {
    id: 'emerald-jewel',
    name: 'Emerald Jewel',
    description: 'Rich emerald greens',
    colors: {
      background: '#ECFDF5',
      foreground: '#064E3B',
      primary: '#059669',
      secondary: '#10B981',
      accent: '#34D399',
      muted: '#D1FAE5',
      border: '#A7F3D0',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
      secondary: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
      accent: 'linear-gradient(135deg, #34D399 0%, #6EE7B7 100%)',
      background: 'linear-gradient(180deg, #ECFDF5 0%, #D1FAE5 100%)',
    },
    fonts: { heading: 'Oswald', body: 'PT Sans' },
    effects: { shadow: '0 4px 12px rgba(5,150,105,0.25)', borderRadius: '0.75rem' },
  },
  {
    id: 'berry-fusion',
    name: 'Berry Fusion',
    description: 'Vibrant berry colors',
    colors: {
      background: '#FDF2F8',
      foreground: '#831843',
      primary: '#DB2777',
      secondary: '#EC4899',
      accent: '#F472B6',
      muted: '#FCE7F3',
      border: '#FBCFE8',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #DB2777 0%, #EC4899 100%)',
      secondary: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)',
      accent: 'linear-gradient(135deg, #F472B6 0%, #F9A8D4 100%)',
      background: 'linear-gradient(180deg, #FDF2F8 0%, #FCE7F3 100%)',
    },
    fonts: { heading: 'Lobster', body: 'Rubik' },
    effects: { shadow: '0 3px 12px rgba(219,39,119,0.3)', borderRadius: '0.875rem' },
  },
  {
    id: 'cosmic-purple',
    name: 'Cosmic Purple',
    description: 'Deep space purples',
    colors: {
      background: '#1A0B2E',
      foreground: '#F5E6FF',
      primary: '#7B2CBF',
      secondary: '#9D4EDD',
      accent: '#C77DFF',
      muted: '#2D1B4E',
      border: '#5A3D7A',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #7B2CBF 0%, #9D4EDD 100%)',
      secondary: 'linear-gradient(135deg, #9D4EDD 0%, #C77DFF 100%)',
      accent: 'linear-gradient(135deg, #C77DFF 0%, #E0AAFF 100%)',
      background: 'linear-gradient(180deg, #1A0B2E 0%, #2D1B4E 100%)',
    },
    fonts: { heading: 'Space Grotesk', body: 'Space Mono' },
    effects: { shadow: '0 4px 20px rgba(123,44,191,0.5)', borderRadius: '0.5rem' },
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    description: 'Warm golden sunset tones',
    colors: {
      background: '#FFFBEB',
      foreground: '#78350F',
      primary: '#F59E0B',
      secondary: '#FBBF24',
      accent: '#FCD34D',
      muted: '#FEF3C7',
      border: '#FDE68A',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
      secondary: 'linear-gradient(135deg, #FBBF24 0%, #FCD34D 100%)',
      accent: 'linear-gradient(135deg, #FCD34D 0%, #FDE68A 100%)',
      background: 'linear-gradient(180deg, #FFFBEB 0%, #FEF3C7 100%)',
    },
    fonts: { heading: 'Playfair Display', body: 'Source Serif Pro' },
    effects: { shadow: '0 4px 12px rgba(245,158,11,0.3)', borderRadius: '0.75rem' },
  },
  {
    id: 'cosmic-gradient',
    name: 'Cosmic Gradient',
    description: 'Ethereal purple to pink gradient',
    colors: {
      background: 'hsl(240, 40%, 95%)',
      foreground: 'hsl(260, 60%, 20%)',
      primary: 'hsl(280, 85%, 60%)',
      secondary: 'hsl(320, 85%, 65%)',
      accent: 'hsl(210, 85%, 65%)',
      muted: 'hsl(240, 40%, 92%)',
      border: 'hsl(260, 30%, 85%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(240, 85%, 65%) 0%, hsl(280, 85%, 60%) 50%, hsl(320, 85%, 65%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(280, 85%, 60%) 0%, hsl(320, 85%, 65%) 100%)',
      accent: 'linear-gradient(135deg, hsl(320, 85%, 65%) 0%, hsl(10, 85%, 70%) 100%)',
      background: 'linear-gradient(180deg, hsl(240, 40%, 95%) 0%, hsl(260, 40%, 92%) 100%)',
    },
    fonts: { heading: 'Poppins', body: 'Inter' },
    effects: { shadow: '0 8px 24px rgba(168, 85, 247, 0.25)', borderRadius: '0.875rem' },
  },
  {
    id: 'professional-teal',
    name: 'Professional Teal',
    description: 'Clean teal with geometric precision',
    colors: {
      background: 'hsl(185, 60%, 92%)',
      foreground: 'hsl(185, 80%, 15%)',
      primary: 'hsl(185, 70%, 45%)',
      secondary: 'hsl(185, 60%, 60%)',
      accent: 'hsl(185, 50%, 75%)',
      muted: 'hsl(185, 50%, 88%)',
      border: 'hsl(185, 40%, 80%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(185, 70%, 45%) 0%, hsl(185, 60%, 60%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(185, 60%, 60%) 0%, hsl(185, 50%, 75%) 100%)',
      accent: 'linear-gradient(135deg, hsl(185, 50%, 75%) 0%, hsl(185, 40%, 85%) 100%)',
      background: 'linear-gradient(180deg, hsl(185, 60%, 92%) 0%, hsl(185, 50%, 88%) 100%)',
    },
    fonts: { heading: 'Work Sans', body: 'Inter' },
    effects: { shadow: '0 4px 16px rgba(20, 184, 166, 0.2)', borderRadius: '0.5rem' },
  },
  {
    id: 'holographic-dream',
    name: 'Holographic Dream',
    description: 'Vibrant rainbow holographic effect',
    colors: {
      background: 'hsl(0, 0%, 98%)',
      foreground: 'hsl(0, 0%, 10%)',
      primary: 'hsl(180, 100%, 50%)',
      secondary: 'hsl(300, 100%, 60%)',
      accent: 'hsl(60, 100%, 60%)',
      muted: 'hsl(0, 0%, 95%)',
      border: 'hsl(0, 0%, 88%)',
    },
    gradients: {
      primary:
        'linear-gradient(135deg, hsl(0, 100%, 70%) 0%, hsl(60, 100%, 60%) 20%, hsl(120, 100%, 50%) 40%, hsl(180, 100%, 50%) 60%, hsl(240, 100%, 60%) 80%, hsl(300, 100%, 60%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(120, 100%, 50%) 0%, hsl(180, 100%, 50%) 50%, hsl(240, 100%, 60%) 100%)',
      accent: 'linear-gradient(135deg, hsl(60, 100%, 60%) 0%, hsl(300, 100%, 60%) 100%)',
      background: 'linear-gradient(180deg, hsl(0, 0%, 98%) 0%, hsl(0, 0%, 95%) 100%)',
    },
    fonts: { heading: 'Montserrat', body: 'Open Sans' },
    effects: { shadow: '0 6px 20px rgba(0, 255, 255, 0.3)', borderRadius: '1rem' },
  },
  {
    id: 'azure-splash',
    name: 'Azure Splash',
    description: 'Dynamic blue ink in water',
    colors: {
      background: 'hsl(200, 100%, 98%)',
      foreground: 'hsl(210, 90%, 15%)',
      primary: 'hsl(210, 100%, 50%)',
      secondary: 'hsl(190, 90%, 45%)',
      accent: 'hsl(200, 100%, 60%)',
      muted: 'hsl(200, 80%, 94%)',
      border: 'hsl(200, 60%, 85%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(210, 100%, 50%) 0%, hsl(190, 90%, 45%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(190, 90%, 45%) 0%, hsl(200, 100%, 60%) 100%)',
      accent: 'linear-gradient(135deg, hsl(200, 100%, 60%) 0%, hsl(210, 80%, 75%) 100%)',
      background: 'linear-gradient(180deg, hsl(200, 100%, 98%) 0%, hsl(200, 80%, 94%) 100%)',
    },
    fonts: { heading: 'Raleway', body: 'Lato' },
    effects: { shadow: '0 6px 18px rgba(0, 149, 255, 0.3)', borderRadius: '0.75rem' },
  },
  {
    id: 'neon-lines',
    name: 'Neon Lines',
    description: 'Futuristic neon on dark',
    colors: {
      background: 'hsl(240, 10%, 8%)',
      foreground: 'hsl(180, 100%, 70%)',
      primary: 'hsl(180, 100%, 50%)',
      secondary: 'hsl(280, 100%, 60%)',
      accent: 'hsl(320, 100%, 60%)',
      muted: 'hsl(240, 10%, 15%)',
      border: 'hsl(240, 10%, 25%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(180, 100%, 50%) 0%, hsl(200, 100%, 50%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(280, 100%, 60%) 0%, hsl(320, 100%, 60%) 100%)',
      accent: 'linear-gradient(135deg, hsl(320, 100%, 60%) 0%, hsl(0, 100%, 60%) 100%)',
      background: 'linear-gradient(180deg, hsl(240, 10%, 8%) 0%, hsl(240, 10%, 15%) 100%)',
    },
    fonts: { heading: 'Orbitron', body: 'Space Mono' },
    effects: { shadow: '0 0 24px rgba(0, 255, 255, 0.5)', borderRadius: '0.375rem' },
  },
  {
    id: 'studio-professional',
    name: 'Studio Professional',
    description: 'Teal wall with warm wooden accents',
    colors: {
      background: 'hsl(180, 30%, 85%)',
      foreground: 'hsl(25, 40%, 30%)',
      primary: 'hsl(180, 40%, 50%)',
      secondary: 'hsl(25, 60%, 50%)',
      accent: 'hsl(180, 35%, 65%)',
      muted: 'hsl(180, 25%, 78%)',
      border: 'hsl(180, 20%, 70%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(180, 40%, 50%) 0%, hsl(180, 35%, 65%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(25, 60%, 50%) 0%, hsl(30, 65%, 60%) 100%)',
      accent: 'linear-gradient(135deg, hsl(180, 35%, 65%) 0%, hsl(180, 30%, 75%) 100%)',
      background: 'linear-gradient(180deg, hsl(180, 30%, 85%) 0%, hsl(180, 25%, 78%) 100%)',
    },
    fonts: { heading: 'Merriweather', body: 'Open Sans' },
    effects: { shadow: '0 4px 14px rgba(72, 128, 128, 0.2)', borderRadius: '0.5rem' },
  },
  {
    id: 'coral-wave',
    name: 'Coral Wave',
    description: 'Flowing coral and teal waves',
    colors: {
      background: 'hsl(340, 70%, 92%)',
      foreground: 'hsl(180, 60%, 25%)',
      primary: 'hsl(340, 75%, 60%)',
      secondary: 'hsl(180, 60%, 50%)',
      accent: 'hsl(10, 75%, 65%)',
      muted: 'hsl(340, 60%, 88%)',
      border: 'hsl(340, 50%, 80%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(340, 75%, 60%) 0%, hsl(10, 75%, 65%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(180, 60%, 50%) 0%, hsl(180, 65%, 65%) 100%)',
      accent: 'linear-gradient(135deg, hsl(340, 75%, 60%) 0%, hsl(180, 60%, 50%) 100%)',
      background: 'linear-gradient(180deg, hsl(340, 70%, 92%) 0%, hsl(340, 60%, 88%) 100%)',
    },
    fonts: { heading: 'Quicksand', body: 'Nunito' },
    effects: { shadow: '0 6px 18px rgba(244, 114, 182, 0.25)', borderRadius: '1rem' },
  },
  {
    id: 'purple-flow',
    name: 'Purple Flow',
    description: 'Fluid purple and pink gradients',
    colors: {
      background: 'hsl(290, 60%, 95%)',
      foreground: 'hsl(290, 70%, 20%)',
      primary: 'hsl(290, 85%, 60%)',
      secondary: 'hsl(320, 85%, 65%)',
      accent: 'hsl(270, 80%, 70%)',
      muted: 'hsl(290, 50%, 90%)',
      border: 'hsl(290, 40%, 82%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(270, 85%, 65%) 0%, hsl(290, 85%, 60%) 50%, hsl(320, 85%, 65%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(290, 85%, 60%) 0%, hsl(320, 85%, 65%) 100%)',
      accent: 'linear-gradient(135deg, hsl(320, 85%, 65%) 0%, hsl(340, 85%, 70%) 100%)',
      background: 'linear-gradient(180deg, hsl(290, 60%, 95%) 0%, hsl(290, 50%, 90%) 100%)',
    },
    fonts: { heading: 'Comfortaa', body: 'Karla' },
    effects: { shadow: '0 8px 22px rgba(192, 132, 252, 0.3)', borderRadius: '0.875rem' },
  },
  {
    id: 'pastel-playful',
    name: 'Pastel Playful',
    description: 'Soft pink with colorful accents',
    colors: {
      background: 'hsl(340, 60%, 95%)',
      foreground: 'hsl(340, 70%, 25%)',
      primary: 'hsl(340, 75%, 70%)',
      secondary: 'hsl(170, 70%, 60%)',
      accent: 'hsl(50, 75%, 65%)',
      muted: 'hsl(340, 50%, 92%)',
      border: 'hsl(340, 40%, 85%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(340, 75%, 70%) 0%, hsl(340, 70%, 80%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(170, 70%, 60%) 0%, hsl(170, 65%, 70%) 100%)',
      accent: 'linear-gradient(135deg, hsl(50, 75%, 65%) 0%, hsl(40, 75%, 70%) 100%)',
      background: 'linear-gradient(180deg, hsl(340, 60%, 95%) 0%, hsl(340, 50%, 92%) 100%)',
    },
    fonts: { heading: 'Pacifico', body: 'Quicksand' },
    effects: { shadow: '0 4px 14px rgba(251, 113, 133, 0.2)', borderRadius: '1rem' },
  },
  {
    id: 'marble-elegance',
    name: 'Marble Elegance',
    description: 'Sophisticated pink marble swirls',
    colors: {
      background: 'hsl(320, 40%, 96%)',
      foreground: 'hsl(280, 60%, 25%)',
      primary: 'hsl(300, 70%, 65%)',
      secondary: 'hsl(320, 65%, 70%)',
      accent: 'hsl(280, 70%, 70%)',
      muted: 'hsl(320, 35%, 92%)',
      border: 'hsl(320, 30%, 85%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(280, 70%, 70%) 0%, hsl(300, 70%, 65%) 50%, hsl(320, 65%, 70%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(300, 70%, 65%) 0%, hsl(320, 65%, 70%) 100%)',
      accent: 'linear-gradient(135deg, hsl(320, 65%, 70%) 0%, hsl(340, 60%, 75%) 100%)',
      background: 'linear-gradient(180deg, hsl(320, 40%, 96%) 0%, hsl(320, 35%, 92%) 100%)',
    },
    fonts: { heading: 'Playfair Display', body: 'Lora' },
    effects: { shadow: '0 6px 20px rgba(192, 132, 252, 0.25)', borderRadius: '0.75rem' },
  },
  {
    id: 'vibrant-blocks',
    name: 'Vibrant Blocks',
    description: 'Colorful 3D geometric blocks',
    colors: {
      background: 'hsl(0, 0%, 98%)',
      foreground: 'hsl(0, 0%, 10%)',
      primary: 'hsl(200, 90%, 50%)',
      secondary: 'hsl(330, 90%, 60%)',
      accent: 'hsl(50, 95%, 55%)',
      muted: 'hsl(0, 0%, 94%)',
      border: 'hsl(0, 0%, 85%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(200, 90%, 50%) 0%, hsl(170, 90%, 50%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(330, 90%, 60%) 0%, hsl(350, 90%, 60%) 100%)',
      accent: 'linear-gradient(135deg, hsl(50, 95%, 55%) 0%, hsl(30, 95%, 60%) 100%)',
      background: 'linear-gradient(180deg, hsl(0, 0%, 98%) 0%, hsl(0, 0%, 94%) 100%)',
    },
    fonts: { heading: 'Righteous', body: 'Rubik' },
    effects: { shadow: '0 8px 24px rgba(59, 130, 246, 0.3)', borderRadius: '0.625rem' },
  },
  {
    id: 'deep-professional',
    name: 'Deep Professional',
    description: 'Dark teal and rich brown elegance',
    colors: {
      background: 'hsl(180, 40%, 15%)',
      foreground: 'hsl(30, 60%, 85%)',
      primary: 'hsl(180, 50%, 40%)',
      secondary: 'hsl(25, 50%, 45%)',
      accent: 'hsl(180, 45%, 55%)',
      muted: 'hsl(180, 30%, 22%)',
      border: 'hsl(180, 25%, 30%)',
    },
    gradients: {
      primary: 'linear-gradient(135deg, hsl(180, 50%, 40%) 0%, hsl(180, 45%, 55%) 100%)',
      secondary: 'linear-gradient(135deg, hsl(25, 50%, 45%) 0%, hsl(30, 55%, 55%) 100%)',
      accent: 'linear-gradient(135deg, hsl(180, 45%, 55%) 0%, hsl(180, 40%, 65%) 100%)',
      background: 'linear-gradient(180deg, hsl(180, 40%, 15%) 0%, hsl(180, 30%, 22%) 100%)',
    },
    fonts: { heading: 'Cinzel', body: 'Lato' },
    effects: { shadow: '0 6px 20px rgba(0, 0, 0, 0.4)', borderRadius: '0.5rem' },
  },
];
