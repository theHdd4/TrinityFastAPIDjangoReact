/**
 * Table Rich Text Editor Component
 * 
 * Dedicated rich text editor for table cells
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { TableRichTextEditorProps } from './types';
import { useTableRichTextEditor } from './hooks/useTableRichTextEditor';
import { getPlainTextFromHtml, htmlMatchesValue } from './utils/formattingUtils';

const TableRichTextEditor: React.FC<TableRichTextEditorProps> = ({
  value,
  html,
  formatting,
  isEditing,
  onValueChange,
  onCommit,
  onCancel,
  onFormattingChange: onFormattingChangeProp = () => { },
  onClick,
  className,
  style,
}) => {
  const onFormattingChange = onFormattingChangeProp ?? (() => { });

  const {
    editorRef,
    handleInput,
    handleBlur,
    handleKeyDown,
    handlePaste,
  } = useTableRichTextEditor({
    value,
    html,
    formatting: formatting || {}, // Safe default to prevent crash
    isEditing,
    onValueChange,
    onCommit,
    onCancel,
    onFormattingChange,
  });

  // Display mode - render HTML or plain text
  if (!isEditing) {
    // CRITICAL FIX: Check if HTML matches plain text value
    // If HTML exists but doesn't match value, use value as source of truth
    const htmlMatches = htmlMatchesValue(html, value);

    // Use HTML only if it matches the plain text value, otherwise use plain text
    const displayHtml = (htmlMatches && html) ? html : (value || '');
    const hasFormatting = formatting && Object.keys(formatting).length > 0;
    const shouldUseHtml = (hasFormatting || html) && displayHtml && htmlMatches;

    // Safe formatting object
    const safeFormatting = formatting || {};

    // Display mode - don't apply backgroundColor here (applied to cell instead)
    const displayStyle: React.CSSProperties = {
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
      ...style,
      fontFamily: safeFormatting.fontFamily || 'Arial',
      fontSize: '12px', // Default font size for display
      color: safeFormatting.textColor || '#000000',
      fontWeight: safeFormatting.bold ? 'bold' : 'normal',
      fontStyle: safeFormatting.italic ? 'italic' : 'normal',
      textDecoration: safeFormatting.underline ? 'underline' : 'none',
      // backgroundColor NOT included - applied to cell instead
    };

    // Render with HTML if we have formatting, otherwise render plain text
    if (shouldUseHtml) {
      return (
        <div
          className={cn("table-cell-content h-full flex items-center text-left overflow-hidden", className)}
          style={displayStyle}
          title={getPlainTextFromHtml(displayHtml)}
          onClick={(e) => {
            // Prevent default to avoid interfering with focus transfer
            e.preventDefault();
            onClick?.(e);
          }}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      );
    }

    return (
      <div
        className={cn("table-cell-content h-full flex items-center text-left overflow-hidden", className)}
        style={displayStyle}
        title={value || ''}
        onClick={(e) => {
          // Prevent default to avoid interfering with focus transfer
          e.preventDefault();
          onClick?.(e);
        }}
      >
        {value || ''}
      </div>
    );
  }

  // Editing mode - contentEditable
  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      className={cn(
        "w-full h-full text-sm outline-none",
        "whitespace-nowrap",
        className
      )}
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        padding: '0',
        margin: 0,
        textAlign: 'left',
        boxSizing: 'border-box',
        minHeight: '100%',
        textOverflow: 'ellipsis',
        ...style,
      }}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={(e) => {
        onClick?.(e);
        e.stopPropagation();
      }}
      data-table-cell-editor="true"
    />
  );
};

export default TableRichTextEditor;


