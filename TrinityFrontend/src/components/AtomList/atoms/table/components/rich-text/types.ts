import type React from 'react';
/**
 * Table Rich Text Editor - Type Definitions
 * 
 * Core types for table cell rich text formatting
 */

export interface TableCellFormatting {
  /** Font family name (e.g., "Arial", "Times New Roman") */
  fontFamily: string;
  
  /** Font size in px */
  fontSize: number;
  
  /** Bold text style */
  bold: boolean;
  
  /** Italic text style */
  italic: boolean;
  
  /** Underline text style */
  underline: boolean;
  
  /** Strikethrough text style */
  strikethrough: boolean;
  
  /** Text color in hex format (e.g., "#000000") */
  textColor: string;
  
  /** Background color in hex format or "transparent" */
  backgroundColor: string;
  
  /** Text alignment */
  textAlign: 'left' | 'center' | 'right';
}

/** Default formatting values */
export const DEFAULT_TABLE_CELL_FORMATTING: TableCellFormatting = {
  fontFamily: 'Arial',
  fontSize: 12,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: '#000000',
  backgroundColor: 'transparent',
  textAlign: 'left',
};

/** Props for TableRichTextEditor component */
export interface TableRichTextEditorProps {
  /** Plain text value */
  value: string;
  
  /** HTML content (optional, for rich text) */
  html?: string;
  
  /** Current formatting */
  formatting: TableCellFormatting;
  
  /** Whether the cell is in editing mode */
  isEditing: boolean;
  
  /** Callback when value changes */
  onValueChange: (value: string, html: string) => void;
  
  /** Callback when cell is committed (Enter, Tab, or blur) */
  onCommit: (value: string, html: string) => void;
  
  /** Callback when editing is cancelled (Escape) */
  onCancel: () => void;
  
  /** Callback when formatting changes */
  onFormattingChange?: (formatting: Partial<TableCellFormatting>) => void;
  
  /** Optional click handler for entering edit mode */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  
  /** Optional CSS class name */
  className?: string;
  
  /** Optional inline styles */
  style?: React.CSSProperties;
}


