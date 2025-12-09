import React, { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface RichTextCellEditorProps {
  value: string;
  html?: string;
  formatting?: {
    fontFamily?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    textColor?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
  isEditing: boolean;
  onValueChange: (value: string, html: string) => void;
  onCommit: (value: string, html: string) => void;
  onCancel: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const RichTextCellEditor: React.FC<RichTextCellEditorProps> = ({
  value,
  html,
  formatting,
  isEditing,
  onValueChange,
  onCommit,
  onCancel,
  onFocus,
  onBlur,
  className,
  style,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>('');
  const isCommittingRef = useRef(false);

  // Initialize content
  useEffect(() => {
    if (!editorRef.current || !isEditing) return;

    const currentHtml = html || value || '';
    if (editorRef.current.innerHTML !== currentHtml) {
      editorRef.current.innerHTML = currentHtml;
      lastHtmlRef.current = currentHtml;
      
      // Reset child element styles (like TextBox component)
      const resetChildStyles = () => {
        if (!editorRef.current) return;
        const children = editorRef.current.querySelectorAll('div, p');
        children.forEach(child => {
          (child as HTMLElement).style.margin = '0';
          (child as HTMLElement).style.padding = '0';
          (child as HTMLElement).style.boxSizing = 'border-box';
        });
      };
      requestAnimationFrame(resetChildStyles);
    }
  }, [isEditing, html, value]);

  // Apply formatting styles
  useEffect(() => {
    if (!editorRef.current || !isEditing) return;

    const editor = editorRef.current;
    
    if (formatting?.fontFamily) {
      editor.style.fontFamily = formatting.fontFamily;
    }
    if (formatting?.fontSize) {
      editor.style.fontSize = `${formatting.fontSize}px`;
    }
    if (formatting?.textColor) {
      editor.style.color = formatting.textColor;
    }
    if (formatting?.textAlign) {
      editor.style.textAlign = formatting.textAlign;
    }
    if (formatting?.bold) {
      editor.style.fontWeight = 'bold';
    } else {
      editor.style.fontWeight = 'normal';
    }
    if (formatting?.italic) {
      editor.style.fontStyle = 'italic';
    } else {
      editor.style.fontStyle = 'normal';
    }
    
    const decorations: string[] = [];
    if (formatting?.underline) decorations.push('underline');
    if (formatting?.strikethrough) decorations.push('line-through');
    editor.style.textDecoration = decorations.length > 0 ? decorations.join(' ') : 'none';
  }, [isEditing, formatting]);

  // Focus when editing starts
  useEffect(() => {
    if (isEditing && editorRef.current) {
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        // Place cursor at end
        const range = document.createRange();
        const selection = window.getSelection();
        if (selection && editorRef.current) {
          range.selectNodeContents(editorRef.current);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });
    }
  }, [isEditing]);

  const getPlainText = useCallback((htmlContent: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    return temp.textContent || temp.innerText || '';
  }, []);

  const handleInput = useCallback(() => {
    if (!editorRef.current || isCommittingRef.current) return;

    const currentHtml = editorRef.current.innerHTML;
    if (currentHtml !== lastHtmlRef.current) {
      lastHtmlRef.current = currentHtml;
      const plainText = getPlainText(currentHtml);
      onValueChange(plainText, currentHtml);
    }
  }, [onValueChange, getPlainText]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    // Check if focus is moving to another cell editor or toolbar
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget) {
      // Don't commit if focus is moving to:
      // 1. Another contentEditable cell editor
      // 2. Toolbar elements (buttons, popovers, etc.)
      if (relatedTarget.hasAttribute('contenteditable') ||
          relatedTarget.closest('[data-text-toolbar-root]') ||
          relatedTarget.closest('[role="dialog"]') ||
          relatedTarget.closest('[role="menu"]')) {
        return;
      }
    }

    setTimeout(() => {
      // Double-check we're still supposed to commit
      if (!editorRef.current || isCommittingRef.current || !isEditing) return;
      
      try {
        const currentHtml = editorRef.current.innerHTML;
        const plainText = getPlainText(currentHtml);
        
        isCommittingRef.current = true;
        onCommit(plainText, currentHtml);
        isCommittingRef.current = false;
        
        onBlur?.();
      } catch (error) {
        isCommittingRef.current = false;
      }
    }, 150); // Slightly longer delay to allow toolbar interactions
  }, [onCommit, onBlur, getPlainText, isEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      
      if (editorRef.current && !isCommittingRef.current) {
        try {
          const currentHtml = editorRef.current.innerHTML;
          const plainText = getPlainText(currentHtml);
          
          isCommittingRef.current = true;
          onCommit(plainText, currentHtml);
          // Note: isCommittingRef will be reset after commit completes
        } catch (error) {
          isCommittingRef.current = false;
        }
      }
      return;
    }
    
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      try {
        onCancel();
      } catch (error) {
        // Error handling
      }
      return;
    }

    // Allow Tab to work normally (will be handled by parent)
    if (e.key === 'Tab') {
      if (editorRef.current && !isCommittingRef.current) {
        try {
          const currentHtml = editorRef.current.innerHTML;
          const plainText = getPlainText(currentHtml);
          
          isCommittingRef.current = true;
          onCommit(plainText, currentHtml);
          // Note: isCommittingRef will be reset after commit completes
        } catch (error) {
          isCommittingRef.current = false;
        }
      }
      // Don't prevent default - let Tab work normally
      return;
    }
  }, [onCommit, onCancel, getPlainText]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const plainText = e.clipboardData.getData('text/plain');
    
    if (plainText && document.execCommand) {
      document.execCommand('insertText', false, plainText);
    } else if (editorRef.current) {
      // Fallback: insert as text node
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(plainText));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, []);

  if (!isEditing) {
    // Display mode - render HTML or plain text
    const displayHtml = html || value || '';
    const hasFormatting = formatting && Object.keys(formatting).length > 0;
    const shouldUseHtml = (hasFormatting || html) && displayHtml;
    
    const displayStyle: React.CSSProperties = {
      whiteSpace: 'nowrap',  // CHANGED: from 'pre-wrap' to 'nowrap' (Excel-like)
      textOverflow: 'ellipsis',  // NEW: Add ellipsis for overflow
      ...style,
      ...(formatting?.textAlign && { textAlign: formatting.textAlign }),
      ...(formatting?.fontFamily && { fontFamily: formatting.fontFamily }),
      ...(formatting?.fontSize && { fontSize: `${formatting.fontSize}px` }),
      ...(formatting?.textColor && { color: formatting.textColor }),
      ...(formatting?.bold && { fontWeight: 'bold' }),
      ...(formatting?.italic && { fontStyle: 'italic' }),
      ...(formatting?.underline && { textDecoration: 'underline' }),
      ...(formatting?.strikethrough && { textDecoration: 'line-through' }),
    };
    
    // Render with HTML if we have formatting, otherwise render plain text
    if (shouldUseHtml) {
      return (
        <div
          className={cn("table-cell-content h-full flex items-center text-left overflow-hidden", className)}
          style={displayStyle}
          title={getPlainText(displayHtml)}
          dangerouslySetInnerHTML={{ __html: displayHtml }}
        />
      );
    }
    
    return (
      <div
        className={cn("table-cell-content h-full flex items-center text-left overflow-hidden", className)}
        style={displayStyle}
        title={value || ''}
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
        "whitespace-nowrap",  // CHANGED: from 'whitespace-pre-wrap' to 'whitespace-nowrap'
        className
      )}
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        padding: '0',  // CHANGED: Remove padding (handled by CSS)
        margin: 0,
        textAlign: 'left',
        boxSizing: 'border-box',
        minHeight: '100%',
        textOverflow: 'ellipsis',  // NEW: Add ellipsis for overflow
        ...style,
      }}
      onInput={handleInput}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onFocus={onFocus}
      onClick={(e) => e.stopPropagation()}
      data-table-cell-editor="true"
    />
  );
};

export default RichTextCellEditor;

