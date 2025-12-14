/**
 * Table Rich Text Toolbar Hook
 * 
 * Handles toolbar positioning and formatting logic
 */

import { useState, useEffect, useCallback } from 'react';
import { TableCellFormatting } from '../types';

interface UseTableRichTextToolbarProps {
  formatting: TableCellFormatting;
  onFormattingChange: (formatting: Partial<TableCellFormatting>) => void;
  cellPosition: { top: number; left: number; width: number } | null;
  isVisible: boolean;
}

export const useTableRichTextToolbar = ({
  formatting,
  onFormattingChange,
  cellPosition,
  isVisible,
}: UseTableRichTextToolbarProps) => {
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate toolbar position above cell
  const calculatePosition = useCallback(() => {
    if (!cellPosition) return null;
    
    return {
      top: cellPosition.top - 50, // 50px above cell
      left: cellPosition.left + (cellPosition.width / 2), // Center horizontally
    };
  }, [cellPosition]);

  // Update position when cell position changes
  useEffect(() => {
    if (!isVisible || !cellPosition) {
      setToolbarPosition(null);
      return;
    }

    const position = calculatePosition();
    setToolbarPosition(position);

    // Update position on scroll/resize
    const updatePosition = () => {
      if (cellPosition) {
        // Recalculate cell position
        const cellElement = document.querySelector('[data-table-cell-editor="true"]')?.closest('td');
        if (cellElement) {
          const rect = cellElement.getBoundingClientRect();
          const newPosition = {
            top: rect.top - 50,
            left: rect.left + (rect.width / 2),
          };
          setToolbarPosition(newPosition);
        }
      }
    };

    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, cellPosition, calculatePosition]);

  // Formatting handlers
  const handleToggleBold = useCallback(() => {
    onFormattingChange({ bold: !formatting.bold });
  }, [formatting.bold, onFormattingChange]);

  const handleToggleItalic = useCallback(() => {
    onFormattingChange({ italic: !formatting.italic });
  }, [formatting.italic, onFormattingChange]);

  const handleToggleUnderline = useCallback(() => {
    onFormattingChange({ underline: !formatting.underline });
  }, [formatting.underline, onFormattingChange]);

  const handleFontFamilyChange = useCallback((fontFamily: string) => {
    onFormattingChange({ fontFamily });
  }, [onFormattingChange]);

  const handleTextColorChange = useCallback((textColor: string) => {
    onFormattingChange({ textColor });
  }, [onFormattingChange]);

  const handleBackgroundColorChange = useCallback((backgroundColor: string) => {
    onFormattingChange({ backgroundColor });
  }, [onFormattingChange]);

  return {
    toolbarPosition,
    handleToggleBold,
    handleToggleItalic,
    handleToggleUnderline,
    handleFontFamilyChange,
    handleTextColorChange,
    handleBackgroundColorChange,
  };
};






