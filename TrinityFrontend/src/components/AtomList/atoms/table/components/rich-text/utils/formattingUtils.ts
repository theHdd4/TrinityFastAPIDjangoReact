/**
 * Formatting Utilities
 * 
 * Utilities for applying formatting to contentEditable elements
 */

import { TableCellFormatting } from '../types';

/**
 * Apply formatting styles directly to editor element
 * This provides immediate visual feedback
 */
export const applyFormattingToEditor = (
  editor: HTMLElement,
  formatting: Partial<TableCellFormatting>
): void => {
  // Apply font family
  if (formatting.fontFamily !== undefined) {
    editor.style.fontFamily = formatting.fontFamily;
  }
  
  // Apply bold
  if (formatting.bold !== undefined) {
    editor.style.fontWeight = formatting.bold ? 'bold' : 'normal';
  }
  
  // Apply italic
  if (formatting.italic !== undefined) {
    editor.style.fontStyle = formatting.italic ? 'italic' : 'normal';
  }
  
  // Apply underline
  if (formatting.underline !== undefined) {
    const currentDecoration = editor.style.textDecoration || '';
    if (formatting.underline) {
      // Add underline if not already present
      if (!currentDecoration.includes('underline')) {
        editor.style.textDecoration = (currentDecoration + ' underline').trim();
      }
    } else {
      // Remove underline
      editor.style.textDecoration = currentDecoration.replace('underline', '').trim() || 'none';
    }
  }
  
  // Apply text color
  if (formatting.textColor !== undefined) {
    editor.style.color = formatting.textColor;
  }
  
  // Apply font size
  if (formatting.fontSize !== undefined) {
    editor.style.fontSize = `${formatting.fontSize}px`;
  }
  
  // Apply strikethrough
  if (formatting.strikethrough !== undefined) {
    const currentDecoration = editor.style.textDecoration || '';
    if (formatting.strikethrough) {
      if (!currentDecoration.includes('line-through')) {
        editor.style.textDecoration = (currentDecoration + ' line-through').trim();
      }
    } else {
      editor.style.textDecoration = currentDecoration.replace('line-through', '').trim() || 'none';
    }
  }
  
  // Apply text alignment
  if (formatting.textAlign !== undefined) {
    editor.style.textAlign = formatting.textAlign;
  }
  
  // Note: Background color is applied to TableCell, not editor
};

/**
 * Apply formatting via document.execCommand
 * This updates the HTML structure
 */
export const applyFormattingViaCommand = (
  formatting: Partial<TableCellFormatting>
): void => {
  // Apply bold
  if (formatting.bold !== undefined) {
    document.execCommand('bold', false);
  }
  
  // Apply italic
  if (formatting.italic !== undefined) {
    document.execCommand('italic', false);
  }
  
  // Apply underline
  if (formatting.underline !== undefined) {
    document.execCommand('underline', false);
  }
  
  // Apply font family
  if (formatting.fontFamily) {
    document.execCommand('fontName', false, formatting.fontFamily);
  }
  
  // Apply font size (execCommand uses numeric sizes 1-7, so we skip to avoid inconsistencies)
  
  // Apply text color
  if (formatting.textColor) {
    document.execCommand('foreColor', false, formatting.textColor);
  }
  
  // Note: Background color is applied to TableCell, not via execCommand
};

/**
 * Get plain text from HTML content
 */
export const getPlainTextFromHtml = (html: string): string => {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
};

/**
 * Check if HTML content matches plain text value
 * Returns true if HTML's plain text matches the value, false otherwise
 */
export const htmlMatchesValue = (html: string | undefined, value: string): boolean => {
  if (!html) return true; // No HTML means it matches (will use value)
  const plainTextFromHtml = getPlainTextFromHtml(html);
  return plainTextFromHtml === value;
};


