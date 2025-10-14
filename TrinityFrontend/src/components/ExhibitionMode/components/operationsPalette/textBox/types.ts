export type TextAlignOption = 'left' | 'center' | 'right';

export interface SlideTextBox {
  id: string;
  text: string;
  x: number;
  y: number;
  slideId?: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlignOption;
  color: string;
}

export interface TextBoxPosition {
  x: number;
  y: number;
}
