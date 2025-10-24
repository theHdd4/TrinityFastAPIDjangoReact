import type { SlideObject } from '../../../store/exhibitionStore';
import type { TextBoxFormatting } from './types';

export const DEFAULT_TEXT_BOX_TEXT = 'Double click to edit';

export const FONT_FILTER_CHIPS = [
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'corporate', label: 'Corporate' },
  { id: 'defaults', label: 'Defaults' },
  { id: 'display', label: 'Display' },
] as const;

export type FontFilterChipId = (typeof FONT_FILTER_CHIPS)[number]['id'];

export const FONT_MENU_SECTIONS = [
  {
    id: 'document' as const,
    label: 'Document fonts',
    fonts: ['Migra', 'The Seasons', 'XB Niloofar'],
  },
  {
    id: 'recommended' as const,
    label: 'Recommended fonts',
    fonts: ['Open Sans', 'DM Sans', 'Dream Avenue', 'BROWN SUGAR', 'HK Grotesk', 'Canva Sans'],
  },
  {
    id: 'recent' as const,
    label: 'Recently used',
    fonts: ['Roboto', 'Clear Sans', 'Poppins', 'Times New Roman MT', 'Alice'],
  },
  {
    id: 'popular' as const,
    label: 'Popular fonts',
    fonts: [
      'Arimo',
      'Canva Sans',
      'Montserrat',
      'Open Sans',
      'Poppins',
      'Glacial Indifference',
      'League Spartan',
      'Anton',
      'DM Sans',
      'Archivo Black',
      'Roboto',
      'Garet',
      'Alice',
      'Open Sauce',
      'Brittany',
      'Arial MT Pro',
      'GAGALN',
      'Times New Roman MT',
      'Lora',
      'The Seasons',
      'Prastice',
      'Comic Sans',
    ],
  },
] as const;

export type FontMenuSection = (typeof FONT_MENU_SECTIONS)[number];

export const FONT_CATEGORY_LOOKUP: Record<string, readonly FontFilterChipId[]> = {
  Arimo: ['corporate', 'defaults'],
  'Arial MT Pro': ['corporate', 'defaults'],
  'Archivo Black': ['display'],
  'BROWN SUGAR': ['display'],
  Brittany: ['handwriting'],
  'Canva Sans': ['corporate'],
  'Clear Sans': ['corporate'],
  'Comic Sans': ['handwriting', 'defaults'],
  'DM Sans': ['corporate'],
  'Dream Avenue': ['handwriting'],
  'GAGALN': ['display'],
  Garet: ['corporate', 'display'],
  'Glacial Indifference': ['corporate'],
  'HK Grotesk': ['corporate'],
  Lora: ['defaults'],
  'Migra': ['handwriting', 'defaults'],
  Montserrat: ['corporate', 'display'],
  'Open Sans': ['corporate', 'defaults'],
  'Open Sauce': ['corporate'],
  Poppins: ['defaults', 'display'],
  Prastice: ['handwriting'],
  'The Seasons': ['handwriting', 'defaults'],
  'Times New Roman MT': ['defaults'],
  'XB Niloofar': ['handwriting'],
  Roboto: ['corporate', 'defaults'],
  Alice: ['defaults'],
  'League Spartan': ['display'],
  Anton: ['display'],
};

const FONT_MENU_LIST = FONT_MENU_SECTIONS.flatMap(section => section.fonts);
const FONT_OPTION_BASE = ['Open Sans', ...FONT_MENU_LIST];

export const FONT_OPTIONS = Array.from(new Set(FONT_OPTION_BASE));

export const DEFAULT_TEXT_BOX_WIDTH = 360;
export const DEFAULT_TEXT_BOX_HEIGHT = 180;

const createDefaultFormatting = (
  overrides: Partial<TextBoxFormatting> = {},
): TextBoxFormatting => ({
  text: DEFAULT_TEXT_BOX_TEXT,
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0],
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  color: '#111827',
  ...overrides,
});

export const createTextBoxSlideObject = (
  id: string,
  overrides: Partial<SlideObject> = {},
  formattingOverrides: Partial<TextBoxFormatting> = {},
): SlideObject => ({
  id,
  type: 'text-box',
  x: 120,
  y: 120,
  width: DEFAULT_TEXT_BOX_WIDTH,
  height: DEFAULT_TEXT_BOX_HEIGHT,
  zIndex: 1,
  rotation: 0,
  groupId: null,
  props: createDefaultFormatting(formattingOverrides),
  ...overrides,
});

export const extractTextBoxFormatting = (
  props: Record<string, unknown> | undefined,
): TextBoxFormatting => {
  const formatting = createDefaultFormatting();

  if (!props) {
    return formatting;
  }

  const text = typeof props.text === 'string' ? props.text : formatting.text;
  const fontSize = Number(props.fontSize);
  const fontFamily =
    typeof props.fontFamily === 'string' && props.fontFamily.trim().length > 0
      ? props.fontFamily
      : formatting.fontFamily;
  const bold = Boolean(props.bold);
  const italic = Boolean(props.italic);
  const underline = Boolean(props.underline);
  const strikethrough = Boolean(props.strikethrough);
  const align =
    props.align === 'center' || props.align === 'right' ? props.align : 'left';
  const color =
    typeof props.color === 'string' && props.color.trim().length > 0
      ? props.color
      : formatting.color;

  return {
    text,
    fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : formatting.fontSize,
    fontFamily,
    bold,
    italic,
    underline,
    strikethrough,
    align,
    color,
  };
};
