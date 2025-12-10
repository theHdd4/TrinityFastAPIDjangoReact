import React from 'react';
import SimpleCellEditor from './SimpleCellEditor';
import RichTextCellEditor from './RichTextCellEditor';

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
  enableRichText: boolean;
  onValueChange: (value: string, html?: string) => void;
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
  enableRichText,
  onValueChange,
  onCommit,
  onCancel,
  onFocus,
  onBlur,
  onClick,
  textAlign,
  className,
  style,
}) => {
  // Use RichTextCellEditor only if rich text is enabled AND formatting exists
  if (enableRichText && (formatting || html)) {
    return (
      <RichTextCellEditor
        value={value}
        html={html}
        formatting={formatting}
        isEditing={isEditing}
        onValueChange={(plainText, htmlText) => onValueChange(plainText, htmlText)}
        onCommit={(plainText, htmlText) => onCommit(plainText, htmlText)}
        onCancel={onCancel}
        onFocus={onFocus}
        onBlur={onBlur}
        className={className}
        style={style}
      />
    );
  }
  
  // Default: Use SimpleCellEditor (like DataFrameOperations)
  return (
    <SimpleCellEditor
      value={value}
      isEditing={isEditing}
      onValueChange={(plainText) => onValueChange(plainText)}
      onCommit={(plainText) => onCommit(plainText)}
      onCancel={onCancel}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      textAlign={textAlign}
      className={className}
      style={style}
    />
  );
};

export default CellRenderer;

