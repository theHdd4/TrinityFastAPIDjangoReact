/**
 * Table Rich Text Editor Hook
 * 
 * Encapsulates editor logic for table cell rich text editing
 */

import { useRef, useCallback, useEffect } from 'react';
import { TableRichTextEditorProps, TableCellFormatting } from '../types';
import { isToolbarElement, isFocusInToolbar } from '../utils/focusUtils';
import { applyFormattingToEditor, applyFormattingViaCommand, getPlainTextFromHtml } from '../utils/formattingUtils';

export const useTableRichTextEditor = ({
  value,
  html,
  formatting,
  isEditing,
  onValueChange,
  onCommit,
  onCancel,
  onFormattingChange: onFormattingChangeProp = () => { },
}: TableRichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef<string>('');
  const isCommittingRef = useRef(false);
  const selectionRef = useRef<Range | null>(null);
  const onFormattingChange = onFormattingChangeProp ?? (() => { });

  // Initialize content when editing starts
  useEffect(() => {
    if (!editorRef.current || !isEditing) return;

    const currentHtml = html || value || '';
    if (editorRef.current.innerHTML !== currentHtml) {
      editorRef.current.innerHTML = currentHtml;
      lastHtmlRef.current = currentHtml;

      // Reset child element styles
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

  // Apply formatting styles immediately when formatting changes
  useEffect(() => {
    if (!editorRef.current || !isEditing) return;

    const editor = editorRef.current;

    // Apply formatting immediately for visual feedback
    applyFormattingToEditor(editor, formatting);
  }, [isEditing, formatting]);

  // Focus when editing starts
  useEffect(() => {
    if (isEditing && editorRef.current) {
      // Use setTimeout instead of requestAnimationFrame for more reliable focus after layout updates
      // This fixes the "double click to edit" issue by ensuring the element is fully ready
      const timerId = setTimeout(() => {
        if (!editorRef.current) return;

        editorRef.current.focus();

        // Place cursor at end
        try {
          const range = document.createRange();
          const selection = window.getSelection();
          if (selection && editorRef.current) {
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        } catch (e) {
          // Ignore selection errors during initialization
        }
      }, 0);

      return () => clearTimeout(timerId);
    }
  }, [isEditing]);

  // Preserve selection
  const preserveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  }, []);

  // Restore selection
  const restoreSelection = useCallback(() => {
    if (selectionRef.current && editorRef.current) {
      const selection = window.getSelection();
      if (selection) {
        try {
          selection.removeAllRanges();
          selection.addRange(selectionRef.current);
        } catch (e) {
          // Selection might be invalid or disconnected, fallback to failing gracefully
        }
      }
    }
  }, []);

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!editorRef.current || isCommittingRef.current) return;

    const currentHtml = editorRef.current.innerHTML;
    if (currentHtml !== lastHtmlRef.current) {
      lastHtmlRef.current = currentHtml;
      const plainText = getPlainTextFromHtml(currentHtml);
      onValueChange(plainText, currentHtml);
    }
  }, [onValueChange]);

  // Handle blur - commit cell if focus moved away (but not to toolbar)
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const relatedTarget = e.relatedTarget as HTMLElement;

    // Don't commit if focus is moving to toolbar or popover
    if (relatedTarget && isToolbarElement(relatedTarget)) {
      return; // Don't commit
    }

    // Delay commit to allow for toolbar interactions
    setTimeout(() => {
      // Double-check focus hasn't returned to editor or toolbar
      if (isFocusInToolbar() || editorRef.current === document.activeElement) {
        return; // Still in toolbar/editor, don't commit
      }

      // Double-check we're still supposed to commit
      if (!editorRef.current || isCommittingRef.current || !isEditing) return;

      try {
        const currentHtml = editorRef.current.innerHTML;
        const plainText = getPlainTextFromHtml(currentHtml);

        isCommittingRef.current = true;
        onCommit(plainText, currentHtml);
        isCommittingRef.current = false;
      } catch (error) {
        isCommittingRef.current = false;
      }
    }, 200); // Delay for toolbar interactions
  }, [onCommit, isEditing]);

  // Handle key down
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();

      if (editorRef.current && !isCommittingRef.current) {
        try {
          const currentHtml = editorRef.current.innerHTML;
          const plainText = getPlainTextFromHtml(currentHtml);

          isCommittingRef.current = true;
          onCommit(plainText, currentHtml);
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
          const plainText = getPlainTextFromHtml(currentHtml);

          isCommittingRef.current = true;
          onCommit(plainText, currentHtml);
        } catch (error) {
          isCommittingRef.current = false;
        }
      }
      // Don't prevent default - let Tab work normally
      return;
    }
  }, [onCommit, onCancel]);

  // Handle paste - paste as plain text
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

  // Apply formatting change
  const applyFormatting = useCallback((newFormatting: Partial<TableCellFormatting>) => {
    if (!editorRef.current) return;

    preserveSelection();

    // Apply formatting immediately for visual feedback
    applyFormattingToEditor(editorRef.current, newFormatting);

    // Also apply via execCommand for HTML structure
    applyFormattingViaCommand(newFormatting);

    restoreSelection();

    // Notify parent of formatting change
    if (onFormattingChange) {
      onFormattingChange(newFormatting);
    }
  }, [onFormattingChange, preserveSelection, restoreSelection]);

  return {
    editorRef,
    handleInput,
    handleBlur,
    handleKeyDown,
    handlePaste,
    applyFormatting,
  };
};


