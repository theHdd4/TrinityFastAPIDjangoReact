/**
 * Focus Management Utilities
 * 
 * Utilities for detecting toolbar elements and managing focus
 */

/**
 * Check if an element is part of the table rich text toolbar
 */
export const isToolbarElement = (element: HTMLElement | null): boolean => {
  if (!element) return false;
  
  return !!(
    element.closest('[data-table-rich-text-toolbar]') ||
    element.closest('[data-text-toolbar-root]') ||
    element.closest('[role="popover"]') ||
    element.closest('[data-radix-popover-content]') ||
    element.closest('[data-radix-popover-trigger]') ||
    element.closest('[data-radix-portal]') ||
    element.closest('[data-state="open"]') ||
    element.closest('input[type="color"]') ||
    element.closest('[data-color-tray]') ||
    element.closest('button[aria-haspopup]') ||
    element.closest('[aria-expanded="true"]') ||
    (element.tagName === 'INPUT' && element.getAttribute('type') === 'color') ||
    (element.tagName === 'BUTTON' && element.closest('[data-table-rich-text-toolbar]'))
  );
};

/**
 * Check if focus is currently in toolbar or popover
 */
export const isFocusInToolbar = (): boolean => {
  const activeElement = document.activeElement as HTMLElement;
  if (!activeElement) return false;
  
  return isToolbarElement(activeElement);
};

/**
 * Check if an element is a contentEditable editor
 */
export const isContentEditableElement = (element: HTMLElement | null): boolean => {
  if (!element) return false;
  return element.hasAttribute('contenteditable') || 
         element.closest('[contenteditable="true"]') !== null;
};

















