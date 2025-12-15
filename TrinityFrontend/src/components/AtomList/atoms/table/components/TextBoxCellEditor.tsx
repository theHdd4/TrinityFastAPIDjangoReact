import React, { useRef, useEffect, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';

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

interface TextBoxCellEditorProps {
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
  onClick?: () => void;
  textAlign?: 'left' | 'center' | 'right';
  className?: string;
  style?: React.CSSProperties;
}

const TextBoxCellEditor: React.FC<TextBoxCellEditorProps> = ({
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
  textAlign = 'left',
  className,
  style,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isCommittingRef = useRef(false);
  const displayRef = useRef<HTMLDivElement>(null);

  // Get plain text from HTML
  const getPlainText = (htmlContent: string): string => {
    if (!htmlContent) return '';
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    return temp.textContent || temp.innerText || '';
  };

  // Update editor content when value/html changes (but not while editing)
  useEffect(() => {
    if (!editorRef.current || isEditing) return;
    
    const displayHtml = html || value || '';
    const plainText = getPlainText(displayHtml);
    
    // Only update if content actually changed
    if (editorRef.current.innerText !== plainText) {
      if (html && html !== plainText) {
        editorRef.current.innerHTML = html;
      } else {
        editorRef.current.textContent = value || '';
      }
    }
  }, [value, html, isEditing]);

  // Apply formatting styles in real-time
  useEffect(() => {
    if (!editorRef.current || !isEditing || !formatting) return;

    const editor = editorRef.current;
    
    // Apply font family
    if (formatting.fontFamily) {
      editor.style.fontFamily = formatting.fontFamily;
    }
    
    // Apply font size
    if (formatting.fontSize) {
      editor.style.fontSize = `${formatting.fontSize}px`;
    }
    
    // Apply text color
    if (formatting.textColor) {
      editor.style.color = formatting.textColor;
    }
    
    // Apply text alignment
    if (formatting.textAlign) {
      editor.style.textAlign = formatting.textAlign;
    }
    
    // Apply bold
    if (formatting.bold !== undefined) {
      editor.style.fontWeight = formatting.bold ? 'bold' : 'normal';
    }
    
    // Apply italic
    if (formatting.italic !== undefined) {
      editor.style.fontStyle = formatting.italic ? 'italic' : 'normal';
    }
    
    // Apply text decorations
    const decorations: string[] = [];
    if (formatting.underline) decorations.push('underline');
    if (formatting.strikethrough) decorations.push('line-through');
    editor.style.textDecoration = decorations.length > 0 ? decorations.join(' ') : 'none';
    
    // Apply background color
    if (formatting.backgroundColor && formatting.backgroundColor !== 'transparent') {
      editor.style.backgroundColor = formatting.backgroundColor;
    } else if (formatting.backgroundColor === 'transparent') {
      editor.style.backgroundColor = 'transparent';
    }
  }, [formatting, isEditing]);

  // Focus when editing starts
  useLayoutEffect(() => {
    if (isEditing && editorRef.current) {
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        // Select all text (Excel-like behavior)
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

  const handleInput = () => {
    if (!editorRef.current || !isEditing) return;
    
    const htmlContent = editorRef.current.innerHTML;
    const plainText = editorRef.current.innerText || getPlainText(htmlContent);
    
    onValueChange(plainText, htmlContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!editorRef.current) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const htmlContent = editorRef.current.innerHTML;
      const plainText = editorRef.current.innerText || getPlainText(htmlContent);
      onCommit(plainText, htmlContent);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === 'Tab') {
      const htmlContent = editorRef.current.innerHTML;
      const plainText = editorRef.current.innerText || getPlainText(htmlContent);
      onCommit(plainText, htmlContent);
      // Don't prevent default - let Tab work normally
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (isCommittingRef.current) {
      return;
    }

    // Check if focus is moving to toolbar or another editor
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget && (
      relatedTarget.closest('[data-text-toolbar-root]') ||
      relatedTarget.closest('[data-table-cell-editor="true"]')
    )) {
      return;
    }

    if (!editorRef.current || !isEditing) return;

    isCommittingRef.current = true;
    const htmlContent = editorRef.current.innerHTML;
    const plainText = editorRef.current.innerText || getPlainText(htmlContent);

    // CRITICAL: Commit changes immediately on blur
    // Use setTimeout to ensure blur event completes first
    setTimeout(() => {
      onCommit(plainText, htmlContent);
      onBlur?.();
      setTimeout(() => {
        isCommittingRef.current = false;
      }, 50);
    }, 0);
  };

  // Initialize content when entering edit mode
  // Use a ref to track if we've already initialized to prevent re-initialization
  const initializedRef = useRef(false);
  const lastEditingStateRef = useRef(false);
  
  useEffect(() => {
    if (isEditing && editorRef.current) {
      // Only initialize when transitioning from non-editing to editing
      if (!lastEditingStateRef.current && !initializedRef.current) {
        // CRITICAL FIX: Always use plain text when entering edit mode
        // CSS formatting will handle the visual appearance
        // This prevents conflicts between HTML formatting tags and CSS styles
        editorRef.current.textContent = value || '';
        
        initializedRef.current = true;
      }
    } else {
      // Reset when exiting edit mode
      if (lastEditingStateRef.current) {
        initializedRef.current = false;
      }
    }
    lastEditingStateRef.current = isEditing;
  }, [isEditing, value]); // Include value to update if value changes while not editing

  // Display mode calculations (before early return to satisfy Rules of Hooks)
  const displayHtml = html || value || '';
  const hasFormatting = formatting && Object.keys(formatting).length > 0;
  const shouldUseHtml = hasFormatting && html && html !== value;
  const displayAlign = formatting?.textAlign || textAlign || 'left';
  
  // CRITICAL FIX: Apply textColor and backgroundColor in display mode
  // This ensures that saved formatting overrides any inline styles or CSS
  // Run this whenever formatting exists, not just when HTML is present
  useEffect(() => {
    if (!displayRef.current || isEditing) return;
    
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (!displayRef.current) return;
      
      // Apply textColor to all child elements to override inline styles using !important
      if (formatting?.textColor) {
        const allElements = displayRef.current.querySelectorAll('*');
        allElements.forEach((el) => {
          (el as HTMLElement).style.setProperty('color', formatting.textColor!, 'important');
        });
        
        // Also apply to the container itself with !important to override any CSS
        displayRef.current.style.setProperty('color', formatting.textColor, 'important');
      }
      
      // Apply backgroundColor with !important to ensure it's visible
      if (formatting?.backgroundColor && formatting.backgroundColor !== 'transparent') {
        displayRef.current.style.setProperty('backgroundColor', formatting.backgroundColor, 'important');
      }
    });
  }, [formatting?.textColor, formatting?.backgroundColor, displayHtml, isEditing]);

  if (isEditing) {
    return (
      <div
        ref={editorRef}
        data-table-cell-editor="true"
        contentEditable
        suppressContentEditableWarning
        className={cn(
          "w-full h-full text-xs outline-none border-none bg-transparent",
          className
        )}
        style={{
          padding: '2px 4px',
          margin: 0,
          textAlign: formatting?.textAlign || textAlign,
          boxSizing: 'border-box',
          minHeight: '100%',
          ...style,
        }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => {
          // Select all on focus (Excel-like)
          requestAnimationFrame(() => {
            const range = document.createRange();
            const selection = window.getSelection();
            if (selection && editorRef.current) {
              range.selectNodeContents(editorRef.current);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          });
          onFocus?.();
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  // Display mode - CRITICAL FIX: Apply all CSS formatting styles in display mode
  // This ensures bold, textColor, fontSize, etc. are visible even when not using HTML
  const displayStyle: React.CSSProperties = {
    padding: '2px 4px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    justifyContent: displayAlign === 'left' ? 'flex-start' : 
                  displayAlign === 'center' ? 'center' : 'flex-end',
    // Apply formatting styles from formatting object
    ...(formatting?.fontFamily && { fontFamily: formatting.fontFamily }),
    ...(formatting?.fontSize && { fontSize: `${formatting.fontSize}px` }),
    ...(formatting?.textColor && { color: formatting.textColor }),
    ...(formatting?.backgroundColor && formatting.backgroundColor !== 'transparent' && { 
      backgroundColor: formatting.backgroundColor 
    }),
    ...(formatting?.bold !== undefined && { 
      fontWeight: formatting.bold ? 'bold' : 'normal' 
    }),
    ...(formatting?.italic !== undefined && { 
      fontStyle: formatting.italic ? 'italic' : 'normal' 
    }),
    ...(formatting?.underline && { textDecoration: 'underline' }),
    ...(formatting?.strikethrough && { 
      textDecoration: formatting.underline ? 'underline line-through' : 'line-through' 
    }),
    ...style,
  };

  return (
    <div
      ref={displayRef}
      className={cn(
        "text-xs overflow-hidden flex items-center cursor-pointer",
        className
      )}
      style={displayStyle}
      title={value || ''}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      {...(shouldUseHtml 
        ? { dangerouslySetInnerHTML: { __html: displayHtml } }
        : { children: value || '' }
      )}
    />
  );
};

export default TextBoxCellEditor;

