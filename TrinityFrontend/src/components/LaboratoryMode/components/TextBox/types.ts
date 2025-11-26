export interface CardTextBoxData {
  text: string;
  html: string;
}

export type CardTextBoxListType = 'none' | 'bullet' | 'number';

export interface CardTextBoxSettings {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  textColor: string;
  backgroundColor: string;
  listType: CardTextBoxListType;
}

export interface CardTextBoxState {
  enabled: boolean;
  data: CardTextBoxData;
  settings: CardTextBoxSettings;
}

export const defaultCardTextBoxData: CardTextBoxData = {
  text: '',
  html: '',
};

export const defaultCardTextBoxSettings: CardTextBoxSettings = {
  fontFamily: 'Arial',
  fontSize: 16,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textAlign: 'left',
  textColor: '#111827',
  backgroundColor: 'transparent',
  listType: 'none',
};

export const defaultCardTextBoxState: CardTextBoxState = {
  enabled: false,
  data: defaultCardTextBoxData,
  settings: defaultCardTextBoxSettings,
};
