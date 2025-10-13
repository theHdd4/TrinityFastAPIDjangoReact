import type { SlideTextBox } from './types';

export const DEFAULT_TEXT_BOX_TEXT = 'Double click to edit';

export const FONT_OPTIONS = [
  'Times New Roman',
  'Arial',
  'Helvetica',
  'Georgia',
  'Courier New',
  'Verdana',
] as const;

export const createDefaultTextBox = (
  id: string,
  overrides: Partial<SlideTextBox> = {},
): SlideTextBox => ({
  id,
  text: DEFAULT_TEXT_BOX_TEXT,
  x: 100,
  y: 100,
  fontSize: 16,
  fontFamily: FONT_OPTIONS[0],
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  color: '#000000',
  ...overrides,
});
