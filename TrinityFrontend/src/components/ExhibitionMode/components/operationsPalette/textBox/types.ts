export type TextAlignOption = 'left' | 'center' | 'right';

export interface TextBoxFormatting {
  text: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TextAlignOption;
  color: string;
}
