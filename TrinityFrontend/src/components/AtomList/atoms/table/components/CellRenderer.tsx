import React from 'react';
import TextBoxCellEditor from './TextBoxCellEditor';

interface RichTextFormatting {
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
}

interface CellRendererProps {
  value: string;
  html?: string;
  formatting?: RichTextFormatting;
  isEditing: boolean;
  onValueChange: (value: string, html?: string) => void;
  onFormattingChange?: (fmt: Partial<RichTextFormatting>) => void;
  onCommit: (value: string, html?: string) => void;
  onCancel: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: () => void; // Add onClick prop for entering edit mode
  textAlign?: 'left' | 'center' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

const CellRenderer: React.FC<CellRendererProps> = ({
  value,
  html,
  formatting,
  isEditing,
  onValueChange,
  onFormattingChange,
  onCommit,
  onCancel,
  onFocus,
  onBlur,
  onClick,
  textAlign,
  className,
  style,
}) => {
  // Use TextBoxCellEditor based on text-box implementation for consistent rich text experience
  return (
    <TextBoxCellEditor
      value={value}
      html={html}
      formatting={formatting}
      isEditing={isEditing}
      onValueChange={(plainText, htmlText) => onValueChange(plainText, htmlText)}
      onCommit={(plainText, htmlText) => onCommit(plainText, htmlText)}
      onCancel={onCancel}
      onFocus={onFocus}
      onBlur={onBlur}
      onFormattingChange={onFormattingChange}
      onClick={onClick}
      textAlign={textAlign}
      className={className}
      style={style}
    />
  );
};

export default CellRenderer;

