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
};

export const EXHIBITION_THEME_PRESETS: ExhibitionTheme[] = [
  DEFAULT_EXHIBITION_THEME,
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'Clean and sophisticated with subtle accents',
    colors: {
      background: '#FFFFFF',
      foreground: '#0A0A0A',
      primary: '#2563EB',
      secondary: '#64748B',
      accent: '#3B82F6',
      muted: '#F1F5F9',
      border: '#E2E8F0',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
      secondary: 'linear-gradient(135deg, #64748B 0%, #94A3B8 100%)',
      accent: 'linear-gradient(135deg, #3B82F6 0%, #60A5FA 100%)',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    effects: { shadow: '0 16px 40px rgba(37, 99, 235, 0.1)', borderRadius: '24px' },
  },
  {
    id: 'dark-elegance',
    name: 'Dark Elegance',
    description: 'Sophisticated dark theme with golden accents',
    colors: {
      background: '#0F172A',
      foreground: '#F8FAFC',
      primary: '#F59E0B',
      secondary: '#94A3B8',
      accent: '#FBBF24',
      muted: '#1E293B',
      border: '#334155',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
      secondary: 'linear-gradient(135deg, #94A3B8 0%, #CBD5E1 100%)',
      accent: 'linear-gradient(135deg, #FBBF24 0%, #FDE047 100%)',
      background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
    },
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    effects: { shadow: '0 28px 60px rgba(15, 23, 42, 0.6)', borderRadius: '28px' },
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Calming blues and aqua tones',
    colors: {
      background: '#F0F9FF',
      foreground: '#0C4A6E',
      primary: '#0EA5E9',
      secondary: '#06B6D4',
      accent: '#22D3EE',
      muted: '#E0F2FE',
      border: '#BAE6FD',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #0EA5E9 0%, #22D3EE 100%)',
      secondary: 'linear-gradient(135deg, #06B6D4 0%, #22D3EE 100%)',
      accent: 'linear-gradient(135deg, #22D3EE 0%, #67E8F9 100%)',
      background: 'linear-gradient(180deg, #F0F9FF 0%, #E0F2FE 100%)',
    },
    fonts: { heading: 'Montserrat', body: 'Open Sans' },
    effects: { shadow: '0 20px 50px rgba(14, 165, 233, 0.18)', borderRadius: '32px' },
  },
  {
    id: 'forest-natural',
    name: 'Forest Natural',
    description: 'Earthy greens with organic feel',
    colors: {
      background: '#F7FEE7',
      foreground: '#14532D',
      primary: '#16A34A',
      secondary: '#84CC16',
      accent: '#22C55E',
      muted: '#ECFCCB',
      border: '#D9F99D',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #16A34A 0%, #22C55E 100%)',
      secondary: 'linear-gradient(135deg, #84CC16 0%, #A3E635 100%)',
      accent: 'linear-gradient(135deg, #22C55E 0%, #4ADE80 100%)',
      background: 'linear-gradient(180deg, #F7FEE7 0%, #ECFCCB 100%)',
    },
    fonts: { heading: 'Merriweather', body: 'Lato' },
    effects: { shadow: '0 18px 44px rgba(22, 163, 74, 0.18)', borderRadius: '24px' },
  },
  {
    id: 'sunset-gradient',
    name: 'Sunset Gradient',
    description: 'Warm gradients from orange to pink',
    colors: {
      background: '#FFF7ED',
      foreground: '#7C2D12',
      primary: '#F97316',
      secondary: '#FB923C',
      accent: '#FDBA74',
      muted: '#FFEDD5',
      border: '#FED7AA',
    },
    gradients: {
      primary: 'linear-gradient(135deg, #F97316 0%, #FB923C 50%, #F472B6 100%)',
      secondary: 'linear-gradient(135deg, #FB923C 0%, #FDBA74 100%)',
      accent: 'linear-gradient(135deg, #FDBA74 0%, #FDE68A 100%)',
      background: 'linear-gradient(180deg, #FFF7ED 0%, #FFEDD5 50%, #FFF1F2 100%)',
    },
    fonts: { heading: 'Poppins', body: 'Roboto' },
    effects: { shadow: '0 26px 56px rgba(249, 115, 22, 0.25)', borderRadius: '30px' },
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
    effects: { shadow: '0 24px 52px rgba(147, 51, 234, 0.3)', borderRadius: '28px' },
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
    effects: { shadow: '0 18px 44px rgba(30, 64, 175, 0.16)', borderRadius: '26px' },
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
    effects: { shadow: '0 0 36px rgba(0, 255, 255, 0.45)', borderRadius: '20px' },
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
    effects: { shadow: '0 22px 48px rgba(217, 119, 6, 0.24)', borderRadius: '28px' },
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
    effects: { shadow: '0 30px 64px rgba(79, 70, 229, 0.35)', borderRadius: '30px' },
  },
];
