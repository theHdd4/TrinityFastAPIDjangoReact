import type { TextBoxFormatting } from './components/operationsPalette/textBox/types';
import type { GradientColorId, SolidColorToken } from '@/templates/color-tray/presets';

export type CardColor = GradientColorId | SolidColorToken;

export type CardLayout =
  | 'blank'
  | 'title-slide'
  | 'title-and-content'
  | 'section-header'
  | 'two-content'
  | 'comparison'
  | 'title-only'
  | 'content-with-caption'
  | 'picture-with-caption';

export interface LayoutAccentSpec {
  kind: 'none' | 'full' | 'top' | 'bottom' | 'left' | 'right';
  size?: number;
}

export interface LayoutTextBoxDefinition {
  role: string;
  x: number;
  y: number;
  width: number;
  height: number;
  placeholder: string;
  formatting?: Partial<TextBoxFormatting>;
}

export interface CardLayoutPreset {
  id: CardLayout;
  label: string;
  description: string;
  accent: LayoutAccentSpec;
  defaultColor: CardColor;
  textBoxes: readonly LayoutTextBoxDefinition[];
}

export const CARD_LAYOUT_PRESETS: readonly CardLayoutPreset[] = [
  {
    id: 'title-slide',
    label: 'Title Slide',
    description: 'Large hero area for a title slide.',
    accent: { kind: 'full' },
    defaultColor: 'gradient-aurora',
    textBoxes: [
      {
        role: 'header',
        x: 160,
        y: 120,
        width: 640,
        height: 96,
        placeholder: 'Click to add title',
        formatting: { fontSize: 44, bold: true, align: 'center' },
      },
      {
        role: 'subheader',
        x: 200,
        y: 240,
        width: 560,
        height: 64,
        placeholder: 'Click to add subtitle',
        formatting: { fontSize: 26, align: 'center' },
      },
      {
        role: 'paragraph',
        x: 220,
        y: 320,
        width: 520,
        height: 160,
        placeholder: 'Click to add description text',
        formatting: { fontSize: 18, align: 'center' },
      },
    ],
  },
  {
    id: 'title-and-content',
    label: 'Title and Content',
    description: 'Traditional layout with title and body content.',
    accent: { kind: 'top', size: 0.28 },
    defaultColor: 'gradient-dusk',
    textBoxes: [
      {
        role: 'header',
        x: 120,
        y: 80,
        width: 640,
        height: 80,
        placeholder: 'Click to add title',
        formatting: { fontSize: 40, bold: true },
      },
      {
        role: 'subheader',
        x: 120,
        y: 180,
        width: 640,
        height: 56,
        placeholder: 'Click to add subtitle',
        formatting: { fontSize: 24 },
      },
      {
        role: 'paragraph',
        x: 120,
        y: 260,
        width: 720,
        height: 220,
        placeholder: 'Click to add body text',
        formatting: { fontSize: 18 },
      },
    ],
  },
  {
    id: 'section-header',
    label: 'Section Header',
    description: 'Break between sections with a large title.',
    accent: { kind: 'top', size: 0.22 },
    defaultColor: 'gradient-forest',
    textBoxes: [
      {
        role: 'header',
        x: 120,
        y: 140,
        width: 720,
        height: 96,
        placeholder: 'Click to add section title',
        formatting: { fontSize: 48, bold: true, align: 'center' },
      },
      {
        role: 'subheader',
        x: 180,
        y: 260,
        width: 600,
        height: 64,
        placeholder: 'Click to add subtitle',
        formatting: { fontSize: 26, align: 'center' },
      },
      {
        role: 'paragraph',
        x: 160,
        y: 340,
        width: 640,
        height: 160,
        placeholder: 'Click to add supporting text',
        formatting: { fontSize: 18, align: 'center' },
      },
    ],
  },
  {
    id: 'two-content',
    label: 'Two Content',
    description: 'Two columns for comparing blocks of content.',
    accent: { kind: 'right', size: 0.36 },
    defaultColor: 'gradient-oceanic',
    textBoxes: [
      {
        role: 'header',
        x: 80,
        y: 64,
        width: 720,
        height: 72,
        placeholder: 'Click to add title',
        formatting: { fontSize: 34, bold: true },
      },
      {
        role: 'subheader',
        x: 80,
        y: 150,
        width: 720,
        height: 52,
        placeholder: 'Click to add subtitle',
        formatting: { fontSize: 22 },
      },
      {
        role: 'paragraph-left',
        x: 80,
        y: 220,
        width: 360,
        height: 240,
        placeholder: 'Click to add left content',
        formatting: { fontSize: 18 },
      },
      {
        role: 'paragraph-right',
        x: 460,
        y: 220,
        width: 360,
        height: 240,
        placeholder: 'Click to add right content',
        formatting: { fontSize: 18 },
      },
    ],
  },
  {
    id: 'comparison',
    label: 'Comparison',
    description: 'Side-by-side comparison with headings.',
    accent: { kind: 'left', size: 0.34 },
    defaultColor: 'gradient-midnight',
    textBoxes: [
      {
        role: 'header',
        x: 80,
        y: 64,
        width: 720,
        height: 72,
        placeholder: 'Click to add comparison title',
        formatting: { fontSize: 34, bold: true },
      },
      {
        role: 'subheader-left',
        x: 80,
        y: 150,
        width: 320,
        height: 48,
        placeholder: 'Left heading',
        formatting: { fontSize: 20, bold: true },
      },
      {
        role: 'subheader-right',
        x: 480,
        y: 150,
        width: 320,
        height: 48,
        placeholder: 'Right heading',
        formatting: { fontSize: 20, bold: true },
      },
      {
        role: 'paragraph-left',
        x: 80,
        y: 210,
        width: 320,
        height: 250,
        placeholder: 'Click to add left content',
        formatting: { fontSize: 16 },
      },
      {
        role: 'paragraph-right',
        x: 480,
        y: 210,
        width: 320,
        height: 250,
        placeholder: 'Click to add right content',
        formatting: { fontSize: 16 },
      },
    ],
  },
  {
    id: 'title-only',
    label: 'Title Only',
    description: 'Focus attention on a single title.',
    accent: { kind: 'top', size: 0.26 },
    defaultColor: 'gradient-blush',
    textBoxes: [
      {
        role: 'header',
        x: 160,
        y: 180,
        width: 640,
        height: 100,
        placeholder: 'Click to add title',
        formatting: { fontSize: 50, bold: true, align: 'center' },
      },
      {
        role: 'subheader',
        x: 220,
        y: 300,
        width: 520,
        height: 72,
        placeholder: 'Click to add subtitle',
        formatting: { fontSize: 26, align: 'center' },
      },
      {
        role: 'paragraph',
        x: 220,
        y: 380,
        width: 520,
        height: 120,
        placeholder: 'Click to add additional notes',
        formatting: { fontSize: 18, align: 'center' },
      },
    ],
  },
  {
    id: 'content-with-caption',
    label: 'Content with Caption',
    description: 'Main content with supporting caption area.',
    accent: { kind: 'right', size: 0.28 },
    defaultColor: 'gradient-tropical',
    textBoxes: [
      {
        role: 'header',
        x: 120,
        y: 80,
        width: 520,
        height: 72,
        placeholder: 'Click to add title',
        formatting: { fontSize: 36, bold: true },
      },
      {
        role: 'paragraph',
        x: 260,
        y: 160,
        width: 520,
        height: 280,
        placeholder: 'Click to add content',
        formatting: { fontSize: 18 },
      },
      {
        role: 'caption',
        x: 80,
        y: 200,
        width: 160,
        height: 160,
        placeholder: 'Click to add caption text',
        formatting: { fontSize: 16, align: 'center' },
      },
    ],
  },
  {
    id: 'picture-with-caption',
    label: 'Picture with Caption',
    description: 'Space for imagery with supporting caption.',
    accent: { kind: 'bottom', size: 0.32 },
    defaultColor: 'gradient-forest',
    textBoxes: [
      {
        role: 'header',
        x: 120,
        y: 60,
        width: 520,
        height: 72,
        placeholder: 'Click to add title',
        formatting: { fontSize: 32, bold: true },
      },
      {
        role: 'subheader',
        x: 120,
        y: 150,
        width: 520,
        height: 56,
        placeholder: 'Click to add subtitle',
        formatting: { fontSize: 22 },
      },
      {
        role: 'caption',
        x: 160,
        y: 340,
        width: 640,
        height: 140,
        placeholder: 'Click to add caption text',
        formatting: { fontSize: 18, align: 'center' },
      },
    ],
  },
  {
    id: 'blank',
    label: 'Blank',
    description: 'Start from scratch with no placeholders.',
    accent: { kind: 'none' },
    defaultColor: 'default',
    textBoxes: [],
  },
] as const;

export const CARD_LAYOUTS = CARD_LAYOUT_PRESETS.map(preset => preset.id) as readonly CardLayout[];

export const DEFAULT_CARD_LAYOUT: CardLayout = 'title-and-content';

const LEGACY_CARD_LAYOUTS: Record<string, CardLayout> = {
  none: 'blank',
  top: 'title-and-content',
  bottom: 'picture-with-caption',
  right: 'content-with-caption',
  left: 'comparison',
  full: 'title-slide',
};

export const ensureCardLayout = (layout: unknown): CardLayout => {
  if (typeof layout === 'string') {
    if ((CARD_LAYOUTS as readonly string[]).includes(layout)) {
      return layout as CardLayout;
    }
    const legacy = LEGACY_CARD_LAYOUTS[layout];
    if (legacy) {
      return legacy;
    }
  }
  return DEFAULT_CARD_LAYOUT;
};

export const getLayoutPreset = (layout: CardLayout): CardLayoutPreset => {
  const preset = CARD_LAYOUT_PRESETS.find(entry => entry.id === layout);
  return preset ?? CARD_LAYOUT_PRESETS[0];
};

export const buildLayoutTextBoxId = (cardId: string, role: string) => `${cardId}::layout-${role}`;

export const LAYOUT_BASE_WIDTH = 960;
export const LAYOUT_BASE_HEIGHT = 520;
