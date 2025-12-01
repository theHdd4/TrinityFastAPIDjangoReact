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

export interface TextStylePreset {
  id:
    | 'small'
    | 'normal'
    | 'large'
    | 'heading-4'
    | 'heading-3'
    | 'heading-2'
    | 'heading-1'
    | 'title'
    | 'display'
    | 'monster';
  label: string;
  suffix: string;
  fontSize: number;
  previewSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}
