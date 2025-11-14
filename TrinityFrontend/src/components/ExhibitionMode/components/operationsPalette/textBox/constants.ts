import type { SlideObject } from '../../../store/exhibitionStore';
import type { TextBoxFormatting, TextStylePreset } from './types';

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
    fonts: ['Open Sans', 'DM Sans', 'Dream Avenue', 'BROWN SUGAR', 'HK Grotesk', 'Comic Sans'],
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
      'Comic Sans',
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
const FONT_OPTION_BASE = ['Comic Sans', 'Open Sans', ...FONT_MENU_LIST];

export const FONT_OPTIONS = Array.from(new Set(FONT_OPTION_BASE));

export const DEFAULT_TEXT_BOX_WIDTH = 360;
export const DEFAULT_TEXT_BOX_HEIGHT = 180;

export const TEXT_STYLE_PRESETS: readonly TextStylePreset[] = [
  { id: 'small', label: 'Small text', suffix: '/sm', fontSize: 12, previewSize: 14 },
  { id: 'normal', label: 'Normal text', suffix: '/md', fontSize: 16, previewSize: 16 },
  { id: 'large', label: 'Large text', suffix: '/lg', fontSize: 20, previewSize: 18 },
  { id: 'heading-4', label: 'Heading 4', suffix: '####', fontSize: 24, previewSize: 20, bold: true },
  { id: 'heading-3', label: 'Heading 3', suffix: '###', fontSize: 28, previewSize: 22, bold: true },
  { id: 'heading-2', label: 'Heading 2', suffix: '##', fontSize: 34, previewSize: 24, bold: true },
  { id: 'heading-1', label: 'Heading 1', suffix: '#', fontSize: 40, previewSize: 26, bold: true },
  { id: 'title', label: 'Title', suffix: '!', fontSize: 48, previewSize: 28, bold: true },
  { id: 'display', label: 'Display', suffix: '!!', fontSize: 56, previewSize: 30, bold: true },
  { id: 'monster', label: 'Monster', suffix: '!!!', fontSize: 64, previewSize: 32, bold: true },
];

const createDefaultFormatting = (
  overrides: Partial<TextBoxFormatting> = {},
): TextBoxFormatting => ({
  text: DEFAULT_TEXT_BOX_TEXT,
  fontSize: 16,
  fontFamily: 'Comic Sans',
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  color: '#111827',
  ...overrides,
});

const resolveNextZIndex = (objects: SlideObject[] | undefined): number => {
  if (!Array.isArray(objects) || objects.length === 0) {
    return 1;
  }

  const max = objects.reduce((acc, object) => {
    const value = typeof object.zIndex === 'number' ? object.zIndex : 0;
    return value > acc ? value : acc;
  }, 0);

  return Math.round(max) + 1;
};

export interface CreateTextBoxSlideObjectOptions {
  existingObjects?: SlideObject[];
  overrides?: Partial<SlideObject>;
  formattingOverrides?: Partial<TextBoxFormatting>;
}

export const createTextBoxSlideObject = (
  id: string,
  options: CreateTextBoxSlideObjectOptions = {},
): SlideObject => {
  const { existingObjects = [], overrides = {}, formattingOverrides = {} } = options;
  const { props: overrideProps = {}, zIndex: overrideZIndex, ...restOverrides } = overrides;

  const zIndex =
    typeof overrideZIndex === 'number' && Number.isFinite(overrideZIndex)
      ? Math.round(overrideZIndex)
      : resolveNextZIndex(existingObjects);

  const props: TextBoxFormatting = {
    ...createDefaultFormatting(formattingOverrides),
    ...(overrideProps as Partial<TextBoxFormatting>),
  };

  return {
    id,
    type: 'text-box',
    x: 120,
    y: 120,
    width: DEFAULT_TEXT_BOX_WIDTH,
    height: DEFAULT_TEXT_BOX_HEIGHT,
    zIndex,
    rotation: 0,
    groupId: null,
    props,
    ...restOverrides,
  };
};

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
