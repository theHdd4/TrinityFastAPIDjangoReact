/**
 * Chart Note Rich Text Editor Component
 * 
 * Rich text editor for chart notes with 3-line height constraint and vertical scroll
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { ChartNoteEditorProps } from './types';
import { useChartNoteEditor } from './hooks/useChartNoteEditor';
import { getPlainTextFromHtml, htmlMatchesValue } from './utils/formattingUtils';

const ChartNoteEditor: React.FC<ChartNoteEditorProps> = ({
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
  } = useChartNoteEditor({
    value,
    html,
    formatting: formatting || {},
    isEditing,
    onValueChange,
    onCommit,
    onCancel,
    onFormattingChange,
  });

  // Calculate 3-line height based on font size
  const lineHeight = formatting.fontSize * 1.5; // 1.5 line height multiplier
  const threeLineHeight = lineHeight * 3;

  // Display mode - render HTML or plain text
  if (!isEditing) {
    // Check if HTML matches plain text value
    const htmlMatches = htmlMatchesValue(html, value);

    // Use HTML only if it matches the plain text value, otherwise use plain text
    const displayHtml = (htmlMatches && html) ? html : (value || '');
    const hasFormatting = formatting && Object.keys(formatting).length > 0;
    const shouldUseHtml = (hasFormatting || html) && displayHtml && htmlMatches;

    // Safe formatting object
    const safeFormatting = formatting || {};

    // Display mode styles
    const displayStyle: React.CSSProperties = {
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      minHeight: `${threeLineHeight}px`,
      maxHeight: `${threeLineHeight}px`,
      overflowY: 'auto',
      overflowX: 'hidden',
      ...style,
      fontFamily: safeFormatting.fontFamily || 'Arial',
      fontSize: `${safeFormatting.fontSize || 12}px`,
      color: safeFormatting.textColor || '#000000',
      fontWeight: safeFormatting.bold ? 'bold' : 'normal',
      fontStyle: safeFormatting.italic ? 'italic' : 'normal',
      textDecoration: [
        safeFormatting.underline ? 'underline' : '',
        safeFormatting.strikethrough ? 'line-through' : ''
      ].filter(Boolean).join(' ') || 'none',
      backgroundColor: safeFormatting.backgroundColor === 'transparent' 
        ? 'transparent' 
        : (safeFormatting.backgroundColor || 'transparent'),
      textAlign: safeFormatting.textAlign || 'left',
    };

    // Render with HTML if we have formatting, otherwise render plain text
    if (shouldUseHtml) {
      return (
        <div
          className={cn("w-full text-sm outline-none border border-gray-300 rounded p-2 cursor-text", className)}
          style={displayStyle}
          title={getPlainTextFromHtml(displayHtml)}
          onClick={(e) => {
            e.preventDefault();
            onClick?.(e);
          }}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      );
    }

    return (
      <div
        className={cn("w-full text-sm outline-none border border-gray-300 rounded p-2 cursor-text", className)}
        style={displayStyle}
        title={value || ''}
        onClick={(e) => {
          e.preventDefault();
          onClick?.(e);
        }}
      >
        {value || ''}
      </div>
    );
  }

  // Editing mode - contentEditable with 3-line height constraint
  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      className={cn(
        "w-full text-sm outline-none border border-blue-500 rounded p-2",
        "resize-none",
        className
      )}
      style={{
        minHeight: `${threeLineHeight}px`,
        maxHeight: `${threeLineHeight}px`,
        overflowY: 'auto',
        overflowX: 'hidden',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        backgroundColor: formatting.backgroundColor === 'transparent' 
          ? 'transparent' 
          : (formatting.backgroundColor || '#ffffff'),
        fontFamily: formatting.fontFamily || 'Arial',
        fontSize: `${formatting.fontSize || 12}px`,
        fontWeight: formatting.bold ? 'bold' : 'normal',
        fontStyle: formatting.italic ? 'italic' : 'normal',
        textDecoration: [
          formatting.underline ? 'underline' : '',
          formatting.strikethrough ? 'line-through' : ''
        ].filter(Boolean).join(' ') || 'none',
        color: formatting.textColor || '#000000',
        textAlign: formatting.textAlign || 'left',
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
      data-chart-note-editor="true"
      placeholder="Add note (Ctrl+Enter to save)"
    />
  );
};

export default ChartNoteEditor;

