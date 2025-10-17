export const THEME_COLOR_MAP: Record<string, string[]> = {
  default: ['#6366f1', '#a5b4fc', '#e0e7ff', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'],
  blue: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#eff6ff'],
  green: ['#065f46', '#10b981', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5'],
  purple: ['#581c87', '#8b5cf6', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff'],
  orange: ['#92400e', '#f59e0b', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb'],
  red: ['#991b1b', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fef2f2'],
  teal: ['#134e4a', '#14b8a6', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa'],
  pink: ['#831843', '#ec4899', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8'],
  gray: ['#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#f9fafb'],
  indigo: ['#312e81', '#4f46e5', '#818cf8', '#a5b4fc', '#e0e7ff', '#eef2ff'],
  cyan: ['#164e63', '#06b6d4', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff'],
  lime: ['#3f6212', '#84cc16', '#bef264', '#d9f99d', '#f7fee7', '#f7fee7'],
  amber: ['#78350f', '#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7', '#fffbeb'],
  emerald: ['#064e3b', '#059669', '#34d399', '#6ee7b7', '#d1fae5', '#ecfdf5'],
  violet: ['#4c1d95', '#7c3aed', '#a78bfa', '#c4b5fd', '#ede9fe', '#faf5ff'],
  fuchsia: ['#701a75', '#d946ef', '#f0abfc', '#f5d0fe', '#fae8ff', '#fdf4ff'],
  rose: ['#881337', '#e11d48', '#fb7185', '#fda4af', '#ffe4e6', '#fff1f2'],
  slate: ['#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#f1f5f9', '#f8fafc'],
  zinc: ['#27272a', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5', '#fafafa'],
  neutral: ['#262626', '#737373', '#a3a3a3', '#d4d4d4', '#f5f5f5', '#fafafa'],
  stone: ['#292524', '#78716c', '#a8a29e', '#d6d3d1', '#f5f5f4', '#fafaf9'],
};

export const resolvePalette = (theme?: string, provided?: string[]): string[] | undefined => {
  if (Array.isArray(provided) && provided.length > 0) {
    return provided;
  }

  if (theme && THEME_COLOR_MAP[theme]) {
    return THEME_COLOR_MAP[theme];
  }

  return undefined;
};
