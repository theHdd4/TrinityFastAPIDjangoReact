import type { SlideObject } from '../../../store/exhibitionStore';
import type { TextBoxFormatting } from './types';

export const DEFAULT_TEXT_BOX_TEXT = 'Double click to edit';

export const FONT_OPTIONS = [
  'Times New Roman',
  'Arial',
  'Helvetica',
  'Georgia',
  'Courier New',
  'Verdana',
] as const;

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
